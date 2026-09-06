import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import {
  PAYMASTER_SUBJECT_TYPE,
  EPOCH_BOUNDS,
  DEFAULT_SUBJECT_BUDGET,
  SPONSORED_MEMBER_ACTIONS,
  subjectBudgetKey,
  budgetError,
  DEFAULT_SPONSORSHIP,
  sponsorshipAmounts,
  sponsorshipError,
} from './sponsorship';

describe('subjectBudgetKey — matches PaymasterHub keccak256(0x01 ‖ bytes32(id))', () => {
  it('hashes the HAT subject type packed with the padded id', () => {
    const id = 42n;
    const expected = utils.solidityKeccak256(
      ['uint8', 'bytes32'],
      [PAYMASTER_SUBJECT_TYPE.HAT, utils.hexZeroPad(utils.hexlify(id), 32)]
    );
    expect(subjectBudgetKey('42')).toBe(expected);
  });
  it('is stable across decimal / bigint / hex id forms', () => {
    expect(subjectBudgetKey('42')).toBe(subjectBudgetKey(42n));
  });
});

describe('DEFAULT_SUBJECT_BUDGET — generous, finite, within contract bounds', () => {
  it('cap fits uint128 and is > 0', () => {
    const cap = BigInt(DEFAULT_SUBJECT_BUDGET.capWei);
    expect(cap > 0n).toBe(true);
    expect(cap <= (1n << 128n) - 1n).toBe(true);
  });
  it('epoch is inside [1 hour, 365 days]', () => {
    expect(DEFAULT_SUBJECT_BUDGET.epochSecs).toBeGreaterThanOrEqual(EPOCH_BOUNDS.minSecs);
    expect(DEFAULT_SUBJECT_BUDGET.epochSecs).toBeLessThanOrEqual(EPOCH_BOUNDS.maxSecs);
  });
});

describe('budgetError — mirrors the contract bounds', () => {
  it('accepts the defaults', () => {
    expect(budgetError({ capWei: DEFAULT_SUBJECT_BUDGET.capWei, epochSecs: DEFAULT_SUBJECT_BUDGET.epochSecs })).toBeNull();
  });
  it('rejects a zero / overflowing cap', () => {
    expect(budgetError({ capWei: '0', epochSecs: EPOCH_BOUNDS.minSecs })).toMatch(/more than zero/i);
    expect(budgetError({ capWei: (1n << 128n).toString(), epochSecs: EPOCH_BOUNDS.minSecs })).toMatch(/larger than/i);
  });
  it('rejects epochs outside the bounds', () => {
    expect(budgetError({ capWei: '1', epochSecs: EPOCH_BOUNDS.minSecs - 1 })).toMatch(/at least 1 hour/i);
    expect(budgetError({ capWei: '1', epochSecs: EPOCH_BOUNDS.maxSecs + 1 })).toMatch(/at most 365 days/i);
  });
});

describe('SPONSORED_MEMBER_ACTIONS — the protocol rulebook, shown read-only', () => {
  it('includes the core membership verbs a passkey member runs gas-free', () => {
    const sels = SPONSORED_MEMBER_ACTIONS.map((a) => a.selector);
    expect(sels).toEqual(expect.arrayContaining(['claim(uint256)', 'vouch(uint256,address)', 'finalize(uint256)']));
  });
});

describe('native amount conversion and encoded bounds', () => {
  it('converts the generous default exactly without floating point', () => {
    expect(sponsorshipAmounts(DEFAULT_SPONSORSHIP)).toEqual({ capWei: '250000000000000000', epochSecs: 2592000 });
    expect(sponsorshipAmounts({ capNative: '0.000000000000000001', epochDays: 1 })).toEqual({ capWei: '1', epochSecs: 86400 });
  });
  it('rejects values that would truncate, overflow, or use exponent notation', () => {
    for (const capNative of ['0', '1e10', '-1', '0.0000000000000000001', '99999999999999999999999999999999999']) {
      expect(sponsorshipError({ ...DEFAULT_SPONSORSHIP, capNative })).not.toBeNull();
    }
    for (const epochDays of [0, 0.5, 365.5, 366, 'invalid']) {
      expect(sponsorshipError({ ...DEFAULT_SPONSORSHIP, epochDays })).not.toBeNull();
    }
  });
  it('keeps a claim-contract budget separate from a member-subject budget', () => {
    const claimContract = '0x2222222222222222222222222222222222222222';
    expect(subjectBudgetKey(claimContract, PAYMASTER_SUBJECT_TYPE.CLAIM)).toBe(utils.solidityKeccak256(
      ['uint8', 'bytes32'], [5, utils.hexZeroPad(claimContract, 32)]
    ));
    expect(subjectBudgetKey(claimContract, PAYMASTER_SUBJECT_TYPE.CLAIM)).not.toBe(subjectBudgetKey(claimContract));
  });
});
