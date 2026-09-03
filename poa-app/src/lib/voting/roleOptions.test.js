/**
 * roleOptions — the role list every picker renders, both access systems.
 */

import { describe, it, expect } from 'vitest';
import { foldRoleOptions, ROLE_OPTION_SOURCE } from './roleOptions';
import { normalizeAuthoritySubjects } from '@/lib/accessV2/normalize';
import { composeSubjectId } from '@/lib/accessV2/ids';
import {
  AUTHORITY_ADDRESS,
  MEMBERS_ID,
  EXECS_ID,
  EVERYONE_GROUP_ID,
  membersSubject,
  execsSubject,
  everyoneGroup,
} from '@/lib/accessV2/fixtures';

/** A role created after cutover — no legacy hat id exists for it. */
const STEWARDS_ID = composeSubjectId(AUTHORITY_ADDRESS, 7);
/** An adopted Hats id standing in for the eligibility-module admin hat. */
const ELIGIBILITY_ADMIN_ID = ((1n << 224n) | (9n << 208n)).toString();

const rawRole = (id, name, over = {}) => ({
  id,
  subjectId: id,
  kind: 'Role',
  name,
  metadataCID: null,
  imageURI: '',
  maxMembers: 0,
  memberCount: 0,
  activeMemberCount: 0,
  defaultAllow: false,
  isLegacyAdopted: true,
  createdAt: '1749000000',
  vouchConfig: null,
  managerConfig: null,
  perms: [],
  memberRoles: [],
  groups: [],
  ...over,
});

/** The KUBI-shaped fixture org: Members + Executives, both inside an "Everyone" group. */
function fixtureOrg() {
  return normalizeAuthoritySubjects([membersSubject(), execsSubject(), everyoneGroup()]);
}

// ── LEGACY PARITY ───────────────────────────────────────────────────────────────────────────────

describe('foldRoleOptions — legacy org (authorityEnabled: false)', () => {
  const nameFor = (hatId, index) => `name-for-${hatId}@${index}`;

  it('projects POContext roleHatIds exactly as the pre-v2 hook did', () => {
    const out = foldRoleOptions({
      authorityEnabled: false,
      legacyRoleHatIds: ['10', '20'],
      nameFor,
    });
    expect(out.source).toBe(ROLE_OPTION_SOURCE.LEGACY);
    expect(out.allRoles).toEqual([
      { hatId: '10', name: 'name-for-10@0', index: 0 },
      { hatId: '20', name: 'name-for-20@1', index: 1 },
    ]);
  });

  it('returns an empty list for an org with no roles yet', () => {
    expect(foldRoleOptions({ authorityEnabled: false, legacyRoleHatIds: [], nameFor }).allRoles)
      .toEqual([]);
    expect(foldRoleOptions({ authorityEnabled: false, nameFor }).allRoles).toEqual([]);
  });

  it('hands back POContext’s own ids and name map untouched', () => {
    const ids = ['10'];
    const names = { 10: 'Member' };
    const out = foldRoleOptions({
      authorityEnabled: false,
      legacyRoleHatIds: ids,
      legacyRoleNames: names,
      nameFor,
    });
    expect(out.roleHatIds).toBe(ids);
    expect(out.roleNamesById).toBe(names);
  });

  it('filters votingEligibleRoles on roleCanVoteMap, treating unknown as eligible', () => {
    const out = foldRoleOptions({
      authorityEnabled: false,
      legacyRoleHatIds: ['10', '20', '30'],
      legacyCanVoteMap: { 10: true, 20: false },
      nameFor,
    });
    expect(out.votingEligibleRoles.map((r) => r.hatId)).toEqual(['10', '30']);
  });

  it('IGNORES v2 subjects entirely — the feature gate is the whole contract', () => {
    const { roles } = fixtureOrg();
    const withSubjects = foldRoleOptions({
      authorityEnabled: false,
      legacyRoleHatIds: ['10'],
      subjectRoles: roles,
      nameFor,
    });
    const without = foldRoleOptions({
      authorityEnabled: false,
      legacyRoleHatIds: ['10'],
      nameFor,
    });
    expect(withSubjects).toEqual(without);
  });
});

// ── ACCESS V2 ───────────────────────────────────────────────────────────────────────────────────

