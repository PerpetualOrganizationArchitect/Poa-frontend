/**
 * useRoleNames - Hook for mapping role hat IDs to human-readable names
 *
 * Sources role names from POContext (which gets them from the subgraph's
 * Role.name and Hat.name fields) instead of fetching from IPFS.
 *
 * ACCESS V2 — NAMES: on a migrated org an id can also be a v2-NATIVE role
 * ((authority << 64) | seq) or a GROUP, neither of which exists in the legacy
 * Hats list — a group-restricted poll rendered "Unknown Role" here and, in
 * CreateVoteModal's review step, "All members". The v2 subjects are consulted
 * after the legacy map and before the fallback, so every existing consumer
 * (PollDetail, VotePowerReceipt, OrgConstitution, CreateVoteModal) resolves
 * both namespaces with no change of its own. On a legacy org
 * `useAuthoritySubjects` puts nothing on the wire and this is a no-op.
 *
 * ACCESS V2 — THE LIST: `allRoles` (and the `roleHatIds` / `roleNamesById` that
 * go with it) used to come from POContext `roleHatIds`, the legacy Hats list.
 * On a v2 org that list is frozen at cutover, so every picker built on it
 * (setter-template roleSelect, ElectionConfigurator, RoleConfigurator's parent
 * picker, the restricted-poll subject picker) offered deactivated hats and
 * could never offer a role created since — a v2-native role has no hat at all.
 * When the authority is live the list is sourced from its ROLE subjects
 * instead. The projection stays legacy-shaped (`{ hatId, name, index }`, with
 * `hatId` carrying the subject id) because a migrated org adopts its hat ids
 * verbatim, so no consumer changes. The fold is `lib/voting/roleOptions.js`.
 */

import { useCallback, useMemo } from 'react';
import { usePOContext } from '../context/POContext';
import { useAuthoritySubjects } from './accessV2/useAuthoritySubjects';
import { useOrgAuthority } from './accessV2/useOrgAuthority';
import { makeSubjectNameResolver, shortSubjectLabel } from '@/lib/accessV2/subjectNames';
import { foldRoleOptions } from '@/lib/voting/roleOptions';

/**
 * Normalize a hat ID to a string for consistent comparison
 */
function normalizeHatId(id) {
  if (id === null || id === undefined) return '';
  const str = String(id).trim();
  if (str.startsWith('0x') || str.startsWith('0X')) {
    return str.toLowerCase();
  }
  return str;
}

/**
 * Generate fallback role name based on index
 */
function getFallbackRoleName(index) {
  return `Role ${index + 1}`;
}

/**
 * Hook to get role names mapped from hat IDs
 * @returns {Object} { roleNames, getRoleName, isLoading }
 */
export function useRoleNames() {
  const {
    roleHatIds,
    roleNames: contextRoleNames,
    roleCanVoteMap,
    eligibilityModuleAdminHat,
  } = usePOContext();
  // Empty on a legacy org (the hook self-gates on the authority), so this adds no query there.
  const { subjects, roles: subjectRoles } = useAuthoritySubjects();
  const { enabled: authorityEnabled } = useOrgAuthority();

  // Build normalized role names map from POContext data
  const roleNames = useMemo(() => {
    if (!contextRoleNames || typeof contextRoleNames !== 'object') return {};
    const names = {};
    Object.entries(contextRoleNames).forEach(([key, value]) => {
      const normalizedKey = normalizeHatId(key);
      names[normalizedKey] = value;
      names[String(key)] = value;
    });
    return names;
  }, [contextRoleNames]);

  /**
   * Get the display name for a role by its hat ID
   * @param {string|number} hatId - The hat ID to look up
   * @returns {string} The role name or fallback
   */
  // Legacy map → v2 subjects (roles AND groups) → short id label.
  const resolveSubjectName = useMemo(
    () => makeSubjectNameResolver({ legacyNames: roleNames, subjects }),
    [roleNames, subjects]
  );

  const getRoleName = useCallback((hatId) => {
    if (!hatId) return 'Unknown Role';

    const normalizedId = normalizeHatId(hatId);

    // First try the normalized lookup
    if (roleNames[normalizedId]) {
      return roleNames[normalizedId];
    }

    // Try original string
    if (roleNames[String(hatId)]) {
      return roleNames[String(hatId)];
    }

    // Fallback to index-based name
    const normalizedRoleHatIds = (roleHatIds || []).map(id => normalizeHatId(id));
    const index = normalizedRoleHatIds.indexOf(normalizedId);

    if (index >= 0) {
      return getFallbackRoleName(index);
    }

    // Access v2: a v2-native role id or a GROUP id — unknown to the legacy list by construction.
    const v2Name = resolveSubjectName(hatId);
    if (v2Name && v2Name !== shortSubjectLabel(hatId)) return v2Name;

    return 'Unknown Role';
  }, [roleNames, roleHatIds, resolveSubjectName]);

  /**
   * Get display names for multiple hat IDs
   * @param {Array} hatIds - Array of hat IDs
   * @returns {Array} Array of role names
   */
  const getRoleNames = useCallback((hatIds) => {
    if (!hatIds || !Array.isArray(hatIds)) return [];
    return hatIds.map(id => getRoleName(id));
  }, [getRoleName]);

  /**
   * Get a comma-separated string of role names for display
   * @param {Array} hatIds - Array of hat IDs
   * @returns {string} Comma-separated role names
   */
  const getRoleNamesString = useCallback((hatIds) => {
    const names = getRoleNames(hatIds);
    if (names.length === 0) return 'All Members';
    return names.join(', ');
  }, [getRoleNames]);

  // The role list every picker renders. Legacy Hats list, or the authority's ROLE subjects on a
  // migrated org — see lib/voting/roleOptions.js for the rule and its tests.
  const roleOptions = useMemo(
    () => foldRoleOptions({
      authorityEnabled: !!authorityEnabled,
      legacyRoleHatIds: roleHatIds,
      legacyRoleNames: roleNames,
      legacyCanVoteMap: roleCanVoteMap,
      subjectRoles,
      // The eligibility-module admin hat is a SYSTEM hat (its wearer is the module contract).
      // POContext strips it from the legacy `roleHatIds`; migration adopts it as a subject like
      // any other hat, so the v2 list has to strip it too or it reappears in every picker.
      excludeIds: eligibilityModuleAdminHat ? [eligibilityModuleAdminHat] : [],
      nameFor: getRoleName,
    }),
    [
      authorityEnabled,
      roleHatIds,
      roleNames,
      roleCanVoteMap,
      subjectRoles,
      eligibilityModuleAdminHat,
      getRoleName,
    ]
  );

  const { allRoles, votingEligibleRoles } = roleOptions;

  return {
    roleNames,
    getRoleName,
    getRoleNames,
    getRoleNamesString,
    allRoles,
    votingEligibleRoles,
    // The same list as ids + an id -> name map, for surfaces that describe roles rather than pick
    // one (OrgConstitution's "who can open a vote"). On a legacy org these ARE POContext's
    // `roleHatIds` / `roleNames`; on a v2 org they are the authority's roles, so a role created
    // after cutover is named instead of counted as "1 more role".
    roleHatIds: roleOptions.roleHatIds,
    roleNamesById: roleOptions.roleNamesById,
    roleOptionSource: roleOptions.source,
    // The raw v2-aware resolver, for callers that must NOT fall back to "Unknown Role" (a review
    // step confirming a restriction, say — see CreateVoteModal.whoCanVoteLabel).
    resolveSubjectName,
    isLoading: false,
  };
}

export default useRoleNames;
