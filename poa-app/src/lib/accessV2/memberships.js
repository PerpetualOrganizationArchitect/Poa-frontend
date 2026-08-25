/**
 * accessV2/memberships — normalisers over `SubjectMembership` (the FOLD MIRROR).
 *
 * PURE. The subgraph recomputes `eligible` / `eligibilitySource` / `isMember` / `claimable`
 * in-mapping on every relevant event, mirroring the contract's `_eligibleRole` fold EXACTLY:
 *
 *     explicit Ban -> false
 *     explicit Grant -> true
 *     emailVerified -> true
 *     vouch quorum met -> true
 *     else the subject default
 *
 * That is what lets the app answer "is X a member" and "what can X claim" with ZERO eth_calls,
 * including across the event-lag window (a vouch epoch reset or a default flip emits only a
 * config event on chain; the mapping re-folds every accepted row itself).
 *
 * MEMBERSHIP = accepted && eligible. There is no third stored thing — in particular a pending
 * delegated action is MACHINERY, never a membership condition.
 */

import { toSubjectId } from './ids';
import { isOpen as isOpenPendingAction } from './pendingActions';

/** Mirrors the subgraph `EligibilitySource` enum (evaluation ORDER). */
export const ELIGIBILITY_SOURCE = {
  NONE: 'None',
  EXPLICIT_BAN: 'ExplicitBan',
  EXPLICIT_GRANT: 'ExplicitGrant',
  EMAIL_VERIFIED: 'EmailVerified',
  VOUCH_QUORUM: 'VouchQuorum',
  SUBJECT_DEFAULT: 'SubjectDefault',
};

/**
 * WHY a seat is claimable / a membership stands — the badge + the sentence next to it.
 * Copy is composed from CONTRACT DATA, never guessed: a member held by a sticky governance grant
 * reads differently from one held by an open role, and the removal flow depends on the difference.
 */
export const ELIGIBILITY_COPY = {
  [ELIGIBILITY_SOURCE.EXPLICIT_GRANT]: {
    badge: 'Invited',
    why: 'You were granted this role by a vote.',
    memberWhy: 'Holds this role by an explicit grant.',
  },
  [ELIGIBILITY_SOURCE.EMAIL_VERIFIED]: {
    badge: 'Email verified',
    why: 'Your verified email address qualifies you for this role.',
    memberWhy: 'Qualifies through a verified email address.',
  },
  [ELIGIBILITY_SOURCE.VOUCH_QUORUM]: {
    badge: 'Vouched for',
    why: 'Enough members have vouched for you.',
    memberWhy: 'Qualifies through member vouches.',
  },
  [ELIGIBILITY_SOURCE.SUBJECT_DEFAULT]: {
    badge: 'Open role',
    why: 'This role is open to everyone in the org.',
    memberWhy: 'This role is open to everyone in the org.',
  },
  [ELIGIBILITY_SOURCE.EXPLICIT_BAN]: {
    badge: 'Blocked',
    why: 'You have been blocked from this role.',
    memberWhy: 'Blocked from this role.',
  },
  [ELIGIBILITY_SOURCE.NONE]: {
    badge: 'Not eligible',
    why: 'You do not currently qualify for this role.',
    memberWhy: 'Does not currently qualify.',
  },
};

export function eligibilityCopy(source) {
  return ELIGIBILITY_COPY[source] || ELIGIBILITY_COPY[ELIGIBILITY_SOURCE.NONE];
}

/**
 * Normalise one SubjectMembership row.
 * @param {object} raw
 * @returns {object|null}
 */
export function normalizeMembership(raw) {
  if (!raw) return null;
  const subjectId = toSubjectId(raw.subject?.subjectId ?? raw.subject?.id ?? raw.subjectId);
  if (subjectId === null) return null;
  const source = raw.eligibilitySource || ELIGIBILITY_SOURCE.NONE;

  return {
    id: raw.id || `${subjectId}-${String(raw.user || '').toLowerCase()}`,
    subjectId,
    subject: raw.subject || null,
    subjectName: raw.subject?.name || '',
    user: String(raw.user || '').toLowerCase(),
    username: raw.userUsername || raw.userEntity?.username || null,

    accepted: Boolean(raw.accepted),
    acceptedAt: raw.acceptedAt ? Number(raw.acceptedAt) : null,
    // Seeds applied while the authority was paused are BACKDATED on chain to acceptedAt = 1 so
    // in-flight proposals stay votable; the event carries no timestamp, so the flag is the only
    // honest signal and the UI must not render "joined 1 Jan 1970".
    seededWhilePaused: Boolean(raw.seededWhilePaused),

    eligible: Boolean(raw.eligible),
    eligibilitySource: source,
    isMember: Boolean(raw.isMember),
    claimable: Boolean(raw.claimable),

    ruleKind: raw.ruleKind || 'None',
    rule: raw.rule || null,
    emailVerified: Boolean(raw.emailVerified),
    vouchCount: Number(raw.vouchCount ?? 0),
    vouchMet: Boolean(raw.vouchMet),
    vouchEpoch: raw.vouchEpoch ? String(raw.vouchEpoch) : '0',
    pendingAction: raw.pendingAction || null,

    // ── legacy-compatible projection ─────────────────────────────────────────────────────────
    hatId: subjectId,
    wearing: Boolean(raw.isMember),
  };
}

