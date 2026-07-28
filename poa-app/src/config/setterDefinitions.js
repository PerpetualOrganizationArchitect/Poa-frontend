/**
 * Setter Function Definitions for Governance Votes
 *
 * This file defines all available setter functions that can be called
 * through governance votes. Includes user-friendly templates and raw
 * function definitions for advanced mode.
 */

import { utils } from 'ethers';

// ============================================================================
// CATEGORIES - For UI grouping
// ============================================================================

export const SETTER_CATEGORIES = {
  voting: {
    name: 'Voting Rules',
    icon: 'FiCheckSquare',
    color: 'purple',
    description: 'Threshold, voting power, who can create proposals'
  },
  permissions: {
    name: 'Role Permissions',
    icon: 'FiUsers',
    color: 'blue',
    description: 'Who can create proposals and manage tasks'
  },
  emergency: {
    name: 'Emergency Controls',
    icon: 'FiAlertTriangle',
    color: 'red',
    description: 'Pause or resume organization features'
  },
  tasks: {
    name: 'Task Management',
    icon: 'FiClipboard',
    color: 'green',
    description: 'Project permissions and bounty settings'
  },
  tokenSettings: {
    name: 'Share Settings',
    icon: 'FiTag',
    color: 'teal',
    description: 'Share name and symbol settings'
  }
};

// ============================================================================
// CONTRACT ADDRESS MAPPING
// ============================================================================

export const CONTRACT_MAP = {
  hybridVoting: {
    contextKey: 'votingContractAddress',
    displayName: 'Blended Voting',
    description: 'Main voting contract for proposals'
  },
  directDemocracyVoting: {
    contextKey: 'directDemocracyVotingContractAddress',
    displayName: 'Direct Democracy',
    description: 'One person, one vote system'
  },
  taskManager: {
    contextKey: 'taskManagerContractAddress',
    displayName: 'Task Manager',
    description: 'Project and task management'
  },
  participationToken: {
    contextKey: 'participationTokenAddress',
    displayName: 'Shares',
    description: 'Organization shares contract'
  }
};

// ============================================================================
// USER-FRIENDLY TEMPLATES
// ============================================================================

