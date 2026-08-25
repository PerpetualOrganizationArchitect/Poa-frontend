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
 *
 * GATED ON `enabled`, NOT `migrated`. `migrated` is true the moment an authority exists, including
 * the PENDING window (deployed, not yet router-bound) during which every v2 surface renders only
 * the "being set up" banner. Gating on `migrated` put the 1000-row subjects document on the paid,
 * quota-metered gateway on every proposal-modal open for data nothing renders — and contradicted
 * this directory's stated contract ("nothing here puts a v2 query on the wire until the org's
 * authority is router-bound"). The same correction applies to every sibling hook.
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
    skip: !authority.enabled || !authority.address,
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
    enabled: authority.enabled,
    loading: authority.enabled ? loading : false,
    error: authority.enabled ? error : null,
    refetch,
  };
}

export default useAuthoritySubjects;
