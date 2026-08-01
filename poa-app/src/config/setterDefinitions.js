/**
 * Setter Function Definitions for Governance Votes
 *
 * This file defines all available setter functions that can be called
 * through governance votes. Includes user-friendly templates and raw
 * function definitions for advanced mode.
 */

import { utils } from 'ethers';

// ============================================================================
// VALUE HELPERS
// ============================================================================

/**
 * True when `value` is a 0x-prefixed 32-byte hex string.
 *
 * Deliberately strict — the lowercase `0x` is literal, because that is exactly
 * what ethers accepts. Always call it on the output of normalizeBytes32, never
 * on raw input: the pair is what keeps validation and encoding in agreement.
 */
export function isBytes32(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value ?? '').trim());
}

/**
 * Repair the ways a pasted bytes32 arrives slightly wrong, so validation and
 * ethers agree on what counts as valid. Handles surrounding whitespace, a
 * missing prefix, and an uppercase `0X` prefix — block explorers and terminals
 * produce all three, and ethers rejects the last two outright.
 *
 * Hex digit case is preserved: it is meaningless to the encoder, and keeping it
 * lets someone eyeball the value against wherever they copied it from.
 * Input that is not recoverable comes back untouched, so the validation message
 * quotes what the user actually typed.
 */
export function normalizeBytes32(value) {
  const trimmed = String(value ?? '').trim();
  const body = /^0[xX]/.test(trimmed) ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(body)) return `0x${body}`;
  return trimmed;
}

/**
 * Shorten a hash for display while keeping both ends, so a reader can check it
 * against the source they copied it from. Short values are returned untouched.
 */
export function abbreviateHash(value) {
  const s = String(value ?? '').trim();
  if (s.length <= 8 + 6 + 1) return s || '(not set)';
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

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
  },
  zkEmailInvites: {
    contextKey: 'zkEmailInvitesAddress',
    displayName: 'Email Invites',
    description: 'ZK email allowlist module (claim roles by proving your email)'
  }
};

// ============================================================================
// USER-FRIENDLY TEMPLATES
// ============================================================================

/**
 * `name` is the picker label (title case, sorted next to its siblings).
 * `autoTitle` is the pre-filled *proposal title* a member votes on, so it is
 * written in the member-facing voice from `src/config/votingVocabulary.js`:
 * the weighted system is "Blended voting", never "Hybrid". Curated by hand
 * rather than derived from `preview({})`, which is empty or wrong for most
 * templates until their params are filled. See SETTER_TITLE_FALLBACK below.
 */
