import { describe, it, expect, vi } from 'vitest';
import { createEnsureOrgChain } from './ensureOrgChain';

const ORG_CHAIN = 100; // Gnosis
const HOME_CHAIN = 42161; // Arbitrum

/**
 * Build a guard with sensible defaults + overridable injected wagmi actions.
 * `accountChainId` is what wagmi's getAccount() reports (the "already on chain?"
 * short-circuit input); `clientChainId` is what the reacquired connector client
 * actually reports (the fail-closed validation input) — defaults to org chain.
 */
function makeGuard({
  orgChainId = ORG_CHAIN,
  isPasskeyUser = false,
  e2eEnabled = false,
  accountChainId = HOME_CHAIN,
  clientChainId = ORG_CHAIN,
  switchChainAsync = vi.fn(async () => {}),
  getWalletClient,
  clientToSigner,
  signer = { id: 'org-chain-signer' },
} = {}) {
  // `client.chain` is metadata synthesized from the requested chainId (always the org
  // chain); the REAL fail-closed check is eth_chainId via client.request(), so drive
  // the "actual wallet chain" through the mocked request return value (clientChainId).
  const walletClient = {
    chain: { id: clientChainId },
    account: { address: '0xEOA' },
    request: vi.fn(async ({ method }) =>
      method === 'eth_chainId' ? `0x${clientChainId.toString(16)}` : undefined
    ),
  };
  const deps = {
    orgChainId,
    isPasskeyUser,
    e2eEnabled,
    wagmiConfig: { __config: true },
    getAccount: vi.fn(() => ({ chainId: accountChainId })),
    switchChainAsync,
    getWalletClient: getWalletClient || vi.fn(async () => walletClient),
    clientToSigner: clientToSigner || vi.fn(() => signer),
  };
  return { guard: createEnsureOrgChain(deps), deps, walletClient, signer };
}

describe('createEnsureOrgChain', () => {
  it('returns null (keep ambient signer) in E2E — burner is pre-pinned', async () => {
    const { guard, deps } = makeGuard({ e2eEnabled: true });
    await expect(guard()).resolves.toBeNull();
    expect(deps.switchChainAsync).not.toHaveBeenCalled();
    expect(deps.getWalletClient).not.toHaveBeenCalled();
  });

  it('returns null for passkey users (chain-agnostic bundler path)', async () => {
    const { guard, deps } = makeGuard({ isPasskeyUser: true });
    await expect(guard()).resolves.toBeNull();
    expect(deps.getWalletClient).not.toHaveBeenCalled();
  });

  it('returns null on non-org routes (no orgChainId to enforce)', async () => {
    const { guard, deps } = makeGuard({ orgChainId: null });
    await expect(guard()).resolves.toBeNull();
    expect(deps.getWalletClient).not.toHaveBeenCalled();
  });

  it('switches then reacquires a fresh org-chain signer + walletClient when on the wrong chain', async () => {
    const { guard, deps, walletClient, signer } = makeGuard({ accountChainId: HOME_CHAIN });
    const bound = await guard();

    expect(deps.switchChainAsync).toHaveBeenCalledWith({ chainId: ORG_CHAIN });
    expect(deps.getWalletClient).toHaveBeenCalledWith(deps.wagmiConfig, { chainId: ORG_CHAIN });
    expect(bound).toEqual({ walletClient, signer });
  });

  it('DOES NOT return null just because wagmi already reports orgChainId — it still reacquires + validates (the fail-closed fix)', async () => {
    // The captured render-time signer may be stale even when getAccount() reports
    // the org chain. The guard must reacquire rather than trust it.
    const { guard, deps, signer, walletClient } = makeGuard({ accountChainId: ORG_CHAIN });
    const bound = await guard();

    // No switch needed (already reports org chain)...
    expect(deps.switchChainAsync).not.toHaveBeenCalled();
    // ...but it MUST still reacquire + hand back a fresh org-chain signer, never null.
    expect(deps.getWalletClient).toHaveBeenCalledWith(deps.wagmiConfig, { chainId: ORG_CHAIN });
    expect(bound).not.toBeNull();
    expect(bound).toEqual({ walletClient, signer });
  });

  it('throws (never returns the old signer) when the chain switch is rejected', async () => {
    const rejected = vi.fn(async () => {
      const e = new Error('User rejected the request.');
      e.code = 4001;
      throw e;
    });
    const { guard, deps } = makeGuard({ accountChainId: HOME_CHAIN, switchChainAsync: rejected });

    await expect(guard()).rejects.toThrow(/User rejected/);
    // Never reached reacquisition — we fail closed before touching the signer.
    expect(deps.getWalletClient).not.toHaveBeenCalled();
  });

  it('throws when reacquisition fails (connector mismatch bubbles up)', async () => {
    const boom = vi.fn(async () => {
      throw new Error('ConnectorChainMismatchError');
    });
    const { guard } = makeGuard({ accountChainId: HOME_CHAIN, getWalletClient: boom });
    await expect(guard()).rejects.toThrow(/ConnectorChainMismatch/);
  });

  it('throws (fail closed) when the wallet ACTUALLY reports a different chain than orgChainId (state desync)', async () => {
    // The dangerous case: getAccount() says org chain and the switch is skipped, but
    // eth_chainId proves the wallet never actually left the home chain. client.chain.id
    // is the synthesized org-chain metadata (would falsely pass) — only the ground-truth
    // eth_chainId catches it, and we must NOT proceed to sign/send.
    const staleClient = {
      chain: { id: ORG_CHAIN }, // synthesized metadata — always the requested chain
      account: { address: '0xEOA' },
      request: vi.fn(async ({ method }) =>
        method === 'eth_chainId' ? `0x${HOME_CHAIN.toString(16)}` : undefined // wallet is REALLY on home chain
      ),
    };
    const { guard, deps } = makeGuard({
      accountChainId: ORG_CHAIN, // getAccount lies / desynced → switch skipped
      getWalletClient: vi.fn(async () => staleClient),
    });
    await expect(guard()).rejects.toThrow(new RegExp(`must run on chain ${ORG_CHAIN}`));
    expect(deps.switchChainAsync).not.toHaveBeenCalled(); // proves the skip-switch branch
    // A validation failure means we never derived a usable signer.
    expect(deps.clientToSigner).not.toHaveBeenCalled();
  });

  it('throws when the reacquired client cannot be converted to a signer', async () => {
    const { guard } = makeGuard({
      accountChainId: ORG_CHAIN,
      clientToSigner: vi.fn(() => undefined),
    });
    await expect(guard()).rejects.toThrow(/Could not bind a signer/);
  });
});
