/**
 * accessV2/profileBridge — project the MembershipAuthority fold mirror into Profile Hub data.
 *
 * Profile Hub predates Access v2 and expects legacy-shaped roles (`hatId`, `permissions`,
 * `defaultEligible`). On a router-bound v2 org those Hat/Role entities are retired: using them
 * leaks structural ids, misses native v2 roles, and renders stale permissions. This bridge keeps
 * that compatibility at one boundary while sourcing every answer from live v2 subjects and the
 * current user's membership rows.
 *
 * PURE. React hooks stay thin and legacy orgs never call this projection.
 */

import { isUserFacingSubjectId, toSubjectId } from './ids';
import { ELIGIBILITY_SOURCE, isHeldInReserve, eligibilityCopy } from './memberships';
import { PERM_KEYS } from './permKeys';
import { RULE_KIND } from './rules';
import { shortSubjectLabel } from './subjectNames';

// Profile Hub intentionally presents the same four compact badge concepts as its legacy cards.
// Several semantic v2 keys collapse to one badge, just as several HatPermission contract types
// previously collapsed by `permissionRole` in getPermissionBadges().
const PROFILE_PERMISSION_BADGES = [
  {
    permissionRole: 'Creator',
    keys: [PERM_KEYS.DD_CREATE, PERM_KEYS.HV_CREATE, PERM_KEYS.EDU_CREATE],
  },
  { permissionRole: 'Approver', keys: [PERM_KEYS.PT_APPROVE] },
  {
    permissionRole: 'Member',
    keys: [PERM_KEYS.PT_MEMBER, PERM_KEYS.EDU_MEMBER, PERM_KEYS.QJ_AUTOJOIN],
  },
  { permissionRole: 'Voter', keys: [PERM_KEYS.DD_VOTE] },
];

function effectiveValue(subject, key) {
  if (typeof subject?.permEffective !== 'function') return 0n;
  try {
    return BigInt(subject.permEffective(key) || 0);
  } catch {
    return 0n;
  }
}

/** Does this subject grant a semantic permission after folding its groups? */
export function hasEffectiveProfilePermission(subject, key) {
  return effectiveValue(subject, key) !== 0n;
}

/** Legacy-shaped permission rows consumed by UserRolesCard/getPermissionBadges. */
export function buildV2ProfilePermissions(subject) {
  return PROFILE_PERMISSION_BADGES
    .filter(({ keys }) => keys.some((key) => hasEffectiveProfilePermission(subject, key)))
    .map(({ permissionRole }) => ({ permissionRole, allowed: true }));
}

function visibleSubjectId(value) {
  const id = toSubjectId(value);
  return id && isUserFacingSubjectId(id) ? id : null;
}

function displayName(subject, membership, id) {
  const name = subject?.name || membership?.subjectName || membership?.subject?.name;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed || shortSubjectLabel(id);
}

function roleView(subject, membership) {
  const id = visibleSubjectId(subject?.subjectId ?? subject?.hatId ?? membership?.subjectId);
  if (!id || subject?.isGroup || subject?.isUserFacing === false || membership?.isUserFacing === false) {
    return null;
  }

  const vouchConfig = subject?.vouchConfig || membership?.subject?.vouchConfig || null;
  return {
    ...(subject || {}),
    id,
    hatId: id,
    subjectId: id,
    name: displayName(subject, membership, id),
    memberCount: Number(
      subject?.memberCount ?? membership?.subject?.activeMemberCount ?? 0
    ),
    permissions: buildV2ProfilePermissions(subject),
    vouchingEnabled: Boolean(vouchConfig?.enabled ?? Number(vouchConfig?.quorum || 0) > 0),
    vouchingQuorum: Number(vouchConfig?.quorum || 0),
  };
}

function uniqueByHatId(roles) {
  const seen = new Set();
  return (roles || []).filter((role) => {
    if (!role || seen.has(role.hatId)) return false;
    seen.add(role.hatId);
    return true;
  });
}

/**
 * Build every v2-backed value Profile Hub needs.
 *
 * `memberships` is `useMyMemberships().rows`; `claimableMemberships` is its enriched
 * `claimable` slice (badge/why included). Passing both preserves the indexed row as the source of
 * truth while retaining the user-facing eligibility copy.
 */
