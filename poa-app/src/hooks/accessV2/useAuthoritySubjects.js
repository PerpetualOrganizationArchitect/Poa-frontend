/**
 * useAuthoritySubjects — the org's roles and groups, with their wiring.
 *
 * Feeds the roles/groups admin page, the create-role wizard's group picker, and the subject picker
 * for restricted polls. The transform is `lib/accessV2/normalize.normalizeAuthoritySubjects` —
 * pure, and unit-tested against fixtures from the real schema, because React-coupled code has no
 * unit harness here.
 *
 * Returns a LEGACY-COMPATIBLE projection alongside the v2 shape: every role also carries `hatId` /
 * `name` / `image` / `canVote` and there is a `roleNames` map, because a migrated org ADOPTS its
 * hatIds verbatim as subject ids.
 *
 * Silent when the org is not on the v2 path — no query, empty arrays.
 */

import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_AUTHORITY_SUBJECTS } from '@/util/queries';
import { normalizeAuthoritySubjects } from '@/lib/accessV2/normalize';
import { useOrgAuthority } from './useOrgAuthority';

export function useAuthoritySubjects() {
  const { subgraphUrl } = usePOContext();
  const client = useSubgraphClient(subgraphUrl);
  const authority = useOrgAuthority();

  const { data, loading, error, refetch } = useQuery(FETCH_AUTHORITY_SUBJECTS, {
    variables: { authority: authority.address },
    skip: !authority.migrated || !authority.address,
    fetchPolicy: 'cache-and-network',
    client,
  });

  const value = useMemo(
    () => normalizeAuthoritySubjects(data?.membershipAuthorityContract?.subjects || []),
    [data]
  );

  return {
    ...value,
    authority,
    enabled: authority.migrated,
    loading: authority.migrated ? loading : false,
    error: authority.migrated ? error : null,
    refetch,
  };
}

export default useAuthoritySubjects;
