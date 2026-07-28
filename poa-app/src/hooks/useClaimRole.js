/**
 * useClaimRole - Hook for claiming roles (hats) via EligibilityModule
 * Provides functions for claiming, vouching, revoking vouches, and role applications
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { useWeb3Services, useTransactionWithNotification } from './useWeb3Services';
import { useAuth } from '../context/AuthContext';
import { useIPFScontext } from '../context/ipfsContext';
import { usePOContext } from '../context/POContext';
import { FETCH_USER_ROLE_APPLICATIONS } from '../util/queries';
import { useSubgraphClient } from '../util/apolloClient';

/**
 * Hook for claiming roles and managing vouches
 * @param {string} eligibilityModuleAddress - Address of the EligibilityModule contract
 * @returns {Object} Claim functions and state
 */
export function useClaimRole(eligibilityModuleAddress) {
  const { eligibility, isReady } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const { accountAddress: userAddress } = useAuth();
  const { addToIpfs, ipfsCidToBytes32 } = useIPFScontext();
  const { subgraphUrl } = usePOContext();

  const client = useSubgraphClient(subgraphUrl);

  const [claimingHatId, setClaimingHatId] = useState(null);
  const [vouchingFor, setVouchingFor] = useState(null);
  const [revokingFor, setRevokingFor] = useState(null);
  const [applyingForHatId, setApplyingForHatId] = useState(null);
  const [withdrawingHatId, setWithdrawingHatId] = useState(null);
  // Fetch active role applications from subgraph instead of RPC calls
  const { data: roleAppData, refetch: refetchRoleApps } = useQuery(
    FETCH_USER_ROLE_APPLICATIONS,
    {
      variables: {
        eligibilityModuleId: eligibilityModuleAddress,
        applicant: userAddress,
      },
      skip: !eligibilityModuleAddress || !userAddress,
      fetchPolicy: 'cache-first',
      client,
    }
  );

  // Derive application statuses from subgraph data
  const applicationStatuses = useMemo(() => {
    const statuses = {};
    if (roleAppData?.roleApplications) {
      roleAppData.roleApplications.forEach(app => {
        statuses[app.hatId] = true;
      });
    }
    return statuses;
  }, [roleAppData]);

  /**
   * Claim a hat that the user is eligible for
   * @param {string} hatId - The hat ID to claim
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  const claimRole = useCallback(async (hatId) => {
    if (!eligibility || !eligibilityModuleAddress) {
      console.error('[useClaimRole] Service not ready or no eligibility module');
      return { success: false, error: new Error('We’re still getting things ready — please try again in a moment.') };
    }

    setClaimingHatId(hatId);

    try {
      const result = await executeWithNotification(
        () => eligibility.claimVouchedHat(eligibilityModuleAddress, hatId, { paymasterHatIds: [hatId] }),
        {
          pendingMessage: 'Claiming role...',
          successMessage: 'Role claimed successfully!',
          errorMessage: 'Failed to claim role',
          refreshEvent: 'role:claimed',
          refreshData: { hatId },
        }
      );

      return result;
    } finally {
      setClaimingHatId(null);
    }
  }, [eligibility, eligibilityModuleAddress, executeWithNotification]);

  /**
   * Vouch for another user to help them claim a hat
   * @param {string} wearerAddress - Address of the user to vouch for
   * @param {string} hatId - The hat ID to vouch for
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  const vouchFor = useCallback(async (wearerAddress, hatId) => {
    if (!eligibility || !eligibilityModuleAddress) {
      console.error('[useClaimRole] Service not ready or no eligibility module');
      return { success: false, error: new Error('We’re still getting things ready — please try again in a moment.') };
    }

    setVouchingFor({ address: wearerAddress, hatId });

    try {
      const result = await executeWithNotification(
        () => eligibility.vouchFor(eligibilityModuleAddress, wearerAddress, hatId),
        {
          pendingMessage: 'Submitting vouch...',
          successMessage: 'Vouch submitted successfully!',
          errorMessage: 'Failed to submit vouch',
          refreshEvent: 'role:vouched',
          refreshData: { wearerAddress, hatId },
        }
      );

      return result;
    } finally {
      setVouchingFor(null);
    }
  }, [eligibility, eligibilityModuleAddress, executeWithNotification]);

  /**
   * Revoke a previous vouch for a user
   * @param {string} wearerAddress - Address of the user whose vouch to revoke
   * @param {string} hatId - The hat ID for which to revoke the vouch
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  const revokeVouch = useCallback(async (wearerAddress, hatId) => {
    if (!eligibility || !eligibilityModuleAddress) {
      console.error('[useClaimRole] Service not ready or no eligibility module');
      return { success: false, error: new Error('We’re still getting things ready — please try again in a moment.') };
    }

    setRevokingFor({ address: wearerAddress, hatId });

    try {
      const result = await executeWithNotification(
        () => eligibility.revokeVouch(eligibilityModuleAddress, wearerAddress, hatId),
        {
          pendingMessage: 'Revoking vouch...',
          successMessage: 'Vouch revoked successfully!',
          errorMessage: 'Failed to revoke vouch',
          refreshEvent: 'role:vouch-revoked',
          refreshData: { wearerAddress, hatId },
        }
      );

      return result;
    } finally {
      setRevokingFor(null);
    }
  }, [eligibility, eligibilityModuleAddress, executeWithNotification]);

  /**
   * Batch-check whether the user has applied for each role
   * @param {string[]} hatIds - Array of hat IDs to check
   */
  const checkApplicationStatuses = useCallback(async () => {
    if (!eligibilityModuleAddress || !userAddress) return;
    await refetchRoleApps();
  }, [eligibilityModuleAddress, userAddress, refetchRoleApps]);

  /**
   * Check if the user has an active application for a hat
   * @param {string} hatId - Hat ID to check
   * @returns {boolean}
   */
  const hasApplied = useCallback((hatId) => {
    return applicationStatuses[hatId] || false;
  }, [applicationStatuses]);

  /**
   * Apply for a role by uploading application data to IPFS and calling the contract
   * @param {string} hatId - The hat ID to apply for
   * @param {Object} applicationData - Application data (notes, experience, etc.)
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  const applyForRole = useCallback(async (hatId, applicationData, sponsorshipHatIds = []) => {
    if (!eligibility || !eligibilityModuleAddress) {
      console.error('[useClaimRole] Service not ready or no eligibility module');
      return { success: false, error: new Error('We’re still getting things ready — please try again in a moment.') };
    }

    setApplyingForHatId(hatId);

    try {
      const ipfsResult = await addToIpfs(JSON.stringify(applicationData));
      const applicationHash = ipfsCidToBytes32(ipfsResult.path);

      // Gas sponsorship: the PaymasterHub only sponsors a hat-scoped UserOp when the
      // account is *eligible* for that hat (EligibilityModule.getWearerStatus). An
      // applicant is NOT yet eligible for the vouch-gated hat they're applying for —
      // that's the whole point of applying — so sponsoring via [hatId] makes
      // validatePaymasterUserOp revert (AA33) and the UserOp falls back to self-funded,
      // which then fails for any passkey user with no native balance. Sponsor via the
      // org's default-eligible quick-join hat(s) instead — the applicant IS eligible for
      // those (the same budget the join flow uses). When none are supplied (e.g. an
      // existing member applying), omit paymasterHatIds so the manager falls back to the
      // user's current hats.
      const paymasterHatIds = sponsorshipHatIds?.length ? sponsorshipHatIds : undefined;
      const result = await executeWithNotification(
        () => eligibility.applyForRole(
          eligibilityModuleAddress,
          hatId,
          applicationHash,
          paymasterHatIds ? { paymasterHatIds } : {},
        ),
        {
          pendingMessage: 'Submitting application...',
          successMessage: 'Application submitted!',
          errorMessage: 'Failed to submit application',
          refreshEvent: 'role:application-submitted',
          refreshData: { hatId },
        }
      );

      if (result.success) {
        await refetchRoleApps();
      }
      return result;
    } catch (error) {
      console.error('[useClaimRole] Error applying for role:', error);
      return { success: false, error };
    } finally {
      setApplyingForHatId(null);
    }
  }, [eligibility, eligibilityModuleAddress, executeWithNotification, addToIpfs, ipfsCidToBytes32, refetchRoleApps]);

  /**
   * Withdraw a previously submitted role application
   * @param {string} hatId - The hat ID to withdraw application from
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  const withdrawApplication = useCallback(async (hatId, sponsorshipHatIds = []) => {
    if (!eligibility || !eligibilityModuleAddress) {
      console.error('[useClaimRole] Service not ready or no eligibility module');
      return { success: false, error: new Error('We’re still getting things ready — please try again in a moment.') };
    }

    setWithdrawingHatId(hatId);

    try {
      // Same sponsorship rationale as applyForRole: an applicant who hasn't been
      // vouched in yet isn't eligible for the vouch-gated hat, so it can't sponsor the
      // withdrawal. Route gas through the default-eligible quick-join hat(s) they ARE
      // eligible for; omit when none are supplied so the manager uses the user's hats.
      const paymasterHatIds = sponsorshipHatIds?.length ? sponsorshipHatIds : undefined;
      const result = await executeWithNotification(
        () => eligibility.withdrawApplication(
          eligibilityModuleAddress,
          hatId,
          paymasterHatIds ? { paymasterHatIds } : {},
        ),
        {
          pendingMessage: 'Withdrawing application...',
          successMessage: 'Application withdrawn!',
          errorMessage: 'Failed to withdraw application',
          refreshEvent: 'role:application-withdrawn',
          refreshData: { hatId },
        }
      );

      if (result.success) {
        await refetchRoleApps();
      }
      return result;
    } catch (error) {
      console.error('[useClaimRole] Error withdrawing application:', error);
      return { success: false, error };
    } finally {
      setWithdrawingHatId(null);
    }
  }, [eligibility, eligibilityModuleAddress, executeWithNotification, refetchRoleApps]);

  // State check helpers
  const isClaimingHat = useCallback((hatId) => claimingHatId === hatId, [claimingHatId]);

  const isVouchingFor = useCallback((wearerAddress, hatId) => {
    if (!vouchingFor) return false;
    const normalizedVouchingAddr = vouchingFor.address?.toLowerCase();
    const normalizedWearerAddr = wearerAddress?.toLowerCase();
    return normalizedVouchingAddr === normalizedWearerAddr && vouchingFor.hatId === hatId;
  }, [vouchingFor]);

  const isRevokingFor = useCallback((wearerAddress, hatId) => {
    if (!revokingFor) return false;
    const normalizedRevokingAddr = revokingFor.address?.toLowerCase();
    const normalizedWearerAddr = wearerAddress?.toLowerCase();
    return normalizedRevokingAddr === normalizedWearerAddr && revokingFor.hatId === hatId;
  }, [revokingFor]);

  const isApplyingForHat = useCallback((hatId) => applyingForHatId === hatId, [applyingForHatId]);
  const isWithdrawingFromHat = useCallback((hatId) => withdrawingHatId === hatId, [withdrawingHatId]);

  return {
    // Actions
    claimRole,
    vouchFor,
    revokeVouch,
    applyForRole,
    withdrawApplication,
    checkApplicationStatuses,

    // State checks
    isClaimingHat,
    isVouchingFor,
    isRevokingFor,
    isApplyingForHat,
    isWithdrawingFromHat,
    hasApplied,
    isClaiming: claimingHatId !== null,
    isVouching: vouchingFor !== null,
    isRevoking: revokingFor !== null,
    isApplying: applyingForHatId !== null,
    isWithdrawing: withdrawingHatId !== null,

    // Readiness
    isReady: isReady && Boolean(eligibilityModuleAddress),
    hasEligibilityModule: Boolean(eligibilityModuleAddress),

    // User info
    userAddress,
  };
}

export default useClaimRole;
