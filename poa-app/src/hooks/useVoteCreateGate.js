/**
 * useVoteCreateGate
 *
 * Who may CREATE votes, per voting contract — the gate createProposal enforces
 * on-chain. Two sources, one answer; the rule itself lives in
 * `src/lib/voting/createGate.js` (pure, unit-tested — this file is only wiring).
 *
 * LEGACY ORG. The creator hats come from POContext's org query
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
 * ACCESS V2 ORG (`useOrgAuthority().enabled`). That HatPermission table is
 * FROZEN at cutover — a permission granted or revoked through the
 * MembershipAuthority never writes a row there. Reading it on a v2 org shows
 * the wrong affordance and walks members into an `Unauthorized()` revert, so
 * the gate switches to the authority: the viewer must be an active member of a
 * subject whose EFFECTIVE (group-folded) HV_CREATE / DD_CREATE is set, which is
 * exactly what `authority.hasPerm(user, KEY, ctx0)` folds on chain.
 *
 * Every v2 query here self-skips on a legacy org (`useOrgAuthority` gates on the
 * endpoint capability probe; the subject and membership hooks gate on
 * `authority.enabled`), so a legacy org puts nothing extra on the wire and gets
 * a byte-identical result. `hooks/accessV2/gating.test.js` enforces that.
 *
 * Fail-open: while a read is in flight, or when it returns no rows, the gate
 * falls back to the legacy membership check so a subgraph hiccup can never lock
 * out real creators — the contract remains the enforcement point. Note this
 * hedge is the OPPOSITE of the contract's rule (an empty creator set fails
 * CLOSED: only the executor, i.e. a passed proposal, may create), so copy built
 * on these arrays must state the contract's rule, not inherit the hedge.
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
import { useOrgAuthority } from '@/hooks/accessV2/useOrgAuthority';
import { useAuthoritySubjects } from '@/hooks/accessV2/useAuthoritySubjects';
import { useMyMemberships } from '@/hooks/accessV2/useAuthorityMemberships';
import { foldCreateGate } from '@/lib/voting/createGate';

export function useVoteCreateGate() {
  const {
    hybridVotingContractAddress,
    directDemocracyVotingContractAddress,
    votingHatPermissions,
    poContextLoading,
    error: orgError,
  } = usePOContext();
  const { hasMemberRole, userData } = useUserContext();

  const authority = useOrgAuthority();
  const {
    subjects,
    loading: subjectsLoading,
    error: subjectsError,
  } = useAuthoritySubjects();
  const {
    myRoles,
    loading: myRolesLoading,
    error: myRolesError,
  } = useMyMemberships();

  // The viewer's ACTIVE subjects (accepted && eligible) — the contract's `_isMember` set.
  const mySubjectIds = useMemo(
    () => (myRoles || []).map((m) => m.subjectId),
    [myRoles]
  );

  const authorityEnabled = !!authority.enabled;
  // One flag for "the v2 answer isn't in yet". The membership half matters as much as the
  // subject half: subjects-arrived-but-memberships-pending would read as "member of nothing",
  // i.e. a lockout, which is precisely what the hedge exists to prevent.
  const v2Loading = authorityEnabled && (!!subjectsLoading || !!myRolesLoading);

  return useMemo(
    () => foldCreateGate({
      authorityEnabled,
      subjects,
      mySubjectIds,
      legacyBindingCreatorHatIds: votingHatPermissions?.bindingCreators || [],
      legacyPollCreatorHatIds: votingHatPermissions?.pollCreators || [],
      userHatIds: userData?.hatIds || [],
      hasMemberRole,
      legacyLoading: poContextLoading,
      v2Loading,
      legacyReadFailed: !!orgError,
      v2ReadFailed: !!subjectsError || !!myRolesError,
      hasHybrid: !!hybridVotingContractAddress,
      hasPolls: !!directDemocracyVotingContractAddress,
    }),
    [
      authorityEnabled,
      subjects,
      mySubjectIds,
      votingHatPermissions,
      userData,
      hasMemberRole,
      poContextLoading,
      v2Loading,
      orgError,
      subjectsError,
      myRolesError,
      hybridVotingContractAddress,
      directDemocracyVotingContractAddress,
    ]
  );
}

export default useVoteCreateGate;
