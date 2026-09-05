/**
 * Every emitted call is decoded back through the REAL ABIs — `authorityInterface` (built from
 * `abi/MembershipAuthority.json`), TaskManager's `setConfig(uint8,bytes)` and HybridVoting's
 * `addHatToClass` fragment — never against a hand-written copy of what we hope was encoded. A
 * signature drift has to fail HERE, because on chain it fails inside `announceWinner`'s try/catch
 * where nobody ever sees it.
 */

import { describe, it, expect } from 'vitest';
import { utils, constants } from 'ethers';
import {
  buildRoleFormBatch,
  defaultRoleForm,
  normalizeRoleForm,
  roleFormError,
  roleFormCopy,
  roleConfigToRoleForm,
  resolveRoleForm,
  resolveBindingClassIdx,
  effectiveMaxMembers,
  classByIndex,
  ROLE_FORM_KIND,
} from './roleFormBatch';
import { authorityInterface } from './txBuilders';
import { projectCtx, estimateBatchGas } from './proposalBuilders';
import { predictNextSubjectId } from './ids';
import { PERM_KEYS, GLOBAL_CTX, decodePermWord } from './permKeys';
import { MAX_SPONSORED_CALLS } from './submission';
import { hybridVotingClassInterface } from '@/lib/voting/votingClasses';
import { AUTHORITY_ADDRESS as A, ALICE, BOB, MEMBERS_ID, EXECS_ID, EVERYONE_GROUP_ID } from './fixtures';

const HYBRID = '0xf642dde77848dc195c8089f4042a311ed650d7a6';
const TASK_MANAGER = '0x3d93f0d090356d25e7a1614f0f8764b103ca99bc';

const indexedSubjects = [
  { subjectId: MEMBERS_ID },
  { subjectId: EXECS_ID },
  { subjectId: EVERYONE_GROUP_ID },
];

/** Test6's shape: a DIRECT class at 80% and a PARTICIPATION class at 20%. */
const votingClasses = [
  { classIndex: 0, strategy: 'DIRECT', slicePct: 80, hatIds: [MEMBERS_ID, EXECS_ID] },
  { classIndex: 1, strategy: 'PARTICIPATION', slicePct: 20, hatIds: [MEMBERS_ID, EXECS_ID] },
];

const taskManagerInterface = new utils.Interface(['function setConfig(uint8 key, bytes value)']);

const decode = (batch) =>
  batch.map((c) => {
    const parsed = authorityInterface.parseTransaction({ data: c.data });
    return { name: parsed.name, args: parsed.args, target: c.target };
  });
const names = (batch) => decode(batch).map((c) => c.name);
const authorityCalls = (batch) => batch.filter((c) => c.target === A);

/** The Treasurer-shaped role: DD_VOTE + HV_CREATE + task CLAIM, 5 seats, a vote, one member. */
const treasurerForm = {
  kind: 'role',
  name: 'Treasurer',
  description: 'Looks after the money',
  imageURI: 'ipfs://img',
  limitSeats: true,
  maxMembers: 5,
  perms: { DD_VOTE: true, HV_CREATE: true, TM_PERMS: 2 },
  bindingVote: true,
  bindingClassIdx: 0,
  holders: [{ address: ALICE, name: 'Alice' }],
};

const build = (form = treasurerForm, overrides = {}) =>
  buildRoleFormBatch({
    authority: A,
    hybridVoting: HYBRID,
    taskManagerAddress: TASK_MANAGER,
    indexedSubjects,
    inOrgUsers: new Set([ALICE]),
    votingClasses,
    form,
    ...overrides,
  });

describe('the form shape', () => {
  it('never hands out the same nested object twice', () => {
    const a = defaultRoleForm();
    const b = defaultRoleForm();
    a.vouching.quorum = 9;
    a.holders.push({ address: ALICE });
    expect(b.vouching.quorum).toBe(1);
    expect(b.holders).toHaveLength(0);
  });

  it('merges a partial form over the defaults without losing nested keys', () => {
    const f = normalizeRoleForm({ name: 'X', vouching: { enabled: true } });
    expect(f.vouching).toEqual({ enabled: true, quorum: 1, voucherSubjectId: '', selfVouch: false });
    expect(f.kind).toBe('role');
  });

  it('treats "no seat limit" and a limit of 0 as the same on-chain 0', () => {
    expect(effectiveMaxMembers({ limitSeats: false, maxMembers: 9 })).toBe(0);
    expect(effectiveMaxMembers({ limitSeats: true, maxMembers: 0 })).toBe(0);
    expect(effectiveMaxMembers({ limitSeats: true, maxMembers: 5 })).toBe(5);
    // A group has no seats at all.
    expect(effectiveMaxMembers({ kind: 'group', limitSeats: true, maxMembers: 5 })).toBe(0);
  });
});