export const SETTER_TEMPLATES = [
  // ===== EMAIL INVITES =====
  {
    id: 'email-invites',
    category: 'permissions',
    name: 'Change who can join by email',
    // Immediate placeholder title. Once the invite field has read the saved list
    // it replaces this with the actual change ("2 added, 1 removed"), through the
    // same autoTitle provenance rule — so an edited title is never overwritten.
    autoTitle: 'Change who can join by email',
    description:
      'Approve the invite list saved in Settings, so the people on it can join by proving they own their email address.',
    contract: 'zkEmailInvites',
    functionName: 'setActiveAllowlist',
    inputs: [
      // The only visible field. It reads the saved list and shows the people it lets
      // in — nobody votes on a hash. It also fills `summary` for the proposal title.
      {
        name: 'cid',
        label: 'The list',
        type: 'emailInviteList',
        validateAs: 'bytes32',
        rootField: 'root',
        summaryField: 'summary',
        readableField: 'listReadable'
      },
      // Derived from the saved list, never typed. Kept in form state so it is encoded
      // and submitted with the vote.
      { name: 'root', type: 'hidden', validateAs: 'bytes32' },
      { name: 'summary', type: 'hidden', optional: true },
      { name: 'details', type: 'hidden', optional: true },
      { name: 'listReadable', type: 'hidden', optional: true }
    ],
    encode: (values) => [normalizeBytes32(values.root), normalizeBytes32(values.cid)],
    // A member should never be asked to approve something they could not read. The
    // field reports whether the list loaded; if it did not, block the proposal.
    validate: (values) => (
      values.listReadable
        ? null
        : 'The invite list hasn’t loaded yet, so there is nothing to show members.'
    ),
    // Filled in by the field once it has read the list, so the board shows the change
    // in words. The fingerprint fallback only appears if the list never loaded.
    preview: (values) => (
      values.summary || `Change who can join by email (list ${abbreviateHash(normalizeBytes32(values.cid))})`
    ),
    // The description a member reads, written from the real list once the field
    // has read it: who is joining, who is losing their invite, and that approving
    // replaces the whole list. Null until then, so the preview line stands in.
    // Applied through applyAutoCopy, so an edited description is never clobbered.
    describe: (values) => values.details || null
  },
  // ===== VOTING RULES =====
  {
    id: 'change-threshold-hybrid',
    category: 'voting',
    name: 'Change Blended Voting Threshold',
    autoTitle: 'Change support threshold (Blended voting)',
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
    autoTitle: 'Change support threshold (Direct democracy)',
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
    autoTitle: 'Change the minimum number of voters (Blended voting)',
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
    autoTitle: 'Change how voting power is split',
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
    autoTitle: 'Change the minimum number of voters (Direct democracy)',
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
    autoTitle: 'Change who can create Blended votes',
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
    autoTitle: 'Change who can take part in Direct democracy',
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
    autoTitle: 'Pause Blended voting',
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
    autoTitle: 'Resume Blended voting',
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
    autoTitle: 'Pause Direct democracy voting',
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
    autoTitle: 'Resume Direct democracy voting',
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
    autoTitle: 'Change what a role can do in a project',
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
    autoTitle: 'Change who can create tasks',
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
    autoTitle: 'Change who can organize task folders',
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
    autoTitle: 'Change the share name and symbol',
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
  ],
  zkEmailInvites: [
    {
      name: 'setActiveAllowlist',
      // TEMPLATE-ONLY. The signature lives here because buildProposalData encodes
      // from RAW_FUNCTIONS, but this must never be offered as a raw call: the
      // Developer-mode path takes free-text root/cid, skips the invite-list field
      // and template.validate entirely, and shows voters nothing but a generic raw
      // call — the exact "approve a hash you can't read" hole this feature closes.
      templateOnly: true,
      signature: 'function setActiveAllowlist(bytes32 root, bytes32 cid)',
      params: [
        { name: 'root', type: 'bytes32', label: 'Allowlist Merkle Root' },
        { name: 'cid', type: 'bytes32', label: 'Allowlist CID (bytes32)' }
      ],
      description: 'Make a staged email allowlist live'
    }
  ]
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a template by ID
 */
export function getTemplateById(id) {
  return SETTER_TEMPLATES.find(t => t.id === id);
}

/**
 * Proposal title for a setter template.
 *
 * Prefers the curated member-facing `autoTitle`; falls back to the picker
 * `name` so a template added later without one still gets a readable title.
 * Never derive the title from `preview({})` — it renders empty or wrong
 * (e.g. "Change blended voting threshold to %") before params are filled.
 */
export const SETTER_TITLE_FALLBACK = (template) => template.autoTitle || template.name;

/** A param counts as answered when it has content. `0` and `false` are answers. */
function hasParamValue(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

/**
 * Are a template's parameters answered well enough to describe or submit it?
 *
 * `preview()` is not defensive about partial values — it throws on some
 * templates and renders half-finished copy ("Change blended voting threshold
 * to %") on others — so every non-optional input must have a value. Templates
 * whose inputs are ALL optional still need one answer, or they preview as
 * "No changes specified".
 */
export function templateParamsReady(template, values) {
  if (!template) return false;
  const filled = values || {};
  const inputs = template.inputs || [];
  if (inputs.length === 0) return true;
  const requiredFilled = inputs.every(i => i.optional || hasParamValue(filled[i.name]));
  const anyFilled = inputs.some(i => hasParamValue(filled[i.name]));
  return requiredFilled && anyFilled;
}

/**
 * The member-facing title + description for a setter template.
 *
 * Single source of truth so every entry point agrees: the picker writes this
 * as you choose an action, and the `?propose=<template>` deep links write the
 * same strings into their restored payload. When those two disagree, the
 * ballot a member reviews is not the proposal that gets created.
 *
 * `description` is null until the params are ready; `title` never is.
 */
export function buildSetterCopy(template, values, roleNames, projectNames) {
  if (!template) return { title: null, description: null };
  const title = SETTER_TITLE_FALLBACK(template);
  if (!templateParamsReady(template, values)) return { title, description: null };
  // A template can write its own prose when it has more to say than one line —
  // the invite list names who is joining and who is losing their invite. It
  // returns null until it has something real, so the preview still covers the
  // common case.
  if (typeof template.describe === 'function') {
    try {
      const prose = template.describe(values || {}, roleNames, projectNames);
      if (typeof prose === 'string' && prose.trim()) return { title, description: prose };
    } catch { /* fall through to the preview line */ }
  }
  if (typeof template.preview !== 'function') return { title, description: null };
  let line;
  try {
    line = template.preview(values || {}, roleNames, projectNames);
  } catch {
    return { title, description: null };
  }
  if (typeof line !== 'string' || line.trim() === '') return { title, description: null };
  return { title, description: `If this vote passes: ${line}` };
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
  if (!contextKey) return false;
  const address = contractAddresses?.[contextKey];
  // The zero address means "module not deployed" — POContext derives
  // zkEmailInvitesEnabled the same way. Treating it as available would send a
  // governance proposal's call to address(0), which is the silent no-op again.
  return Boolean(address) && !/^0x0{40}$/i.test(address);
}
