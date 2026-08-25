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
  normalizeMemberships,
  activeMemberships,
  claimableMemberships,
  groupBySubject,
} from './memberships';
import { normalizeRule, RULE_KIND } from './rules';
import { normalizeVouchConfig } from './vouch';
import { normalizeManagerConfig } from './pendingActions';
import { decodePermWord, permKeyName, isGlobalCtx, PERM_KEYS } from './permKeys';

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
    // Legacy-compatible: `canVote` is the flag every pre-v2 roster/label consumer reads.
    canVote: Boolean(globalOf(PERM_KEYS.DD_VOTE)?.enabled),
    canCreateVote: Boolean(
      globalOf(PERM_KEYS.DD_CREATE)?.enabled || globalOf(PERM_KEYS.HV_CREATE)?.enabled
    ),
    taskMask: globalOf(PERM_KEYS.TM_PERMS)?.value ?? '0',
  };
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

  const withGroups = attachGroups(normalizeSubjects(raw), compositions);
  const rawById = new Map(raw.map((s) => [String(s.subjectId ?? s.id), s]));

  const subjects = withGroups.map((s) => {
    const src = rawById.get(s.subjectId) || {};
    return {
      ...attachPerms(s, src.perms),
      vouchConfig: normalizeVouchConfig(src.vouchConfig),
      managerConfig: normalizeManagerConfig(src.managerConfig),
    };
  });

  const { roles, groups } = splitSubjects(subjects);
  return {
    subjects,
    roles,
    groups,
    compositions,
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
  const rows = normalizeMemberships(raw).map((m, i) => ({ ...m, rule: normalizeRule(raw[i]?.rule) }));
  const bySubject = groupBySubject(rows);

  const { rolesByGroup } = indexGroupCompositions(compositions);
  const groupMembers = new Map(
    (groups || []).map((g) => [g.subjectId, deriveGroupMembers(g.subjectId, rolesByGroup, rows)])
  );

  return {
    memberships: rows,
    members: activeMemberships(rows),
    membershipsBySubject: bySubject,
    groupMembers,
    membersOf: (subjectId) => (bySubject.get(String(subjectId)) || []).filter((m) => m.isMember),
  };
}

/**
 * The `useMyMemberships` transform: one user's rows, split into what they hold, what they can take,
 * and what they are blocked from.
 */
export function normalizeMyMemberships(rawMemberships = []) {
  const raw = rawMemberships || [];
  const rows = normalizeMemberships(raw).map((m, i) => ({ ...m, rule: normalizeRule(raw[i]?.rule) }));
  return {
    rows,
    myRoles: activeMemberships(rows),
    claimable: claimableMemberships(rows),
    // Neither a member nor claimable, with a BAN on the slot: the answer to "why can't I see this
    // role", which is otherwise invisible and generates support tickets.
    blocked: rows.filter((m) => !m.isMember && !m.claimable && m.ruleKind === RULE_KIND.BAN),
    isMemberOf: (subjectId) => rows.some((m) => m.subjectId === String(subjectId) && m.isMember),
  };
}
