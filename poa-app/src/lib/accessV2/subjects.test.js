import { describe, it, expect } from 'vitest';
import {
  normalizeSubject,
  normalizeMaxMembers,
  normalizeSubjects,
  splitSubjects,
  indexGroupCompositions,
  attachGroups,
  deriveGroupMembers,
  groupChangeBlastRadius,
  findSubject,
  subjectNameMap,
} from './subjects';
import { normalizeMemberships } from './memberships';
import {
  subjectsResponse,
  membersSubject,
  execsSubject,
  everyoneGroup,
  aliceMembership,
  bobExecMembership,
  carolOffer,
  MEMBERS_ID,
  EXECS_ID,
  EVERYONE_GROUP_ID,
  ALICE,
  BOB,
} from './fixtures';

const allSubjects = () => normalizeSubjects(subjectsResponse().membershipAuthorityContract.subjects);
const allCompositions = () =>
  subjectsResponse().membershipAuthorityContract.subjects.flatMap((s) => [
    ...(s.memberRoles || []),
    ...(s.groups || []),
  ]);

describe('normalizeSubject', () => {
  it('renders activeMemberCount, not the accepted count', () => {
    // memberCount mirrors accepted flips; activeMemberCount is the fold mirror (accepted &&
    // eligible). Rendering the former would show lapsed members as present.
    const s = normalizeSubject(membersSubject({ memberCount: 5, activeMemberCount: 2 }));
    expect(s.memberCount).toBe(2);
    expect(s.acceptedCount).toBe(5);
  });

  it('keeps the legacy-compatible projection so hatId consumers keep working', () => {
    const s = normalizeSubject(membersSubject());
    expect(s.hatId).toBe(MEMBERS_ID);
    expect(s.image).toBe('ipfs://members.png');
    expect(s.isLegacyAdopted).toBe(true);
  });

  it('never gives a GROUP a seat limit (setMaxMembers on a group reverts on chain)', () => {
    const g = normalizeSubject(everyoneGroup({ maxMembers: 0 }));
    expect(g.isGroup).toBe(true);
    expect(g.maxMembers).toBeNull();
    expect(g.unlimitedSeats).toBe(true);
  });

  it('marks a default-ALLOW subject as open', () => {
    expect(normalizeSubject(membersSubject()).isOpen).toBe(true);
    expect(normalizeSubject(execsSubject()).isOpen).toBe(false);
  });

  it('normalises both legacy encodings of an unlimited seat cap', () => {
    // Decentral Park's adopted Agent hat is uint32.max on chain. The deployed subgraph exposes
    // that through a signed GraphQL Int as -1; neither representation may render as a seat count.
    expect(normalizeMaxMembers(-1)).toEqual({ maxMembers: 0, unlimitedSeats: true });
    expect(normalizeMaxMembers(4294967295)).toEqual({ maxMembers: 0, unlimitedSeats: true });
    expect(normalizeSubject(execsSubject({ maxMembers: -1 }))).toMatchObject({
      maxMembers: 0,
      unlimitedSeats: true,
    });
  });

  it('restores other signed GraphQL Int values to their uint32 seat cap', () => {
    expect(normalizeMaxMembers(-2)).toEqual({ maxMembers: 4294967294, unlimitedSeats: false });
  });

  it('drops an unusable row instead of throwing', () => {
    expect(normalizeSubject(null)).toBeNull();
    expect(normalizeSubject({ id: 'garbage' })).toBeNull();
    expect(normalizeSubjects([null, { id: 'x' }, membersSubject()])).toHaveLength(1);
  });
});

describe('group composition', () => {
  it('indexes active rows both ways and de-dupes the two sides of the relation', () => {
    const { rolesByGroup, groupsByRole } = indexGroupCompositions(allCompositions());
    expect(rolesByGroup.get(EVERYONE_GROUP_ID)).toEqual([MEMBERS_ID, EXECS_ID]);
    expect(groupsByRole.get(MEMBERS_ID)).toEqual([EVERYONE_GROUP_ID]);
  });

  it('ignores removed rows (kept with isActive:false for history)', () => {
    const rows = allCompositions().map((c) =>
      c.roleSubjectId === EXECS_ID ? { ...c, isActive: false } : c
    );
    const { rolesByGroup } = indexGroupCompositions(rows);
    expect(rolesByGroup.get(EVERYONE_GROUP_ID)).toEqual([MEMBERS_ID]);
  });

  it('attaches groups to roles and member-roles to groups', () => {
    const attached = attachGroups(allSubjects(), allCompositions());
    const members = findSubject(attached, MEMBERS_ID);
    const group = findSubject(attached, EVERYONE_GROUP_ID);
    expect(members.groupIds).toEqual([EVERYONE_GROUP_ID]);
    expect(members.memberRoleIds).toEqual([]);
    expect(group.memberRoles.map((r) => r.name)).toEqual(['Members', 'Executives']);
  });
});

describe('deriveGroupMembers — groups are NOT tokens', () => {
  const memberships = () =>
    normalizeMemberships([aliceMembership(), bobExecMembership(), carolOffer()]);

  it('a user is in the group iff they are an ACTIVE member of >=1 member-role', () => {
    const { rolesByGroup } = indexGroupCompositions(allCompositions());
    const derived = deriveGroupMembers(EVERYONE_GROUP_ID, rolesByGroup, memberships());
    expect(derived.sort()).toEqual([ALICE, BOB].sort());
  });

  it('excludes a claimable-but-not-accepted seat', () => {
    const { rolesByGroup } = indexGroupCompositions(allCompositions());
    const derived = deriveGroupMembers(EVERYONE_GROUP_ID, rolesByGroup, memberships());
    expect(derived).not.toContain(carolOffer().user);
  });

  it('returns nothing for a group with no roles', () => {
    expect(deriveGroupMembers('999', new Map(), memberships())).toEqual([]);
  });
});

describe('splitSubjects / lookups / copy', () => {
  it('splits roles from groups', () => {
    const { roles, groups } = splitSubjects(allSubjects());
    expect(roles.map((r) => r.name)).toEqual(['Members', 'Executives']);
    expect(groups.map((g) => g.name)).toEqual(['Everyone']);
  });

  it('produces the legacy hatId -> name map shape', () => {
    expect(subjectNameMap(allSubjects())[EXECS_ID]).toBe('Executives');
  });

  it('spells out the blast radius of a group permission change', () => {
    const attached = attachGroups(allSubjects(), allCompositions());
    const copy = groupChangeBlastRadius(findSubject(attached, EVERYONE_GROUP_ID));
    expect(copy).toContain('Members, Executives');
    expect(copy).toContain('all at once');
  });

  it('says so when a group is still empty', () => {
    expect(groupChangeBlastRadius({ memberRoles: [] })).toContain('no roles in it yet');
  });
});
