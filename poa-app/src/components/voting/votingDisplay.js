/**
 * votingDisplay — shared pure display helpers for the Wave-2 voting surfaces.
 *
 * Kept framework-light (no JSX) so ProposalCard, PollDetail, VoteCelebration,
 * and the board lanes all derive the same lifecycle + turnout numbers instead
 * of each re-deriving them slightly differently.
 */

/**
 * Lifecycle variant for a transformed proposal, matching the ProposalCard /
 * board-lane taxonomy.
 * @returns {'live-unvoted'|'live-voted'|'closing-soon'|'awaiting-finalize'|'completed'}
 */
export function lifecycleVariant(p) {
  if (!p) return 'completed';
  if (!p.isOngoing) return 'completed';
  // Active but the voting window has elapsed → needs counting.
  if (p.isExpired) return 'awaiting-finalize';
  const nowSec = Math.floor(Date.now() / 1000);
  const end = parseInt(p.endTimestamp, 10) || 0;
  const closingSoon = end - nowSec <= 24 * 3600;
  if (closingSoon) return 'closing-soon';
  return p.userHasVoted ? 'live-voted' : 'live-unvoted';
}

/**
 * Turnout inputs for a proposal. `poMembers` is the org member count fallback
 * used as the eligible denominator when the poll is unrestricted (there is no
 * cheap exact eligible count for the general case; restricted polls still fall
 * back to members, flagged approximate so copy reads "members").
 */
export function turnoutInputs(p, poMembers = 0) {
  const voted = distinctVoters(p);
  const eligible = poMembers || 0;
  return {
    voted,
    eligible,
    quorum: Number(p?.quorum) || 0,
    // We only ever have the member-count fallback for now → always approximate.
    approximate: true,
  };
}

/** Distinct voter count for a transformed proposal. */
export function distinctVoters(p) {
  return Array.isArray(p?.votes) ? p.votes.length : (Number(p?.totalVotes) || 0);
}

/**
 * The leading option (by percentage) for a transformed proposal.
 * @returns {{ option, index, percentage }|null}
 */
export function leadingOption(p) {
  const opts = p?.options || [];
  if (opts.length === 0) return null;
  let best = 0;
  for (let i = 1; i < opts.length; i++) {
    if ((opts[i].percentage || 0) > (opts[best].percentage || 0)) best = i;
  }
  return { option: opts[best], index: best, percentage: opts[best].percentage || 0 };
}

/**
 * Compact relative time to (or since) a unix-seconds timestamp.
 * e.g. "2d 4h left", "3h left", "closed 2d ago".
 */
export function relativeTime(unixSeconds, { pastPrefix = 'closed ', pastSuffix = ' ago', futureSuffix = ' left', coarse = false } = {}) {
  const end = parseInt(unixSeconds, 10) || 0;
  const nowSec = Math.floor(Date.now() / 1000);
  let diff = end - nowSec;
  const future = diff >= 0;
  diff = Math.abs(diff);

  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);

  let core;
  // coarse: single largest unit — "opened 17h ago", not "opened 17h 43m ago".
  if (d > 0) core = coarse ? `${d}d` : (h > 0 ? `${d}d ${h}h` : `${d}d`);
  else if (h > 0) core = coarse ? `${h}h` : (m > 0 ? `${h}h ${m}m` : `${h}h`);
  else if (m > 0) core = `${m}m`;
  else if (future) core = 'under 1m';
  // "just now" is already relative — no prefix/suffix ("just now ago" reads broken).
  else return 'just now';

  return future ? `${core}${futureSuffix}` : `${pastPrefix}${core}${pastSuffix}`;
}

/** Absolute short date, e.g. "Jul 12, 2026". */
export function shortDate(unixSeconds) {
  const t = parseInt(unixSeconds, 10);
  if (!t) return '';
  try {
    return new Date(t * 1000).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Normalize a hat id to a canonical decimal string (hex, decimal, or BigInt),
 * matching useVotingPower / VotePowerReceipt so set membership compares cleanly.
 */
export function normalizeHatId(id) {
  if (id === null || id === undefined) return '';
  const str = String(id).trim();
  if (!str) return '';
  try {
    return BigInt(str).toString();
  } catch {
    return str.toLowerCase();
  }
}

/**
 * Is the viewer eligible to vote on this poll?
 * Unrestricted polls → everyone eligible. Restricted → the viewer must hold at
 * least one of restrictedHatIds. `userHatIds` from UserContext userData.hatIds.
 */
export function isEligibleToVote(p, userHatIds = []) {
  const restricted = p?.restrictedHatIds || [];
  if (!p?.isHatRestricted || restricted.length === 0) return true;
  const userSet = new Set((userHatIds || []).map(normalizeHatId));
  return restricted.map(normalizeHatId).some((h) => userSet.has(h));
}

/** Amethyst / coral palette shared across the celebration + bars. */
export const VOTE_PALETTE = {
  amethyst: '#9473DC',
  amethystBright: '#B79BF0',
  amethystSoft: 'rgba(148, 115, 220, 0.16)',
  amethystBorder: 'rgba(148, 115, 220, 0.28)',
  coral: '#F2836B',
  coralSoft: 'rgba(242, 131, 107, 0.16)',
  leaderText: '#C6B4F5',
};

/**
 * Voter roster for a poll: who voted (names, no choices — social proof without
 * pressure) and, for live polls, who the group is still waiting on. Built from
 * the leaderboard member list; when the poll is role-restricted the eligible
 * set narrows to holders of the restricted hats, which also yields an EXACT
 * turnout denominator (the meters otherwise approximate with poMembers).
 *
 * Returns { voted, waiting, eligibleCount, exact }:
 *   voted        [{ address, name }] in vote order
 *   waiting      [{ address, name }] eligible members without a recorded vote
 *   eligibleCount number — exact when leaderboard data is available
 *   exact        bool — false when the leaderboard hasn't loaded (roster hidden)
 */
export function computeVoterRoster(p, leaderboardData = []) {
  const votes = p?.votes || [];
  const members = Array.isArray(leaderboardData) ? leaderboardData : [];

  const byAddress = new Map(
    members
      .filter((m) => m?.address)
      .map((m) => [String(m.address).toLowerCase(), m])
  );

  const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'unknown');

  const voted = votes.map((v) => {
    const addr = String(v.voter || '').toLowerCase();
    const member = byAddress.get(addr);
    return {
      address: addr,
      name: v.voterUsername || member?.name || shortAddr(v.voter),
    };
  });
  const votedSet = new Set(voted.map((v) => v.address));

  if (members.length === 0) {
    return { voted, waiting: [], eligibleCount: 0, exact: false };
  }

  const restricted = p?.isHatRestricted && (p?.restrictedHatIds || []).length > 0;
  const restrictedSet = restricted
    ? new Set((p.restrictedHatIds || []).map(normalizeHatId))
    : null;

  const eligibleMembers = members.filter((m) => {
    if (!restrictedSet) return true;
    return (m.hatIds || []).map(normalizeHatId).some((h) => restrictedSet.has(h));
  });

  const waiting = eligibleMembers
    .filter((m) => !votedSet.has(String(m.address).toLowerCase()))
    .map((m) => ({ address: String(m.address).toLowerCase(), name: m.name }));

  // Voters outside the eligible filter (e.g. hats revoked later) still count.
  const eligibleCount = Math.max(eligibleMembers.length, votedSet.size);

  return { voted, waiting, eligibleCount, exact: true };
}
