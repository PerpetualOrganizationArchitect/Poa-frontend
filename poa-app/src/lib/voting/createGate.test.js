/**
 * createGate — the "who may open a vote" fold, both access systems.
 *
 * The v2 half runs its subjects through the REAL `normalizeAuthoritySubjects` transform rather
 * than hand-rolling `permEffective`, so the group-inheritance case proves the actual pipeline
 * (perm rows -> decode -> foldGroupPerms) and not a fixture that agrees with itself.
 */

import { describe, it, expect } from 'vitest';
import {
  foldCreateGate,
  subjectsHoldingPerm,
  subjectHoldsPerm,
  CREATE_GATE_SOURCE,
} from './createGate';
import { normalizeAuthoritySubjects } from '@/lib/accessV2/normalize';
import {
  PERM_KEYS,
  boolPermWord,
  GLOBAL_CTX,
  foldTag,
} from '@/lib/accessV2/permKeys';
import { composeSubjectId } from '@/lib/accessV2/ids';
import {
  AUTHORITY_ADDRESS,
  MEMBERS_ID,
  EXECS_ID,
  EVERYONE_GROUP_ID,
} from '@/lib/accessV2/fixtures';

const HYBRID = '0xhybrid';
const DD = '0xdd';

/** A NATIVE role created after cutover — it has no legacy hat id at all. */
const STEWARDS_ID = composeSubjectId(AUTHORITY_ADDRESS, 7);

const permRow = (subjectId, key, enabled = true) => ({
  id: `${subjectId}-${key}`,
  permKey: key,
  ctx: GLOBAL_CTX,
  isGlobalCtx: true,
  foldTag: foldTag(key),
  word: boolPermWord(enabled),
});

const composition = (groupId, roleId) => ({
  id: `${groupId}-${roleId}`,
  groupSubjectId: groupId,
  roleSubjectId: roleId,
  isActive: true,
});

const rawSubject = (id, kind, name, perms = [], wiring = {}) => ({
  id,
  subjectId: id,
  kind,
  name,
  metadataCID: null,
  imageURI: '',
  maxMembers: 0,
  memberCount: 1,
  activeMemberCount: 1,
  defaultAllow: false,
  isLegacyAdopted: kind === 'Role',
  createdAt: '1749000000',
  vouchConfig: null,
  managerConfig: null,
  perms,
  memberRoles: wiring.memberRoles || [],
  groups: wiring.groups || [],
});

const role = (id, name, perms, wiring) => rawSubject(id, 'Role', name, perms, wiring);
const group = (id, name, perms, wiring) => rawSubject(id, 'Group', name, perms, wiring);

/** Members + Executives, neither in a group; Executives may open a binding vote. */
function execsCanOpenBinding() {
  return normalizeAuthoritySubjects([
    role(MEMBERS_ID, 'Members', []),
    role(EXECS_ID, 'Executives', [permRow(EXECS_ID, PERM_KEYS.HV_CREATE)]),
  ]).subjects;
}

/** The permission parked on an "Everyone" GROUP that both roles are in. */
function groupCarriesPollCreate() {
  return normalizeAuthoritySubjects([
    role(MEMBERS_ID, 'Members', [], {
      groups: [composition(EVERYONE_GROUP_ID, MEMBERS_ID)],
    }),
    role(EXECS_ID, 'Executives', [], {
      groups: [composition(EVERYONE_GROUP_ID, EXECS_ID)],
    }),
    group(EVERYONE_GROUP_ID, 'Everyone', [permRow(EVERYONE_GROUP_ID, PERM_KEYS.DD_CREATE)], {
      memberRoles: [
        composition(EVERYONE_GROUP_ID, MEMBERS_ID),
        composition(EVERYONE_GROUP_ID, EXECS_ID),
      ],
    }),
  ]).subjects;
}

const legacyInput = (over = {}) => ({
  authorityEnabled: false,
  legacyBindingCreatorHatIds: [],
  legacyPollCreatorHatIds: [],
  userHatIds: [],
  hasMemberRole: false,
  legacyLoading: false,
  hasHybrid: true,
  hasPolls: true,
  ...over,
});

