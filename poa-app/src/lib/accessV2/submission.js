/**
 * accessV2/submission — the pre-flight every governance batch goes through before it is sent.
 *
 * PURE, so the rule is testable rather than buried in a hook.
 *
 * The rule that matters: a SEED- or CUTOVER-scale batch must not go through the sponsored path.
 * Those are the migration ceremonies — hundreds of subjects/rules/perm rows — they are far outside
 * the paymaster rulebook's gas hints, and the runbook runs them from a funded EOA. An ordinary
 * role-creation proposal is a handful of calls and goes through the normal sponsored flow like any
 * other proposal, so the cut is a size check, not a per-verb allow-list.
 */

/**
 * Above this many calls a batch is a migration ceremony, not a proposal.
 * A create-role batch with a group, six permissions and five initial holders is 13 calls, so the
 * ceiling leaves ordinary governance plenty of room while still catching a seed.
 */
export const MAX_SPONSORED_CALLS = 24;

/**
 * @param {Array} batch - `{target,value,data}[]`
 * @returns {{ ok: boolean, code: string|null, message: string|null }}
 */
export function checkBatchSubmittable(batch) {
  const calls = Array.isArray(batch) ? batch : [];

  if (calls.length === 0) {
    return {
      ok: false,
      code: 'empty',
      message: 'Nothing to propose — no changes were selected.',
    };
  }

  if (calls.length > MAX_SPONSORED_CALLS) {
    return {
      ok: false,
      code: 'too-large',
      message:
        `This change needs ${calls.length} steps, which is too large for a normal proposal. `
        + 'Migration-scale batches are run from the org’s own wallet — talk to your admins.',
    };
  }

  const bad = calls.findIndex((c) => !c || !c.target || !c.data);
  if (bad !== -1) {
    return {
      ok: false,
      code: 'malformed',
      message: 'Something went wrong building this proposal — please start again.',
    };
  }

  return { ok: true, code: null, message: null };
}