describe('roleFormError', () => {
  it('asks for a name, in the language of the thing being made', () => {
    expect(roleFormError({})).toBe('Give the new role a name.');
    expect(roleFormError({ kind: 'group' })).toBe('Give the new group a name.');
    expect(roleFormError({ name: '   ' })).toBe('Give the new role a name.');
  });

  it('passes a filled-in role and a filled-in group', () => {
    expect(roleFormError(treasurerForm)).toBeNull();
    expect(roleFormError({ kind: 'group', name: 'Stewards', memberRoleIds: [MEMBERS_ID] })).toBeNull();
    // An empty group is legal on chain — roles can be added later.
    expect(roleFormError({ kind: 'group', name: 'Stewards' })).toBeNull();
  });

  it('refuses a seat limit that is negative, over uint32, or not a number', () => {
    for (const maxMembers of [-1, 'abc', undefined, 4294967296]) {
      expect(roleFormError({ name: 'X', limitSeats: true, maxMembers }))
        .toBe('The seat limit must be 0 (no limit) or more.');
    }
    expect(roleFormError({ name: 'X', limitSeats: true, maxMembers: 4294967295 })).toBeNull();
  });

  it('needs a voucher role unless the role vouches for itself', () => {
    const vouching = { enabled: true, quorum: 2, voucherSubjectId: '', selfVouch: false };
    expect(roleFormError({ name: 'X', vouching }))
      .toBe('Pick the role whose members can vouch, or let the new role vouch for itself.');
    expect(roleFormError({ name: 'X', vouching: { ...vouching, selfVouch: true } })).toBeNull();
    expect(roleFormError({ name: 'X', vouching: { ...vouching, voucherSubjectId: EXECS_ID } })).toBeNull();
    expect(roleFormError({ name: 'X', vouching: { ...vouching, quorum: 0 } }))
      .toBe('Vouching needs at least 1 vouch.');
  });

  it('catches a bad or repeated address before the batch is built', () => {
    expect(roleFormError({ name: 'X', holders: [{ address: '0x123', name: 'Ann' }] }))
      .toBe('"Ann" has an invalid address.');
    // The same person from two different pickers: one lowercased row, one checksummed.
    expect(roleFormError({ name: 'X', holders: [{ address: ALICE }, { address: utils.getAddress(ALICE) }] }))
      .toMatch(/listed twice/);
  });

  it('gates the project rows and the voting-class pick', () => {
    expect(roleFormError({ name: 'X', projectPerms: [{ projectId: '', mask: 1 }] }))
      .toBe('Pick a project for each project-permission row, or remove the row.');
    expect(roleFormError({ name: 'X', projectPerms: [{ projectId: '1', mask: 1 }, { projectId: '1', mask: 2 }] }))
      .toBe('Each project can only appear once in the permissions list.');
    expect(roleFormError({ name: 'X', bindingVote: true, bindingClassIdx: null }))
      .toBe('Pick which group of voters this role joins.');
    expect(roleFormError({ name: 'X', bindingVote: true, bindingClassIdx: 0 })).toBeNull();
  });

  it('ignores the role-only rules on a group', () => {
    // A group carries no seats, no vouching and no people, so stale answers can't block it.
    expect(roleFormError({
      kind: 'group',
      name: 'Stewards',
      limitSeats: true,
      maxMembers: -5,
      vouching: { enabled: true, quorum: 0 },
      holders: [{ address: '0xnope' }],
    })).toBeNull();
  });
});