describe('foldRoleOptions — access v2 org (authorityEnabled: true)', () => {
  it('lists the authority’s ROLE subjects in the legacy-compatible shape', () => {
    const { roles } = fixtureOrg();
    const out = foldRoleOptions({ authorityEnabled: true, subjectRoles: roles });
    expect(out.source).toBe(ROLE_OPTION_SOURCE.AUTHORITY);
    expect(out.allRoles.map((r) => [r.hatId, r.name, r.index])).toEqual([
      [MEMBERS_ID, 'Members', 0],
      [EXECS_ID, 'Executives', 1],
    ]);
    expect(out.roleHatIds).toEqual([MEMBERS_ID, EXECS_ID]);
  });

  it('never offers a GROUP as a role', () => {
    const { subjects } = fixtureOrg();
    // Deliberately hand it the whole subject list, groups included.
    const out = foldRoleOptions({ authorityEnabled: true, subjectRoles: subjects });
    expect(out.roleHatIds).not.toContain(EVERYONE_GROUP_ID);
    expect(out.roleHatIds).toEqual([MEMBERS_ID, EXECS_ID]);
  });

  it('offers a role created AFTER cutover, which the legacy hat list can never hold', () => {
    const { roles } = normalizeAuthoritySubjects([
      membersSubject(),
      rawRole(STEWARDS_ID, 'Stewards', { isLegacyAdopted: false }),
    ]);
    const out = foldRoleOptions({ authorityEnabled: true, subjectRoles: roles });
    expect(out.roleHatIds).toEqual([MEMBERS_ID, STEWARDS_ID]);
    expect(out.roleNamesById[STEWARDS_ID]).toBe('Stewards');
  });

  it('strips the eligibility-module admin hat, which migration adopts like any other hat', () => {
    const { roles } = normalizeAuthoritySubjects([
      membersSubject(),
      rawRole(ELIGIBILITY_ADMIN_ID, 'Eligibility Admin'),
    ]);
    const out = foldRoleOptions({
      authorityEnabled: true,
      subjectRoles: roles,
      excludeIds: [ELIGIBILITY_ADMIN_ID],
    });
    expect(out.roleHatIds).toEqual([MEMBERS_ID]);
    // Index is the position in the RENDERED list, so the removal does not leave a hole.
    expect(out.allRoles.map((r) => r.index)).toEqual([0]);
  });

  it('lets the authority’s name win over the frozen legacy map', () => {
    const { roles } = normalizeAuthoritySubjects([membersSubject({ name: 'Contributors' })]);
    const out = foldRoleOptions({
      authorityEnabled: true,
      subjectRoles: roles,
      legacyRoleNames: { [MEMBERS_ID]: 'Members', 999: 'Some other hat' },
    });
    expect(out.allRoles[0].name).toBe('Contributors');
    expect(out.roleNamesById[MEMBERS_ID]).toBe('Contributors');
    // Legacy entries for ids the authority doesn’t know survive, so no label regresses.
    expect(out.roleNamesById['999']).toBe('Some other hat');
  });

  it('labels an unnamed subject with an honest short id, never "Unknown Role"', () => {
    const { roles } = normalizeAuthoritySubjects([rawRole(STEWARDS_ID, '   ')]);
    const out = foldRoleOptions({ authorityEnabled: true, subjectRoles: roles });
    expect(out.allRoles[0].name).toMatch(/^Role /);
    expect(out.allRoles[0].name).not.toBe('Unknown Role');
    // An empty name must not poison the map with a blank label.
    expect(out.roleNamesById[STEWARDS_ID]).toBeUndefined();
  });

  it('takes canVote from the group-folded subject, not the frozen legacy map', () => {
    // Members carries DD_VOTE itself in the fixture; Executives only through the group.
    const { roles } = fixtureOrg();
    const out = foldRoleOptions({
      authorityEnabled: true,
      subjectRoles: roles,
      // The frozen map has no row at all for these ids on a post-cutover org.
      legacyCanVoteMap: { [EXECS_ID]: false },
    });
    const byId = Object.fromEntries(out.allRoles.map((r) => [r.hatId, r.canVote]));
    expect(byId[MEMBERS_ID]).toBe(true);
    expect(out.votingEligibleRoles.map((r) => r.hatId)).toContain(MEMBERS_ID);
  });

  it('drops duplicate and malformed subject ids instead of rendering them twice', () => {
    const { roles } = normalizeAuthoritySubjects([membersSubject(), membersSubject()]);
    const out = foldRoleOptions({
      authorityEnabled: true,
      subjectRoles: [...roles, null, { subjectId: 'not-a-number' }],
    });
    expect(out.roleHatIds).toEqual([MEMBERS_ID]);
  });

  it('returns empty lists when the authority read has produced nothing yet', () => {
    const out = foldRoleOptions({ authorityEnabled: true, subjectRoles: [] });
    expect(out.allRoles).toEqual([]);
    expect(out.roleHatIds).toEqual([]);
    expect(out.votingEligibleRoles).toEqual([]);
  });
});
