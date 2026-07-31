/**
 * Zod Validation Schemas for the Deployer
 *
 * Provides runtime validation for all deployer state and form inputs.
 * Includes per-step and full deployment validation.
 */

import { z } from 'zod';
import { utf8Length } from '../utils/deploymentMapper';

// ============================================
// Basic Schemas
// ============================================

/**
 * Ethereum address schema
 */
export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

/**
 * IPFS hash schema (optional)
 */
export const ipfsHashSchema = z.string().optional();

/**
 * Link schema for organization links
 */
export const linkSchema = z.object({
  name: z.string().min(1, 'Link name is required').max(50, 'Link name too long'),
  url: z.string().url('Invalid URL'),
});

// ============================================
// Organization Schema (Step 1)
// ============================================

export const organizationSchema = z.object({
  name: z
    .string()
    .min(1, 'Organization name is required')
    .max(100, 'Organization name must be less than 100 characters')
    .refine(
      (val) => /^[a-zA-Z0-9\s\-_]+$/.test(val),
      'Organization name can only contain letters, numbers, spaces, hyphens, and underscores'
    ),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description must be less than 5000 characters'),
  logoURL: z.string().optional(),
  links: z.array(linkSchema).max(10, 'Maximum 10 links allowed'),
  infoIPFSHash: z.string().optional(),
  autoUpgrade: z.boolean(),
  username: z.string().max(32, 'Username must be less than 32 characters').optional(),
  // Participation-token identity (OrgDeployer v17). Empty = contract defaults.
  // Limits mirror ParticipationToken.setName/setSymbol so a deployed token stays
  // editable by governance. The contract bounds BYTES, not characters.
  tokenName: z
    .string()
    .refine((v) => utf8Length(v) <= 64, 'Token name must be 64 bytes or fewer')
    .optional(),
  tokenSymbol: z
    .string()
    .refine((v) => utf8Length(v) <= 16, 'Token ticker must be 16 bytes or fewer')
    .optional(),
});

// ============================================
// Role Schemas (Step 2)
// ============================================

/**
 * Vouching configuration schema
 */
export const vouchingSchema = z.object({
  enabled: z.boolean(),
  quorum: z.number().int().min(0).max(100),
  voucherRoleIndex: z.number().int().min(0),
  combineWithHierarchy: z.boolean(),
});

/**
 * Eligibility defaults schema
 */
export const eligibilityDefaultsSchema = z.object({
  eligible: z.boolean(),
  standing: z.boolean(),
});

/**
 * Hierarchy configuration schema
 */
export const hierarchySchema = z.object({
  adminRoleIndex: z.number().int().min(0).nullable(),
});

/**
 * Distribution configuration schema
 */
export const distributionSchema = z.object({
  mintToDeployer: z.boolean(),
  additionalWearers: z.array(addressSchema),
});

/**
 * Hat configuration schema
 */
export const hatConfigSchema = z.object({
  maxSupply: z.number().int().min(1).max(4294967295),
  mutableHat: z.boolean(),
});

/**
 * Single role schema
 */
export const roleSchema = z.object({
  id: z.string(),
  name: z
    .string()
    .min(1, 'Role name is required')
    .max(32, 'Role name must be less than 32 characters'),
  image: z.string().optional(),
  canVote: z.boolean(),
  vouching: vouchingSchema,
  defaults: eligibilityDefaultsSchema,
  hierarchy: hierarchySchema,
  distribution: distributionSchema,
  hatConfig: hatConfigSchema,
});

/**
 * Roles array schema with cross-validation
 */
