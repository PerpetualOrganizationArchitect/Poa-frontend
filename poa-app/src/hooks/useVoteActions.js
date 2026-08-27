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
import { useNotification } from '@/context/NotificationContext';
import { VotingType } from '@/services/web3/domain/VotingService';
import { RefreshEvent } from '@/context/RefreshContext';
import { readGasFloor, clearGasFloor, gasFloorOptions } from '@/lib/accessV2/gasFloors';
import { parseExecutionFailure } from '@/lib/voting/proposalReceipt';
import { describeExecutionFailure } from '@/lib/errors/contractErrors';

export function useVoteActions(votingTypeSelected) {
  const { voting, getNotReadyMessage } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const { addNotification } = useNotification();
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
  //
  // GAS FLOOR: announceWinner runs the winning batch inside a try/catch, so every estimator —
  // `eth_estimateGas`, the wallet, the bundler — prices only the cheap caught-failure path. An
  // under-funded call therefore SUCCEEDS while silently skipping the batch (CLAUDE.md's loudest
  // gotcha; Test6 proposal #23 no-op'd at ~29k). When the proposal was created in this browser
  // with a known-expensive batch, its builder parked a floor — apply it to THIS transaction, the
  // only one that can use it. `gasFloorOptions` feeds both managers (`gasLimit` for the EOA path,
  // `callGasLimitFloor` for the 4337 path, both floors over the estimate, never caps).
  const handleFinalize = useCallback(async (contractAddress, proposalId, isHybrid = false) => {
    const floor = readGasFloor(contractAddress, proposalId);

    const result = await executeWithNotification(
      () => (voting
        ? voting.announceWinner(
          isHybrid ? VotingType.HYBRID : VotingType.DIRECT_DEMOCRACY,
          contractAddress,
          proposalId,
          gasFloorOptions(floor),
        )
        : notReady()),
      {
        pendingMessage: 'Counting the votes...',
        successMessage: 'Result recorded on-chain!',
        refreshEvent: RefreshEvent.PROPOSAL_COMPLETED,
      }
    );

    // Settled — announceWinner can only run once per proposal, so the floor is spent either way.
    // (Only on success: a failed send can be retried and would want the floor again.)
    if (result?.success && floor) clearGasFloor(contractAddress, proposalId);

    // A SUCCESSFUL announceWinner can still have applied nothing: the winning batch runs inside a
    // try/catch, so a revert (or an out-of-gas, the common case) is swallowed and surfaces ONLY as
    // `ProposalExecutionFailed`. Say so — the success toast alone is a lie, and the subgraph copy
    // that would eventually say it is a refetch away. Purely additive: the count DID land, so the
    // result stays `success` and PollDetail's confirm dialog still closes.
    if (result?.success && result?.receipt) {
      const failure = parseExecutionFailure(result.receipt, contractAddress);
      if (failure) {
        addNotification(
          describeExecutionFailure(failure.reason)
            || 'The votes were counted, but the winning action failed to run on-chain.',
          'error'
        );
      }
    }

    return result;
  }, [voting, executeWithNotification, notReady, addNotification]);

  // `voting` + `executeWithNotification` are handed back so a surface that also
  // runs OTHER voting transactions (VotingPage creates proposals) can reuse this
  // hook's services instead of calling useWeb3Services a second time. Two
  // instances in one component means two txManagers, and the EIP-7702
  // "sponsorship failed, go direct for this session" kill switch is per-instance
  // — one would keep retrying a path the other already proved dead.
  return { handleVote, handleFinalize, voting, executeWithNotification };
}

export default useVoteActions;
