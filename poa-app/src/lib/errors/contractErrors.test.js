import { describe, it, expect } from 'vitest';
import {
  decodeRevertData,
  decodeContractRevert,
  extractRevertDataFromText,
  extractRevertDataFromError,
  messageForErrorName,
  CONTRACT_ERROR_SELECTORS,
} from './contractErrors';
import { parseError } from './ErrorParser';
import { Web3ErrorCategory } from './Web3Error';

// Error(string) "Not eligible to claim hat" — the exact bytes captured from a
// Test6 passkey claimVouchedHat revert (bundler simulation).
const NOT_ELIGIBLE_DATA =
  '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000194e6f7420656c696769626c6520746f20636c61696d2068617400000000000000';

// The full viem/Pimlico error message text from the same repro (trimmed), which
// embeds the UserOp's own callData (0xb61d27f6…) and dummy signature — the
// decoder must NOT mistake those for the revert reason.
const PASSKEY_MESSAGE =
  'Execution reverted with reason: UserOperation reverted during simulation with reason: ' +
  NOT_ELIGIBLE_DATA +
  '.\n\nRequest Arguments:\n  callData:  0xb61d27f6000000000000000000000000f01f2bdd5c86e7b676117cb0d6e2c07aa36e8c8b0000000000000000000000000000000000000000000000000000000000000000\n' +
  '  sender:    0xBd51908F80389368fd9Ea73Ed7E66BB2510e9d44\n' +
  '  signature: 0x' + 'ff'.repeat(640) + '\n' +
  'Details: UserOperation reverted during simulation with reason: ' + NOT_ELIGIBLE_DATA;

describe('decodeRevertData', () => {
  it('decodes Error(string) to its embedded reason', () => {
    const d = decodeRevertData(NOT_ELIGIBLE_DATA);
    expect(d).toBeTruthy();
    expect(d.isStringError).toBe(true);
    expect(d.reason).toBe('Not eligible to claim hat');
  });

  it('decodes a custom-error selector via the generated map', () => {
    expect(decodeRevertData('0x5c975bda').name).toBe('BadStatus'); // BadStatus()
    expect(decodeRevertData('0x95530668').name).toBe('NotClaimer'); // NotClaimer()
    expect(decodeRevertData('0x3cb97240').name).toBe('Ineligible'); // PaymasterHub AA33
  });

  it('attaches a friendly message for known names', () => {
    expect(decodeRevertData('0x235dddba').message).toMatch(/requires an application/i); // RequiresApplication
  });

  it('returns null for unknown selectors and non-hex input', () => {
    expect(decodeRevertData('0xdeadbeef')).toBeNull();
    expect(decodeRevertData('not hex')).toBeNull();
    expect(decodeRevertData(undefined)).toBeNull();
  });
});

describe('extractRevertDataFromText (anchored — guards against B2)', () => {
  it('extracts the revert blob, NOT the callData or signature', () => {
    const hexes = extractRevertDataFromText(PASSKEY_MESSAGE);
    expect(hexes.some((h) => h.startsWith('0x08c379a0'))).toBe(true);
    expect(hexes.some((h) => h.startsWith('0xb61d27f6'))).toBe(false); // execute() callData
    expect(hexes.some((h) => /^0x(ff)+$/.test(h))).toBe(false); // dummy signature
  });

  it('extracts a bare selector after an "AA33 reverted" marker', () => {
    const hexes = extractRevertDataFromText('... AA33 reverted 0x3cb97240');
    expect(hexes).toContain('0x3cb97240');
  });
});

describe('decodeContractRevert (end-to-end on the real passkey message)', () => {
  it('resolves the real "Not eligible to claim hat" reason', () => {
    const d = decodeContractRevert(null, PASSKEY_MESSAGE);
    expect(d?.reason).toBe('Not eligible to claim hat');
  });

  it('maps the require-string to friendly, actionable copy (EOA/passkey parity)', () => {
    const d = decodeContractRevert(null, PASSKEY_MESSAGE);
    expect(d?.message).toMatch(/not eligible to claim this role/i);
  });
});

describe('extractRevertDataFromError (ethers gas-estimation nesting — A1)', () => {
  it('finds revert bytes nested at error.error.data.data', () => {
    const err = { code: 'UNPREDICTABLE_GAS_LIMIT', error: { data: { data: '0x5c975bda' } } };
    expect(extractRevertDataFromError(err)).toBe('0x5c975bda');
  });

  it('finds revert bytes when error.error.data is a hex string', () => {
    const err = { error: { data: '0x95530668' } };
    expect(extractRevertDataFromError(err)).toBe('0x95530668');
  });
});

describe('parseError EOA path (RC1 + RC3: gas-estimation now ABI/selector-decodes)', () => {
  it('decodes BadStatus on a GAS_ESTIMATION_FAILED revert (previously generic)', () => {
    const err = { code: 'UNPREDICTABLE_GAS_LIMIT', error: { data: { data: '0x5c975bda' } } };
    const parsed = parseError(err);
    expect(parsed.category).toBe(Web3ErrorCategory.GAS_ESTIMATION_FAILED);
    expect(parsed.userMessage).toMatch(/right state/i); // BadStatus friendly copy
    expect(parsed.userMessage).not.toMatch(/check your inputs/i);
  });

  it('decodes an Error(string) contract revert', () => {
    const err = { code: 'CALL_EXCEPTION', data: NOT_ELIGIBLE_DATA, message: 'execution reverted' };
    const parsed = parseError(err);
    expect(parsed.userMessage).toMatch(/not eligible/i);
  });

  it('preserves the user-rejection short-circuit', () => {
    const parsed = parseError({ code: 4001, message: 'user rejected transaction' });
    expect(parsed.category).toBe(Web3ErrorCategory.USER_REJECTED);
    expect(parsed.userMessage).toBe('Transaction cancelled.');
  });
});

describe('selector map integrity', () => {
  it('has the corrected (previously wrong) selectors', () => {
    expect(CONTRACT_ERROR_SELECTORS['0x5c975bda']).toBe('BadStatus');
    expect(CONTRACT_ERROR_SELECTORS['0x95530668']).toBe('NotClaimer');
    expect(CONTRACT_ERROR_SELECTORS['0x7c9a1cf9']).toBe('AlreadyVoted');
    // the old stale BadStatus selector now correctly maps to the OZ error it really is
    expect(CONTRACT_ERROR_SELECTORS['0x9996b315']).toBe('AddressEmptyCode');
  });

  it('every selector key is a 4-byte hex', () => {
    for (const sel of Object.keys(CONTRACT_ERROR_SELECTORS)) {
      expect(sel).toMatch(/^0x[0-9a-f]{8}$/);
    }
  });

  it('has friendly copy for the headline accept-role / task reverts', () => {
    for (const name of ['Unauthorized', 'RequiresApplication', 'BadStatus', 'NotClaimer', 'VouchingNotEnabled', 'NotAuthorizedToVouch']) {
      expect(messageForErrorName(name)).toBeTruthy();
    }
  });
});
