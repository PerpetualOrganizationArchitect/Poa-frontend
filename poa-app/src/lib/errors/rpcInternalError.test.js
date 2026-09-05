import { describe, it, expect } from 'vitest';
import { parseError } from './ErrorParser';
import { Web3ErrorCategory } from './Web3Error';

// A JSON-RPC `-32603` "internal error" wrapper (MetaMask / ethers) is generic on
// the outside ("Error processing the transaction") but frequently hides the real
// revert reason in an inconsistent nested field. parseError should mine those
// fields so the user sees the actionable message instead of the opaque generic —
// while a TRULY opaque -32603 (e.g. the wrong-chain / no-code-address failure)
// still falls through to the generic message rather than inventing a reason.
describe('parseError — -32603 internal-error unwrapping', () => {
  it('surfaces a reason nested under error.error.data.message', () => {
    const err = {
      code: -32603,
      message: 'Error processing the transaction',
      error: { data: { message: 'execution reverted: Username taken' } },
    };
    const parsed = parseError(err);
    expect(parsed.category).toBe(Web3ErrorCategory.CONTRACT_REVERT);
    expect(parsed.userMessage).toMatch(/username is already taken/i);
    expect(parsed.userMessage).not.toMatch(/unexpected error/i);
  });

  it('surfaces a reason nested under data.originalError.message (MetaMask shape)', () => {
    const err = {
      code: -32603,
      message: 'Internal JSON-RPC error.',
      data: { originalError: { message: 'execution reverted: Not a member' } },
    };
    const parsed = parseError(err);
    expect(parsed.userMessage).toMatch(/member of this organization/i);
    expect(parsed.userMessage).not.toMatch(/unexpected error/i);
  });

  it('parses a reason out of an ethers error.body JSON-RPC string', () => {
    const err = {
      code: -32603,
      message: 'Error processing the transaction',
      body: JSON.stringify({ error: { code: -32000, message: 'execution reverted: Already registered' } }),
    };
    const parsed = parseError(err);
    expect(parsed.category).toBe(Web3ErrorCategory.CONTRACT_REVERT);
    expect(parsed.userMessage).toMatch(/already have an account/i);
  });

  it('keeps the generic message for a truly opaque -32603 (wrong-chain / no-code address)', () => {
    // This is the exact production shape: an EOA submit sent to a Gnosis contract
    // while the wallet was on Arbitrum. There is no revert data to recover — the
    // real fix is the chain switch, so we must NOT fabricate a contract reason.
    const err = { code: -32603, message: 'Error processing the transaction' };
    const parsed = parseError(err);
    expect(parsed.category).toBe(Web3ErrorCategory.UNKNOWN);
    expect(parsed.userMessage).toMatch(/unexpected error/i);
  });

  it('does NOT mine a revert reason from a non-(-32603) error whose text coincidentally matches a pattern', () => {
    // A rate-limit / provider error (NOT a JSON-RPC -32603) whose nested body text
    // happens to contain a REVERT_PATTERNS substring ("Not a member"). The unwrap
    // heuristic is gated on -32603, so this must stay UNKNOWN — never be surfaced
    // as a misleading "You must be a member of this organization." contract revert.
    const err = {
      code: -32005,
      message: 'daily request limit reached',
      body: JSON.stringify({
        error: { code: -32005, message: 'compute units exceeded — Not a member of the paid tier' },
      }),
    };
    const parsed = parseError(err);
    expect(parsed.category).toBe(Web3ErrorCategory.UNKNOWN);
    expect(parsed.userMessage).toMatch(/unexpected error/i);
    expect(parsed.userMessage).not.toMatch(/member of this organization/i);
  });
});
