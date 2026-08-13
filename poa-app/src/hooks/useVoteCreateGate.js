/**
 * useVoteCreateGate
 *
 * Who may CREATE votes, per voting contract — the gate createProposal enforces
 * on-chain. The creator hats come from POContext's org query
 * (`votingHatPermissions`), i.e. the subgraph's HatPermission rows.
 *
 * These used to be read from the contracts with three extra eth_calls per mount,
 * because the hats are seeded inside initialize() without events and the
 * subgraph could not see them. subgraph-pop #186 closed that gap by backfilling
 * from the contracts' own getters at Initialized; verified 2026-08-13 to match
 * `creatorHats()` / `votingHats()` exactly on every live org, both chains.
 *
 * Reading them on-chain bought no freshness anyway: the other half of this
 * comparison — the viewer's own `userData.hatIds` — is `user.currentHatIds`
 * from the same subgraph, so index lag already gated the result. Two sources
 * only added RPC cost and a window where they disagreed.
 *
 * Fail-open: while the org query is in flight, or when it returns no creator
 * rows, the gate falls back to the legacy membership check so a subgraph hiccup
 * can never lock out real creators — the contract remains the enforcement point.
 * Note this hedge is the OPPOSITE of the contract's rule (an empty creator array
 * fails CLOSED: only the executor, i.e. a passed proposal, may create), so copy
 * built on these arrays must state the contract's rule, not inherit the hedge.
 *
 * Polls (DirectDemocracy) and binding proposals (Hybrid) have independent
 * creator sets, so both booleans are exposed; `canCreateAny` gates shared
 * entry points like the /voting "Create vote" button. The arrays themselves are
 * returned too, so the "Our rules" panel can describe the rule from the exact
 * data that enables the button.
 */

import { useMemo } from 'react';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { userWearsAnyHat } from '@/util/permissions';

export function useVoteCreateGate() {
  const {
    hybridVotingContractAddress,
    directDemocracyVotingContractAddress,
    votingHatPermissions,
    poContextLoading,
    error: orgError,
  } = usePOContext();
  const { hasMemberRole, userData } = useUserContext();

  return useMemo(() => {
    const userHatIds = userData?.hatIds || [];
    const bindingCreatorHatIds = votingHatPermissions?.bindingCreators || [];
    const pollCreatorHatIds = votingHatPermissions?.pollCreators || [];

    const gate = (address, creatorHats) => {
      if (!address) return false;
      if (poContextLoading || creatorHats.length === 0) return hasMemberRole;
      return hasMemberRole && userWearsAnyHat(userHatIds, creatorHats);
    };

    const canCreatePoll = gate(
      directDemocracyVotingContractAddress,
      pollCreatorHatIds
    );
    const canCreateProposal = gate(
      hybridVotingContractAddress,
      bindingCreatorHatIds
    );

    return {
      canCreatePoll,
      canCreateProposal,
      canCreateAny: canCreatePoll || canCreateProposal,
      creatorGateLoading: poContextLoading,
      // For surfaces that describe the rule rather than gate on it. `settled`
      // marks the org query having answered, so frame 0 — when the arrays are
      // still empty for want of data — describes nothing at all. `readFailed`
      // keeps a failed query distinct from a genuinely empty creator set, which
      // is a real (and much stronger) permission claim.
      bindingCreatorHatIds,
      pollCreatorHatIds,
      creatorGateSettled: !poContextLoading,
      bindingReadFailed: !!orgError,
      pollReadFailed: !!orgError,
      hasBinding: !!hybridVotingContractAddress,
      hasPolls: !!directDemocracyVotingContractAddress,
      isMember: hasMemberRole,
    };
  }, [
    votingHatPermissions,
    poContextLoading,
    orgError,
    hasMemberRole,
    userData,
    hybridVotingContractAddress,
    directDemocracyVotingContractAddress,
  ]);
}

export default useVoteCreateGate;
