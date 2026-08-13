/**
 * useRoleOffers — pending RoleManager role offers for the current user.
 *
 * A grantRole to a non-member records an OFFER (explicit EM eligibility +
 * RoleOffered event). The user accepts it with EligibilityModule.claimHats,
 * minting the identity hat plus every marker hat of the role's groups in ONE
 * sponsored tx (PLAN.md §1.4b). Marker hats are derived on the client from the
 * role's group memberships (lib/roleManager/claims.deriveClaimHats).
 *
 * Capability-gated: no query runs unless the endpoint serves the RoleManager
 * schema (CAPABILITY.ROLE_MANAGER), so old-subgraph orgs are unaffected.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { useWeb3Services, useTransactionWithNotification } from './useWeb3Services';
import { useAuth } from '../context/AuthContext';
import { usePOContext } from '../context/POContext';
import { FETCH_ROLE_OFFERS_FOR_USER } from '../util/queries';
import { useSubgraphClient } from '../util/apolloClient';
import { CAPABILITY, peekCapability, hasCapability } from '../util/subgraphCapabilities';
import { deriveClaimHats } from '../lib/roleManager/claims';

export function useRoleOffers() {
  const { eligibility } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const { accountAddress: userAddress } = useAuth();
  const { orgId, subgraphUrl, eligibilityModuleAddress, roleManagerEnabled } = usePOContext();
  const client = useSubgraphClient(subgraphUrl);

  const [capable, setCapable] = useState(
    () => peekCapability(subgraphUrl, CAPABILITY.ROLE_MANAGER) === true
  );
  useEffect(() => {
    let cancelled = false;
    if (peekCapability(subgraphUrl, CAPABILITY.ROLE_MANAGER) === true) { setCapable(true); return undefined; }
    if (subgraphUrl) {
      hasCapability(subgraphUrl, CAPABILITY.ROLE_MANAGER).then((ok) => { if (!cancelled) setCapable(Boolean(ok)); });
    }
    return () => { cancelled = true; };
  }, [subgraphUrl]);

  const [acceptingId, setAcceptingId] = useState(null);

  const { data, refetch } = useQuery(FETCH_ROLE_OFFERS_FOR_USER, {
    variables: { orgId, user: (userAddress || '').toLowerCase() },
    skip: !orgId || !userAddress || !capable || !roleManagerEnabled,
    fetchPolicy: 'cache-and-network',
    client,
  });

  const offers = useMemo(() => data?.roleOffers || [], [data]);

  /**
   * Accept a role offer: claimHats([identity, ...markers]) in one tx.
   * @param {Object} offer - a RoleOffer entity from the query
   */
  const acceptOffer = useCallback(async (offer) => {
    if (!eligibility || !eligibilityModuleAddress) {
      return { success: false, error: new Error('We’re still getting things ready — please try again in a moment.') };
    }
    const groups = (offer?.role?.groupMemberships || []).map((m) => ({
      markerHatId: m?.group?.markerHatId,
      isActive: true,
    }));
    const hatIds = deriveClaimHats({ hatId: offer.hatId }, groups);
    if (hatIds.length === 0) {
      return { success: false, error: new Error('This offer is missing its role hat.') };
    }

    setAcceptingId(offer.id);
    try {
      const result = await executeWithNotification(
        // Sponsor the whole claim set: identity hat first, then markers.
        () => eligibility.claimHats(eligibilityModuleAddress, hatIds, { paymasterHatIds: hatIds }),
        {
          pendingMessage: 'Accepting role...',
          successMessage: 'Role accepted!',
          errorMessage: 'Could not accept the role',
          refreshEvent: 'role:claimed',
          refreshData: { hatIds },
        }
      );
      if (result?.success) refetch?.();
      return result;
    } finally {
      setAcceptingId(null);
    }
  }, [eligibility, eligibilityModuleAddress, executeWithNotification, refetch]);

  return { offers, acceptOffer, acceptingId, refetchOffers: refetch };
}

export default useRoleOffers;
