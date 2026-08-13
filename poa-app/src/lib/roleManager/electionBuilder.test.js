import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import RoleManagerABI from '../../../abi/RoleManager.json';
import { buildElectionOptionBatch, buildElectionBatches } from './electionBuilder';
import { deriveClaimHats, markerHatsForRole } from './claims';

const rmIface = new utils.Interface(RoleManagerABI);
const emIface = new utils.Interface([
  'function setWearerEligibility(address wearer, uint256 hatId, bool eligible, bool standing)',
]);

const RM = '0x1111111111111111111111111111111111111111';
const EM = '0x2222222222222222222222222222222222222222';
const ALICE = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const BOB = '0x0000000000000000000000000000000000000B0b';
const CAROL = '0x0000000000000000000000000000000000CA1201';

const base = {
  roleManagerAddress: RM,
  eligibilityModuleAddress: EM,
  roleId: 4,
  hatId: '1000',
};

describe('buildElectionOptionBatch — RoleManager-created role (defaultEligible=false)', () => {
  it('revokes incumbents (no eligibility ban) and grants the winner', () => {
    const batch = buildElectionOptionBatch({
      ...base,
      roleDefaultEligible: false,
      incumbents: [{ address: ALICE }],
      winner: BOB,
    });
    // revoke ALICE, grant BOB — no setWearerEligibility
    expect(batch).toHaveLength(2);
    expect(batch.every((c) => c.target === RM)).toBe(true);
    const rev = rmIface.decodeFunctionData('revokeRole', batch[0].data);
    expect(rev[1].toLowerCase()).toBe(ALICE.toLowerCase());
    const grant = rmIface.decodeFunctionData('grantRole', batch[1].data);
    expect(grant[1].toLowerCase()).toBe(BOB.toLowerCase());
  });

  it('does not revoke the winner when they are already an incumbent', () => {
    const batch = buildElectionOptionBatch({
      ...base,
      incumbents: [{ address: ALICE }, { address: BOB }],
      winner: BOB,
    });
    // revoke ALICE only + grant BOB
    expect(batch).toHaveLength(2);
    expect(rmIface.decodeFunctionData('revokeRole', batch[0].data)[1].toLowerCase()).toBe(ALICE.toLowerCase());
  });
});

describe('buildElectionOptionBatch — default-eligible (adopted/genesis) role', () => {
  it('pairs setWearerEligibility(false,false) BEFORE each revoke', () => {
    const batch = buildElectionOptionBatch({
      ...base,
      roleDefaultEligible: true,
      incumbents: [{ address: ALICE }],
      winner: BOB,
    });
    // ban(ALICE) -> revoke(ALICE) -> grant(BOB)
    expect(batch).toHaveLength(3);
    expect(batch[0].target).toBe(EM);
    const ban = emIface.decodeFunctionData('setWearerEligibility', batch[0].data);
    expect(ban[0].toLowerCase()).toBe(ALICE.toLowerCase());
    expect(ban[2]).toBe(false);
    expect(ban[3]).toBe(false);
    expect(batch[1].target).toBe(RM); // revoke
    expect(batch[2].target).toBe(RM); // grant
  });
});

describe('buildElectionOptionBatch — "No One" option', () => {
  it('only revokes, no grant', () => {
    const batch = buildElectionOptionBatch({
      ...base,
      incumbents: [{ address: ALICE }, { address: BOB }],
      winner: null,
    });
    expect(batch).toHaveLength(2);
    expect(batch.every((c) => {
      try { rmIface.decodeFunctionData('revokeRole', c.data); return true; } catch { return false; }
    })).toBe(true);
  });
});

describe('buildElectionBatches', () => {
  it('builds one batch per candidate plus optional No One', () => {
    const { batches, optionNames } = buildElectionBatches({
      ...base,
      incumbents: [{ address: ALICE }],
      candidates: [{ address: BOB, name: 'Bob' }, { address: CAROL, name: 'Carol' }],
      includeNoOneOption: true,
    });
    expect(optionNames).toEqual(['Bob', 'Carol', 'No One']);
    expect(batches).toHaveLength(3);
    // last batch (No One) has no grant call
    const noOne = batches[2];
    expect(noOne.some((c) => { try { rmIface.decodeFunctionData('grantRole', c.data); return true; } catch { return false; } })).toBe(false);
  });
});

describe('claim helpers', () => {
  it('deriveClaimHats puts identity first then active markers, de-duped', () => {
    const hats = deriveClaimHats(
      { hatId: '5' },
      [{ markerHatId: '10', isActive: true }, { markerHatId: '10' }, { markerHatId: '11', isActive: false }],
    );
    expect(hats).toEqual(['5', '10']);
  });

  it('markerHatsForRole reads active group memberships', () => {
    const role = {
      groupMemberships: [
        { isActive: true, group: { markerHatId: '20' } },
        { isActive: false, group: { markerHatId: '21' } },
      ],
    };
    expect(markerHatsForRole(role)).toEqual(['20']);
  });
});
