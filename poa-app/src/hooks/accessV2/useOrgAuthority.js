/**
 * useOrgAuthority — THE feature-detection gate for access v2.
 *
 * Every v2 surface in this app hangs off this hook. It answers one question:
 *
 *     Is this org on the MembershipAuthority path, right now, on the endpoint we are reading?
 *
 * Both halves are load-bearing:
 *   • the SUBGRAPH half — the app reads the decentralised gateway endpoints, which lag Studio by a
 *     manual publish, and a single unknown field fails the whole document, so the v2 query is not
 *     even put on the wire until the capability probe passes;
 *   • the ORG half — the authority must exist AND be router-bound (the cutover). Deployed but
 *     unbound is `pending`: reads work, but the modules still resolve legacy Hats.
 *
 * `enabled === false` means the caller must render EXACTLY what it renders today. That is the
 * whole contract of this hook.
 */

import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { CAPABILITY } from '@/util/subgraphCapabilities';
import { FETCH_ORG_AUTHORITY } from '@/util/queries';
import { classifyAuthority, authorityStatusCopy } from '@/lib/accessV2/authority';
import { useSubgraphCapability } from './useSubgraphCapability';

export function useOrgAuthority() {
  const { orgId, subgraphUrl } = usePOContext();
  const client = useSubgraphClient(subgraphUrl);
  const capable = useSubgraphCapability(subgraphUrl, CAPABILITY.ACCESS_V2);

  const { data, loading, error, refetch } = useQuery(FETCH_ORG_AUTHORITY, {
    variables: { orgId },
    skip: !orgId || !capable,
    fetchPolicy: 'cache-and-network',
    client,
  });

  const authority = useMemo(
    () => classifyAuthority(data?.organization?.membershipAuthority, { capable }),
    [data, capable]
  );

  return useMemo(
    () => ({
      ...authority,
      capable,
      // `loading` is only meaningful once we know the endpoint can answer. An incapable endpoint
      // is a settled NO, never a spinner.
      loading: capable ? loading : false,
      error: capable ? error : null,
      statusCopy: authorityStatusCopy(authority),
      refetch,
    }),
    [authority, capable, loading, error, refetch]
  );
}

export default useOrgAuthority;