export function buildV2ProfileView({
  roles = [],
  memberships = [],
  claimableMemberships = [],
} = {}) {
  const visibleRoles = (roles || []).filter((role) => {
    const id = visibleSubjectId(role?.subjectId ?? role?.hatId);
    return Boolean(id) && !role?.isGroup && role?.isUserFacing !== false;
  });

  const membershipById = new Map();
  for (const membership of memberships || []) {
    const id = visibleSubjectId(membership?.subjectId ?? membership?.hatId);
    if (id && membership?.isUserFacing !== false) membershipById.set(id, membership);
  }

  const projectedRoles = visibleRoles
    .map((subject) => roleView(
      subject,
      membershipById.get(visibleSubjectId(subject?.subjectId ?? subject?.hatId))
    ))
    .filter(Boolean);
  const roleById = new Map(projectedRoles.map((role) => [role.subjectId, role]));

  const heldMemberships = (memberships || []).filter((membership) => membership?.isMember);
  const heldIds = new Set(
    heldMemberships
      .map((membership) => visibleSubjectId(membership?.subjectId ?? membership?.hatId))
      .filter(Boolean)
  );

  // Preserve the org's configured role order. A membership-side fallback covers the short window
  // where the membership query has indexed a new role before the subjects query refreshes.
  const knownUserRoles = projectedRoles.filter((role) => heldIds.has(role.subjectId));
  const missingUserRoles = heldMemberships
    .filter((membership) => !roleById.has(visibleSubjectId(membership?.subjectId ?? membership?.hatId)))
    .map((membership) => roleView(null, membership));
  const userRoles = uniqueByHatId([...knownUserRoles, ...missingUserRoles]);
  const userRoleIds = userRoles.map((role) => role.hatId);
  const profileRoles = uniqueByHatId([...projectedRoles, ...missingUserRoles]);

  const enrichedClaimableById = new Map(
    (claimableMemberships || [])
      .map((membership) => [visibleSubjectId(membership?.subjectId ?? membership?.hatId), membership])
      .filter(([id]) => Boolean(id))
  );
  const claimableRows = (memberships || []).filter((membership) => membership?.claimable);
  const claimableRoles = uniqueByHatId(claimableRows.map((row) => {
    const id = visibleSubjectId(row?.subjectId ?? row?.hatId);
    const membership = enrichedClaimableById.get(id) || row;
    const copy = eligibilityCopy(membership?.eligibilitySource);
    const role = roleById.get(id) || roleView(null, membership);
    if (!role) return null;
    return {
      ...role,
      // Explicit claimable items bypass the legacy defaultEligible/vouching heuristic.
      claimLabel: isHeldInReserve(membership)
        ? 'Held for you'
        : (membership?.badge || copy.badge || 'Available to join'),
      claimReason: membership?.why || copy.why || '',
    };
  }));

  const progressionItems = (memberships || [])
    .filter((membership) =>
      !membership?.isMember &&
      !membership?.claimable &&
      !membership?.vouchMet &&
      membership?.ruleKind !== RULE_KIND.BAN &&
      membership?.eligibilitySource !== ELIGIBILITY_SOURCE.EXPLICIT_BAN &&
      Number(membership?.vouchCount || 0) > 0
    )
    .map((membership) => {
      const id = visibleSubjectId(membership?.subjectId ?? membership?.hatId);
      const role = roleById.get(id) || roleView(null, membership);
      const quorum = Number(
        role?.vouchingQuorum || membership?.subject?.vouchConfig?.quorum || 0
      );
      if (!role || quorum <= 0) return null;
      return {
        role,
        current: Number(membership.vouchCount || 0),
        quorum,
        isComplete: false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.current - a.current || a.role.name.localeCompare(b.role.name));

  const heldSubjects = userRoleIds
    .map((id) => visibleRoles.find((subject) => visibleSubjectId(subject?.subjectId ?? subject?.hatId) === id))
    .filter(Boolean);

  return {
    roles: profileRoles,
    userRoles,
    userRoleIds,
    claimableRoles,
    progressionItems,
    hasClaimedRole: userRoles.length > 0,
    canRequestTokens: heldSubjects.some((subject) =>
      hasEffectiveProfilePermission(subject, PERM_KEYS.PT_MEMBER)
    ),
    canApproveRequests: heldSubjects.some((subject) =>
      hasEffectiveProfilePermission(subject, PERM_KEYS.PT_APPROVE)
    ),
  };
}

export default buildV2ProfileView;
