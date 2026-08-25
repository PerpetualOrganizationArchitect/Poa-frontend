/**
 * THE ANTI-TAUTOLOGY TEST for the announceWinner gas floor.
 *
 * The bug this pins was NOT that the floor was uncomputed — `proposalBuilders.estimateBatchGas`
 * always produced one, and its unit tests were green. The bug was that the floor never reached a
 * transaction: it was attached to createProposal (which does not need it), under a key
 * (`gasLimit`) that neither transaction manager read. Every test in the codebase passed while the
 * mechanism was inert.
 *
 * So these tests follow the value through the REAL objects — gasFloorOptions → VotingService →
 * TransactionManager → the actual `contract.announceWinner(...)` overrides — with fakes only at
 * the network boundary. Nothing here asserts that a builder returns a number.
 */

import { describe, it, expect } from 'vitest';
import { BigNumber } from 'ethers';
import { VotingService, VotingType } from './VotingService';
import { TransactionManager } from '../core/TransactionManager';
import { createGasOptions } from '@/config/gas';
import { gasFloorOptions } from '@/lib/accessV2/gasFloors';

const VOTING = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** A txManager that records the options it was handed instead of sending anything. */
function recordingTxManager() {
  const calls = [];
  return {
    calls,
    execute: async (contract, method, args, options) => {
      calls.push({ method, args, options });
      return { success: true, receipt: {} };
    },
  };
}

const stubFactory = {
  createWritable: () => ({ interface: { fragments: [] } }),
  createReadable: () => ({}),
};

describe('VotingService.announceWinner forwards the floor to the announceWinner send', () => {
  for (const [label, type] of [['hybrid', VotingType.HYBRID], ['direct democracy', VotingType.DIRECT_DEMOCRACY]]) {
    it(`carries both floor channels on the ${label} path`, async () => {
      const txManager = recordingTxManager();
      const service = new VotingService(stubFactory, txManager);

      await service.announceWinner(type, VOTING, '12', gasFloorOptions(1_650_000));

      expect(txManager.calls).toHaveLength(1);
      const { method, args, options } = txManager.calls[0];
      expect(method).toBe('announceWinner');
      expect(args).toEqual(['12']);
      expect(options.gasLimit).toBe(1_650_000);
      expect(options.callGasLimitFloor).toBe(1_650_000);
    });

    it(`keeps the 3x Hats tree-walk multiplier on the ${label} path (the floor composes, it does not replace)`, async () => {
      const txManager = recordingTxManager();
      const service = new VotingService(stubFactory, txManager);

      await service.announceWinner(type, VOTING, '12', gasFloorOptions(1_650_000));

      expect(txManager.calls[0].options.callGasLimitMultiplier).toBe(3n);
    });
  }

  it('sends nothing extra when there is no recorded floor (unchanged legacy behaviour)', async () => {
    const txManager = recordingTxManager();
    const service = new VotingService(stubFactory, txManager);

    await service.announceWinner(VotingType.HYBRID, VOTING, '12', gasFloorOptions(null));

    const { options } = txManager.calls[0];
    expect(options.gasLimit).toBeUndefined();
    expect(options.callGasLimitFloor).toBeUndefined();
    expect(options.callGasLimitMultiplier).toBe(3n);
  });
});

describe('TransactionManager applies the floor to the transaction it actually sends (EOA path)', () => {
  /**
   * A contract whose estimateGas returns the CHEAP CAUGHT-FAILURE number announceWinner really
   * reports (~29k, per the Test6 #23 incident), and which records the overrides it is called with.
   */
  function fakeContract(estimate = 29_000) {
    const sent = [];
    return {
      sent,
      interface: { fragments: [] },
      estimateGas: {
        announceWinner: async () => BigNumber.from(estimate),
      },
      announceWinner: async (...callArgs) => {
        sent.push(callArgs[callArgs.length - 1]);
        return { hash: '0xhash', wait: async () => ({ transactionHash: '0xhash', blockNumber: 1 }) };
      },
    };
  }

  it('raises the under-funded estimate to the floor', async () => {
    const contract = fakeContract(29_000);
    const manager = new TransactionManager({});

    const result = await manager.execute(contract, 'announceWinner', ['12'], gasFloorOptions(1_650_000));

    expect(result.success).toBe(true);
    // 29k * 1.15 buffer = 33_350 — an order of magnitude short of the batch. The floor wins.
    expect(contract.sent[0].gasLimit.toString()).toBe('1650000');
  });

  it('never CAPS a bigger estimate — a floor below the buffered estimate is ignored', async () => {
    const contract = fakeContract(2_000_000);
    const manager = new TransactionManager({});

    await manager.execute(contract, 'announceWinner', ['12'], gasFloorOptions(1_000_000));

    expect(contract.sent[0].gasLimit.toString()).toBe('2300000'); // 2M * 1.15
  });

  it('sends the plain buffered estimate when no floor is supplied', async () => {
    const contract = fakeContract(29_000);
    const manager = new TransactionManager({});

    await manager.execute(contract, 'announceWinner', ['12'], {});

    expect(contract.sent[0].gasLimit.toString()).toBe('33350');
  });
});

describe('createGasOptions floor semantics', () => {
  const estimate = BigNumber.from(100_000); // → 115_000 buffered

  it('is a floor, not an override', () => {
    expect(createGasOptions(estimate, { gasLimitFloor: 500_000 }).gasLimit.toString()).toBe('500000');
    expect(createGasOptions(estimate, { gasLimitFloor: 50_000 }).gasLimit.toString()).toBe('115000');
  });

  it('accepts the shapes a floor can arrive in', () => {
    expect(createGasOptions(estimate, { gasLimitFloor: '500000' }).gasLimit.toString()).toBe('500000');
    expect(createGasOptions(estimate, { gasLimitFloor: BigNumber.from(500_000) }).gasLimit.toString()).toBe('500000');
    expect(createGasOptions(estimate, { gasLimitFloor: 500_000.7 }).gasLimit.toString()).toBe('500000');
  });

  it('keeps the estimate rather than throwing when the floor is unusable', () => {
    for (const bad of [null, undefined, 'not a number', {}, NaN]) {
      expect(createGasOptions(estimate, { gasLimitFloor: bad }).gasLimit.toString()).toBe('115000');
    }
  });

  it('still honours the delete multiplier alongside a floor', () => {
    expect(createGasOptions(estimate, { isDelete: true }).gasLimit.toString()).toBe('120000');
    expect(createGasOptions(estimate, { isDelete: true, gasLimitFloor: 130_000 }).gasLimit.toString()).toBe('130000');
  });
});
