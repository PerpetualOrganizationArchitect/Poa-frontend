/**
 * Deployment Mapper - Converts UI state to contract DeploymentParams
 *
 * This module transforms the deployer context state into the format
 * expected by the OrgDeployer.deployFullOrg() contract function.
 */

import { ethers } from 'ethers';
import { indicesToBitmap } from './bitmapUtils';
import { VOTING_STRATEGY } from '../context/deployerReducer';

// Infrastructure addresses on Hoodi testnet
const UNIVERSAL_REGISTRY_ADDRESS = '0xDdB1DA30020861d92c27aE981ac0f4Fe8BA536F2';

/**
 * Generate organization ID from name
 * @param {string} orgName - Organization name
 * @returns {string} bytes32 orgId hash
 */
export function generateOrgId(orgName) {
  const normalized = orgName.toLowerCase().replace(/\s+/g, '-');
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(normalized));
}

/**
 * Map a single role from UI state to contract format
 * @param {Object} role - Role object from UI state
 * @param {number} index - Role index
 * @param {number} totalRoles - Total number of roles
 * @returns {Object} RoleConfig for contract
 */
export function mapRole(role, index, totalRoles) {
  // Determine adminRoleIndex
  // null in UI = top-level = MaxUint256 for contract
  const adminRoleIndex = role.hierarchy.adminRoleIndex === null
    ? ethers.constants.MaxUint256
    : ethers.BigNumber.from(role.hierarchy.adminRoleIndex);

  return {
    name: role.name,
    image: role.image || '',
    canVote: role.canVote,
    vouching: {
      enabled: role.vouching.enabled,
      quorum: role.vouching.quorum,
      voucherRoleIndex: role.vouching.voucherRoleIndex,
      combineWithHierarchy: role.vouching.combineWithHierarchy,
    },
    defaults: {
      eligible: role.defaults.eligible,
      standing: role.defaults.standing,
    },
    hierarchy: {
      adminRoleIndex: adminRoleIndex,
    },
    distribution: {
      mintToDeployer: role.distribution.mintToDeployer,
      mintToExecutor: role.distribution.mintToExecutor,
      additionalWearers: role.distribution.additionalWearers || [],
    },
    hatConfig: {
      maxSupply: role.hatConfig.maxSupply,
      mutableHat: role.hatConfig.mutableHat,
    },
  };
}

/**
 * Map voting classes from UI state to contract format
 * @param {Array} classes - Array of voting class objects
 * @returns {Array} ClassConfig array for contract
 */
export function mapVotingClasses(classes) {
  return classes.map(cls => ({
    strategy: cls.strategy, // 0 = DIRECT, 1 = ERC20_BAL
    slicePct: cls.slicePct,
    quadratic: cls.quadratic,
    minBalance: cls.minBalance > 0
      ? ethers.utils.parseEther(cls.minBalance.toString())
      : ethers.BigNumber.from(0),
    asset: cls.asset || ethers.constants.AddressZero,
    hatIds: cls.hatIds || [],
  }));
}

/**
 * Build role assignment bitmaps from permissions object
 * @param {Object} permissions - Permissions object with role index arrays
 * @returns {Object} RoleAssignments for contract
 */
export function buildRoleAssignments(permissions) {
  return {
    quickJoinRolesBitmap: indicesToBitmap(permissions.quickJoinRoles || []),
    tokenMemberRolesBitmap: indicesToBitmap(permissions.tokenMemberRoles || []),
    tokenApproverRolesBitmap: indicesToBitmap(permissions.tokenApproverRoles || []),
    taskCreatorRolesBitmap: indicesToBitmap(permissions.taskCreatorRoles || []),
    educationCreatorRolesBitmap: indicesToBitmap(permissions.educationCreatorRoles || []),
    educationMemberRolesBitmap: indicesToBitmap(permissions.educationMemberRoles || []),
    hybridProposalCreatorRolesBitmap: indicesToBitmap(permissions.hybridProposalCreatorRoles || []),
    ddVotingRolesBitmap: indicesToBitmap(permissions.ddVotingRoles || []),
    ddCreatorRolesBitmap: indicesToBitmap(permissions.ddCreatorRoles || []),
  };
}

/**
 * Main mapper function - converts full deployer state to DeploymentParams
 * @param {Object} state - Deployer state from context
 * @param {string} deployerAddress - Address of the deployer wallet
 * @returns {Object} DeploymentParams for contract
 */
export function mapStateToDeploymentParams(state, deployerAddress) {
  const { organization, roles, permissions, voting, features } = state;

  // Generate orgId
  const orgId = generateOrgId(organization.name);

  // Map roles
  const contractRoles = roles.map((role, idx) => mapRole(role, idx, roles.length));

  // Map voting classes
  const hybridClasses = mapVotingClasses(voting.classes);

  // Build role assignments
  const roleAssignments = buildRoleAssignments(permissions);

  return {
    orgId,
    orgName: organization.name,
    registryAddr: UNIVERSAL_REGISTRY_ADDRESS,
    deployerAddress,
    deployerUsername: organization.username || '',
    autoUpgrade: organization.autoUpgrade,
    hybridQuorumPct: voting.hybridQuorum,
    ddQuorumPct: voting.ddQuorum,
    hybridClasses,
    ddInitialTargets: [], // Empty for now
    roles: contractRoles,
    roleAssignments,
  };
}

