/**
 * useVouches - Hook for fetching and managing vouch data for an organization
 * Provides vouch status, progress, and helper functions for the vouching UI
 */

import { useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { useAccount } from 'wagmi';
import { FETCH_VOUCHES_FOR_ORG, FETCH_ALL_ROLE_APPLICATIONS } from '../util/queries';
import { useRefreshSubscription } from '../context/RefreshContext';
import { usePOContext } from '../context/POContext';
import { useSubgraphClient } from '../util/apolloClient';

/**
 * Normalize a hat ID to a canonical decimal string for consistent comparison.
 *
 * The subgraph emits hatId as a decimal string across the role, vouch, and
 * roleApplication entities alike (verified against live Gnosis data), so the
 * merge in this hook lines up today. We still route through BigInt so a
 * future hex-encoded source collapses to the same canonical key instead of
 * silently failing to match a quorum bucket or de-dup against vouched users.
 */
function normalizeHatId(id) {
  if (id === null || id === undefined) return '';
  const str = String(id).trim();
  if (str === '') return '';
  try {
    return BigInt(str).toString();
  } catch {
    // Non-numeric hatId should never happen; fall back to a lowercased string.
    return str.toLowerCase();
  }
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
  const { subgraphUrl } = usePOContext();
  const normalizedUserAddress = normalizeAddress(userAddress);

  const client = useSubgraphClient(subgraphUrl);

  // Fetch vouches from subgraph
  const { data, loading, error, refetch } = useQuery(FETCH_VOUCHES_FOR_ORG, {
    variables: { eligibilityModuleId: eligibilityModuleAddress },
    skip: !eligibilityModuleAddress,
    fetchPolicy: 'cache-first',
    client,
  });

  // Fetch on-chain role applications too — fresh applicants sit at 0 vouches and
  // therefore have no Vouch entity, so they only surface via roleApplications.
  const {
    data: applicationsData,
    loading: applicationsLoading,
    error: applicationsError,
    refetch: refetchApplications,
  } = useQuery(FETCH_ALL_ROLE_APPLICATIONS, {
    variables: { eligibilityModuleId: eligibilityModuleAddress },
    skip: !eligibilityModuleAddress,
    fetchPolicy: 'cache-first',
    client,
  });

  const refetchAll = useCallback(() => {
    refetch();
    refetchApplications();
  }, [refetch, refetchApplications]);

  // Role applications are supplementary — if that query fails, keep showing
  // vouches rather than erroring the whole section (see `error` in the return).
  useEffect(() => {
    if (applicationsError) {
      console.warn('useVouches: role applications query failed; pending on-chain applicants hidden until it recovers.', applicationsError);
    }
  }, [applicationsError]);

  // Refetch immediately — executeWithNotification already waited for the
  // subgraph to index the transaction block before emitting these events.
  useRefreshSubscription(
    [
      'role:vouched',
      'role:vouch-revoked',
      'role:claimed',
      'role:application-submitted',
      'role:application-withdrawn',
    ],
    useCallback(() => refetchAll(), [refetchAll])
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

  // Group active role applications by hatId -> applicant. These are users who
  // applied on-chain but may have 0 vouches (no Vouch entity exists for them).
  const applicationsByHatAndApplicant = useMemo(() => {
    if (!applicationsData?.roleApplications) return {};

    const grouped = {};

    applicationsData.roleApplications.forEach(application => {
      const normalizedHatId = normalizeHatId(application.hatId);
      const normalizedApplicant = normalizeAddress(application.applicant);

      if (!grouped[normalizedHatId]) {
        grouped[normalizedHatId] = {};
      }

      grouped[normalizedHatId][normalizedApplicant] = {
        wearer: application.applicant,
        wearerUsername: application.applicantUsername,
        hatId: application.hatId,
        appliedAt: application.appliedAt,
      };
    });

    return grouped;
  }, [applicationsData?.roleApplications]);

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
   * Returns:
   *  - users who have at least one vouch but haven't reached quorum, AND
   *  - users who applied on-chain but sit at 0 vouches (no Vouch entity yet)
   * De-duped by (normalized hatId, applicant/wearer address).
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

    // Merge in on-chain applicants with 0 vouches. Only consider roles we know
    // are vouching-enabled (present in quorumsByHatId); de-dupe against anyone
    // who already has a Vouch entity above.
    Object.entries(applicationsByHatAndApplicant).forEach(([normalizedHatId, applicantMap]) => {
      if (!(normalizedHatId in quorumsByHatId)) return;

      const quorum = quorumsByHatId[normalizedHatId] || 0;
      const roleName = roleNamesByHatId[normalizedHatId] || 'Unknown Role';
      const membershipHatId = membershipHatIdsByHatId[normalizedHatId] || null;

      Object.entries(applicantMap).forEach(([normalizedApplicant, applicantData]) => {
        // Skip if this applicant already surfaced through the vouches loop
        if (vouchesByHatAndWearer[normalizedHatId]?.[normalizedApplicant]) return;

        requests.push({
          ...applicantData,
          vouchers: [],
          vouchCount: 0,
          normalizedHatId,
          quorum,
          roleName,
          membershipHatId, // Required for canVouch check
          progress: 0,
        });
      });
    });

    // Sort by most vouches first (closest to quorum); break ties between
    // fresh 0-vouch applicants by newest application first.
    return requests.sort((a, b) => {
      if (b.vouchCount !== a.vouchCount) return b.vouchCount - a.vouchCount;
      return (Number(b.appliedAt) || 0) - (Number(a.appliedAt) || 0);
    });
  }, [vouchesByHatAndWearer, applicationsByHatAndApplicant, quorumsByHatId, roleNamesByHatId, membershipHatIdsByHatId]);

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
      // Require a KNOWN, positive quorum. quorum === 0 is the "unknown / not yet
      // loaded" sentinel (quorumsByHatId[...] || 0) — without this guard a brand-new
      // applicant with 0 vouches reads `0 >= 0` → isComplete:true, surfacing a
      // misleading "0 / 0 (Complete!)" while the Complete-Join button (which itself
      // requires quorum > 0) stays hidden, stranding the user mid-join.
      isComplete: quorum > 0 && current >= quorum,
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

    const canVouch = normalizedUserHatIds.includes(normalizedMembershipHatId);

    return canVouch;
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
    loading: loading || applicationsLoading,
    // applicationsError must NOT hide the vouches list — it degrades to "no
    // applicants shown" and is logged via the warn effect above.
    error,
    refetch: refetchAll,

    // Utilities
    normalizeHatId,
    normalizeAddress,
  };
}

export default useVouches;