export const rolesArraySchema = z
  .array(roleSchema)
  .min(1, 'At least one role is required')
  .max(32, 'Maximum 32 roles allowed')
  .superRefine((roles, ctx) => {
    // Check for unique names
    const names = roles.map((r) => r.name.toLowerCase());
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Role names must be unique',
      });
    }

    // Check for at least one top-level role
    const hasTopLevel = roles.some((r) => r.hierarchy.adminRoleIndex === null);
    if (!hasTopLevel && roles.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one role must be a top-level admin (no parent)',
      });
    }

    // Check for self-referential admin
    roles.forEach((role, idx) => {
      if (role.hierarchy.adminRoleIndex === idx) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Role "${role.name}" cannot be its own admin`,
          path: [idx, 'hierarchy', 'adminRoleIndex'],
        });
      }
    });

    // Check for invalid parent references
    roles.forEach((role, idx) => {
      const parentIdx = role.hierarchy.adminRoleIndex;
      if (parentIdx !== null && (parentIdx < 0 || parentIdx >= roles.length)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Role "${role.name}" has invalid parent reference`,
          path: [idx, 'hierarchy', 'adminRoleIndex'],
        });
      }
    });

    // Check vouching references
    roles.forEach((role, idx) => {
      if (role.vouching.enabled) {
        if (role.vouching.quorum <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Role "${role.name}" has vouching enabled but quorum must be positive`,
            path: [idx, 'vouching', 'quorum'],
          });
        }
        if (role.vouching.voucherRoleIndex >= roles.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Role "${role.name}" has invalid voucher role reference`,
            path: [idx, 'vouching', 'voucherRoleIndex'],
          });
        }
      }
    });

    // Check for cycles in hierarchy
    const detectCycle = () => {
      for (let startIdx = 0; startIdx < roles.length; startIdx++) {
        const visited = new Set();
        let currentIdx = startIdx;

        while (currentIdx !== null && currentIdx !== undefined) {
          if (visited.has(currentIdx)) {
            return { hasCycle: true, startRole: roles[startIdx]?.name };
          }
          visited.add(currentIdx);

          const role = roles[currentIdx];
          currentIdx = role?.hierarchy?.adminRoleIndex;

          if (currentIdx !== null && (currentIdx < 0 || currentIdx >= roles.length)) {
            break;
          }
        }
      }
      return { hasCycle: false };
    };

    const cycleResult = detectCycle();
    if (cycleResult.hasCycle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Circular hierarchy detected involving role "${cycleResult.startRole}"`,
      });
    }
  });

// ============================================
// Permissions Schema (Step 3)
// ============================================

/**
 * Single permission (array of role indices)
 */
export const permissionArraySchema = z.array(z.number().int().min(0));

/**
 * Full permissions object schema
 */
export const permissionsSchema = z.object({
  quickJoinRoles: permissionArraySchema,
  tokenMemberRoles: permissionArraySchema,
  tokenApproverRoles: permissionArraySchema,
  taskCreatorRoles: permissionArraySchema,
  educationCreatorRoles: permissionArraySchema,
  educationMemberRoles: permissionArraySchema,
  hybridProposalCreatorRoles: permissionArraySchema,
  ddVotingRoles: permissionArraySchema,
  ddCreatorRoles: permissionArraySchema,
});

// ============================================
// Voting Schema (Step 4)
// ============================================

/**
 * Single voting class schema
 */
export const votingClassSchema = z.object({
  id: z.string(),
  strategy: z.number().int().min(0).max(1), // 0 = DIRECT, 1 = ERC20_BAL
  slicePct: z.number().int().min(0).max(100),
  quadratic: z.boolean(),
  minBalance: z.number().min(0),
  asset: z.string().nullable(),
  hatIds: z.array(z.number().int()),
});

/**
 * Voting classes array with sum validation
 */
export const votingClassesArraySchema = z
  .array(votingClassSchema)
  .min(1, 'At least one voting class is required')
  .max(8, 'Maximum 8 voting classes allowed')
  .superRefine((classes, ctx) => {
    const total = classes.reduce((sum, cls) => sum + cls.slicePct, 0);
    if (total !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Voting class percentages must sum to 100% (currently ${total}%)`,
      });
    }
  });

/**
 * Full voting configuration schema
 */
export const votingSchema = z.object({
  mode: z.enum(['DIRECT', 'HYBRID']),
  hybridQuorum: z.number().int().min(1).max(100),
  ddQuorum: z.number().int().min(1).max(100),
  hybridVoterQuorum: z.number().int().min(0).max(4294967295), // uint32 voter count
  ddVoterQuorum: z.number().int().min(0).max(4294967295),     // uint32 voter count
  quadraticEnabled: z.boolean(),
  democracyWeight: z.number().int().min(0).max(100),
  participationWeight: z.number().int().min(0).max(100),
  classes: votingClassesArraySchema,
});

// ============================================
// Features Schema
// ============================================

export const featuresSchema = z.object({
  educationHubEnabled: z.boolean(),
  electionHubEnabled: z.boolean(),
});

// ============================================
// Paymaster Schema
// ============================================

/**
 * Non-negative numeric string (ETH/gwei amounts).
 * Empty string means disabled/zero.
 */
const numericStringSchema = z.string().refine(
  (val) => val === '' || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0),
  'Must be a non-negative number or empty'
);

export const paymasterSchema = z.object({
  enabled: z.boolean(),
  operatorRoleIndex: z.number().int().min(0).nullable(),
  autoWhitelistContracts: z.boolean(),
  fundingAmountEth: numericStringSchema,
  maxFeePerGas: numericStringSchema,
  maxPriorityFeePerGas: numericStringSchema,
  maxCallGas: numericStringSchema,
  maxVerificationGas: numericStringSchema,
  maxPreVerificationGas: numericStringSchema,
  budgetCapEth: numericStringSchema,
  budgetEpochValue: numericStringSchema,
  budgetEpochUnit: z.enum(['hours', 'days', 'weeks']),
});

