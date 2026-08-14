/**
 * RoleManager election builder — pure.
 *
 * Elections are FRONTEND-COMPOSED batches (PLAN.md §1: no transferRole
 * primitive). For each candidate option the winning batch:
 *   1. revokeRole(roleId, loser) for every current wearer who is NOT the winner,
 *   2. grantRole(roleId, winner) for the elected candidate.
 *
 * The critical contract rule (PLAN.md §2.3): revokeRole only flips eligibility
 * via clearWearerEligibility. For an identity hat that is DEFAULT-ELIGIBLE
 * (genesis / adopted roles), clearing the explicit rule leaves the wearer still
 * eligible, so `balanceOf` never zeroes and the contract reverts
 * `RevokeIneffective`. For those roles the builder MUST pair an explicit
 * EligibilityModule.setWearerEligibility(loser, hatId, false, false) BEFORE the
 * revoke. RoleManager-created roles are always defaultEligible=false, so the
 * revoke alone suffices for them.
 *
 * grantRole handles the consent model itself: in-org winners are minted,
 * out-of-org winners get an offer (RoleOffered) they accept via EM.claimHats.
 */

import { utils } from 'ethers';
import RoleManagerABI from '../../../abi/RoleManager.json';
import { encodeGrantRole, encodeRevokeRole } from './encoding';

const emIface = new utils.Interface([
  'function setWearerEligibility(address wearer, uint256 hatId, bool eligible, bool standing)',
]);

const call = (target, data) => ({ target, value: '0', data });

const sameAddr = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Build the winning batch for a single candidate.
 *
 * @param {Object} opts
 * @param {string} opts.roleManagerAddress
 * @param {string} opts.eligibilityModuleAddress
 * @param {string|number} opts.roleId - RoleManager internal role id
 * @param {string} opts.hatId - identity hat id (for the eligibility flip)
 * @param {boolean} opts.roleDefaultEligible - true => pair setWearerEligibility(false,false)
 * @param {Array<{address:string}>|string[]} opts.incumbents - current wearers
 * @param {string|null} opts.winner - elected address, or null for a "No One" option
 * @returns {Array<{target,value,data}>}
 */
export function buildElectionOptionBatch({
  roleManagerAddress,
  eligibilityModuleAddress,
  roleId,
  hatId,
  roleDefaultEligible = false,
  incumbents = [],
  winner = null,
}) {
  const batch = [];
  const winnerAddr = winner ? String(winner) : null;

  const losers = (incumbents || [])
    .map((i) => (typeof i === 'string' ? i : i.address))
    .filter((addr) => addr && (!winnerAddr || !sameAddr(addr, winnerAddr)));

  for (const loser of losers) {
    // Default-eligible identity hats need the explicit ban BEFORE the revoke,
    // or revokeRole reverts RevokeIneffective (see module docstring).
    if (roleDefaultEligible) {
      batch.push(
        call(
          eligibilityModuleAddress,
          emIface.encodeFunctionData('setWearerEligibility', [loser, String(hatId), false, false]),
        ),
      );
    }
    batch.push(encodeRevokeRole(roleManagerAddress, roleId, loser));
  }

  // "No One" option => only revokes, no grant.
  if (winnerAddr) {
    batch.push(encodeGrantRole(roleManagerAddress, roleId, winnerAddr));
  }

  return batch;
}

/**
 * Build all option batches for an election proposal.
 *
 * @param {Object} opts - shared election context (see buildElectionOptionBatch)
 * @param {Array<{address:string, name?:string}>} opts.candidates
 * @param {boolean} [opts.includeNoOneOption=false]
 * @returns {{ batches: Array<Array>, optionNames: string[] }}
 */
export function buildElectionBatches(opts) {
  const { candidates = [], includeNoOneOption = false } = opts;
  const batches = [];
  const optionNames = [];

  for (const candidate of candidates) {
    optionNames.push(candidate.name || candidate.address);
    batches.push(buildElectionOptionBatch({ ...opts, winner: candidate.address }));
  }

  if (includeNoOneOption) {
    optionNames.push('No One');
    batches.push(buildElectionOptionBatch({ ...opts, winner: null }));
  }

  return { batches, optionNames };
}

/** Copy surfaced in the builder UI explaining the default-eligible revoke rule. */
export const REVOKE_RULE_COPY =
  'This role is open by default, so removing a holder also records an explicit “not eligible” mark for them — otherwise the removal would silently do nothing.';

export { RoleManagerABI };
