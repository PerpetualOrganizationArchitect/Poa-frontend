import { ethers } from 'ethers';

import {
  buildRoleAssignments,
  mapStateToDeploymentParams,
} from './deploymentMapper';
import { OrgDeployerBoundaryError } from './orgDeployerBoundary';
import { TaskPermission } from '@/util/permissions';

const MAX_ROLES = 16;
const MAX_GROUPS = 8;
const MAX_GROUP_MEMBERS = 16;
const MAX_UINT32 = 4294967295;

const roleName = (role, index) => role?.name?.trim() || `Role ${index}`;

function configuredOpen(role) {
  if (role?.vouching?.enabled) return false;
  if (typeof role?.open === 'boolean') return role.open;
  return Boolean(role?.defaults?.eligible);
}

function configuredMaxMembers(role) {
  const raw = role?.maxMembers ?? role?.hatConfig?.maxSupply ?? 0;
  return Number(raw);
}

/**
 * Report legacy wizard concepts that the authority-native deployer cannot preserve.
 * Nothing here invents groups or manager powers from a Hats parent relationship.
 */
export function validateAccessV2Representability(state) {
  const errors = [];
  const roles = state?.roles || [];
  const groups = state?.groups || [];

  if (roles.length === 0) errors.push('Access v2 requires at least one role.');
  if (roles.length > MAX_ROLES) {
    errors.push(`Access v2 supports at most ${MAX_ROLES} roles (this configuration has ${roles.length}).`);
  }

  roles.forEach((role, index) => {
    const label = roleName(role, index);
    const parentIndex = role?.hierarchy?.adminRoleIndex;
    if (parentIndex !== null && parentIndex !== undefined) {
      const parent = roles[Number(parentIndex)];
      errors.push(
        `“${label}” is managed through the legacy parent-role hierarchy${parent ? ` (“${roleName(parent, Number(parentIndex))}”)` : ''}. ` +
        'Access v2 has flat roles and explicit manager rules; remove the parent relationship before deploying.'
      );
    }
    if (role?.vouching?.combineWithHierarchy) {
      errors.push(
        `“${label}” lets hierarchy admins vouch. Access v2 accepts one explicit voucher role and cannot preserve that union.`
      );
    }
    if (role?.defaults?.standing === false) {
      errors.push(
        `“${label}” is not in good standing by default. Access v2 has no separate standing default, so this setting cannot be preserved.`
      );
    }
    if (role?.hatConfig?.mutableHat === false) {
      errors.push(
        `“${label}” is immutable. Access v2 has no deploy-time immutable-role flag, so this setting cannot be preserved.`
      );
    }

    const maxMembers = configuredMaxMembers(role);
    if (!Number.isInteger(maxMembers) || maxMembers < 0 || maxMembers > MAX_UINT32) {
      errors.push(`“${label}” must have a max-members value between 0 and ${MAX_UINT32}.`);
    }
  });

  for (const rawIndex of state?.permissions?.quickJoinRoles || []) {
    const index = Number(rawIndex);
    const role = roles[index];
    if (!role) continue; // shared validation reports the stale index
    if (!configuredOpen(role)) {
      errors.push(
        `“${roleName(role, index)}” is granted on Quick Join but is not open. Access v2 requires every Quick Join role to be open.`
      );
    }
  }

  if (!Array.isArray(groups)) {
    errors.push('Access v2 groups must be an array.');
  } else {
    if (groups.length > MAX_GROUPS) {
      errors.push(`Access v2 supports at most ${MAX_GROUPS} groups (this configuration has ${groups.length}).`);
    }
    groups.forEach((group, groupIndex) => {
      const name = String(group?.name || '').trim();
      const members = group?.memberRoleIndices;
      if (!name) errors.push(`Access v2 group ${groupIndex + 1} needs a name.`);
      if (!Array.isArray(members) || members.length === 0 || members.length > MAX_GROUP_MEMBERS) {
        errors.push(`Access v2 group “${name || groupIndex + 1}” must contain 1–${MAX_GROUP_MEMBERS} roles.`);
        return;
      }
      const normalized = members.map(Number);
      normalized.forEach((roleIndex) => {
        if (!Number.isInteger(roleIndex) || roleIndex < 0 || roleIndex >= roles.length) {
          errors.push(`Access v2 group “${name || groupIndex + 1}” references a role that does not exist.`);
        }
      });
      if (new Set(normalized).size !== normalized.length) {
        errors.push(`Access v2 group “${name || groupIndex + 1}” lists the same role more than once.`);
      }
    });
  }

  return { isValid: errors.length === 0, errors };
}