// ============================================
// Full Deployer State Schema
// ============================================

export const deployerStateSchema = z.object({
  currentStep: z.number().int().min(0).max(5),
  organization: organizationSchema,
  roles: rolesArraySchema,
  permissions: permissionsSchema,
  voting: votingSchema,
  features: featuresSchema,
  paymaster: paymasterSchema,
  deployment: z.object({
    status: z.enum(['idle', 'preparing', 'deploying', 'success', 'error']),
    error: z.string().nullable(),
    result: z.any().nullable(),
  }),
  errors: z.record(z.any()),
});

// ============================================
// Step-Specific Validation Functions
// ============================================

/**
 * Validate organization step
 */
export function validateOrganizationStep(organization) {
  const result = organizationSchema.safeParse(organization);
  return {
    isValid: result.success,
    errors: result.success ? {} : formatZodErrors(result.error),
  };
}

/**
 * Validate roles step
 */
export function validateRolesStep(roles) {
  const result = rolesArraySchema.safeParse(roles);
  return {
    isValid: result.success,
    errors: result.success ? {} : formatZodErrors(result.error),
  };
}

/**
 * Validate permissions step
 */
export function validatePermissionsStep(permissions, roleCount) {
  const result = permissionsSchema.safeParse(permissions);

  if (!result.success) {
    return {
      isValid: false,
      errors: formatZodErrors(result.error),
    };
  }

  // Additional check: all role indices must be valid
  const errors = {};
  for (const [key, indices] of Object.entries(permissions)) {
    const invalidIndices = indices.filter((idx) => idx >= roleCount);
    if (invalidIndices.length > 0) {
      errors[key] = `Contains invalid role indices: ${invalidIndices.join(', ')}`;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate voting step
 */
export function validateVotingStep(voting) {
  const result = votingSchema.safeParse(voting);
  return {
    isValid: result.success,
    errors: result.success ? {} : formatZodErrors(result.error),
  };
}

/**
 * Validate paymaster configuration with cross-field validation
 */
export function validatePaymasterConfig(paymaster, roleCount) {
  const result = paymasterSchema.safeParse(paymaster);
  if (!result.success) {
    return { isValid: false, errors: formatZodErrors(result.error) };
  }

  const errors = {};

  if (paymaster.enabled) {
    // Operator role index must be in range
    if (paymaster.operatorRoleIndex !== null && paymaster.operatorRoleIndex >= roleCount) {
      errors.operatorRoleIndex = ['Operator role index is out of range'];
    }

    // Budget cap and epoch must both be set or both be zero
    const capEth = parseFloat(paymaster.budgetCapEth);
    const hasCapSet = !isNaN(capEth) && capEth > 0;
    const epochValue = parseFloat(paymaster.budgetEpochValue) || 0;
    const unitToSeconds = { hours: 3600, days: 86400, weeks: 604800 };
    const epochSeconds = Math.round(epochValue * (unitToSeconds[paymaster.budgetEpochUnit] || 86400));
    const hasEpochSet = epochSeconds > 0;

    if (hasCapSet !== hasEpochSet) {
      errors.budget = ['Budget cap and epoch length must both be set or both be zero'];
    }
    if (hasEpochSet) {
      if (epochSeconds < 3600) errors.budgetEpochValue = ['Budget epoch must be at least 1 hour'];
      if (epochSeconds > 31536000) errors.budgetEpochValue = ['Budget epoch must be at most 365 days'];
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate entire deployment state
 */
export function validateDeployerState(state) {
  const result = deployerStateSchema.safeParse(state);
  return {
    isValid: result.success,
    errors: result.success ? {} : formatZodErrors(result.error),
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format Zod errors into a more usable structure
 */
export function formatZodErrors(error) {
  const formatted = {};

  // Zod uses 'issues' not 'errors'
  const issues = error?.issues || [];

  for (const issue of issues) {
    const path = issue.path?.length > 0 ? issue.path.join('.') : 'general';
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }

  return formatted;
}

/**
 * Get first error message for a path
 */
export function getFirstError(errors, path) {
  const errorList = errors[path];
  return errorList && errorList.length > 0 ? errorList[0] : null;
}

/**
 * Check if a specific path has errors
 */
export function hasError(errors, path) {
  return !!errors[path] && errors[path].length > 0;
}

export default {
  // Schemas
  organizationSchema,
  roleSchema,
  rolesArraySchema,
  permissionsSchema,
  votingSchema,
  votingClassSchema,
  featuresSchema,
  paymasterSchema,
  deployerStateSchema,

  // Validation functions
  validateOrganizationStep,
  validateRolesStep,
  validatePermissionsStep,
  validateVotingStep,
  validatePaymasterConfig,
  validateDeployerState,

  // Helpers
  formatZodErrors,
  getFirstError,
  hasError,
};