describe('buildRoleFormBatch — a role with everything on', () => {
  it('creates the role through the authority, with the seat cap and the image', () => {
    const { batch, predictedSubjectId, kind } = build();
    expect(kind).toBe('role');
    expect(names(authorityCalls(batch))[0]).toBe('createRole');
    const [name, metadataCID, imageURI, maxMembers] = decode(authorityCalls(batch))[0].args;
    expect(name).toBe('Treasurer');
    expect(metadataCID).toBe(constants.HashZero);
    expect(imageURI).toBe('ipfs://img');
    expect(Number(maxMembers)).toBe(5);
    expect(predictedSubjectId).toBe(predictNextSubjectId(A, indexedSubjects));
  });

  it('carries the description’s IPFS CID in the CREATE call — no second metadata write', () => {
    const cid = `0x${'ab'.repeat(32)}`;
    const { batch } = build(treasurerForm, { metadataCID: cid });
    expect(decode(authorityCalls(batch))[0].args[1]).toBe(cid);
    expect(names(authorityCalls(batch))).not.toContain('renameSubject');
  });

  it('writes DD_VOTE, HV_CREATE and the task mask as perm rows at the global ctx', () => {
    const { batch, predictedSubjectId } = build();
    const rows = decode(authorityCalls(batch)).filter((c) => c.name === 'setPerm');
    const byKey = (key) => rows.find((r) => r.args[1].toLowerCase() === key.toLowerCase());

    for (const key of [PERM_KEYS.DD_VOTE, PERM_KEYS.HV_CREATE]) {
      const row = byKey(key);
      expect(row, key).toBeTruthy();
      expect(row.args[0].toString()).toBe(predictedSubjectId);
      expect(row.args[2]).toBe(GLOBAL_CTX);
      expect(decodePermWord(row.args[3]).enabled).toBe(true);
    }
    expect(decodePermWord(byKey(PERM_KEYS.TM_PERMS).args[3]).value).toBe('2');

    // The legacy calls are gone entirely on a v2 org.
    const legacyHv = new utils.Interface(['function setCreatorHatAllowed(uint256 h, bool ok)']);
    expect(batch.some((c) => c.data.startsWith(legacyHv.getSighash('setCreatorHatAllowed')))).toBe(false);
  });

  it('writes a per-project task row at the W4 (+1) ctx, inheriting the global mask', () => {
    const { batch } = build({ ...treasurerForm, projectPerms: [{ projectId: `${TASK_MANAGER}-4`, mask: 3 }] });
    const row = decode(authorityCalls(batch))
      .filter((c) => c.name === 'setPerm')
      .find((r) => r.args[2] !== GLOBAL_CTX);
    expect(row.args[1].toLowerCase()).toBe(PERM_KEYS.TM_PERMS.toLowerCase());
    expect(row.args[2]).toBe(projectCtx(`${TASK_MANAGER}-4`));
    expect(decodePermWord(row.args[3]).value).toBe('3');
    expect(decodePermWord(row.args[3]).inheritGlobal).toBe(true);
  });

  it('keeps the two TaskManager grants that ARE still live on v2, keyed by the SUBJECT id', () => {
    const { batch, predictedSubjectId } = build({
      ...treasurerForm,
      canCreateTasks: true,
      canOrganizeFolders: true,
    });
    const tmCalls = batch.filter((c) => c.target === TASK_MANAGER);
    expect(tmCalls).toHaveLength(2);
    const decoded = tmCalls.map((c) => taskManagerInterface.parseTransaction({ data: c.data }));
    expect(decoded.map((d) => Number(d.args[0]))).toEqual([1, 7]); // CREATOR_HAT_ALLOWED, ORGANIZER_HAT_ALLOWED
    for (const d of decoded) {
      const [id, allowed] = utils.defaultAbiCoder.decode(['uint256', 'bool'], d.args[1]);
      expect(id.toString()).toBe(predictedSubjectId);
      expect(allowed).toBe(true);
    }
  });

  it('says so rather than silently dropping the task grants when there is no task manager', () => {
    const { batch, warnings } = build(
      { ...treasurerForm, canCreateTasks: true },
      { taskManagerAddress: '' }
    );
    expect(batch.some((c) => c.target === TASK_MANAGER)).toBe(false);
    expect(warnings.join(' ')).toMatch(/no task manager/i);
  });

  it('configures vouching, and points a self-vouching role at its own predicted id', () => {
    const withVouch = { ...treasurerForm, vouching: { enabled: true, quorum: 2, voucherSubjectId: EXECS_ID } };
    const vouchOf = (batch) => decode(authorityCalls(batch)).find((c) => c.name === 'configureVouchAttestor');

    const a = build(withVouch);
    expect(vouchOf(a.batch).args[0].toString()).toBe(a.predictedSubjectId);
    expect(Number(vouchOf(a.batch).args[1])).toBe(2);
    expect(vouchOf(a.batch).args[2].toString()).toBe(EXECS_ID);

    const b = build({ ...withVouch, vouching: { enabled: true, quorum: 1, selfVouch: true, voucherSubjectId: '' } });
    expect(vouchOf(b.batch).args[2].toString()).toBe(b.predictedSubjectId);
    // The contract's own lint, surfaced BEFORE the vote rather than as an event after it.
    expect(b.warnings.join(' ')).toMatch(/cannot bootstrap itself/i);
  });

  it('ADDS an initial holder who is in the org and INVITES one who is not', () => {
    const { batch } = build({
      ...treasurerForm,
      holders: [{ address: ALICE, name: 'Alice' }, { address: BOB, name: 'Bob' }],
    });
    const people = decode(authorityCalls(batch)).filter((c) => c.name === 'grant' || c.name === 'offer');
    expect(people.map((c) => c.name)).toEqual(['grant', 'offer']);
    expect(people[0].args[1].toLowerCase()).toBe(ALICE);
    expect(people[1].args[1].toLowerCase()).toBe(BOB);
    // delegable=true: someone put into a new role can still resign from it.
    expect(people[0].args[2]).toBe(true);
    expect(people[1].args[2]).toBe(true);
  });

  it('locks a seat to governance only when the member asked for it', () => {
    const { batch } = build({ ...treasurerForm, holders: [{ address: ALICE, sticky: true }] });
    const grant = decode(authorityCalls(batch)).find((c) => c.name === 'grant');
    expect(grant.args[2]).toBe(false);
  });

  it('is invite-only unless the role is explicitly opened, and joins the groups it was given', () => {
    expect(names(authorityCalls(build().batch))).not.toContain('setSubjectDefault');
    const opened = build({ ...treasurerForm, openRole: true, groupIds: [EVERYONE_GROUP_ID] });
    const calls = decode(authorityCalls(opened.batch));
    expect(calls.find((c) => c.name === 'setSubjectDefault').args[1]).toBe(true);
    expect(calls.find((c) => c.name === 'addRoleToGroup').args[1].toString()).toBe(EVERYONE_GROUP_ID);
  });

  it('prices the gas floor over the WHOLE batch — TaskManager and HybridVoting calls included', () => {
    const { batch, gasLimit } = build({ ...treasurerForm, canCreateTasks: true });
    expect(batch.some((c) => c.target === TASK_MANAGER)).toBe(true);
    expect(batch.some((c) => c.target === utils.getAddress(HYBRID))).toBe(true);
    expect(gasLimit).toBe(estimateBatchGas(batch));
  });

  it('refuses to build without an authority or a name', () => {
    expect(() => build(treasurerForm, { authority: '' })).toThrow(/roles contract/);
    expect(() => build({ ...treasurerForm, name: '  ' })).toThrow(/needs a name/);
  });
});

