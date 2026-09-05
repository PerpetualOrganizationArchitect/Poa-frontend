import { describe, it, expect, vi, beforeEach } from 'vitest';

// Control the wallet-facing collaborators so we can assert WHICH walletClient the
// 7702 authorization + UserOp signature are produced against. Everything else
// (viem encodeFunctionData, config) runs for real with valid inputs.
vi.mock('./authorizationBuilder', () => ({
  buildEOAAuthorization: vi.fn(async () => ({ address: '0xdelegation', chainId: 100 })),
  checkWallet7702Support: vi.fn(async () => true),
}));
vi.mock('./walletSigner', () => ({
  signUserOpWithWallet: vi.fn(async () => '0xsignature'),
}));
vi.mock('../passkey/userOpBuilder', () => ({
  buildUserOpWithFallback: vi.fn(async () => ({ sender: '0xEOA' })), // no paymaster → single send
  getUserOpHash: vi.fn(() => '0xuserophash'),
}));

import { createEOA7702TransactionManager } from './EOA7702TransactionManager';
import { buildEOAAuthorization } from './authorizationBuilder';
import { signUserOpWithWallet } from './walletSigner';

const EOA = '0xa6f4d9f44dd980b7168d829d5f74c2b00a46b2c9';
const TASK_MANAGER = '0x2d9d397a842b8d691ea2a232062cbc8ef8ebbdb7';

/** Contract stub: a valid address + a hex-returning interface so real viem
 *  encodeFunctionData(execute(address,uint256,bytes)) succeeds. */
function makeContract() {
  return {
    address: TASK_MANAGER,
    interface: { encodeFunctionData: vi.fn(() => '0x1234') },
  };
}

function makeBundler() {
  return {
    sendUserOperation: vi.fn(async () => '0xsubmittedhash'),
    waitForUserOperationReceipt: vi.fn(async () => ({
      success: true,
      receipt: { transactionHash: '0xtx', blockNumber: 1 },
    })),
  };
}

function makeManager({ ensureChain, ambientWallet, bundlerClient, fallbackTxManager, on7702Disabled } = {}) {
  return createEOA7702TransactionManager({
    accountAddress: EOA,
    walletClient: ambientWallet,
    publicClient: {},
    bundlerClient,
    paymasterAddress: null, // keep the self-funded single-send path
    orgId: '0xorg',
    hatIds: [],
    chainId: 100,
    eoaDelegationAddress: '0xdelegation',
    ensureChain,
    fallbackTxManager,
    on7702Disabled,
  });
}

describe('EOA7702TransactionManager — org-chain guard wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('reacquires the org-chain walletClient via ensureChain and signs the authorization + UserOp with IT, not the ambient wallet', async () => {
    const ambientWallet = { account: { address: EOA }, label: 'arbitrum-ambient' };
    const orgWallet = { account: { address: EOA }, label: 'gnosis-reacquired' };
    const ensureChain = vi.fn(async () => ({ walletClient: orgWallet, signer: { id: 'gnosis-signer' } }));
    const bundlerClient = makeBundler();

    const tm = makeManager({ ensureChain, ambientWallet, bundlerClient });
    const res = await tm.execute(makeContract(), 'submitTask', ['7', '0xdeadbeef']);

    expect(ensureChain).toHaveBeenCalledOnce();
    // Authorization (whose chainId comes from the signing client's chain) and the
    // UserOp signature are produced with the REACQUIRED org-chain wallet...
    expect(buildEOAAuthorization).toHaveBeenCalledWith(orgWallet, '0xdelegation');
    expect(signUserOpWithWallet).toHaveBeenCalledWith('0xuserophash', orgWallet);
    // ...never the stale ambient wallet.
    expect(buildEOAAuthorization).not.toHaveBeenCalledWith(ambientWallet, expect.anything());
    expect(signUserOpWithWallet).not.toHaveBeenCalledWith(expect.anything(), ambientWallet);
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    expect(res.success).toBe(true);
  });

  it('falls back to the ambient wallet when ensureChain returns null (E2E / non-org)', async () => {
    const ambientWallet = { account: { address: EOA }, label: 'pre-pinned' };
    const ensureChain = vi.fn(async () => null);
    const bundlerClient = makeBundler();

    const tm = makeManager({ ensureChain, ambientWallet, bundlerClient });
    const res = await tm.execute(makeContract(), 'submitTask', []);

    expect(ensureChain).toHaveBeenCalledOnce();
    expect(buildEOAAuthorization).toHaveBeenCalledWith(ambientWallet, '0xdelegation');
    expect(res.success).toBe(true);
  });

  it('fails closed on a rejected chain switch: no authorization, no submit, no fallback to the (same-wrong-chain) direct path', async () => {
    const ensureChain = vi.fn(async () => {
      const e = new Error('User rejected the request.');
      e.code = 4001;
      throw e;
    });
    const bundlerClient = makeBundler();
    const fallbackTxManager = { execute: vi.fn() };
    const on7702Disabled = vi.fn();

    const tm = makeManager({
      ensureChain,
      ambientWallet: { account: { address: EOA } },
      bundlerClient,
      fallbackTxManager,
      on7702Disabled,
    });
    const res = await tm.execute(makeContract(), 'submitTask', []);

    expect(res.success).toBe(false);
    expect(res.error.category).toBe('user_rejected');
    // Critically: we never signed, never submitted, and did NOT silently fall back
    // to the direct manager (which would hit the very same wrong-chain failure).
    expect(buildEOAAuthorization).not.toHaveBeenCalled();
    expect(signUserOpWithWallet).not.toHaveBeenCalled();
    expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    expect(fallbackTxManager.execute).not.toHaveBeenCalled();
    expect(on7702Disabled).not.toHaveBeenCalled();
  });

  it('treats unsupported 7702 as an expected direct fallback, not a transaction error', async () => {
    buildEOAAuthorization.mockRejectedValueOnce(new Error('WALLET_7702_UNSUPPORTED'));
    const fallbackResult = { success: true, receipt: { transactionHash: '0xdirect' } };
    const fallbackTxManager = { execute: vi.fn(async () => fallbackResult) };
    const on7702Disabled = vi.fn();
    const bundlerClient = makeBundler();

    const tm = makeManager({
      ensureChain: vi.fn(async () => ({
        walletClient: { account: { address: EOA }, label: 'gnosis-reacquired' },
        signer: { id: 'gnosis-signer' },
      })),
      ambientWallet: { account: { address: EOA }, label: 'arbitrum-ambient' },
      bundlerClient,
      fallbackTxManager,
      on7702Disabled,
    });

    const result = await tm.execute(makeContract(), 'submitTask', []);

    expect(result).toBe(fallbackResult);
    expect(on7702Disabled).toHaveBeenCalledOnce();
    expect(fallbackTxManager.execute).toHaveBeenCalledOnce();
    expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[7702] Wallet does not support EIP-7702, falling back to direct transaction'
    );
    expect(console.error).not.toHaveBeenCalled();
  });
});
