/**
 * useOrgStructure - Hook for fetching organization structure data
 * Used by the /org-structure page to display roles, permissions, and members
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@apollo/client';
import { useRefreshSubscription, RefreshEvent } from '../context/RefreshContext';
import { FETCH_ORG_STRUCTURE_DATA } from '../util/queries';
import { useIPFScontext } from '../context/ipfsContext';
import { usePOContext } from '../context/POContext';
import { formatTokenAmount } from '../util/formatToken';
import { useSubgraphClient } from '../util/apolloClient';
import { useOnchainCreatorHats } from './useOnchainCreatorHats';

/**
 * Permission type mapping for display
 */
const PERMISSION_LABELS = {
  Voter: 'Voting',
  Creator: 'Create Proposals',
  Member: 'Member Access',
  Approver: 'Approver',
  // TaskManager project-creator hats (taskManager.creatorHatIds) — who may create projects.
  CreateProject: 'Create Projects',
  // TaskManager TaskPerm bits — surfaced via useOrgStructure's taskManagerHatPermissions
  // synthesis (TaskManager v4 added BUDGET, v5 added EDIT_META + EDIT_FULL).
  Create: 'Create Tasks',
  Claim: 'Claim Tasks',
  Review: 'Review Tasks',
  Assign: 'Assign Tasks',
  SelfReview: 'Self-Review',
  Budget: 'Edit Budgets',
  EditMeta: 'Edit Task Metadata',
  EditFull: 'Edit Tasks (Full)',
};

const CONTRACT_TYPE_LABELS = {
  HybridVoting: 'Hybrid Voting',
  DirectDemocracyVoting: 'Direct Democracy',
  ParticipationToken: 'Token',
  QuickJoin: 'Quick Join',
  EducationHub: 'Education',
  Executor: 'Executor',
  ToggleModule: 'Toggle',
  TaskManager: 'Tasks',
};

/**
 * Generate fallback role name based on index
 * @param {number} index - Role index
 * @returns {string} Fallback name
 */
function getFallbackRoleName(index) {
  return `Role ${index + 1}`;
}

/**
 * Normalize a hat ID to a string for consistent comparison.
 * Handles BigInt, numbers, hex strings, etc.
 */
function normalizeHatId(id) {
  if (id === null || id === undefined) return '';
  // Convert to string and trim any whitespace
  const str = String(id).trim();
  // If it's a hex string, normalize to lowercase
  if (str.startsWith('0x') || str.startsWith('0X')) {
    return str.toLowerCase();
  }
  return str;
}

/**
 * Transform raw role data into display format
 * @param {Array} roles - Raw roles from subgraph (already filtered by isUserRole: true)
 * @param {Array} roleHatIds - Role hat IDs in order
 * @param {Object} roleNamesFromIPFS - Role names from IPFS metadata
 * @param {Array} users - Users from subgraph to calculate member counts
 * @returns {Array} Transformed roles with names and member info
 */
