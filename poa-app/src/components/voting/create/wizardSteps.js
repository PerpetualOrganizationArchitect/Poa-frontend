/**
 * wizardSteps — the Create-a-Vote wizard's step machine.
 *
 * Pure: no React, no Chakra, no ethers. `CreateVoteModal` owns the `step` state
 * itself; this module owns (a) which steps exist for a given proposal type and
 * (b) where a proposal should re-enter the flow — fresh open, deep link, or
 * restored draft, all through one mechanism.
 *
 * `resolveEntryStep` takes `isComplete` as an injected dependency (supply
 * `isComplete` from `@/lib/voting/proposalChecks`) rather than importing it, so
 * the step machine stays testable on its own and the two modules stay acyclic.
 */

export const STEP_INTENT = 'intent';
export const STEP_CONFIG = 'config';
export const STEP_DETAILS = 'details';
export const STEP_REVIEW = 'review';

/**
 * Types that get their own configuration screen before the details screen.
 *
 * NOTE (deviation from the original plan): `transferFunds` is in here. Its
 * config step collects recipient + amount, which are the decisions that drive
 * its auto-filled title — so they have to be made *before* details, same as
 * every other non-`normal` type. `normal` is the only single-decision type; its
 * options live next to the title on the details screen.
 */
export const CONFIG_TYPES = new Set([
  'setter',
  'election',
  'createRole',
  'removeRoleMembers',
  'transferFunds',
]);

/**
 * Types whose passing option RUNS a batch on-chain, and therefore submit to the
 * org's Blended (HybridVoting) governance rather than the DirectDemocracy poll
 * contract. ONE definition: the intent gallery's `binding` badge, the modal's
 * creator gate + banner, and the routing predicate all derive from it.
 *
 * `transferFunds` belongs here. It always carried a batch, but it used to be
 * routed to DirectDemocracy — whose target allow-list is empty on every org we
 * deploy, so `createProposal` reverted `TargetNotAllowed` after the member had
 * walked the whole wizard. HybridVoting has no allow-list by design (#74), and
 * the Executor accepts HybridVoting as its ONLY caller, so a batch-carrying
 * proposal can only ever execute from there.
 */
export const BINDING_TYPES = new Set([
  'election',
  'createRole',
  'setter',
  'transferFunds',
  'removeRoleMembers',
]);

export function isBindingType(type) {
  return BINDING_TYPES.has(type);
}

/**
 * Binding and voter restriction are separate decisions. Treasury payouts execute through
 * HybridVoting but deliberately keep their role-restriction picker; governance/election actions
 * (including role removal) are always decided by the full Blended-voting electorate.
 */
export const RESTRICTION_DISABLED_TYPES = new Set([
  'election',
  'createRole',
  'setter',
  'removeRoleMembers',
]);

export function supportsVotingRestrictions(type) {
  return !RESTRICTION_DISABLED_TYPES.has(type);
}

/**
 * Which contract a built proposal submits to. Decided by the BATCH, not the
 * type name: anything that would run a call if it passed goes to Blended
 * voting; a batch-less poll goes to DirectDemocracy.
 *
 * @param {Array<Array>} batches - per-option call lists from buildProposalData
 * @returns {'hybrid'|'dd'}
 */
export function votingLaneForBatches(batches) {
  const executes = (batches || []).some((b) => Array.isArray(b) && b.length > 0);
  return executes ? 'hybrid' : 'dd';
}

/**
 * The ordered step list for a proposal type.
 *   normal                                   → intent → details → review
 *   all binding/action types                → intent → config → details → review
 * An empty/unknown type has only the intent step — there is nothing to configure
 * or describe yet.
 */
export function stepsForType(type) {
  const steps = [STEP_INTENT];
  if (CONFIG_TYPES.has(type)) steps.push(STEP_CONFIG);
  if (type) steps.push(STEP_DETAILS, STEP_REVIEW);
  return steps;
}

/**
 * The step this proposal should open on: the first step that is not yet
 * complete, clamped to the last step when everything is done.
 *
 * One walk covers every entry path — a pristine form stops at `intent` (the
 * gallery), a deep-linked setter payload stops at `details`, a half-built
 * election draft stops back on its candidate list.
 *
 * @param {object} proposal
 * @param {{ isComplete: (step: string, proposal: object) => boolean }} deps
 */
export function resolveEntryStep(proposal, { isComplete }) {
  // Role-removal rows are snapshots of a live roster. A restored draft or deep link must mount
  // its configurator once so renamed roles, departed members, and newly-required bans are shown
  // before the member reviews the ballot, even when every persisted field looked complete.
  if (proposal?.type === 'removeRoleMembers') return STEP_CONFIG;
  const steps = stepsForType(proposal?.type);
  for (let i = 0; i < steps.length - 1; i++) {
    if (!isComplete(steps[i], proposal)) return steps[i];
  }
  return steps[steps.length - 1];
}

/**
 * Which `fieldErrors` keys each step is allowed to surface, so the primary CTA
 * can only ever complain about something on screen.
 *
 * `config` is normally driven by `configError()` instead; the transfer keys are
 * listed against it because `transferFunds` edits those two fields there.
 * `review` is the final catch-all and repeats every key (callers should also OR
 * in `configError`, since the config step's own gate is not key-based).
 */
export const STEP_ERROR_KEYS = {
  [STEP_INTENT]: [],
  [STEP_CONFIG]: ['transferAddress', 'transferAmount'],
  [STEP_DETAILS]: ['name', 'time', 'options', 'restrictedHatIds'],
  [STEP_REVIEW]: ['name', 'time', 'options', 'transferAddress', 'transferAmount', 'restrictedHatIds'],
};
