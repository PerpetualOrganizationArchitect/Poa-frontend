import { describe, it, expect } from 'vitest';
import {
  canReleaseTask,
  isTaskClaimer,
  releaseActionLabel,
  releaseConfirmCopy,
  ReleaseReason,
  EXPIRY_SKEW_BUFFER_MS,
} from './releaseGate';

const T = 1_900_000_000; // base unix seconds
const T_MS = T * 1000;

const ME = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa';
const OTHER = '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb';

/** Claimed by `claimer`, with an enforcement deadline `offsetSec` from T. */
const claimedTask = (claimer, overrides = {}) => ({
  id: '0xtm-1',
  claimedBy: claimer,
  claimerUsername: 'alice',
  claimDeadline: String(T + 3600),
  ...overrides,
});

describe('isTaskClaimer', () => {
  it('matches case-insensitively (subgraph lowercases, wallets checksum)', () => {
    expect(isTaskClaimer(claimedTask(ME.toLowerCase()), ME)).toBe(true);
    expect(isTaskClaimer(claimedTask(ME), ME.toLowerCase())).toBe(true);
  });
  it('is false for a different address, and for missing data', () => {
    expect(isTaskClaimer(claimedTask(OTHER), ME)).toBe(false);
    expect(isTaskClaimer(claimedTask(null), ME)).toBe(false);
    expect(isTaskClaimer(null, ME)).toBe(false);
    expect(isTaskClaimer(claimedTask(ME), null)).toBe(false);
  });
});

describe('canReleaseTask — route A (the claimer)', () => {
  it('allows the claimer on an unexpired claim, with no permission at all', () => {
    const r = canReleaseTask(
      { task: claimedTask(ME), columnId: 'inProgress', address: ME, canAssign: false },
      T_MS
    );
    expect(r).toEqual({ allowed: true, reason: ReleaseReason.SELF_RELEASE, isClaimer: true });
  });

  it('still allows the claimer once the claim has expired', () => {
    const r = canReleaseTask(
      { task: claimedTask(ME), columnId: 'inProgress', address: ME },
      (T + 7200) * 1000
    );
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe(ReleaseReason.SELF_RELEASE);
  });

  it('allows a claimer whose task has no deadline configured at all', () => {
    const task = claimedTask(ME, { claimDeadline: null, absoluteDeadline: null, completionWindow: null });
    expect(canReleaseTask({ task, columnId: 'inProgress', address: ME }, T_MS).allowed).toBe(true);
  });
});

