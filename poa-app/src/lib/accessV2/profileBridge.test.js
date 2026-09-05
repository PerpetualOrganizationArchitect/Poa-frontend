import { describe, expect, it } from 'vitest';
import { composeSubjectId, HATS_NAMESPACE_FLOOR } from './ids';
import { PERM_KEYS } from './permKeys';
import {
  buildV2ProfilePermissions,
  buildV2ProfileView,
} from './profileBridge';

const AUTHORITY = '0x1111111111111111111111111111111111111111';
const ADOPTED_ROLE_ID = (HATS_NAMESPACE_FLOOR | (1n << 208n)).toString();
const TOP_HAT_ID = HATS_NAMESPACE_FLOOR.toString();
const NATIVE_ROLE_ID = composeSubjectId(AUTHORITY, 1);

function subject({ id, name, effective = {}, ...rest }) {
  return {
    subjectId: id,
    hatId: id,
    name,
    isGroup: false,
    isUserFacing: true,
    memberCount: 1,
    vouchConfig: null,
    // This is deliberately the already-folded value. A role with no own rows can still inherit
    // these powers from a group, which is the regression the profile badges must cover.
    permEffective: (key) => String(effective[key] || 0),
    ...rest,
  };
}

function membership({ id, name, ...rest }) {
  return {
    id: `${id}-0xabc`,
    subjectId: id,
    hatId: id,
    subjectName: name,
    subject: { subjectId: id, name },
    isUserFacing: true,
    isMember: false,
    claimable: false,
    vouchCount: 0,
    vouchMet: false,
    eligibilitySource: 'None',
    ...rest,
  };
}

describe('buildV2ProfilePermissions', () => {
  it('collapses folded semantic keys into the legacy Profile Hub badge vocabulary', () => {
    const inherited = subject({
      id: NATIVE_ROLE_ID,
      name: 'Treasurer',
      effective: {
        [PERM_KEYS.HV_CREATE]: 1,
        [PERM_KEYS.PT_APPROVE]: 1,
        [PERM_KEYS.PT_MEMBER]: 1,
        [PERM_KEYS.DD_VOTE]: 1,
      },
      permRows: [], // no own rows: every displayed permission can be inherited from a group
    });

    expect(buildV2ProfilePermissions(inherited)).toEqual([
      { permissionRole: 'Creator', allowed: true },
      { permissionRole: 'Approver', allowed: true },
      { permissionRole: 'Member', allowed: true },
      { permissionRole: 'Voter', allowed: true },
    ]);
  });

  it('keeps the legacy Creator badge for Education Hub creators', () => {
    const educationCreator = subject({
      id: NATIVE_ROLE_ID,
      name: 'Educator',
      effective: { [PERM_KEYS.EDU_CREATE]: 1 },
    });

    expect(buildV2ProfilePermissions(educationCreator)).toEqual([
      { permissionRole: 'Creator', allowed: true },
    ]);
  });
});

