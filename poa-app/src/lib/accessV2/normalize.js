/**
 * accessV2/normalize — the subgraph-response -> view-model transforms the hooks run.
 *
 * PURE, and deliberately so: React-coupled code has no unit harness in this repo, so anything a
 * hook does that could be WRONG lives here instead, where a fixture from the real schema can pin
 * it. The hooks are left as thin `useQuery` + `useMemo(() => normalizeX(data))` wrappers.
 */

import {
  normalizeSubjects,
  attachGroups,
  splitSubjects,
  subjectNameMap,
  indexGroupCompositions,
  deriveGroupMembers,
} from './subjects';
import {
  normalizeMembership,
  activeMemberships,
  claimableMemberships,
  groupBySubject,
} from './memberships';
import { normalizeRule, RULE_KIND } from './rules';
import { normalizeVouchConfig } from './vouch';
import { normalizeManagerConfig } from './pendingActions';
import { decodePermWord, permKeyName, isGlobalCtx, foldTag, FOLD_TAG, PERM_KEYS } from './permKeys';
import { toSubjectId } from './ids';

/** Decode a subject's perm rows and derive the legacy-compatible flags from them. */
export function attachPerms(subject, rawPerms = []) {
  const rows = (rawPerms || []).map((p) => ({
    id: p.id,
    permKey: p.permKey,
    keyName: permKeyName(p.permKey),
    ctx: p.ctx,
    isGlobalCtx: p.isGlobalCtx !== undefined ? Boolean(p.isGlobalCtx) : isGlobalCtx(p.ctx),
    foldTag: Number(p.foldTag ?? 0),
    ...decodePermWord(p.word),
  }));

  const byKey = {};
  for (const r of rows) {
    if (!r.exists) continue;
    const k = String(r.permKey).toLowerCase();
    (byKey[k] || (byKey[k] = [])).push(r);
  }
  const globalOf = (key) => (byKey[String(key).toLowerCase()] || []).find((r) => r.isGlobalCtx) || null;

  return {
    ...subject,
    permRows: rows,
    permsByKey: byKey,
    permGlobal: globalOf,
    // OWN rows only — what this subject itself carries. The flags every legacy consumer reads are
    // the EFFECTIVE ones (own ∪ groups), computed by foldGroupPerms below; these stay as the
    // "where does it come from" answer the admin surfaces need.
    ownCanVote: Boolean(globalOf(PERM_KEYS.DD_VOTE)?.enabled),
    ownCanCreateVote: Boolean(
      globalOf(PERM_KEYS.DD_CREATE)?.enabled || globalOf(PERM_KEYS.HV_CREATE)?.enabled
    ),
    ownTaskMask: globalOf(PERM_KEYS.TM_PERMS)?.value ?? '0',
    // Legacy-compatible: `canVote` is the flag every pre-v2 roster/label consumer reads. Seeded
    // from own rows so a caller that skips the fold still gets a defined (if incomplete) value.
    canVote: Boolean(globalOf(PERM_KEYS.DD_VOTE)?.enabled),
    canCreateVote: Boolean(
      globalOf(PERM_KEYS.DD_CREATE)?.enabled || globalOf(PERM_KEYS.HV_CREATE)?.enabled
    ),
    taskMask: globalOf(PERM_KEYS.TM_PERMS)?.value ?? '0',
  };
}

/**
 * Fold ONE permission key over a set of holding subjects, the way the contract does.
 *
 * `_hasPerm` (MembershipAuthorityLogic:1048) walks `subjectsWithKeyList[key][ctx]` and folds every
 * subject the user is a member of — GROUPS INCLUDED, because `_isMember` on a group resolves
 * through its member roles. `_fold` (:1094) is OR for a TAG_OR_MASK key and "first non-zero" for a
 * bool-any key, which for booleans is the same as "any".
 *
 * @param {string} key - permKey (its top byte selects the fold)
 * @param {Array} holders - subjects with an attached `permGlobal`
 * @returns {{ value: string, sources: string[] }} sources = subjectIds that actually contribute
 */
export function foldPermKey(key, holders = [], ctx = null) {
  const orMask = foldTag(key) === FOLD_TAG.OR_MASK;
  let acc = 0n;
  const sources = [];

  for (const h of holders) {
    if (!h || typeof h.permGlobal !== 'function') continue;
    const global = h.permGlobal(key);
    const local = ctx && !isGlobalCtx(ctx)
      ? (h.permRows || []).find(row => row.exists && String(row.permKey).toLowerCase() === String(key).toLowerCase() && String(row.ctx).toLowerCase() === String(ctx).toLowerCase())
      : null;
    // A present zero project row suppresses global permissions unless INHERIT_GLOBAL is set.
    const row = local || global;
    if (!row || !row.exists) continue;
    let v;
    try {
      v = BigInt(row.value);
      if (local?.inheritGlobal && global?.exists) {
        const g = BigInt(global.value);
        v = orMask ? v | g : (g !== 0n ? g : v);
      }
    } catch {
      continue;
    }
    if (v === 0n) continue;
    sources.push(h.subjectId);
    acc = orMask ? acc | v : (acc !== 0n ? acc : v);
  }

  return { value: acc.toString(), sources };
}

