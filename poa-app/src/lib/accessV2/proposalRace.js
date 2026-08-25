/**
 * accessV2/proposalRace — "is another in-flight proposal going to allocate a subject id before
 * mine executes?"
 *
 * WHY IT MATTERS: new subject ids come from a `localSeq` counter with no public getter, so
 * `predictNextSubjectIds` reconstructs the next id from the indexed subjects. If a competing
 * subject-creating proposal EXECUTES first, this batch's `createRole` gets a DIFFERENT id while
 * every downstream call in it (setSubjectDefault, addRoleToGroup, setPerm, grant/offer,
 * configureVouchAttestor) still targets the predicted one — which now names the OTHER proposal's
 * subject, which EXISTS. So every call succeeds: the permissions and the people land on the wrong
 * role, with no revert, no warning, and `announceWinner`'s try/catch hiding even that.
 *
 * DETECTING IT IS THE HARD PART. The subgraph does not index proposal calldata (`Proposal` has no
 * batch field), so "does this in-flight proposal create a subject?" cannot be read off chain state.
 * Two signals, in order:
 *
 *   1. `createsSubject` — set by the builder for a proposal created in this session. Exact.
 *   2. The proposal's `actionSummaries` — the human-readable previews `VotingService` uploads with
 *      the metadata and the subgraph DOES index (`ProposalMetadata.actionSummaries`). This is the
 *      cross-device half: it catches a proposal created by a different admin on a different
 *      machine, which is the case the warning exists for. The patterns below are matched against
 *      the builders' own first summary and pinned by tests fed from real builder output, so a copy
 *      change that breaks detection fails the suite instead of silently disarming the warning.
 *
 * PURE.
 */

/**
 * The first summary `buildCreateRoleBatch` / `buildCreateGroupBatch` emit — the only two builders
 * whose batch contains `createRole` / `createGroup`. Kept as ANCHORED patterns rather than a
 * substring search so an unrelated free-text proposal ("Create the role of treasurer in our
 * bylaws") does not permanently disable role creation with a scary warning.
 */
export const SUBJECT_CREATION_SUMMARY_PATTERNS = [
  /^create the role\b/i,
  /^create the group\b/i,
];

/** Does this human-readable action summary describe creating a subject? */
export function summaryCreatesSubject(summary) {
  const s = String(summary || '').trim();
  if (!s) return false;
  return SUBJECT_CREATION_SUMMARY_PATTERNS.some((re) => re.test(s));
}

/**
 * Does this proposal's batch allocate a subject id?
 *
 * @param {object} proposal - a builder result, or a transformed subgraph proposal
 * @returns {boolean}
 */
export function proposalCreatesSubject(proposal) {
  if (!proposal) return false;
  // An explicit flag always wins — including an explicit `false`, so a caller that KNOWS can
  // suppress a false positive from the copy match.
  if (typeof proposal.createsSubject === 'boolean') return proposal.createsSubject;
  return (proposal.actionSummaries || []).some(summaryCreatesSubject);
}

/**
 * Is this proposal settled — i.e. can it no longer execute a batch?
 *
 * Deliberately NOT just "expired": a proposal whose voting window closed but whose winner has not
 * been announced is the most dangerous of all, because `announceWinner` can run its batch at any
 * moment. Only execution (or a terminal status) retires the race.
 */
export function isSettledProposal(proposal) {
  if (!proposal) return true;
  if (proposal.executed === true || proposal.wasExecuted === true) return true;
  // Subgraph `ProposalStatus`: anything other than Active has been announced.
  if (proposal.status && proposal.status !== 'Active') return true;
  // Legacy shape from the builders' own tests.
  if (proposal.expired === true) return true;
  return false;
}

/**
 * Annotate proposals with `createsSubject` so a consumer (and the warning) can be honest about
 * WHICH proposal is competing.
 *
 * @param {Array} proposals
 * @returns {Array} same rows, each with a resolved boolean `createsSubject`
 */
export function withSubjectCreationFlags(proposals = []) {
  return (proposals || [])
    .filter(Boolean)
    .map((p) => ({ ...p, createsSubject: proposalCreatesSubject(p) }));
}

/** The competing proposals themselves — for copy that can name them. */
export function competingSubjectCreations(proposals = []) {
  return (proposals || []).filter((p) => proposalCreatesSubject(p) && !isSettledProposal(p));
}
