/**
 * useVoteActions — the cast + finalize transaction handlers PollDetail runs on.
 *
 * Every surface that mounts PollDetail needs the same two handlers, and both
 * must RETURN the `executeWithNotification` result so the modal can reconcile
 * its optimistic celebration when the transaction settles.
 *
 * The /voting board and the /votes archive each used to define their own copy.
 * The archive only copied the finalize half and passed `onVote={undefined}`, so
 * a live poll opened there (a `?poll=` deep link resolves against the ongoing
 * arrays too) offered a castable ballot whose cast resolved `void` — celebrated
 * as success with no transaction sent. One hook for both surfaces so the pair
 * can't drift apart again.
 *
 * `votingTypeSelected` comes from usePollNavigation and tracks the OPEN poll's
 * type, so the cast routes to the same contract PollDetail was handed as its
 * `contractAddress` prop.
 */

import { useCallback } from 'react';
import { useWeb3Services, useTransactionWithNotification } from './useWeb3Services';
import { VotingType } from '@/services/web3/domain/VotingService';
import { RefreshEvent } from '@/context/RefreshContext';

export function useVoteActions(votingTypeSelected) {
  const { voting, getNotReadyMessage } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  // The open poll's type, as the service layer names it. VotingService owns the
  // hybrid/DD dispatch for both verbs (castVote / announceWinner) — this hook
  // only decides which type to hand it.
  const type = votingTypeSelected === 'Direct Democracy'
    ? VotingType.DIRECT_DEMOCRACY
    : VotingType.HYBRID;

  // Both actions are reachable before the service layer finishes wiring up —
  // their UI gates are membership/lifecycle, not readiness — so `voting` can
  // still be null on click. Route that through executeWithNotification instead
  // of returning a bare failure: PollDetail's error screens have fixed copy, so
  // the toast is the only place the real reason ("still getting set up") lands.
  const notReady = useCallback(() => ({
    success: false,
    error: { userMessage: getNotReadyMessage?.() || 'Still getting set up — try again in a moment.' },
  }), [getNotReadyMessage]);

  // PollDetail's `onVote`. Must resolve `{ success }` — a resolve that can't
  // prove the cast landed is read as a failure (see lib/voting/txOutcome).
  const handleVote = useCallback(async (contractAddress, proposalId, optionIndices, weights) => {
    return executeWithNotification(
      () => (voting
        ? voting.castVote(type, contractAddress, proposalId, optionIndices, weights)
        : notReady()),
      {
        pendingMessage: 'Casting vote...',
        successMessage: 'Vote cast successfully!',
        refreshEvent: RefreshEvent.PROPOSAL_VOTED,
      }
    );
  }, [voting, executeWithNotification, type, notReady]);

  // PollDetail's `onFinalize` ("Count the votes"), routed through its confirm
  // dialog. Returns the result so the dialog can await it. PollDetail passes
  // `isHybrid` from the poll itself, so this one does NOT reuse `type` above.
  const handleFinalize = useCallback(async (contractAddress, proposalId, isHybrid = false) => {
    return executeWithNotification(
      () => (voting
        ? voting.announceWinner(
          isHybrid ? VotingType.HYBRID : VotingType.DIRECT_DEMOCRACY,
          contractAddress,
          proposalId,
        )
        : notReady()),
      {
        pendingMessage: 'Counting the votes...',
        successMessage: 'Result recorded on-chain!',
        refreshEvent: RefreshEvent.PROPOSAL_COMPLETED,
      }
    );
  }, [voting, executeWithNotification, notReady]);

  // `voting` + `executeWithNotification` are handed back so a surface that also
  // runs OTHER voting transactions (VotingPage creates proposals) can reuse this
  // hook's services instead of calling useWeb3Services a second time. Two
  // instances in one component means two txManagers, and the EIP-7702
  // "sponsorship failed, go direct for this session" kill switch is per-instance
  // — one would keep retrying a path the other already proved dead.
  return { handleVote, handleFinalize, voting, executeWithNotification };
}

export default useVoteActions;
