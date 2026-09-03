/**
 * Every emitted call is decoded back through the REAL MembershipAuthority ABI (via
 * `authorityInterface`), never against a hand-written fragment — a signature drift has to fail
 * here rather than produce a well-formed transaction that reverts inside announceWinner's
 * try/catch, where nobody would ever see it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { utils, constants } from 'ethers';
import {
  buildV2ElectionBatches,
  buildV2CreateRoleBatch,
  acceptedHoldersOf,
  toAddressSet,
  ELECTED_SEAT_STICKY,
} from './v2VoteActions';
import { authorityInterface } from '@/lib/accessV2/txBuilders';
import { projectCtx, estimateBatchGas } from '@/lib/accessV2/proposalBuilders';
import { predictNextSubjectId } from '@/lib/accessV2/ids';
import { PERM_KEYS, GLOBAL_CTX, decodePermWord } from '@/lib/accessV2/permKeys';
import {
  AUTHORITY_ADDRESS as A,
  ALICE,
  BOB,
  CAROL,
  MEMBERS_ID,
  EXECS_ID,
  EVERYONE_GROUP_ID,
} from '@/lib/accessV2/fixtures';

const DAVE = '0xdddddddddddddddddddddddddddddddddddddddd';
const TASK_MANAGER = '0x7777777777777777777777777777777777777777';

const existingSubjects = [
  { subjectId: MEMBERS_ID },
  { subjectId: EXECS_ID },
  { subjectId: EVERYONE_GROUP_ID },
];

const taskManagerInterface = new utils.Interface(['function setConfig(uint8 key, bytes value)']);

/** Decode a batch of authority calls into `[{ name, args }]`. */
const decode = (batch) =>
  batch.map((c) => {
    const parsed = authorityInterface.parseTransaction({ data: c.data });
    return { name: parsed.name, args: parsed.args, target: c.target };
  });

const names = (batch) => decode(batch).map((c) => c.name);

describe('toAddressSet / acceptedHoldersOf', () => {
  it('accepts the Set the fold mirror actually hands over, lowercasing it', () => {
    const set = toAddressSet(new Set([ALICE.toUpperCase()]));
    expect(set.has(ALICE)).toBe(true);
  });

  it('accepts an array of addresses or of rows', () => {
    expect(toAddressSet([ALICE]).has(ALICE)).toBe(true);
    expect(toAddressSet([{ address: ALICE }]).has(ALICE)).toBe(true);
    expect(toAddressSet([{ user: ALICE }]).has(ALICE)).toBe(true);
  });

  it('is empty — never throws — for a hook that has not resolved', () => {
    expect(toAddressSet(null).size).toBe(0);
    expect(toAddressSet(undefined).size).toBe(0);
  });

  it('counts ACCEPTED rows, not just active ones: remove() only needs acceptance', () => {
    const rows = [
      { subjectId: EXECS_ID, user: ALICE, accepted: true, isMember: true },
      // accepted but lapsed — still removable on chain, and still `AlreadyMember` for grant
      { subjectId: EXECS_ID, user: BOB, accepted: true, isMember: false },
      { subjectId: EXECS_ID, user: CAROL, accepted: false, isMember: false },
      { subjectId: MEMBERS_ID, user: DAVE, accepted: true, isMember: true },
    ];
    const holders = acceptedHoldersOf(rows, EXECS_ID);
    expect([...holders].sort()).toEqual([ALICE, BOB].sort());
  });
});

