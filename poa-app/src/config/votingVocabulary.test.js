/**
 * `executionStatus` is the COMPLETED-PROPOSAL surface: the chip and the one-line explanation a
 * member reads after a vote was counted. `Proposal.executionError` is `Bytes` in the schema — the
 * raw `ProposalExecutionFailed.reason` — and it used to be interpolated verbatim, so the
 * explanation read "The winning action failed on-chain: 0x5c0dee5d0000…".
 */

import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import { executionStatus } from './votingVocabulary';
import { EXECUTOR_CALL_FAILED_SELECTOR } from '@/lib/errors/contractErrors';

const callFailed = (index, inner) =>
  EXECUTOR_CALL_FAILED_SELECTOR
  + utils.defaultAbiCoder.encode(['uint256', 'bytes'], [index, inner]).slice(2);

const failed = (executionError) => executionStatus({
  isValid: true,
  executionFailed: true,
  executionError,
});

describe('executionStatus — a failed execution explains itself in English', () => {
  it('decodes the inner cause out of the Executor.CallFailed wrapper', () => {
    const s = failed(callFailed(0, '0x48cbf26d')); // TargetNotAllowed()
    expect(s.key).toBe('failed');
    expect(s.canRetry).toBe(true);
    expect(s.explain).toContain('Action 1 in this proposal');
    expect(s.explain).toContain('voting allowlist');
  });

  it('names the access-v2 cause a role proposal fails with', () => {
    const subjectFull = utils.id('SubjectFull(uint256,address)').slice(0, 10);
    expect(failed(callFailed(1, subjectFull)).explain).toContain('That role is full');
  });

  it('reads the swallowed out-of-gas and names the remedy', () => {
    // The whole reason for the announceWinner gas floor: the batch is caught, so an under-funded
    // finalize looks like a success and applies nothing.
    expect(failed(callFailed(0, '0x')).explain).toContain('higher gas limit');
    expect(failed('0x').explain).toContain('ran out of gas');
  });

  it('NEVER interpolates raw revert bytes into member-facing copy', () => {
    const blob = callFailed(0, '0xdeadbeef');
    const { explain } = failed(blob);
    expect(explain).not.toContain(blob);
    // The documented fallback is the 4-byte selector, and nothing longer.
    expect(explain).toContain('0xdeadbeef');
  });

  it('keeps the generic line when there is no reason at all', () => {
    expect(failed(null).explain).toBe("The winning option's on-chain action failed to run — it can be retried.");
    expect(failed(undefined).explain).toBe("The winning option's on-chain action failed to run — it can be retried.");
  });

  it('leaves every other lifecycle branch alone', () => {
    expect(executionStatus({ isValid: true, wasExecuted: true }).key).toBe('applied');
    expect(executionStatus({ isValid: true }).key).toBe('signal');
    expect(executionStatus({ isValid: false }).key).toBe('no_quorum');
    expect(executionStatus({ isValid: true, hasExecutableActions: true }).key).toBe('pending');
  });
});
