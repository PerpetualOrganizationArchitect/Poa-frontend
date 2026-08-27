/**
 * accessV2/txBuilders — typed calldata for the MembershipAuthority write surface.
 *
 * PURE: every function returns `{ target, value, data }`, the shape the Executor batch takes and
 * the shape `TransactionManager` can send directly. Nothing here touches a provider, so all of it
 * is unit-testable against the real ABI.
 *
 * The ONE ethers Interface is built from the real artifact (`abi/MembershipAuthority.json`), not
 * from hand-written fragments — a signature drift then fails loudly at encode time instead of
 * producing a well-formed transaction that reverts on chain.
 *
 * SPONSORSHIP: the user-driven verbs (claim / renounce / vouch / revokeVouch) and the delegated
 * manager verbs (delegatedGrant / delegatedOffer / delegatedRemove / delegatedUnremove / finalize
 * / cancel) all have entries in the paymaster's global rulebook, so passkey users pay no gas.
 * `paymasterSubjects` names the subject ids the hub should price the sponsorship against.
 */

import { utils, constants } from 'ethers';
import MembershipAuthorityABI from '../../../abi/MembershipAuthority.json';
import { RULE_KIND_ENUM } from './rules';
import { encodeCaps } from './pendingActions';

export const authorityInterface = new utils.Interface(MembershipAuthorityABI);

/** Build one `{target, value, data}` call against the authority. */
function call(authority, fn, args) {
  if (!authority) throw new Error(`accessV2: ${fn} needs the authority address`);
  return {
    target: authority,
    value: '0',
    data: authorityInterface.encodeFunctionData(fn, args),
  };
}

const requireSubject = (subjectId, fn) => {
  if (subjectId === null || subjectId === undefined || subjectId === '') {
    throw new Error(`accessV2: ${fn} needs a subject id`);
  }
  return String(subjectId);
};

const requireUser = (user, fn) => {
  if (!user || !/^0x[0-9a-fA-F]{40}$/.test(user)) {
    throw new Error(`accessV2: ${fn} needs a user address`);
  }
  return user;
};

// ── User-driven verbs ─────────────────────────────────────────────────────────────────────────

/**
 * Accept a claimable seat. This is the v2 replacement for `EligibilityModule.claimHats` and, for
 * a delegated OFFER, it IS the finalize: the pending entry's re-checks run here and `acceptedAt`
 * is honest. Before the entry's `activatesAt` it reverts `NotYetActive` — the countdown UI exists
 * precisely so a user never hits that.
 *
 * There is no marker-hat list to assemble any more: group membership is derived, so one subject id
 * is the whole call.
 */
export function buildClaim(authority, subjectId) {
  return call(authority, 'claim', [requireSubject(subjectId, 'claim')]);
}

/**
 * Resign. Clears `accepted`, and clears the explicit grant when it is clearable. A STICKY
 * (delegable=false) governance grant SURVIVES — the seat is held in reserve and re-claimable.
 * `renounceCopy()` is what tells the user which of the two they are doing.
 */
export function buildRenounce(authority, subjectId) {
  return call(authority, 'renounce', [requireSubject(subjectId, 'renounce')]);
}

export function buildVouch(authority, subjectId, user) {
  return call(authority, 'vouch', [requireSubject(subjectId, 'vouch'), requireUser(user, 'vouch')]);
}

export function buildRevokeVouch(authority, subjectId, user) {
  return call(authority, 'revokeVouch', [
    requireSubject(subjectId, 'revokeVouch'),
    requireUser(user, 'revokeVouch'),
  ]);
}

// ── Delegated (manager) verbs — sponsored, delay-gated ────────────────────────────────────────

/** Delegated add of someone already in the org. Creates a pending Grant; `finalize` applies it. */
export function buildDelegatedGrant(authority, subjectId, user) {
  return call(authority, 'delegatedGrant', [
    requireSubject(subjectId, 'delegatedGrant'),
    requireUser(user, 'delegatedGrant'),
  ]);
}

/** Delegated invite of someone outside the org. The invitee's `claim` is the finalize. */
export function buildDelegatedOffer(authority, subjectId, user) {
  return call(authority, 'delegatedOffer', [
    requireSubject(subjectId, 'delegatedOffer'),
    requireUser(user, 'delegatedOffer'),
  ]);
}

