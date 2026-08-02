/**
 * The TaskManager ABI in abi/ is hand-maintained — there is no extract-abis
 * script in this repo — so it rots silently. A missing `unclaimTask` fragment
 * does not fail a build or a typecheck: the EOA path just gets
 * `contract.estimateGas.unclaimTask === undefined` (a raw TypeError, no parsed
 * revert), and the passkey path throws inside `encodeFunctionData`. Both look
 * like runtime bugs, not a stale file. This test is the only thing that catches
 * it.
 *
 * The selector is pinned to the literal published in POP PR #187 and observed
 * live on Gnosis and Arbitrum (TaskManager v7, impl 0xcfAe1DAd…5988).
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import TaskManagerABI from '../../../../abi/TaskManagerNew.json';

const UNCLAIM_SELECTOR = '0x6103955a';

const fragmentsOf = (type, name) =>
  TaskManagerABI.filter((f) => f.type === type && f.name === name);

describe('TaskManager ABI — v7 claim release', () => {
  it('declares unclaimTask(uint256) as a nonpayable function', () => {
    const [fn, ...dupes] = fragmentsOf('function', 'unclaimTask');
    expect(fn).toBeTruthy();
    expect(dupes).toHaveLength(0);
    expect(fn.inputs.map((i) => i.type)).toEqual(['uint256']);
    expect(fn.outputs).toEqual([]);
    expect(fn.stateMutability).toBe('nonpayable');
  });

  it('declares TaskUnclaimed(id, previousClaimer, caller) with all three indexed', () => {
    const [ev] = fragmentsOf('event', 'TaskUnclaimed');
    expect(ev).toBeTruthy();
    expect(ev.inputs.map((i) => [i.name, i.type, i.indexed])).toEqual([
      ['id', 'uint256', true],
      ['previousClaimer', 'address', true],
      ['caller', 'address', true],
    ]);
  });

  it('encodes to the selector deployed on-chain', () => {
    const iface = new ethers.utils.Interface(TaskManagerABI);
    const data = iface.encodeFunctionData('unclaimTask', [7]);
    expect(data.slice(0, 10)).toBe(UNCLAIM_SELECTOR);
    expect(data).toBe(UNCLAIM_SELECTOR + '7'.padStart(64, '0'));
  });

  it('decodes the TaskUnclaimed topic the subgraph indexes', () => {
    const iface = new ethers.utils.Interface(TaskManagerABI);
    const ev = iface.getEvent('TaskUnclaimed');
    expect(iface.getEventTopic(ev)).toBe(ethers.utils.id('TaskUnclaimed(uint256,address,address)'));
  });

  it('is additive — the pre-v7 task lifecycle is still declared', () => {
    // Guards against a regeneration that drops fragments while adding v7.
    for (const name of ['claimTask', 'submitTask', 'assignTask', 'completeTask', 'cancelTask', 'rejectTask']) {
      expect(fragmentsOf('function', name)).toHaveLength(1);
    }
  });
});