function transformRolesData(roles, roleHatIds, roleNamesFromIPFS = {}, users = []) {
  if (!roles || !Array.isArray(roles)) return [];

  // Convert roleHatIds to normalized strings for comparison
  const normalizedRoleHatIds = (roleHatIds || []).map(id => normalizeHatId(id));

  // Note: Roles are already filtered by isUserRole: true in the GraphQL query
  // No need for frontend filtering

  const mapped = roles.map((role, index) => {
    const hatId = role.hatId;
    const hatIdNorm = normalizeHatId(hatId);

    // Find index in roleHatIds to determine the fallback name
    const foundIndex = normalizedRoleHatIds.findIndex(id => id === hatIdNorm);
    // Use found index if valid, otherwise use the array index
    const roleIndex = foundIndex >= 0 ? foundIndex : index;

    // Get name from Role entity (RolesCreated event), hat entity (IPFS), or use fallback
    // Priority: role.name (from smart contract) > role.hat.name (from IPFS) > IPFS metadata > fallback
    const name = role.name || role.hat?.name || roleNamesFromIPFS[hatIdNorm] || roleNamesFromIPFS[hatId] || getFallbackRoleName(roleIndex);

    // Method 1: Count from role.wearers (RoleWearer entities)
    const roleWearers = role.wearers || [];
    const activeRoleWearers = roleWearers.filter(w => w.isActive !== false);

    // Method 2: Count from users.currentHatIds
    const usersWithHat = (users || []).filter(user => {
      const userHatIds = (user.currentHatIds || []).map(id => normalizeHatId(id));
      return userHatIds.includes(hatIdNorm);
    });

    // Use the larger count (in case one source is incomplete)
    const memberCount = Math.max(activeRoleWearers.length, usersWithHat.length);

    // Get hat details
    const hat = role.hat || {};
    const level = hat.level ?? 0;
    const parentHatId = hat.parentHatId;
    const vouchConfig = hat.vouchConfig;
    const defaultEligible = hat.defaultEligible ?? false;
    // Role description from the hat's IPFS metadata (set via EligibilityModule.updateHatMetadata).
    // May be empty until the subgraph's IPFS file data source resolves.
    const description = hat.metadata?.description || '';

    return {
      id: role.id,
      hatId,
      name,
      description,
      image: role.image || '',
      canVote: role.canVote ?? true, // Default to true for voting roles
      level,
      parentHatId,
      memberCount,
      defaultEligible,
      wearers: roleWearers.map(w => ({
        address: w.wearer,
        username: w.wearerUsername,
      })),
      vouchingEnabled: vouchConfig?.enabled || false,
      vouchingQuorum: vouchConfig?.quorum,
      vouchingMembershipHatId: vouchConfig?.membershipHatId,
      permissions: role.permissions || [],
    };
  });

  // Build tree order from parentHatId relationships.
  // A role whose parentHatId matches another role's hatId is that role's child.
  const hatIdSet = new Set(mapped.map(r => normalizeHatId(r.hatId)));
  const childrenOf = new Map(); // parentHatId -> [child roles]
  const roots = [];

  for (const role of mapped) {
    const parentNorm = normalizeHatId(role.parentHatId);
    if (parentNorm && hatIdSet.has(parentNorm)) {
      const kids = childrenOf.get(parentNorm) || [];
      kids.push(role);
      childrenOf.set(parentNorm, kids);
    } else {
      roots.push(role);
    }
  }

  // DFS to produce display order and assign tree depth
  const ordered = [];
  const visited = new Set();
  function walk(role, depth) {
    const key = normalizeHatId(role.hatId);
    if (visited.has(key)) return; // cycle guard
    visited.add(key);
    ordered.push({ ...role, level: depth });
    const kids = childrenOf.get(key) || [];
    // Sort siblings by roleHatIds position for stable order
    kids.sort((a, b) => {
      const aIdx = normalizedRoleHatIds.indexOf(normalizeHatId(a.hatId));
      const bIdx = normalizedRoleHatIds.indexOf(normalizeHatId(b.hatId));
      return aIdx - bIdx;
    });
    for (const child of kids) {
      walk(child, depth + 1);
    }
  }

  // Sort roots by roleHatIds position
  roots.sort((a, b) => {
    const aIdx = normalizedRoleHatIds.indexOf(normalizeHatId(a.hatId));
    const bIdx = normalizedRoleHatIds.indexOf(normalizeHatId(b.hatId));
    return aIdx - bIdx;
  });
  for (const root of roots) {
    walk(root, 0);
  }

  return ordered;
}

/**
 * Transform hat permissions into a permissions matrix
 * @param {Array} hatPermissions - Hat permissions from subgraph
 * @param {Array} roles - Transformed roles
 * @returns {Object} Permissions matrix { roleId: { permissionKey: boolean } }
 */
