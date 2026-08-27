/**
 * Offline half of the contract-limit pin: the mirrored constant must still correspond to a getter
 * that EXISTS on all three ABIs. A rename or removal upstream means the mirror is describing a
 * contract that no longer exists, which is exactly when the number goes stale.
 *
 * (An ABI cannot carry a constant's VALUE — only its getter. The value is pinned against live
 * deployments in `contractLimits.live.test.js`.)
 */

import { describe, it, expect } from 'vitest';
import { MAX_CALLS_PER_BATCH } from './contractLimits';
import ExecutorABI from '../../abi/Executor.json';
import HybridVotingABI from '../../abi/HybridVotingNew.json';
import DirectDemocracyVotingABI from '../../abi/DirectDemocracyVotingNew.json';

const fragments = (abi) => (Array.isArray(abi) ? abi : abi.abi);

function getter(abi, name) {
  return fragments(abi).find((f) => f.type === 'function' && f.name === name);
}

describe('MAX_CALLS_PER_BATCH', () => {
  it('is 20', () => {
    expect(MAX_CALLS_PER_BATCH).toBe(20);
  });

  it('mirrors a getter that exists on the Executor ABI', () => {
    const f = getter(ExecutorABI, 'MAX_CALLS_PER_BATCH');
    expect(f).toBeDefined();
    expect(f.inputs).toEqual([]);
    expect(f.outputs[0].type).toBe('uint8');
  });

  it('mirrors a getter that exists on BOTH voting ABIs — they are the gate at proposal creation', () => {
    for (const abi of [HybridVotingABI, DirectDemocracyVotingABI]) {
      const f = getter(abi, 'MAX_CALLS');
      expect(f).toBeDefined();
      expect(f.inputs).toEqual([]);
      expect(f.outputs[0].type).toBe('uint8');
    }
  });

  it('fits in the uint8 the contracts declare', () => {
    expect(Number.isInteger(MAX_CALLS_PER_BATCH)).toBe(true);
    expect(MAX_CALLS_PER_BATCH).toBeGreaterThan(0);
    expect(MAX_CALLS_PER_BATCH).toBeLessThanOrEqual(255);
  });
});
