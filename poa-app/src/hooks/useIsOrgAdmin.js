/**
 * useIsOrgAdmin - Hook to check if a user is an org metadata admin
 * A metadata admin is someone who wears the topHat OR a configured metadata admin hat
 *
 * Logic mirrors the smart contract:
 * 1. If metadataAdminHatOf[orgId] != 0, check if user wears that hat
 * 2. Otherwise, fall back to checking if user wears the topHat
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { useUserContext } from '@/context/UserContext';
import { usePOContext } from '@/context/POContext';
import { useWeb3Services } from '@/hooks/useWeb3Services';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@/util/queries';
import OrgRegistryABI from '@/abi/OrgRegistry.json';

/**
 * Check if a user is an org admin
 * @param {string} orgId - The organization ID (bytes32)
 * @param {string} userAddress - The user's wallet address
 * @returns {Object} { isAdmin: boolean, loading: boolean, error: Error|null }
 */
export function useIsOrgAdmin(orgId, userAddress) {
  const { userData, loading: userLoading } = useUserContext();
  const { topHatId, poContextLoading } = usePOContext();
  const { factory, isReady } = useWeb3Services();

  // State for the configured metadata admin hat
  const [configuredMetadataAdminHat, setConfiguredMetadataAdminHat] = useState(null);
  const [metadataAdminHatLoading, setMetadataAdminHatLoading] = useState(true);
  const [metadataAdminHatError, setMetadataAdminHatError] = useState(null);

  // Fetch infrastructure addresses from subgraph
  const { data: infraData, loading: infraLoading } = useQuery(
    FETCH_INFRASTRUCTURE_ADDRESSES,
    { fetchPolicy: 'cache-first' }
  );

  const orgRegistryAddress = infraData?.poaManagerContracts?.[0]?.orgRegistryProxy || null;

  // Fetch the configured metadata admin hat from the contract
  useEffect(() => {
    const fetchMetadataAdminHat = async () => {
      // Skip if we don't have all required data
      if (!orgId || !orgRegistryAddress || !factory || !isReady) {
        setMetadataAdminHatLoading(false);
        return;
      }

      try {
        setMetadataAdminHatLoading(true);
        setMetadataAdminHatError(null);

        const contract = factory.createReadOnly(orgRegistryAddress, OrgRegistryABI);
        const metadataAdminHat = await contract.getOrgMetadataAdminHat(orgId);

        // metadataAdminHat is a BigNumber, convert to string for comparison
        // If it's 0, no metadata admin hat is configured (fall back to topHat)
        const metadataAdminHatStr = metadataAdminHat.toString();
        setConfiguredMetadataAdminHat(metadataAdminHatStr === '0' ? null : metadataAdminHatStr);
      } catch (error) {
        console.error('Error fetching metadata admin hat:', error);
        // If the function doesn't exist or contract isn't deployed, that's ok
        // Just use topHat as fallback
        setConfiguredMetadataAdminHat(null);
        setMetadataAdminHatError(error);
      } finally {
        setMetadataAdminHatLoading(false);
      }
    };

    fetchMetadataAdminHat();
  }, [orgId, orgRegistryAddress, factory, isReady]);

  const result = useMemo(() => {
    // Still loading
    const isLoading = userLoading || poContextLoading || infraLoading || metadataAdminHatLoading;
    if (isLoading) {
      return { isAdmin: false, loading: true, error: null };
    }

    // No user address
    if (!userAddress) {
      return { isAdmin: false, loading: false, error: null };
    }

    // Get user's current hat IDs
    const userHatIds = userData?.hatIds || [];
    if (userHatIds.length === 0) {
      return { isAdmin: false, loading: false, error: null };
    }

    // Convert hat IDs to strings for comparison (hat IDs can be BigInt)
    const userHatIdStrings = userHatIds.map(id => id.toString());

    // Check the effective metadata admin hat (configured or fallback to topHat)
    let effectiveMetadataAdminHat = configuredMetadataAdminHat;
    if (!effectiveMetadataAdminHat && topHatId) {
      effectiveMetadataAdminHat = topHatId.toString();
    }

    // No metadata admin hat available
    if (!effectiveMetadataAdminHat) {
      return { isAdmin: false, loading: false, error: null };
    }

    // Check if user wears the effective metadata admin hat
    const isAdmin = userHatIdStrings.includes(effectiveMetadataAdminHat);

    return {
      isAdmin,
      loading: false,
      error: metadataAdminHatError,
    };
  }, [
    userData,
    userAddress,
    topHatId,
    configuredMetadataAdminHat,
    userLoading,
    poContextLoading,
    infraLoading,
    metadataAdminHatLoading,
    metadataAdminHatError,
  ]);

  return result;
}

export default useIsOrgAdmin;