describe('buildV2ElectionBatches', () => {
  const base = {
    authority: A,
    subjectId: EXECS_ID,
    subjectName: 'Executives',
    candidates: [
      { name: 'Alice', address: ALICE },
      { name: 'Bob', address: BOB },
    ],
    selectedIncumbents: [{ name: 'Carol', address: CAROL }],
    acceptedHolders: [CAROL],
    inOrgUsers: new Set([ALICE, CAROL]),
  };

  it('emits one batch per candidate, in candidate order', () => {
    const { batches, optionNames } = buildV2ElectionBatches(base);
    expect(optionNames).toEqual(['Alice', 'Bob']);
    expect(batches).toHaveLength(2);
  });

  it('removes the incumbent then adds the winner — every call on the authority', () => {
    const { batches } = buildV2ElectionBatches(base);
    const decoded = decode(batches[0]);
    expect(decoded.map((c) => c.name)).toEqual(['remove', 'grant']);
    expect(decoded.every((c) => c.target === A)).toBe(true);

    // remove(subject, user, ban) — ban=true, because a soft remove reverts RemovalIneffective for
    // anyone with a surviving eligibility source and announceWinner would swallow it.
    expect(decoded[0].args[0].toString()).toBe(EXECS_ID);
    expect(decoded[0].args[1].toLowerCase()).toBe(CAROL);
    expect(decoded[0].args[2]).toBe(true);

    // grant(subject, user, delegable) — delegable=false: the elected seat belongs to the group.
    expect(decoded[1].args[0].toString()).toBe(EXECS_ID);
    expect(decoded[1].args[1].toLowerCase()).toBe(ALICE);
    expect(decoded[1].args[2]).toBe(false);
    expect(ELECTED_SEAT_STICKY).toBe(true);
  });

  it('INVITES a candidate who is not in the org yet (the consent model), rather than adding them', () => {
    const { batches } = buildV2ElectionBatches(base);
    const bobBatch = decode(batches[1]);
    expect(bobBatch.map((c) => c.name)).toEqual(['remove', 'offer']);
    expect(bobBatch[1].args[1].toLowerCase()).toBe(BOB);
    expect(bobBatch[1].args[2]).toBe(false);
  });

  it('emits NO grant for a candidate who already holds the role (grant reverts AlreadyMember)', () => {
    const { batches } = buildV2ElectionBatches({
      ...base,
      candidates: [{ name: 'Carol', address: CAROL }, { name: 'Alice', address: ALICE }],
    });
    // Carol IS the incumbent and already holds it: nothing to remove (self), nothing to grant.
    expect(batches[0]).toEqual([]);
    expect(names(batches[1])).toEqual(['remove', 'grant']);
  });

  it('never removes an incumbent who no longer holds the role (remove reverts NotMember)', () => {
    const { batches, warnings } = buildV2ElectionBatches({
      ...base,
      selectedIncumbents: [{ name: 'Carol', address: CAROL }, { name: 'Dave', address: DAVE }],
      acceptedHolders: [CAROL],
    });
    expect(names(batches[0])).toEqual(['remove', 'grant']);
    expect(decode(batches[0])[0].args[1].toLowerCase()).toBe(CAROL);
    expect(warnings.join(' ')).toMatch(/Dave no longer holds Executives/);
  });

  it('appends "No One" LAST as an empty batch, so the option indices never shift', () => {
    const { batches, optionNames, summaries } = buildV2ElectionBatches({
      ...base,
      includeNoOneOption: true,
    });
    expect(optionNames).toEqual(['Alice', 'Bob', 'No One']);
    expect(batches[2]).toEqual([]);
    expect(summaries.join(' ')).toMatch(/No One/);
  });

  it('keeps the fallback role — as an ordinary add on that subject, delegable', () => {
    const { batches, summaries } = buildV2ElectionBatches({
      ...base,
      fallbackSubjectId: MEMBERS_ID,
      fallbackSubjectName: 'Members',
    });
    const decoded = decode(batches[0]);
    expect(decoded.map((c) => c.name)).toEqual(['remove', 'grant', 'grant']);
    // fallback grant lands on the FALLBACK subject and stays delegable (theirs to drop)
    expect(decoded[1].args[0].toString()).toBe(MEMBERS_ID);
    expect(decoded[1].args[1].toLowerCase()).toBe(CAROL);
    expect(decoded[1].args[2]).toBe(true);
    // the elected seat is still the sticky one
    expect(decoded[2].args[0].toString()).toBe(EXECS_ID);
    expect(decoded[2].args[2]).toBe(false);
    expect(summaries.join(' ')).toMatch(/added to Members instead/);
  });

  it('skips the fallback grant for a loser who already holds it', () => {
    const { batches } = buildV2ElectionBatches({
      ...base,
      fallbackSubjectId: MEMBERS_ID,
      fallbackSubjectName: 'Members',
      fallbackAcceptedHolders: [CAROL],
    });
    expect(names(batches[0])).toEqual(['remove', 'grant']);
    expect(decode(batches[0])[1].args[0].toString()).toBe(EXECS_ID);
  });

  it('refuses a fallback role that IS the elected role, loudly', () => {
    const { batches, warnings } = buildV2ElectionBatches({
      ...base,
      fallbackSubjectId: EXECS_ID,
      fallbackSubjectName: 'Executives',
    });
    expect(names(batches[0])).toEqual(['remove', 'grant']);
    expect(warnings.join(' ')).toMatch(/same as the role being elected/);
  });

  it('summarises the ballot in the member-facing voice, with no "hat" anywhere', () => {
    const { summaries } = buildV2ElectionBatches({
      ...base,
      fallbackSubjectId: MEMBERS_ID,
      fallbackSubjectName: 'Members',
      includeNoOneOption: true,
    });
    expect(summaries[0]).toBe(
      'Elect one of: Alice, Bob to Executives. The winner is added to the role automatically.'
    );
    expect(summaries.join(' ')).toMatch(/Bob isn’t in this group yet/);
    expect(summaries.join(' ')).toMatch(/If Carol doesn’t win, they lose Executives/);
    expect(summaries.join(' ').toLowerCase()).not.toMatch(/\bhat\b/);
  });

  it('never opens with a summary the id-race detector reads as a role creation', () => {
    // lib/accessV2/proposalRace matches /^create the role\b/ on OTHER proposals' summaries.
    const { summaries } = buildV2ElectionBatches(base);
    expect(summaries[0]).not.toMatch(/^create the (role|group)\b/i);
  });

  it('prices the announceWinner floor off the BIGGEST option, not the first', () => {
    const { batches, gasLimit } = buildV2ElectionBatches({
      ...base,
      candidates: [{ name: 'Carol', address: CAROL }, { name: 'Alice', address: ALICE }],
    });
    expect(batches[0]).toEqual([]);
    expect(gasLimit).toBe(estimateBatchGas(batches[1]));
    expect(gasLimit).toBeGreaterThan(estimateBatchGas([]));
  });

  it('refuses to build without the authority or the role, instead of encoding a dud', () => {
    expect(() => buildV2ElectionBatches({ ...base, authority: '' })).toThrow(/roles contract/);
    expect(() => buildV2ElectionBatches({ ...base, subjectId: '' })).toThrow(/which role/);
    expect(() => buildV2ElectionBatches({ ...base, candidates: [] })).toThrow(/at least one candidate/);
  });
});

