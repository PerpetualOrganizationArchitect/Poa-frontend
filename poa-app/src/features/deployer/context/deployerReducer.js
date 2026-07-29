/**
 * Deployer Reducer - Manages the complete state for the DAO deployment wizard
 *
 * This reducer handles all state transitions for the deployment process.
 * Supports both Simple mode (5 steps + template) and Advanced mode (6 steps).
 *
 * Simple Mode Flow:
 * Template → Identity → Team → Governance → Settings → Launch
 *
 * Advanced Mode Flow:
 * Organization → Roles → Permissions → Voting → Settings → Review
 */

import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_DEPLOY_CHAIN_ID, NETWORKS, DEFAULT_DEPLOY_NETWORK, getNetworkByChainId } from '../../../config/networks';

// Lazy import to avoid circular dependency (philosophyMapper imports VOTING_STRATEGY from this file)
let _sliderToVotingConfig;
function getSliderToVotingConfig() {
  if (!_sliderToVotingConfig) {
    _sliderToVotingConfig = require('../utils/philosophyMapper').sliderToVotingConfig;
  }
  return _sliderToVotingConfig;
}

// Step constants - New flow
export const STEPS = {
  TEMPLATE: 0,        // Template selection (Simple mode)
  IDENTITY: 1,        // Organization details (replaces ORGANIZATION)
  TEAM: 2,            // Roles (simplified in Simple mode)
  GOVERNANCE: 3,      // Philosophy + Powers (replaces Permissions + Voting)
  SETTINGS: 4,        // Optional features & services (gas, education, etc.)
  LAUNCH: 5,          // Review & Deploy

  // Legacy step aliases for Advanced mode compatibility
  ORGANIZATION: 1,
  ROLES: 2,
  PERMISSIONS: 3,
  VOTING: 3,
  REVIEW: 5,
};

export const STEP_NAMES = [
  'Choose Template',
  'Identity',
  'Team',
  'Governance',
  'Settings',
  'Launch',
];

// Advanced mode step names (for backwards compatibility)
export const ADVANCED_STEP_NAMES = [
  'Template',
  'Organization Details',
  'Roles & Hierarchy',
  'Permissions & Voting',
  'Settings & Features',
  'Review & Deploy',
];

// UI Modes
export const UI_MODES = {
  SIMPLE: 'simple',
  ADVANCED: 'advanced',
};

// Voting strategies
export const VOTING_STRATEGY = {
  DIRECT: 0,       // 1-person-1-vote based on hat
  ERC20_BAL: 1,    // Token balance based
};

// Permission keys (9 total)
export const PERMISSION_KEYS = [
  'quickJoinRoles',
  'tokenMemberRoles',
  'tokenApproverRoles',
  'taskCreatorRoles',
  'educationCreatorRoles',
  'educationMemberRoles',
  'hybridProposalCreatorRoles',
  'ddVotingRoles',
  'ddCreatorRoles',
];

// Permission descriptions with labels for UI
export const PERMISSION_DESCRIPTIONS = {
  quickJoinRoles: {
    label: 'Quick Join',
    description: 'Roles automatically assigned when a user joins via QuickJoin',
  },
  tokenMemberRoles: {
    label: 'Token Member',
    description: 'Roles that can earn and hold shares',
  },
  tokenApproverRoles: {
    label: 'Token Approver',
    description: 'Roles that can approve share requests',
  },
  taskCreatorRoles: {
    label: 'Task Creator',
    description: 'Roles that can create new tasks',
  },
  educationCreatorRoles: {
    label: 'Education Creator',
    description: 'Roles that can create education modules',
  },
  educationMemberRoles: {
    label: 'Education Member',
    description: 'Roles that can access and complete education modules',
  },
  hybridProposalCreatorRoles: {
    label: 'Hybrid Proposal Creator',
    description: 'Roles that can create hybrid voting proposals',
  },
  ddVotingRoles: {
    label: 'DD Voting',
    description: 'Roles that can vote in direct democracy polls',
  },
  ddCreatorRoles: {
    label: 'DD Creator',
    description: 'Roles that can create direct democracy polls',
  },
};

// Create a default role object
export const createDefaultRole = (index = 0, name = 'New Role') => ({
  id: uuidv4(),
  name,
  description: '', // Role description for IPFS metadata
  image: '',
  canVote: true,
  vouching: {
    enabled: false,
    quorum: 0,
    voucherRoleIndex: 0,
    combineWithHierarchy: false,
  },
  defaults: {
    eligible: true,
    standing: true,
  },
  hierarchy: {
    adminRoleIndex: null, // null = top-level (will be converted to MaxUint256)
  },
  distribution: {
    mintToDeployer: true, // All roles minted to deployer by default
    additionalWearers: [],        // Resolved addresses (populated before deployment)
    additionalWearerUsernames: [], // Usernames entered by user
  },
  hatConfig: {
    maxSupply: 1000,
    mutableHat: true,
  },
});

// Create a default voting class
export const createDefaultVotingClass = (slicePct = 100) => ({
  id: uuidv4(),
  strategy: VOTING_STRATEGY.DIRECT,
  slicePct,
  quadratic: false,
  minBalance: 0,
  asset: null, // null = AddressZero
  hatIds: [],
  locked: false, // Prevents weight redistribution when locked
});

// Create a default bootstrap project. Hat arrays hold ROLE INDICES (resolved to
// hat IDs by the deployer). `cap` is a human token amount (→ wei at build time);
// `bounties` map to parallel bountyTokens[]/bountyCaps[] arrays for the contract.
export const createDefaultBootstrapProject = () => ({
  id: uuidv4(),
  title: '',
  description: '',   // → IPFS → metadataHash (bytes32)
  cap: '',           // human token amount, '' = 0 (uncapped)
  managers: [],      // literal address strings
  createHats: [],    // role indices
  claimHats: [],     // role indices
  reviewHats: [],    // role indices
  assignHats: [],    // role indices
  bounties: [],      // [{ token: address, cap: humanAmount }]
});

// Create a default bootstrap task. `projectIndex` indexes bootstrap.projects.
export const createDefaultBootstrapTask = (projectIndex = 0) => ({
  id: uuidv4(),
  projectIndex,
  title: '',
  description: '',          // → IPFS → metadataHash (bytes32)
  payout: '',               // human PT amount, '' = 0
  bountyToken: '',          // address or '' (none)
  bountyPayout: '',         // human amount, '' = 0
  requiresApplication: false,
});

