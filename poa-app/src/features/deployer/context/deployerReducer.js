/**
 * Deployer Reducer - Manages the complete state for the DAO deployment wizard
 *
 * This reducer handles all state transitions for the 5-step deployment process:
 * 1. Organization Details
 * 2. Roles & Hierarchy
 * 3. Permissions
 * 4. Voting Configuration
 * 5. Review & Deploy
 */

import { v4 as uuidv4 } from 'uuid';

// Step constants
export const STEPS = {
  ORGANIZATION: 0,
  ROLES: 1,
  PERMISSIONS: 2,
  VOTING: 3,
  REVIEW: 4,
};

export const STEP_NAMES = [
  'Organization Details',
  'Roles & Hierarchy',
  'Permissions',
  'Voting Configuration',
  'Review & Deploy',
];

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
    description: 'Roles that can hold and receive participation tokens',
  },
  tokenApproverRoles: {
    label: 'Token Approver',
    description: 'Roles that can approve token transfer requests',
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
    mintToDeployer: index === 0, // First role minted to deployer
    mintToExecutor: false,
    additionalWearers: [],
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
});

// Initial state for the deployer
export const initialState = {
  // Current step in the wizard
  currentStep: STEPS.ORGANIZATION,

  // Organization details (Step 1)
  organization: {
    name: '',
    description: '',
    logoURL: '',
    links: [],
    infoIPFSHash: '',
    autoUpgrade: true,
    username: '',
    template: 'default',
  },

  // Roles configuration (Step 2)
  roles: [
    {
      ...createDefaultRole(0, 'Member'),
      hierarchy: { adminRoleIndex: 1 }, // Points to Executive
    },
    {
      ...createDefaultRole(1, 'Executive'),
      id: uuidv4(),
      name: 'Executive',
      distribution: { mintToDeployer: true, mintToExecutor: false, additionalWearers: [] },
      hierarchy: { adminRoleIndex: null }, // Top-level
    },
  ],

  // Permissions configuration (Step 3)
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

  // Voting configuration (Step 4)
  voting: {
    mode: 'DIRECT', // 'DIRECT' or 'HYBRID'
    hybridQuorum: 50,
    ddQuorum: 50,
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
  },

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
  SET_PERMISSION: 'SET_PERMISSION',
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

  // Features
  TOGGLE_FEATURE: 'TOGGLE_FEATURE',

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
        currentStep: Math.min(state.currentStep + 1, STEPS.REVIEW),
      };

    case ACTION_TYPES.PREV_STEP:
      return {
        ...state,
        currentStep: Math.max(state.currentStep - 1, STEPS.ORGANIZATION),
      };

    // Organization
    case ACTION_TYPES.UPDATE_ORGANIZATION:
      return {
        ...state,
        organization: { ...state.organization, ...action.payload },
      };

    case ACTION_TYPES.SET_LOGO_URL:
      return {
        ...state,
        organization: { ...state.organization, logoURL: action.payload },
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

      return {
        ...state,
        roles: adjustedRoles,
        permissions: adjustedPermissions,
      };
    }

    case ACTION_TYPES.REORDER_ROLES:
      return {
        ...state,
        roles: action.payload,
      };

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

    case ACTION_TYPES.SET_PERMISSION: {
      const { permissionKey, roleIndex, value } = action.payload;
      const currentRoles = state.permissions[permissionKey] || [];

      return {
        ...state,
        permissions: {
          ...state.permissions,
          [permissionKey]: value
            ? [...new Set([...currentRoles, roleIndex])]
            : currentRoles.filter(idx => idx !== roleIndex),
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
      return {
        ...state,
        voting: {
          ...state.voting,
          classes: state.voting.classes.map((cls, idx) =>
            idx === index ? { ...cls, ...updates } : cls
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
