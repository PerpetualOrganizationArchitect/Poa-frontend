/**
 * proposalReceipt — pull the on-chain proposal id out of a createProposal receipt.
 *
 * PURE (an ethers Interface built from event signatures — no provider, no ABI file).
 *
 * Needed because a proposal's id is assigned ON CHAIN and is the only stable handle for anything
 * that has to be remembered between "the proposal was created" and "someone finalises it" — see
 * `lib/accessV2/gasFloors`, which parks the builder's announceWinner gas floor against it.
 *
 * Both voting modules emit the id as the FIRST, UNINDEXED field of `NewProposal` /
 * `NewHatProposal`, so it lives in the data blob rather than a topic.
 */

import { utils } from 'ethers';

const PROPOSAL_EVENTS = [
  'event NewProposal(uint256 id, bytes title, bytes32 descriptionHash, uint8 numOptions, uint64 endTs, uint64 created)',
  'event NewHatProposal(uint256 id, bytes title, bytes32 descriptionHash, uint8 numOptions, uint64 endTs, uint64 created, uint256[] hatIds)',
  // Both voting modules emit this one (DirectDemocracyVoting.sol:150, HybridVotingCore.sol:24).
  'event ProposalExecutionFailed(uint256 indexed id, uint256 indexed winningIdx, bytes reason)',
];

const iface = new utils.Interface(PROPOSAL_EVENTS);

/**
 * @param {object} receipt - a transaction receipt (`{ logs: [{ address, topics, data }] }`)
 * @param {string} [contractAddress] - when given, only logs from this address are considered
 * @returns {string|null} the proposal id as a decimal string, or null if no such log is present
 */
export function parseCreatedProposalId(receipt, contractAddress) {
  const logs = receipt?.logs;
  if (!Array.isArray(logs)) return null;
  const want = contractAddress ? String(contractAddress).toLowerCase() : null;

  for (const log of logs) {
    if (!log) continue;
    if (want && String(log.address || '').toLowerCase() !== want) continue;
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === 'NewProposal' || parsed.name === 'NewHatProposal') {
        return parsed.args.id.toString();
      }
    } catch {
      // Not one of ours (the batch emits plenty of other logs) — keep looking.
    }
  }
  return null;
}

/**
 * Did the winning batch fail inside `announceWinner`?
 *
 * `announceWinner` wraps `executor.execute()` in a try/catch, so a batch that reverts (or, far more
 * often, runs OUT OF GAS — the estimator only ever prices the caught-failure path) leaves the
 * transaction SUCCESSFUL: the proposal is marked executed, `didExecute` is false, and the only
 * trace is this event. Without reading it the app shows "Result recorded on-chain!" over a
 * proposal where nothing happened.
 *
 * @param {object} receipt - a transaction receipt (`{ logs: [{ address, topics, data }] }`)
 * @param {string} [contractAddress] - when given, only logs from this address are considered
 * @returns {{ proposalId: string, winningIndex: number, reason: string }|null}
 */
export function parseExecutionFailure(receipt, contractAddress) {
  const logs = receipt?.logs;
  if (!Array.isArray(logs)) return null;
  const want = contractAddress ? String(contractAddress).toLowerCase() : null;

  for (const log of logs) {
    if (!log) continue;
    if (want && String(log.address || '').toLowerCase() !== want) continue;
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name !== 'ProposalExecutionFailed') continue;
      return {
        proposalId: parsed.args.id.toString(),
        winningIndex: Number(parsed.args.winningIdx.toString()),
        // Raw bytes — hand to `describeExecutionFailure` for the sentence.
        reason: String(parsed.args.reason || '0x'),
      };
    } catch {
      // Not one of ours — keep looking.
    }
  }
  return null;
}

export default parseCreatedProposalId;
