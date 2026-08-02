/**
 * releaseGate — who may release a claimed task back to the pool.
 *
 * Mirrors `TaskManager.unclaimTask` (v7) exactly:
 *
 *   function unclaimTask(uint256 id) external {
 *       if (t.status != Status.CLAIMED) revert BadStatus();
 *       if (msg.sender != t.claimer) {
 *           _requireCanAssign(t.projectId);          // Unauthorized()
 *           if (!_claimExpired(t)) revert BadStatus();
 *       }
 *       ...
 *   }
 *
 * Two things about that shape drive this module:
 *
 *  1. The claimer branch has NO permission check. Not CLAIM, not anything. That
 *     is deliberate on-chain: `assignTask` never checks the assignee's mask, and
 *     hats get revoked mid-claim, so gating release on a permission bit would
 *     trap exactly the people the feature exists to free. So this gate must not
 *     consult permissions on the self-release path either — a UI that hid the
 *     button from a revoked-hat claimer would be strictly worse than the chain.
 *
 *  2. "Claim has not expired yet" reverts `BadStatus`, the SAME error as "wrong
 *     status". The chain cannot tell the user which one it was, so the gate has
 *     to be right up front rather than leaning on the revert message.
 *
 * Pure: no React, no network, no clock of its own (time is injected) — the
 * `deadlineUtils` / `wizardSteps` idiom, so the decision is unit-testable while
 * the component stays a renderer.
 */

import { isClaimExpired, nowMs } from './deadlineUtils';

/**
 * Why a release is or isn't offered. Stable strings — the UI switches copy on
 * these and the tests assert them.
 */
export const ReleaseReason = {
  /** Claimer giving their own task back. Always allowed while CLAIMED. */
  SELF_RELEASE: 'self-release',
  /** ASSIGN holder reclaiming an expired claim from someone else. */
  THIRD_PARTY_EXPIRED: 'third-party-expired',

  NO_TASK: 'no-task',
  INDEXING: 'indexing',
  /** SUBMITTED: a reviewer must reject first, or the claimer would be zeroed. */
  SUBMITTED_MUST_REJECT_FIRST: 'submitted-must-reject-first',
  NOT_CLAIMED: 'not-claimed',
  NO_ACCOUNT: 'no-account',
  NEEDS_ASSIGN: 'needs-assign',
  CLAIM_NOT_EXPIRED: 'claim-not-expired',
  /**
   * The org's subgraph predates TaskManager v7, so it carries no TaskUnclaimed
   * handler. The contract call would SUCCEED, but the indexer would never
   * reflect it: the board would keep showing the task as claimed — not just
   * until the optimistic lock lapses, but permanently — and the next click
   * would revert BadStatus against an already-UNCLAIMED task.
   *
   * This is the one condition here that is about the INDEXER rather than the
   * chain, so it is checked last and never masks a contract-shaped refusal.
   */
  INDEXER_TOO_OLD: 'indexer-too-old',
};

/**
 * A third party's clock is not the chain's clock. `isClaimExpired` reads the
 * browser clock while the contract reads `block.timestamp`, so a user running a
 * few seconds fast would see the button light up and get a bare `BadStatus`.
 * Require the claim to be expired by a whole minute before offering a takeover
 * release. Only applies to the third-party branch — self-release has no
 * deadline condition at all, so no skew to guard against.
 */
export const EXPIRY_SKEW_BUFFER_MS = 60 * 1000;

/**
 * Is `address` the task's current claimer?
 *
 * Strict address equality on both sides lowercased. Deliberately NOT
 * `isTaskMine` (taskIndicators.js), whose username fallback is looser than the
 * contract's `msg.sender == t.claimer` — that would render a Release button
 * that reverts for anyone sharing a display name with the claimer.
 */
export function isTaskClaimer(task, address) {
  if (!task || !address) return false;
  const claimer = task.claimedBy;
  if (!claimer || typeof claimer !== 'string') return false;
  return claimer.toLowerCase() === String(address).toLowerCase();
}

