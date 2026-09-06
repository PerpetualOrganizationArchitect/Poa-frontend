/** Voting creator gates use current authority subjects and active memberships. Failed reads deny creation. */
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