export function normalizeMemberships(rows = []) {
  return (rows || []).map(normalizeMembership).filter(Boolean);
}

/** Rows where the user IS a member (accepted && eligible). */
export function activeMemberships(rows = []) {
  return (rows || []).filter((m) => m && m.isMember);
}

/**
 * CLAIMABLE seats — `!accepted && eligible`. This is the claimable-roles panel's whole data
 * source, and it deliberately includes:
 *   • a live offer (an explicit grant written for an out-of-org user),
 *   • an open (default-ALLOW) role nobody has claimed yet,
 *   • a vouch quorum that just tipped over,
 *   • an email verification that just landed,
 *   • a RENOUNCED-but-sticky seat held in reserve — a documented state, not a leak.
 *
 * Each row carries WHY, from `eligibilitySource`.
 */
export function claimableMemberships(rows = []) {
  return (rows || [])
    .filter((m) => m && m.claimable)
    .map((m) => ({ ...m, ...eligibilityCopy(m.eligibilitySource) }));
}

/**
 * Was this seat previously held and then resigned, but is still claimable?
 * A STICKY governance grant (delegable = false) SURVIVES renounce: the seat is held in reserve and
 * may be re-claimed until governance clears the rule.
 *
 * RULE-BASED, NOT HISTORY-BASED, and that is the whole point. This is a client-side mirror of the
 * contract's `RenouncedClaimable` preflight (MembershipAuthority.canClaim):
 *
 *     pid == 0 && rule.kind == Grant && rule.author == Governance && !rule.delegable
 *
 * — i.e. no OPEN pending entry, plus exactly the three flags the subgraph folds into
 * `AccessRule.sticky` (membership-authority.ts: `sticky = kind == "Grant" && author ==
 * "Governance" && !delegable`).
 *
 * It deliberately does NOT test `acceptedAt`. Renounce runs `_flipOff`, which zeroes acceptedAt on
 * chain, and the mapping mirrors that by setting `membership.acceptedAt = null` on the burn — so
 * every row this state describes arrives with acceptedAt null, and an acceptedAt test makes the
 * state permanently unreachable. (It was, until 2026-08: the badge and the "the seat is still
 * yours" copy never rendered, and a resignation was mis-described as a fresh invitation.)
 *
 * @param {object} membership - a normalised row, with its rule attached
 */
export function isHeldInReserve(membership) {
  if (!membership || !membership.claimable) return false;
  if (!membership.rule || !membership.rule.sticky) return false;
  // An open pending entry means the seat is mid-ceremony (a delegated offer/grant in its review
  // window), not held in reserve — the countdown copy owns that row. Mirrors `pid == 0`.
  if (isOpenPendingAction(membership.pendingAction)) return false;
  return true;
}

/**
 * ELECTORATE ACTIVATION GATE (§4) — both voting modules reject voters whose membership activated
 * AFTER the proposal was created. Replayed client-side so the ballot can explain itself instead of
 * reverting.
 *
 * When a user qualifies through several roles, the EARLIEST activation governs.
 *
 * @param {Array} memberships - normalised rows (any subset; caller scopes them to the electorate)
 * @param {number} proposalCreatedAt - unix seconds
 * @returns {{ canVote: boolean, activeSince: number|null, reason: string|null }}
 */
export function activationGate(memberships = [], proposalCreatedAt) {
  const created = Number(proposalCreatedAt || 0);
  let earliest = null;
  for (const m of memberships || []) {
    if (!m || !m.isMember || !m.acceptedAt) continue;
    if (earliest === null || m.acceptedAt < earliest) earliest = m.acceptedAt;
  }
  if (earliest === null) {
    return { canVote: false, activeSince: null, reason: 'not-a-member' };
  }
  if (!created) return { canVote: true, activeSince: earliest, reason: null };
  if (earliest <= created) return { canVote: true, activeSince: earliest, reason: null };
  return { canVote: false, activeSince: earliest, reason: 'joined-after-proposal' };
}

/**
 * The copy for the activation gate. This is a DOCUMENTED BEHAVIOUR CHANGE from v1 (where a
 * mid-proposal joiner could vote), so it has to read as policy, not as a bug.
 */
export function activationGateCopy(gate, proposalCreatedAt) {
  if (!gate || gate.canVote) return null;
  if (gate.reason === 'not-a-member') return 'You are not a member of the roles that can vote here.';
  const when = proposalCreatedAt
    ? new Date(Number(proposalCreatedAt) * 1000).toLocaleDateString()
    : 'this proposal was created';
  return `You joined after this proposal was created — you can vote on proposals created after ${when}.`;
}

/** Group rows by subject id. */
export function groupBySubject(rows = []) {
  const map = new Map();
  for (const m of rows || []) {
    if (!m) continue;
    if (!map.has(m.subjectId)) map.set(m.subjectId, []);
    map.get(m.subjectId).push(m);
  }
  return map;
}
