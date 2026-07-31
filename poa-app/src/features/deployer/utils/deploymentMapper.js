/**
 * Deployment Mapper - Converts UI state to contract DeploymentParams
 *
 * This module transforms the deployer context state into the format
 * expected by the OrgDeployer.deployFullOrg() contract function.
 */

import { ethers } from 'ethers';
import { indicesToBitmap } from './bitmapUtils';
import { VOTING_STRATEGY, PERMISSION_KEYS, PERMISSION_DESCRIPTIONS } from '../context/deployerReducer';
import { TaskPermission } from '@/util/permissions';
import { getTokenByAddress } from '@/util/tokens';

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
  // Use plain numbers for non-null cases (matching buildRoles() in newDeployment.js)
  const adminRoleIndex = role.hierarchy.adminRoleIndex === null
    ? ethers.constants.MaxUint256
    : Number(role.hierarchy.adminRoleIndex);

  // Ensure all numeric values are numbers, not strings (React forms can return strings)
  return {
    name: String(role.name || ''),
    image: String(role.image || ''),
    metadataCID: role.metadataCID || ethers.constants.HashZero, // Use existing CID or HashZero
    canVote: Boolean(role.canVote),
    vouching: {
      enabled: Boolean(role.vouching.enabled),
      quorum: Number(role.vouching.quorum) || 0,
      voucherRoleIndex: Number(role.vouching.voucherRoleIndex) || 0,
      combineWithHierarchy: Boolean(role.vouching.combineWithHierarchy),
    },
    defaults: {
      eligible: Boolean(role.defaults.eligible),
      standing: Boolean(role.defaults.standing),
    },
    hierarchy: {
      adminRoleIndex: adminRoleIndex,
    },
    distribution: {
      mintToDeployer: Boolean(role.distribution.mintToDeployer),
      // mintToExecutor removed in contract PR #80
      additionalWearers: Array.isArray(role.distribution.additionalWearers)
        ? role.distribution.additionalWearers
        : [],
    },
    hatConfig: {
      maxSupply: Number(role.hatConfig.maxSupply) || 1000,
      mutableHat: Boolean(role.hatConfig.mutableHat),
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
    // ALWAYS empty at deploy time — deliberately, not an oversight.
    //
    // `cls.hatIds` in wizard state holds ROLE INDICES (VotingClassForm's role
    // multiselect writes 0,1,2…), but the contract consumes this field as literal
    // Hats-Protocol hat IDs. The org's hats don't exist until mid-deploy, so the
    // indices cannot be translated client-side. Passing them through shipped hat
    // IDs like `1` — ids that belong to no one in the org — and
    // GovernanceFactory._updateClassesWithTokenAndHats only backfills the real
    // role hats when the array is EMPTY (GovernanceFactory.sol:353-355). The
    // result was a voting class with zero eligible voters that reverts nothing
    // and is only noticed when a proposal scores 0.
    //
    // Sending [] makes the factory enrol every role hat in the class, which is
    // what all shipped templates already rely on. Narrowing a class to specific
    // roles is a post-deploy governance action (`setClasses`), where real hat IDs
    // are available.
    hatIds: [],
  }));
}

/**
 * Build role assignment bitmaps from permissions object.
 *
 * `roleCount` is not optional in spirit: POP PR #185 (M-09) made
 * `RoleResolver.resolveRoleBitmap` revert `UnregisteredRole(idx)` when a set bit
 * maps to a role that was never registered, instead of silently resolving to hat
 * 0. An out-of-range index therefore reverts the WHOLE deploy post-upgrade
 * (before it just wired a dead permission). Filter those bits out here so a stale
 * permission left behind by a template variation or a role removal can't brick
 * the deployment.
 *
 * @param {Object} permissions - Permissions object with role index arrays
 * @param {number} [roleCount] - Number of roles; indices >= this are dropped
 * @returns {Object} RoleAssignments for contract
 */