const v2Input = (over = {}) => ({
  authorityEnabled: true,
  subjects: [],
  mySubjectIds: [],
  hasMemberRole: false,
  legacyLoading: false,
  v2Loading: false,
  hasHybrid: true,
  hasPolls: true,
  ...over,
});

// ── LEGACY PARITY ───────────────────────────────────────────────────────────────────────────────

describe('foldCreateGate — legacy org (authorityEnabled: false)', () => {
  it('reports the legacy source and never claims to be authority-gated', () => {
    const g = foldCreateGate(legacyInput());
    expect(g.source).toBe(CREATE_GATE_SOURCE.LEGACY);
    expect(g.authorityGated).toBe(false);
  });

  it('fails OPEN to plain membership while the org query is in flight', () => {
    const g = foldCreateGate(legacyInput({
      legacyLoading: true,
      hasMemberRole: true,
      legacyBindingCreatorHatIds: ['10'],
      legacyPollCreatorHatIds: ['10'],
      userHatIds: ['999'], // wears none of them
    }));
    expect(g.canCreateProposal).toBe(true);
    expect(g.canCreatePoll).toBe(true);
    expect(g.creatorGateLoading).toBe(true);
    expect(g.creatorGateSettled).toBe(false);
  });

  it('fails OPEN to plain membership when the creator set is empty', () => {
    const g = foldCreateGate(legacyInput({ hasMemberRole: true }));
    expect(g.canCreateProposal).toBe(true);
    expect(g.canCreatePoll).toBe(true);
    expect(g.canCreateAny).toBe(true);
    // The hedge does NOT invent creator ids — copy has to see the empty set.
    expect(g.bindingCreatorHatIds).toEqual([]);
    expect(g.creatorGateSettled).toBe(true);
  });

  it('intersects the creator hats with the hats the viewer wears', () => {
    const g = foldCreateGate(legacyInput({
      hasMemberRole: true,
      legacyBindingCreatorHatIds: ['10', '20'],
      legacyPollCreatorHatIds: ['30'],
      userHatIds: ['20'],
    }));
    expect(g.canCreateProposal).toBe(true);
    expect(g.canCreatePoll).toBe(false);
    expect(g.canCreateAny).toBe(true);
  });

  it('compares hat ids across hex / decimal representations', () => {
    const g = foldCreateGate(legacyInput({
      hasMemberRole: true,
      legacyBindingCreatorHatIds: ['0x14'],
      userHatIds: ['20'],
      hasPolls: false,
    }));
    expect(g.canCreateProposal).toBe(true);
  });

  it('requires legacy membership even when the viewer wears a creator hat', () => {
    const g = foldCreateGate(legacyInput({
      hasMemberRole: false,
      legacyBindingCreatorHatIds: ['10'],
      userHatIds: ['10'],
    }));
    expect(g.canCreateProposal).toBe(false);
    expect(g.isMember).toBe(false);
  });

  it('is false for a contract the org never deployed, whatever the hats say', () => {
    const g = foldCreateGate(legacyInput({
      hasMemberRole: true,
      hasHybrid: false,
      legacyBindingCreatorHatIds: ['10'],
      userHatIds: ['10'],
    }));
    expect(g.canCreateProposal).toBe(false);
    expect(g.hasBinding).toBe(false);
    expect(g.canCreatePoll).toBe(true);
  });

  it('returns the creator arrays verbatim and mirrors the org read failure onto both tracks', () => {
    const binding = ['10'];
    const poll = ['20'];
    const g = foldCreateGate(legacyInput({
      legacyBindingCreatorHatIds: binding,
      legacyPollCreatorHatIds: poll,
      legacyReadFailed: true,
    }));
    expect(g.bindingCreatorHatIds).toBe(binding);
    expect(g.pollCreatorHatIds).toBe(poll);
    expect(g.bindingReadFailed).toBe(true);
    expect(g.pollReadFailed).toBe(true);
  });

  it('IGNORES every v2 input — the feature gate is the whole contract of useOrgAuthority', () => {
    const subjects = execsCanOpenBinding();
    const withV2 = foldCreateGate(legacyInput({
      hasMemberRole: true,
      legacyBindingCreatorHatIds: ['10'],
      legacyPollCreatorHatIds: ['10'],
      userHatIds: ['10'],
      subjects,
      mySubjectIds: [MEMBERS_ID],
      v2Loading: true,
      v2ReadFailed: true,
    }));
    const withoutV2 = foldCreateGate(legacyInput({
      hasMemberRole: true,
      legacyBindingCreatorHatIds: ['10'],
      legacyPollCreatorHatIds: ['10'],
      userHatIds: ['10'],
    }));
    expect(withV2).toEqual(withoutV2);
  });
});