/**
 * Delegated removal. `ban=false` is SOFT — it clears acceptance and the explicit ALLOW, and
 * REVERTS `RemovalIneffective` if the target still qualifies some other way (open role, live
 * vouch quorum, email verification, sticky grant). Call `canRemove` first and render
 * `removalBlockers()` rather than letting the user meet a revert.
 */
export function buildDelegatedRemove(authority, subjectId, user, ban = false) {
  return call(authority, 'delegatedRemove', [
    requireSubject(subjectId, 'delegatedRemove'),
    requireUser(user, 'delegatedRemove'),
    Boolean(ban),
  ]);
}

/**
 * Lift a delegation-authored ban and restore the claimable seat. Prior membership counts as
 * consent, so the un-removed member self-restores with no new invitation round-trip.
 */
export function buildDelegatedUnremove(authority, subjectId, user) {
  return call(authority, 'delegatedUnremove', [
    requireSubject(subjectId, 'delegatedUnremove'),
    requireUser(user, 'delegatedUnremove'),
  ]);
}

/** Apply a pending Grant or Remove once its review window has elapsed. */
export function buildFinalize(authority, pendingId) {
  if (pendingId === null || pendingId === undefined) {
    throw new Error('accessV2: finalize needs a pendingId');
  }
  return call(authority, 'finalize', [String(pendingId)]);
}

/** Withdraw a pending action. The acting manager OR governance may do this. */
export function buildCancel(authority, pendingId) {
  if (pendingId === null || pendingId === undefined) {
    throw new Error('accessV2: cancel needs a pendingId');
  }
  return call(authority, 'cancel', [String(pendingId)]);
}

// ── Governance verbs (composed into Executor batches by proposalBuilders) ─────────────────────

export function buildCreateRole(authority, { name, metadataCID = constants.HashZero, imageURI = '', maxMembers = 0 }) {
  return call(authority, 'createRole', [
    String(name || ''),
    metadataCID || constants.HashZero,
    String(imageURI || ''),
    Number(maxMembers) || 0,
  ]);
}

export function buildCreateGroup(authority, { name, metadataCID = constants.HashZero, imageURI = '', memberRoleIds = [] }) {
  return call(authority, 'createGroup', [
    String(name || ''),
    metadataCID || constants.HashZero,
    String(imageURI || ''),
    (memberRoleIds || []).map((id) => String(id)),
  ]);
}

export function buildRenameSubject(authority, subjectId, { name, metadataCID = constants.HashZero, imageURI = '' }) {
  return call(authority, 'renameSubject', [
    requireSubject(subjectId, 'renameSubject'),
    String(name || ''),
    metadataCID || constants.HashZero,
    String(imageURI || ''),
  ]);
}

export function buildSetMaxMembers(authority, subjectId, maxMembers) {
  return call(authority, 'setMaxMembers', [
    requireSubject(subjectId, 'setMaxMembers'),
    Number(maxMembers) || 0,
  ]);
}

/**
 * Flip a subject's default verdict.
 *
 * `force` is NOT a convenience flag: turning a default-ALLOW role into deny-by-default while it
 * has members lapses every member who had no other eligibility source. The contract demands the
 * flag so an unbounded lapse is a deliberate act rather than a side effect — pass it only after
 * the UI has said so out loud.
 */
export function buildSetSubjectDefault(authority, subjectId, allow, force = false) {
  return call(authority, 'setSubjectDefault', [
    requireSubject(subjectId, 'setSubjectDefault'),
    Boolean(allow),
    Boolean(force),
  ]);
}

export function buildSetPerm(authority, subjectId, permKey, ctx, word) {
  return call(authority, 'setPerm', [
    requireSubject(subjectId, 'setPerm'),
    permKey,
    ctx,
    String(word),
  ]);
}

export function buildClearPerm(authority, subjectId, permKey, ctx) {
  return call(authority, 'clearPerm', [requireSubject(subjectId, 'clearPerm'), permKey, ctx]);
}

export function buildAddRoleToGroup(authority, roleId, groupId) {
  return call(authority, 'addRoleToGroup', [
    requireSubject(roleId, 'addRoleToGroup'),
    requireSubject(groupId, 'addRoleToGroup'),
  ]);
}

export function buildRemoveRoleFromGroup(authority, roleId, groupId) {
  return call(authority, 'removeRoleFromGroup', [
    requireSubject(roleId, 'removeRoleFromGroup'),
    requireSubject(groupId, 'removeRoleFromGroup'),
  ]);
}

