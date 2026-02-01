/**
 * Utility functions for profile hub components
 */

/**
 * Determine user tier based on token balance
 * @param {number} balance - Participation token balance
 * @returns {string} Tier name
 */
export function determineTier(balance) {
  if (balance >= 1000) return 'Gold';
  if (balance >= 500) return 'Silver';
  if (balance >= 150) return 'Bronze';
  return 'Basic';
}

/**
 * Calculate progress to next tier
 * @param {number} balance - Participation token balance
 * @returns {{ progress: number, nextTier: string, nextTierThreshold: number }}
 */
export function calculateProgress(balance) {
  if (balance < 150) {
    return { progress: (balance / 150) * 100, nextTier: 'Bronze', nextTierThreshold: 150 };
  }
  if (balance < 500) {
    return { progress: ((balance - 150) / 350) * 100, nextTier: 'Silver', nextTierThreshold: 500 };
  }
  if (balance < 1000) {
    return { progress: ((balance - 500) / 500) * 100, nextTier: 'Gold', nextTierThreshold: 1000 };
  }
  return { progress: 100, nextTier: 'Gold', nextTierThreshold: 1000 };
}

/**
 * Format Unix timestamp to American date format
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted date string
 */
export function formatDateToAmerican(timestamp) {
  const date = new Date(timestamp * 1000);
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

/**
 * Truncate an Ethereum address for display
 * @param {string} address - Full Ethereum address
 * @returns {string} Truncated address (0x1234...abcd)
 */
export function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Normalize a hat ID to a string for consistent comparison
 * @param {string|number|BigInt} id - Hat ID in any format
 * @returns {string} Normalized hat ID
 */
export function normalizeHatId(id) {
  if (id === null || id === undefined) return '';
  const str = String(id).trim();
  if (str.startsWith('0x') || str.startsWith('0X')) {
    return str.toLowerCase();
  }
  return str;
}

/**
 * Get color scheme for a tier badge
 * @param {string} tier - Tier name
 * @returns {string} Chakra UI color scheme
 */
export function getTierColorScheme(tier) {
  switch (tier) {
    case 'Gold':
      return 'yellow';
    case 'Silver':
      return 'gray';
    case 'Bronze':
      return 'orange';
    default:
      return 'purple';
  }
}

/**
 * Get icon path for a tier
 * @param {string} tier - Tier name
 * @returns {string} Image path
 */
export function getTierIcon(tier) {
  if (!tier || tier === 'Basic') {
    return '/images/high_res_poa.png';
  }
  return `/images/${tier.toLowerCase()}Medal.png`;
}

/**
 * Get permission badges for a role
 * @param {Array} permissions - Role permissions array
 * @returns {Array<{ label: string, colorScheme: string }>}
 */
export function getPermissionBadges(permissions) {
  if (!permissions || !Array.isArray(permissions)) return [];

  const badgeMap = {
    Voter: { label: 'Vote', colorScheme: 'green' },
    Creator: { label: 'Create', colorScheme: 'blue' },
    Approver: { label: 'Approve', colorScheme: 'orange' },
    Member: { label: 'Member', colorScheme: 'purple' },
  };

  const seen = new Set();
  const badges = [];

  permissions.forEach((perm) => {
    if (perm.allowed && badgeMap[perm.permissionRole] && !seen.has(perm.permissionRole)) {
      seen.add(perm.permissionRole);
      badges.push(badgeMap[perm.permissionRole]);
    }
  });

  return badges;
}