/**
 * Fold each role's GROUP permissions into its legacy-compatible projection.
 *
 * The whole point of groups is that a role in a group inherits the group's permissions — on chain
 * the voter gate is `activeMemberSince(user, DD_VOTE, ctx0)`, which iterates group subjects too.
 * A projection built from a role's OWN rows therefore reports `canVote: false` / `taskMask: '0'`
 * for exactly the org shape v2 is designed around (permissions parked on a group, roles put into
 * it), while its members vote perfectly well on chain.
 *
 * Groups are unchanged: a group's own rows ARE its permissions, and a group cannot be inside a
 * group (`addRoleToGroup` takes roles), so the fold is one level deep.
 *
 * @param {Array} subjects - subjects that have been through attachGroups AND attachPerms
 * @returns {Array} new subjects; roles carry effective flags plus `permSources(key)`
 */
export function foldGroupPerms(subjects = []) {
  const list = (subjects || []).filter(Boolean);
  const byId = new Map(list.map((s) => [s.subjectId, s]));

  const folded = list.map((s) => {
    const groups = s.isGroup ? [] : (s.groupIds || []).map((id) => byId.get(id)).filter(Boolean);
    const holders = [s, ...groups];

    const ddVote = foldPermKey(PERM_KEYS.DD_VOTE, holders);
    const ddCreate = foldPermKey(PERM_KEYS.DD_CREATE, holders);
    const hvCreate = foldPermKey(PERM_KEYS.HV_CREATE, holders);
    const tm = foldPermKey(PERM_KEYS.TM_PERMS, holders);

    return {
      ...s,
      canVote: ddVote.value !== '0',
      canCreateVote: ddCreate.value !== '0' || hvCreate.value !== '0',
      taskMask: tm.value,
      /** Which subjects (self and/or groups) actually carry a key — the "why" for a badge. */
      permSources: (key, ctx) => foldPermKey(key, holders, ctx).sources,
      /** The folded global value of any key, as a decimal string. */
      permEffective: (key, ctx) => foldPermKey(key, holders, ctx).value,
      /** True when the permission comes from a group rather than the role itself. */
      permViaGroup: (key) => foldPermKey(key, holders).sources.some((id) => id !== s.subjectId),
    };
  });

  // Re-link the both-ways wiring to the FOLDED objects. attachGroups ran before perms existed, so
  // without this `role.groups[0].canVote` is undefined and `group.memberRoles[0].taskMask` is the
  // pre-fold value — a footgun for any surface that walks the relation instead of the flat list.
  const foldedById = new Map(folded.map((s) => [s.subjectId, s]));
  for (const s of folded) {
    s.groups = (s.groupIds || []).map((id) => foldedById.get(id)).filter(Boolean);
    s.memberRoles = (s.memberRoleIds || []).map((id) => foldedById.get(id)).filter(Boolean);
  }
  return folded;
}

/**
 * The whole `useAuthoritySubjects` transform: raw `Subject` rows -> roles + groups, wired both
 * ways, with perms decoded and configs normalised.
 *
 * @param {Array} rawSubjects - `membershipAuthorityContract.subjects`
 */