describe('buildRoleFormBatch — binding-vote power', () => {
  it('adds the new subject to the DIRECT class by default', () => {
    const { batch, predictedSubjectId, summaries } = build({ ...treasurerForm, bindingClassIdx: null });
    const call = batch.find((c) => c.target === utils.getAddress(HYBRID));
    expect(call.data.slice(0, 10)).toBe(utils.id('addHatToClass(uint8,uint256)').slice(0, 10));
    const [classIdx, subjectId] = hybridVotingClassInterface.decodeFunctionData('addHatToClass', call.data);
    expect(Number(classIdx)).toBe(0); // the DIRECT class
    expect(subjectId.toString()).toBe(predictedSubjectId);
    expect(summaries.join(' ')).toMatch(/vote in binding votes as Members \(one vote each\)\./);
  });

  it('honours an explicit class pick over the DIRECT default', () => {
    const { batch } = build({ ...treasurerForm, bindingClassIdx: 1 });
    const call = batch.find((c) => c.target === utils.getAddress(HYBRID));
    const [classIdx] = hybridVotingClassInterface.decodeFunctionData('addHatToClass', call.data);
    expect(Number(classIdx)).toBe(1);
  });

  it('uses the CONTRACT class index, not the array position', () => {
    // A filtered class list whose first row is class 2 on chain.
    const shifted = [{ classIndex: 2, strategy: 'DIRECT', slicePct: 100, hatIds: [] }];
    expect(resolveBindingClassIdx({ bindingVote: true, bindingClassIdx: null }, shifted)).toBe(2);
    expect(classByIndex(shifted, 2).slicePct).toBe(100);
    const { batch } = build({ ...treasurerForm, bindingClassIdx: null }, { votingClasses: shifted });
    const call = batch.find((c) => c.target === utils.getAddress(HYBRID));
    const [classIdx] = hybridVotingClassInterface.decodeFunctionData('addHatToClass', call.data);
    expect(Number(classIdx)).toBe(2);
  });

  it('leaving the class toggle off adds no call and no warning (members keep their other votes)', () => {
    const { batch, warnings } = build({ ...treasurerForm, bindingVote: false });
    expect(batch.some((c) => c.target === utils.getAddress(HYBRID))).toBe(false);
    expect(warnings.join(' ')).not.toMatch(/binding votes/);
  });

  it('drops the call (and explains) when the org has no class or no voting contract', () => {
    const noDirect = [{ classIndex: 0, strategy: 'PARTICIPATION', slicePct: 100, hatIds: [] }];
    const a = build({ ...treasurerForm, bindingClassIdx: null }, { votingClasses: noDirect });
    expect(a.batch.some((c) => c.target === utils.getAddress(HYBRID))).toBe(false);
    expect(a.warnings.join(' ')).toMatch(/no one-member-one-vote class/);

    const b = build(treasurerForm, { hybridVoting: '' });
    expect(b.batch.every((c) => c.target === A)).toBe(true);
    expect(b.warnings.join(' ')).toMatch(/binding-vote contract hasn’t loaded/);
    // …and refuses to be PROPOSED like that: the role on screen votes, the batch would not.
    expect(b.submittable.ok).toBe(false);
    expect(b.submittable.code).toBe('context-missing');
  });

  it('drops a class pick the org no longer has instead of encoding a revert', () => {
    const only0 = [{ classIndex: 0, strategy: 'DIRECT', slicePct: 100, hatIds: [] }];
    const { batch, warnings, submittable } = build({ ...treasurerForm, bindingClassIdx: 3 }, { votingClasses: only0 });
    expect(batch.some((c) => c.target === utils.getAddress(HYBRID))).toBe(false);
    expect(warnings.join(' ')).toMatch(/no longer exists/);
    expect(submittable.ok).toBe(true);
  });

  it('tells voters when the class being joined is open to everyone today', () => {
    const open = [{ classIndex: 0, strategy: 'DIRECT', slicePct: 100, hatIds: [] }];
    const { warnings } = build({ ...treasurerForm, bindingClassIdx: null }, { votingClasses: open });
    expect(warnings.join(' ')).toMatch(/currently open to everyone/);
  });
});

