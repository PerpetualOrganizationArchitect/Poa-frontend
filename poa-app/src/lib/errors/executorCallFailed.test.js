/**
 * Executor.CallFailed — the wrapper every governance batch reverts through.
 *
 * Revert blobs are ENCODED with ethers from the real signature (`Executor.sol:35`) rather than
 * hand-written, so a signature drift fails the test instead of matching a stale fixture.
 */

import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import {
  EXECUTOR_CALL_FAILED_SELECTOR,
  decodeExecutorCallFailure,
  decodeRevertData,
  describeExecutionFailure,
  shortSelector,
  messageForErrorName,
  CONTRACT_ERROR_SELECTORS,
} from './contractErrors';
import { parseError } from './ErrorParser';
import { Web3ErrorCategory } from './Web3Error';

/** `abi.encodeWithSelector(CallFailed.selector, index, lowLevelData)` */
function callFailed(index, inner) {
  return (
    EXECUTOR_CALL_FAILED_SELECTOR
    + utils.defaultAbiCoder.encode(['uint256', 'bytes'], [index, inner]).slice(2)
  );
}

const TARGET_NOT_ALLOWED = '0x48cbf26d'; // TargetNotAllowed()
const SUBJECT_FULL = utils.id('SubjectFull(uint256,address)').slice(0, 10);
const NOT_ELIGIBLE_STRING = utils.defaultAbiCoder
  .encode(['string'], ['Not eligible to claim hat'])
  .replace('0x', '0x08c379a0');

describe('the CallFailed selector is the real one', () => {
  it('matches keccak("CallFailed(uint256,bytes)")', () => {
    expect(EXECUTOR_CALL_FAILED_SELECTOR).toBe(utils.id('CallFailed(uint256,bytes)').slice(0, 10));
    expect(CONTRACT_ERROR_SELECTORS[EXECUTOR_CALL_FAILED_SELECTOR]).toBe('CallFailed');
  });
});

describe('decodeExecutorCallFailure', () => {
  it('recovers the index and the INNER error, not the wrapper', () => {
    const f = decodeExecutorCallFailure(callFailed(2, TARGET_NOT_ALLOWED));
    expect(f.index).toBe(2);
    expect(f.inner.name).toBe('TargetNotAllowed');
    // 1-indexed for humans; the contract counts from 0.
    expect(f.message).toContain('Action 3 in this proposal');
    expect(f.message).toContain(messageForErrorName('TargetNotAllowed'));
  });

  it('names the access-v2 authority errors a role proposal reverts with', () => {
    const f = decodeExecutorCallFailure(callFailed(0, SUBJECT_FULL));
    expect(f.inner.name).toBe('SubjectFull');
    expect(f.message).toBe('Action 1 in this proposal failed: That role is full. Free a seat first, or raise the seat limit.');
  });

  it('unwraps a plain require() string from the inner call', () => {
    const f = decodeExecutorCallFailure(callFailed(1, NOT_ELIGIBLE_STRING));
    expect(f.message).toContain("You're not eligible to claim this role yet");
  });

  it('EMPTY inner data is the out-of-gas case, and says so with the remedy', () => {
    // CLAUDE.md's loudest gotcha: announceWinner catches the sub-call revert, so an under-funded
    // finalize reports SUCCESS while applying nothing. `CallFailed(i, 0x)` is the only trace.
    const f = decodeExecutorCallFailure(callFailed(0, '0x'));
    expect(f.innerData).toBe('0x');
    expect(f.inner).toBeNull();
    expect(f.message).toContain('ran out of gas');
    expect(f.message).toContain('higher gas limit');
  });

  it('falls back to the short selector hex for an error nothing knows', () => {
    const unknown = '0xdeadbeef';
    const f = decodeExecutorCallFailure(callFailed(4, unknown));
    expect(f.message).toContain('Action 5 in this proposal');
    expect(f.message).toContain('0xdeadbeef');
    // The fallback is the SELECTOR, never the whole blob.
    expect(f.message).not.toContain(callFailed(4, unknown));
  });

  it('truncates the fallback to 4 bytes even when the inner error carries args', () => {
    const withArgs = SUBJECT_FULL.replace(SUBJECT_FULL, '0xabcdef01')
      + utils.defaultAbiCoder.encode(['uint256'], [7]).slice(2);
    const f = decodeExecutorCallFailure(callFailed(0, withArgs));
    expect(f.message).toContain('0xabcdef01');
    expect(shortSelector(withArgs)).toBe('0xabcdef01');
  });

  it('does not GUESS out-of-gas when the wrapper itself would not decode', () => {
    // A bare selector with no args: we know which wrapper fired and nothing else. Claiming
    // "ran out of gas" here would send the member chasing a gas limit that was never the problem.
    const f = decodeExecutorCallFailure(EXECUTOR_CALL_FAILED_SELECTOR);
    expect(f.innerData).toBeNull();
    expect(f.message).toBe(messageForErrorName('CallFailed'));
    expect(f.message).not.toContain('gas');
  });

  it('returns null for anything that is not a CallFailed blob', () => {
    expect(decodeExecutorCallFailure(TARGET_NOT_ALLOWED)).toBeNull();
    expect(decodeExecutorCallFailure('0x')).toBeNull();
    expect(decodeExecutorCallFailure(null)).toBeNull();
  });

  it('does not recurse forever on a nested executor batch', () => {
    const nested = callFailed(0, callFailed(1, callFailed(2, callFailed(3, TARGET_NOT_ALLOWED))));
    expect(() => decodeExecutorCallFailure(nested)).not.toThrow();
    expect(decodeExecutorCallFailure(nested).index).toBe(0);
  });
});

