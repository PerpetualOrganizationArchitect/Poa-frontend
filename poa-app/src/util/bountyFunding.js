/**
 * bountyFunding — solvency math for the task-reward pool.
 *
 * `completeTask` pays each ERC-20 bounty with a direct transfer from the
 * TaskManager's own balance, so a pool holding less than the sum of promised
 * bounties reverts exactly when someone finishes the work. These helpers turn
 * the treasury query's live bounty tasks into a per-token "promised" total so
 * the ledger can show the pool's balance next to what it owes.
 *
 * All amounts are base-unit (wei) decimal strings, per house convention.
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const toBigInt = (value) => {
  try {
    const n = BigInt(value || '0');
    return n > 0n ? n : 0n;
  } catch {
    return 0n;
  }
};

/**
 * Sum promised bounties per token across every live (not completed/cancelled)
 * bounty task, keyed by lowercased token address.
 *
 * @param {Array} projects - `organization.taskManager.projects` with the
 *   `bountyTasks` selection: [{ bountyTasks: [{ bountyToken, bountyPayout }] }]
 * @returns {Object<string, string>} lowercased token address → total wei string
 */
export function committedBountiesByToken(projects = []) {
  const totals = {};
  for (const project of projects || []) {
    for (const task of project?.bountyTasks || []) {
      const token = String(task?.bountyToken || '').toLowerCase();
      if (!token || token === ZERO_ADDRESS) continue;
      const amount = toBigInt(task?.bountyPayout);
      if (amount === 0n) continue;
      totals[token] = ((totals[token] ? BigInt(totals[token]) : 0n) + amount).toString();
    }
  }
  return totals;
}

/** How much the pool is short: max(committed − balance, 0), as a wei string. */
export function bountyShortfall(balance, committed) {
  const short = toBigInt(committed) - toBigInt(balance);
  return short > 0n ? short.toString() : '0';
}
