/**
 * accessV2/legacyBridge — feed the LEGACY org-structure surfaces from the v2 fold mirror.
 *
 * A migrated org's team page keeps the layouts people know (the permissions matrix, the
 * members-grouped-by-role section, the dashboard structure card) but their data must come from
 * the MembershipAuthority subjects, not the retired hat entities — those go stale at cutover
 * and produce exactly the bugs this module exists to end: raw bytes32 ids rendered as role
 * names, ghost roles with zero wearers, and an all-empty permissions matrix.
 *
 * PURE, like the rest of lib/accessV2 — hooks stay thin and everything here is testable.
 */

import { PERM_KEYS, TASK_PERM_BITS } from './permKeys';

/**
 * The legacy matrix's column vocabulary, expressed over v2 perm keys.
 * `key` copies the legacy `${contractType}_${permissionRole}` convention so PermissionsMatrix
 * renders these columns exactly as it always has. TaskManager columns read one bit each of the
 * folded TM_PERMS mask.
 */
export const V2_MATRIX_COLUMNS = [
  { key: 'QuickJoin_Member', contractType: 'QuickJoin', permissionRole: 'Member', label: 'Membership - Join', permKey: PERM_KEYS.QJ_AUTOJOIN },
  { key: 'ParticipationToken_Member', contractType: 'ParticipationToken', permissionRole: 'Member', label: 'Tokens - Hold', permKey: PERM_KEYS.PT_MEMBER },
  { key: 'ParticipationToken_Approver', contractType: 'ParticipationToken', permissionRole: 'Approver', label: 'Tokens - Approve', permKey: PERM_KEYS.PT_APPROVE },
  { key: 'HybridVoting_Creator', contractType: 'HybridVoting', permissionRole: 'Creator', label: 'Binding Votes - Create', permKey: PERM_KEYS.HV_CREATE },
  { key: 'DirectDemocracyVoting_Voter', contractType: 'DirectDemocracyVoting', permissionRole: 'Voter', label: 'Community Votes - Vote', permKey: PERM_KEYS.DD_VOTE },
  { key: 'DirectDemocracyVoting_Creator', contractType: 'DirectDemocracyVoting', permissionRole: 'Creator', label: 'Community Votes - Create', permKey: PERM_KEYS.DD_CREATE },
  { key: 'EducationHub_Creator', contractType: 'EducationHub', permissionRole: 'Creator', label: 'Learning - Create', permKey: PERM_KEYS.EDU_CREATE },
  { key: 'EducationHub_Member', contractType: 'EducationHub', permissionRole: 'Member', label: 'Learning - Take', permKey: PERM_KEYS.EDU_MEMBER },
  { key: 'PaymentManager_Payments', contractType: 'PaymentManager', permissionRole: 'Payments', label: 'Treasury - Payments', permKey: PERM_KEYS.PAY_CREATE },
  // TaskManager — one column per TaskPerm bit of the org-wide (ctx 0) folded mask, under the
  // exact legacy column keys so PermissionsMatrix's SHORT_LABELS / FULL_DESCRIPTIONS resolve.
  // Per-project overrides stay in the role drawer, where their ctx is actually explained.
  ...[
    { bit: 1, role: 'Create' },
    { bit: 2, role: 'Claim' },
    { bit: 4, role: 'Review' },
    { bit: 8, role: 'Assign' },
    { bit: 16, role: 'SelfReview' },
    { bit: 32, role: 'Budget' },
    { bit: 64, role: 'EditMeta' },
    { bit: 128, role: 'EditFull' },
  ].map(({ bit, role }) => {
    const label = TASK_PERM_BITS.find((b) => b.value === bit)?.label || role;
    return {
      key: `TaskManager_${role}`,
      contractType: 'TaskManager',
      permissionRole: role,
      label: `Tasks - ${label}`,
      permKey: PERM_KEYS.TM_PERMS,
      maskBit: bit,
    };
  }),
];