export function normalizeAuthoritySubjects(rawSubjects = []) {
  const raw = rawSubjects || [];
  // Composition rows come back on BOTH sides of the relation; one flat list is enough because
  // indexGroupCompositions de-dupes, and it keeps the group derivation in one pure place.
  const compositions = raw.flatMap((s) => [...(s.memberRoles || []), ...(s.groups || [])]);

  // Keep every indexed id for subject-id prediction, including the migrated top hat. The
  // user-facing graph below excludes structural subjects before relationships are attached, so a
  // top hat cannot leak through a group's memberRoles or a role-name resolver either.
  const indexedSubjects = normalizeSubjects(raw);
  const visibleIds = new Set(
    indexedSubjects.filter((s) => s.isUserFacing).map((s) => s.subjectId)
  );
  const visibleCompositions = compositions.filter((c) => {
    const groupId = toSubjectId(c?.groupSubjectId ?? c?.group?.subjectId ?? c?.group?.id);
    const roleId = toSubjectId(c?.roleSubjectId ?? c?.role?.subjectId ?? c?.role?.id);
    return visibleIds.has(groupId) && visibleIds.has(roleId);
  });
  const withGroups = attachGroups(
    indexedSubjects.filter((s) => s.isUserFacing),
    visibleCompositions
  );
  const rawById = new Map(raw.map((s) => [toSubjectId(s.subjectId ?? s.id), s]));

  // Perms are decoded per subject first, THEN folded across the group wiring — a role's effective
  // permissions are its own ∪ its groups', which cannot be known until every subject is decoded.
  const subjects = foldGroupPerms(withGroups.map((s) => {
    const src = rawById.get(s.subjectId) || {};
    return {
      ...attachPerms(s, src.perms),
      vouchConfig: normalizeVouchConfig(src.vouchConfig),
      managerConfig: normalizeManagerConfig(src.managerConfig),
    };
  }));

  const { roles, groups } = splitSubjects(subjects);
  return {
    subjects,
    roles,
    groups,
    compositions: visibleCompositions,
    // Creation-id prediction must see hidden structural/native ids even though no UI should render
    // them. Role creation consumes this collection instead of the display projection.
    indexedSubjects,
    // Legacy-shaped lookups, so existing consumers can be pointed here with no render change.
    roleNames: subjectNameMap(subjects),
    roleHatIds: roles.map((r) => r.subjectId),
  };
}

/**
 * The `useAuthorityMemberships` transform: raw `SubjectMembership` rows -> normalised rows with
 * their rule attached, bucketed by subject, plus the DERIVED group rosters.
 *
 * Group rosters are derived here for the same reason the contract derives them: groups have no
 * acceptance, no per-user enumeration on chain and no TransferSingle, so a user is in a group iff
 * they are an ACTIVE member of at least one active member-role.
 *
 * @param {Array} rawMemberships - `subjectMemberships`
 * @param {Array} compositions - GroupComposition rows (from normalizeAuthoritySubjects)
 * @param {Array} groups - normalised group subjects
 */
export function normalizeAuthorityMemberships(rawMemberships = [], compositions = [], groups = []) {
  const raw = rawMemberships || [];
  const allRows = raw.map((source) => {
    const membership = normalizeMembership(source);
    return membership ? { ...membership, rule: normalizeRule(source?.rule) } : null;
  }).filter(Boolean);
  const rows = allRows.filter((m) => m.isUserFacing);
  const bySubject = groupBySubject(rows);

  const { rolesByGroup } = indexGroupCompositions(compositions);
  const groupMembers = new Map(
    (groups || []).map((g) => [g.subjectId, deriveGroupMembers(g.subjectId, rolesByGroup, rows)])
  );

  return {
    memberships: rows,
    indexedMemberships: allRows,
    members: activeMemberships(rows),
    membershipsBySubject: bySubject,
    groupMembers,
    membersOf: (subjectId) => (bySubject.get(String(subjectId)) || []).filter((m) => m.isMember),
    /**
     * IN-ORG, exactly as the contract defines it: `_isInOrg` is `userSubjectList[user].length > 0`
     * — ACCEPTED anywhere, regardless of current eligibility. This is the grant-vs-offer input,
     * and it is deliberately NOT `members` (accepted && eligible): an accepted-but-lapsed member is
     * in-org on chain, so classifying them as an outsider makes the wizard offer an invitation to
     * someone who is already a member.
     */
    // Structural top-hat memberships still count for the contract's `_isInOrg`; hiding their
    // cards must not turn a real member into an outsider when a proposal chooses grant vs offer.
    inOrgUsers: new Set(allRows.filter((m) => m.accepted).map((m) => String(m.user).toLowerCase())),
  };
}

/**
 * The `useMyMemberships` transform: one user's rows, split into what they hold, what they can take,
 * and what they are blocked from.
 */
export function normalizeMyMemberships(rawMemberships = []) {
  const raw = rawMemberships || [];
  const indexedRows = raw.map((source) => {
    const membership = normalizeMembership(source);
    return membership ? { ...membership, rule: normalizeRule(source?.rule) } : null;
  }).filter(Boolean);
  const rows = indexedRows.filter((m) => m.isUserFacing);
  return {
    rows,
    indexedRows,
    myRoles: activeMemberships(rows),
    claimable: claimableMemberships(rows),
    // Neither a member nor claimable, with a BAN on the slot: the answer to "why can't I see this
    // role", which is otherwise invisible and generates support tickets.
    blocked: rows.filter((m) => !m.isMember && !m.claimable && m.ruleKind === RULE_KIND.BAN),
    isMemberOf: (subjectId) => rows.some((m) => m.subjectId === String(subjectId) && m.isMember),
  };
}