describe('decodeRevertData routes CallFailed to the inner error', () => {
  it('prefers the inner cause over the generic wrapper copy', () => {
    const d = decodeRevertData(callFailed(0, TARGET_NOT_ALLOWED));
    expect(d.name).toBe('CallFailed');
    expect(d.reason).toBe('CallFailed: TargetNotAllowed');
    expect(d.message).toContain('voting allowlist');
    expect(d.callFailure.index).toBe(0);
  });

  it('wins over an Interface that also declares CallFailed', () => {
    // Every voting ABI declares CallFailed, so an Interface-first decode would resolve the wrapper
    // and throw the cause away. This is the regression that guards the ordering.
    const iface = new utils.Interface(['error CallFailed(uint256 index, bytes lowLevelData)']);
    const d = decodeRevertData(callFailed(1, TARGET_NOT_ALLOWED), iface);
    expect(d.message).toContain('voting allowlist');
    expect(d.message).toContain('Action 2');
  });

  it('reaches the tx-error surface through parseError', () => {
    const err = new Error('execution reverted');
    err.code = 'CALL_EXCEPTION';
    err.data = callFailed(0, TARGET_NOT_ALLOWED);
    const parsed = parseError(err);
    expect(parsed.category).toBe(Web3ErrorCategory.CONTRACT_REVERT);
    expect(parsed.userMessage).toContain('voting allowlist');
  });
});

describe('describeExecutionFailure — the finalize / completed-poll surface', () => {
  it('turns the raw ProposalExecutionFailed reason into one sentence', () => {
    expect(describeExecutionFailure(callFailed(0, TARGET_NOT_ALLOWED)))
      .toContain('Action 1 in this proposal failed');
  });

  it('reads an empty reason as the swallowed out-of-gas', () => {
    expect(describeExecutionFailure('0x')).toContain('ran out of gas');
  });

  it('never leaks raw bytes — an unknown blob degrades to its selector', () => {
    const out = describeExecutionFailure('0xdeadbeef' + '00'.repeat(32));
    expect(out).toContain('0xdeadbeef');
    expect(out).not.toContain('00000000000000');
  });

  it('says nothing when there is nothing to say, so callers keep their copy', () => {
    expect(describeExecutionFailure(null)).toBeNull();
    expect(describeExecutionFailure('')).toBeNull();
    expect(describeExecutionFailure(undefined)).toBeNull();
  });
});
