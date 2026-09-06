import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useWeb3Services } from '@/hooks/useWeb3Services';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@/util/queries';
import { getNetworkByChainId } from '@/config/networks';
import { useIPFScontext } from '@/context/ipfsContext';
import { prepareRoleEmailAllowlist } from '@/lib/accessV2/roleEmailAllowlist';
import { useOrgAuthority } from '@/hooks/accessV2/useOrgAuthority';

const pending = { ready: false, error: null };

/** Shared live configuration for both v2 role-creation entry points. */
export function useRoleCreationContext({ enabled, authority: authorityAddress }) {
  const authority = useOrgAuthority();
  const { orgId, orgChainId, subgraphUrl, treasuryContractAddress: executor, zkEmailInvitesAddress } = usePOContext();
  const services = useWeb3Services();
  const { addToIpfs, fetchFromIpfs } = useIPFScontext();
  const client = useSubgraphClient(subgraphUrl);
  const { data, loading: infraLoading, error: infraError, refetch: refetchInfrastructure } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    client, skip: !authority.enabled || !enabled || !subgraphUrl,
  });
  const orgRegistry = data?.poaManagerContracts?.[0]?.orgRegistryProxy || data?.orgRegistryContracts?.[0]?.id || '';
  const paymasterHub = data?.poaManagerContracts?.[0]?.paymasterHubProxy || '';
  const zkEmailAddress = /^0x0{40}$/i.test(zkEmailInvitesAddress || '') ? '' : zkEmailInvitesAddress;
  const nativeSymbol = getNetworkByChainId(orgChainId)?.nativeCurrency?.symbol || 'ETH';
  const identity = [orgChainId, orgId, authorityAddress, executor, orgRegistry, paymasterHub, zkEmailAddress].join(':');
  const [snapshot, setSnapshot] = useState(null);

  const read = useCallback(async (freshInfrastructure) => {
    if (!authority.enabled || !enabled || !authorityAddress || (infraLoading && !freshInfrastructure) || !services.roleCreation || !services.zkEmailInvites) return null;
    const registry = freshInfrastructure
      ? freshInfrastructure.poaManagerContracts?.[0]?.orgRegistryProxy || freshInfrastructure.orgRegistryContracts?.[0]?.id || '' : orgRegistry;
    const hub = freshInfrastructure ? freshInfrastructure.poaManagerContracts?.[0]?.paymasterHubProxy || '' : paymasterHub;
    const [sponsor, email, metadata] = await Promise.allSettled([
      services.roleCreation.getSponsorshipConfig({ paymasterHub: hub, executor, orgId, zkEmailAddress }),
      zkEmailAddress
        ? services.zkEmailInvites.getRoleEmailConfig(zkEmailAddress, authorityAddress, executor)
        : Promise.resolve({ ready: true, enabled: false, error: 'This org has no email verification module.' }),
      registry ? services.roleCreation.getMetadataAdmin(registry, orgId) : Promise.resolve(null),
    ]);
    return {
      identity: [orgChainId, orgId, authorityAddress, executor, registry, hub, zkEmailAddress].join(':'),
      orgRegistry: registry, paymasterHub: hub,
      sponsorshipConfig: sponsor.status === 'fulfilled' ? sponsor.value : {
        ready: true, canConfigure: false, readFailed: true,
        error: 'Could not check gas sponsorship. Retry before configuring sponsored gas.',
      },
      emailConfig: email.status === 'fulfilled' ? email.value : {
        ready: true, enabled: false, error: 'Could not check email verification for this org. Please retry.',
      },
      metadataAdminSubject: metadata.status === 'fulfilled' ? metadata.value : null,
    };
  }, [enabled, authority.enabled, authorityAddress, infraLoading, services.roleCreation, services.zkEmailInvites, orgChainId, paymasterHub, executor, orgId, zkEmailAddress, orgRegistry]);

  useEffect(() => {
    let active = true;
    read().then((value) => { if (active && value) setSnapshot(value); });
    return () => { active = false; };
  }, [read]);

  const refresh = useCallback(async () => {
    const infrastructure = await refetchInfrastructure();
    if (infrastructure.error) throw new Error('Could not reload this org’s configuration. Please retry.');
    const value = await read(infrastructure.data);
    if (!value) throw new Error('Role configuration is still loading. Please try again.');
    setSnapshot(value);
    return value;
  }, [read, refetchInfrastructure]);

  const prepareRoleEmail = useCallback((form, subjectId) => prepareRoleEmailAllowlist({
    form, subjectId, orgId,
    readActiveAllowlist: () => services.zkEmailInvites.getActiveAllowlist(zkEmailAddress),
    readEmailRegistered: (hash) => services.zkEmailInvites.isEmailRegistered(zkEmailAddress, hash),
    fetchDocument: fetchFromIpfs,
    uploadDocument: addToIpfs,
  }), [orgId, services.zkEmailInvites, zkEmailAddress, fetchFromIpfs, addToIpfs]);

  return useMemo(() => {
    const current = snapshot?.identity === identity ? snapshot : null;
    return {
      orgId, orgRegistry, paymasterHub, executor, zkEmailAddress,
      nativeSymbol,
      sponsorshipConfig: { ...(current?.sponsorshipConfig || pending), nativeSymbol },
      emailConfig: current?.emailConfig || pending,
      metadataAdminSubject: current?.metadataAdminSubject,
      configurationError: infraError ? 'Could not load this org’s configuration.' : null,
      refreshRoleCreation: refresh,
      prepareRoleEmail,
    };
  }, [snapshot, identity, orgId, orgRegistry, paymasterHub, executor, zkEmailAddress, nativeSymbol, infraError, refresh, prepareRoleEmail]);
}