function buildPermissionsMatrix(hatPermissions, roles) {
  if (!hatPermissions || !Array.isArray(hatPermissions)) return {};

  const matrix = {};

  // Create a map from normalized hatId to original hatId for lookups
  const normalizedToOriginal = {};
  roles.forEach(role => {
    const normalized = normalizeHatId(role.hatId);
    normalizedToOriginal[normalized] = role.hatId;
    matrix[role.hatId] = {};
  });

  // Fill in permissions (using normalized comparison)
  hatPermissions.forEach(perm => {
    const normalizedPermHatId = normalizeHatId(perm.hatId);
    const originalHatId = normalizedToOriginal[normalizedPermHatId];

    if (perm.allowed && originalHatId && matrix[originalHatId]) {
      const key = `${perm.contractType}_${perm.permissionRole}`;
      matrix[originalHatId][key] = true;
    }
  });

  return matrix;
}

/**
 * Get unique permission types for matrix columns
 * @param {Array} hatPermissions - Hat permissions from subgraph
 * @returns {Array} Array of { key, label, contractType, permissionRole }
 */
// Stable order for the permissions matrix — groups governance first, then tasks, with a
// stable inner ordering per group so re-renders don't shuffle columns when synthesized
// entries arrive in different orders.
const CONTRACT_TYPE_ORDER = [
  'QuickJoin',
  'ParticipationToken',
  'HybridVoting',
  'DirectDemocracyVoting',
  'Executor',
  'EducationHub',
  'ToggleModule',
  'TaskManager',
];

const PERMISSION_ROLE_ORDER = [
  // governance roles
  'Voter', 'Creator', 'Approver', 'Member',
  // TaskManager: project-creation first, then per-task TaskPerm bits (low bit → high bit)
  'CreateProject',
  'Create', 'Claim', 'Review', 'Assign', 'SelfReview', 'Budget', 'EditMeta', 'EditFull',
];

function compareColumns(a, b) {
  const ai = CONTRACT_TYPE_ORDER.indexOf(a.contractType);
  const bi = CONTRACT_TYPE_ORDER.indexOf(b.contractType);
  const aRank = ai === -1 ? CONTRACT_TYPE_ORDER.length : ai;
  const bRank = bi === -1 ? CONTRACT_TYPE_ORDER.length : bi;
  if (aRank !== bRank) return aRank - bRank;
  const ar = PERMISSION_ROLE_ORDER.indexOf(a.permissionRole);
  const br = PERMISSION_ROLE_ORDER.indexOf(b.permissionRole);
  const aPermRank = ar === -1 ? PERMISSION_ROLE_ORDER.length : ar;
  const bPermRank = br === -1 ? PERMISSION_ROLE_ORDER.length : br;
  return aPermRank - bPermRank;
}

function getPermissionColumns(hatPermissions) {
  if (!hatPermissions || !Array.isArray(hatPermissions)) return [];

  const seen = new Set();
  const columns = [];

  hatPermissions.forEach(perm => {
    const key = `${perm.contractType}_${perm.permissionRole}`;
    if (!seen.has(key)) {
      seen.add(key);
      columns.push({
        key,
        contractType: perm.contractType,
        permissionRole: perm.permissionRole,
        label: `${CONTRACT_TYPE_LABELS[perm.contractType] || perm.contractType} - ${PERMISSION_LABELS[perm.permissionRole] || perm.permissionRole}`,
      });
    }
  });

  columns.sort(compareColumns);
  return columns;
}

/**
 * Transform users into members grouped by role
 * @param {Array} users - Users from subgraph
 * @param {Array} roles - Transformed roles
 * @returns {Object} Members grouped by role { hatId: [members] }
 */
