/**
 * accessV2/subjects — normalisers over the subgraph `Subject` / `GroupComposition` entities.
 *
 * PURE. Input shapes come straight from `pop-subgraph/schema.graphql` (access-v2/subgraph branch);
 * output shapes are LEGACY-COMPATIBLE — every normalised role also carries `hatId`, `name`,
 * `image` and `canVote`, the fields the pre-v2 `roles` query fed to POContext / useRoleNames — so
 * a consumer can be pointed at the v2 source without changing its render code.
 *
 * A SUBJECT is either a ROLE (acceptance, maxMembers, memberCount) or a GROUP (pure derivation
 * over its member-roles: a user is in the group iff they are an active member of >= 1 member-role;
 * groups have no acceptance, no maxMembers and are NOT tokens).
 */

import { isLegacyAdoptedId, toSubjectId } from './ids';

export const SUBJECT_KIND = { ROLE: 'Role', GROUP: 'Group' };

/**
 * Normalise one subgraph Subject.
 * @param {object} raw
 * @returns {object|null}
 */
export function normalizeSubject(raw) {
  if (!raw) return null;
  const subjectId = toSubjectId(raw.subjectId ?? raw.id);
  if (subjectId === null) return null;
  const kind = raw.kind === SUBJECT_KIND.GROUP ? SUBJECT_KIND.GROUP : SUBJECT_KIND.ROLE;
  const isGroup = kind === SUBJECT_KIND.GROUP;

  return {
    subjectId,
    kind,
    isGroup,
    isRole: !isGroup,
    name: raw.name || '',
    imageURI: raw.imageURI || '',
    metadataCID: raw.metadataCID || null,
    // maxMembers is ROLE-only; the contract reverts on setMaxMembers for a Group, and the
    // subgraph writes 0 there — never render "0 of 0 seats" for a group.
    maxMembers: isGroup ? null : Number(raw.maxMembers ?? 0),
    unlimitedSeats: isGroup ? true : Number(raw.maxMembers ?? 0) === 0,
    // memberCount mirrors ACCEPTED flips; activeMemberCount is the fold mirror
    // (accepted && eligible) — activeMemberCount is the number to render.
    acceptedCount: Number(raw.memberCount ?? 0),
    memberCount: Number(raw.activeMemberCount ?? raw.memberCount ?? 0),
    acceptedUsers: (raw.acceptedUsers || []).map((a) => String(a).toLowerCase()),
    defaultAllow: Boolean(raw.defaultAllow),
    isOpen: Boolean(raw.defaultAllow),
    isLegacyAdopted: raw.isLegacyAdopted !== undefined
      ? Boolean(raw.isLegacyAdopted)
      : isLegacyAdoptedId(subjectId),
    vouchConfig: raw.vouchConfig || null,
    managerConfig: raw.managerConfig || null,
    createdAt: raw.createdAt ? Number(raw.createdAt) : null,

    // ── legacy-compatible projection ───────────────────────────────────────────────────────────
    // A migrated org ADOPTS its hatIds verbatim, so subjectId IS the old hatId and every existing
    // `hatId`-keyed consumer keeps resolving.
    hatId: subjectId,
    image: raw.imageURI || '',
    // Set by attachPermissions(); left undefined here so a caller that never resolves perms can
    // still tell "unknown" from "no".
    canVote: undefined,
  };
}

export function normalizeSubjects(rows = []) {
  return (rows || []).map(normalizeSubject).filter(Boolean);
}

/** Split a normalised subject list into roles and groups. */
export function splitSubjects(subjects = []) {
  const roles = [];
  const groups = [];
  for (const s of subjects || []) {
    if (!s) continue;
    (s.isGroup ? groups : roles).push(s);
  }
  return { roles, groups };
}

/**
 * Index active GroupComposition rows both ways.
 * Rows are kept with `isActive: false` after removal so history stays queryable — only ACTIVE rows
 * describe the current composition.
 *
 * @param {Array} compositions - subgraph GroupComposition rows
 * @returns {{ rolesByGroup: Map<string,string[]>, groupsByRole: Map<string,string[]> }}
 */
