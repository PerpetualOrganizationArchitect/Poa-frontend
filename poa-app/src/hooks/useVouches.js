/**
 * useVouches - Hook for fetching and managing vouch data for an organization
 * Provides vouch status, progress, and helper functions for the vouching UI
 */

import { useMemo, useCallback } from 'react';
import { useQuery } from '@apollo/client';
import { useAccount } from 'wagmi';
import { FETCH_VOUCHES_FOR_ORG } from '../util/queries';
import { useRefreshSubscription } from '../context/RefreshContext';

/**
 * Normalize a hat ID to a string for consistent comparison
 * Handles BigInt, numbers, hex strings, etc.
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
 * Normalize an address to lowercase for comparison
 */
function normalizeAddress(addr) {
  if (!addr) return '';
  return addr.toLowerCase();
}

/**
 * Hook for fetching and managing vouch data for an organization
 * @param {string} eligibilityModuleAddress - EligibilityModule contract address
 * @param {Array} rolesWithVouching - Roles that have vouching enabled (from useOrgStructure)
 * @returns {Object} Vouch data and helper functions
 */
export function useVouches(eligibilityModuleAddress, rolesWithVouching = []) {
  const { address: userAddress } = useAccount();
  const normalizedUserAddress = normalizeAddress(userAddress);

  // Fetch vouches from subgraph
  const { data, loading, error, refetch } = useQuery(FETCH_VOUCHES_FOR_ORG, {
    variables: { eligibilityModuleId: eligibilityModuleAddress },
    skip: !eligibilityModuleAddress,
    fetchPolicy: 'cache-and-network',
  });

  // Subscribe to refresh events for real-time updates
  useRefreshSubscription(
    ['role:vouched', 'role:vouch-revoked', 'role:claimed'],
    useCallback(() => {
      // Delay refetch to allow subgraph to index
      setTimeout(() => refetch(), 1500);
    }, [refetch])
  );

  // Create a map of quorums by hatId for quick lookup
  const quorumsByHatId = useMemo(() => {
    const map = {};
    rolesWithVouching.forEach(role => {
      const normalizedHatId = normalizeHatId(role.hatId);
      map[normalizedHatId] = role.vouchingQuorum || 0;
    });
    return map;
  }, [rolesWithVouching]);

  // Create a map of role names by hatId
  const roleNamesByHatId = useMemo(() => {
    const map = {};
    rolesWithVouching.forEach(role => {
      const normalizedHatId = normalizeHatId(role.hatId);
      map[normalizedHatId] = role.name || 'Unknown Role';
    });
    return map;
  }, [rolesWithVouching]);

  // Group vouches by hatId -> wearer
  const vouchesByHatAndWearer = useMemo(() => {
    if (!data?.vouches) return {};

    const grouped = {};

    data.vouches.forEach(vouch => {
      const normalizedHatId = normalizeHatId(vouch.hatId);
      const normalizedWearer = normalizeAddress(vouch.wearer);

      if (!grouped[normalizedHatId]) {
        grouped[normalizedHatId] = {};
      }

      if (!grouped[normalizedHatId][normalizedWearer]) {
        grouped[normalizedHatId][normalizedWearer] = {
          wearer: vouch.wearer,
          wearerUsername: vouch.wearerUsername,
          hatId: vouch.hatId,
          vouchers: [],
          vouchCount: 0,
        };
      }

      // Add voucher to the list
      grouped[normalizedHatId][normalizedWearer].vouchers.push({
        address: vouch.voucher,
        username: vouch.voucherUsername,
        createdAt: vouch.createdAt,
      });

      // Use the latest vouchCount from the subgraph
      grouped[normalizedHatId][normalizedWearer].vouchCount = vouch.vouchCount;
    });

    return grouped;
  }, [data?.vouches]);

  // Create a map of membershipHatId by hatId for quick lookup
  const membershipHatIdsByHatId = useMemo(() => {
    const map = {};
    rolesWithVouching.forEach(role => {
      const normalizedHatId = normalizeHatId(role.hatId);
      map[normalizedHatId] = role.vouchingMembershipHatId || null;
    });
    return map;
  }, [rolesWithVouching]);

  /**
   * Get pending vouch requests grouped by role
   * Returns users who have at least one vouch but haven't reached quorum
   */
  const pendingVouchRequests = useMemo(() => {
    const requests = [];

    Object.entries(vouchesByHatAndWearer).forEach(([normalizedHatId, wearerMap]) => {
      const quorum = quorumsByHatId[normalizedHatId] || 0;
      const roleName = roleNamesByHatId[normalizedHatId] || 'Unknown Role';
      const membershipHatId = membershipHatIdsByHatId[normalizedHatId] || null;

      Object.values(wearerMap).forEach(wearerData => {
        // Use vouchers array length as source of truth for vouch count
        const actualVouchCount = wearerData.vouchers.length;

        // Include users who have vouches but haven't reached quorum
        // (those at or above quorum have already been auto-minted)
        if (actualVouchCount < quorum) {
          requests.push({
            ...wearerData,
            vouchCount: actualVouchCount, // Override with actual count
            normalizedHatId,
            quorum,
            roleName,
            membershipHatId, // Required for canVouch check
            progress: quorum > 0 ? actualVouchCount / quorum : 0,
          });
        }
      });
    });

    // Sort by most vouches first (closest to quorum)
    return requests.sort((a, b) => b.vouchCount - a.vouchCount);
  }, [vouchesByHatAndWearer, quorumsByHatId, roleNamesByHatId, membershipHatIdsByHatId]);

  /**
   * Group pending requests by role for display
   */
  const pendingRequestsByRole = useMemo(() => {
    const byRole = {};

    pendingVouchRequests.forEach(request => {
      if (!byRole[request.normalizedHatId]) {
        byRole[request.normalizedHatId] = {
          hatId: request.hatId,
          roleName: request.roleName,
          quorum: request.quorum,
          requests: [],
        };
      }
      byRole[request.normalizedHatId].requests.push(request);
    });

    return Object.values(byRole);
  }, [pendingVouchRequests]);

  /**
   * Check if the current user has already vouched for a specific wearer/hatId
   */
  const hasUserVouched = useCallback((wearerAddress, hatId) => {
    if (!normalizedUserAddress) return false;

    const normalizedHatId = normalizeHatId(hatId);
    const normalizedWearer = normalizeAddress(wearerAddress);

    const wearerData = vouchesByHatAndWearer[normalizedHatId]?.[normalizedWearer];
    if (!wearerData) return false;

    return wearerData.vouchers.some(
      v => normalizeAddress(v.address) === normalizedUserAddress
    );
  }, [normalizedUserAddress, vouchesByHatAndWearer]);

  /**
   * Get all vouchers for a specific wearer/hatId
   */
  const getVouchersForWearer = useCallback((wearerAddress, hatId) => {
    const normalizedHatId = normalizeHatId(hatId);
    const normalizedWearer = normalizeAddress(wearerAddress);

    return vouchesByHatAndWearer[normalizedHatId]?.[normalizedWearer]?.vouchers || [];
  }, [vouchesByHatAndWearer]);

  /**
   * Get vouch progress for a specific wearer/hatId
   */
  const getVouchProgress = useCallback((wearerAddress, hatId) => {
    const normalizedHatId = normalizeHatId(hatId);
    const normalizedWearer = normalizeAddress(wearerAddress);
    const quorum = quorumsByHatId[normalizedHatId] || 0;

    const wearerData = vouchesByHatAndWearer[normalizedHatId]?.[normalizedWearer];
    const current = wearerData?.vouchCount || 0;

    return {
      current,
      quorum,
      percentage: quorum > 0 ? Math.min((current / quorum) * 100, 100) : 0,
      isComplete: current >= quorum,
    };
  }, [vouchesByHatAndWearer, quorumsByHatId]);

  /**
   * Get all vouches the current user has given
   */
  const userGivenVouches = useMemo(() => {
    if (!normalizedUserAddress || !data?.vouches) return [];

    return data.vouches
      .filter(v => normalizeAddress(v.voucher) === normalizedUserAddress)
      .map(v => ({
        wearer: v.wearer,
        wearerUsername: v.wearerUsername,
        hatId: v.hatId,
        roleName: roleNamesByHatId[normalizeHatId(v.hatId)] || 'Unknown Role',
        createdAt: v.createdAt,
      }));
  }, [normalizedUserAddress, data?.vouches, roleNamesByHatId]);

  /**
   * Check if the current user can vouch (has the required membership hat)
   * @param {string} membershipHatId - The hat ID required to vouch
   * @param {Array} userHatIds - The current user's hat IDs
   */
  const canUserVouchForRole = useCallback((membershipHatId, userHatIds = []) => {
    if (!membershipHatId || !userHatIds.length) return false;

    const normalizedMembershipHatId = normalizeHatId(membershipHatId);
    const normalizedUserHatIds = userHatIds.map(id => normalizeHatId(id));

    return normalizedUserHatIds.includes(normalizedMembershipHatId);
  }, []);

  return {
    // Data
    vouches: data?.vouches || [],
    pendingVouchRequests,
    pendingRequestsByRole,
    userGivenVouches,

    // Helper functions
    hasUserVouched,
    getVouchersForWearer,
    getVouchProgress,
    canUserVouchForRole,

    // State
    loading,
    error,
    refetch,

    // Utilities
    normalizeHatId,
    normalizeAddress,
  };
}

export default useVouches;