// Initial state for the deployer
export const initialState = {
  // Current step in the wizard (starts at template selection)
  currentStep: STEPS.TEMPLATE,

  // UI State - Controls simple vs advanced mode
  ui: {
    mode: UI_MODES.SIMPLE,        // 'simple' | 'advanced'
    selectedTemplate: null,       // Template ID or null
    templateApplied: false,       // Has template been applied to state?
    showGuidance: true,           // Show guidance panel
    expandedSections: [],         // Which review sections are expanded
  },

  // Template Journey State - Discovery questions and variations
  templateJourney: {
    discoveryAnswers: {},         // { questionId: answerValue }
    selfAssessmentAnswers: {},    // { questionId: answerValue } (for custom template)
    matchedVariation: null,       // Key of the matched variation
    variationConfirmed: false,    // Has user confirmed the variation?
    currentQuestionIndex: 0,      // For step-by-step discovery
    showPhilosophy: false,        // Show philosophy explanation
    showGrowthPath: false,        // Show growth path visualization
    showPitfalls: false,          // Show relevant pitfalls
  },

  // Philosophy State (Simple Mode) - High-level governance choices
  philosophy: {
    slider: 50,                   // 0 = delegated, 50 = hybrid, 100 = democratic
    powerBundles: {
      admin: [1],                 // Role indices with admin bundle
      member: [0, 1],             // Role indices with member bundle
      creator: [0, 1],            // Role indices with creator bundle
    },
  },

  // Organization details
  organization: {
    name: '',
    description: '',
    logoURL: '',
    logoPreviewUrl: '',
    links: [],
    infoIPFSHash: '',
    autoUpgrade: true,
    username: '',
    template: 'default',
  },

  // Roles configuration
  roles: [
    {
      ...createDefaultRole(0, 'Member'),
      hierarchy: { adminRoleIndex: 1 }, // Points to Executive
    },
    {
      ...createDefaultRole(1, 'Executive'),
      id: uuidv4(),
      name: 'Executive',
      distribution: { mintToDeployer: true, additionalWearers: [], additionalWearerUsernames: [] },
      hierarchy: { adminRoleIndex: null }, // Top-level
    },
  ],

  // Permissions configuration
  // Arrays of role indices that have each permission
  permissions: {
    quickJoinRoles: [0],           // Member can quick join
    tokenMemberRoles: [0, 1],      // Both can hold tokens
    tokenApproverRoles: [1],       // Executive approves
    taskCreatorRoles: [0, 1],      // Both can create tasks
    educationCreatorRoles: [1],    // Executive creates education
    educationMemberRoles: [0, 1],  // Both can access education
    hybridProposalCreatorRoles: [0, 1], // Both can create proposals
    ddVotingRoles: [0, 1],         // Both can vote
    ddCreatorRoles: [0, 1],        // Both can create polls
  },

  // Voting configuration
  voting: {
    mode: 'DIRECT', // 'DIRECT' or 'HYBRID'
    hybridQuorum: 50,
    ddQuorum: 50,
    hybridVoterQuorum: 0,  // Minimum voter count for hybrid proposals (0 = no minimum)
    ddVoterQuorum: 0,      // Minimum voter count for DD proposals (0 = no minimum)
    quadraticEnabled: false,
    democracyWeight: 50,
    participationWeight: 50,
    // Voting classes - more advanced configuration
    classes: [
      createDefaultVotingClass(100),
    ],
  },

  // Feature toggles
  features: {
    educationHubEnabled: false,
    electionHubEnabled: false,
    zkEmailInvitesEnabled: false,
    hideTreasury: false,
  },

  // Paymaster configuration (optional - all zeros = skip)
  paymaster: {
    enabled: true,
    operatorRoleIndex: null,       // null = type(uint256).max (skip), or role index
    autoWhitelistContracts: true,  // Default true - most users want this
    fundingAmountEth: NETWORKS[DEFAULT_DEPLOY_NETWORK].defaultFunding,  // Native currency to deposit as msg.value
    maxFeePerGas: '',              // gwei string, '' = 0 = no cap
    maxPriorityFeePerGas: '',      // gwei string
    maxCallGas: '',                // gas units string
    maxVerificationGas: '',
    maxPreVerificationGas: '',
    budgetCapEth: NETWORKS[DEFAULT_DEPLOY_NETWORK].defaultBudgetCap,    // Native currency per epoch per hat
    budgetEpochValue: '1',         // 1 week epoch
    budgetEpochUnit: 'weeks',      // 'hours' | 'days' | 'weeks'
  },

  // Metadata admin: which role can update org name/logo/description without a vote
  // null = Governance Only (topHat fallback), or a role index
  metadataAdminRoleIndex: null,

  // Org-wide TaskManager ROLE_PERM grants: sparse map { [roleIndex]: uint8Mask }.
  // mask is an OR of TaskPermission bits (see src/util/permissions.js). Empty = none.
  // Resolved to hat IDs + applied via TaskManager.bootstrapGlobalPerms at deploy.
  taskManagerPerms: {},

  // DirectDemocracy execution-target whitelist (literal addresses). Empty = none.
  ddInitialTargets: [],

  // Bootstrap: initial projects + tasks created atomically at deploy. Empty = none.
  // Project hat arrays (createHats/claimHats/reviewHats/assignHats) hold ROLE INDICES
  // (resolved to hat IDs by the deployer); task.projectIndex indexes `projects`.
  bootstrap: {
    projects: [],
    tasks: [],
  },

  // Chain selection (defaults to Gnosis satellite chain)
  selectedChainId: DEFAULT_DEPLOY_CHAIN_ID,

  // Deployment state
  deployment: {
    status: 'idle', // 'idle' | 'preparing' | 'deploying' | 'success' | 'error'
    error: null,
    result: null,
  },

  // Validation errors by step
  errors: {},
};