function groupMembersByRole(users, roles) {
  if (!users || !Array.isArray(users)) return {};

  const groups = {};

  // Create a map from normalized hatId to original hatId for lookups
  const normalizedToOriginal = {};
  roles.forEach(role => {
    const normalized = normalizeHatId(role.hatId);
    normalizedToOriginal[normalized] = role.hatId;
    groups[role.hatId] = [];
  });

  // Group users by their hat IDs (using normalized comparison)
  users.forEach(user => {
    const hatIds = user.currentHatIds || [];
    hatIds.forEach(userHatId => {
      const normalizedUserHatId = normalizeHatId(userHatId);
      const originalHatId = normalizedToOriginal[normalizedUserHatId];

      if (originalHatId && groups[originalHatId]) {
        groups[originalHatId].push({
          id: user.id,
          address: user.address,
          username: user.account?.username,
          participationTokenBalance: formatTokenAmount(user.participationTokenBalance || '0'),
          membershipStatus: user.membershipStatus,
          totalTasksCompleted: parseInt(user.totalTasksCompleted, 10) || 0,
          totalVotes: parseInt(user.totalVotes, 10) || 0,
          firstSeenAt: user.firstSeenAt,
          lastActiveAt: user.lastActiveAt,
        });
      }
    });
  });

  return groups;
}

/**
 * Hook for fetching and managing org structure data
 * @returns {Object} Org structure data and utilities
 */
