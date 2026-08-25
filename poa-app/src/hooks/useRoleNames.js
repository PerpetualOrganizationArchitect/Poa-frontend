/**
 * useRoleNames - Hook for mapping role hat IDs to human-readable names
 *
 * Sources role names from POContext (which gets them from the subgraph's
 * Role.name and Hat.name fields) instead of fetching from IPFS.
 *
 * ACCESS V2: on a migrated org an id can also be a v2-NATIVE role
 * ((authority << 64) | seq) or a GROUP, neither of which exists in the legacy
 * Hats list — a group-restricted poll rendered "Unknown Role" here and, in
 * CreateVoteModal's review step, "All members". The v2 subjects are consulted
 * after the legacy map and before the fallback, so every existing consumer
 * (PollDetail, VotePowerReceipt, OrgConstitution, CreateVoteModal) resolves
 * both namespaces with no change of its own. On a legacy org
 * `useAuthoritySubjects` puts nothing on the wire and this is a no-op.
 */

import { useCallback, useMemo } from 'react';
import { usePOContext } from '../context/POContext';
import { useAuthoritySubjects } from './accessV2/useAuthoritySubjects';
import { makeSubjectNameResolver, shortSubjectLabel } from '@/lib/accessV2/subjectNames';

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
  const { roleHatIds, roleNames: contextRoleNames, roleCanVoteMap } = usePOContext();
  // Empty on a legacy org (the hook self-gates on the authority), so this adds no query there.
  const { subjects } = useAuthoritySubjects();

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

  // Create a stable reference for all roles with their names
  const allRoles = useMemo(() => {
    if (!roleHatIds?.length) return [];

    return roleHatIds.map((hatId, index) => ({
      hatId: String(hatId),
      name: getRoleName(hatId),
      index,
    }));
  }, [roleHatIds, getRoleName]);

  // Roles that have canVote === true
  const votingEligibleRoles = useMemo(() => {
    if (!allRoles?.length) return [];
    return allRoles.filter(role => roleCanVoteMap?.[role.hatId] !== false);
  }, [allRoles, roleCanVoteMap]);

  return {
    roleNames,
    getRoleName,
    getRoleNames,
    getRoleNamesString,
    allRoles,
    votingEligibleRoles,
    // The raw v2-aware resolver, for callers that must NOT fall back to "Unknown Role" (a review
    // step confirming a restriction, say — see CreateVoteModal.whoCanVoteLabel).
    resolveSubjectName,
    isLoading: false,
  };
}

export default useRoleNames;