describe('buildRoleFormBatch — a group', () => {
  const groupForm = {
    kind: 'group',
    name: 'Stewards',
    memberRoleIds: [MEMBERS_ID, EXECS_ID],
    perms: { TM_PERMS: 6 },
    canCreateTasks: true,
  };

  it('creates the group with its member roles in ONE call', () => {
    const { batch, kind, predictedSubjectId } = build(groupForm);
    expect(kind).toBe('group');
    const call = decode(authorityCalls(batch))[0];
    expect(call.name).toBe('createGroup');
    const [name, , , memberRoleIds] = call.args;
    expect(name).toBe('Stewards');
    expect(memberRoleIds.map(String)).toEqual([MEMBERS_ID, EXECS_ID]);
    expect(predictedSubjectId).toBe(predictNextSubjectId(A, indexedSubjects));
  });

  it('parks the shared permissions on the group itself, and says who they reach', () => {
    const { batch, summaries } = build(groupForm);
    const row = decode(authorityCalls(batch)).find((c) => c.name === 'setPerm');
    expect(row.args[1].toLowerCase()).toBe(PERM_KEYS.TM_PERMS.toLowerCase());
    expect(decodePermWord(row.args[3]).value).toBe('6');
    // The permission is NAMED on the ballot (not counted), and the reach is spelled out.
    expect(summaries.join(' ')).toMatch(/Let “Stewards”/);
    expect(summaries.join(' ')).toMatch(/Every role in the group gets these/);
  });

  it('never writes the role-only calls for a group', () => {
    const { batch } = build({ ...groupForm, openRole: true, limitSeats: true, maxMembers: 3, holders: [{ address: ALICE }] });
    const called = names(authorityCalls(batch));
    for (const fn of ['setSubjectDefault', 'grant', 'offer', 'configureVouchAttestor', 'addRoleToGroup']) {
      expect(called, fn).not.toContain(fn);
    }
  });

  it('warns rather than silently losing people listed on a group', () => {
    const { warnings } = build({ ...groupForm, holders: [{ address: ALICE }] });
    expect(warnings.join(' ')).toMatch(/Groups have no members of their own/);
  });

  it('still grants the group the live TaskManager keys — membership resolves through its roles', () => {
    const { batch, predictedSubjectId } = build(groupForm);
    const tmCalls = batch.filter((c) => c.target === TASK_MANAGER);
    expect(tmCalls).toHaveLength(1);
    const d = taskManagerInterface.parseTransaction({ data: tmCalls[0].data });
    expect(Number(d.args[0])).toBe(1);
    const [id] = utils.defaultAbiCoder.decode(['uint256', 'bool'], d.args[1]);
    expect(id.toString()).toBe(predictedSubjectId);
  });
});