describe('canReleaseTask — route B (ASSIGN holder, expired only)', () => {
  it('blocks a third party while the claim is live', () => {
    const r = canReleaseTask(
      { task: claimedTask(OTHER), columnId: 'inProgress', address: ME, canAssign: true },
      T_MS
    );
    expect(r).toEqual({ allowed: false, reason: ReleaseReason.CLAIM_NOT_EXPIRED, isClaimer: false });
  });

  it('allows an ASSIGN holder once the claim is expired past the skew buffer', () => {
    const r = canReleaseTask(
      { task: claimedTask(OTHER), columnId: 'inProgress', address: ME, canAssign: true },
      (T + 3600) * 1000 + EXPIRY_SKEW_BUFFER_MS + 1000
    );
    expect(r).toEqual({ allowed: true, reason: ReleaseReason.THIRD_PARTY_EXPIRED, isClaimer: false });
  });

  it('holds the button back inside the clock-skew buffer', () => {
    // Deadline has technically passed, but by less than the buffer: the chain may
    // not agree yet, so offering the button would produce a bare BadStatus revert.
    const justPast = (T + 3600) * 1000 + 1000;
    const r = canReleaseTask(
      { task: claimedTask(OTHER), columnId: 'inProgress', address: ME, canAssign: true },
      justPast
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(ReleaseReason.CLAIM_NOT_EXPIRED);
  });

  it('blocks a third party without ASSIGN even when expired', () => {
    const r = canReleaseTask(
      { task: claimedTask(OTHER), columnId: 'inProgress', address: ME, canAssign: false },
      (T + 99999) * 1000
    );
    expect(r).toEqual({ allowed: false, reason: ReleaseReason.NEEDS_ASSIGN, isClaimer: false });
  });

  it('never opens on a deadline-less claim — it can never expire', () => {
    const task = claimedTask(OTHER, { claimDeadline: null, absoluteDeadline: null, completionWindow: null });
    const r = canReleaseTask(
      { task, columnId: 'inProgress', address: ME, canAssign: true },
      (T + 10 * 365 * 86400) * 1000
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(ReleaseReason.CLAIM_NOT_EXPIRED);
  });
});

describe('canReleaseTask — indexer gate (releasesIndexed)', () => {
  // The TaskUnclaimed mapping handler ships in the same subgraph release as the
  // release FIELDS. On an endpoint without it the tx succeeds but the board keeps
  // showing the task as claimed permanently, and the next click reverts BadStatus.
  it('hides self-release when the org indexer cannot see releases', () => {
    const r = canReleaseTask(
      { task: claimedTask(ME), columnId: 'inProgress', address: ME, releasesIndexed: false },
      T_MS
    );
    expect(r).toEqual({ allowed: false, reason: ReleaseReason.INDEXER_TOO_OLD, isClaimer: true });
  });

  it('hides third-party release too', () => {
    const r = canReleaseTask(
      {
        task: claimedTask(OTHER),
        columnId: 'inProgress',
        address: ME,
        canAssign: true,
        releasesIndexed: false,
      },
      (T + 99999) * 1000
    );
    expect(r).toEqual({ allowed: false, reason: ReleaseReason.INDEXER_TOO_OLD, isClaimer: false });
  });

  it('is checked LAST, so contract-shaped refusals keep their own specific reason', () => {
    // A SUBMITTED task is refused because the CONTRACT forbids it; reporting
    // "your indexer is old" there would send the user chasing the wrong problem.
    const submitted = canReleaseTask(
      { task: claimedTask(ME), columnId: 'inReview', address: ME, releasesIndexed: false },
      T_MS
    );
    expect(submitted.reason).toBe(ReleaseReason.SUBMITTED_MUST_REJECT_FIRST);

    const needsAssign = canReleaseTask(
      { task: claimedTask(OTHER), columnId: 'inProgress', address: ME, canAssign: false, releasesIndexed: false },
      (T + 99999) * 1000
    );
    expect(needsAssign.reason).toBe(ReleaseReason.NEEDS_ASSIGN);

    const notExpired = canReleaseTask(
      { task: claimedTask(OTHER), columnId: 'inProgress', address: ME, canAssign: true, releasesIndexed: false },
      T_MS
    );
    expect(notExpired.reason).toBe(ReleaseReason.CLAIM_NOT_EXPIRED);
  });

  it('defaults to indexed so the gate stays a pure contract mirror for other callers', () => {
    expect(canReleaseTask({ task: claimedTask(ME), columnId: 'inProgress', address: ME }, T_MS).allowed)
      .toBe(true);
  });
});

describe('canReleaseTask — status and input gates', () => {
  it('refuses a SUBMITTED task, even for the claimer (contract would brick it)', () => {
    const r = canReleaseTask(
      { task: claimedTask(ME), columnId: 'inReview', address: ME },
      T_MS
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(ReleaseReason.SUBMITTED_MUST_REJECT_FIRST);
  });

  it.each(['open', 'completed', 'cancelled'])('refuses a task in %s', (columnId) => {
    const r = canReleaseTask({ task: claimedTask(ME), columnId, address: ME }, T_MS);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(ReleaseReason.NOT_CLAIMED);
  });

  it('refuses an optimistic card that is still indexing', () => {
    const task = claimedTask(ME, { isIndexing: true });
    const r = canReleaseTask({ task, columnId: 'inProgress', address: ME }, T_MS);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(ReleaseReason.INDEXING);
  });

  it('refuses with no task and with no connected account', () => {
    expect(canReleaseTask({ task: null, columnId: 'inProgress', address: ME }, T_MS).reason)
      .toBe(ReleaseReason.NO_TASK);
    expect(canReleaseTask({ task: claimedTask(ME), columnId: 'inProgress', address: null }, T_MS).reason)
      .toBe(ReleaseReason.NO_ACCOUNT);
  });

  it('tolerates being called with no arguments at all', () => {
    expect(canReleaseTask().allowed).toBe(false);
  });
});

describe('copy helpers', () => {
  it('labels the two routes differently', () => {
    expect(releaseActionLabel(ReleaseReason.SELF_RELEASE)).toBe('Release task');
    expect(releaseActionLabel(ReleaseReason.THIRD_PARTY_EXPIRED)).toBe('Release claim');
  });

  it('names the claimer in third-party copy and stays generic without a name', () => {
    expect(releaseConfirmCopy(ReleaseReason.THIRD_PARTY_EXPIRED, 'alice')).toContain("alice's");
    expect(releaseConfirmCopy(ReleaseReason.THIRD_PARTY_EXPIRED, '')).toContain('this expired claim');
  });

  it('self-release copy warns the task reopens to everyone', () => {
    expect(releaseConfirmCopy(ReleaseReason.SELF_RELEASE)).toMatch(/anyone/i);
  });
});
