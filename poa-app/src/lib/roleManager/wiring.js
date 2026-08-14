/**
 * RoleManager wiring — pure config → RoleWiring struct + validation guards.
 *
 * The RoleManager contract (src/RoleManager.sol) applies a typed permission
 * fan-out via the `RoleWiring` struct. This module is the single, ethers-free
 * place that:
 *   1. describes the canonical RoleWiring shape + defaults,
 *   2. maps the wizard's `roleConfig` UI state onto that shape, and
 *   3. mirrors the contract's `WiringIncompatible` guards so the wizard blocks
 *      an invalid proposal BEFORE it is voted on (the contract would revert
 *      inside announceWinner's try/catch and silently no-op otherwise — see
 *      CLAUDE.md's announceWinner gas gotcha).
 *
 * Contract guard reference (IRoleManager.RoleWiring natspec / RoleManager.sol):
 *   - vouching requires combine=true (vouchingEnabled && !vouchCombine reverts) —
 *     combine=false breaks the grant/offer consent model.
 *   - vouching may not be enabled on a group marker hat (blocks the derived path).
 *   - quickJoinAutoMint may not be set on a non-default-eligible hat. createRole
 *     ALWAYS creates identity hats with defaultEligible=false, so a NEW role can
 *     never enable quickJoinAutoMint (it would brick QuickJoin joins).
 *   - hvClassIndexes is APPLY-ONLY (adds class membership; never removes).
 *   - vouchingEnabled=false leaves an existing vouch config untouched (disable is
 *     a separate governance call).
 *
 * Keep this in sync with IRoleManager.RoleWiring field order — encoding.js feeds
 * the object straight to ethers, which matches by name, but the tuple order here
 * documents the on-chain layout for reviewers.
 */

/** Full 8-bit TaskPerm mask (matches TaskPerm.sol / util/permissions.js). */
export const TASK_PERM_BITS = {
  CREATE: 1,
  CLAIM: 2,
  REVIEW: 4,
  ASSIGN: 8,
  SELF_REVIEW: 16,
  BUDGET: 32,
  EDIT_META: 64,
  EDIT_FULL: 128,
};

/** Canonical zero-effect wiring — every field expresses "no change / off". */
export const DEFAULT_WIRING = Object.freeze({
  setTaskPerm: false,
  taskPermMask: 0,
  ddVoter: false,
  ddCreator: false,
  hvCreator: false,
  hvClassIndexes: [],
  ptMember: false,
  ptApprover: false,
  eduCreator: false,
  eduMember: false,
  quickJoinAutoMint: false,
  vouchingEnabled: false,
  vouchQuorum: 0,
  vouchMembershipHatId: '0',
  vouchCombine: false,
  budgetCapPerEpoch: '0',
  budgetEpochLen: 0,
});

const toU = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * Map the wizard's `roleConfig` UI state onto a RoleWiring object.
 *
 * `wiringConfig` is the flattened permission section of the role config (see
 * RoleConfigurator.defaultRoleConfig). Unknown / absent fields fall back to the
 * DEFAULT_WIRING "off" state, so the mapping stays additive as the UI grows.
 *
 * @param {Object} c - role config (or group shared-wiring config)
 * @returns {Object} RoleWiring
 */
export function buildRoleWiring(c = {}) {
  const globalPerms = toU(c.globalPerms);
  const vouching = c.vouching || {};
  const budget = c.budget || {};
  return {
    setTaskPerm: globalPerms > 0,
    taskPermMask: globalPerms & 0xff,
    ddVoter: Boolean(c.ddVoter),
    ddCreator: Boolean(c.ddCreator),
    // `canVote` is the legacy field name for "can create governance proposals"
    // (HybridVoting creator allowlist). Keep both accepted for draft restore.
    hvCreator: Boolean(c.hvCreator ?? c.canVote),
    hvClassIndexes: Array.isArray(c.hvClassIndexes)
      ? c.hvClassIndexes.map((n) => toU(n) & 0xff)
      : [],
    ptMember: Boolean(c.ptMember),
    ptApprover: Boolean(c.ptApprover),
    eduCreator: Boolean(c.eduCreator),
    eduMember: Boolean(c.eduMember),
    quickJoinAutoMint: Boolean(c.quickJoinAutoMint),
    vouchingEnabled: Boolean(vouching.enabled),
    vouchQuorum: toU(vouching.quorum),
    // self-vouch => the new role vouches for itself, resolved to its own hatId
    // downstream (0 here means "use the role's own hat"); an explicit voucher
    // hat is passed through verbatim.
    vouchMembershipHatId: vouching.selfVouch
      ? '0'
      : String(vouching.voucherHatId || '0'),
    vouchCombine: Boolean(vouching.combineWithHierarchy),
    budgetCapPerEpoch: String(budget.capPerEpoch || '0'),
    budgetEpochLen: toU(budget.epochLen),
  };
}

/**
 * Validate a RoleWiring against the contract's WiringIncompatible guards.
 *
 * @param {Object} wiring - a RoleWiring object (from buildRoleWiring)
 * @param {Object} [opts]
 * @param {boolean} [opts.isGroupMarker=false] - true when this is a group's
 *   shared wiring (marker hat). Vouching is never allowed on a marker.
 * @param {boolean} [opts.defaultEligible=false] - the target hat's
 *   defaultEligible flag. NEW roles are always false; existing/adopted hats may
 *   be true. quickJoinAutoMint requires this to be true.
 * @returns {string|null} human-readable error, or null when valid.
 */
export function validateWiring(wiring, opts = {}) {
  const w = wiring || {};
  const { isGroupMarker = false, defaultEligible = false } = opts;

  if (w.vouchingEnabled) {
    if (isGroupMarker) {
      return 'Vouching cannot be enabled on a group — a group’s membership is derived from its member roles, not vouched.';
    }
    if (!w.vouchCombine) {
      return 'Vouching requires “combine with hierarchy” to be on, otherwise the role can never be granted or offered.';
    }
    if (toU(w.vouchQuorum) < 1) {
      return 'Vouching needs a quorum of at least 1 vouch.';
    }
  }

  if (w.quickJoinAutoMint && !defaultEligible) {
    return 'Auto-mint on join can only be enabled for a role that is open to everyone (default-eligible). New roles are gated, so leave this off.';
  }

  if (w.setTaskPerm && (toU(w.taskPermMask) < 1 || toU(w.taskPermMask) > 255)) {
    return 'Task permissions are enabled but no permission bits are selected.';
  }

  // Budget: both fields must be set together, or both zero.
  const capSet = String(w.budgetCapPerEpoch || '0') !== '0';
  const lenSet = toU(w.budgetEpochLen) > 0;
  if (capSet !== lenSet) {
    return 'A gas budget needs both a per-epoch cap and an epoch length (or leave both blank to skip).';
  }

  return null;
}

/**
 * Convenience: build + validate in one call.
 * @returns {{ wiring: Object, error: string|null }}
 */
export function resolveWiring(config, opts) {
  const wiring = buildRoleWiring(config);
  return { wiring, error: validateWiring(wiring, opts) };
}