describe('buildRoleFormBatch — the things that are silent when wrong', () => {
  it('warns when another open proposal would shift the predicted id', () => {
    const { summaries, warnings } = build(treasurerForm, {
      activeProposals: [{ actionSummaries: ['Create the role “Auditor”'], status: 'Active' }],
    });
    // The first summary is what makes THIS proposal detectable to the NEXT one.
    expect(summaries[0]).toMatch(/^Create the role/);
    expect(warnings.join(' ')).toMatch(/Another proposal that creates a role or group is still open/);
  });

  it('a settled competing proposal is not a race', () => {
    const { warnings } = build(treasurerForm, {
      activeProposals: [{ actionSummaries: ['Create the role “Auditor”'], status: 'Executed' }],
    });
    expect(warnings.join(' ')).not.toMatch(/Another proposal that creates/);
  });

  it('refuses a batch over the on-chain 20-call ceiling instead of letting it revert', () => {
    const holders = Array.from({ length: 20 }, (_, i) => ({
      address: `0x${String(i + 1).padStart(40, '0')}`,
      name: `P${i}`,
    }));
    const { batch, submittable, warnings } = build({ ...treasurerForm, holders });
    expect(batch.length).toBeGreaterThan(MAX_SPONSORED_CALLS);
    expect(submittable.ok).toBe(false);
    expect(submittable.code).toBe('too-large');
    expect(submittable.message).toMatch(/at most 20/);
    // A gate, not ballot copy: both doors refuse on `submittable.ok`, so the sentence must not
    // ride into the metadata of a proposal that can never be created.
    expect(warnings.join(' ')).not.toMatch(/at most 20/);
  });

  it('passes the preflight for an ordinary role', () => {
    expect(build().submittable.ok).toBe(true);
  });

  it('surfaces the open-role-with-power lint the contract only emits after the write', () => {
    const { warnings } = build({ ...treasurerForm, openRole: true });
    expect(warnings.join(' ')).toMatch(/open to everyone and carries real power/);
  });
});

