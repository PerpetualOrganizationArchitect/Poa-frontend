import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import {
  authorityInterface,
  buildClaim,
  buildRenounce,
  buildVouch,
  buildRevokeVouch,
  buildDelegatedGrant,
  buildDelegatedOffer,
  buildDelegatedRemove,
  buildDelegatedUnremove,
  buildFinalize,
  buildCancel,
  buildCreateRole,
  buildCreateGroup,
  buildRenameSubject,
  buildSetMaxMembers,
  buildSetSubjectDefault,
  buildSetPerm,
  buildClearPerm,
  buildAddRoleToGroup,
  buildRemoveRoleFromGroup,
  buildGrant,
  buildOffer,
  buildRemove,
  buildUnremove,
  buildWithdrawOffer,
  buildSetRule,
  buildClearRule,
  buildConfigureVouchAttestor,
  buildResetVouchEpoch,
  buildSetManagerConfig,
  buildReconcile,
} from './txBuilders';
import { boolPermWord, PERM_KEYS, GLOBAL_CTX } from './permKeys';
import { AUTHORITY_ADDRESS, ALICE, EXECS_ID, MEMBERS_ID } from './fixtures';

const A = AUTHORITY_ADDRESS;

/** Decode a built call back through the REAL artifact ABI. */
function decode(callObj, fnName) {
  const parsed = authorityInterface.parseTransaction({ data: callObj.data });
  if (fnName) expect(parsed.name).toBe(fnName);
  return parsed;
}

describe('every builder produces a well-formed Executor call', () => {
  const built = [
    ['claim', buildClaim(A, EXECS_ID)],
    ['renounce', buildRenounce(A, EXECS_ID)],
    ['vouch', buildVouch(A, EXECS_ID, ALICE)],
    ['revokeVouch', buildRevokeVouch(A, EXECS_ID, ALICE)],
    ['delegatedGrant', buildDelegatedGrant(A, EXECS_ID, ALICE)],
    ['delegatedOffer', buildDelegatedOffer(A, EXECS_ID, ALICE)],
    ['delegatedRemove', buildDelegatedRemove(A, EXECS_ID, ALICE, true)],
    ['delegatedUnremove', buildDelegatedUnremove(A, EXECS_ID, ALICE)],
    ['finalize', buildFinalize(A, 7)],
    ['cancel', buildCancel(A, 7)],
    ['createRole', buildCreateRole(A, { name: 'Stewards' })],
    ['createGroup', buildCreateGroup(A, { name: 'Everyone', memberRoleIds: [MEMBERS_ID] })],
    ['renameSubject', buildRenameSubject(A, EXECS_ID, { name: 'Leads' })],
    ['setMaxMembers', buildSetMaxMembers(A, EXECS_ID, 5)],
    ['setSubjectDefault', buildSetSubjectDefault(A, EXECS_ID, true)],
    ['setPerm', buildSetPerm(A, EXECS_ID, PERM_KEYS.DD_VOTE, GLOBAL_CTX, boolPermWord(true))],
    ['clearPerm', buildClearPerm(A, EXECS_ID, PERM_KEYS.DD_VOTE, GLOBAL_CTX)],
    ['addRoleToGroup', buildAddRoleToGroup(A, MEMBERS_ID, EXECS_ID)],
    ['removeRoleFromGroup', buildRemoveRoleFromGroup(A, MEMBERS_ID, EXECS_ID)],
    ['grant', buildGrant(A, EXECS_ID, ALICE)],
    ['offer', buildOffer(A, EXECS_ID, ALICE)],
    ['remove', buildRemove(A, EXECS_ID, ALICE)],
    ['unremove', buildUnremove(A, EXECS_ID, ALICE)],
    ['withdrawOffer', buildWithdrawOffer(A, EXECS_ID, ALICE)],
    ['setRule', buildSetRule(A, EXECS_ID, ALICE, 'Ban', false)],
    ['clearRule', buildClearRule(A, EXECS_ID, ALICE)],
    ['configureVouchAttestor', buildConfigureVouchAttestor(A, EXECS_ID, 2, EXECS_ID)],
    ['resetVouchEpoch', buildResetVouchEpoch(A, EXECS_ID)],
    ['setManagerConfig', buildSetManagerConfig(A, MEMBERS_ID, { managerSubjectId: EXECS_ID })],
    ['reconcile', buildReconcile(A, EXECS_ID, [ALICE])],
  ];

  it.each(built)('%s targets the authority with zero value', (_name, callObj) => {
    expect(callObj.target).toBe(A);
    expect(callObj.value).toBe('0');
    expect(callObj.data).toMatch(/^0x[0-9a-f]+$/);
  });

  it.each(built)('%s decodes against the real artifact ABI', (name, callObj) => {
    // A signature drift would throw here rather than shipping a well-formed reverting tx.
    const parsed = authorityInterface.parseTransaction({ data: callObj.data });
    expect(parsed.name).toBe(name);
  });
});

