/**
 * useEducationCreateGate
 *
 * Who may CREATE learning modules — the gate EducationHub.createModule
 * enforces on-chain (creatorHatIds, seeded at initialize() without events, so
 * the subgraph cannot supply them — poa-box/POP#171). Mirrors useVoteCreateGate:
 * chain-routed public client via useOnchainCreatorHats (cached across mounts),
 * failing OPEN to the legacy hasExecRole heuristic while the read is in
 * flight or unavailable so an RPC hiccup never hides the button from real
 * creators — the contract stays the enforcement point.
 */

import { useMemo } from 'react';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useOnchainCreatorHats } from '@/hooks/useOnchainCreatorHats';
import { userWearsAnyHat } from '@/util/permissions';

export function useEducationCreateGate() {
  // educationHubAddress is the RAW subgraph id — the zero address when the hub
  // is disabled (truthy!). educationHubEnabled carries the zero-check.
  const { educationHubAddress, educationHubEnabled, orgChainId } = usePOContext();
  const { hasExecRole, userData } = useUserContext();

  const { onchainCreatorRows, onchainCreatorLoading } = useOnchainCreatorHats({
    hybridVoting: null,
    directDemocracyVoting: null,
    taskManager: null,
    educationHub: educationHubEnabled ? educationHubAddress : null,
    chainId: orgChainId,
  });

  return useMemo(() => {
    const creatorHats = onchainCreatorRows
      .filter((r) => r.contractType === 'EducationHub' && r.permissionRole === 'Creator')
      .map((r) => r.hatId);
    if (!educationHubEnabled) {
      return { canCreateModule: false, educationGateLoading: false };
    }
    if (onchainCreatorLoading || creatorHats.length === 0) {
      // Loading / unreadable → legacy behavior, never a lockout.
      return { canCreateModule: hasExecRole, educationGateLoading: onchainCreatorLoading };
    }
    return {
      canCreateModule: userWearsAnyHat(userData?.hatIds || [], creatorHats),
      educationGateLoading: false,
    };
  }, [onchainCreatorRows, onchainCreatorLoading, hasExecRole, userData, educationHubEnabled]);
}

export default useEducationCreateGate;