describe('buildV2CreateRoleBatch', () => {
  const roleConfig = {
    parentHatId: MEMBERS_ID, // legacy field — must be ignored on v2
    name: 'Treasurer',
    description: 'Looks after the money',
    imageURI: 'ipfs://img',
    maxSupply: 3,
    mutable: true,
    defaultEligible: true,
    defaultStanding: true,
    canVote: true,
    globalPerms: 6,
    canCreateTasks: true,
    canOrganizeFolders: true,
    vouching: { enabled: true, quorum: 2, voucherHatId: EXECS_ID, selfVouch: false, combineWithHierarchy: true },
    initialWearers: [{ address: ALICE, name: 'Alice' }, { address: BOB, name: 'Bob' }],
    projectPerms: [{ projectId: '1', projectName: 'Ops', mask: 3 }],
  };

  const build = (overrides = {}) =>
    buildV2CreateRoleBatch({
      authority: A,
      existingSubjects,
      roleConfig,
      inOrgUsers: new Set([ALICE]),
      taskManagerAddress: TASK_MANAGER,
      ...overrides,
    });

  it('creates the role through the authority — never through the eligibility module', () => {
    const { batch, predictedSubjectId } = build();
    const authorityCalls = batch.filter((c) => c.target === A);
    expect(names(authorityCalls)[0]).toBe('createRole');
    const [name, metadataCID, imageURI, maxMembers] = decode(authorityCalls)[0].args;
    expect(name).toBe('Treasurer');
    expect(metadataCID).toBe(constants.HashZero);
    expect(imageURI).toBe('ipfs://img');
    expect(Number(maxMembers)).toBe(3);
    expect(predictedSubjectId).toBe(predictNextSubjectId(A, existingSubjects));
  });

  it('carries the description’s IPFS CID in the CREATE call — no second metadata write', () => {
    const cid = `0x${'ab'.repeat(32)}`;
    const { batch } = build({ metadataCID: cid });
    expect(decode(batch.filter((c) => c.target === A))[0].args[1]).toBe(cid);
    expect(names(batch.filter((c) => c.target === A))).not.toContain('renameSubject');
  });

  it('turns "can create proposals" into the HV_CREATE permission, not setCreatorHatAllowed', () => {
    const { batch, predictedSubjectId } = build();
    const rows = decode(batch.filter((c) => c.target === A)).filter((c) => c.name === 'setPerm');
    const hv = rows.find((r) => r.args[1].toLowerCase() === PERM_KEYS.HV_CREATE.toLowerCase());
    expect(hv).toBeTruthy();
    expect(hv.args[0].toString()).toBe(predictedSubjectId);
    expect(hv.args[2]).toBe(GLOBAL_CTX);
    expect(decodePermWord(hv.args[3]).enabled).toBe(true);
    // The legacy call is gone entirely: HybridVoting stops reading creatorHatIds on a v2 org.
    expect(
      batch.some((c) => c.data.startsWith(
        new utils.Interface(['function setCreatorHatAllowed(uint256 h, bool ok)']).getSighash('setCreatorHatAllowed')
      ))
    ).toBe(false);
  });

  it('writes task permissions as perm rows — global at ctx 0, per project at the W4 ctx', () => {
    const { batch } = build();
    const rows = decode(batch.filter((c) => c.target === A)).filter((c) => c.name === 'setPerm');
    const tm = rows.filter((r) => r.args[1].toLowerCase() === PERM_KEYS.TM_PERMS.toLowerCase());
    expect(tm).toHaveLength(2);

    const global = tm.find((r) => r.args[2] === GLOBAL_CTX);
    expect(decodePermWord(global.args[3]).value).toBe('6');

    const perProject = tm.find((r) => r.args[2] !== GLOBAL_CTX);
    expect(perProject.args[2]).toBe(projectCtx('1'));
    expect(decodePermWord(perProject.args[3]).value).toBe('3');
    expect(decodePermWord(perProject.args[3]).inheritGlobal).toBe(true);
  });

  it('takes the composite project id the wizard actually holds, not a pre-offset one', () => {
    const composite = `${TASK_MANAGER}-4`;
    const { batch } = build({
      roleConfig: { ...roleConfig, projectPerms: [{ projectId: composite, mask: 1 }] },
    });
    const row = decode(batch.filter((c) => c.target === A))
      .filter((c) => c.name === 'setPerm')
      .find((r) => r.args[2] !== GLOBAL_CTX);
    expect(row.args[2]).toBe(projectCtx(composite));
  });

  it('configures vouching on the authority, with the picked role as the voucher', () => {
    const { batch } = build();
    const vouch = decode(batch.filter((c) => c.target === A)).find(
      (c) => c.name === 'configureVouchAttestor'
    );
    expect(vouch.args[0].toString()).toBe(predictNextSubjectId(A, existingSubjects));
    expect(Number(vouch.args[1])).toBe(2);
    expect(vouch.args[2].toString()).toBe(EXECS_ID);
  });

  it('points a self-vouching role at its own predicted id', () => {
    const { batch, predictedSubjectId } = build({
      roleConfig: { ...roleConfig, vouching: { enabled: true, quorum: 1, selfVouch: true, voucherHatId: '' } },
    });
    const vouch = decode(batch.filter((c) => c.target === A)).find(
      (c) => c.name === 'configureVouchAttestor'
    );
    expect(vouch.args[2].toString()).toBe(predictedSubjectId);
  });

  it('warns that "combine with hierarchy" has no meaning without a role hierarchy', () => {
    expect(build().warnings.join(' ')).toMatch(/combine with hierarchy/i);
  });

  it('ADDS an initial holder who is in the org and INVITES one who is not', () => {
    const { batch } = build();
    const people = decode(batch.filter((c) => c.target === A)).filter(
      (c) => c.name === 'grant' || c.name === 'offer'
    );
    expect(people.map((c) => c.name)).toEqual(['grant', 'offer']);
    expect(people[0].args[1].toLowerCase()).toBe(ALICE);
    expect(people[1].args[1].toLowerCase()).toBe(BOB);
    // Not sticky: someone put into a new role at creation can still resign from it.
    expect(people[0].args[2]).toBe(true);
    expect(people[1].args[2]).toBe(true);
  });

  it('keeps the two TaskManager grants that ARE still live on v2, keyed by the SUBJECT id', () => {
    const { batch, predictedSubjectId } = build();
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
    const { batch, warnings } = build({ taskManagerAddress: '' });
    expect(batch.every((c) => c.target === A)).toBe(true);
    expect(warnings.join(' ')).toMatch(/no task manager/i);
  });

  it('never writes the tables a v2 org stopped reading (ROLE_PERM / setProjectRolePerm)', () => {
    const { batch } = build();
    const legacyTm = new utils.Interface([
      'function setProjectRolePerm(bytes32 pid, uint256 hatId, uint8 mask)',
    ]);
    expect(batch.some((c) => c.data.startsWith(legacyTm.getSighash('setProjectRolePerm')))).toBe(false);
    // ROLE_PERM is key 2 on setConfig — the one _permMask stops reading once an authority is set.
    const setConfigKeys = batch
      .filter((c) => c.target === TASK_MANAGER)
      .map((c) => Number(taskManagerInterface.parseTransaction({ data: c.data }).args[0]));
    expect(setConfigKeys).not.toContain(2);
  });

  it('is invite-only unless the role is explicitly opened', () => {
    expect(names(build().batch.filter((c) => c.target === A))).not.toContain('setSubjectDefault');
    const opened = build({ roleConfig: { ...roleConfig, openRole: true } });
    expect(names(opened.batch.filter((c) => c.target === A))).toContain('setSubjectDefault');
  });

  it('drops the Hats-only fields instead of encoding them (no parent, no mutability, no supply flags)', () => {
    const { batch } = build();
    const encoded = batch.map((c) => c.data).join('');
    // The legacy createHatWithEligibility selector must not appear anywhere in a v2 batch.
    const legacyEl = new utils.Interface([
      'function createHatWithEligibility((uint256,string,uint32,bool,string,bool,bool,address[],bool[],bool[]) params)',
    ]);
    expect(encoded.includes(legacyEl.getSighash('createHatWithEligibility').slice(2))).toBe(false);
    // The parent role id is a legacy field and must not be smuggled into any call — while the
    // VOUCHER role (a real v2 input) must be.
    expect(encoded.includes(BigInt(MEMBERS_ID).toString(16))).toBe(false);
    expect(encoded.includes(BigInt(EXECS_ID).toString(16))).toBe(true);
  });

  it('keeps the id-race warning the first summary makes detectable', () => {
    const { summaries, warnings } = build({
      activeProposals: [{ actionSummaries: ['Create the role “Auditor”'], status: 'Active' }],
    });
    expect(summaries[0]).toMatch(/^Create the role/);
    expect(warnings.join(' ')).toMatch(/Another proposal that creates a role or group is still open/);
  });

  it('prices the gas floor over the WHOLE batch, TaskManager calls included', () => {
    const { batch, gasLimit } = build();
    expect(gasLimit).toBe(estimateBatchGas(batch));
  });

  it('refuses to build without an authority or a name', () => {
    expect(() => build({ authority: '' })).toThrow(/roles contract/);
    expect(() => build({ roleConfig: { ...roleConfig, name: '  ' } })).toThrow(/needs a name/);
  });
});