/**
 * Governance add of someone already in the org — the org acts, so acceptance is set directly.
 * `delegable` is the STICKY choice, and its default is TRUE everywhere in this codebase:
 * delegable=false locks the seat to governance forever and is an explicit opt-in.
 */
export function buildGrant(authority, subjectId, user, delegable = true) {
  return call(authority, 'grant', [
    requireSubject(subjectId, 'grant'),
    requireUser(user, 'grant'),
    Boolean(delegable),
  ]);
}

/** Governance invite of someone outside the org — they claim it themselves (consent model). */
export function buildOffer(authority, subjectId, user, delegable = true) {
  return call(authority, 'offer', [
    requireSubject(subjectId, 'offer'),
    requireUser(user, 'offer'),
    Boolean(delegable),
  ]);
}

export function buildWithdrawOffer(authority, subjectId, user) {
  return call(authority, 'withdrawOffer', [
    requireSubject(subjectId, 'withdrawOffer'),
    requireUser(user, 'withdrawOffer'),
  ]);
}

/** Governance removal. Same soft/hard semantics as the delegated one, with no delay. */
export function buildRemove(authority, subjectId, user, ban = false) {
  return call(authority, 'remove', [
    requireSubject(subjectId, 'remove'),
    requireUser(user, 'remove'),
    Boolean(ban),
  ]);
}

export function buildUnremove(authority, subjectId, user) {
  return call(authority, 'unremove', [
    requireSubject(subjectId, 'unremove'),
    requireUser(user, 'unremove'),
  ]);
}

/**
 * Write the rule slot directly. A governance write overwrites ANY existing rule in one call — a
 * vote implies the un-ban, so there is never a paired clear+grant.
 */
export function buildSetRule(authority, subjectId, user, kind, delegable = true) {
  const k = typeof kind === 'number' ? kind : RULE_KIND_ENUM[kind];
  if (k === undefined) throw new Error(`accessV2: unknown rule kind ${kind}`);
  return call(authority, 'setRule', [
    requireSubject(subjectId, 'setRule'),
    requireUser(user, 'setRule'),
    k,
    Boolean(delegable),
  ]);
}

export function buildClearRule(authority, subjectId, user) {
  return call(authority, 'clearRule', [
    requireSubject(subjectId, 'clearRule'),
    requireUser(user, 'clearRule'),
  ]);
}

export function buildConfigureVouchAttestor(authority, subjectId, quorum, voucherSubjectId) {
  return call(authority, 'configureVouchAttestor', [
    requireSubject(subjectId, 'configureVouchAttestor'),
    Number(quorum) || 0,
    String(voucherSubjectId ?? 0),
  ]);
}

export function buildResetVouchEpoch(authority, subjectId) {
  return call(authority, 'resetVouchEpoch', [requireSubject(subjectId, 'resetVouchEpoch')]);
}

export function buildClearUserVouches(authority, subjectId, user) {
  return call(authority, 'clearUserVouches', [
    requireSubject(subjectId, 'clearUserVouches'),
    requireUser(user, 'clearUserVouches'),
  ]);
}

/**
 * Set (or clear) the delegation on a subject. `managerSubject = 0` clears it, which is also what
 * kills every pending action that was authorised by it.
 */
export function buildSetManagerConfig(authority, subjectId, { managerSubjectId = 0, canGrant = false, canRemove = false, delaySecs = 0 } = {}) {
  return call(authority, 'setManagerConfig', [
    requireSubject(subjectId, 'setManagerConfig'),
    String(managerSubjectId ?? 0),
    encodeCaps({ canGrant, canRemove }),
    Number(delaySecs) || 0,
  ]);
}

export function buildSetPaused(authority, paused) {
  return call(authority, 'setPaused', [Boolean(paused)]);
}

/** Permissionless repair of an accepted-but-ineligible member. Anyone may call it. */
export function buildReconcile(authority, subjectId, users) {
  const list = Array.isArray(users) ? users : [users];
  return {
    target: authority,
    value: '0',
    // Two `reconcile` overloads exist; name the signature explicitly so ethers picks the right one.
    data: authorityInterface.encodeFunctionData('reconcile(uint256,address[])', [
      requireSubject(subjectId, 'reconcile'),
      list.map((u) => requireUser(u, 'reconcile')),
    ]),
  };
}
