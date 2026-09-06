/** The authority gate fails closed; a failed read must never restore legacy controls. */
import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { CAPABILITY } from '@/util/subgraphCapabilities';
import { FETCH_ORG_AUTHORITY } from '@/util/queries';
import { classifyAuthority, authorityStatusCopy } from '@/lib/accessV2/authority';
import { useSubgraphCapabilityState } from './useSubgraphCapability';

export function useOrgAuthority() {
  const { orgId, subgraphUrl } = usePOContext();
  const client = useSubgraphClient(subgraphUrl);
  const capability = useSubgraphCapabilityState(subgraphUrl, CAPABILITY.ACCESS_V2);
  const capable = capability.supported;

  const { data, loading, error, refetch } = useQuery(FETCH_ORG_AUTHORITY, {
    variables: { orgId },
    skip: !orgId || !capable,
    fetchPolicy: 'cache-and-network',
    client,
  });

  const authority = useMemo(
    () => classifyAuthority(!error && data?.organization?.id === orgId ? data.organization.membershipAuthority : null, { capable }),
    [data, capable, orgId, error]
  );

  return useMemo(
    () => ({
      ...authority,
      capable,
      // Keep consumers out of the legacy branch until an unknown endpoint has been probed. Once
      // settled, an incapable endpoint is a NO (not a permanent spinner).
      loading: capability.loading || (capable ? loading : false),
      error: capable ? error : null,
      statusCopy: authorityStatusCopy(authority),
      refetch,
    }),
    [authority, capable, capability.loading, loading, error, refetch]
  );
}

export default useOrgAuthority;
