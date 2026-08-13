import { describe, it, expect } from 'vitest';
import { isMissingSelectorError } from './VotingService';

describe('isMissingSelectorError', () => {
  it('detects an unrecognised-selector revert', () => {
    expect(isMissingSelectorError(new Error('function selector was not recognized'))).toBe(true);
    expect(isMissingSelectorError(new Error('no matching function'))).toBe(true);
    expect(isMissingSelectorError(new Error('contract.createProposalV2 is not a function'))).toBe(true);
  });

  it('treats a call revert exception with empty return data as missing selector', () => {
    expect(isMissingSelectorError({ message: 'call revert exception', data: '0x' })).toBe(true);
  });

  it('does NOT swallow a genuine revert with reason data', () => {
    // The contract's own quorum-rule guard must bubble up, not be mistaken for
    // an unsupported selector.
    expect(isMissingSelectorError({ message: 'execution reverted: OverrideOnUnrestricted', data: '0xabcdef' })).toBe(false);
    expect(isMissingSelectorError(new Error('user rejected transaction'))).toBe(false);
  });
});