export function mapAccessV2Groups(groups = []) {
  return groups.map((group) => ({
    name: String(group.name || '').trim(),
    memberRoleIndices: group.memberRoleIndices.map((index) => ethers.BigNumber.from(index)),
  }));
}

/**
 * Build Kyoto's authority-native TM_PERMS rows. Task permission checks read that
 * authority key directly; the initializer's creator list covers project creation
 * but does not satisfy task CREATE. Every task creator therefore needs an explicit
 * CREATE bit in the authority seed, even when that is its only task permission.
 */
export function buildAccessV2TaskManagerPerms(taskManagerPerms = {}, taskCreatorRoles = [], roleCount) {
  const inRange = (raw) => {
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 && (!Number.isInteger(roleCount) || index < roleCount)
      ? index
      : null;
  };
  const creators = new Set((taskCreatorRoles || []).map(inRange).filter((index) => index !== null));
  const configured = new Map();
  Object.entries(taskManagerPerms || {}).forEach(([rawIndex, rawMask]) => {
    const index = inRange(rawIndex);
    if (index !== null) configured.set(index, Number(rawMask) & 0xff);
  });

  const indices = Array.from(new Set([...configured.keys(), ...creators])).sort((a, b) => a - b);
  const roleIndices = [];
  const masks = [];
  indices.forEach((index) => {
    const explicitMask = configured.get(index) || 0;
    const mask = creators.has(index)
      ? explicitMask | TaskPermission.CREATE
      : explicitMask & ~TaskPermission.CREATE;
    if (mask === 0) return;
    roleIndices.push(ethers.BigNumber.from(index));
    masks.push(mask);
  });
  return { roleIndices, masks };
}

/**
 * Adapt the current wizard state to Kyoto's exact authority-native DeploymentParams.
 * Shared non-access fields still flow through the battle-tested legacy mapper; the
 * access shape is rebuilt explicitly and contains no legacy Hats tuple fields.
 */
export function mapStateToAccessV2DeploymentParams(state, deployerAddress, options = {}) {
  const compatibility = validateAccessV2Representability(state);
  if (!compatibility.isValid) {
    throw new OrgDeployerBoundaryError(
      `This configuration cannot be deployed with Access v2 without changing its meaning:\n• ${compatibility.errors.join('\n• ')}`
    );
  }

  const shared = mapStateToDeploymentParams(state, deployerAddress, options);
  const roles = shared.roles.map((legacyRole, index) => {
    const source = state.roles[index];
    return {
      name: legacyRole.name,
      image: legacyRole.image,
      metadataCID: legacyRole.metadataCID,
      canVote: legacyRole.canVote,
      open: configuredOpen(source),
      maxMembers: configuredMaxMembers(source),
      vouching: {
        enabled: legacyRole.vouching.enabled,
        quorum: legacyRole.vouching.quorum,
        voucherRoleIndex: legacyRole.vouching.voucherRoleIndex,
      },
      distribution: legacyRole.distribution,
    };
  });

  roles.forEach((role, index) => {
    const seeded = role.distribution.additionalWearers.length + (role.distribution.mintToDeployer ? 1 : 0);
    if (role.maxMembers !== 0 && seeded > role.maxMembers) {
      throw new OrgDeployerBoundaryError(
        `“${role.name || `Role ${index}`}” can hold ${role.maxMembers} members but its initial distribution contains ${seeded}.`
      );
    }
  });

  return {
    ...shared,
    roles,
    groups: mapAccessV2Groups(state.groups || []),
    // Unlike the legacy production path, Kyoto consumes the wizard's explicit
    // permission choices directly. In particular, Quick Join is contract-validated
    // against RoleConfig.open.
    roleAssignments: buildRoleAssignments(state.permissions, roles.length),
    taskManagerPerms: buildAccessV2TaskManagerPerms(
      state.taskManagerPerms,
      state.permissions?.taskCreatorRoles || [],
      roles.length
    ),
  };
}

export default {
  validateAccessV2Representability,
  mapAccessV2Groups,
  buildAccessV2TaskManagerPerms,
  mapStateToAccessV2DeploymentParams,
};