// ── ACCESS V2 ───────────────────────────────────────────────────────────────────────────────────

describe('foldCreateGate — access v2 org (authorityEnabled: true)', () => {
  it('grants a viewer who is an active member of a subject carrying HV_CREATE', () => {
    const g = foldCreateGate(v2Input({
      subjects: execsCanOpenBinding(),
      mySubjectIds: [EXECS_ID],
    }));
    expect(g.source).toBe(CREATE_GATE_SOURCE.AUTHORITY);
    expect(g.canCreateProposal).toBe(true);
    // Nothing carries DD_CREATE, and the read answered — so polls fail CLOSED, as on chain.
    expect(g.canCreatePoll).toBe(false);
    expect(g.canCreateAny).toBe(true);
  });

  it('denies a member of a subject that does NOT carry the key', () => {
    const g = foldCreateGate(v2Input({
      subjects: execsCanOpenBinding(),
      mySubjectIds: [MEMBERS_ID],
      hasMemberRole: true, // a legacy member flag must not rescue them
    }));
    expect(g.canCreateProposal).toBe(false);
    expect(g.canCreatePoll).toBe(false);
    expect(g.isMember).toBe(true);
  });

  it('denies a non-member outright', () => {
    const g = foldCreateGate(v2Input({
      subjects: execsCanOpenBinding(),
      mySubjectIds: [],
    }));
    expect(g.canCreateProposal).toBe(false);
    expect(g.isMember).toBe(false);
  });

  it('honours a REVOKE — an existing row whose value is zero grants nothing', () => {
    const subjects = normalizeAuthoritySubjects([
      role(EXECS_ID, 'Executives', [permRow(EXECS_ID, PERM_KEYS.HV_CREATE, false)]),
    ]).subjects;
    const g = foldCreateGate(v2Input({ subjects, mySubjectIds: [EXECS_ID] }));
    expect(g.canCreateProposal).toBe(false);
    expect(g.bindingCreatorHatIds).toEqual([]);
    // Settled + empty is a real permission claim, not a hedge: only a passed vote can create.
    expect(g.creatorGateSettled).toBe(true);
  });

  it('inherits a permission parked on a GROUP the viewer’s role belongs to', () => {
    const subjects = groupCarriesPollCreate();
    const g = foldCreateGate(v2Input({
      subjects,
      mySubjectIds: [MEMBERS_ID], // the viewer holds a ROLE, never the group itself
      hasHybrid: false,
    }));
    expect(g.canCreatePoll).toBe(true);
    // Copy names ROLES; both roles inherit, and the group is not offered as one of them.
    expect(g.pollCreatorHatIds.sort()).toEqual([MEMBERS_ID, EXECS_ID].sort());
    expect(g.pollCreatorHatIds).not.toContain(EVERYONE_GROUP_ID);
    // …but the full holder set names the group, for a surface that wants the source.
    expect(g.pollCreatorSubjectIds).toContain(EVERYONE_GROUP_ID);
  });

  it('resolves a role created AFTER cutover, which has no legacy hat id', () => {
    const subjects = normalizeAuthoritySubjects([
      role(MEMBERS_ID, 'Members', []),
      role(STEWARDS_ID, 'Stewards', [permRow(STEWARDS_ID, PERM_KEYS.DD_CREATE)]),
    ]).subjects;
    const g = foldCreateGate(v2Input({
      subjects,
      mySubjectIds: [STEWARDS_ID],
      hasHybrid: false,
    }));
    expect(g.canCreatePoll).toBe(true);
    expect(g.pollCreatorHatIds).toEqual([STEWARDS_ID]);
  });

  it('fails OPEN to plain membership while the v2 reads are in flight', () => {
    const g = foldCreateGate(v2Input({
      subjects: execsCanOpenBinding(),
      mySubjectIds: [],
      hasMemberRole: true,
      v2Loading: true,
    }));
    expect(g.canCreateProposal).toBe(true);
    expect(g.canCreatePoll).toBe(true);
    expect(g.creatorGateLoading).toBe(true);
    expect(g.creatorGateSettled).toBe(false);
    // The hedge must never leak into copy — an unsettled read describes nothing.
    expect(g.bindingCreatorHatIds).toEqual([]);
    expect(g.pollCreatorSubjectIds).toEqual([]);
  });

  it('fails OPEN when the subjects read answered with nothing at all', () => {
    const g = foldCreateGate(v2Input({ subjects: [], hasMemberRole: true }));
    expect(g.canCreateProposal).toBe(true);
    expect(g.creatorGateSettled).toBe(false);
  });

  it('locks nobody out but claims nothing when the read fails', () => {
    const g = foldCreateGate(v2Input({
      subjects: [],
      hasMemberRole: true,
      v2ReadFailed: true,
    }));
    expect(g.bindingReadFailed).toBe(true);
    expect(g.pollReadFailed).toBe(true);
    expect(g.canCreateAny).toBe(true);
    expect(g.creatorGateSettled).toBe(false);
  });

  it('treats an authority membership as membership, with no legacy hat', () => {
    const g = foldCreateGate(v2Input({
      subjects: execsCanOpenBinding(),
      mySubjectIds: [EXECS_ID],
      hasMemberRole: false,
    }));
    expect(g.isMember).toBe(true);
  });

  it('still returns false for a contract the org never deployed', () => {
    const g = foldCreateGate(v2Input({
      subjects: execsCanOpenBinding(),
      mySubjectIds: [EXECS_ID],
      hasHybrid: false,
      hasPolls: false,
    }));
    expect(g.canCreateProposal).toBe(false);
    expect(g.canCreatePoll).toBe(false);
    expect(g.canCreateAny).toBe(false);
  });

  it('carries poContextLoading into creatorGateLoading (the contract addresses come from there)', () => {
    const g = foldCreateGate(v2Input({
      subjects: execsCanOpenBinding(),
      mySubjectIds: [EXECS_ID],
      legacyLoading: true,
    }));
    expect(g.creatorGateLoading).toBe(true);
    expect(g.creatorGateSettled).toBe(false);
  });
});

