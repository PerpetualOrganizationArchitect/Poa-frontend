/**
 * accessV2/sponsorship — what passkey members get for free, and where the boundary is.
 *
 * Pure budget encoders. setBudget is onlyOrgOperator: callers must first establish that the
 * org's Executor wears the admin/operator subject through the hub's configured Hats/router.
 * Per-org rules and protocol rules determine supported actions separately from these budgets.
 *
 * Units, straight from the contract: `capPerEpoch` is WEI of gas cost; `epochLen` is SECONDS,
 * bounded [1 hours, 365 days] (`MIN_EPOCH_LENGTH`/`MAX_EPOCH_LENGTH`). The per-subject budget key
 * is keccak256(abi.encodePacked(uint8(1), bytes32(subjectId))).
 */

import { utils } from 'ethers';
import { parseTokenAmount } from '@/util/formatToken';
import { authorityInterface } from '@/lib/accessV2/txBuilders';
import ZkEmailInvitesABI from '../../../abi/ZkEmailInvites.json';

/** PaymasterHub subject-type tags (PaymasterHub.sol). Only HAT is relevant to a role/subject. */
export const PAYMASTER_SUBJECT_TYPE = Object.freeze({ ACCOUNT: 0x00, HAT: 0x01, CLAIM: 0x05 });

/** MIN_EPOCH_LENGTH / MAX_EPOCH_LENGTH, in seconds. */
export const EPOCH_BOUNDS = Object.freeze({ minSecs: 60 * 60, maxSecs: 365 * 24 * 60 * 60 });

/**
 * Generous, finite defaults suitable for the contracts (uint128 cap, epoch within bounds).
 * A 30-day epoch and a 0.25-native cap comfortably covers a member's membership + task + voting
 * UserOps on an L2/sidechain (Gnosis xDAI, where every org here lives) without being unbounded.
 */
export const DEFAULT_SUBJECT_BUDGET = Object.freeze({
  capWei: '250000000000000000', // 0.25 native token per epoch
  capLabel: '0.25',
  epochSecs: 30 * 24 * 60 * 60, // 30 days
  epochLabel: '30 days',
});

export const DEFAULT_SPONSORSHIP = Object.freeze({ enabled: true, capNative: '0.25', epochDays: 30, supportPasskeys: true });
export const paymasterBudgetInterface = new utils.Interface([
  'function setBudget(bytes32 orgId, bytes32 subjectKey, uint128 capPerEpoch, uint32 epochLen)',
  'function setRulesBatch(bytes32 orgId, address[] targets, bytes4[] selectors, bool[] allowed, uint32[] maxCallGasHints)',
]);
const emailInterface = new utils.Interface(ZkEmailInvitesABI);

/**
 * The membership verbs a passkey member runs gas-free, straight from DefaultGlobalRules
 * (MEMBERSHIP_AUTHORITY_ID + ZKEMAIL_INVITES_ID). `maxGas` is the rulebook's gas hint (0 = no
 * explicit hint). These are protocol-managed; the panel lists them so a member knows what is
 * sponsored, and never implies the role vote can change them.
 */
export const SPONSORED_MEMBER_ACTIONS = Object.freeze([
  { selector: 'claim(uint256)', label: 'Claim a role', maxGas: 300000 },
  { selector: 'renounce(uint256)', label: 'Resign from a role', maxGas: 200000 },
  { selector: 'vouch(uint256,address)', label: 'Vouch for someone', maxGas: 0 },
  { selector: 'revokeVouch(uint256,address)', label: 'Take back a vouch', maxGas: 200000 },
  { selector: 'finalize(uint256)', label: 'Finalise a delegated action', maxGas: 600000 },
  { selector: 'cancel(uint256)', label: 'Cancel a pending action', maxGas: 200000 },
  { selector: 'claimRoleByEmail(...)', label: 'Claim a role by verified email', maxGas: 800000 },
  { selector: 'claimRoleByDomain(...)', label: 'Claim a role by email domain', maxGas: 800000 },
]);

/** The per-subject budget key PaymasterHub stores usage under: keccak256(0x01 ‖ bytes32(subjectId)). */
export function subjectBudgetKey(subjectId, subjectType = PAYMASTER_SUBJECT_TYPE.HAT) {
  const id = BigInt(String(subjectId ?? '0'));
  if (id <= 0n || id >= (1n << 256n)) throw new Error('A gas budget needs a valid subject.');
  return utils.solidityKeccak256(
    ['uint8', 'bytes32'],
    [subjectType, utils.hexZeroPad(utils.hexlify(id), 32)]
  );
}