// Action types
export const ACTION_TYPES = {
  // Navigation
  SET_STEP: 'SET_STEP',
  NEXT_STEP: 'NEXT_STEP',
  PREV_STEP: 'PREV_STEP',

  // UI Mode & Templates
  SET_UI_MODE: 'SET_UI_MODE',
  SELECT_TEMPLATE: 'SELECT_TEMPLATE',
  APPLY_TEMPLATE: 'APPLY_TEMPLATE',
  CLEAR_TEMPLATE: 'CLEAR_TEMPLATE',
  TOGGLE_GUIDANCE: 'TOGGLE_GUIDANCE',
  EXPAND_SECTION: 'EXPAND_SECTION',

  // Philosophy (Simple Mode)
  SET_PHILOSOPHY_SLIDER: 'SET_PHILOSOPHY_SLIDER',
  SET_POWER_BUNDLE: 'SET_POWER_BUNDLE',
  TOGGLE_POWER_BUNDLE: 'TOGGLE_POWER_BUNDLE',
  APPLY_PHILOSOPHY: 'APPLY_PHILOSOPHY',

  // Template Journey (Discovery Flow)
  SET_DISCOVERY_ANSWER: 'SET_DISCOVERY_ANSWER',
  SET_SELF_ASSESSMENT_ANSWER: 'SET_SELF_ASSESSMENT_ANSWER',
  SET_MATCHED_VARIATION: 'SET_MATCHED_VARIATION',
  CONFIRM_VARIATION: 'CONFIRM_VARIATION',
  SET_CURRENT_QUESTION_INDEX: 'SET_CURRENT_QUESTION_INDEX',
  NEXT_DISCOVERY_QUESTION: 'NEXT_DISCOVERY_QUESTION',
  PREV_DISCOVERY_QUESTION: 'PREV_DISCOVERY_QUESTION',
  TOGGLE_PHILOSOPHY_VIEW: 'TOGGLE_PHILOSOPHY_VIEW',
  TOGGLE_GROWTH_PATH_VIEW: 'TOGGLE_GROWTH_PATH_VIEW',
  TOGGLE_PITFALLS_VIEW: 'TOGGLE_PITFALLS_VIEW',
  RESET_TEMPLATE_JOURNEY: 'RESET_TEMPLATE_JOURNEY',
  APPLY_VARIATION: 'APPLY_VARIATION',

  // Organization
  UPDATE_ORGANIZATION: 'UPDATE_ORGANIZATION',
  SET_LOGO_URL: 'SET_LOGO_URL',
  SET_IPFS_HASH: 'SET_IPFS_HASH',
  ADD_LINK: 'ADD_LINK',
  REMOVE_LINK: 'REMOVE_LINK',
  UPDATE_LINK: 'UPDATE_LINK',

  // Roles
  ADD_ROLE: 'ADD_ROLE',
  UPDATE_ROLE: 'UPDATE_ROLE',
  REMOVE_ROLE: 'REMOVE_ROLE',
  REORDER_ROLES: 'REORDER_ROLES',
  UPDATE_ROLE_HIERARCHY: 'UPDATE_ROLE_HIERARCHY',
  UPDATE_ROLE_VOUCHING: 'UPDATE_ROLE_VOUCHING',
  UPDATE_ROLE_DISTRIBUTION: 'UPDATE_ROLE_DISTRIBUTION',
  UPDATE_ROLE_HAT_CONFIG: 'UPDATE_ROLE_HAT_CONFIG',

  // Permissions
  TOGGLE_PERMISSION: 'TOGGLE_PERMISSION',
  SET_PERMISSION_ROLES: 'SET_PERMISSION_ROLES',
  SET_ALL_PERMISSIONS_FOR_ROLE: 'SET_ALL_PERMISSIONS_FOR_ROLE',
  CLEAR_ALL_PERMISSIONS_FOR_ROLE: 'CLEAR_ALL_PERMISSIONS_FOR_ROLE',

  // Voting
  SET_VOTING_MODE: 'SET_VOTING_MODE',
  SET_VOTING_QUORUM: 'SET_VOTING_QUORUM',
  UPDATE_VOTING: 'UPDATE_VOTING',
  ADD_VOTING_CLASS: 'ADD_VOTING_CLASS',
  UPDATE_VOTING_CLASS: 'UPDATE_VOTING_CLASS',
  REMOVE_VOTING_CLASS: 'REMOVE_VOTING_CLASS',
  TOGGLE_CLASS_LOCK: 'TOGGLE_CLASS_LOCK',
  APPLY_WEIGHT_PRESET: 'APPLY_WEIGHT_PRESET',

  // Features
  TOGGLE_FEATURE: 'TOGGLE_FEATURE',

  // Metadata Admin
  SET_METADATA_ADMIN_ROLE: 'SET_METADATA_ADMIN_ROLE',

  // Org-wide TaskManager permissions
  SET_TASK_MANAGER_PERM: 'SET_TASK_MANAGER_PERM',

  // DirectDemocracy execution targets
  SET_DD_INITIAL_TARGETS: 'SET_DD_INITIAL_TARGETS',

  // Bootstrap projects & tasks
  ADD_BOOTSTRAP_PROJECT: 'ADD_BOOTSTRAP_PROJECT',
  UPDATE_BOOTSTRAP_PROJECT: 'UPDATE_BOOTSTRAP_PROJECT',
  REMOVE_BOOTSTRAP_PROJECT: 'REMOVE_BOOTSTRAP_PROJECT',
  ADD_BOOTSTRAP_TASK: 'ADD_BOOTSTRAP_TASK',
  UPDATE_BOOTSTRAP_TASK: 'UPDATE_BOOTSTRAP_TASK',
  REMOVE_BOOTSTRAP_TASK: 'REMOVE_BOOTSTRAP_TASK',

  // Paymaster
  TOGGLE_PAYMASTER: 'TOGGLE_PAYMASTER',
  UPDATE_PAYMASTER: 'UPDATE_PAYMASTER',

  // Chain
  SET_SELECTED_CHAIN_ID: 'SET_SELECTED_CHAIN_ID',

  // Validation
  SET_ERRORS: 'SET_ERRORS',
  CLEAR_ERRORS: 'CLEAR_ERRORS',

  // Deployment
  SET_DEPLOYMENT_STATUS: 'SET_DEPLOYMENT_STATUS',

  // Reset
  RESET_STATE: 'RESET_STATE',
};

/**
 * Helper: Update permissions when a role is removed
 * Adjusts indices to account for the removed role
 */
function adjustPermissionsAfterRoleRemoval(permissions, removedIndex) {
  const adjusted = {};

  for (const key of PERMISSION_KEYS) {
    adjusted[key] = permissions[key]
      .filter(idx => idx !== removedIndex) // Remove the deleted role
      .map(idx => idx > removedIndex ? idx - 1 : idx); // Adjust indices
  }

  return adjusted;
}