describe('the legacy roleConfig bridge', () => {
  const roleConfig = {
    parentHatId: MEMBERS_ID, // legacy field — must be ignored on v2
    name: 'Treasurer',
    description: 'Looks after the money',
    imageURI: 'ipfs://img',
    maxSupply: 3,
    mutable: true,
    canVote: true,
    globalPerms: 6,
    canCreateTasks: true,
    canOrganizeFolders: true,
    vouching: { enabled: true, quorum: 2, voucherHatId: EXECS_ID, selfVouch: false },
    initialWearers: [{ address: ALICE, name: 'Alice' }, { address: BOB, name: 'Bob' }],
    projectPerms: [{ projectId: '1', projectName: 'Ops', mask: 3 }],
  };

  it('maps every field a pre-v2 draft carried onto the form', () => {
    const f = roleConfigToRoleForm(roleConfig);
    expect(f.kind).toBe(ROLE_FORM_KIND.ROLE);
    expect(f.limitSeats).toBe(true);
    expect(effectiveMaxMembers(f)).toBe(3);
    expect(f.perms).toEqual({ HV_CREATE: true, TM_PERMS: 6 });
    expect(f.vouching).toEqual({ enabled: true, quorum: 2, voucherSubjectId: EXECS_ID, selfVouch: false });
    expect(f.holders).toEqual([
      { address: ALICE, name: 'Alice', sticky: false },
      { address: BOB, name: 'Bob', sticky: false },
    ]);
  });

  it('keeps an out-of-range seat cap so the validator can say so', () => {
    expect(roleFormError(roleConfigToRoleForm({ name: 'X', maxSupply: -1 })))
      .toBe('The seat limit must be 0 (no limit) or more.');
    expect(roleFormError(roleConfigToRoleForm({ name: 'X', maxSupply: 0 }))).toBeNull();
  });

  it('builds the same authority calls the old create-role arm did, and none of the dead ones', () => {
    const { batch } = build(roleConfigToRoleForm(roleConfig));
    const called = names(authorityCalls(batch));
    expect(called[0]).toBe('createRole');
    expect(called).toContain('setPerm');
    expect(called).toContain('configureVouchAttestor');
    expect(called).toEqual(expect.arrayContaining(['grant', 'offer']));

    const legacyTm = new utils.Interface(['function setProjectRolePerm(bytes32 pid, uint256 hatId, uint8 mask)']);
    expect(batch.some((c) => c.data.startsWith(legacyTm.getSighash('setProjectRolePerm')))).toBe(false);
    // ROLE_PERM is setConfig key 2 — the table `_permMask` stops reading once an authority is set.
    const keys = batch
      .filter((c) => c.target === TASK_MANAGER)
      .map((c) => Number(taskManagerInterface.parseTransaction({ data: c.data }).args[0]));
    expect(keys).toEqual([1, 7]);

    const encoded = batch.map((c) => c.data).join('');
    // The parent role is a Hats-only field and must not be smuggled into any call; the VOUCHER
    // role (a real v2 input) must be.
    expect(encoded.includes(BigInt(MEMBERS_ID).toString(16))).toBe(false);
    expect(encoded.includes(BigInt(EXECS_ID).toString(16))).toBe(true);
  });

  it('resolves the form a proposal will actually be built from', () => {
    // The new form wins whenever it has a name…
    expect(resolveRoleForm({ roleFormV2: { name: 'New' }, roleConfig }).name).toBe('New');
    // …and an old draft falls back to its legacy fields instead of looking empty.
    expect(resolveRoleForm({ roleFormV2: defaultRoleForm(), roleConfig }).name).toBe('Treasurer');
    expect(resolveRoleForm({}).name).toBe('');
    // A group form is never mistaken for a legacy role config.
    expect(resolveRoleForm({ roleFormV2: { kind: 'group', name: 'G' }, roleConfig }).kind).toBe('group');
  });
});

describe('roleFormCopy', () => {
  it('writes the title the wizard suggests, per kind', () => {
    expect(roleFormCopy(treasurerForm).title).toBe('Create role: Treasurer');
    expect(roleFormCopy({ kind: 'group', name: 'Stewards' }).title).toBe('Create group: Stewards');
    expect(roleFormCopy({ name: '  ' })).toEqual({ title: '', description: '' });
  });

  it('describes the decisions that were actually made', () => {
    const copy = roleFormCopy({ ...treasurerForm, openRole: true, vouching: { enabled: true, quorum: 2 } });
    expect(copy.description).toMatch(/anyone in the group can join it/);
    expect(copy.description).toMatch(/5 seats/);
    expect(copy.description).toMatch(/2 vouches to join/);
    expect(copy.description).toMatch(/a vote in binding votes/);
    expect(copy.description).toMatch(/1 starting member/);
  });
});
