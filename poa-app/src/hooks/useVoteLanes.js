/**
 * useVoteLanes — the shared lane/feed selectors for the Wave-2 voting surfaces.
 *
 * Merges the four VotingContext arrays (hybrid + democracy, ongoing + completed)
 * into ONE canonical feed of proposals, each tagged with a `typeBadge`
 * ('BINDING' | 'POLL') and its viewer-eligibility, then derives the lifecycle
 * lanes the board renders. /votes and the dashboard consume the same `all` feed
 * so the definitions never drift between surfaces.
 *
 * Lanes (board):
 *   needsVote     — live, eligible, !userHasVoted   (accent lane)
 *   liveVotes     — live, (voted || ineligible)
 *   awaitingCount — isExpired && status Active
 *   recentOutcomes— completed, most-recent first
 *
 * Sort: live lanes ascending by endTimestamp (soonest-closing first);
 * outcomes descending by endTimestamp (most-recent first).
 */

import { useMemo } from 'react';
import { useVotingContext } from '@/context/VotingContext';
import { useUserContext } from '@/context/UserContext';
import { useVotingPower } from '@/hooks/useVotingPower';
import { BINDING_BADGE, POLL_BADGE } from '@/config/votingVocabulary';
import { lifecycleVariant, voterEligibility } from '@/components/voting/votingDisplay';

const byEndAsc = (a, b) => parseInt(a.endTimestamp || 0, 10) - parseInt(b.endTimestamp || 0, 10);
const byEndDesc = (a, b) => parseInt(b.endTimestamp || 0, 10) - parseInt(a.endTimestamp || 0, 10);

export function useVoteLanes() {
  const {
    hybridVotingOngoing = [],
    hybridVotingCompleted = [],
    democracyVotingOngoing = [],
    democracyVotingCompleted = [],
    ddVotingHats = null,
    votingClassesByVersion = {},
    loading,
    error,
  } = useVotingContext();
  const { userData, userDataLoading } = useUserContext();
  const { classBreakdown } = useVotingPower();

  const userHatIds = userData?.hatIds || [];
  // While the viewer's own hats/balance load, verdicts are indeterminate
  // (fail open) — otherwise every member cold-loads into "not eligible" and
  // the "Needs your vote" lane/badge undercounts until the user query lands.
  const userDataReady = !userDataLoading;

  // One canonical feed. Hybrid → BINDING, Direct Democracy → POLL. We also
  // annotate viewer-eligibility once here so every surface agrees — the FULL
  // verdict (poll restriction + DD votingHats + Hybrid class power), matching
  // PollDetail's ballot gate so the "Needs your vote" lane never advertises a
  // vote the ballot would refuse.
  const all = useMemo(() => {
    const userBalance = userData?.participationTokenBalanceWei || '0';
    const tag = (arr, typeBadge) =>
      (arr || []).map((p) => ({
        ...p,
        typeBadge,
        _eligible: voterEligibility(p, userHatIds, {
          ddVotingHats,
          classBreakdown,
          // Judge Hybrid eligibility against the proposal's own class-config
          // snapshot (what vote() enforces), falling back to current classes.
          proposalClasses: p.type === 'Hybrid' && p.classesVersion != null
            ? votingClassesByVersion?.[p.classesVersion] || null
            : null,
          userBalance,
          userDataReady,
        }).eligible,
      }));
    return [
      ...tag(hybridVotingOngoing, BINDING_BADGE),
      ...tag(hybridVotingCompleted, BINDING_BADGE),
      ...tag(democracyVotingOngoing, POLL_BADGE),
      ...tag(democracyVotingCompleted, POLL_BADGE),
    ];
  }, [
    hybridVotingOngoing,
    hybridVotingCompleted,
    democracyVotingOngoing,
    democracyVotingCompleted,
    userHatIds,
    userData,
    ddVotingHats,
    classBreakdown,
    votingClassesByVersion,
    userDataReady,
  ]);

  const lanes = useMemo(() => {
    const needsVote = [];
    const liveVotes = [];
    const awaitingCount = [];
    const recentOutcomes = [];

    for (const p of all) {
      const variant = lifecycleVariant(p);
      if (variant === 'completed') {
        recentOutcomes.push(p);
      } else if (variant === 'awaiting-finalize') {
        awaitingCount.push(p);
      } else if (p._eligible && !p.userHasVoted) {
        needsVote.push(p);
      } else {
        liveVotes.push(p);
      }
    }

    needsVote.sort(byEndAsc);
    liveVotes.sort(byEndAsc);
    awaitingCount.sort(byEndAsc);
    recentOutcomes.sort(byEndDesc);

    return { needsVote, liveVotes, awaitingCount, recentOutcomes };
  }, [all]);

  return { all, lanes, loading, error };
}

export default useVoteLanes;