/**
 * Helper: Update role hierarchy references when a role is removed
 */
function adjustRolesAfterRoleRemoval(roles, removedIndex) {
  return roles.map(role => {
    const adminIdx = role.hierarchy.adminRoleIndex;

    // If this role pointed to the removed role, point to null (top-level)
    if (adminIdx === removedIndex) {
      return {
        ...role,
        hierarchy: { ...role.hierarchy, adminRoleIndex: null },
      };
    }

    // Adjust index if it was after the removed role
    if (adminIdx !== null && adminIdx > removedIndex) {
      return {
        ...role,
        hierarchy: { ...role.hierarchy, adminRoleIndex: adminIdx - 1 },
      };
    }

    // Also adjust voucherRoleIndex if needed
    const voucherIdx = role.vouching.voucherRoleIndex;
    if (voucherIdx === removedIndex) {
      return {
        ...role,
        vouching: { ...role.vouching, voucherRoleIndex: 0 },
      };
    }
    if (voucherIdx > removedIndex) {
      return {
        ...role,
        vouching: { ...role.vouching, voucherRoleIndex: voucherIdx - 1 },
      };
    }

    return role;
  });
}

/**
 * Helper: re-index a { [roleIndex]: value } map after the role at `removedIndex`
 * is deleted — drops the removed role's entry and decrements higher indices.
 * Mirrors adjustPermissionsAfterRoleRemoval for map-shaped state (taskManagerPerms).
 */
function adjustIndexedMapAfterRoleRemoval(map, removedIndex) {
  const adjusted = {};
  for (const [k, value] of Object.entries(map || {})) {
    const idx = Number(k);
    if (idx === removedIndex) continue;
    adjusted[idx > removedIndex ? idx - 1 : idx] = value;
  }
  return adjusted;
}

/**
 * Helper: re-index a bootstrap project's role-index hat arrays after a role is
 * removed — drops the removed role and decrements higher indices.
 */
function adjustBootstrapProjectsAfterRoleRemoval(projects, removedIndex) {
  const fix = (arr) => (arr || [])
    .filter((idx) => idx !== removedIndex)
    .map((idx) => (idx > removedIndex ? idx - 1 : idx));
  return (projects || []).map((p) => ({
    ...p,
    createHats: fix(p.createHats),
    claimHats: fix(p.claimHats),
    reviewHats: fix(p.reviewHats),
    assignHats: fix(p.assignHats),
  }));
}

/**
 * Helper: build an old→new index permutation for REORDER_ROLES by matching role
 * `id`s. Returns Map(oldIndex => newIndex). Roles absent from newRoles are omitted.
 */
function buildReorderPermutation(oldRoles, newRoles) {
  const newIndexById = new Map(newRoles.map((r, j) => [r.id, j]));
  const perm = new Map();
  oldRoles.forEach((r, i) => {
    if (newIndexById.has(r.id)) perm.set(i, newIndexById.get(r.id));
  });
  return perm;
}

/**
 * Helper: remap every role-index-keyed slice of state through `mapFn`
 * (oldIndex => newIndex, or null/undefined to drop). Used by REORDER_ROLES so a
 * reorder doesn't silently desync permissions, hierarchy, vouching, paymaster,
 * metadata-admin, power bundles, taskManagerPerms, or bootstrap project hats from
 * the new role order. (REORDER_ROLES previously remapped nothing.)
 */
function remapRoleIndexedState(state, newRoles, mapFn) {
  const keep = (i) => i !== null && i !== undefined;
  const remapSingle = (idx) => {
    if (idx === null || idx === undefined) return null;
    const n = mapFn(idx);
    return keep(n) ? n : null;
  };

  // Role-internal references (hierarchy parent + voucher) live on the reordered
  // role objects but still point at OLD indices — remap them in place.
  const roles = newRoles.map((role) => {
    const newAdmin = remapSingle(role.hierarchy?.adminRoleIndex);
    const newVoucher = remapSingle(role.vouching?.voucherRoleIndex);
    return {
      ...role,
      hierarchy: { ...role.hierarchy, adminRoleIndex: newAdmin },
      vouching: { ...role.vouching, voucherRoleIndex: keep(newVoucher) ? newVoucher : 0 },
    };
  });

  const permissions = {};
  for (const key of PERMISSION_KEYS) {
    permissions[key] = (state.permissions[key] || []).map(mapFn).filter(keep);
  }

  const powerBundles = {};
  for (const [k, arr] of Object.entries(state.philosophy.powerBundles || {})) {
    powerBundles[k] = (arr || []).map(mapFn).filter(keep);
  }

  const taskManagerPerms = {};
  for (const [k, mask] of Object.entries(state.taskManagerPerms || {})) {
    const n = mapFn(Number(k));
    if (keep(n)) taskManagerPerms[n] = mask;
  }

  const remapHats = (arr) => (arr || []).map(mapFn).filter(keep);
  const bootstrap = {
    ...state.bootstrap,
    projects: (state.bootstrap?.projects || []).map((p) => ({
      ...p,
      createHats: remapHats(p.createHats),
      claimHats: remapHats(p.claimHats),
      reviewHats: remapHats(p.reviewHats),
      assignHats: remapHats(p.assignHats),
    })),
  };

  return {
    roles,
    permissions,
    philosophy: { ...state.philosophy, powerBundles },
    metadataAdminRoleIndex: remapSingle(state.metadataAdminRoleIndex),
    paymaster: { ...state.paymaster, operatorRoleIndex: remapSingle(state.paymaster.operatorRoleIndex) },
    taskManagerPerms,
    bootstrap,
  };
}

/**
 * Main reducer function
 */
