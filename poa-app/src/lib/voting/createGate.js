/**
 * createGate — WHO MAY OPEN A VOTE, folded from whichever access system this org is on.
 *
 * `useVoteCreateGate` is a thin wrapper around `foldCreateGate` for the usual reason: there is no
 * React harness in this repo, so a rule that could be WRONG lives here, where a fixture can pin it.
 *
 * ── TWO SOURCES, ONE ANSWER ───────────────────────────────────────────────────────────────────
 *
 * LEGACY (`authorityEnabled === false`) — unchanged, and deliberately so. The creator hats are the
 * subgraph's HatPermission rows (POContext `votingHatPermissions`), intersected with the viewer's
 * `userData.hatIds`. Every branch below the `if (!authorityEnabled)` line is a byte-for-byte
 * transcription of the hook as it shipped, including its fail-open hedge; `createGate.test.js`
 * pins that parity.
 *
 * ACCESS V2 (`authorityEnabled === true`) — the HatPermission table is FROZEN at cutover. A
 * permission granted or revoked through the MembershipAuthority never writes a row there, so a
 * v2 org reading it shows a stale affordance and walks members into an `Unauthorized()` revert.
 * The authority is the only honest source, and it is already on the wire for these pages.
 *
 * The v2 rule replays the contract exactly:
 *
 *     HybridVoting.createProposal        -> authority.hasPerm(user, HV_CREATE, ctx0)
 *     DirectDemocracyVoting.createProposal -> authority.hasPerm(user, DD_CREATE, ctx0)
 *
 * and `_hasPerm` folds the key over every subject the caller is an ACTIVE member of. So:
 *
 *     canCreateProposal = the viewer is an active member of some subject whose EFFECTIVE
 *                         HV_CREATE at the GLOBAL ctx is non-zero.
 *
 * "Effective" is the load-bearing word. `normalize.foldGroupPerms` has already folded each role's
 * GROUPS into its own `permEffective(key)` — which is the whole point of groups (park the
 * permission on a group, put roles in it). That makes the group case fall out for free: the viewer
 * holds no membership row for a group (group membership is DERIVED on chain from its member
 * roles), but every role inside a group that carries HV_CREATE reports `permEffective(HV_CREATE)`
 * non-zero, and the viewer does hold a row for the role.
 *
 * NOTE the v2 branch does NOT `&& hasMemberRole`. `hasMemberRole` is the LEGACY membership flag
 * from UserContext; on a v2 org it is frozen the same way the hat table is, so anding it in would
 * re-import the exact staleness this change exists to remove. Active membership of a
 * permission-carrying subject IS the contract's membership test.
 *
 * ── THE FAIL-OPEN HEDGE ───────────────────────────────────────────────────────────────────────
 *
 * Legacy fails OPEN (falls back to plain membership) while the org query is in flight or when it
 * returns no creator rows, so a subgraph hiccup can never lock out a real creator — the contract
 * stays the enforcement point. The v2 branch MIRRORS that hedge, on the same two conditions:
 *
 *     v2Loading                -> the subjects/memberships reads have not answered yet
 *     subjects.length === 0    -> they answered with nothing, which on an enabled authority means
 *                                 a failed or unindexed read, never a real org shape (an authority
 *                                 always has at least the subjects it adopted at cutover)
 *
 * Both are the "no data" case, and both resolve to `hasMemberRole`. Once subjects are in hand the
 * gate is a real answer and an EMPTY creator set fails CLOSED, matching the contract (no subject
 * carries the key -> only the executor, i.e. a passed vote, can create).
 *
 * As on legacy, that hedge is the OPPOSITE of the contract's rule, so copy built on the returned
 * arrays must consult `creatorGateSettled` / `*ReadFailed` and state the contract's rule rather
 * than inherit the hedge. See `voteOpenRights.js`.
 */

import { PERM_KEYS } from '@/lib/accessV2/permKeys';
import { toSubjectId } from '@/lib/accessV2/ids';
import { userWearsAnyHat } from '@/util/permissions';

