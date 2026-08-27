/**
 * MembershipAuthorityService — the direct-write surface of access v2.
 *
 * Everything a USER or a MANAGER does themselves goes through here; everything GOVERNANCE does is
 * a batch composed by `lib/accessV2/proposalBuilders` and submitted through `VotingService`.
 *
 * SPONSORSHIP. All of these selectors have entries in the paymaster's type-keyed global rulebook,
 * so a passkey user pays no gas. The hub prices sponsorship against the SUBJECT ids passed as
 * `paymasterHatIds` — which for v2 are subject ids, not hats, and are the same value either way
 * because a migrated org adopts its hatIds verbatim. Omitting them makes the manager fall back to
 * the user's existing hats, which is the right behaviour for an existing member and the WRONG one
 * for someone claiming their first role (they hold nothing yet) — so the claim paths pass them.
 *
 * PREFLIGHTS. `canClaim` / `canGrant` / `canRemove` exist because `announceWinner` swallows inner
 * reverts and a direct call's revert data is not much friendlier. Call them, render
 * `actionReasonCopy()` / `removalBlockers()`, and never let a user meet a raw revert.
 */

import MembershipAuthorityABI from '../../../../abi/MembershipAuthority.json';
import { requireAddress } from '../utils/validation';

const requireSubject = (subjectId) => {
  if (subjectId === null || subjectId === undefined || subjectId === '') {
    throw new Error('Subject id is required');
  }
  return String(subjectId);
};