/**
 * Validate a would-be budget against the contract's own bounds. Returns a member-facing reason or
 * null. All encoded amounts and durations must fit the contract without rounding.
 */
export function budgetError({ capWei, epochSecs } = {}) {
  let cap;
  try {
    cap = BigInt(String(capWei ?? ''));
  } catch {
    return 'Enter the sponsored-gas cap as a whole number of wei.';
  }
  if (cap <= 0n) return 'The sponsored-gas cap must be more than zero.';
  if (cap > (1n << 128n) - 1n) return 'The sponsored-gas cap is larger than the contract allows.';
  const secs = Number(epochSecs);
  if (!Number.isInteger(secs)) return 'The gas budget period must be a whole number of seconds.';
  if (secs < EPOCH_BOUNDS.minSecs) return 'The epoch must be at least 1 hour.';
  if (secs > EPOCH_BOUNDS.maxSecs) return 'The epoch can be at most 365 days.';
  return null;
}

export function sponsorshipAmounts(config = {}) {
  const cap = String(config.capNative ?? '').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(cap)) {
    throw new Error('Enter a gas sponsorship limit with at most 18 decimal places.');
  }
  const capWei = parseTokenAmount(cap).toString();
  const epochDays = Number(config.epochDays);
  if (!Number.isInteger(epochDays) || epochDays < 1 || epochDays > 365) {
    throw new Error('The gas sponsorship period must be a whole number from 1 to 365 days.');
  }
  const epochSecs = epochDays * 86400;
  const error = budgetError({ capWei, epochSecs });
  if (error) throw new Error(error);
  return { capWei, epochSecs };
}

export function sponsorshipError(config = {}) {
  if (!config.enabled) return null;
  try { sponsorshipAmounts(config); return null; } catch (error) { return error.message; }
}

/** Encoding is allowed only after a service has verified the Executor's operator permission. */
export function buildSubjectBudgetCall({ paymasterHub, orgId, subjectId, config, subjectType = PAYMASTER_SUBJECT_TYPE.HAT }) {
  if (!utils.isAddress(paymasterHub || '') || /^0x0{40}$/i.test(paymasterHub)) {
    throw new Error('The org’s gas sponsorship contract has not loaded.');
  }
  if (!utils.isHexString(orgId, 32) || /^0x0{64}$/i.test(orgId)) {
    throw new Error('The org id has not loaded.');
  }
  const { capWei, epochSecs } = sponsorshipAmounts(config);
  return {
    target: utils.getAddress(paymasterHub),
    value: '0',
    data: paymasterBudgetInterface.encodeFunctionData('setBudget', [
      orgId, subjectBudgetKey(subjectId, subjectType), capWei, epochSecs,
    ]),
  };
}

/** Org-local rules only; selectors come from the shipped ABIs, including both passkey proof shapes. */
export function buildPasskeyRulesCall({ paymasterHub, orgId, authority, zkEmailAddress, orgRegistry, editOrgDetails = false }) {
  const entries = [
    ['claim', 300000], ['renounce', 200000], ['vouch', 0], ['revokeVouch', 200000],
    ['delegatedGrant', 250000], ['delegatedOffer', 300000], ['delegatedRemove', 250000],
    ['delegatedUnremove', 200000], ['finalize', 600000], ['cancel', 200000],
  ].map(([name, hint]) => ({ target: authority, selector: authorityInterface.getSighash(name), hint }));
  if (zkEmailAddress) {
    for (const [name, hint] of [
      ['claimRoleByDomain', 800000], ['claimRoleByEmail', 800000],
      ['registerAndClaimByDomainWithPasskey', 1200000], ['registerAndClaimByEmailWithPasskey', 1200000],
    ]) entries.push({ target: zkEmailAddress, selector: emailInterface.getSighash(name), hint });
  }
  if (editOrgDetails && orgRegistry) entries.push({
    target: orgRegistry, selector: utils.id('updateOrgMetaAsAdmin(bytes32,bytes,bytes32)').slice(0, 10), hint: 0,
  });
  return {
    target: utils.getAddress(paymasterHub), value: '0',
    data: paymasterBudgetInterface.encodeFunctionData('setRulesBatch', [
      orgId, entries.map((e) => e.target), entries.map((e) => e.selector),
      entries.map(() => true), entries.map((e) => e.hint),
    ]),
  };
}

export const SPONSORSHIP_SCOPE_NOTE =
  'This limit is shared by everyone in the role. Sponsored actions depend on the org’s existing '
  + 'rules, fee limits and available gas funds. This vote does not change protocol rules.';