export function deployerReducer(state, action) {
  switch (action.type) {
    // Navigation
    case ACTION_TYPES.SET_STEP:
      return { ...state, currentStep: action.payload };

    case ACTION_TYPES.NEXT_STEP:
      return {
        ...state,
        currentStep: Math.min(state.currentStep + 1, STEPS.LAUNCH),
      };

    case ACTION_TYPES.PREV_STEP:
      return {
        ...state,
        currentStep: Math.max(state.currentStep - 1, STEPS.TEMPLATE),
      };

    // UI Mode & Templates
    case ACTION_TYPES.SET_UI_MODE:
      return {
        ...state,
        ui: { ...state.ui, mode: action.payload },
      };

    case ACTION_TYPES.SELECT_TEMPLATE:
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedTemplate: action.payload,
          templateApplied: false,
        },
      };

    case ACTION_TYPES.APPLY_TEMPLATE: {
      // Payload contains the template defaults from getTemplateDefaults()
      const { roles, permissions, voting, features, governancePhilosophy, metadataAdminRoleIndex } = action.payload;

      // Derive slider from the template's actual democracyWeight (source of truth),
      // falling back to governancePhilosophy string for legacy templates without democracyWeight.
      const sliderValue = voting?.democracyWeight !== undefined
        ? voting.democracyWeight
        : governancePhilosophy === 'democratic' ? 85
        : governancePhilosophy === 'delegated' ? 15
        : 50;

      return {
        ...state,
        roles,
        permissions,
        voting,
        features: { ...initialState.features, ...features },
        metadataAdminRoleIndex: metadataAdminRoleIndex ?? null,
        // Reset deploy-time config not (yet) carried by templates so a previously
        // applied template's grants/targets/bootstrap don't leak into the new one.
        taskManagerPerms: action.payload.taskManagerPerms ?? {},
        ddInitialTargets: action.payload.ddInitialTargets ?? [],
        bootstrap: action.payload.bootstrap ?? { projects: [], tasks: [] },
        philosophy: {
          ...state.philosophy,
          slider: sliderValue,
        },
        ui: {
          ...state.ui,
          templateApplied: true,
        },
      };
    }

    case ACTION_TYPES.CLEAR_TEMPLATE:
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedTemplate: null,
          templateApplied: false,
        },
      };

    case ACTION_TYPES.TOGGLE_GUIDANCE:
      return {
        ...state,
        ui: {
          ...state.ui,
          showGuidance: action.payload !== undefined ? action.payload : !state.ui.showGuidance,
        },
      };

    case ACTION_TYPES.EXPAND_SECTION: {
      const section = action.payload;
      const expanded = state.ui.expandedSections;
      const isExpanded = expanded.includes(section);

      return {
        ...state,
        ui: {
          ...state.ui,
          expandedSections: isExpanded
            ? expanded.filter(s => s !== section)
            : [...expanded, section],
        },
      };
    }

    // Philosophy (Simple Mode)
    case ACTION_TYPES.SET_PHILOSOPHY_SLIDER:
      return {
        ...state,
        philosophy: { ...state.philosophy, slider: action.payload },
      };

    case ACTION_TYPES.SET_POWER_BUNDLE: {
      const { bundleKey, roleIndices } = action.payload;
      return {
        ...state,
        philosophy: {
          ...state.philosophy,
          powerBundles: {
            ...state.philosophy.powerBundles,
            [bundleKey]: roleIndices,
          },
        },
      };
    }

    case ACTION_TYPES.TOGGLE_POWER_BUNDLE: {
      const { bundleKey, roleIndex } = action.payload;
      const currentRoles = state.philosophy.powerBundles[bundleKey] || [];
      const hasBundle = currentRoles.includes(roleIndex);

      return {
        ...state,
        philosophy: {
          ...state.philosophy,
          powerBundles: {
            ...state.philosophy.powerBundles,
            [bundleKey]: hasBundle
              ? currentRoles.filter(idx => idx !== roleIndex)
              : [...currentRoles, roleIndex],
          },
        },
      };
    }

    case ACTION_TYPES.APPLY_PHILOSOPHY: {
      // Apply philosophy slider and power bundles to actual permissions and voting
      // This is called when user advances from Governance step in Simple mode
      const { voting, permissions } = action.payload;
      return {
        ...state,
        voting: voting || state.voting,
        permissions: permissions || state.permissions,
      };
    }

    // Template Journey (Discovery Flow)
    case ACTION_TYPES.SET_DISCOVERY_ANSWER: {
      const { questionId, answer } = action.payload;
      return {
        ...state,
        templateJourney: {
          ...state.templateJourney,
          discoveryAnswers: {
            ...state.templateJourney.discoveryAnswers,
            [questionId]: answer,
          },
        },
      };
    }

    case ACTION_TYPES.SET_SELF_ASSESSMENT_ANSWER: {
      const { questionId, answer } = action.payload;
      return {
        ...state,
        templateJourney: {
          ...state.templateJourney,
          selfAssessmentAnswers: {
            ...state.templateJourney.selfAssessmentAnswers,
            [questionId]: answer,
          },
        },
      };
    }

    case ACTION_TYPES.SET_MATCHED_VARIATION:
      return {
        ...state,
        templateJourney: {
          ...state.templateJourney,
          matchedVariation: action.payload,
        },
      };

    case ACTION_TYPES.CONFIRM_VARIATION:
      return {
        ...state,
        templateJourney: {
          ...state.templateJourney,
          variationConfirmed: true,
        },
      };

    case ACTION_TYPES.SET_CURRENT_QUESTION_INDEX:
      return {
        ...state,
        templateJourney: {
          ...state.templateJourney,
          currentQuestionIndex: action.payload,
        },
      };

    case ACTION_TYPES.NEXT_DISCOVERY_QUESTION:
      return {
        ...state,
        templateJourney: {
          ...state.templateJourney,
          currentQuestionIndex: state.templateJourney.currentQuestionIndex + 1,
        },
      };

    case ACTION_TYPES.PREV_DISCOVERY_QUESTION:
      return {
        ...state,
        templateJourney: {
          ...state.templateJourney,
          currentQuestionIndex: Math.max(0, state.templateJourney.currentQuestionIndex - 1),
        },
      };

    case ACTION_TYPES.TOGGLE_PHILOSOPHY_VIEW:
      return {
        ...state,
        templateJourney: {
          ...state.templateJourney,
          showPhilosophy: action.payload !== undefined
            ? action.payload
            : !state.templateJourney.showPhilosophy,
        },
      };

    case ACTION_TYPES.TOGGLE_GROWTH_PATH_VIEW:
      return {
        ...state,
        templateJourney: {
          ...state.templateJourney,
          showGrowthPath: action.payload !== undefined
            ? action.payload
            : !state.templateJourney.showGrowthPath,
        },
      };

    case ACTION_TYPES.TOGGLE_PITFALLS_VIEW:
      return {
        ...state,
        templateJourney: {
          ...state.templateJourney,
          showPitfalls: action.payload !== undefined
            ? action.payload
            : !state.templateJourney.showPitfalls,
        },
      };

    case ACTION_TYPES.RESET_TEMPLATE_JOURNEY:
      return {
        ...state,
        templateJourney: {
          discoveryAnswers: {},
          selfAssessmentAnswers: {},
          matchedVariation: null,
          variationConfirmed: false,
          currentQuestionIndex: 0,
          showPhilosophy: false,
          showGrowthPath: false,
          showPitfalls: false,
        },
      };

    case ACTION_TYPES.APPLY_VARIATION: {
      // Apply a matched variation's settings to the state
      // Supports voting settings, features, and permissions overrides
      const { variation, template } = action.payload;
      if (!variation?.settings) {
        return state;
      }

      const {
        democracyWeight,
        participationWeight,
        quorum,
        features: featureOverrides,
        permissions: permissionOverrides,
      } = variation.settings;

      // Update philosophy slider based on democracy weight
      const sliderValue = democracyWeight !== undefined ? democracyWeight : state.philosophy.slider;

      // Rebuild voting.classes from the new slider value so they stay in sync.
      // Without this, the slider shows 70 but classes stay at the template's 50/50.
      const newVotingConfig = getSliderToVotingConfig()(sliderValue);

      // Apply feature overrides if present
      const newFeatures = featureOverrides
        ? { ...state.features, ...featureOverrides }
        : state.features;

      // Apply permission overrides if present
      const newPermissions = permissionOverrides
        ? { ...state.permissions, ...permissionOverrides }
        : state.permissions;

      return {
        ...state,
        philosophy: {
          ...state.philosophy,
          slider: sliderValue,
        },
        voting: {
          ...newVotingConfig,
          hybridQuorum: quorum ?? newVotingConfig.hybridQuorum,
          ddQuorum: quorum ?? newVotingConfig.ddQuorum,
        },
        features: newFeatures,
        permissions: newPermissions,
        templateJourney: {
          ...state.templateJourney,
          variationConfirmed: true,
        },
      };
    }

    // Organization
    case ACTION_TYPES.UPDATE_ORGANIZATION:
      return {
        ...state,
        organization: { ...state.organization, ...action.payload },
      };

    case ACTION_TYPES.SET_LOGO_URL:
      return {
        ...state,
        organization: {
          ...state.organization,
          logoURL: action.payload.url ?? action.payload,
          logoPreviewUrl: action.payload.previewUrl ?? '',
        },
      };

    case ACTION_TYPES.SET_IPFS_HASH:
      return {
        ...state,
        organization: { ...state.organization, infoIPFSHash: action.payload },
      };

    case ACTION_TYPES.ADD_LINK:
      return {
        ...state,
        organization: {
          ...state.organization,
          links: [...state.organization.links, action.payload],
        },
      };

    case ACTION_TYPES.REMOVE_LINK:
      return {
        ...state,
        organization: {
          ...state.organization,
          links: state.organization.links.filter((_, idx) => idx !== action.payload),
        },
      };

    case ACTION_TYPES.UPDATE_LINK:
      return {
        ...state,
        organization: {
          ...state.organization,
          links: state.organization.links.map((link, idx) =>
            idx === action.payload.index ? action.payload.link : link
          ),
        },
      };

    // Roles
    case ACTION_TYPES.ADD_ROLE: {
      const newRole = createDefaultRole(state.roles.length, action.payload?.name || 'New Role');
      return {
        ...state,
        roles: [...state.roles, newRole],
      };
    }

    case ACTION_TYPES.UPDATE_ROLE: {
      const { index, updates } = action.payload;
      return {
        ...state,
        roles: state.roles.map((role, idx) =>
          idx === index ? { ...role, ...updates } : role
        ),
      };
    }

    case ACTION_TYPES.REMOVE_ROLE: {
      const removeIndex = action.payload;
      if (state.roles.length <= 1) {
        // Must have at least one role
        return state;
      }

      const newRoles = state.roles.filter((_, idx) => idx !== removeIndex);
      const adjustedRoles = adjustRolesAfterRoleRemoval(newRoles, removeIndex);
      const adjustedPermissions = adjustPermissionsAfterRoleRemoval(state.permissions, removeIndex);

      // Adjust paymaster operator role index
      let adjustedPaymasterOperatorRole = state.paymaster.operatorRoleIndex;
      if (adjustedPaymasterOperatorRole !== null) {
        if (adjustedPaymasterOperatorRole === removeIndex) {
          adjustedPaymasterOperatorRole = null;
        } else if (adjustedPaymasterOperatorRole > removeIndex) {
          adjustedPaymasterOperatorRole = adjustedPaymasterOperatorRole - 1;
        }
      }

      // Adjust metadata admin role index
      let adjustedMetadataAdminRole = state.metadataAdminRoleIndex;
      if (adjustedMetadataAdminRole !== null) {
        if (adjustedMetadataAdminRole === removeIndex) {
          adjustedMetadataAdminRole = null;
        } else if (adjustedMetadataAdminRole > removeIndex) {
          adjustedMetadataAdminRole = adjustedMetadataAdminRole - 1;
        }
      }

      // Adjust org-wide TaskManager permission grants + bootstrap project hats
      // (both keyed by role index) so they don't silently shift to the wrong role.
      const adjustedTaskManagerPerms = adjustIndexedMapAfterRoleRemoval(
        state.taskManagerPerms,
        removeIndex,
      );
      const adjustedBootstrapProjects = adjustBootstrapProjectsAfterRoleRemoval(
        state.bootstrap?.projects,
        removeIndex,
      );

      return {
        ...state,
        roles: adjustedRoles,
        permissions: adjustedPermissions,
        metadataAdminRoleIndex: adjustedMetadataAdminRole,
        taskManagerPerms: adjustedTaskManagerPerms,
        bootstrap: {
          ...state.bootstrap,
          projects: adjustedBootstrapProjects,
        },
        paymaster: {
          ...state.paymaster,
          operatorRoleIndex: adjustedPaymasterOperatorRole,
        },
      };
    }

    case ACTION_TYPES.REORDER_ROLES: {
      const newRoles = action.payload;
      // Remap every role-index-keyed slice of state to the new order. Match by
      // role `id` to build the old→new permutation. If ids are missing or the set
      // changed (shouldn't for a pure reorder), fall back to the raw swap rather
      // than risk corrupting indices.
      const sameSet = Array.isArray(newRoles)
        && newRoles.length === state.roles.length
        && newRoles.every((r) => r && r.id);
      if (!sameSet) {
        return { ...state, roles: newRoles };
      }
      const perm = buildReorderPermutation(state.roles, newRoles);
      const mapFn = (idx) => {
        const n = Number(idx);
        return perm.has(n) ? perm.get(n) : null;
      };
      return { ...state, ...remapRoleIndexedState(state, newRoles, mapFn) };
    }

    case ACTION_TYPES.UPDATE_ROLE_HIERARCHY: {
      const { roleIndex, adminRoleIndex } = action.payload;
      return {
        ...state,
        roles: state.roles.map((role, idx) =>
          idx === roleIndex
            ? { ...role, hierarchy: { ...role.hierarchy, adminRoleIndex } }
            : role
        ),
      };
    }

    case ACTION_TYPES.UPDATE_ROLE_VOUCHING: {
      const { roleIndex, vouching } = action.payload;
      return {
        ...state,
        roles: state.roles.map((role, idx) =>
          idx === roleIndex
            ? { ...role, vouching: { ...role.vouching, ...vouching } }
            : role
        ),
      };
    }

    case ACTION_TYPES.UPDATE_ROLE_DISTRIBUTION: {
      const { roleIndex, distribution } = action.payload;
      return {
        ...state,
        roles: state.roles.map((role, idx) =>
          idx === roleIndex
            ? { ...role, distribution: { ...role.distribution, ...distribution } }
            : role
        ),
      };
    }

    case ACTION_TYPES.UPDATE_ROLE_HAT_CONFIG: {
      const { roleIndex, hatConfig } = action.payload;
      return {
        ...state,
        roles: state.roles.map((role, idx) =>
          idx === roleIndex
            ? { ...role, hatConfig: { ...role.hatConfig, ...hatConfig } }
            : role
        ),
      };
    }

    // Permissions
    case ACTION_TYPES.TOGGLE_PERMISSION: {
      const { permissionKey, roleIndex } = action.payload;
      const currentRoles = state.permissions[permissionKey] || [];
      const hasPermission = currentRoles.includes(roleIndex);

      return {
        ...state,
        permissions: {
          ...state.permissions,
          [permissionKey]: hasPermission
            ? currentRoles.filter(idx => idx !== roleIndex)
            : [...currentRoles, roleIndex],
        },
      };
    }

    case ACTION_TYPES.SET_PERMISSION_ROLES: {
      const { permissionKey, roleIndices } = action.payload;

      return {
        ...state,
        permissions: {
          ...state.permissions,
          [permissionKey]: [...roleIndices],
        },
      };
    }

    case ACTION_TYPES.SET_ALL_PERMISSIONS_FOR_ROLE: {
      const roleIndex = action.payload;
      const newPermissions = { ...state.permissions };

      for (const key of PERMISSION_KEYS) {
        if (!newPermissions[key].includes(roleIndex)) {
          newPermissions[key] = [...newPermissions[key], roleIndex];
        }
      }

      return { ...state, permissions: newPermissions };
    }

    case ACTION_TYPES.CLEAR_ALL_PERMISSIONS_FOR_ROLE: {
      const roleIndex = action.payload;
      const newPermissions = { ...state.permissions };

      for (const key of PERMISSION_KEYS) {
        newPermissions[key] = newPermissions[key].filter(idx => idx !== roleIndex);
      }

      return { ...state, permissions: newPermissions };
    }

    // Voting
    case ACTION_TYPES.SET_VOTING_MODE: {
      const mode = action.payload;

      // When switching modes, adjust voting classes
      if (mode === 'DIRECT') {
        return {
          ...state,
          voting: {
            ...state.voting,
            mode,
            classes: [createDefaultVotingClass(100)],
          },
        };
      } else {
        // HYBRID mode - create two classes
        return {
          ...state,
          voting: {
            ...state.voting,
            mode,
            classes: [
              { ...createDefaultVotingClass(state.voting.democracyWeight), strategy: VOTING_STRATEGY.DIRECT },
              { ...createDefaultVotingClass(state.voting.participationWeight), strategy: VOTING_STRATEGY.ERC20_BAL },
            ],
          },
        };
      }
    }

    case ACTION_TYPES.SET_VOTING_QUORUM: {
      const { hybridQuorum, ddQuorum } = action.payload;
      return {
        ...state,
        voting: {
          ...state.voting,
          hybridQuorum: hybridQuorum ?? state.voting.hybridQuorum,
          ddQuorum: ddQuorum ?? state.voting.ddQuorum,
        },
      };
    }

    case ACTION_TYPES.UPDATE_VOTING:
      return {
        ...state,
        voting: { ...state.voting, ...action.payload },
      };

    case ACTION_TYPES.ADD_VOTING_CLASS: {
      if (state.voting.classes.length >= 8) {
        return state; // Max 8 classes
      }
      // Use provided classData or create a default voting class
      const newClass = action.payload || createDefaultVotingClass(0);
      return {
        ...state,
        voting: {
          ...state.voting,
          classes: [...state.voting.classes, newClass],
        },
      };
    }

    case ACTION_TYPES.UPDATE_VOTING_CLASS: {
      const { index, updates } = action.payload;

      // Auto-disable quadratic when switching to DIRECT strategy
      // (quadratic only applies to ERC20_BAL token-based voting)
      let finalUpdates = { ...updates };
      if (updates.strategy === VOTING_STRATEGY.DIRECT) {
        finalUpdates.quadratic = false;
      }

      return {
        ...state,
        voting: {
          ...state.voting,
          classes: state.voting.classes.map((cls, idx) =>
            idx === index ? { ...cls, ...finalUpdates } : cls
          ),
        },
      };
    }

    case ACTION_TYPES.REMOVE_VOTING_CLASS: {
      if (state.voting.classes.length <= 1) {
        return state; // Must have at least one class
      }
      return {
        ...state,
        voting: {
          ...state.voting,
          classes: state.voting.classes.filter((_, idx) => idx !== action.payload),
        },
      };
    }

    case ACTION_TYPES.TOGGLE_CLASS_LOCK: {
      const index = action.payload;
      return {
        ...state,
        voting: {
          ...state.voting,
          classes: state.voting.classes.map((cls, idx) =>
            idx === index ? { ...cls, locked: !cls.locked } : cls
          ),
        },
      };
    }

    case ACTION_TYPES.APPLY_WEIGHT_PRESET: {
      const preset = action.payload; // 'equal' or 'dominant'
      const count = state.voting.classes.length;

      let weights;
      if (preset === 'equal') {
        // Divide 100% evenly, distribute remainder to first classes
        const base = Math.floor(100 / count);
        const remainder = 100 - (base * count);
        weights = Array(count).fill(base).map((w, i) => i < remainder ? w + 1 : w);
      } else if (preset === 'dominant') {
        // First class gets 60%, rest split the 40% equally
        if (count === 1) {
          weights = [100];
        } else {
          const first = 60;
          const rest = Math.floor(40 / (count - 1));
          weights = [first, ...Array(count - 1).fill(rest)];
          // Adjust for rounding
          const sum = weights.reduce((a, b) => a + b, 0);
          if (sum < 100) weights[weights.length - 1] += (100 - sum);
        }
      } else {
        return state; // Unknown preset
      }

      return {
        ...state,
        voting: {
          ...state.voting,
          classes: state.voting.classes.map((cls, idx) => ({
            ...cls,
            slicePct: weights[idx],
            locked: false, // Unlock all classes when applying preset
          })),
        },
      };
    }

    // Features
    case ACTION_TYPES.TOGGLE_FEATURE: {
      const { feature, value } = action.payload;
      return {
        ...state,
        features: {
          ...state.features,
          [feature]: value !== undefined ? value : !state.features[feature],
        },
      };
    }

    // Metadata Admin
    case ACTION_TYPES.SET_METADATA_ADMIN_ROLE:
      return {
        ...state,
        metadataAdminRoleIndex: action.payload, // null = Governance Only, or role index
      };

    // Org-wide TaskManager permissions: set the full uint8 mask for a role.
    // mask 0 removes the entry (keeps the map sparse — see buildTaskManagerPerms).
    case ACTION_TYPES.SET_TASK_MANAGER_PERM: {
      const { roleIndex, mask } = action.payload;
      const next = { ...state.taskManagerPerms };
      const m = Number(mask) & 0xff;
      if (!m) {
        delete next[roleIndex];
      } else {
        next[roleIndex] = m;
      }
      return { ...state, taskManagerPerms: next };
    }

    // DirectDemocracy execution-target whitelist (replace the whole list).
    case ACTION_TYPES.SET_DD_INITIAL_TARGETS:
      return {
        ...state,
        ddInitialTargets: Array.isArray(action.payload) ? [...action.payload] : [],
      };

    // Bootstrap projects
    case ACTION_TYPES.ADD_BOOTSTRAP_PROJECT:
      return {
        ...state,
        bootstrap: {
          ...state.bootstrap,
          projects: [...state.bootstrap.projects, createDefaultBootstrapProject()],
        },
      };

    case ACTION_TYPES.UPDATE_BOOTSTRAP_PROJECT: {
      const { index, updates } = action.payload;
      return {
        ...state,
        bootstrap: {
          ...state.bootstrap,
          projects: state.bootstrap.projects.map((p, idx) =>
            idx === index ? { ...p, ...updates } : p
          ),
        },
      };
    }

    case ACTION_TYPES.REMOVE_BOOTSTRAP_PROJECT: {
      const removeIndex = action.payload;
      const projects = state.bootstrap.projects.filter((_, idx) => idx !== removeIndex);
      // Re-index tasks: drop tasks on the removed project, decrement higher refs.
      const tasks = state.bootstrap.tasks
        .filter((t) => t.projectIndex !== removeIndex)
        .map((t) => (t.projectIndex > removeIndex ? { ...t, projectIndex: t.projectIndex - 1 } : t));
      return { ...state, bootstrap: { ...state.bootstrap, projects, tasks } };
    }

    // Bootstrap tasks
    case ACTION_TYPES.ADD_BOOTSTRAP_TASK:
      return {
        ...state,
        bootstrap: {
          ...state.bootstrap,
          tasks: [...state.bootstrap.tasks, createDefaultBootstrapTask(action.payload?.projectIndex ?? 0)],
        },
      };

    case ACTION_TYPES.UPDATE_BOOTSTRAP_TASK: {
      const { index, updates } = action.payload;
      return {
        ...state,
        bootstrap: {
          ...state.bootstrap,
          tasks: state.bootstrap.tasks.map((t, idx) =>
            idx === index ? { ...t, ...updates } : t
          ),
        },
      };
    }

    case ACTION_TYPES.REMOVE_BOOTSTRAP_TASK:
      return {
        ...state,
        bootstrap: {
          ...state.bootstrap,
          tasks: state.bootstrap.tasks.filter((_, idx) => idx !== action.payload),
        },
      };

    // Paymaster
    case ACTION_TYPES.TOGGLE_PAYMASTER:
      return {
        ...state,
        paymaster: {
          ...state.paymaster,
          enabled: action.payload !== undefined ? action.payload : !state.paymaster.enabled,
        },
      };

    case ACTION_TYPES.UPDATE_PAYMASTER:
      return {
        ...state,
        paymaster: { ...state.paymaster, ...action.payload },
      };

    // Chain
    case ACTION_TYPES.SET_SELECTED_CHAIN_ID: {
      const newChainId = action.payload;
      const networkConfig = getNetworkByChainId(newChainId);
      const newFunding = networkConfig?.defaultFunding || '0.05';
      const newBudgetCap = networkConfig?.defaultBudgetCap || '0.05';
      return {
        ...state,
        selectedChainId: newChainId,
        paymaster: {
          ...state.paymaster,
          fundingAmountEth: newFunding,
          budgetCapEth: newBudgetCap,
        },
      };
    }

    // Validation
    case ACTION_TYPES.SET_ERRORS:
      return { ...state, errors: action.payload };

    case ACTION_TYPES.CLEAR_ERRORS:
      return { ...state, errors: {} };

    // Deployment
    case ACTION_TYPES.SET_DEPLOYMENT_STATUS:
      return {
        ...state,
        deployment: { ...state.deployment, ...action.payload },
      };

    // Reset
    case ACTION_TYPES.RESET_STATE:
      return { ...initialState };

    default:
      console.warn(`Unknown action type: ${action.type}`);
      return state;
  }
}

export default deployerReducer;