export function useOrgStructure() {
  const { orgId, roleHatIds, topHatId, subgraphUrl, orgChainId } = usePOContext();
  const { safeFetchFromIpfs, safeFetchImageFromIpfs } = useIPFScontext();

  // State for IPFS metadata
  const [orgMetadata, setOrgMetadata] = useState({
    description: '',
    links: [],
    template: '',
    logo: null,
  });
  const [metadataLoading, setMetadataLoading] = useState(true);

  const client = useSubgraphClient(subgraphUrl);

  // Fetch org structure data from subgraph
  const { data, loading: queryLoading, error, refetch } = useQuery(FETCH_ORG_STRUCTURE_DATA, {
    variables: { orgId },
    skip: !orgId,
    fetchPolicy: 'cache-first',
    client,
  });

  // Role member-counts / claimability go stale after someone claims a role — refetch on the same
  // event the rest of the app uses (cheap: fires once per claim in this tab).
  useRefreshSubscription(RefreshEvent.ROLE_CLAIMED, () => refetch?.(), [refetch]);

  const org = data?.organization;

  // Creator/voting hats that the subgraph can't index — set in the voting
  // contracts' initialize() without emitting events (see poa-box/POP#171), and
  // TaskManager project-creators are only exposed via a lens call — are read
  // straight from chain (current block, any RPC) so the matrix shows the real
  // creators now, independent of subgraph state.
  const { onchainCreatorRows } = useOnchainCreatorHats({
    hybridVoting: org?.hybridVoting?.id,
    directDemocracyVoting: org?.directDemocracyVoting?.id,
    taskManager: org?.taskManager?.id,
    chainId: orgChainId,
  });

  // Load org metadata from subgraph (preferred) or IPFS (fallback)
  useEffect(() => {
    async function fetchMetadata() {
      if (!org?.metadataHash) {
        setMetadataLoading(false);
        return;
      }

      setMetadataLoading(true);

      try {
        let logoCid = null;

        if (org.metadata) {
          // Subgraph already indexed the metadata — use it directly
          setOrgMetadata({
            description: org.metadata.description || '',
            links: org.metadata.links || [],
            template: org.metadata.template || '',
            logo: null,
          });
          logoCid = org.metadata.logo || null;
        } else {
          // Fallback: fetch from IPFS directly (subgraph hasn't indexed yet)
          const metadata = await safeFetchFromIpfs(org.metadataHash);
          if (metadata) {
            setOrgMetadata({
              description: metadata.description || '',
              links: metadata.links || [],
              template: metadata.template || '',
              logo: null,
            });
            logoCid = metadata.logo || null;
          }
        }

        // Fetch logo image from IPFS gateway using the CID
        if (logoCid) {
          const logoUrl = await safeFetchImageFromIpfs(logoCid);
          if (logoUrl) {
            setOrgMetadata(prev => ({ ...prev, logo: logoUrl }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch org metadata:', err);
      } finally {
        setMetadataLoading(false);
      }
    }

    fetchMetadata();
  }, [org?.metadataHash, org?.metadata, safeFetchFromIpfs, safeFetchImageFromIpfs]);

  // Strip the EligibilityModule's admin hat from the raw role list before
  // any other downstream logic touches it. `where: { isUserRole: true }`
  // in the GraphQL query is supposed to exclude system hats, but the
  // deployed subgraph has historical orgs (e.g. Test6, plant-houston)
  // whose admin hat ended up with isUserRole = true. POContext already
  // filters this hat out of `roleHatIds`; the team page goes through a
  // separate query path, so it needs the same defensive treatment.
  const eligibilityAdminHatId =
    org?.eligibilityModule?.eligibilityModuleAdminHat || null;
  const filteredRoles = useMemo(() => {
    if (!org?.roles) return undefined;
    if (!eligibilityAdminHatId) return org.roles;
    return org.roles.filter(
      (r) => String(r.hatId) !== String(eligibilityAdminHatId),
    );
  }, [org?.roles, eligibilityAdminHatId]);

  // Hats anyone can claim via quickJoinWithUser without vouching. Sourced
  // from the subgraph's QuickJoinContract.memberHatIds (see subgraph-pop #179).
  const memberHatIdSet = useMemo(() => {
    const ids = org?.quickJoin?.memberHatIds || [];
    return new Set(ids.map((id) => normalizeHatId(id.toString())));
  }, [org?.quickJoin?.memberHatIds]);

  // Transform roles data, then annotate with isQuickJoinEligible. Kept as two
  // passes so transformRolesData stays pure.
  //
  // A hat is treated as quick-join-eligible only if it's in memberHatIds AND
  // the EligibilityModule does not require vouching for it. If both flags are
  // set on the same hat (Test6's Member is configured this way), the join
  // would surface a "Join" CTA, but quickJoinWithUser would revert during
  // isEligible because the user has no vouches yet. Vouching wins, since it's
  // the more restrictive gate.
  const roles = useMemo(() => {
    const base = transformRolesData(filteredRoles, roleHatIds, {}, org?.users);
    return base.map((role) => ({
      ...role,
      isQuickJoinEligible:
        memberHatIdSet.has(normalizeHatId(role.hatId)) && !role.vouchingEnabled,
    }));
  }, [filteredRoles, roleHatIds, org?.users, memberHatIdSet]);

  // TaskManager v4/v5 — flatten the org's `taskManager.globalRolePermissions` entries into
  // HatPermission-shaped rows so they flow through the existing PermissionsMatrix without a
  // parallel data path. Each non-zero TaskPerm bit emits one synthetic entry per hat.
  const taskManagerHatPermissions = useMemo(() => {
    const grants = org?.taskManager?.globalRolePermissions;
    if (!grants || !grants.length) return [];

    const entries = [];
    const BITS = [
      ['canCreate', 'Create'],
      ['canClaim', 'Claim'],
      ['canReview', 'Review'],
      ['canAssign', 'Assign'],
      ['canSelfReview', 'SelfReview'],
      ['canBudget', 'Budget'],
      ['canEditMeta', 'EditMeta'],
      ['canEditFull', 'EditFull'],
    ];

    grants.forEach((g) => {
      BITS.forEach(([flag, role]) => {
        if (g[flag]) {
          entries.push({
            hatId: g.hatId,
            permissionRole: role,
            contractType: 'TaskManager',
            allowed: true,
          });
        }
      });
    });

    return entries;
  }, [org?.taskManager?.globalRolePermissions]);

  // TaskManager creator hats — org.taskManager.creatorHatIds lists which hats may create
  // PROJECTS (a separate grant from the per-task TaskPerm bits above). Flatten into
  // HatPermission-shaped rows so the matrix renders a "Create Project" column.
  const taskManagerCreatorHatPermissions = useMemo(() => {
    const creatorHatIds = org?.taskManager?.creatorHatIds;
    if (!creatorHatIds || !creatorHatIds.length) return [];
    return creatorHatIds.map((hatId) => ({
      hatId,
      permissionRole: 'CreateProject',
      contractType: 'TaskManager',
      allowed: true,
    }));
  }, [org?.taskManager?.creatorHatIds]);

  const mergedHatPermissions = useMemo(() => {
    const base = org?.hatPermissions || [];
    // onchainCreatorRows are read live from the contracts and supplement the
    // subgraph rows (buildPermissionsMatrix ORs them in), so deploy-time
    // creators the subgraph never indexed still light up. Idempotent once the
    // subgraph catches up.
    return [
      ...base,
      ...taskManagerHatPermissions,
      ...taskManagerCreatorHatPermissions,
      ...onchainCreatorRows,
    ];
  }, [
    org?.hatPermissions,
    taskManagerHatPermissions,
    taskManagerCreatorHatPermissions,
    onchainCreatorRows,
  ]);

  // Build permissions matrix
  const permissionsMatrix = useMemo(() => {
    return buildPermissionsMatrix(mergedHatPermissions, roles);
  }, [mergedHatPermissions, roles]);

  // Get permission columns
  const permissionColumns = useMemo(() => {
    return getPermissionColumns(mergedHatPermissions);
  }, [mergedHatPermissions]);

  // Group members by role
  const membersByRole = useMemo(() => {
    return groupMembersByRole(org?.users, roles);
  }, [org?.users, roles]);

  // Governance config
  const governance = useMemo(() => {
    return {
      hybridVoting: org?.hybridVoting ? {
        id: org.hybridVoting.id,
        quorum: org.hybridVoting.thresholdPct,
      } : null,
      directDemocracyVoting: org?.directDemocracyVoting ? {
        id: org.directDemocracyVoting.id,
        quorumPercentage: org.directDemocracyVoting.thresholdPct,
      } : null,
    };
  }, [org?.hybridVoting, org?.directDemocracyVoting]);

  // Contract addresses for developer section
  const contracts = useMemo(() => {
    if (!org) return {};
    return {
      executor: org.executorContract?.id,
      hybridVoting: org.hybridVoting?.id,
      directDemocracyVoting: org.directDemocracyVoting?.id,
      taskManager: org.taskManager?.id,
      educationHub: org.educationHub?.id,
      quickJoin: org.quickJoin?.id,
      participationToken: org.participationToken?.id,
    };
  }, [org]);

  // Token info
  const tokenInfo = useMemo(() => {
    if (!org?.participationToken) return null;
    return {
      name: org.participationToken.name,
      symbol: org.participationToken.symbol,
      totalSupply: formatTokenAmount(org.participationToken.totalSupply || '0'),
    };
  }, [org?.participationToken]);

  // Loading state
  const loading = queryLoading || metadataLoading;

  // Total member count
  const totalMembers = org?.users?.length || 0;

  // Deployment date
  const deployedAt = org?.deployedAt ? new Date(parseInt(org.deployedAt, 10) * 1000) : null;

  // Eligibility module address for claiming roles
  const eligibilityModuleAddress = org?.eligibilityModule?.id || null;

  return {
    // Organization info
    orgId,
    orgName: org?.name || '',
    orgMetadata,
    deployedAt,
    totalMembers,
    topHatId,

    // Roles and hierarchy
    roles,
    roleHatIds,

    // Eligibility module for claiming
    eligibilityModuleAddress,

    // Permissions
    permissionsMatrix,
    permissionColumns,

    // Members
    membersByRole,

    // Governance
    governance,

    // Contracts (for developer section)
    contracts,

    // Token info
    tokenInfo,

    // State
    loading,
    error,
  };
}

export default useOrgStructure;