export function buildRoleAssignments(permissions, roleCount) {
  const inRange = (arr) => {
    const list = Array.isArray(arr) ? arr : [];
    if (!Number.isInteger(roleCount)) return list;
    return list.filter((i) => Number.isInteger(Number(i)) && Number(i) >= 0 && Number(i) < roleCount);
  };

  return {
    quickJoinRolesBitmap: indicesToBitmap(inRange(permissions.quickJoinRoles)),
    tokenMemberRolesBitmap: indicesToBitmap(inRange(permissions.tokenMemberRoles)),
    tokenApproverRolesBitmap: indicesToBitmap(inRange(permissions.tokenApproverRoles)),
    taskCreatorRolesBitmap: indicesToBitmap(inRange(permissions.taskCreatorRoles)),
    educationCreatorRolesBitmap: indicesToBitmap(inRange(permissions.educationCreatorRoles)),
    educationMemberRolesBitmap: indicesToBitmap(inRange(permissions.educationMemberRoles)),
    hybridProposalCreatorRolesBitmap: indicesToBitmap(inRange(permissions.hybridProposalCreatorRoles)),
    ddVotingRolesBitmap: indicesToBitmap(inRange(permissions.ddVotingRoles)),
    ddCreatorRolesBitmap: indicesToBitmap(inRange(permissions.ddCreatorRoles)),
  };
}

/**
 * Map paymaster state to contract PaymasterConfig format.
 * When paymaster is disabled, returns all-zeros config (contract skips everything).
 * @param {Object} paymasterState - Paymaster state from deployer context
 * @returns {Object} PaymasterConfig for contract
 */
export function mapPaymasterConfig(paymasterState) {
  if (!paymasterState || !paymasterState.enabled) {
    return {
      operatorRoleIndex: ethers.constants.MaxUint256,
      autoWhitelistContracts: false,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
      maxCallGas: 0,
      maxVerificationGas: 0,
      maxPreVerificationGas: 0,
      defaultBudgetCapPerEpoch: 0,
      defaultBudgetEpochLen: 0,
    };
  }

  const operatorRoleIndex = paymasterState.operatorRoleIndex === null
    ? ethers.constants.MaxUint256
    : Number(paymasterState.operatorRoleIndex);

  // Parse gwei strings to wei
  const parseGwei = (val) => {
    const n = parseFloat(val);
    if (!val || isNaN(n) || n <= 0) return ethers.BigNumber.from(0);
    return ethers.utils.parseUnits(n.toString(), 'gwei');
  };

  // Parse gas unit strings to numbers
  const parseGasUnits = (val) => {
    const n = parseInt(val, 10);
    return (!val || isNaN(n) || n <= 0) ? 0 : n;
  };

  // Parse budget cap from ETH string to wei
  const budgetCapWei = paymasterState.budgetCapEth && parseFloat(paymasterState.budgetCapEth) > 0
    ? ethers.utils.parseEther(paymasterState.budgetCapEth)
    : ethers.BigNumber.from(0);

  // Convert epoch value + unit to seconds
  const unitToSeconds = { hours: 3600, days: 86400, weeks: 604800 };
  const epochValue = parseFloat(paymasterState.budgetEpochValue) || 0;
  const epochSeconds = Math.round(epochValue * (unitToSeconds[paymasterState.budgetEpochUnit] || 86400));

  return {
    operatorRoleIndex,
    autoWhitelistContracts: Boolean(paymasterState.autoWhitelistContracts),
    maxFeePerGas: parseGwei(paymasterState.maxFeePerGas),
    maxPriorityFeePerGas: parseGwei(paymasterState.maxPriorityFeePerGas),
    maxCallGas: parseGasUnits(paymasterState.maxCallGas),
    maxVerificationGas: parseGasUnits(paymasterState.maxVerificationGas),
    maxPreVerificationGas: parseGasUnits(paymasterState.maxPreVerificationGas),
    defaultBudgetCapPerEpoch: budgetCapWei,
    defaultBudgetEpochLen: epochSeconds,
  };
}

