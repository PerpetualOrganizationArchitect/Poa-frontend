/**
 * votingIntro — when to nudge a member toward the "How Blended voting works"
 * explainer, and what to say.
 *
 * Product direction (Hudson): the voting page must NOT auto-expand the full
 * explainer on a first visit — it buried the board under an essay nobody asked
 * for. Instead the page always opens on the one-line GovernanceStrip and a small
 * coach-mark points at it on the visits where a member is most likely to want it.
 *
 * Schedule: visit 1 (they have never seen this page) and visit 3 (they keep
 * coming back and still haven't looked). Two touches, then it retires forever —
 * a nudge on every visit is an ad, not an explanation.
 *
 * A "visit" is one browser session, not one React mount. Bouncing
 * Votes → Tasks → Votes three times in ninety seconds is one visit; otherwise a
 * member burns both touches before lunch and the visit-3 line ("you've been by a
 * few times") is a lie. SESSION_KEY lives in sessionStorage, which is exactly
 * per-tab-lifetime; the counter itself is localStorage and permanent.
 *
 * Retirement is also earned: opening the explainer at ANY point (from the nudge
 * or by clicking the strip yourself) marks the intro done, so someone who found
 * it on visit 1 is never nudged again. Dismissing the visit-1 nudge only defers
 * — the visit-3 reminder still fires — but dismissing the visit-3 reminder is
 * the end of it.
 *
 * Pure module (no React, no window) so the schedule is unit-testable; the
 * storage IO and timing live in `useVotingIntro`.
 */

/** Visit counter, per org. */
export const VISITS_KEY = (orgId) => `poa:votingVisits:${orgId}`;

/** "This member has met the explainer" flag, per org. Set = never nudge again. */
export const INTRO_DONE_KEY = (orgId) => `poa:votingIntroDone:${orgId}`;

/** sessionStorage marker: this browser session already counted a visit. */
export const SESSION_KEY = (orgId) => `poa:votingVisitSession:${orgId}`;

/**
 * Nudge variant shown on each scheduled visit (1-indexed). SINGLE source of
 * truth for the schedule — NUDGE_VISITS is derived, so adding a third touch here
 * automatically moves which one is final.
 */
const VARIANT_BY_VISIT = { 1: 'first', 3: 'reminder' };

/** Visits that get a nudge, ascending. The LAST one retires the intro. */
export const NUDGE_VISITS = Object.keys(VARIANT_BY_VISIT)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * Advance the visit counter and decide whether this visit gets a nudge.
 *
 * @param {{ visits?: number, introDone?: boolean }} stored — parsed localStorage
 * @returns {{ visits: number, introDone: boolean, nudge: 'first'|'reminder'|null }}
 */
export function recordVisit(stored = {}) {
  const prior = Number(stored.visits);
  const visits = (Number.isFinite(prior) && prior > 0 ? Math.floor(prior) : 0) + 1;
  const introDone = !!stored.introDone;

  // Already met the explainer — count the visit, say nothing.
  if (introDone) return { visits, introDone: true, nudge: null };

  return { visits, introDone: false, nudge: VARIANT_BY_VISIT[visits] || null };
}

/**
 * Is this the last scheduled nudge? Dismissing it retires the intro, so a
 * member who ignores it twice is never asked a third time.
 */
export function isFinalNudge(variant) {
  return variant === VARIANT_BY_VISIT[NUDGE_VISITS[NUDGE_VISITS.length - 1]];
}

/**
 * Coach-mark copy. Short, concrete, and about the member's own power — the
 * strip itself already shows the numbers, this only says why they matter.
 */
export const NUDGE_COPY = {
  first: {
    title: 'How much say do you have?',
    body:
      'This group blends two kinds of power: an equal vote for every member, plus weight earned by contributing. Open this bar to see how the split works — and how to grow your share.',
    cta: 'Show me',
    dismiss: 'Later',
  },
  reminder: {
    title: 'Still worth a look',
    body:
      'You’ve been by a few times. One click on this bar explains where your voting power comes from, and what changes it.',
    cta: 'Show me',
    dismiss: 'Got it',
  },
};