export function indexGroupCompositions(compositions = []) {
  const rolesByGroup = new Map();
  const groupsByRole = new Map();
  for (const c of compositions || []) {
    if (!c || c.isActive === false) continue;
    const groupId = toSubjectId(c.groupSubjectId ?? c.group?.subjectId ?? c.group?.id);
    const roleId = toSubjectId(c.roleSubjectId ?? c.role?.subjectId ?? c.role?.id);
    if (groupId === null || roleId === null) continue;
    if (!rolesByGroup.has(groupId)) rolesByGroup.set(groupId, []);
    if (!rolesByGroup.get(groupId).includes(roleId)) rolesByGroup.get(groupId).push(roleId);
    if (!groupsByRole.has(roleId)) groupsByRole.set(roleId, []);
    if (!groupsByRole.get(roleId).includes(groupId)) groupsByRole.get(roleId).push(groupId);
  }
  return { rolesByGroup, groupsByRole };
}

/**
 * Attach group wiring to normalised subjects: each role gets `groupIds`/`groups`, each group gets
 * `memberRoleIds`/`memberRoles`. Returns a NEW array (inputs untouched).
 */
export function attachGroups(subjects = [], compositions = []) {
  const { rolesByGroup, groupsByRole } = indexGroupCompositions(compositions);
  const byId = new Map((subjects || []).filter(Boolean).map((s) => [s.subjectId, s]));

  return (subjects || []).filter(Boolean).map((s) => {
    if (s.isGroup) {
      const memberRoleIds = rolesByGroup.get(s.subjectId) || [];
      return {
        ...s,
        memberRoleIds,
        memberRoles: memberRoleIds.map((id) => byId.get(id)).filter(Boolean),
        groupIds: [],
        groups: [],
      };
    }
    const groupIds = groupsByRole.get(s.subjectId) || [];
    return {
      ...s,
      groupIds,
      groups: groupIds.map((id) => byId.get(id)).filter(Boolean),
      memberRoleIds: [],
      memberRoles: [],
    };
  });
}

/**
 * GROUP MEMBERSHIP IS DERIVED — there is no on-chain per-user group enumeration and no group
 * TransferSingle, so the app computes it the same way the contract does: a user is in the group
 * iff they are an active member (accepted && eligible) of at least one active member-role.
 *
 * @param {string} groupId
 * @param {Map<string,string[]>} rolesByGroup - from indexGroupCompositions
 * @param {Array<{subject: string, user: string, isMember: boolean}>} memberships - normalised rows
 * @returns {string[]} lowercased member addresses
 */
export function deriveGroupMembers(groupId, rolesByGroup, memberships = []) {
  const roleIds = new Set(rolesByGroup.get(toSubjectId(groupId)) || []);
  if (roleIds.size === 0) return [];
  const out = new Set();
  for (const m of memberships || []) {
    if (!m || !m.isMember) continue;
    if (!roleIds.has(toSubjectId(m.subjectId ?? m.subject))) continue;
    out.add(String(m.user).toLowerCase());
  }
  return [...out];
}

/**
 * A group's permissions are the group subject's OWN perm rows — that is the entire point of
 * groups: change once, every member-role is affected. This returns the copy the group view shows
 * so the blast radius is never a surprise.
 */
export function groupChangeBlastRadius(group) {
  const n = group?.memberRoles?.length ?? group?.memberRoleIds?.length ?? 0;
  if (n === 0) {
    return 'This group has no roles in it yet — permissions you set here apply to nobody until you add a role.';
  }
  const names = (group?.memberRoles || []).map((r) => r.name).filter(Boolean);
  const list = names.length ? names.join(', ') : `${n} role${n === 1 ? '' : 's'}`;
  return `Changing a permission here changes it for everyone in ${list} — all at once.`;
}

/** Find a normalised subject by id (string-safe). */
export function findSubject(subjects = [], subjectId) {
  const id = toSubjectId(subjectId);
  if (id === null) return null;
  return (subjects || []).find((s) => s && s.subjectId === id) || null;
}

/**
 * Legacy-compatible name lookup: `{ [hatId]: name }`, the exact shape POContext's `roleNames`
 * map has today, so `useRoleNames` can be fed from v2 with no consumer change.
 */
export function subjectNameMap(subjects = []) {
  const map = {};
  for (const s of subjects || []) {
    if (!s) continue;
    map[s.subjectId] = s.name || '';
  }
  return map;
}
