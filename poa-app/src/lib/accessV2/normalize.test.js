/**
 * The hook transform, end to end, over a response shaped VERBATIM like the access-v2 subgraph's.
 * This is the closest thing this repo has to a hook test — the hooks are `useQuery` + this.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeAuthoritySubjects,
  normalizeAuthorityMemberships,
  normalizeMyMemberships,
  attachPerms,
} from './normalize';
import { PERM_KEYS, GLOBAL_CTX } from './permKeys';
import {
  subjectsResponse,
  membersSubject,
  everyoneGroup,
  execsSubject,
  MEMBERS_ID,
  EXECS_ID,
  EVERYONE_GROUP_ID,
  aliceMembership,
  bobExecMembership,
  carolOffer,
} from './fixtures';

const run = () => normalizeAuthoritySubjects(subjectsResponse().membershipAuthorityContract.subjects);

describe('normalizeAuthoritySubjects', () => {
  it('splits roles from groups', () => {
    const { roles, groups } = run();
    expect(roles.map((r) => r.name)).toEqual(['Members', 'Executives']);
    expect(groups.map((g) => g.name)).toEqual(['Everyone']);
  });

  it('wires group composition both ways from a single de-duped flat list', () => {
    // The query returns every composition row twice (once per side of the relation).
    const { roles, groups, compositions } = run();
    expect(compositions.length).toBe(4);
    expect(groups[0].memberRoleIds).toEqual([MEMBERS_ID, EXECS_ID]);
    expect(roles[0].groupIds).toEqual([EVERYONE_GROUP_ID]);
  });

  it('decodes perm rows and derives the legacy canVote flag from DD_VOTE', () => {
    const { roles } = run();
    const members = roles.find((r) => r.subjectId === MEMBERS_ID);
    expect(members.canVote).toBe(true);
    expect(members.permRows[0].keyName).toBe('DD_VOTE');
    expect(members.permRows[0].exists).toBe(true);
  });

  it('reads a group\'s TM_PERMS mask off the group subject, where it belongs', () => {
    const { groups } = run();
    expect(groups[0].taskMask).toBe('2');
  });

  it('normalises the manager config into "Executives manage Members"', () => {
    const { roles } = run();
    const members = roles.find((r) => r.subjectId === MEMBERS_ID);
    expect(members.managerConfig).toMatchObject({
      managerSubjectId: EXECS_ID,
      canGrant: true,
      canRemove: true,
      delaySecs: 172800,
      enabled: true,
    });
  });

  it('normalises the self-vouching config', () => {
    const { roles } = run();
    const execs = roles.find((r) => r.subjectId === EXECS_ID);
    expect(execs.vouchConfig).toMatchObject({ quorum: 2, enabled: true, selfVouching: true, epoch: '3' });
  });

  it('produces the legacy roleNames map and roleHatIds list', () => {
    const { roleNames, roleHatIds } = run();
    expect(roleNames[MEMBERS_ID]).toBe('Members');
    // Groups are NOT roles — roleHatIds must not sprout a group id into legacy consumers.
    expect(roleHatIds).toEqual([MEMBERS_ID, EXECS_ID]);
  });

  it('handles an empty authority without throwing', () => {
    expect(normalizeAuthoritySubjects([])).toMatchObject({ subjects: [], roles: [], groups: [] });
    expect(normalizeAuthoritySubjects(undefined).roles).toEqual([]);
  });

  it('survives a subject with no perms, no configs and no compositions', () => {
    const bare = { id: '99', subjectId: '99', kind: 'Role', name: 'Bare', maxMembers: 0, memberCount: 0, activeMemberCount: 0, defaultAllow: false, isLegacyAdopted: false, acceptedUsers: [] };
    const { roles } = normalizeAuthoritySubjects([bare]);
    expect(roles[0].permRows).toEqual([]);
    expect(roles[0].canVote).toBe(false);
    expect(roles[0].vouchConfig).toBeNull();
    expect(roles[0].managerConfig).toBeNull();
  });

  it('drops a removed composition row so a stale group link never renders', () => {
    const rows = subjectsResponse().membershipAuthorityContract.subjects.map((s) =>
      s.subjectId === EVERYONE_GROUP_ID
        ? { ...s, memberRoles: s.memberRoles.map((c) => ({ ...c, isActive: false })) }
        : { ...s, groups: (s.groups || []).map((c) => ({ ...c, isActive: false })) }
    );
    const { groups, roles } = normalizeAuthoritySubjects(rows);
    expect(groups[0].memberRoleIds).toEqual([]);
    expect(roles[0].groupIds).toEqual([]);
  });
});

describe('attachPerms', () => {
  it('a project-scoped row does not satisfy a GLOBAL flag lookup', () => {
    const subject = { subjectId: MEMBERS_ID };
    const projectOnly = attachPerms(subject, [
      {
        id: 'x',
        permKey: PERM_KEYS.DD_VOTE,
        ctx: `0x${'0'.repeat(62)}01`,
        isGlobalCtx: false,
        foldTag: 0,
        word: ((1n << 255n) | 1n).toString(),
      },
    ]);
    expect(projectOnly.canVote).toBe(false);
    expect(projectOnly.permRows[0].isGlobalCtx).toBe(false);
  });

  it('a cleared row (word 0) is present in history but grants nothing', () => {
    const s = attachPerms({ subjectId: '1' }, [
      { id: 'x', permKey: PERM_KEYS.DD_VOTE, ctx: GLOBAL_CTX, isGlobalCtx: true, foldTag: 0, word: '0' },
    ]);
    expect(s.permRows).toHaveLength(1);
    expect(s.canVote).toBe(false);
  });

  it('derives canCreateVote from either DD_CREATE or HV_CREATE', () => {
    const word = ((1n << 255n) | 1n).toString();
    const hv = attachPerms({ subjectId: '1' }, [
      { id: 'x', permKey: PERM_KEYS.HV_CREATE, ctx: GLOBAL_CTX, isGlobalCtx: true, foldTag: 0, word },
    ]);
    expect(hv.canCreateVote).toBe(true);
  });

  it('falls back to computing isGlobalCtx when the subgraph field is absent', () => {
    const s = attachPerms({ subjectId: '1' }, [
      { id: 'x', permKey: PERM_KEYS.DD_VOTE, ctx: GLOBAL_CTX, foldTag: 0, word: ((1n << 255n) | 1n).toString() },
    ]);
    expect(s.permRows[0].isGlobalCtx).toBe(true);
    expect(s.canVote).toBe(true);
  });
});

describe('group-held permissions land in the legacy projection', () => {
  // On chain the gate is `_hasPerm`, which folds every subject the user is a member of INCLUDING
  // GROUPS (a group's `_isMember` resolves through its member roles). A projection built from a
  // role's own rows alone reports canVote=false / taskMask='0' for the exact org shape v2 exists
  // for: permissions parked on a group, roles dropped into it.
  const groupWith = (key, value) => everyoneGroup({
    perms: [{
      id: 'g-perm',
      permKey: key,
      ctx: GLOBAL_CTX,
      isGlobalCtx: true,
      foldTag: Number(BigInt(key) >> 248n),
      word: ((1n << 255n) | BigInt(value)).toString(),
    }],
  });

  const withGroupPerm = (key, value = 1) => normalizeAuthoritySubjects([
    membersSubject({ perms: [] }),
    execsSubject({ perms: [] }),
    groupWith(key, value),
  ]);

  it('a role whose GROUP carries DD_VOTE reports canVote', () => {
    const { roles } = withGroupPerm(PERM_KEYS.DD_VOTE);
    expect(roles.map((r) => r.canVote)).toEqual([true, true]);
    // ...and the fold is honest about where it came from.
    expect(roles[0].ownCanVote).toBe(false);
    expect(roles[0].permViaGroup(PERM_KEYS.DD_VOTE)).toBe(true);
    expect(roles[0].permSources(PERM_KEYS.DD_VOTE)).toEqual([EVERYONE_GROUP_ID]);
  });

  it('a role whose GROUP carries HV_CREATE reports canCreateVote', () => {
    const { roles } = withGroupPerm(PERM_KEYS.HV_CREATE);
    expect(roles.every((r) => r.canCreateVote)).toBe(true);
    expect(roles.every((r) => r.ownCanCreateVote === false)).toBe(true);
  });

  it('TM_PERMS is OR-folded across the role and its groups, per the contract _fold', () => {
    // Role carries CLAIM(2), group carries REVIEW(4) → effective 6.
    const roleTm = {
      id: 'r-tm',
      permKey: PERM_KEYS.TM_PERMS,
      ctx: GLOBAL_CTX,
      isGlobalCtx: true,
      foldTag: 1,
      word: ((1n << 255n) | 2n).toString(),
    };
    const { roles } = normalizeAuthoritySubjects([
      membersSubject({ perms: [roleTm] }),
      execsSubject({ perms: [] }),
      groupWith(PERM_KEYS.TM_PERMS, 4),
    ]);
    const members = roles.find((r) => r.subjectId === MEMBERS_ID);
    const execs = roles.find((r) => r.subjectId === EXECS_ID);
    expect(members.taskMask).toBe('6'); // 2 | 4 — not "the role's own", not "the group's own"
    expect(members.ownTaskMask).toBe('2');
    expect(execs.taskMask).toBe('4');
  });

  it('the real fixture org: Executives holds nothing of its own but is in a group with TM_PERMS', () => {
    const { roles, groups } = run();
    const execs = roles.find((r) => r.subjectId === EXECS_ID);
    expect(execs.permRows).toEqual([]); // no own rows at all
    expect(execs.ownTaskMask).toBe('0');
    expect(execs.taskMask).toBe('2'); // via Everyone
    // The group itself is unchanged — its own rows ARE its permissions.
    expect(groups[0].taskMask).toBe('2');
    expect(groups[0].permViaGroup(PERM_KEYS.TM_PERMS)).toBe(false);
  });

  it('a role in NO group is unaffected', () => {
    const { roles } = normalizeAuthoritySubjects([membersSubject({ groups: [] })]);
    expect(roles[0].canVote).toBe(true); // its own DD_VOTE
    expect(roles[0].permViaGroup(PERM_KEYS.DD_VOTE)).toBe(false);
    expect(roles[0].taskMask).toBe('0');
  });

  it('an INACTIVE composition row does not leak the group’s permissions', () => {
    // Removal keeps the row for history with isActive: false — on BOTH sides of the relation.
    const inactive = (c) => ({ ...c, isActive: false });
    const group = groupWith(PERM_KEYS.DD_VOTE, 1);
    const { roles } = normalizeAuthoritySubjects([
      membersSubject({ perms: [], groups: (membersSubject().groups || []).map(inactive) }),
      { ...group, memberRoles: group.memberRoles.map(inactive) },
    ]);
    expect(roles[0].groupIds).toEqual([]);
    expect(roles[0].canVote).toBe(false);
  });

  it('relinks role.groups / group.memberRoles to the FOLDED objects', () => {
    const { roles, groups } = run();
    const execs = roles.find((r) => r.subjectId === EXECS_ID);
    expect(execs.groups[0].taskMask).toBe('2');
    expect(groups[0].memberRoles.map((r) => r.taskMask)).toEqual(['2', '2']);
  });
});

describe('fixtures are a faithful mirror of the schema', () => {
  it('BigInt fields come back as strings, Int fields as numbers, Bytes lowercased', () => {
    const m = membersSubject();
    expect(typeof m.subjectId).toBe('string');
    expect(typeof m.createdAt).toBe('string');
    expect(typeof m.memberCount).toBe('number');
    expect(typeof m.managerConfig.delaySecs).toBe('string');
    expect(everyoneGroup().perms[0].permKey).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('normalizeAuthorityMemberships', () => {
  const rows = () => [aliceMembership(), bobExecMembership(), carolOffer()];
  const wiring = () => run();

  it('attaches each row\'s rule so sticky is answerable from the row alone', () => {
    const { memberships } = normalizeAuthorityMemberships(rows(), wiring().compositions, wiring().groups);
    const bob = memberships.find((m) => m.subjectId === EXECS_ID && m.isMember);
    expect(bob.rule.sticky).toBe(true);
  });

  it('membersOf returns only ACTIVE members — a claimable seat is not a member', () => {
    const { membersOf } = normalizeAuthorityMemberships(rows(), wiring().compositions, wiring().groups);
    expect(membersOf(EXECS_ID)).toHaveLength(1);
    expect(membersOf(MEMBERS_ID)).toHaveLength(1);
    expect(membersOf('does-not-exist')).toEqual([]);
  });

  it('derives the group roster from the member roles', () => {
    const w = wiring();
    const { groupMembers } = normalizeAuthorityMemberships(rows(), w.compositions, w.groups);
    expect((groupMembers.get(EVERYONE_GROUP_ID) || []).length).toBe(2);
  });

  it('handles an org with no groups at all', () => {
    const { groupMembers } = normalizeAuthorityMemberships(rows(), [], []);
    expect(groupMembers.size).toBe(0);
  });
});

describe('normalizeMyMemberships', () => {
  it('splits held / claimable / blocked', () => {
    const banned = aliceMembership({
      id: 'banned', accepted: false, isMember: false, claimable: false, eligible: false,
      ruleKind: 'Ban', eligibilitySource: 'ExplicitBan',
      rule: { id: 'r', kind: 'Ban', author: 'Governance', delegable: true, sticky: false },
    });
    const v = normalizeMyMemberships([aliceMembership(), carolOffer(), banned]);
    expect(v.myRoles).toHaveLength(1);
    expect(v.claimable).toHaveLength(1);
    expect(v.blocked).toHaveLength(1);
  });

  it('claimable rows carry the WHY badge', () => {
    const v = normalizeMyMemberships([carolOffer()]);
    expect(v.claimable[0].badge).toBe('Invited');
  });

  it('isMemberOf answers from the rows, not from a separate call', () => {
    const v = normalizeMyMemberships([aliceMembership()]);
    expect(v.isMemberOf(MEMBERS_ID)).toBe(true);
    expect(v.isMemberOf(EXECS_ID)).toBe(false);
  });

  it('is empty-safe', () => {
    expect(normalizeMyMemberships([]).myRoles).toEqual([]);
    expect(normalizeMyMemberships(undefined).claimable).toEqual([]);
  });
});