export class MembershipAuthorityService {
  /**
   * @param {ContractFactory} contractFactory
   * @param {TransactionManager} transactionManager
   */
  constructor(contractFactory, transactionManager) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
  }

  _writable(authority) {
    requireAddress(authority, 'MembershipAuthority address');
    return this.factory.createWritable(authority, MembershipAuthorityABI);
  }

  _readonly(authority) {
    requireAddress(authority, 'MembershipAuthority address');
    return this.factory.createReadOnly(authority, MembershipAuthorityABI);
  }

  // ── user-driven ────────────────────────────────────────────────────────────────────────────

  /**
   * Accept a claimable seat. For a delegated OFFER this IS the finalize — before the pending
   * entry's `activatesAt` it reverts `NotYetActive`, which is why the offer UI shows a countdown.
   */
  async claim(authority, subjectId, options = {}) {
    const id = requireSubject(subjectId);
    return this.txManager.execute(this._writable(authority), 'claim', [id], {
      paymasterHatIds: [id],
      ...options,
    });
  }

  /** Resign. A sticky governance grant survives this and the seat stays claimable. */
  async renounce(authority, subjectId, options = {}) {
    return this.txManager.execute(
      this._writable(authority),
      'renounce',
      [requireSubject(subjectId)],
      options
    );
  }

  async vouch(authority, subjectId, user, options = {}) {
    requireAddress(user, 'User address');
    return this.txManager.execute(
      this._writable(authority),
      'vouch',
      [requireSubject(subjectId), user],
      options
    );
  }

  async revokeVouch(authority, subjectId, user, options = {}) {
    requireAddress(user, 'User address');
    return this.txManager.execute(
      this._writable(authority),
      'revokeVouch',
      [requireSubject(subjectId), user],
      options
    );
  }

  // ── delegated (manager) ────────────────────────────────────────────────────────────────────

  async delegatedGrant(authority, subjectId, user, options = {}) {
    requireAddress(user, 'User address');
    return this.txManager.execute(
      this._writable(authority),
      'delegatedGrant',
      [requireSubject(subjectId), user],
      options
    );
  }

  async delegatedOffer(authority, subjectId, user, options = {}) {
    requireAddress(user, 'User address');
    return this.txManager.execute(
      this._writable(authority),
      'delegatedOffer',
      [requireSubject(subjectId), user],
      options
    );
  }

  /**
   * @param {boolean} ban - false is SOFT and reverts `RemovalIneffective` when the target stays
   *   eligible; check `canRemove` first so the dialog can name the surviving source.
   */
  async delegatedRemove(authority, subjectId, user, ban = false, options = {}) {
    requireAddress(user, 'User address');
    return this.txManager.execute(
      this._writable(authority),
      'delegatedRemove',
      [requireSubject(subjectId), user, Boolean(ban)],
      options
    );
  }

  async delegatedUnremove(authority, subjectId, user, options = {}) {
    requireAddress(user, 'User address');
    return this.txManager.execute(
      this._writable(authority),
      'delegatedUnremove',
      [requireSubject(subjectId), user],
      options
    );
  }

  async finalize(authority, pendingId, options = {}) {
    return this.txManager.execute(
      this._writable(authority),
      'finalize',
      [String(pendingId)],
      options
    );
  }

  async cancel(authority, pendingId, options = {}) {
    return this.txManager.execute(this._writable(authority), 'cancel', [String(pendingId)], options);
  }

  /**
   * Permissionless repair of an accepted-but-ineligible member (a lapsed vouch quorum, a cleared
   * email flag, a flipped default). Anyone may call it — it is the thing that unblocks a
   * seat-capped role whose cap is held by ghosts.
   */
  async reconcile(authority, subjectId, users, options = {}) {
    const list = Array.isArray(users) ? users : [users];
    list.forEach((u) => requireAddress(u, 'User address'));
    return this.txManager.execute(
      this._writable(authority),
      'reconcile(uint256,address[])',
      [requireSubject(subjectId), list],
      options
    );
  }

  // ── preflights + reads ─────────────────────────────────────────────────────────────────────

  /** @returns {Promise<{reason: number, activatesAt: string, lapsedCandidate: string}>} */
  async canClaim(authority, subjectId, user) {
    requireAddress(user, 'User address');
    const r = await this._readonly(authority).canClaim(requireSubject(subjectId), user);
    return { reason: Number(r.reason ?? r[0]), activatesAt: String(r.activatesAt ?? r[1]), lapsedCandidate: r.lapsedCandidate ?? r[2] };
  }

  /** @returns {Promise<{reason: number, lapsedCandidate: string}>} */
  async canGrant(authority, subjectId, user) {
    requireAddress(user, 'User address');
    const r = await this._readonly(authority).canGrant(requireSubject(subjectId), user);
    return { reason: Number(r.reason ?? r[0]), lapsedCandidate: r.lapsedCandidate ?? r[1] };
  }

  /**
   * @returns {Promise<{reason: number, sourceSet: number}>} `sourceSet` is the enum-SET of
   *   surviving eligibility sources — feed it to `removalBlockers()` for source-accurate copy.
   */
  async canRemove(authority, subjectId, user, ban = false) {
    requireAddress(user, 'User address');
    const r = await this._readonly(authority).canRemove(requireSubject(subjectId), user, Boolean(ban));
    return { reason: Number(r.reason ?? r[0]), sourceSet: Number(r.sourceSet ?? r[1]) };
  }

  async isMember(authority, subjectId, user) {
    requireAddress(user, 'User address');
    return this._readonly(authority).isMember(requireSubject(subjectId), user);
  }

  /** The live fold for one (subject, user) — the escape hatch when the subgraph lags a block. */
  async getStatus(authority, subjectId, user) {
    requireAddress(user, 'User address');
    const r = await this._readonly(authority).getStatus(requireSubject(subjectId), user);
    return {
      accepted: Boolean(r.accepted ?? r[0]),
      eligible: Boolean(r.eligible_ ?? r[1]),
      acceptedAt: String(r.acceptedAt ?? r[2]),
      ruleKind: Number(r.ruleKind ?? r[3]),
    };
  }

  async hasPerm(authority, user, permKey, ctx) {
    requireAddress(user, 'User address');
    const word = await this._readonly(authority).hasPerm(user, permKey, ctx);
    return word.toString();
  }

  async paused(authority) {
    return this._readonly(authority).paused();
  }
}

export function createMembershipAuthorityService(factory, txManager) {
  return new MembershipAuthorityService(factory, txManager);
}