/**
 * Build the TaskManagerPermConfig { roleIndices, masks } from the wizard's
 * `taskManagerPerms` map ({ [roleIndex]: uint8Mask }).
 *
 * CREATE reconciliation (critical): the deployer applies these via
 * `TaskManager.bootstrapGlobalPerms`, which OVERWRITES `rolePermGlobal[hat]`
 * (TaskManager.sol:539) — it does NOT OR. That runs AFTER init has already granted
 * CREATE to the hats in `roleAssignments.taskCreatorRolesBitmap`. So for a role
 * that IS a task creator, the emitted mask must re-include CREATE or the init grant
 * is silently erased; for a role that is NOT, CREATE must be left out or we'd hand
 * it a permission the wizard says it shouldn't have. We also skip any entry whose
 * only bit is CREATE — the init bitmap already covers that, so the extra overwrite
 * would be redundant calldata.
 *
 * @param {Object} taskManagerPerms - map of roleIndex -> uint8 mask
 * @param {number[]} [taskCreatorRoles] - role indices granted CREATE at init.
 *        Omit to assume every listed role is a creator (the historical behaviour,
 *        back when `taskCreatorRolesBitmap` was hardcoded to all roles).
 * @returns {{ roleIndices: ethers.BigNumber[], masks: number[] }} parallel arrays
 */
export function buildTaskManagerPerms(taskManagerPerms = {}, taskCreatorRoles = null) {
  const creators = Array.isArray(taskCreatorRoles) ? new Set(taskCreatorRoles.map(Number)) : null;
  const roleIndices = [];
  const masks = [];
  for (const [k, rawMask] of Object.entries(taskManagerPerms || {})) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0) continue;
    const isCreator = creators === null || creators.has(idx);
    const mask = isCreator
      ? (Number(rawMask) & 0xff) | TaskPermission.CREATE // preserve init CREATE grant
      : (Number(rawMask) & 0xff) & ~TaskPermission.CREATE; // not a creator — don't grant it
    if (mask === TaskPermission.CREATE) continue; // CREATE-only already handled at init
    if (mask === 0) continue; // nothing to grant
    roleIndices.push(ethers.BigNumber.from(idx));
    masks.push(mask);
  }
  return { roleIndices, masks };
}

/**
 * Build the BootstrapConfig { projects, tasks } from the wizard's bootstrap state.
 *
 * Field encoding (matches ITaskManagerBootstrap structs):
 * - title         -> UTF-8 bytes
 * - metadataHash  -> already a bytes32 CID (uploaded to IPFS in the create page,
 *                    like role metadata) or HashZero
 * - cap/payout/bountyCaps/bountyPayout -> 18-decimal wei (parseEther)
 * - createHats/claimHats/reviewHats/assignHats -> ROLE INDICES (deployer resolves
 *   them to hat IDs via _resolveBootstrapRoles)
 * - managers/bountyTokens -> literal, validated addresses
 * - projectIndex  -> uint8 index into projects[]
 *
 * @param {Object} bootstrap - { projects: [], tasks: [] } from state (with metadataHash filled)
 * @returns {{ projects: Object[], tasks: Object[] }}
 */
