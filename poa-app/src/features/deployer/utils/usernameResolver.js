/**
 * Username Resolution Utility
 * Resolves usernames to addresses via subgraph queries
 */

import { resolveUsernamesAcrossChains } from '@/util/crossChainUsername';
import { getAdditionalMembers } from './additionalMembers';

/**
 * Resolve multiple usernames to addresses via subgraph.
 * Accounts live on whichever chain the user onboarded through (per-chain
 * UniversalAccountRegistry), so resolution fans out across ALL mainnet
 * subgraphs — a Gnosis-registered member must resolve when deploying to
 * Gnosis, and vice versa. Resolved addresses are chain-portable (EOAs
 * trivially; passkey accounts by chain-independent CREATE2 salt).
 * @param {string[]} usernames - Array of usernames to resolve
 * @returns {Promise<{resolved: Map<string, string>, notFound: string[]}>}
 */
export async function resolveUsernames(usernames) {
  try {
    return await resolveUsernamesAcrossChains(usernames);
  } catch (error) {
    console.error('Error resolving usernames:', error);
    throw new Error(`Failed to resolve usernames: ${error.message}`);
  }
}

/**
 * Validate that all usernames in roles exist in the registry
 * @param {Array} roles - Array of role objects with additional members (see additionalMembers.js)
 * @returns {Promise<{isValid: boolean, errors: Object}>}
 */
export async function validateAllUsernames(roles) {
  // Collect all unique usernames from all roles. Entries the Team step's member
  // picker produced already carry an address, so only username-only entries
  // (legacy free-text editors, older templates) need a registry lookup.
  const allUsernames = [];

  roles.forEach((role, roleIndex) => {
    getAdditionalMembers(role).forEach(member => {
      if (!member.address && member.username) {
        allUsernames.push({
          username: member.username,
          roleIndex,
          roleName: role.name,
        });
      }
    });
  });

  if (allUsernames.length === 0) {
    return { isValid: true, errors: {} };
  }

  // Get unique usernames
  const uniqueUsernames = [...new Set(allUsernames.map(u => u.username.toLowerCase()))];

  try {
    const { notFound } = await resolveUsernames(uniqueUsernames);

    if (notFound.length > 0) {
      // Find which roles have the not-found usernames
      const errorDetails = notFound.map(username => {
        const roleInfo = allUsernames.find(u => u.username.toLowerCase() === username);
        return roleInfo ? `"${username}" (in ${roleInfo.roleName})` : `"${username}"`;
      });

      return {
        isValid: false,
        errors: {
          usernames: `Users not found: ${errorDetails.join(', ')}`,
        },
      };
    }

    return { isValid: true, errors: {} };
  } catch (error) {
    return {
      isValid: false,
      errors: {
        usernames: `Failed to validate usernames: ${error.message}`,
      },
    };
  }
}

/**
 * Resolve every role's additional members to addresses.
 * Call this before deployment to populate additionalWearers.
 *
 * Members chosen through the Team step's search picker already carry the address
 * the subgraph returned at selection time, so they need no lookup here; only
 * username-only entries (legacy free-text editors, older templates) hit the
 * registry. That keeps the deploy from failing on a name that resolved fine
 * minutes earlier.
 *
 * @param {Array} roles - Array of role objects
 * @returns {Promise<Array>} - Roles with additionalWearers populated
 */
export async function resolveRoleUsernames(roles) {
  const pendingUsernames = new Set();
  roles.forEach(role => {
    getAdditionalMembers(role).forEach(member => {
      if (!member.address && member.username) {
        pendingUsernames.add(member.username.toLowerCase());
      }
    });
  });

  const resolved = pendingUsernames.size > 0
    ? (await resolveUsernames([...pendingUsernames])).resolved
    : new Map();

  return roles.map(role => {
    const members = getAdditionalMembers(role);
    if (members.length === 0) {
      return role;
    }

    const addresses = [];
    const seen = new Set();

    members.forEach(member => {
      // Throw rather than silently drop: an unresolved username here would
      // otherwise omit a member from the deployed org with no warning.
      const address = member.address || resolved.get(member.username.toLowerCase());
      if (!address) {
        throw new Error(`Could not resolve username "${member.username}" for role "${role.name}". Please re-verify members and try again.`);
      }

      // Hats reverts a mint to someone who already wears the hat, which aborts
      // the whole deploy — and one person listed twice never means "mint twice".
      const key = address.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      addresses.push(address);
    });

    return {
      ...role,
      distribution: {
        ...role.distribution,
        additionalWearers: addresses,
      },
    };
  });
}

export default {
  resolveUsernames,
  validateAllUsernames,
  resolveRoleUsernames,
};
