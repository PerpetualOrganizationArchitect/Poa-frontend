/** Current authority creator permissions; incomplete reads fail closed. */
import { PERM_KEYS } from '@/lib/accessV2/permKeys';
import { toSubjectId } from '@/lib/accessV2/ids';

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
    return {
      source: CREATE_GATE_SOURCE.LEGACY,
      authorityGated: false,
      canCreatePoll: false, canCreateProposal: false, canCreateAny: false,
      creatorGateLoading: !!legacyLoading,
      bindingCreatorHatIds: [], pollCreatorHatIds: [],
      bindingCreatorSubjectIds: [], pollCreatorSubjectIds: [],
      creatorGateSettled: false,
      bindingReadFailed: true, pollReadFailed: true,
      hasBinding, hasPolls: polls, isMember: false,
    };
  }

  // ── ACCESS V2 ───────────────────────────────────────────────────────────────────────────────
  const subjectList = subjects || [];
  // A failed or incomplete read cannot authorize a proposal.
  const answered = !v2Loading && !v2ReadFailed && subjectList.length > 0;

  const mine = new Set(
    (mySubjectIds || []).map(toSubjectId).filter((id) => id !== null)
  );

  const bindingHolders = subjectsHoldingPerm(subjectList, PERM_KEYS.HV_CREATE);
  const pollHolders = subjectsHoldingPerm(subjectList, PERM_KEYS.DD_CREATE);

  const gate = (hasContract, holders) => {
    if (!hasContract) return false;
    if (!answered) return false;
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
