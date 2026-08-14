import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import RoleManagerABI from '../../../abi/RoleManager.json';
import {
  encodeCreateRole,
  encodeCreateGroup,
  encodeAddRoleToGroup,
  encodeRemoveRoleFromGroup,
  encodeSetRoleWiring,
  encodeGrantRole,
  encodeRevokeRole,
  ZERO_BYTES32,
} from './encoding';

const iface = new utils.Interface(RoleManagerABI);
const RM = '0x1111111111111111111111111111111111111111';
const USER = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';

describe('encodeCreateRole', () => {
  it('produces a decodable createRole call with defaults', () => {
    const c = encodeCreateRole(RM, { name: 'Treasurer' });
    expect(c.target).toBe(RM);
    expect(c.value).toBe('0');
    const decoded = iface.decodeFunctionData('createRole', c.data);
    const p = decoded[0];
    expect(p.name).toBe('Treasurer');
    expect(p.metadataCID).toBe(ZERO_BYTES32);
    expect(p.maxSupply).toBe(1);
    expect(p.mutableHat).toBe(true);
    expect(p.groupIds).toEqual([]);
    expect(p.initialGrants).toEqual([]);
    // wiring is a full struct
    expect(p.wiring.setTaskPerm).toBe(false);
  });

  it('carries group ids, wiring and initial grants through', () => {
    const c = encodeCreateRole(RM, {
      name: 'President',
      maxSupply: 3,
      mutableHat: false,
      groupIds: ['2', 5],
      wiring: { hvCreator: true, globalPerms: 1 },
      initialGrants: [USER],
    });
    const p = iface.decodeFunctionData('createRole', c.data)[0];
    expect(p.maxSupply).toBe(3);
    expect(p.mutableHat).toBe(false);
    expect(p.groupIds.map(String)).toEqual(['2', '5']);
    expect(p.wiring.hvCreator).toBe(true);
    expect(p.wiring.setTaskPerm).toBe(true);
    expect(p.wiring.taskPermMask).toBe(1);
    expect(p.initialGrants[0].toLowerCase()).toBe(USER.toLowerCase());
  });

  it('accepts an already-built wiring object', () => {
    const c = encodeCreateRole(RM, {
      name: 'X',
      wiring: { setTaskPerm: true, taskPermMask: 4, ddVoter: true, hvClassIndexes: [1] },
    });
    const p = iface.decodeFunctionData('createRole', c.data)[0];
    expect(p.wiring.taskPermMask).toBe(4);
    expect(p.wiring.ddVoter).toBe(true);
    expect(p.wiring.hvClassIndexes.map(Number)).toEqual([1]);
  });
});

describe('encodeCreateGroup', () => {
  it('encodes name, members and shared wiring', () => {
    const c = encodeCreateGroup(RM, {
      name: 'Executives',
      memberRoleIds: [1, 2],
      sharedWiring: { globalPerms: 255 },
    });
    const [name, cid, imageURI, members, wiring] = iface.decodeFunctionData('createGroup', c.data);
    expect(name).toBe('Executives');
    expect(cid).toBe(ZERO_BYTES32);
    expect(imageURI).toBe('');
    expect(members.map(String)).toEqual(['1', '2']);
    expect(wiring.taskPermMask).toBe(255);
  });
});

describe('membership + wiring + grant encoders', () => {
  it('addRoleToGroup / removeRoleFromGroup round-trip', () => {
    const add = encodeAddRoleToGroup(RM, 3, 7);
    expect(iface.decodeFunctionData('addRoleToGroup', add.data).map(String)).toEqual(['3', '7']);
    const rm = encodeRemoveRoleFromGroup(RM, 3, 7);
    expect(iface.decodeFunctionData('removeRoleFromGroup', rm.data).map(String)).toEqual(['3', '7']);
  });

  it('setRoleWiring encodes a normalised struct', () => {
    const c = encodeSetRoleWiring(RM, 9, { globalPerms: 2 });
    const [roleId, wiring] = iface.decodeFunctionData('setRoleWiring', c.data);
    expect(String(roleId)).toBe('9');
    expect(wiring.taskPermMask).toBe(2);
  });

  it('grantRole / revokeRole encode role id + user', () => {
    const g = encodeGrantRole(RM, 1, USER);
    const [rid, u] = iface.decodeFunctionData('grantRole', g.data);
    expect(String(rid)).toBe('1');
    expect(u.toLowerCase()).toBe(USER.toLowerCase());
    const r = encodeRevokeRole(RM, 1, USER);
    expect(String(iface.decodeFunctionData('revokeRole', r.data)[0])).toBe('1');
  });
});