describe('subjectHoldsPerm', () => {
  it('prefers the group-folded effective value', () => {
    const subjects = groupCarriesPollCreate();
    const members = subjects.find((s) => s.subjectId === MEMBERS_ID);
    expect(subjectHoldsPerm(members, PERM_KEYS.DD_CREATE)).toBe(true);
    // Its OWN rows carry nothing — that is exactly the case a pre-fold read gets wrong.
    expect(members.permGlobal(PERM_KEYS.DD_CREATE)).toBeNull();
  });

  it('degrades to own rows for a subject that never went through the fold', () => {
    const preFold = {
      subjectId: EXECS_ID,
      permGlobal: (key) => (key === PERM_KEYS.HV_CREATE
        ? { exists: true, enabled: true, value: '1' }
        : null),
    };
    expect(subjectHoldsPerm(preFold, PERM_KEYS.HV_CREATE)).toBe(true);
    expect(subjectHoldsPerm(preFold, PERM_KEYS.DD_CREATE)).toBe(false);
  });

  it('never throws on a malformed subject', () => {
    expect(subjectHoldsPerm(null, PERM_KEYS.HV_CREATE)).toBe(false);
    expect(subjectHoldsPerm({}, PERM_KEYS.HV_CREATE)).toBe(false);
    expect(subjectsHoldingPerm(null, PERM_KEYS.HV_CREATE)).toEqual([]);
  });
});
