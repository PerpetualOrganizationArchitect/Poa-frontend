/**
 * useRoleNames - Hook for mapping role hat IDs to human-readable names
 *
 * Sources role names from POContext (which gets them from the subgraph's
 * Role.name and Hat.name fields) instead of fetching from IPFS.
 */

import { useCallback, useMemo } from 'react';
import { usePOContext } from '../context/POContext';

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
  const { roleHatIds, roleNames: contextRoleNames, roleCanVoteMap, roleGroups } = usePOContext();

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

    return 'Unknown Role';
  }, [roleNames, roleHatIds]);

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

  // hatId (identity) -> [group summaries] via RoleManager group memberships.
  // Empty for orgs without RoleManager (roleGroups is []), so callers fall back
  // to the plain role UI unchanged.
  const groupsByRoleHatId = useMemo(() => {
    const map = new Map();
    for (const group of roleGroups || []) {
      for (const m of group.memberships || []) {
        if (m?.isActive === false) continue;
        const memberHat = normalizeHatId(m?.role?.hatId);
        if (!memberHat) continue;
        const entry = { groupId: group.groupId, name: group.name, markerHatId: group.markerHatId };
        const list = map.get(memberHat) || [];
        list.push(entry);
        map.set(memberHat, list);
      }
    }
    return map;
  }, [roleGroups]);

  /**
   * Groups an identity-hat role belongs to (RoleManager). Returns [] when the
   * org has no RoleManager or the role is in no group.
   * @param {string|number} hatId
   * @returns {Array<{groupId, name, markerHatId}>}
   */
  const getGroupForRole = useCallback(
    (hatId) => groupsByRoleHatId.get(normalizeHatId(hatId)) || [],
    [groupsByRoleHatId]
  );

  return {
    roleNames,
    getRoleName,
    getRoleNames,
    getRoleNamesString,
    allRoles,
    votingEligibleRoles,
    getGroupForRole,
    roleGroups: roleGroups || [],
    isLoading: false,
  };
}

export default useRoleNames;