describe('argument encoding', () => {
  it('claim carries the subject id, and nothing else — group membership is derived', () => {
    // v1 needed [identityHat, ...markerHats]; v2 has no marker stratum at all.
    const parsed = decode(buildClaim(A, EXECS_ID), 'claim');
    expect(parsed.args).toHaveLength(1);
    expect(parsed.args[0].toString()).toBe(EXECS_ID);
  });

  it('grant defaults to DELEGABLE — sticky is an explicit opt-in', () => {
    expect(decode(buildGrant(A, EXECS_ID, ALICE), 'grant').args[2]).toBe(true);
    expect(decode(buildGrant(A, EXECS_ID, ALICE, false), 'grant').args[2]).toBe(false);
  });

  it('offer defaults to delegable too', () => {
    expect(decode(buildOffer(A, EXECS_ID, ALICE), 'offer').args[2]).toBe(true);
  });

  it('remove distinguishes SOFT from a ban', () => {
    expect(decode(buildRemove(A, EXECS_ID, ALICE, false), 'remove').args[2]).toBe(false);
    expect(decode(buildRemove(A, EXECS_ID, ALICE, true), 'remove').args[2]).toBe(true);
  });

  it('setRule accepts a kind NAME or the raw uint8, matching the contract enum', () => {
    expect(decode(buildSetRule(A, EXECS_ID, ALICE, 'Ban'), 'setRule').args[2]).toBe(2);
    expect(decode(buildSetRule(A, EXECS_ID, ALICE, 1), 'setRule').args[2]).toBe(1);
    expect(() => buildSetRule(A, EXECS_ID, ALICE, 'Nonsense')).toThrow(/unknown rule kind/);
  });

  it('setManagerConfig packs the caps bitmask', () => {
    const parsed = decode(
      buildSetManagerConfig(A, MEMBERS_ID, { managerSubjectId: EXECS_ID, canGrant: true, canRemove: true, delaySecs: 172800 }),
      'setManagerConfig'
    );
    expect(parsed.args[1].toString()).toBe(EXECS_ID);
    expect(parsed.args[2]).toBe(3);
    expect(parsed.args[3]).toBe(172800);
  });

  it('setManagerConfig with managerSubjectId 0 clears the delegation', () => {
    const parsed = decode(buildSetManagerConfig(A, MEMBERS_ID, {}), 'setManagerConfig');
    expect(parsed.args[1].toString()).toBe('0');
    expect(parsed.args[2]).toBe(0);
  });

  it('setSubjectDefault carries the force flag separately from the verdict', () => {
    const parsed = decode(buildSetSubjectDefault(A, EXECS_ID, false, true), 'setSubjectDefault');
    expect(parsed.args[1]).toBe(false);
    expect(parsed.args[2]).toBe(true);
  });

  it('setPerm carries the packed word verbatim', () => {
    const word = boolPermWord(true);
    const parsed = decode(buildSetPerm(A, EXECS_ID, PERM_KEYS.DD_VOTE, GLOBAL_CTX, word), 'setPerm');
    expect(parsed.args[1]).toBe(PERM_KEYS.DD_VOTE);
    expect(parsed.args[2]).toBe(GLOBAL_CTX);
    expect(parsed.args[3].toString()).toBe(word);
  });

  it('createRole defaults metadataCID to bytes32(0) and maxMembers to unlimited', () => {
    const parsed = decode(buildCreateRole(A, { name: 'Stewards' }), 'createRole');
    expect(parsed.args[0]).toBe('Stewards');
    expect(parsed.args[1]).toBe(utils.hexZeroPad('0x00', 32));
    expect(parsed.args[3]).toBe(0);
  });

  it('reconcile picks the ARRAY overload explicitly', () => {
    // Two `reconcile` overloads exist; ethers cannot disambiguate by name alone.
    const parsed = decode(buildReconcile(A, EXECS_ID, ALICE), 'reconcile');
    expect(parsed.functionFragment.format()).toBe('reconcile(uint256,address[])');
    expect(parsed.args[1].map((a) => a.toLowerCase())).toEqual([ALICE]);
  });
});

describe('input guards fail loudly rather than encoding a bad tx', () => {
  it('needs an authority address', () => {
    expect(() => buildClaim(null, EXECS_ID)).toThrow(/authority address/);
  });

  it('needs a subject id', () => {
    expect(() => buildClaim(A, null)).toThrow(/subject id/);
    expect(() => buildClaim(A, '')).toThrow(/subject id/);
  });

  it('needs a real user address', () => {
    expect(() => buildGrant(A, EXECS_ID, 'alice')).toThrow(/user address/);
    expect(() => buildGrant(A, EXECS_ID, null)).toThrow(/user address/);
  });

  it('needs a pendingId', () => {
    expect(() => buildFinalize(A, null)).toThrow(/pendingId/);
    expect(() => buildCancel(A, undefined)).toThrow(/pendingId/);
  });

  it('accepts pendingId 0 (a real id)', () => {
    expect(decode(buildFinalize(A, 0), 'finalize').args[0].toString()).toBe('0');
  });
});
