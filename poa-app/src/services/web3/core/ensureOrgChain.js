/**
 * ensureOrgChain
 *
 * Pure, dependency-injected factory for the org-chain guard that every EOA write
 * path (the direct `TransactionManager` AND the EIP-7702 `EOA7702TransactionManager`)
 * runs BEFORE it estimates / signs / sends. An EOA transaction broadcasts through
 * the wallet's *connected* chain and a 7702 authorization's chainId comes from the
 * signing client's chain — so if the wallet is still on the home chain (Arbitrum)
 * while the org lives on Gnosis, the call targets a codeless address instead of
 * the intended contract. In the reported wallet/provider path that surfaced as
 * `-32603 "Error processing the transaction"`; other providers may accept the
 * wrong-chain transaction as a no-op, which is equally incorrect.
 *
 * The guard, on every org write:
 *   1. switches the connected wallet to `orgChainId` (when not already there),
 *   2. ALWAYS reacquires a viem wallet client freshly bound to `orgChainId`
 *      — even when wagmi already *reports* `orgChainId`, because the ethers
 *      signer / viem client captured at render time can still point at the old
 *      chain's provider,
 *   3. validates the reacquired client actually reports `orgChainId`,
 *   4. returns `{ walletClient, signer }` both bound to `orgChainId`.
 *
 * It FAILS CLOSED: if the switch, reacquisition, or chain validation fails it
 * THROWS. It never hands back the stale / ambient signer, so a caller can never
 * silently continue on the wrong chain.
 *
 * Returns `null` (meaning "nothing to enforce — keep the ambient signer") only for
 * the three cases where the ambient signer is already correct or chain-agnostic:
 *   - E2E: the burner signer is pinned to the org chain's RPC at construction and
 *     there is no chain-switch UI.
 *   - Passkey users: UserOps go through the bundler (chain-agnostic wallet).
 *   - Non-org routes (`!orgChainId`): home-chain operations (account registration,
 *     usernames) that must NOT be forced onto an org chain.
 *
 * This module is deliberately free of React/wagmi imports so its behavior can be
 * unit tested deterministically (see ensureOrgChain.test.js); useWeb3Services wires
 * the real wagmi actions in.
 *
 * @param {Object}   deps
 * @param {number|null} deps.orgChainId          - Target org chain id, or null on non-org routes.
 * @param {boolean}  deps.isPasskeyUser          - True for ERC-4337 passkey users.
 * @param {boolean}  deps.e2eEnabled             - True in the E2E burner harness.
 * @param {Object}   deps.wagmiConfig            - wagmi config passed to the actions below.
 * @param {Function} deps.getAccount             - wagmi getAccount(config).
 * @param {Function} deps.switchChainAsync       - wagmi useSwitchChain().switchChainAsync.
 * @param {Function} deps.getWalletClient        - wagmi getWalletClient(config, { chainId }). Must
 *   return a client extended with viem walletActions (signAuthorization/signMessage) so the
 *   returned walletClient is usable by the EIP-7702 path — NOT the bare getConnectorClient.
 * @param {Function} deps.clientToSigner         - viem-client → ethers-signer converter.
 * @returns {() => Promise<{ walletClient: Object, signer: Object } | null>}
 */
export function createEnsureOrgChain({
  orgChainId,
  isPasskeyUser,
  e2eEnabled,
  wagmiConfig,
  getAccount,
  switchChainAsync,
  getWalletClient,
  clientToSigner,
}) {
  return async function ensureOrgChain() {
    // Burner (E2E) signer is already pinned to the org chain's RPC.
    if (e2eEnabled) return null;
    // Passkey UserOps go through the bundler (chain-agnostic wallet); non-org
    // routes have no chain to enforce.
    if (isPasskeyUser || !orgChainId) return null;

    const current = getAccount(wagmiConfig)?.chainId;
    if (current !== orgChainId) {
      // Awaited + surfaced: a rejected/failed switch throws here (and is parsed by
      // the tx manager's error path) instead of silently sending to the wrong chain.
      await switchChainAsync({ chainId: orgChainId });
    }

    // ALWAYS reacquire — never trust the render-time signer even when wagmi already
    // reports orgChainId. getWalletClient returns a client extended with walletActions,
    // so it doubles as the 7702 signing client AND the source for the direct-path
    // ethers signer (clientToSigner).
    const client = await getWalletClient(wagmiConfig, { chainId: orgChainId });
    if (!client) {
      throw new Error(
        `Could not acquire a wallet client for chain ${orgChainId}. Reconnect your wallet and try again.`
      );
    }

    // GROUND-TRUTH validation. Note: getWalletClient/getConnectorClient synthesize
    // `client.chain` from the REQUESTED chainId (config.chains.find(id === chainId)),
    // so `client.chain.id` is always orgChainId and is NOT a real check — the client's
    // transport still talks to whatever chain the wallet is actually on. Ask the wallet
    // directly via eth_chainId and fail closed if it disagrees (catches a wagmi/wallet
    // state desync where getAccount() reported orgChainId but the wallet never switched).
    const actual = await client.request({ method: 'eth_chainId' });
    const actualChainId = typeof actual === 'string' ? parseInt(actual, 16) : actual;
    if (actualChainId !== orgChainId) {
      throw new Error(
        `Wallet is on chain ${actualChainId ?? 'unknown'} but this action must run on chain ${orgChainId}. ` +
        'Switch networks in your wallet and try again.'
      );
    }

    const signer = clientToSigner(client);
    if (!signer) {
      throw new Error(
        `Could not bind a signer to chain ${orgChainId}. Reconnect your wallet and try again.`
      );
    }

    return { walletClient: client, signer };
  };
}
