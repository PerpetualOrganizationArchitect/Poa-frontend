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

import { MAX_CALLS_PER_BATCH } from '@/config/contractLimits';

/**
 * The ceiling IS the on-chain one — 20, from `config/contractLimits` — not a frontend policy
 * number.
 *
 * It used to be 24, chosen as "comfortably above a normal create-role batch". But both voting
 * modules revert `TooManyCalls` above 20 AT PROPOSAL CREATION (Executor enforces the same 20 at
 * execution), and buildCreateRoleBatch can legitimately reach the low 20s: createRole +
 * setSubjectDefault + up to 8 addRoleToGroup + up to a dozen permission rows + vouch + manager +
 * one call per initial holder. A 21-24 call batch therefore cleared this preflight and then
 * reverted on chain — a raw TooManyCalls, and for a sponsored passkey user a burned UserOp,
 * instead of the friendly message this check exists to give.
 *
 * Kept as a named export because it is what the hooks and wizard import; the VALUE has exactly one
 * definition.
 */
export const MAX_SPONSORED_CALLS = MAX_CALLS_PER_BATCH;

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
        `This change needs ${calls.length} steps, but a proposal can carry at most `
        + `${MAX_SPONSORED_CALLS}. Split it up — create the role first, then add the extra `
        + 'permissions or people in a second proposal. (Migration-scale batches are run from the '
        + 'org’s own wallet — talk to your admins.)',
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
