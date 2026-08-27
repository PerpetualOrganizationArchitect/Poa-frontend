/**
 * accessV2/ballotGate — the ballot's half of the ELECTORATE ACTIVATION GATE.
 *
 * PURE. `memberships.activationGate` already replays the contract rule (both voting modules reject
 * a voter whose membership activated AFTER the proposal was created — `VotingMath.activationOk`,
 * `since <= createdAt`). What was missing was the glue between that rule and a ballot: which of the
 * viewer's rows count as the electorate, and when the app knows enough to say anything at all.
 *
 * That glue is here rather than in the hook because there is no React harness in this repo — a
 * rule the ballot silently gets wrong is exactly the kind of thing that has to stay testable.
 *
 * THE ONE THING TO KNOW: this function is deliberately CONSERVATIVE. It reports `blocked` for
 * ONE reason — `joined-after-proposal` — and never for `not-a-member`:
 *
 *   • "not a member" / "wrong role" is already owned, in legacy-compatible copy, by
 *     `votingDisplay.voterEligibility`. Two components saying it produces two contradictory lines.
 *   • an authority whose rows have not arrived yet (or an org mid-index) reads as "no rows", and
 *     an eager gate would flash "you are not a member" at a member who is one.
 *
 * The gate can therefore only ever REMOVE a ballot that would have reverted; it can never remove
 * one that would have worked. Legacy orgs never reach it — `enabled` is false there.
 */

import { toSubjectId } from './ids';
import { activationGate, activationGateCopy } from './memberships';

/** The shape returned when there is nothing to say (also the legacy/absent-data answer). */
const SILENT = Object.freeze({
  checked: false,
  blocked: false,
  reason: null,
  activeSince: null,
  message: null,
  electorateRows: 0,
});

/**
 * Scope a viewer's membership rows to a poll's electorate.
 *
 * A restricted poll names subject ids (a migrated org adopts its hatIds VERBATIM as subject ids,
 * which is why the poll's `restrictedHatIds` can be compared directly — see
 * `normalize.normalizeAuthoritySubjects`'s legacy-shaped projection). An unrestricted poll's
 * electorate is every role the viewer holds, so every row counts.
 *
 * Ids are normalised through `toSubjectId` on both sides: the subgraph serves decimal strings and
 * a poll's restriction list can arrive as hex, BigNumber-ish or number.
 *
 * @param {Array} rows - normalised SubjectMembership rows for ONE user
 * @param {Array} restrictedSubjectIds - the poll's restriction list, or empty for an open poll
 */
export function electorateRows(rows = [], restrictedSubjectIds = []) {
  const ids = (restrictedSubjectIds || []).map(toSubjectId).filter((id) => id !== null);
  if (ids.length === 0) return rows || [];
  const wanted = new Set(ids);
  return (rows || []).filter((m) => m && wanted.has(toSubjectId(m.subjectId)));
}

/**
 * Should the ballot be withheld, and what does the member get told instead?
 *
 * @param {object} input
 * @param {boolean} input.enabled - `useOrgAuthority().enabled` — false on every legacy org
 * @param {boolean} input.loading - the memberships query is still in flight
 * @param {Array} input.rows - the viewer's normalised membership rows
 * @param {Array} [input.restrictedSubjectIds] - the poll's restriction list
 * @param {number|string} input.proposalCreatedAt - unix seconds (`Proposal.startTimestamp`, which
 *   the subgraph maps from the `created` event field — the very value the contract stores as
 *   `proposalCreatedAt[id]` and compares against)
 * @returns {{checked: boolean, blocked: boolean, reason: string|null, activeSince: number|null,
 *            message: string|null, electorateRows: number}}
 */
export function ballotActivation({
  enabled,
  loading,
  rows,
  restrictedSubjectIds = [],
  proposalCreatedAt,
} = {}) {
  if (!enabled || loading) return SILENT;

  const createdAt = Number(proposalCreatedAt || 0);
  // No creation timestamp means no gate on chain either — `activationOk` treats `createdAt == 0`
  // as the PRE-AUTHORITY SENTINEL and lets any member vote.
  if (!createdAt) return SILENT;

  const all = rows || [];
  if (all.length === 0) return SILENT;

  const scoped = electorateRows(all, restrictedSubjectIds);
  const gate = activationGate(scoped, createdAt);

  // See the header: only the timing reason is ours to report.
  if (gate.reason !== 'joined-after-proposal') {
    return { ...SILENT, checked: true, electorateRows: scoped.length };
  }

  return {
    checked: true,
    blocked: true,
    reason: gate.reason,
    activeSince: gate.activeSince,
    message: activationGateCopy(gate, createdAt),
    electorateRows: scoped.length,
  };
}

export default ballotActivation;