/** Which access system produced the answer — for surfaces that must describe the source. */
export const CREATE_GATE_SOURCE = {
  LEGACY: 'legacy',
  AUTHORITY: 'authority',
};

/**
 * Does this subject carry `key` at the GLOBAL ctx, groups folded in?
 *
 * Prefers `permEffective` (own ∪ groups, from `foldGroupPerms`). Falls back to the subject's own
 * decoded global row so a caller that hands over a pre-fold subject degrades to "own rows only"
 * instead of silently answering false for everything.
 */
export function subjectHoldsPerm(subject, key) {
  if (!subject || !key) return false;
  if (typeof subject.permEffective === 'function') {
    try {
      return BigInt(subject.permEffective(key) || '0') !== 0n;
    } catch {
      return false;
    }
  }
  if (typeof subject.permGlobal === 'function') {
    const row = subject.permGlobal(key);
    return Boolean(row && row.exists && row.enabled);
  }
  return false;
}

/** Every subject (roles AND groups) whose effective global value for `key` is non-zero. */
export function subjectsHoldingPerm(subjects = [], key) {
  return (subjects || []).filter((s) => subjectHoldsPerm(s, key));
}

/** Canonical ids of a holder list. `rolesOnly` drops groups, which are never "a role" in copy. */
function holderIds(holders = [], { rolesOnly = false } = {}) {
  const out = [];
  const seen = new Set();
  for (const s of holders) {
    if (!s) continue;
    if (rolesOnly && s.isGroup) continue;
    const id = toSubjectId(s.subjectId);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * The whole gate, as a pure fold.
 *
 * @param {object} input
 * @param {boolean} input.authorityEnabled - `useOrgAuthority().enabled`. FALSE means the output
 *   must be identical to the pre-access-v2 hook, byte for byte.
 * @param {Array} input.subjects - normalised v2 subjects (roles AND groups) from
 *   `useAuthoritySubjects`, i.e. through `foldGroupPerms` so `permEffective` exists.
 * @param {Array<string>} input.mySubjectIds - subject ids the viewer is an ACTIVE member of
 *   (`useMyMemberships().myRoles`, which is `accepted && eligible`).
 * @param {Array<string>} input.legacyBindingCreatorHatIds - `votingHatPermissions.bindingCreators`
 * @param {Array<string>} input.legacyPollCreatorHatIds - `votingHatPermissions.pollCreators`
 * @param {Array<string>} input.userHatIds - `userData.hatIds` (legacy path only)
 * @param {boolean} input.hasMemberRole - legacy membership flag; the fail-open fallback
 * @param {boolean} input.legacyLoading - `poContextLoading`
 * @param {boolean} input.v2Loading - the v2 subject + membership reads are still in flight
 * @param {boolean} [input.legacyReadFailed] - the org query errored (`POContext.error`)
 * @param {boolean} [input.v2ReadFailed] - a v2 read errored
 * @param {boolean} input.hasHybrid - the org deployed HybridVoting (binding votes)
 * @param {boolean} input.hasPolls - the org deployed DirectDemocracyVoting (polls)
 */
export function foldCreateGate({
  authorityEnabled = false,
  subjects = [],
  mySubjectIds = [],
  legacyBindingCreatorHatIds = [],
  legacyPollCreatorHatIds = [],
  userHatIds = [],
  hasMemberRole = false,
  legacyLoading = false,
  v2Loading = false,
  legacyReadFailed = false,
  v2ReadFailed = false,
  hasHybrid = false,
  hasPolls = false,
} = {}) {
  const hasBinding = !!hasHybrid;
  const polls = !!hasPolls;
  const isMemberLegacy = !!hasMemberRole;

  if (!authorityEnabled) {
    // ── LEGACY — a transcription of the pre-v2 hook. Do not "improve" it here. ────────────────
    const bindingCreatorHatIds = legacyBindingCreatorHatIds || [];
    const pollCreatorHatIds = legacyPollCreatorHatIds || [];
    const hatIds = userHatIds || [];

    const gate = (hasContract, creatorHats) => {
      if (!hasContract) return false;
      if (legacyLoading || creatorHats.length === 0) return isMemberLegacy;
      return isMemberLegacy && userWearsAnyHat(hatIds, creatorHats);
    };

    const canCreatePoll = gate(polls, pollCreatorHatIds);
    const canCreateProposal = gate(hasBinding, bindingCreatorHatIds);

    return {
      source: CREATE_GATE_SOURCE.LEGACY,
      authorityGated: false,
      canCreatePoll,
      canCreateProposal,
      canCreateAny: canCreatePoll || canCreateProposal,
      creatorGateLoading: !!legacyLoading,
      bindingCreatorHatIds,
      pollCreatorHatIds,
      // No subject namespace on a legacy org — the hats ARE the ids these surfaces resolve.
      bindingCreatorSubjectIds: bindingCreatorHatIds,
      pollCreatorSubjectIds: pollCreatorHatIds,
      creatorGateSettled: !legacyLoading,
      bindingReadFailed: !!legacyReadFailed,
      pollReadFailed: !!legacyReadFailed,
      hasBinding,
      hasPolls: polls,
      isMember: isMemberLegacy,
    };
  }

  // ── ACCESS V2 ───────────────────────────────────────────────────────────────────────────────
  const subjectList = subjects || [];
  // Subjects can only be in hand after a completed read; "no subjects" on an enabled authority is
  // the no-data case, not an org with no roles. See the fail-open note in the header.
  // A read that ERRORED is not an answer either: the subjects query can succeed while the
  // per-user memberships query is rate-limited, and judging a real creator by an empty `mine`
  // would lock them out — the exact thing the fail-open hedge exists to prevent.
  const answered = !v2Loading && !v2ReadFailed && subjectList.length > 0;

  const mine = new Set(
    (mySubjectIds || []).map(toSubjectId).filter((id) => id !== null)
  );

  const bindingHolders = subjectsHoldingPerm(subjectList, PERM_KEYS.HV_CREATE);
  const pollHolders = subjectsHoldingPerm(subjectList, PERM_KEYS.DD_CREATE);

  const gate = (hasContract, holders) => {
    if (!hasContract) return false;
    // Fail-open hedge, mirroring legacy — but a member who joined AFTER cutover has no legacy
    // hat, so their own authority rows count as membership here too, or the hedge would lock
    // out exactly the people it exists to protect while the subjects load.
    if (!answered) return isMemberLegacy || mine.size > 0;
    return holders.some((s) => mine.has(toSubjectId(s.subjectId)));
  };

  const canCreatePoll = gate(polls, pollHolders);
  const canCreateProposal = gate(hasBinding, bindingHolders);

  return {
    source: CREATE_GATE_SOURCE.AUTHORITY,
    authorityGated: true,
    canCreatePoll,
    canCreateProposal,
    canCreateAny: canCreatePoll || canCreateProposal,
    creatorGateLoading: !!legacyLoading || !!v2Loading,
    // ROLES only: a group is not something copy can call "a role", and every role inside a
    // permission-carrying group is already in this list on its own effective value.
    bindingCreatorHatIds: answered ? holderIds(bindingHolders, { rolesOnly: true }) : [],
    pollCreatorHatIds: answered ? holderIds(pollHolders, { rolesOnly: true }) : [],
    // The full holder set, GROUPS INCLUDED — for a surface that wants to say "the Everyone group
    // carries this" rather than list the roles that inherit it.
    bindingCreatorSubjectIds: answered ? holderIds(bindingHolders) : [],
    pollCreatorSubjectIds: answered ? holderIds(pollHolders) : [],
    creatorGateSettled: !legacyLoading && answered,
    bindingReadFailed: !!legacyReadFailed || !!v2ReadFailed,
    pollReadFailed: !!legacyReadFailed || !!v2ReadFailed,
    hasBinding,
    hasPolls: polls,
    // On v2 the authority is the membership source of truth; a member who joined after cutover
    // has authority rows and may have no legacy hat at all.
    isMember: isMemberLegacy || mine.size > 0,
  };
}

export default foldCreateGate;
