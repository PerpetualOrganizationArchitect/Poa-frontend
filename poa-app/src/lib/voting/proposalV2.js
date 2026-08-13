/**
 * createProposalV2 config — pure validation + quorum math.
 *
 * DD and HV gained `createProposalV2` (PLAN.md §1.5, LOCKED):
 *   - `quorumOverride` (uint32) and HV's `equalWeight` (bool) are ONLY valid on
 *     RESTRICTED proposals (hatIds.length > 0). Unrestricted proposals MUST pass
 *     0 / false — the contract reverts otherwise.
 *   - For an EXECUTABLE proposal (any non-empty batch) the effective quorum is
 *     max(globalQuorum, quorumOverride): an override can only RAISE the floor.
 *   - For a signal-only poll (all-empty batches) the override REPLACES the
 *     global quorum (may lower it — small-group signal polls).
 *   - `equalWeight` (HV only) tallies with a single synthetic DIRECT class so
 *     every eligible voter counts equally regardless of share balance.
 *
 * This module is the frontend's guard so an invalid combination is blocked
 * before the vote is created.
 */

/** Does a batch set contain at least one non-empty option batch? */
export function isExecutable(batches) {
  return Array.isArray(batches) && batches.some((b) => Array.isArray(b) && b.length > 0);
}

/**
 * Effective quorum a proposal will be judged against on-chain.
 * @param {number} globalQuorum
 * @param {number} quorumOverride - 0 when unset
 * @param {boolean} executable
 * @returns {number}
 */
export function effectiveQuorum(globalQuorum, quorumOverride, executable) {
  const g = Number(globalQuorum) || 0;
  const o = Number(quorumOverride) || 0;
  if (o <= 0) return g;
  return executable ? Math.max(g, o) : o;
}

/**
 * Validate a V2 config against the contract rules.
 *
 * @param {Object} cfg
 * @param {boolean} cfg.isRestricted - proposal restricted to hats?
 * @param {number} [cfg.quorumOverride=0]
 * @param {boolean} [cfg.equalWeight=false]
 * @param {boolean} [cfg.isHybrid=false] - equalWeight is HV-only
 * @returns {string|null} error message, or null when valid.
 */
export function validateProposalV2Config(cfg = {}) {
  const { isRestricted = false, quorumOverride = 0, equalWeight = false, isHybrid = false } = cfg;
  const override = Number(quorumOverride) || 0;

  if (!isRestricted) {
    if (override > 0) {
      return 'A quorum override can only be set on a restricted proposal (one limited to specific roles).';
    }
    if (equalWeight) {
      return 'Equal-weight voting can only be used on a restricted proposal.';
    }
  }

  if (override < 0 || override > 0xffffffff) {
    return 'Quorum override is out of range.';
  }

  if (equalWeight && !isHybrid) {
    return 'Equal-weight voting only applies to blended (hybrid) voting.';
  }

  return null;
}

/**
 * Does this config require the V2 selector? (any override or equalWeight set)
 * When false, the caller may use the legacy createProposal for max compat.
 */
export function needsV2(cfg = {}) {
  return (Number(cfg.quorumOverride) || 0) > 0 || Boolean(cfg.equalWeight);
}

/**
 * Build the restricted-poll preset options for the picker.
 * A group marker hat makes "Only <Group>" a single-hat selection.
 *
 * @param {Array<{groupId, name, markerHatId}>} groups
 * @returns {Array<{id, label, hatIds}>}
 */
export function buildRestrictionPresets(groups = []) {
  return (groups || [])
    .filter((g) => g && g.markerHatId != null)
    .map((g) => ({
      id: `group-${g.groupId}`,
      label: `Only ${g.name || 'group'}`,
      hatIds: [String(g.markerHatId)],
    }));
}
