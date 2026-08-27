/**
 * contractLimits — hard limits that live in the DEPLOYED CONTRACTS, mirrored once.
 *
 * Anything here is a number the chain will enforce whether or not the frontend agrees. A local
 * copy that drifts does not relax the limit; it just moves the failure from a friendly message to
 * a reverted transaction (and, for a sponsored user, a burned UserOp). So: ONE constant, cited to
 * its source line, and pinned by tests — offline against the ABIs, and against live deployments in
 * `contractLimits.live.test.js`.
 */

/**
 * Maximum calls in a single governance batch.
 *
 * Enforced in three independent places, all 20:
 *   • Executor.MAX_CALLS_PER_BATCH               (Executor.sol:45, checked at Executor.sol:210)
 *   • HybridVotingProposals.MAX_CALLS            (libs/HybridVotingProposals.sol:14, checked :212)
 *   • DirectDemocracyVoting.MAX_CALLS            (DirectDemocracyVoting.sol:21, checked :329)
 *
 * The voting-module checks fire at PROPOSAL CREATION (`revert VotingErrors.TooManyCalls`), so an
 * oversized batch cannot even be proposed — it is not a "the vote passes then execution fails"
 * situation. Verified 20 on live Gnosis deployments (Test6 executor + both voting modules).
 */
export const MAX_CALLS_PER_BATCH = 20;

export default { MAX_CALLS_PER_BATCH };
