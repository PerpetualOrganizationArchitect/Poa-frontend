import { describe, it, expect } from 'vitest';
import {
  budgetRejection,
  budgetVerdict,
  initCodeOf,
  isPaymasterRejection,
  parsePaymasterData,
  remainingBudget,
  requiredPrefund,
  subjectKey,
} from './sponsorshipBudget';
import { decodeContractRevert } from '@/lib/errors/contractErrors';

// The exact op the Test6 #53 count submitted on 2026-09-04 (from the browser console), and the
// hub's budget for its subject at that moment (cast getBudget). This is the failure being fixed.
const PAYMASTER_DATA = '0x01263b2b29f392647f0fb8ddbb26f099e812ab4ba2777e5e07b906277164181f6b'
  + '010000043500010001000100000000000000000000000000000000000000000000'
  + '000000000000000000000000';
const ORG = '0x263b2b29f392647f0fb8ddbb26f099e812ab4ba2777e5e07b906277164181f6b';
const HAT = '0x0000043500010001000100000000000000000000000000000000000000000000';
const OP = {
  callGasLimit: 900000n,
  verificationGasLimit: 500000n,
  paymasterVerificationGasLimit: 208206n,
  paymasterPostOpGasLimit: 61130n,
  preVerificationGas: 66794n,
  maxFeePerGas: 1575000000n,
};
const BUDGET = { capPerEpoch: 20000000000000000n, usedInEpoch: 18028848600000000n, epochLen: 604800, epochStart: 1788276650 };
const NOW = 1788547485;

describe('parsePaymasterData', () => {
  it('splits the 78-byte hub layout', () => {
    const p = parsePaymasterData(PAYMASTER_DATA);
    expect(p.version).toBe(1);
    expect(p.orgId).toBe(ORG);
    expect(p.subjectType).toBe(1);
    expect(p.subjectId).toBe(HAT);
    expect(p.ruleId).toBe(0);
  });
  it('refuses anything that is not exactly 78 bytes', () => {
    expect(parsePaymasterData('0x01')).toBeNull();
    expect(parsePaymasterData(undefined)).toBeNull();
    expect(parsePaymasterData(PAYMASTER_DATA + '00')).toBeNull();
  });
});

describe('subjectKey', () => {
  it('matches keccak256(abi.encodePacked(uint8, bytes32)) — checked against cast on the Test6 key', () => {
    expect(subjectKey(1, HAT)).toBe('0xe8a3189ea8b4321202beeb985dd2f15521d338e82a121a0d0828b73beedf6c0a');
  });
});

describe('requiredPrefund', () => {
  it('sums every gas limit × maxFeePerGas (EntryPoint v0.7)', () => {
    expect(requiredPrefund(OP)).toBe(1736130n * 1575000000n);
  });
  it('treats absent paymaster limits as 0 (self-funded op)', () => {
    const { paymasterVerificationGasLimit, paymasterPostOpGasLimit, ...selfFunded } = OP;
    expect(requiredPrefund(selfFunded)).toBe(1466794n * 1575000000n);
  });
});

describe('remainingBudget', () => {
  it('is cap − used inside the epoch', () => {
    expect(remainingBudget(BUDGET, NOW)).toBe(1971151400000000n);
  });
  it('is the full cap once the epoch has rolled (the hub resets usedInEpoch on the way in)', () => {
    expect(remainingBudget(BUDGET, BUDGET.epochStart + BUDGET.epochLen)).toBe(BUDGET.capPerEpoch);
  });
  it('never goes negative', () => {
    expect(remainingBudget({ ...BUDGET, usedInEpoch: BUDGET.capPerEpoch + 1n }, NOW)).toBe(0n);
  });
});

