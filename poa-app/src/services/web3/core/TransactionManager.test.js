import { describe, it, expect, vi, beforeEach } from 'vitest';

// Keep the gas math hermetic — we only care about which signer/contract the tx
// is sent through, not the buffered gas number.
vi.mock('@/config', () => ({
  calculateGasLimit: (g) => g,
  createGasOptions: () => ({ gasLimit: 1_000_000 }),
  getNetworkByChainId: () => null,
}));

import { createTransactionManager } from './TransactionManager';

const METHOD = 'submitTask';

function makeContract(label) {
  return {
    label,
    _boundSigner: null,
    interface: { fragments: [] },
    estimateGas: {
      [METHOD]: vi.fn(async () => 21000n),
    },
    [METHOD]: vi.fn(async () => ({
      hash: `0x${label}`,
      wait: vi.fn(async () => ({ transactionHash: `0x${label}`, blockNumber: 1 })),
    })),
  };
}

/** A contract whose .connect(signer) yields a distinct "reconnected" contract. */
function makeConnectable() {
  const original = makeContract('original');
  const reconnected = makeContract('reconnected');
  original.connect = vi.fn((signer) => {
    reconnected._boundSigner = signer;
    return reconnected;
  });
  return { original, reconnected };
}

describe('TransactionManager.execute — ensureChain (org-chain binding)', () => {
  beforeEach(() => {
    // Silence the intentional error-path debug logging.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('rebinds the contract to the fresh org-chain signer before sending (the -32603 fix)', async () => {
    const { original, reconnected } = makeConnectable();
    const orgChainSigner = { id: 'gnosis-signer' };
    const ensureChain = vi.fn(async () => orgChainSigner);

    const tm = createTransactionManager({ id: 'ambient-arbitrum' }, { ensureChain });
    const res = await tm.execute(original, METHOD, ['7', '0xhash']);

    expect(ensureChain).toHaveBeenCalledOnce();
    expect(original.connect).toHaveBeenCalledWith(orgChainSigner);

    // Estimation + send go through the RECONNECTED (org-chain) contract...
    expect(reconnected.estimateGas[METHOD]).toHaveBeenCalledWith('7', '0xhash', {});
    expect(reconnected[METHOD]).toHaveBeenCalled();
    // ...never the ambient (wrong-chain) one.
    expect(original.estimateGas[METHOD]).not.toHaveBeenCalled();
    expect(original[METHOD]).not.toHaveBeenCalled();

    expect(reconnected._boundSigner).toBe(orgChainSigner);
    // The shared manager signer is NOT mutated — the switched signer is local to
    // this send, so a concurrent/next call never observes a half-mutated manager.
    expect(tm.signer).toEqual({ id: 'ambient-arbitrum' });
    expect(res.success).toBe(true);
  });

  it('leaves the original contract/signer untouched when ensureChain returns null', async () => {
    const { original } = makeConnectable();
    const ensureChain = vi.fn(async () => null);

    const tm = createTransactionManager({ id: 'ambient' }, { ensureChain });
    const res = await tm.execute(original, METHOD, []);

    expect(ensureChain).toHaveBeenCalledOnce();
    expect(original.connect).not.toHaveBeenCalled();
    expect(original[METHOD]).toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('is a no-op when no ensureChain is injected (backward compatible)', async () => {
    const { original } = makeConnectable();

    const tm = createTransactionManager({ id: 'ambient' });
    const res = await tm.execute(original, METHOD, []);

    expect(original.connect).not.toHaveBeenCalled();
    expect(original[METHOD]).toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('fails cleanly without sending if the chain switch is rejected', async () => {
    const { original } = makeConnectable();
    const ensureChain = vi.fn(async () => {
      const e = new Error('User rejected the request.');
      e.code = 4001;
      throw e;
    });

    const tm = createTransactionManager({ id: 'ambient' }, { ensureChain });
    const res = await tm.execute(original, METHOD, []);

    expect(res.success).toBe(false);
    expect(res.error.category).toBe('USER_REJECTED');
    // Critically: we never broadcast to the wrong chain.
    expect(original[METHOD]).not.toHaveBeenCalled();
  });
});
