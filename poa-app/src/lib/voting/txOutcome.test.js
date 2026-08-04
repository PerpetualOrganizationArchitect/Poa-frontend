import { describe, it, expect } from 'vitest';
import { txConfirmed } from './txOutcome';

// The regression this file exists for: PollDetail celebrates optimistically and
// only reconciles from the onVote resolve, so anything short of proof that the
// transaction landed has to fail closed.
describe('txConfirmed — only proof of a landed tx confirms', () => {
  it('confirms a successful TransactionResult', () => {
    expect(txConfirmed({ success: true, txHash: '0xabc' })).toBe(true);
  });

  it('fails an explicit failure', () => {
    expect(txConfirmed({ success: false, error: new Error('reverted') })).toBe(false);
  });

  it('fails a void resolve — the /votes archive passed no onVote at all', () => {
    expect(txConfirmed(undefined)).toBe(false);
    expect(txConfirmed(null)).toBe(false);
  });

  it('fails a resolve that never says whether it worked', () => {
    expect(txConfirmed({})).toBe(false);
    expect(txConfirmed({ txHash: '0xabc' })).toBe(false);
  });

  it('does not accept a merely truthy success', () => {
    expect(txConfirmed({ success: 'yes' })).toBe(false);
    expect(txConfirmed({ success: 1 })).toBe(false);
  });

  it('fails non-object resolves', () => {
    expect(txConfirmed(true)).toBe(false);
    expect(txConfirmed('ok')).toBe(false);
    expect(txConfirmed(0)).toBe(false);
  });
});