/**
 * THE LEGACY ORG MUST BE UNTOUCHED. There is no React harness in this repo, so the guard is over
 * the source of the one file that chooses between the two encoders — the same technique
 * `hooks/accessV2/gating.test.js` uses, and for the same reason: a legacy org silently losing its
 * election encoder is invisible in every other test.
 */
describe('the legacy encoders are still there, and the v2 ones are behind the gate', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(HERE, '..', '..', 'hooks', 'useProposalForm.js'), 'utf8');

  it('still encodes the legacy election and create-role calls', () => {
    for (const fn of [
      'setWearerEligibility',
      'clearWearerVouches',
      'mintHatToAddress',
      'transferHat',
      'createHatWithEligibility',
      'configureVouching',
      'setCreatorHatAllowed',
      'setProjectRolePerm',
      'updateHatMetadata',
    ]) {
      expect(src, `legacy encoder lost: ${fn}`).toContain(fn);
    }
  });

  it('reaches the v2 adapters only through an accessV2 gate', () => {
    for (const adapter of ['buildV2ElectionBatches', 'buildV2CreateRoleBatch']) {
      // import + at least one call site
      expect(src).toContain(adapter);
      const callSites = src.split(`${adapter}(`).length - 1;
      expect(callSites, `${adapter} is imported but never called`).toBeGreaterThan(0);
    }
    // Every v2 branch is chosen by the same predicate, and it reads the flag VotingPage sets.
    expect(src).toMatch(/accessV2\?\.enabled/);
  });
});