describe('budgetVerdict — the Test6 #53 count', () => {
  it('predicts the AA33 the hub returned: 0.0027 needed, 0.00197 left', () => {
    const v = budgetVerdict({ budget: BUDGET, userOp: OP, now: NOW });
    expect(v.fits).toBe(false);
    expect(v.needed).toBe(2734404750000000n);
    expect(v.remaining).toBe(1971151400000000n);
    expect(v.unset).toBe(false);
  });
  it('fits once the epoch rolls', () => {
    expect(budgetVerdict({ budget: BUDGET, userOp: OP, now: NOW + 604800 }).fits).toBe(true);
  });
  it('judges as rolled within a minute of the roll (inclusion comes after the prompt)', () => {
    const end = BUDGET.epochStart + BUDGET.epochLen;
    expect(budgetVerdict({ budget: BUDGET, userOp: OP, now: end - 30 }).fits).toBe(true);
    expect(budgetVerdict({ budget: BUDGET, userOp: OP, now: end - 120 }).fits).toBe(false);
  });
  it('an unset budget (cap 0) never fits — that is how an org blocks a subject type', () => {
    const v = budgetVerdict({ budget: { capPerEpoch: 0n, usedInEpoch: 0n, epochLen: 0, epochStart: 0 }, userOp: OP, now: NOW });
    expect(v.fits).toBe(false);
    expect(v.unset).toBe(true);
  });
});

describe('budgetRejection', () => {
  it('decodes through the existing revert machinery as the hub’s BudgetExceeded', () => {
    const err = budgetRejection(budgetVerdict({ budget: BUDGET, userOp: OP, now: NOW }));
    expect(err.code).toBe('SPONSOR_BUDGET_EXCEEDED');
    expect(isPaymasterRejection(err)).toBe(true);
    const decoded = decodeContractRevert(null, err.message);
    expect(decoded?.name).toBe('BudgetExceeded');
    expect(err.message).toMatch(/0\.0019711514 left this period/);
    expect(err.message).toMatch(/reserves up to 0\.00273440475/);
  });
});

// viem's real shape: the short message, then the WHOLE op under "Request Arguments:" (which names
// the paymaster on every sponsored op), then "Details:" with the bundler's AA code.
const viemError = (shortMessage, details) => {
  const e = new Error(
    `${shortMessage}\n\nRequest Arguments:\n  callData:   0xb61d27f6…\n  paymaster:  0xdef1038c297493c0b5f82f0cdb49e929b53b4108\n`
    + `  paymasterData: 0x01263b…\n  sender:     0xbd51908f80389368fd9ea73ed7e66bb2510e9d44\n\nDetails: ${details}\nVersion: viem@2.46.3`
  );
  e.shortMessage = shortMessage;
  e.details = details;
  return e;
};

describe('isPaymasterRejection', () => {
  it('recognises the three AA paymaster codes and the hub’s own marker, nested or not', () => {
    expect(isPaymasterRejection(new Error('UserOperation reverted with reason: AA33 reverted 0x50b2c4e1'))).toBe(true);
    expect(isPaymasterRejection({ cause: { shortMessage: 'The `validatePaymasterUserOp` function on the Paymaster reverted.' } })).toBe(true);
    expect(isPaymasterRejection(viemError('The `validatePaymasterUserOp` function on the Paymaster reverted.', 'UserOperation reverted with reason: AA33 reverted 0x50b2c4e1'))).toBe(true);
    expect(isPaymasterRejection(viemError('Paymaster deposit too low.', 'AA31 paymaster deposit too low'))).toBe(true);
  });
  it('does NOT mistake a sponsored op’s other failures for a paymaster refusal (viem dumps `paymaster:` into every message)', () => {
    expect(isPaymasterRejection(viemError('Sender does not have enough funds.', "UserOperation reverted with reason: AA21 didn't pay prefund"))).toBe(false);
    expect(isPaymasterRejection(viemError('Execution reverted for an unknown reason.', 'UserOperation reverted with reason: AA23 reverted (or OOG)'))).toBe(false);
    expect(isPaymasterRejection(viemError('HTTP request failed.', 'Status: 429'))).toBe(false);
    expect(isPaymasterRejection(new Error('AA21 didn\'t pay prefund'))).toBe(false);
    expect(isPaymasterRejection(new Error('AA23 reverted (or OOG)'))).toBe(false);
  });
});

describe('initCodeOf', () => {
  it('re-joins factory + factoryData for a rebuild, and is 0x for a deployed account', () => {
    expect(initCodeOf({ factory: '0xabc', factoryData: '0x1234' })).toBe('0xabc1234');
    expect(initCodeOf({})).toBe('0x');
  });
});