/**
 * Decide whether the viewer may release this task.
 *
 * @param {Object} args
 * @param {Object} args.task - board task (needs claimedBy + the deadline fields)
 * @param {string} args.columnId - 'open' | 'inProgress' | 'inReview' | 'completed' | ...
 * @param {string} args.address - viewer's wallet address (checksummed is fine)
 * @param {boolean} args.canAssign - viewer holds ASSIGN on the project (PM/exec bypass included)
 * @param {number} [nowMsValue] - injected clock (ms); defaults to deadlineUtils' nowMs()
 * @returns {{allowed: boolean, reason: string, isClaimer: boolean}}
 */
export function canReleaseTask(
  { task, columnId, address, canAssign = false, releasesIndexed = true } = {},
  nowMsValue
) {
  if (!task) return { allowed: false, reason: ReleaseReason.NO_TASK, isClaimer: false };

  const isClaimer = isTaskClaimer(task, address);

  // Optimistic/pending card: the on-chain task may not exist yet.
  if (task.isIndexing) {
    return { allowed: false, reason: ReleaseReason.INDEXING, isClaimer };
  }

  // SUBMITTED is excluded on-chain: zeroing the claimer would let completeTask
  // mint to address(0) and brick the task. Route out is rejectTask -> release.
  // Blocks the claimer too — this is not a permission problem.
  if (columnId === 'inReview') {
    return { allowed: false, reason: ReleaseReason.SUBMITTED_MUST_REJECT_FIRST, isClaimer };
  }
  if (columnId !== 'inProgress') {
    return { allowed: false, reason: ReleaseReason.NOT_CLAIMED, isClaimer };
  }
  if (!address) {
    return { allowed: false, reason: ReleaseReason.NO_ACCOUNT, isClaimer };
  }

  // Route A — the claimer, unconditionally. No permission check, by design.
  if (isClaimer) {
    return releasesIndexed
      ? { allowed: true, reason: ReleaseReason.SELF_RELEASE, isClaimer: true }
      : { allowed: false, reason: ReleaseReason.INDEXER_TOO_OLD, isClaimer: true };
  }

  // Route B — ASSIGN holder taking back an already-expired claim.
  if (!canAssign) {
    return { allowed: false, reason: ReleaseReason.NEEDS_ASSIGN, isClaimer: false };
  }
  // A task with no deadline configured never expires, so route B never opens on
  // it. That matches the contract: unstick those with updateTask (a past
  // absoluteDeadline) first.
  //
  // Resolve the clock BEFORE subtracting the buffer — passing `undefined`
  // through would make isClaimExpired fall back to its own nowMs() and skip the
  // skew guard entirely on the (default) uninjected path.
  const now = nowMsValue === undefined ? nowMs() : nowMsValue;
  if (!isClaimExpired(task, now - EXPIRY_SKEW_BUFFER_MS)) {
    return { allowed: false, reason: ReleaseReason.CLAIM_NOT_EXPIRED, isClaimer: false };
  }
  return releasesIndexed
    ? { allowed: true, reason: ReleaseReason.THIRD_PARTY_EXPIRED, isClaimer: false }
    : { allowed: false, reason: ReleaseReason.INDEXER_TOO_OLD, isClaimer: false };
}

/** Button label for an allowed release. */
export function releaseActionLabel(reason) {
  return reason === ReleaseReason.SELF_RELEASE ? 'Release task' : 'Release claim';
}

/** Confirmation copy for an allowed release. `claimerName` is display-only. */
export function releaseConfirmCopy(reason, claimerName) {
  if (reason === ReleaseReason.SELF_RELEASE) {
    return "Give this task back? It returns to Open and anyone eligible can claim it. Your work isn't submitted, and the payout stays with the task.";
  }
  const who = claimerName ? `${claimerName}'s` : 'this';
  return `Release ${who} expired claim? The task returns to Open for anyone to pick up. They keep no credit for it.`;
}

export default canReleaseTask;