export const SETTER_TEMPLATES = [
  // ===== VOTING RULES =====
  {
    id: 'change-threshold-hybrid',
    category: 'voting',
    name: 'Change Blended Voting Threshold',
    description: 'Set the minimum support percentage required for blended votes to pass',
    contract: 'hybridVoting',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'threshold',
        label: 'Threshold Percentage',
        type: 'number',
        min: 1,
        max: 100,
        placeholder: 'e.g. 51',
        helpText: 'Percentage of support required to pass (1-100)'
      }
    ],
    encode: (values) => {
      const configKey = 0; // ConfigKey.THRESHOLD
      const encodedValue = utils.hexZeroPad(utils.hexlify(Number(values.threshold)), 32);
      return [configKey, encodedValue];
    },
    preview: (values) => `Change blended voting threshold to ${values.threshold}%`
  },
  {
    id: 'change-threshold-dd',
    category: 'voting',
    name: 'Change Direct Democracy Threshold',
    description: 'Set the minimum support percentage required for direct democracy votes to pass',
    contract: 'directDemocracyVoting',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'threshold',
        label: 'Threshold Percentage',
        type: 'number',
        min: 1,
        max: 100,
        placeholder: 'e.g. 51',
        helpText: 'Percentage of support required to pass (1-100)'
      }
    ],
    encode: (values) => {
      const configKey = 0; // ConfigKey.THRESHOLD
      const encodedValue = utils.hexZeroPad(utils.hexlify(Number(values.threshold)), 32);
      return [configKey, encodedValue];
    },
    preview: (values) => `Change direct democracy threshold to ${values.threshold}%`
  },
  {
    id: 'change-quorum-hybrid',
    category: 'voting',
    name: 'Change Blended Voting Quorum',
    description: 'Set the minimum number of voters required for blended votes to be valid',
    contract: 'hybridVoting',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'quorum',
        label: 'Minimum Voters',
        type: 'number',
        min: 0,
        max: 1000000,
        placeholder: 'e.g. 5',
        helpText: 'Minimum number of voters required (0 = no minimum)'
      }
    ],
    encode: (values) => {
      const configKey = 3; // ConfigKey.QUORUM
      const encodedValue = utils.hexZeroPad(utils.hexlify(Number(values.quorum)), 32);
      return [configKey, encodedValue];
    },
    preview: (values) => `Change blended voting quorum to ${values.quorum} voters`
  },
  {
    id: 'change-voting-split',
    category: 'voting',
    name: 'Change Voting Class Weights',
    description: 'Adjust the voting power split between democracy and share-based classes',
    contract: 'hybridVoting',
    functionName: 'setClasses',
    inputs: [
      {
        name: 'classWeights',
        label: 'Voting Class Weights',
        type: 'votingClassWeights',
        helpText: 'Adjust the percentage split between voting classes (must sum to 100%)'
      }
    ],
    requiresContext: 'votingClasses',
    encode: (values) => {
      const classConfigs = (values.classWeights || []).map(cls => {
        const strategyNum = (cls.strategy === 'DIRECT' || cls.strategy === 0) ? 0 : 1;
        return {
          strategy: strategyNum,
          slicePct: Number(cls.slicePct),
          quadratic: Boolean(cls.quadratic),
          minBalance: cls.minBalance?.toString() || '0',
          asset: cls.asset || '0x0000000000000000000000000000000000000000',
          hatIds: (cls.hatIds || []).map(h => h.toString()),
        };
      });
      return [classConfigs];
    },
    preview: (values) => {
      const classes = values.classWeights || [];
      const parts = classes.map(cls => {
        const label = (cls.strategy === 'DIRECT' || cls.strategy === 0) ? 'Democracy' : 'Participation';
        return `${label}: ${cls.slicePct}%`;
      });
      return `Change voting split to ${parts.join(', ')}`;
    }
  },
  {
    id: 'change-quorum-dd',
    category: 'voting',
    name: 'Change Direct Democracy Quorum',
    description: 'Set the minimum number of voters required for direct democracy votes to be valid',
    contract: 'directDemocracyVoting',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'quorum',
        label: 'Minimum Voters',
        type: 'number',
        min: 0,
        max: 1000000,
        placeholder: 'e.g. 5',
        helpText: 'Minimum number of voters required (0 = no minimum)'
      }
    ],
    encode: (values) => {
      const configKey = 4; // ConfigKey.QUORUM
      const encodedValue = utils.hexZeroPad(utils.hexlify(Number(values.quorum)), 32);
      return [configKey, encodedValue];
    },
    preview: (values) => `Change direct democracy quorum to ${values.quorum} voters`
  },

  // ===== PERMISSIONS =====
  {
    id: 'allow-proposal-creator-hybrid',
    category: 'permissions',
    name: 'Allow Role to Create Blended Proposals',
    description: 'Grant or revoke a role\'s permission to create new blended voting proposals',
    contract: 'hybridVoting',
    functionName: 'setCreatorHatAllowed',
    inputs: [
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Select which role to modify'
      },
      {
        name: 'allowed',
        label: 'Permission',
        type: 'toggle',
        options: ['Grant', 'Revoke'],
        default: 'Grant',
        helpText: 'Grant or revoke proposal creation permission'
      }
    ],
    encode: (values) => {
      return [values.role, values.allowed === 'Grant'];
    },
    preview: (values, roleNames) => {
      const roleName = roleNames?.[values.role] || `Role ${values.role}`;
      const action = values.allowed === 'Grant' ? 'Allow' : 'Revoke';
      return `${action} "${roleName}" to create blended voting proposals`;
    }
  },
  {
    id: 'allow-voter-dd',
    category: 'permissions',
    name: 'Allow Role to Vote (Direct Democracy)',
    description: 'Grant or revoke a role\'s permission to vote in direct democracy',
    contract: 'directDemocracyVoting',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Select which role to modify'
      },
      {
        name: 'hatType',
        label: 'Hat Type',
        type: 'select',
        options: [
          { value: '0', label: 'Voting Hat (can vote)' },
          { value: '1', label: 'Creator Hat (can create proposals)' }
        ],
        helpText: 'Type of permission to grant'
      },
      {
        name: 'allowed',
        label: 'Permission',
        type: 'toggle',
        options: ['Grant', 'Revoke'],
        default: 'Grant'
      }
    ],
    encode: (values) => {
      const configKey = 3; // ConfigKey.HAT_ALLOWED
      // Encode as (HatType enum, hatId, allowed)
      const encodedValue = utils.defaultAbiCoder.encode(
        ['uint8', 'uint256', 'bool'],
        [Number(values.hatType), values.role, values.allowed === 'Grant']
      );
      return [configKey, encodedValue];
    },
    preview: (values, roleNames) => {
      const roleName = roleNames?.[values.role] || `Role ${values.role}`;
      const action = values.allowed === 'Grant' ? 'Allow' : 'Revoke';
      const hatType = values.hatType === '0' ? 'vote' : 'create proposals';
      return `${action} "${roleName}" to ${hatType} in direct democracy`;
    }
  },

  // ===== EMERGENCY CONTROLS =====
  {
    id: 'pause-hybrid-voting',
    category: 'emergency',
    name: 'Pause Blended Voting',
    description: 'Temporarily disable all blended voting activity (emergency use only)',
    contract: 'hybridVoting',
    functionName: 'pause',
    inputs: [],
    dangerLevel: 'critical',
    warning: 'This will prevent ALL blended voting proposals and votes until unpaused',
    encode: () => [],
    preview: () => 'Pause blended voting - no proposals or votes will be allowed'
  },
  {
    id: 'unpause-hybrid-voting',
    category: 'emergency',
    name: 'Resume Blended Voting',
    description: 'Re-enable blended voting after an emergency pause',
    contract: 'hybridVoting',
    functionName: 'unpause',
    inputs: [],
    encode: () => [],
    preview: () => 'Resume blended voting - proposals and votes will be allowed again'
  },
  {
    id: 'pause-dd-voting',
    category: 'emergency',
    name: 'Pause Direct Democracy Voting',
    description: 'Temporarily disable all direct democracy voting activity',
    contract: 'directDemocracyVoting',
    functionName: 'pause',
    inputs: [],
    dangerLevel: 'critical',
    warning: 'This will prevent ALL direct democracy proposals and votes until unpaused',
    encode: () => [],
    preview: () => 'Pause direct democracy voting'
  },
  {
    id: 'unpause-dd-voting',
    category: 'emergency',
    name: 'Resume Direct Democracy Voting',
    description: 'Re-enable direct democracy voting after an emergency pause',
    contract: 'directDemocracyVoting',
    functionName: 'unpause',
    inputs: [],
    encode: () => [],
    preview: () => 'Resume direct democracy voting'
  },

  // ===== TASK MANAGEMENT =====
  {
    id: 'set-project-permissions',
    category: 'tasks',
    name: 'Set Project Role Permissions',
    description: 'Configure what a role can do within a specific project',
    contract: 'taskManager',
    functionName: 'setProjectRolePerm',
    inputs: [
      {
        name: 'project',
        label: 'Project',
        type: 'projectSelect',
        helpText: 'Select the project to modify'
      },
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Select which role to modify'
      },
      {
        name: 'permissions',
        label: 'Permissions',
        type: 'permissionMask',
        options: [
          { value: 1, label: 'CREATE - Create new tasks' },
          { value: 2, label: 'CLAIM - Claim tasks' },
          { value: 4, label: 'REVIEW - Review completed tasks' },
          { value: 8, label: 'ASSIGN - Assign tasks to others' },
          { value: 16, label: 'SELF_REVIEW - Allow claimer to complete their own task' },
          { value: 32, label: 'BUDGET - Edit project budgets (PT cap & bounty caps)' },
          { value: 64, label: 'EDIT_META - Edit task title / metadata' },
          { value: 128, label: 'EDIT_FULL - Edit task payout, bounty & metadata' }
        ],
        helpText: 'Select which permissions to grant'
      }
    ],
    encode: (values) => {
      // Calculate bitmask from selected permissions
      const mask = Array.isArray(values.permissions)
        ? values.permissions.reduce((acc, val) => acc | Number(val), 0)
        : Number(values.permissions) || 0;
      return [values.project, values.role, mask];
    },
    preview: (values, roleNames, projectNames) => {
      const roleName = roleNames?.[values.role] || `Role ${values.role}`;
      const projectName = projectNames?.[values.project] || 'selected project';
      const permLabels = [];
      const has = (v) => values.permissions?.includes(v) || values.permissions?.includes(String(v));
      if (has(1)) permLabels.push('CREATE');
      if (has(2)) permLabels.push('CLAIM');
      if (has(4)) permLabels.push('REVIEW');
      if (has(8)) permLabels.push('ASSIGN');
      if (has(16)) permLabels.push('SELF_REVIEW');
      if (has(32)) permLabels.push('BUDGET');
      if (has(64)) permLabels.push('EDIT_META');
      if (has(128)) permLabels.push('EDIT_FULL');
      return `Set "${roleName}" permissions for ${projectName}: ${permLabels.join(', ') || 'none'}`;
    }
  },
  {
    id: 'allow-task-creator',
    category: 'tasks',
    name: 'Allow Role to Create Tasks',
    description: 'Grant or revoke a role\'s permission to create tasks globally',
    contract: 'taskManager',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Select which role to modify'
      },
      {
        name: 'allowed',
        label: 'Permission',
        type: 'toggle',
        options: ['Grant', 'Revoke'],
        default: 'Grant'
      }
    ],
    encode: (values) => {
      const configKey = 1; // ConfigKey.CREATOR_HAT_ALLOWED
      const encodedValue = utils.defaultAbiCoder.encode(
        ['uint256', 'bool'],
        [values.role, values.allowed === 'Grant']
      );
      return [configKey, encodedValue];
    },
    preview: (values, roleNames) => {
      const roleName = roleNames?.[values.role] || `Role ${values.role}`;
      const action = values.allowed === 'Grant' ? 'Allow' : 'Revoke';
      return `${action} "${roleName}" to create tasks globally`;
    }
  },
  {
    id: 'allow-organizer-hat',
    category: 'tasks',
    name: 'Allow Role to Organize Folders',
    description: 'Grant or revoke a role\'s permission to publish folder-tree updates via setFolders',
    contract: 'taskManager',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Select which role to authorize as a folder organizer'
      },
      {
        name: 'allowed',
        label: 'Permission',
        type: 'toggle',
        options: ['Grant', 'Revoke'],
        default: 'Grant'
      }
    ],
    encode: (values) => {
      const configKey = 7; // ConfigKey.ORGANIZER_HAT_ALLOWED
      const encodedValue = utils.defaultAbiCoder.encode(
        ['uint256', 'bool'],
        [values.role, values.allowed === 'Grant']
      );
      return [configKey, encodedValue];
    },
    preview: (values, roleNames) => {
      const roleName = roleNames?.[values.role] || `Role ${values.role}`;
      const action = values.allowed === 'Grant' ? 'Allow' : 'Revoke';
      return `${action} "${roleName}" to reorganize the folder tree`;
    }
  },

  // ===== TOKEN SETTINGS =====
  {
    id: 'change-token-metadata',
    category: 'tokenSettings',
    name: 'Change Token Name & Symbol',
    description: 'Update the share name, symbol, or both via governance vote',
    contract: 'participationToken',
    inputs: [
      {
        name: 'tokenName',
        label: 'New Token Name',
        type: 'string',
        placeholder: 'e.g. Reputation Points',
        helpText: 'Leave empty to keep the current name',
        optional: true,
      },
      {
        name: 'tokenSymbol',
        label: 'New Token Symbol',
        type: 'string',
        placeholder: 'e.g. REP',
        helpText: 'Leave empty to keep the current symbol',
        optional: true,
      }
    ],
    buildCalls: (values, contractAddress) => {
      const calls = [];
      if (values.tokenName && values.tokenName.trim()) {
        const iface = new utils.Interface(['function setName(string newName)']);
        calls.push({
          target: contractAddress,
          value: '0',
          data: iface.encodeFunctionData('setName', [values.tokenName.trim()]),
        });
      }
      if (values.tokenSymbol && values.tokenSymbol.trim()) {
        const iface = new utils.Interface(['function setSymbol(string newSymbol)']);
        calls.push({
          target: contractAddress,
          value: '0',
          data: iface.encodeFunctionData('setSymbol', [values.tokenSymbol.trim()]),
        });
      }
      return calls;
    },
    preview: (values) => {
      const parts = [];
      if (values.tokenName && values.tokenName.trim()) parts.push(`name to "${values.tokenName.trim()}"`);
      if (values.tokenSymbol && values.tokenSymbol.trim()) parts.push(`symbol to "${values.tokenSymbol.trim()}"`);
      if (parts.length === 0) return 'No changes specified';
      return `Change share ${parts.join(' and ')}`;
    }
  }
];

