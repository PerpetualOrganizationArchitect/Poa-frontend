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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useAuth } from '@/context/AuthContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_AUTHORITY_MEMBERSHIPS, FETCH_USER_MEMBERSHIPS } from '@/util/queries';
import { normalizeAuthorityMemberships, normalizeMyMemberships } from '@/lib/accessV2/normalize';
import { RefreshEvent, useRefreshSubscription } from '@/context/RefreshContext';
import { useOrgAuthority } from './useOrgAuthority';
import { useAuthoritySubjects } from './useAuthoritySubjects';
import {
  AUTHORITY_MEMBERSHIP_PAGE_SIZE,
  fetchAllAuthorityMembershipRows,
} from '@/lib/accessV2/membershipPagination';

const MEMBERSHIP_REFRESH_EVENTS = [
  RefreshEvent.PROPOSAL_COMPLETED,
  RefreshEvent.ROLE_CLAIMED,
  RefreshEvent.ROLE_RENOUNCED,
  RefreshEvent.VOUCH_CHANGED,
  RefreshEvent.MEMBERSHIP_PENDING,
  RefreshEvent.MEMBERSHIP_CHANGED,
];

/** Every membership row that matters in the org (a member, or a claimable seat). */
export function useAuthorityMemberships() {
  const { subgraphUrl } = usePOContext();
  const client = useSubgraphClient(subgraphUrl);
  const authority = useOrgAuthority();
  const { compositions, groups } = useAuthoritySubjects();

  const {
    data,
    loading: firstPageLoading,
    error: firstPageError,
    refetch: refetchFirstPage,
  } = useQuery(FETCH_AUTHORITY_MEMBERSHIPS, {
    variables: {
      authority: authority.address,
      first: AUTHORITY_MEMBERSHIP_PAGE_SIZE,
      skip: 0,
    },
    skip: !authority.enabled || !authority.address,
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
    client,
  });

  const authorityKey = authority.enabled && authority.address
    ? String(authority.address).toLowerCase()
    : '';
  const [pagination, setPagination] = useState({
    authority: '',
    rows: [],
    loading: false,
    complete: false,
    error: null,
  });

  useEffect(() => {
    if (!authorityKey) {
      setPagination({
        authority: '',
        rows: [],
        loading: false,
        complete: false,
        error: null,
      });
      return undefined;
    }
    if (firstPageLoading || firstPageError) return undefined;

    let cancelled = false;
    setPagination((previous) => ({
      authority: authorityKey,
      rows: previous.authority === authorityKey ? previous.rows : [],
      loading: true,
      complete: false,
      error: null,
    }));

    const load = async () => {
      try {
        const rows = await fetchAllAuthorityMembershipRows({
          firstPage: data?.subjectMemberships,
          fetchPage: async ({ first, skip }) => {
            const result = await client.query({
              query: FETCH_AUTHORITY_MEMBERSHIPS,
              variables: { authority: authority.address, first, skip },
              // Additional pages are assembled locally. Keeping them out of Apollo's normalized
              // cache prevents their shared Subject objects from restarting this pagination run.
              fetchPolicy: 'no-cache',
            });
            return result?.data?.subjectMemberships;
          },
        });
        if (cancelled) return;
        setPagination({
          authority: authorityKey,
          rows,
          loading: false,
          complete: true,
          error: null,
        });
      } catch (paginationError) {
        if (cancelled) return;
        setPagination((previous) => ({
          authority: authorityKey,
          rows: previous.authority === authorityKey ? previous.rows : [],
          loading: false,
          complete: false,
          error: paginationError,
        }));
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    authority.address,
    authorityKey,
    client,
    data,
    firstPageError,
    firstPageLoading,
  ]);

  const refetch = useCallback(async () => {
    if (!authorityKey) return undefined;
    setPagination((previous) => ({
      authority: authorityKey,
      rows: previous.authority === authorityKey ? previous.rows : [],
      loading: true,
      complete: false,
      error: null,
    }));
    try {
      const result = await refetchFirstPage();
      return result;
    } catch (refetchError) {
      setPagination((previous) => ({
        authority: authorityKey,
        rows: previous.authority === authorityKey ? previous.rows : [],
        loading: false,
        complete: false,
        error: refetchError,
      }));
      throw refetchError;
    }
  }, [authorityKey, refetchFirstPage]);

  useRefreshSubscription(
    MEMBERSHIP_REFRESH_EVENTS,
    () => {
      if (authority.enabled && authority.address) refetch?.();
    },
    [authority.enabled, authority.address, refetch]
  );

  const paginationMatches = pagination.authority === authorityKey;
  const rows = paginationMatches ? pagination.rows : [];
  const error = firstPageError || (paginationMatches ? pagination.error : null);
  const complete = Boolean(
    authorityKey
    && paginationMatches
    && pagination.complete
    && !firstPageLoading
    && !firstPageError
  );
  const loading = Boolean(
    authorityKey
    && (firstPageLoading || (paginationMatches && pagination.loading) || (!error && !complete))
  );

  const value = useMemo(
    () => normalizeAuthorityMemberships(rows, compositions, groups),
    [rows, compositions, groups]
  );

  return {
    ...value,
    loading: authority.enabled ? loading : false,
    error: authority.enabled ? error : null,
    complete: authority.enabled ? complete : false,
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

  useRefreshSubscription(
    MEMBERSHIP_REFRESH_EVENTS,
    () => {
      if (authority.enabled && authority.address && user) refetch?.();
    },
    [authority.enabled, authority.address, user, refetch]
  );

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
