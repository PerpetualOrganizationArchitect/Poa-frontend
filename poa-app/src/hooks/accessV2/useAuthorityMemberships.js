/**
 * useAuthorityMemberships — the org-wide fold mirror, and one user's slice of it.
 *
 * ZERO eth_calls. `eligible` / `eligibilitySource` / `isMember` / `claimable` are recomputed by the
 * subgraph mapping on every relevant event, exactly mirroring the contract's fold — including
 * across the event-lag window (a vouch epoch reset or a subject-default flip emits only a config
 * event on chain; the mapping re-folds every accepted row itself, so the app never renders members
 * who silently lapsed).
 *
 * Both transforms are pure and unit-tested — see `lib/accessV2/normalize`.
 */

import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useAuth } from '@/context/AuthContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_AUTHORITY_MEMBERSHIPS, FETCH_USER_MEMBERSHIPS } from '@/util/queries';
import { normalizeAuthorityMemberships, normalizeMyMemberships } from '@/lib/accessV2/normalize';
import { useOrgAuthority } from './useOrgAuthority';
import { useAuthoritySubjects } from './useAuthoritySubjects';

/** Every membership row that matters in the org (a member, or a claimable seat). */
export function useAuthorityMemberships() {
  const { subgraphUrl } = usePOContext();
  const client = useSubgraphClient(subgraphUrl);
  const authority = useOrgAuthority();
  const { compositions, groups } = useAuthoritySubjects();

  const { data, loading, error, refetch } = useQuery(FETCH_AUTHORITY_MEMBERSHIPS, {
    variables: { authority: authority.address },
    skip: !authority.enabled || !authority.address,
    fetchPolicy: 'cache-and-network',
    client,
  });

  const value = useMemo(
    () => normalizeAuthorityMemberships(data?.subjectMemberships || [], compositions, groups),
    [data, compositions, groups]
  );

  return {
    ...value,
    loading: authority.enabled ? loading : false,
    error: authority.enabled ? error : null,
    enabled: authority.enabled,
    refetch,
  };
}

/**
 * One user's rows — "my roles" plus the CLAIMABLE panel.
 *
 * Claimable rows each carry WHY (offer / open role / vouch quorum / email verification / a
 * resigned-but-sticky seat held in reserve), straight from `eligibilitySource`. That badge is not
 * decoration: it is the difference between "accept this invitation" and "this role is open to
 * everyone", and between a seat you can take back and one you cannot.
 */
export function useMyMemberships(addressOverride) {
  const { subgraphUrl } = usePOContext();
  const { accountAddress } = useAuth();
  const client = useSubgraphClient(subgraphUrl);
  const authority = useOrgAuthority();

  const user = String(addressOverride || accountAddress || '').toLowerCase();

  const { data, loading, error, refetch } = useQuery(FETCH_USER_MEMBERSHIPS, {
    variables: { authority: authority.address, user },
    skip: !authority.enabled || !authority.address || !user,
    fetchPolicy: 'cache-and-network',
    client,
  });

  const value = useMemo(() => normalizeMyMemberships(data?.subjectMemberships || []), [data]);

  return {
    ...value,
    user,
    loading: authority.enabled ? loading : false,
    error: authority.enabled ? error : null,
    enabled: authority.enabled,
    paused: authority.paused,
    refetch,
  };
}

export default useAuthorityMemberships;
