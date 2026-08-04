/**
 * Additional-member helpers for a role's initial distribution.
 *
 * The Team step picks members with `UserSearchInput`, so every entry the live
 * wizard writes is already resolved: `{ address, username }`. Two older shapes
 * still have to be readable:
 *
 *   - bare username strings, written by the legacy `RoleForm` / `RolesStep`
 *     editors (unreachable from `DeployerWizard`, still exported) and by any
 *     template that predates the picker. These only resolve at deploy time.
 *   - a bare pasted 0x address, which the old free-text field also accepted.
 *
 * `getAdditionalMembers` normalizes all three into one entry type so no call
 * site has to branch, and so neither shape can silently drop a member.
 */

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * @param {unknown} value
 * @returns {boolean} true when `value` is a 0x-prefixed 20-byte hex address
 */
export function isAddressLike(value) {
  return typeof value === 'string' && ADDRESS_REGEX.test(value.trim());
}

/**
 * Normalize one raw entry into `{ address, username }`, or null when it carries
 * no usable identity.
 * @param {string|{address?: string, username?: string}} raw
 * @returns {{address: string|null, username: string|null}|null}
 */
function toMemberEntry(raw) {
  if (typeof raw === 'string') {
    const value = raw.trim();
    if (!value) return null;
    return isAddressLike(value)
      ? { address: value.toLowerCase(), username: null }
      : { address: null, username: value };
  }

  if (!raw || typeof raw !== 'object') return null;

  const address = isAddressLike(raw.address) ? raw.address.trim().toLowerCase() : null;
  const username =
    typeof raw.username === 'string' && raw.username.trim() ? raw.username.trim() : null;

  if (!address && !username) return null;
  return { address, username };
}

/**
 * Read a role's additional members in normalized form.
 * @param {Object} role - Role object from wizard state
 * @returns {Array<{address: string|null, username: string|null}>}
 */
export function getAdditionalMembers(role) {
  const distribution = role?.distribution || {};
  const picked = Array.isArray(distribution.additionalMembers)
    ? distribution.additionalMembers
    : [];
  const legacy = Array.isArray(distribution.additionalWearerUsernames)
    ? distribution.additionalWearerUsernames
    : [];

  // Non-empty wins, NOT "the new field exists". createDefaultRole and every
  // template now ship `additionalMembers: []`, so a presence check would let
  // that empty array shadow whatever the legacy RoleForm wrote — silently
  // dropping members from the deploy. `setAdditionalMembers` clears the legacy
  // field on write, so an emptied picker can't resurrect stale entries here.
  const raw = picked.length > 0 ? picked : legacy;

  return raw.map(toMemberEntry).filter(Boolean);
}

/**
 * Write a normalized member list onto a role.
 *
 * Clears the legacy field: `getAdditionalMembers` has already folded those
 * entries into `members`, so dropping it is lossless — and it keeps "picked is
 * empty" meaning the user removed everyone, rather than falling back to a stale
 * legacy list.
 *
 * @param {Object} role - Role object from wizard state
 * @param {Array<{address: string|null, username: string|null}>} members
 * @returns {Object} the updated role
 */
export function setAdditionalMembers(role, members) {
  return {
    ...role,
    distribution: {
      ...role.distribution,
      additionalMembers: members,
      additionalWearerUsernames: [],
    },
  };
}

/**
 * Addresses already known without a subgraph round-trip, de-duped.
 * Lets pre-deploy surfaces (e.g. the ReviewStep genesis-voter warning) count
 * members that `resolveRoleUsernames` would not populate until deploy time.
 * @param {Object} role - Role object from wizard state
 * @returns {string[]} lowercased addresses
 */
export function getResolvedMemberAddresses(role) {
  const seen = new Set();
  getAdditionalMembers(role).forEach((member) => {
    if (member.address) seen.add(member.address);
  });
  return [...seen];
}

/**
 * How many distinct people can vote the moment the org launches.
 *
 * Feeds the "your voter minimum is higher than your membership" warning, where
 * an over-count silently suppresses a real governance deadlock. Two things make
 * it easy to get wrong:
 *
 *   - the founder only gets a hat through `mintToDeployer`, so counting them
 *     unconditionally over-counts an org where they hold no voting role;
 *   - they may also appear in a role's member list, so they must be counted
 *     under their real address or they collapse to two people.
 *
 * @param {Array} roles - Roles from wizard state
 * @param {string|null} deployerAddress - The founder's address, if known
 * @returns {number} distinct voters at genesis
 */
export function countGenesisVoters(roles, deployerAddress) {
  // Before sign-in the address is unknown; a sentinel at least counts the
  // founder, and can only over-count if they also listed themselves by address.
  const deployerKey = deployerAddress ? deployerAddress.toLowerCase() : 'deployer';
  const voters = new Set();

  (roles || []).forEach((role) => {
    if (!role?.canVote) return;
    if (role.distribution?.mintToDeployer) voters.add(deployerKey);
    getAdditionalMembers(role).forEach((member) => {
      // Username-only entries still become voters at launch; key them by name
      // so a legacy list isn't undercounted into a spurious warning.
      voters.add(member.address || `username:${member.username.toLowerCase()}`);
    });
  });

  return voters.size;
}

/**
 * True when a role still holds username-only entries — they need a subgraph
 * lookup at deploy time and can fail there.
 * @param {Object} role - Role object from wizard state
 * @returns {boolean}
 */
export function hasUnresolvedMembers(role) {
  return getAdditionalMembers(role).some((member) => !member.address);
}

/**
 * Short display label for a member entry.
 * @param {{address: string|null, username: string|null}} member
 * @returns {string}
 */
export function memberLabel(member) {
  if (!member) return '';
  if (member.username) return member.username;
  if (member.address) return `${member.address.slice(0, 6)}...${member.address.slice(-4)}`;
  return '';
}

export default {
  isAddressLike,
  getAdditionalMembers,
  setAdditionalMembers,
  countGenesisVoters,
  getResolvedMemberAddresses,
  hasUnresolvedMembers,
  memberLabel,
};