/** The folded (own ∪ groups) org-wide value of one column for one subject. */
function columnValue(subject, col) {
  if (typeof subject?.permEffective !== 'function') return false;
  let value;
  try {
    value = BigInt(subject.permEffective(col.permKey) || 0);
  } catch {
    return false;
  }
  if (col.maskBit !== undefined) return (value & BigInt(col.maskBit)) !== 0n;
  return value !== 0n;
}

/** One column's value from a subject's OWN global row (no group fold). */
function ownColumnValue(subject, col) {
  if (typeof subject?.permGlobal !== 'function') return false;
  const row = subject.permGlobal(col.permKey);
  if (!row || !row.exists) return false;
  let value;
  try {
    value = BigInt(row.value);
  } catch {
    return false;
  }
  if (col.maskBit !== undefined) return (value & BigInt(col.maskBit)) !== 0n;
  return value !== 0n;
}

/** One column's value contributed by a role's GROUPS alone. */
function groupsColumnValue(subject, col) {
  return (subject?.groups || []).some((g) => ownColumnValue(g, col));
}

/**
 * The matrix, distinct-permissions edition.
 *
 * A row earns its place only by carrying something of its OWN: groups always represent their own
 * rows, and a role appears only when it adds at least one permission BEYOND what its groups give
 * it. Everything else is one honest sentence, not a wall of dash-rows — a board of ten title
 * roles that only inherit from their group would otherwise render ten near-duplicate rows of
 * the group (or, before the group is granted anything, ten empty ones).
 *
 * Cells are tri-state: `true` = the row's own grant, `'inherited'` = held via a group (rendered
 * muted so the additions stand out).
 *
 * @returns {{
 *   columns: Array, matrix: Object, rows: Array,
 *   hidden: { inheritOnly: Array<{name: string, groupNames: string[]}>, silent: string[] }
 * }}
 */
export function buildV2MatrixView(subjects = []) {
  const rows = [];
  const matrix = {};
  const hidden = { inheritOnly: [], silent: [] };

  for (const s of subjects || []) {
    const cells = {};
    let hasOwnBeyond = false;
    let hasAnything = false;
    for (const col of V2_MATRIX_COLUMNS) {
      const effective = columnValue(s, col);
      if (!effective) continue;
      hasAnything = true;
      const beyond = s.isGroup ? ownColumnValue(s, col) : ownColumnValue(s, col) && !groupsColumnValue(s, col);
      if (beyond) hasOwnBeyond = true;
      cells[col.key] = beyond ? true : 'inherited';
    }

    if (hasOwnBeyond) {
      rows.push(s);
      matrix[s.hatId ?? s.subjectId] = cells;
    } else if (hasAnything) {
      hidden.inheritOnly.push({
        name: s.name || 'Untitled',
        groupNames: (s.groups || []).map((g) => g.name).filter(Boolean),
      });
    } else {
      hidden.silent.push(s.name || 'Untitled');
    }
  }

  const columns = V2_MATRIX_COLUMNS.filter((col) =>
    rows.some((s) => matrix[s.hatId ?? s.subjectId]?.[col.key])
  );
  return { columns, matrix, rows, hidden };
}

/**
 * Roles (then groups) in the legacy `roles` prop shape. Counts come from the live membership
 * roster — the ACTIVE roster, same rule as the v2 panel — with groups deriving theirs through
 * their member roles.
 */
export function buildV2LegacyRoles({ roles = [], groups = [], membersOf, groupMembers } = {}) {
  const roleRows = (roles || []).map((r) => ({
    id: r.subjectId,
    hatId: r.hatId ?? r.subjectId,
    name: r.name || 'Untitled',
    isGroup: false,
    memberCount: membersOf ? membersOf(r.subjectId).length : (r.activeMemberCount ?? 0),
    vouchingEnabled: Boolean(r.vouchConfig?.enabled),
  }));
  const groupRows = (groups || []).map((g) => ({
    id: g.subjectId,
    hatId: g.hatId ?? g.subjectId,
    name: g.name || 'Untitled',
    isGroup: true,
    memberCount: groupMembers ? (groupMembers.get(g.subjectId) || []).length : 0,
    vouchingEnabled: false,
  }));
  return [...roleRows, ...groupRows];
}