// ============================================================================
// RAW FUNCTION DEFINITIONS (for Advanced Mode)
// ============================================================================

export const RAW_FUNCTIONS = {
  hybridVoting: [
    {
      name: 'setCreatorHatAllowed',
      signature: 'function setCreatorHatAllowed(uint256 h, bool ok)',
      params: [
        { name: 'h', type: 'uint256', label: 'Hat ID' },
        { name: 'ok', type: 'bool', label: 'Allowed' }
      ],
      description: 'Allow/revoke a role from creating proposals'
    },
    {
      name: 'setConfig',
      signature: 'function setConfig(uint8 key, bytes calldata value)',
      params: [
        { name: 'key', type: 'uint8', label: 'Config Key (0=THRESHOLD, 1=TARGET_ALLOWED, 2=EXECUTOR, 3=QUORUM)' },
        { name: 'value', type: 'bytes', label: 'Encoded Value' }
      ],
      description: 'Set a configuration value'
    },
    {
      name: 'setClasses',
      // Use JSON ABI fragment for safe tuple[] encoding
      signature: {
        type: 'function',
        name: 'setClasses',
        inputs: [{
          name: 'newClasses',
          type: 'tuple[]',
          components: [
            { name: 'strategy', type: 'uint8' },
            { name: 'slicePct', type: 'uint8' },
            { name: 'quadratic', type: 'bool' },
            { name: 'minBalance', type: 'uint256' },
            { name: 'asset', type: 'address' },
            { name: 'hatIds', type: 'uint256[]' }
          ]
        }],
        outputs: [],
        stateMutability: 'nonpayable'
      },
      params: [
        { name: 'newClasses', type: 'tuple[]', label: 'Class Configuration Array' }
      ],
      description: 'Replace all voting class configurations (slices must sum to 100%)'
    },
    {
      name: 'pause',
      signature: 'function pause()',
      params: [],
      description: 'Pause the voting contract'
    },
    {
      name: 'unpause',
      signature: 'function unpause()',
      params: [],
      description: 'Unpause the voting contract'
    }
  ],
  directDemocracyVoting: [
    {
      name: 'setConfig',
      signature: 'function setConfig(uint8 key, bytes calldata value)',
      params: [
        { name: 'key', type: 'uint8', label: 'Config Key (0=THRESHOLD, 1=EXECUTOR, 2=TARGET_ALLOWED, 3=HAT_ALLOWED, 4=QUORUM)' },
        { name: 'value', type: 'bytes', label: 'Encoded Value' }
      ],
      description: 'Set a configuration value'
    },
    {
      name: 'pause',
      signature: 'function pause()',
      params: [],
      description: 'Pause the voting contract'
    },
    {
      name: 'unpause',
      signature: 'function unpause()',
      params: [],
      description: 'Unpause the voting contract'
    }
  ],
  taskManager: [
    {
      name: 'setConfig',
      signature: 'function setConfig(uint8 key, bytes calldata value)',
      params: [
        { name: 'key', type: 'uint8', label: 'Config Key' },
        { name: 'value', type: 'bytes', label: 'Encoded Value' }
      ],
      description: 'Set a configuration value'
    },
    {
      name: 'setProjectRolePerm',
      signature: 'function setProjectRolePerm(bytes32 pid, uint256 hatId, uint8 mask)',
      params: [
        { name: 'pid', type: 'bytes32', label: 'Project ID' },
        { name: 'hatId', type: 'uint256', label: 'Hat ID' },
        { name: 'mask', type: 'uint8', label: 'Permission Mask (1=CREATE, 2=CLAIM, 4=REVIEW, 8=ASSIGN)' }
      ],
      description: 'Set role permissions for a project'
    }
  ],
  participationToken: [
    {
      name: 'setName',
      signature: 'function setName(string newName)',
      params: [
        { name: 'newName', type: 'string', label: 'New Token Name' }
      ],
      description: 'Change the share name'
    },
    {
      name: 'setSymbol',
      signature: 'function setSymbol(string newSymbol)',
      params: [
        { name: 'newSymbol', type: 'string', label: 'New Token Symbol' }
      ],
      description: 'Change the share symbol'
    }
  ]
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get templates filtered by category
 */
export function getTemplatesByCategory(category) {
  return SETTER_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get a template by ID
 */
export function getTemplateById(id) {
  return SETTER_TEMPLATES.find(t => t.id === id);
}

/**
 * Get raw functions for a contract
 */
export function getRawFunctions(contractKey) {
  return RAW_FUNCTIONS[contractKey] || [];
}

/**
 * Check if a contract is available (has an address in POContext)
 */
export function isContractAvailable(contractKey, contractAddresses) {
  const contextKey = CONTRACT_MAP[contractKey]?.contextKey;
  return contextKey && contractAddresses?.[contextKey];
}