describe('buildV2ProfileView', () => {
  it('uses live memberships for held roles and never leaks the migrated top hat', () => {
    const adopted = subject({ id: ADOPTED_ROLE_ID, name: 'Member' });
    const native = subject({ id: NATIVE_ROLE_ID, name: 'Co-President' });
    const topHat = subject({
      id: TOP_HAT_ID,
      name: '0xc9f573a180f5c200d297e8c451effc4ffb8ae867ec72add82f282daf310443fc',
      isUserFacing: false,
    });
    const view = buildV2ProfileView({
      roles: [topHat, adopted, native],
      memberships: [
        membership({ id: TOP_HAT_ID, name: topHat.name, isMember: true, isUserFacing: false }),
        membership({ id: NATIVE_ROLE_ID, name: 'Co-President', isMember: true }),
        membership({ id: ADOPTED_ROLE_ID, name: 'Member', claimable: true }),
      ],
      claimableMemberships: [
        membership({
          id: ADOPTED_ROLE_ID,
          name: 'Member',
          claimable: true,
          eligibilitySource: 'SubjectDefault',
          badge: 'Open role',
        }),
      ],
    });

    expect(view.roles.map((role) => role.name)).toEqual(['Member', 'Co-President']);
    expect(view.userRoles.map((role) => role.name)).toEqual(['Co-President']);
    expect(view.userRoleIds).toEqual([NATIVE_ROLE_ID]);
    expect(view.claimableRoles.map((role) => [role.name, role.claimLabel])).toEqual([
      ['Member', 'Open role'],
    ]);
    expect(view.hasClaimedRole).toBe(true);
  });

  it('joins hexadecimal membership ids to decimal subject ids', () => {
    const role = subject({ id: NATIVE_ROLE_ID, name: 'Native role' });
    const view = buildV2ProfileView({
      roles: [role],
      memberships: [
        membership({ id: `0x${BigInt(NATIVE_ROLE_ID).toString(16)}`, name: 'stale name', isMember: true }),
      ],
    });
    expect(view.userRoles.map((item) => item.name)).toEqual(['Native role']);
  });

  it('keeps membership-ahead roles in the card-compatible role inventory', () => {
    const view = buildV2ProfileView({
      memberships: [
        membership({ id: NATIVE_ROLE_ID, name: 'Just indexed', isMember: true }),
      ],
    });

    expect(view.userRoles.map((item) => item.name)).toEqual(['Just indexed']);
    expect(view.roles.map((item) => item.name)).toEqual(['Just indexed']);
    expect(view.userRoleIds).toEqual([NATIVE_ROLE_ID]);
  });

  it('derives permission affordances only from roles the user actively holds', () => {
    const approver = subject({
      id: NATIVE_ROLE_ID,
      name: 'Approver',
      effective: { [PERM_KEYS.PT_APPROVE]: 1, [PERM_KEYS.PT_MEMBER]: 1 },
    });
    const view = buildV2ProfileView({
      roles: [approver],
      memberships: [membership({ id: NATIVE_ROLE_ID, name: 'Approver', isMember: true })],
    });
    expect(view.canApproveRequests).toBe(true);
    expect(view.canRequestTokens).toBe(true);

    const claimableOnly = buildV2ProfileView({
      roles: [approver],
      memberships: [membership({ id: NATIVE_ROLE_ID, name: 'Approver', claimable: true })],
    });
    expect(claimableOnly.canApproveRequests).toBe(false);
    expect(claimableOnly.canRequestTokens).toBe(false);
  });

  it('separates partial vouch progress from roles already available to claim', () => {
    const role = subject({
      id: NATIVE_ROLE_ID,
      name: 'Steward',
      vouchConfig: { enabled: true, quorum: 3 },
    });
    const partial = membership({
      id: NATIVE_ROLE_ID,
      name: 'Steward',
      vouchCount: 2,
      subject: { subjectId: NATIVE_ROLE_ID, name: 'Steward', vouchConfig: { quorum: 3 } },
    });
    const view = buildV2ProfileView({ roles: [role], memberships: [partial] });
    expect(view.progressionItems).toMatchObject([
      { current: 2, quorum: 3, isComplete: false, role: { name: 'Steward' } },
    ]);
    expect(view.claimableRoles).toEqual([]);

    const complete = buildV2ProfileView({
      roles: [role],
      memberships: [{ ...partial, claimable: true, vouchMet: true, eligibilitySource: 'VouchQuorum' }],
      claimableMemberships: [{
        ...partial,
        claimable: true,
        vouchMet: true,
        eligibilitySource: 'VouchQuorum',
        badge: 'Vouched for',
      }],
    });
    expect(complete.progressionItems).toEqual([]);
    expect(complete.claimableRoles[0]).toMatchObject({ name: 'Steward', claimLabel: 'Vouched for' });
  });

  it('never presents retained vouches as progress when an explicit ban wins the fold', () => {
    const role = subject({
      id: NATIVE_ROLE_ID,
      name: 'Steward',
      vouchConfig: { enabled: true, quorum: 3 },
    });
    const banned = membership({
      id: NATIVE_ROLE_ID,
      name: 'Steward',
      vouchCount: 3,
      vouchMet: true,
      ruleKind: 'Ban',
      eligibilitySource: 'ExplicitBan',
      subject: { subjectId: NATIVE_ROLE_ID, name: 'Steward', vouchConfig: { quorum: 3 } },
    });

    const view = buildV2ProfileView({ roles: [role], memberships: [banned] });
    expect(view.progressionItems).toEqual([]);
    expect(view.claimableRoles).toEqual([]);
  });
});
