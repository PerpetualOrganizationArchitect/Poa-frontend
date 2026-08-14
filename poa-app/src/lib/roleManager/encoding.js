/**
 * RoleManager call encoding — pure, ethers-based.
 *
 * Produces Executor batch entries ({ target, value, data }) for every
 * governance-driven RoleManager mutation the frontend composes. All calls are
 * onlyExecutor on-chain, so they only ever run inside a winning proposal batch.
 *
 * The single vendored ABI (abi/RoleManager.json) is the source of truth for the
 * RoleParams / RoleWiring tuple layout — we hand ethers a plain object and it
 * matches components by name, so this stays correct if a field is appended.
 */

import { utils } from 'ethers';
import RoleManagerABI from '../../../abi/RoleManager.json';
import { buildRoleWiring, DEFAULT_WIRING } from './wiring';

const iface = new utils.Interface(RoleManagerABI);

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

const call = (target, data) => ({ target, value: '0', data });

/** Normalise a wiring-ish input into a complete RoleWiring object for ethers. */
function normaliseWiring(wiring) {
  // Accept either an already-built RoleWiring or raw config; fill any gaps.
  const w = wiring && wiring.setTaskPerm !== undefined ? wiring : buildRoleWiring(wiring || {});
  return { ...DEFAULT_WIRING, ...w };
}

/**
 * Encode a single RoleManager.createRole call.
 *
 * @param {string} roleManagerAddress
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.metadataCID] - bytes32 (IPFS CID digest); 0x0 when none
 * @param {string} [params.imageURI]
 * @param {number} [params.maxSupply=1]
 * @param {boolean} [params.mutableHat=true]
 * @param {Array<string|number>} [params.groupIds=[]] - groups the role joins
 * @param {Object} [params.wiring] - RoleWiring (or raw config)
 * @param {string[]} [params.initialGrants=[]] - addresses granted via consent logic
 * @returns {{target, value, data}}
 */
export function encodeCreateRole(roleManagerAddress, params = {}) {
  const roleParams = {
    name: params.name || '',
    metadataCID: params.metadataCID || ZERO_BYTES32,
    imageURI: params.imageURI || '',
    maxSupply: Math.max(1, Number(params.maxSupply) || 1),
    mutableHat: params.mutableHat === undefined ? true : Boolean(params.mutableHat),
    groupIds: (params.groupIds || []).map((g) => String(g)),
    wiring: normaliseWiring(params.wiring),
    initialGrants: (params.initialGrants || []).map((a) => String(a)),
  };
  return call(roleManagerAddress, iface.encodeFunctionData('createRole', [roleParams]));
}

/**
 * Encode a single RoleManager.createGroup call.
 * Marker maxSupply / immutability are fixed on-chain; only shared wiring +
 * member roles are configurable here.
 *
 * @param {string} roleManagerAddress
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.metadataCID] - bytes32
 * @param {string} [params.imageURI]
 * @param {Array<string|number>} [params.memberRoleIds=[]]
 * @param {Object} [params.sharedWiring]
 * @returns {{target, value, data}}
 */
export function encodeCreateGroup(roleManagerAddress, params = {}) {
  return call(
    roleManagerAddress,
    iface.encodeFunctionData('createGroup', [
      params.name || '',
      params.metadataCID || ZERO_BYTES32,
      params.imageURI || '',
      (params.memberRoleIds || []).map((r) => String(r)),
      normaliseWiring(params.sharedWiring),
    ]),
  );
}

export function encodeAddRoleToGroup(roleManagerAddress, roleId, groupId) {
  return call(
    roleManagerAddress,
    iface.encodeFunctionData('addRoleToGroup', [String(roleId), String(groupId)]),
  );
}

export function encodeRemoveRoleFromGroup(roleManagerAddress, roleId, groupId) {
  return call(
    roleManagerAddress,
    iface.encodeFunctionData('removeRoleFromGroup', [String(roleId), String(groupId)]),
  );
}

export function encodeSetRoleWiring(roleManagerAddress, roleId, wiring) {
  return call(
    roleManagerAddress,
    iface.encodeFunctionData('setRoleWiring', [String(roleId), normaliseWiring(wiring)]),
  );
}

export function encodeSetGroupWiring(roleManagerAddress, groupId, wiring) {
  return call(
    roleManagerAddress,
    iface.encodeFunctionData('setGroupWiring', [String(groupId), normaliseWiring(wiring)]),
  );
}

export function encodeGrantRole(roleManagerAddress, roleId, user) {
  return call(
    roleManagerAddress,
    iface.encodeFunctionData('grantRole', [String(roleId), String(user)]),
  );
}

export function encodeRevokeRole(roleManagerAddress, roleId, user) {
  return call(
    roleManagerAddress,
    iface.encodeFunctionData('revokeRole', [String(roleId), String(user)]),
  );
}

export { ZERO_BYTES32 };
export default iface;
