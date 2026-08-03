/**
 * useVoteCreateGate
 *
 * Who may CREATE votes, per voting contract — the gate createProposal enforces
 * on-chain. Creator hats are seeded at initialize() without events, so the
 * subgraph cannot supply them (poa-box/POP#171); they are read from the
 * contracts via useOnchainCreatorHats (chain-routed public client, works for
 * unauthenticated visitors).
 *
 * Fail-open: while the read is in flight, or when it fails/returns empty, the
 * gate falls back to the legacy membership check so an RPC hiccup can never
 * lock out real creators — the contract remains the enforcement point.
 *
 * Polls (DirectDemocracy) and binding proposals (Hybrid) have independent
 * creator sets, so both booleans are exposed; `canCreateAny` gates shared
 * entry points like the /voting "Create vote" button.
 */

import { useMemo } from 'react';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useOnchainCreatorHats } from '@/hooks/useOnchainCreatorHats';
import { userWearsAnyHat } from '@/util/permissions';

export function useVoteCreateGate() {
  const {
    hybridVotingContractAddress,
    directDemocracyVotingContractAddress,
    orgChainId,
  } = usePOContext();
  const { hasMemberRole, userData } = useUserContext();

  const { onchainCreatorRows, onchainCreatorLoading } = useOnchainCreatorHats({
    hybridVoting: hybridVotingContractAddress || null,
    directDemocracyVoting: directDemocracyVotingContractAddress || null,
    taskManager: null,
    chainId: orgChainId,
  });

  return useMemo(() => {
    const userHatIds = userData?.hatIds || [];
    const hatsFor = (contractType) => onchainCreatorRows
      .filter((r) => r.contractType === contractType && r.permissionRole === 'Creator')
      .map((r) => r.hatId);

    const gate = (address, creatorHats) => {
      if (!address) return false;
      if (onchainCreatorLoading || creatorHats.length === 0) return hasMemberRole;
      return hasMemberRole && userWearsAnyHat(userHatIds, creatorHats);
    };

    const canCreatePoll = gate(
      directDemocracyVotingContractAddress,
      hatsFor('DirectDemocracyVoting')
    );
    const canCreateProposal = gate(
      hybridVotingContractAddress,
      hatsFor('HybridVoting')
    );

    return {
      canCreatePoll,
      canCreateProposal,
      canCreateAny: canCreatePoll || canCreateProposal,
      creatorGateLoading: onchainCreatorLoading,
    };
  }, [
    onchainCreatorRows,
    onchainCreatorLoading,
    hasMemberRole,
    userData,
    hybridVotingContractAddress,
    directDemocracyVotingContractAddress,
  ]);
}

export default useVoteCreateGate;