export function buildBootstrapConfig(bootstrap = { projects: [], tasks: [] }) {
  const toTitle = (s) => ethers.utils.hexlify(ethers.utils.toUtf8Bytes(s || ''));
  // Participation-token amounts (project cap, task payout) are 18-decimal.
  const toWei = (v) => {
    const n = parseFloat(v);
    return (!v || isNaN(n) || n <= 0) ? ethers.constants.Zero : ethers.utils.parseEther(String(v));
  };
  // Bounty amounts are denominated in the bounty TOKEN's own decimals (e.g. USDC=6),
  // NOT 18 — mirror TaskService. Unknown tokens fall back to 18 via getTokenByAddress.
  const toTokenWei = (v, tokenAddr) => {
    const n = parseFloat(v);
    if (!v || isNaN(n) || n <= 0) return ethers.constants.Zero;
    const decimals = getTokenByAddress(tokenAddr)?.decimals ?? 18;
    return ethers.utils.parseUnits(String(v), decimals);
  };
  const toIdxArray = (arr) => (arr || [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);

  const projects = (bootstrap?.projects || []).map((p) => {
    const bounties = (p.bounties || []).filter((b) => b && ethers.utils.isAddress(b.token));
    return {
      title: toTitle(p.title),
      metadataHash: p.metadataHash || ethers.constants.HashZero,
      cap: toWei(p.cap),
      managers: (p.managers || []).filter((a) => ethers.utils.isAddress(a)),
      createHats: toIdxArray(p.createHats),
      claimHats: toIdxArray(p.claimHats),
      reviewHats: toIdxArray(p.reviewHats),
      assignHats: toIdxArray(p.assignHats),
      bountyTokens: bounties.map((b) => b.token),
      bountyCaps: bounties.map((b) => toTokenWei(b.cap, b.token)),
    };
  });

  const tasks = (bootstrap?.tasks || []).map((t) => {
    const bountyToken = ethers.utils.isAddress(t.bountyToken) ? t.bountyToken : ethers.constants.AddressZero;
    return {
      projectIndex: Number(t.projectIndex) || 0,
      payout: toWei(t.payout),
      title: toTitle(t.title),
      metadataHash: t.metadataHash || ethers.constants.HashZero,
      bountyToken,
      bountyPayout: bountyToken === ethers.constants.AddressZero ? ethers.constants.Zero : toTokenWei(t.bountyPayout, bountyToken),
      requiresApplication: Boolean(t.requiresApplication),
    };
  });

  return { projects, tasks };
}

/**
 * Get the ETH value to send with deployFullOrg (msg.value for paymaster funding)
 * @param {Object} paymasterState - Paymaster state from deployer context
 * @returns {ethers.BigNumber} Value in wei, or 0 if no funding
 */
export function getPaymasterFundingValue(paymasterState) {
  if (!paymasterState?.enabled || !paymasterState.fundingAmountEth) {
    return ethers.BigNumber.from(0);
  }
  const amount = parseFloat(paymasterState.fundingAmountEth);
  if (isNaN(amount) || amount <= 0) {
    return ethers.BigNumber.from(0);
  }
  return ethers.utils.parseEther(paymasterState.fundingAmountEth);
}

/**
 * Main mapper function - converts full deployer state to DeploymentParams
 * @param {Object} state - Deployer state from context
 * @param {string} deployerAddress - Address of the deployer wallet
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.registryAddress] - Universal Account Registry address (fetched from subgraph, required)
 * @returns {Object} DeploymentParams for contract
 */
export function mapStateToDeploymentParams(state, deployerAddress, options = {}) {
  const { organization, roles, permissions, voting, features, paymaster } = state;
  const registryAddress = options.registryAddress;

  if (!registryAddress) {
    throw new Error('Registry address not found. Please ensure the subgraph is synced and returning infrastructure addresses.');
  }

  // Generate orgId
  const orgId = generateOrgId(organization.name);

  // Map roles
  const contractRoles = roles.map((role, idx) => mapRole(role, idx, roles.length));

  // Vouched roles must NOT be default-eligible. Two independent contract rules
  // make this mandatory (POP PR #185):
  //
  //   M-03 — EligibilityModule._requireNoDefaultVouchConflictOnVouch reverts
  //          `DefaultEligibilityConflictsWithVouch` when vouch config with
  //          `combineWithHierarchy` is written onto an already default-eligible
  //          hat. OrgDeployer writes defaults first (HatsTreeSetup) and vouch
  //          config last (step 10.5), so this aborts the WHOLE deploy.
  //   H-03 — QuickJoin._rejectOpenClaimHats reverts `HatOpenlyClaimable` for any
  //          claim hat that is default-eligible, which kills the vouch-claim and
  //          zk-email claim paths for that role even if the deploy succeeded.
  //
  // It is also the semantically correct config on the CURRENTLY DEPLOYED
  // contracts: a default-eligible hat satisfies eligibility for everyone, so the
  // vouch quorum the wizard advertises is already a no-op there. Normalizing is
  // therefore safe both pre- and post-upgrade.
  contractRoles.forEach((cr, roleIdx) => {
    if (cr.vouching.enabled && cr.defaults.eligible) {
      console.warn(
        `[DeployMapper] Forcing defaults.eligible=false on vouched role "${cr.name}" (idx ${roleIdx}); a default-eligible hat makes its vouch quorum meaningless and is rejected by EligibilityModule (M-03) / QuickJoin (H-03).`
      );
      contractRoles[roleIdx] = { ...cr, defaults: { ...cr.defaults, eligible: false } };
    }
  });

  // Defensive normalization for quick-join roles: if a role is in
  // permissions.quickJoinRoles AND has vouching disabled AND has default
  // eligibility disabled, force eligible=true. The EligibilityModule would
  // otherwise reject every mint, leaving the role unreachable (see Decentral
  // Park's Neighbor hat for the production manifestation of this bug). The
  // validation guard in validateDeploymentConfig should already block this
  // upstream, but normalize here too so a regression in the wizard's review
  // step can't ship contradictory calldata.
  const quickJoinRoleIndices = (permissions?.quickJoinRoles) || [];
  quickJoinRoleIndices.forEach(roleIdx => {
    const cr = contractRoles[roleIdx];
    if (!cr) return;
    if (!cr.vouching.enabled && !cr.defaults.eligible) {
      console.warn(
        `[DeployMapper] Forcing defaults.eligible=true on quick-join role "${cr.name}" (idx ${roleIdx}); both vouching and eligibility were disabled, which would make the role unclaimable.`
      );
      contractRoles[roleIdx] = {
        ...cr,
        defaults: { ...cr.defaults, eligible: true },
      };
    }
  });

  // Map voting classes.
  // Safety check: if democracyWeight exists and classes don't match it
  // (e.g., APPLY_VARIATION updated the weight but not classes), rebuild from the weight.
  let votingClasses = voting.classes;
  if (voting.democracyWeight !== undefined && votingClasses && votingClasses.length === 2) {
    const directClass = votingClasses.find(c => c.strategy === 0 || c.strategy === 'DIRECT');
    if (directClass && directClass.slicePct !== voting.democracyWeight) {
      console.warn('[DeployMapper] Voting classes out of sync with democracyWeight. Rebuilding.',
        { classSlice: directClass.slicePct, democracyWeight: voting.democracyWeight });
      const { sliderToVotingConfig } = require('../utils/philosophyMapper');
      votingClasses = sliderToVotingConfig(voting.democracyWeight).classes;
    }
  }
  const hybridClasses = mapVotingClasses(votingClasses);

  // Build role assignments
  const roleAssignments = buildRoleAssignments(permissions, roles.length);

  return {
    orgId,
    orgName: organization.name,
    metadataHash: ethers.constants.HashZero, // Will be set by deployment script after IPFS upload
    registryAddr: registryAddress,
    deployerAddress,
    deployerUsername: organization.username || '',
    // EIP-712 registration signature (safe defaults skip registration in contract)
    regDeadline: options.regSignatureData?.regDeadline ?? 0,
    regNonce: options.regSignatureData?.regNonce ?? 0,
    regSignature: options.regSignatureData?.regSignature ?? '0x',
    autoUpgrade: organization.autoUpgrade,
    hybridThresholdPct: voting.hybridQuorum,
    ddThresholdPct: voting.ddQuorum,
    hybridClasses,
    // DirectDemocracy execution-target whitelist (valid, deduped addresses)
    ddInitialTargets: Array.from(
      new Set((state.ddInitialTargets || []).filter((a) => ethers.utils.isAddress(a)))
    ),
    roles: contractRoles,
    roleAssignments,
    // Metadata admin: which role's hat gets metadata-admin privilege.
    // ethers.constants.MaxUint256 = skip (topHat fallback in contract).
    // Priority: explicit option > state value > MaxUint256 (skip/topHat fallback).
    metadataAdminRoleIndex: options.metadataAdminRoleIndex != null
      ? ethers.BigNumber.from(options.metadataAdminRoleIndex)
      : (state.metadataAdminRoleIndex !== null && state.metadataAdminRoleIndex !== undefined
        ? ethers.BigNumber.from(state.metadataAdminRoleIndex)
        : ethers.constants.MaxUint256),
    // Passkey support - enabled by default for all new orgs
    passkeyEnabled: true,
    // Education hub configuration
    educationHubConfig: {
      enabled: features.educationHubEnabled || false,
    },
    // Bootstrap configuration (initial projects and tasks). Descriptions are
    // uploaded to IPFS in the create page before mapping (metadataHash filled).
    bootstrap: buildBootstrapConfig(state.bootstrap),
    // Paymaster configuration (all-zeros = skip)
    paymasterConfig: mapPaymasterConfig(paymaster),
    // Org-wide TaskManager ROLE_PERM grants (must be the LAST field — matches the
    // contract struct order so ethers encodes the tuple positionally correct).
    // No creator list: the deployed `taskCreatorRolesBitmap` is still name-derived
    // (all roles), so every mask must keep CREATE. See buildTaskManagerPerms.
    taskManagerPerms: buildTaskManagerPerms(state.taskManagerPerms),
  };
}

/**
 * Create the full deployment configuration including metadata
 * @param {Object} state - Deployer state from context
 * @param {string} deployerAddress - Address of the deployer wallet
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.registryAddress] - Universal Account Registry address (fetched from subgraph, required)
 * @returns {Object} Full deployment config with metadata
 */
export function createDeploymentConfig(state, deployerAddress, options = {}) {
  const params = mapStateToDeploymentParams(state, deployerAddress, options);

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
      hideTreasury: state.features.hideTreasury,
    },
    summary: {
      orgName: state.organization.name,
      roleCount: state.roles.length,
      roleNames: state.roles.map(r => r.name),
      votingMode: state.voting.mode,
      votingClassCount: state.voting.classes.length,
      hasVouching: state.roles.some(r => r.vouching.enabled),
      paymasterEnabled: state.paymaster?.enabled || false,
      paymasterFundingEth: state.paymaster?.fundingAmountEth || '0',
      hybridVoterQuorum: state.voting.hybridVoterQuorum || 0,
      ddVoterQuorum: state.voting.ddVoterQuorum || 0,
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
      // A vouched role must not also be default-eligible. On the currently deployed
      // contracts the vouch quorum is silently a no-op; on POP PR #185 contracts it
      // is a hard revert — `DefaultEligibilityConflictsWithVouch` aborts the whole
      // deploy (M-03, when "hierarchy admins can also vouch" is on), and
      // `HatOpenlyClaimable` blocks every claim of that role (H-03). The mapper
      // normalizes this too; catching it here tells the user WHICH switch to flip.
      if (role.defaults.eligible) {
        errors.push(
          `Role "${role.name}" requires vouches but is also "eligible by default" — that makes the vouch requirement meaningless and the role unclaimable. Turn off "Eligible by default" for this role.`
        );
      }
    }
  });

  // Every permission bitmap index must point at a role that exists. POP PR #185
  // (M-09) made `RoleResolver` revert `UnregisteredRole(idx)` instead of silently
  // resolving a stale index to hat 0, so an out-of-range bit now aborts the deploy.
  PERMISSION_KEYS.forEach((key) => {
    const label = PERMISSION_DESCRIPTIONS[key]?.label || key;
    (state.permissions?.[key] || []).forEach((rawIdx) => {
      const idx = Number(rawIdx);
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.roles.length) {
        errors.push(`The "${label}" permission is assigned to a role that no longer exists. Re-check the Permissions step.`);
      }
    });
  });

  // Executor.MAX_HATS_PER_MINT caps a single mint batch at 20 hats; quick-join
  // mints every join-time role in one call, so >20 would make joining impossible.
  if ((state.permissions?.quickJoinRoles || []).length > 20) {
    errors.push('At most 20 roles can be granted automatically on join. Remove some join-time roles.');
  }

  // Quick-join eligibility guard: a role in quickJoinRoles with vouching disabled
  // AND default eligibility disabled is unreachable — QuickJoin.memberHatIds
  // advertises it as joinable but the EligibilityModule rejects every mint.
  // Decentral Park's Neighbor hat shipped in exactly this state (template seeded
  // eligible:false, the user toggled vouching off for the quick-join role but
  // didn't realize eligibility needed to flip), so the on-chain Hats.mintHat
  // reverts on every quickJoinWithUser. Catch it at the wizard's Review step.
  const quickJoinRoleIndices = (state.permissions?.quickJoinRoles) || [];
  quickJoinRoleIndices.forEach(roleIdx => {
    const role = state.roles[roleIdx];
    if (!role) return; // out-of-range refs caught elsewhere
    if (!role.vouching.enabled && !role.defaults.eligible) {
      errors.push(
        `Role "${role.name}" is set as quick-join but has both vouching and default eligibility disabled — no one would be able to claim it. Enable default eligibility for this role.`
      );
    }
  });

  // Hierarchy validation (check for self-reference)
  state.roles.forEach((role, idx) => {
    if (role.hierarchy.adminRoleIndex === idx) {
      errors.push(`Role "${role.name}" cannot be its own admin`);
    }
  });

  // Metadata admin validation
  if (state.metadataAdminRoleIndex !== null && state.metadataAdminRoleIndex !== undefined) {
    if (state.metadataAdminRoleIndex >= state.roles.length) {
      errors.push('Metadata admin role index is out of range');
    }
  }

  // Paymaster validation
  if (state.paymaster?.enabled) {
    const pm = state.paymaster;
    if (pm.operatorRoleIndex !== null && pm.operatorRoleIndex >= state.roles.length) {
      errors.push('Paymaster operator role index is out of range');
    }
    const epochValue = parseFloat(pm.budgetEpochValue) || 0;
    const unitToSeconds = { hours: 3600, days: 86400, weeks: 604800 };
    const epochSeconds = Math.round(epochValue * (unitToSeconds[pm.budgetEpochUnit] || 86400));
    const capEth = parseFloat(pm.budgetCapEth);
    const hasCapSet = !isNaN(capEth) && capEth > 0;
    const hasEpochSet = epochSeconds > 0;
    if (hasCapSet !== hasEpochSet) {
      errors.push('Budget cap and epoch length must both be set or both be zero');
    }
    if (hasEpochSet) {
      if (epochSeconds < 3600) errors.push('Budget epoch must be at least 1 hour');
      if (epochSeconds > 31536000) errors.push('Budget epoch must be at most 365 days');
    }
    const fundingEth = parseFloat(pm.fundingAmountEth);
    if (!isNaN(fundingEth) && fundingEth < 0) {
      errors.push('Paymaster funding amount cannot be negative');
    }
  }

  // DirectDemocracy execution targets must be valid addresses
  if (Array.isArray(state.ddInitialTargets)) {
    state.ddInitialTargets.forEach((addr) => {
      if (addr && !ethers.utils.isAddress(addr)) {
        errors.push(`DirectDemocracy target "${addr}" is not a valid address.`);
      }
    });
  }

  // Org-wide TaskManager permission grants: indices in range, masks 0-255
  if (state.taskManagerPerms) {
    for (const [k, mask] of Object.entries(state.taskManagerPerms)) {
      const idx = Number(k);
      const m = Number(mask);
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.roles.length) {
        errors.push(`Task permission references an invalid role index (${k}).`);
      }
      if (!Number.isInteger(m) || m < 0 || m > 255) {
        errors.push(`Task permission mask for role "${state.roles[idx]?.name || k}" must be between 0 and 255.`);
      }
    }
  }

  // Bootstrap projects & tasks
  if (state.bootstrap) {
    const projects = state.bootstrap.projects || [];
    const tasks = state.bootstrap.tasks || [];
    const roleCount = state.roles.length;
    projects.forEach((p, pIdx) => {
      const label = p.title?.trim() || `Project ${pIdx + 1}`;
      if (!p.title || !p.title.trim()) {
        errors.push(`Bootstrap project ${pIdx + 1} needs a title.`);
      }
      ['createHats', 'claimHats', 'reviewHats', 'assignHats'].forEach((key) => {
        (p[key] || []).forEach((ri) => {
          if (!Number.isInteger(Number(ri)) || Number(ri) < 0 || Number(ri) >= roleCount) {
            errors.push(`Bootstrap project "${label}" references an invalid role.`);
          }
        });
      });
      (p.managers || []).forEach((a) => {
        if (a && !ethers.utils.isAddress(a)) errors.push(`Bootstrap project "${label}" has an invalid manager address.`);
      });
      (p.bounties || []).forEach((b) => {
        const hasCap = parseFloat(b?.cap) > 0;
        const validToken = b?.token && ethers.utils.isAddress(b.token);
        if (b?.token && !ethers.utils.isAddress(b.token)) errors.push(`Bootstrap project "${label}" has an invalid bounty token address.`);
        // A cap with no valid token would be silently dropped at build time — flag it.
        if (hasCap && !validToken) errors.push(`Bootstrap project "${label}" has a bounty cap but no valid bounty token.`);
      });
    });
    tasks.forEach((t, tIdx) => {
      const label = t.title?.trim() || `${tIdx + 1}`;
      if (!t.title || !t.title.trim()) errors.push(`Bootstrap task ${tIdx + 1} needs a title.`);
      if (!Number.isInteger(Number(t.projectIndex)) || Number(t.projectIndex) < 0 || Number(t.projectIndex) >= projects.length) {
        errors.push(`Bootstrap task "${label}" must belong to a valid project.`);
      }
      // The TaskManager reverts (InvalidPayout) on a zero payout at creation.
      if (!(parseFloat(t.payout) > 0)) {
        errors.push(`Bootstrap task "${label}" must have a payout greater than 0.`);
      }
      if (t.bountyToken && !ethers.utils.isAddress(t.bountyToken)) {
        errors.push(`Bootstrap task "${label}" has an invalid bounty token address.`);
      }
      // A bounty amount with no valid token is silently zeroed at build time — flag it.
      if (parseFloat(t.bountyPayout) > 0 && !ethers.utils.isAddress(t.bountyToken)) {
        errors.push(`Bootstrap task "${label}" has a bounty amount but no valid bounty token.`);
      }
    });
  }

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
  console.log('Username:', params.deployerUsername || '(none)');
  console.log('Reg Deadline:', params.regDeadline?.toString?.() ?? '0');
  console.log('Reg Nonce:', params.regNonce?.toString?.() ?? '0');
  console.log('Reg Signature:', params.regSignature === '0x' ? '(skip)' : params.regSignature?.slice(0, 20) + '...');
  console.log('Auto Upgrade:', params.autoUpgrade);
  console.log('Hybrid Threshold:', params.hybridThresholdPct);
  console.log('DD Threshold:', params.ddThresholdPct);
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
  console.log('Metadata Admin Role Index:', params.metadataAdminRoleIndex?.toString?.() ?? 'max (skip)');
  console.log('Paymaster Config:', params.paymasterConfig);
}

export default {
  generateOrgId,
  mapRole,
  mapVotingClasses,
  buildRoleAssignments,
  mapPaymasterConfig,
  getPaymasterFundingValue,
  buildTaskManagerPerms,
  buildBootstrapConfig,
  mapStateToDeploymentParams,
  createDeploymentConfig,
  validateDeploymentConfig,
  logDeploymentParams,
};