/**
 * Create the full deployment configuration including metadata
 * @param {Object} state - Deployer state from context
 * @param {string} deployerAddress - Address of the deployer wallet
 * @returns {Object} Full deployment config with metadata
 */
export function createDeploymentConfig(state, deployerAddress) {
  const params = mapStateToDeploymentParams(state, deployerAddress);

  return {
    params,
    metadata: {
      description: state.organization.description,
      links: state.organization.links,
      logoURL: state.organization.logoURL,
      infoIPFSHash: state.organization.infoIPFSHash,
    },
    features: {
      educationHubEnabled: state.features.educationHubEnabled,
      electionHubEnabled: state.features.electionHubEnabled,
    },
    summary: {
      orgName: state.organization.name,
      roleCount: state.roles.length,
      roleNames: state.roles.map(r => r.name),
      votingMode: state.voting.mode,
      votingClassCount: state.voting.classes.length,
      hasVouching: state.roles.some(r => r.vouching.enabled),
    },
  };
}

/**
 * Validate the deployment configuration
 * @param {Object} state - Deployer state
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export function validateDeploymentConfig(state) {
  const errors = [];

  // Organization validation
  if (!state.organization.name) {
    errors.push('Organization name is required');
  }
  if (!state.organization.description) {
    errors.push('Organization description is required');
  }

  // Roles validation
  if (state.roles.length === 0) {
    errors.push('At least one role is required');
  }
  if (state.roles.length > 32) {
    errors.push('Maximum 32 roles allowed');
  }

  // Check for unique role names
  const roleNames = state.roles.map(r => r.name.toLowerCase());
  const uniqueNames = new Set(roleNames);
  if (uniqueNames.size !== roleNames.length) {
    errors.push('Role names must be unique');
  }

  // Check for empty role names
  if (state.roles.some(r => !r.name || r.name.trim() === '')) {
    errors.push('All roles must have a name');
  }

  // Check at least one top-level role
  const hasTopLevel = state.roles.some(r => r.hierarchy.adminRoleIndex === null);
  if (!hasTopLevel && state.roles.length > 0) {
    errors.push('At least one role must be a top-level admin');
  }

  // Voting class validation
  const totalSlice = state.voting.classes.reduce((sum, c) => sum + c.slicePct, 0);
  if (totalSlice !== 100) {
    errors.push(`Voting class percentages must sum to 100% (currently ${totalSlice}%)`);
  }

  if (state.voting.classes.length === 0) {
    errors.push('At least one voting class is required');
  }

  if (state.voting.classes.length > 8) {
    errors.push('Maximum 8 voting classes allowed');
  }

  // Vouching validation
  state.roles.forEach((role, idx) => {
    if (role.vouching.enabled) {
      if (role.vouching.quorum <= 0) {
        errors.push(`Role "${role.name}" has vouching enabled but quorum must be positive`);
      }
      if (role.vouching.voucherRoleIndex >= state.roles.length) {
        errors.push(`Role "${role.name}" has invalid voucher role reference`);
      }
    }
  });

  // Hierarchy validation (check for self-reference)
  state.roles.forEach((role, idx) => {
    if (role.hierarchy.adminRoleIndex === idx) {
      errors.push(`Role "${role.name}" cannot be its own admin`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Log deployment parameters for debugging
 * @param {Object} params - DeploymentParams
 */
export function logDeploymentParams(params) {
  console.log('=== Deployment Parameters ===');
  console.log('OrgId:', params.orgId);
  console.log('OrgName:', params.orgName);
  console.log('Deployer:', params.deployerAddress);
  console.log('Auto Upgrade:', params.autoUpgrade);
  console.log('Hybrid Quorum:', params.hybridQuorumPct);
  console.log('DD Quorum:', params.ddQuorumPct);
  console.log('Roles:', params.roles.length);
  params.roles.forEach((r, i) => {
    console.log(`  [${i}] ${r.name}`, {
      canVote: r.canVote,
      vouching: r.vouching.enabled,
      parent: r.hierarchy.adminRoleIndex.toString(),
    });
  });
  console.log('Voting Classes:', params.hybridClasses.length);
  params.hybridClasses.forEach((c, i) => {
    console.log(`  [${i}] Strategy: ${c.strategy}, Slice: ${c.slicePct}%, Quadratic: ${c.quadratic}`);
  });
  console.log('Role Assignments:', params.roleAssignments);
}

export default {
  generateOrgId,
  mapRole,
  mapVotingClasses,
  buildRoleAssignments,
  mapStateToDeploymentParams,
  createDeploymentConfig,
  validateDeploymentConfig,
  logDeploymentParams,
};
