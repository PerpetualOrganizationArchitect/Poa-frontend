import { describe, it, expect } from 'vitest';
import {
  buildPermRows,
  buildCreateRoleBatch,
  buildCreateGroupBatch,
  buildEditPermsBatch,
  buildGroupCompositionBatch,
  buildManagerConfigBatch,
  buildMemberActionsBatch,
  buildVouchConfigBatch,
  buildEditSubjectBatch,
  buildSubjectDefaultBatch,
  mergeBatches,
  estimateBatchGas,
  projectCtx,
} from './proposalBuilders';
import { authorityInterface } from './txBuilders';
import { PERM_KEYS, GLOBAL_CTX, decodePermWord, maskPermWord, boolPermWord } from './permKeys';
import { predictNextSubjectId } from './ids';
import {
  AUTHORITY_ADDRESS as A,
  ALICE,
  BOB,
  CAROL,
  MEMBERS_ID,
  EXECS_ID,
  EVERYONE_GROUP_ID,
} from './fixtures';

const existing = [{ subjectId: MEMBERS_ID }, { subjectId: EXECS_ID }, { subjectId: EVERYONE_GROUP_ID }];

/** Decode a whole batch into `[{ name, args }]` through the REAL ABI. */
const decodeBatch = (batch) =>
  batch.map((c) => {
    const parsed = authorityInterface.parseTransaction({ data: c.data });
    return { name: parsed.name, args: parsed.args };
  });

describe('buildPermRows', () => {
  it('turns bool checkboxes into exists+1 words', () => {
    const rows = buildPermRows({ DD_VOTE: true, HV_CREATE: false });
    expect(rows).toHaveLength(1);
    expect(rows[0].permKey).toBe(PERM_KEYS.DD_VOTE);
    expect(rows[0].ctx).toBe(GLOBAL_CTX);
    expect(decodePermWord(rows[0].word).enabled).toBe(true);
  });

  it('turns a task mask into an OR-mask word', () => {
    const rows = buildPermRows({ TM_PERMS: 6 });
    expect(decodePermWord(rows[0].word).value).toBe('6');
  });

  it('drops a zero mask rather than writing a deny-all row', () => {
    // In v1 a stored project mask of ZERO fell back to global; in v2 a zero-valued
    // inherit=false row would mean deny-all, which v1 cannot even express.
    expect(buildPermRows({ TM_PERMS: 0 })).toEqual([]);
  });

  it('ignores unknown permission names', () => {
    expect(buildPermRows({ NOT_A_KEY: true })).toEqual([]);
  });

  it('defaults NEW project rows to inherit=true — the un-shadowing default', () => {
    const [row] = buildPermRows({}, [{ projectId: '0x01', mask: 2 }]);
    expect(decodePermWord(row.word).inheritGlobal).toBe(true);
    expect(row.ctx).toBe(`0x${'0'.repeat(62)}01`);
  });

  it('honours a deliberate exclusion (inherit=false)', () => {
    const [row] = buildPermRows({}, [{ projectId: '0x01', mask: 2, inheritGlobal: false }]);
    expect(decodePermWord(row.word).inheritGlobal).toBe(false);
  });

  it('global ctx is bytes32(0)', () => {
    expect(projectCtx(null)).toBe(GLOBAL_CTX);
    expect(projectCtx('0xabc')).toBe(`0x${'0'.repeat(61)}abc`);
    // decimal project ids are accepted too
    expect(projectCtx('1')).toBe(`0x${'0'.repeat(62)}01`);
  });
});

describe('buildCreateRoleBatch — the KUBI story', () => {
  const config = {
    name: 'Stewards',
    imageURI: 'ipfs://x',
    maxMembers: 10,
    groupIds: [EVERYONE_GROUP_ID],
    perms: { DD_VOTE: true, TM_PERMS: 6 },
    initialHolders: [
      { address: ALICE, inOrg: true },
      { address: BOB, inOrg: false },
      { address: CAROL, inOrg: true, sticky: true },
    ],
  };

  it('creates the subject FIRST, then wires everything to its predicted id', () => {
    const { batch, subjectId } = buildCreateRoleBatch({ authority: A, existingSubjects: existing, config });
    const calls = decodeBatch(batch);
    expect(calls[0].name).toBe('createRole');
    expect(subjectId).toBe(predictNextSubjectId(A, existing));
    // every downstream call names the predicted id
    for (const c of calls.slice(1)) {
      expect(c.args[0].toString()).toBe(subjectId);
    }
  });

  it('emits exactly one call per configured thing, in order', () => {
    const { batch } = buildCreateRoleBatch({ authority: A, existingSubjects: existing, config });
    expect(decodeBatch(batch).map((c) => c.name)).toEqual([
      'createRole',
      'addRoleToGroup',
      'setPerm',
      'setPerm',
      'grant',
      'offer',
      'grant',
    ]);
  });

  it('an in-org holder gets a GRANT and an out-of-org holder gets an OFFER', () => {
    // `grant` on an out-of-org address does NOT revert: the contract writes the rule and emits
    // RoleOffered instead of flipping acceptance. So the cost of getting this wrong is not a dead
    // batch — it is a UI that says "Added" about someone who still has to accept an invitation.
    const calls = decodeBatch(buildCreateRoleBatch({ authority: A, existingSubjects: existing, config }).batch);
    const grants = calls.filter((c) => c.name === 'grant').map((c) => c.args[1].toLowerCase());
    const offers = calls.filter((c) => c.name === 'offer').map((c) => c.args[1].toLowerCase());
    expect(grants).toEqual([ALICE, CAROL]);
    expect(offers).toEqual([BOB]);
  });

  it('sticky holders are delegable=false; everyone else is delegable=true', () => {
    const calls = decodeBatch(buildCreateRoleBatch({ authority: A, existingSubjects: existing, config }).batch);
    const grants = calls.filter((c) => c.name === 'grant');
    expect(grants[0].args[2]).toBe(true); // Alice — managers can change it later
    expect(grants[1].args[2]).toBe(false); // Carol — locked to governance
  });

  it('an OPEN role sets the default without force (a new role has no members to lapse)', () => {
    const { batch } = buildCreateRoleBatch({
      authority: A,
      existingSubjects: existing,
      config: { name: 'Members', defaultAllow: true },
    });
    const call = decodeBatch(batch).find((c) => c.name === 'setSubjectDefault');
    expect(call.args[1]).toBe(true);
    expect(call.args[2]).toBe(false);
  });

  it('a self-vouching role points the attestor at its OWN predicted id', () => {
    const { batch, subjectId } = buildCreateRoleBatch({
      authority: A,
      existingSubjects: existing,
      config: { name: 'Execs', vouch: { quorum: 2, selfVouch: true } },
    });
    const call = decodeBatch(batch).find((c) => c.name === 'configureVouchAttestor');
    expect(call.args[2].toString()).toBe(subjectId);
  });

  it('warns about the id-prediction race when another subject-creating proposal is open', () => {
    const { warnings } = buildCreateRoleBatch({
      authority: A,
      existingSubjects: existing,
      activeProposals: [{ createsSubject: true, executed: false }],
      config,
    });
    expect(warnings[0]).toMatch(/wrong role/);
  });

  it('is silent when no competing proposal is open', () => {
    expect(buildCreateRoleBatch({ authority: A, existingSubjects: existing, config }).warnings).toEqual([]);
  });

  it('demands a name', () => {
    expect(() => buildCreateRoleBatch({ authority: A, config: { name: '  ' } })).toThrow(/needs a name/);
  });

  it('quotes a gas floor — announceWinner would otherwise silently skip the batch', () => {
    const { batch, gasLimit } = buildCreateRoleBatch({ authority: A, existingSubjects: existing, config });
    expect(gasLimit).toBe(estimateBatchGas(batch));
    expect(gasLimit).toBeGreaterThan(1_000_000);
  });
});

describe('buildCreateGroupBatch', () => {
  it('creates the group with its member roles and gives the GROUP the shared perms', () => {
    const { batch, subjectId } = buildCreateGroupBatch({
      authority: A,
      existingSubjects: existing,
      config: { name: 'Everyone', memberRoleIds: [MEMBERS_ID, EXECS_ID], perms: { TM_PERMS: 2 } },
    });
    const calls = decodeBatch(batch);
    expect(calls[0].name).toBe('createGroup');
    expect(calls[0].args[3].map(String)).toEqual([MEMBERS_ID, EXECS_ID]);
    expect(calls[1].name).toBe('setPerm');
    expect(calls[1].args[0].toString()).toBe(subjectId);
  });

  it('spells out that group perms reach every role in it', () => {
    const { summaries } = buildCreateGroupBatch({
      authority: A,
      existingSubjects: existing,
      config: { name: 'Everyone', memberRoleIds: [MEMBERS_ID], perms: { TM_PERMS: 2 } },
    });
    expect(summaries.join(' ')).toMatch(/every role in it gets them/);
  });
});

describe('buildEditPermsBatch — diffs, so an untouched permission is not rewritten', () => {
  const current = [
    { permKey: PERM_KEYS.DD_VOTE, ctx: GLOBAL_CTX, word: boolPermWord(true) },
    { permKey: PERM_KEYS.TM_PERMS, ctx: GLOBAL_CTX, word: maskPermWord(2, { inheritGlobal: false }) },
  ];

  it('emits nothing when nothing changed', () => {
    const { batch } = buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: current, nextRows: current });
    expect(batch).toEqual([]);
  });

  it('setPerm for a changed value', () => {
    const next = [current[0], { ...current[1], word: maskPermWord(6, { inheritGlobal: false }) }];
    const calls = decodeBatch(buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: current, nextRows: next }).batch);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('setPerm');
    expect(decodePermWord(calls[0].args[3].toString()).value).toBe('6');
  });

  it('clearPerm for a removed row', () => {
    const calls = decodeBatch(
      buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: current, nextRows: [current[0]] }).batch
    );
    expect(calls.map((c) => c.name)).toEqual(['clearPerm']);
    expect(calls[0].args[1]).toBe(PERM_KEYS.TM_PERMS);
  });

  it('setPerm for a brand-new row', () => {
    const next = [...current, { permKey: PERM_KEYS.PAY_CREATE, ctx: GLOBAL_CTX, word: boolPermWord(true) }];
    const calls = decodeBatch(buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: current, nextRows: next }).batch);
    expect(calls.map((c) => c.name)).toEqual(['setPerm']);
  });

  it('treats a per-project row as distinct from the global one', () => {
    const next = [...current, { permKey: PERM_KEYS.TM_PERMS, ctx: projectCtx('0x01'), word: maskPermWord(4) }];
    const { batch } = buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: current, nextRows: next });
    expect(batch).toHaveLength(1);
  });
});

describe('buildGroupCompositionBatch', () => {
  it('adds and removes roles and says what that means', () => {
    const r = buildGroupCompositionBatch({
      authority: A,
      groupId: EVERYONE_GROUP_ID,
      groupName: 'Everyone',
      addRoleIds: [MEMBERS_ID],
      removeRoleIds: [EXECS_ID],
    });
    expect(decodeBatch(r.batch).map((c) => c.name)).toEqual(['addRoleToGroup', 'removeRoleFromGroup']);
    expect(r.summaries[0]).toMatch(/gains every permission/);
    expect(r.summaries[1]).toMatch(/loses every permission/);
  });
});

describe('buildManagerConfigBatch — the delegation setup', () => {
  it('wires "Executives manage Members"', () => {
    const r = buildManagerConfigBatch({
      authority: A,
      subjectId: MEMBERS_ID,
      subjectName: 'Members',
      managerName: 'Executives',
      config: { managerSubjectId: EXECS_ID, canGrant: true, canRemove: true, delaySecs: 172800 },
    });
    const [call] = decodeBatch(r.batch);
    expect(call.name).toBe('setManagerConfig');
    expect(call.args[2]).toBe(3);
    expect(r.summaries[0]).toBe('Let Executives manage who holds Members');
    expect(r.warnings).toEqual([]);
  });

  it('warns that a zero delay removes the review window', () => {
    const r = buildManagerConfigBatch({
      authority: A,
      subjectId: MEMBERS_ID,
      config: { managerSubjectId: EXECS_ID, canGrant: true, delaySecs: 0 },
    });
    expect(r.warnings.join(' ')).toMatch(/nobody gets a chance to object/);
  });

  it('warns about a delegation with no powers', () => {
    const r = buildManagerConfigBatch({ authority: A, subjectId: MEMBERS_ID, config: { managerSubjectId: EXECS_ID, delaySecs: 100 } });
    expect(r.warnings.join(' ')).toMatch(/grants no powers/);
  });

  it('clearing the delegation warns that pending actions die with it', () => {
    const r = buildManagerConfigBatch({ authority: A, subjectId: MEMBERS_ID, subjectName: 'Members', config: {} });
    expect(r.summaries[0]).toMatch(/Stop letting anyone manage/);
    expect(r.warnings.join(' ')).toMatch(/cancels anything the managers currently have pending/);
  });
});

describe('buildMemberActionsBatch', () => {
  it('maps every verb to its call', () => {
    const r = buildMemberActionsBatch({
      authority: A,
      subjectId: EXECS_ID,
      actions: [
        { action: 'grant', address: ALICE },
        { action: 'offer', address: BOB },
        { action: 'remove', address: CAROL },
        { action: 'ban', address: CAROL },
        { action: 'unban', address: CAROL },
        { action: 'withdrawOffer', address: BOB },
        { action: 'clearRule', address: ALICE },
      ],
    });
    expect(decodeBatch(r.batch).map((c) => c.name)).toEqual([
      'grant', 'offer', 'remove', 'remove', 'unremove', 'withdrawOffer', 'clearRule',
    ]);
  });

  it('remove vs ban is the third argument, not a different function', () => {
    const calls = decodeBatch(
      buildMemberActionsBatch({
        authority: A,
        subjectId: EXECS_ID,
        actions: [{ action: 'remove', address: ALICE }, { action: 'ban', address: BOB }],
      }).batch
    );
    expect(calls[0].args[2]).toBe(false);
    expect(calls[1].args[2]).toBe(true);
  });

  it('warns when a grant would be locked to governance forever', () => {
    const r = buildMemberActionsBatch({
      authority: A,
      subjectId: EXECS_ID,
      actions: [{ action: 'grant', address: ALICE, sticky: true }],
    });
    expect(r.warnings[0]).toMatch(/only another vote could remove them/);
  });

  it('rejects an unknown verb rather than silently dropping it', () => {
    expect(() =>
      buildMemberActionsBatch({ authority: A, subjectId: EXECS_ID, actions: [{ action: 'yeet', address: ALICE }] })
    ).toThrow(/unknown member action/);
  });
});

describe('buildVouchConfigBatch', () => {
  it('configures the attestor', () => {
    const r = buildVouchConfigBatch({ authority: A, subjectId: EXECS_ID, subjectName: 'Execs', quorum: 3, voucherSubjectId: EXECS_ID });
    expect(decodeBatch(r.batch)[0].args[1]).toBe(3);
    expect(r.summaries[0]).toMatch(/Require 3 vouches/);
  });

  it('quorum 0 turns vouching off', () => {
    const r = buildVouchConfigBatch({ authority: A, subjectId: EXECS_ID, subjectName: 'Execs', quorum: 0 });
    expect(r.summaries[0]).toMatch(/Stop requiring vouches/);
  });

  it('an epoch reset warns about the members it would lapse', () => {
    const r = buildVouchConfigBatch({
      authority: A, subjectId: EXECS_ID, quorum: 2, voucherSubjectId: EXECS_ID, resetEpoch: true, currentMemberCount: 4,
    });
    expect(decodeBatch(r.batch).map((c) => c.name)).toEqual(['configureVouchAttestor', 'resetVouchEpoch']);
    expect(r.warnings[0]).toMatch(/4 members to re-check/);
  });
});

describe('buildEditSubjectBatch / buildSubjectDefaultBatch', () => {
  it('renames and re-caps', () => {
    const r = buildEditSubjectBatch({ authority: A, subjectId: EXECS_ID, name: 'Leads', maxMembers: 3, currentMemberCount: 1 });
    expect(decodeBatch(r.batch).map((c) => c.name)).toEqual(['renameSubject', 'setMaxMembers']);
    expect(r.warnings).toEqual([]);
  });

  it('warns when the new cap is already exceeded', () => {
    const r = buildEditSubjectBatch({ authority: A, subjectId: EXECS_ID, name: 'Leads', maxMembers: 1, currentMemberCount: 4 });
    expect(r.warnings[0]).toMatch(/already has 4 members/);
  });

  it('rename only, when no cap is passed', () => {
    const r = buildEditSubjectBatch({ authority: A, subjectId: EXECS_ID, name: 'Leads' });
    expect(r.batch).toHaveLength(1);
  });

  it('closing an OPEN role with members requires force AND says why', () => {
    const r = buildSubjectDefaultBatch({ authority: A, subjectId: MEMBERS_ID, subjectName: 'Members', allow: false, currentMemberCount: 12 });
    expect(decodeBatch(r.batch)[0].args[2]).toBe(true);
    expect(r.warnings[0]).toMatch(/12 members currently hold this role only because it is open/);
  });

  it('opening a role never needs force', () => {
    const r = buildSubjectDefaultBatch({ authority: A, subjectId: MEMBERS_ID, allow: true, currentMemberCount: 12 });
    expect(decodeBatch(r.batch)[0].args[2]).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it('closing an EMPTY role does not need force', () => {
    const r = buildSubjectDefaultBatch({ authority: A, subjectId: MEMBERS_ID, allow: false, currentMemberCount: 0 });
    expect(decodeBatch(r.batch)[0].args[2]).toBe(false);
  });
});

describe('mergeBatches', () => {
  it('concatenates in order and re-quotes the gas floor', () => {
    const a = buildGroupCompositionBatch({ authority: A, groupId: EVERYONE_GROUP_ID, addRoleIds: [MEMBERS_ID] });
    const b = buildMemberActionsBatch({ authority: A, subjectId: EXECS_ID, actions: [{ action: 'grant', address: ALICE }] });
    const merged = mergeBatches(a, null, b);
    expect(decodeBatch(merged.batch).map((c) => c.name)).toEqual(['addRoleToGroup', 'grant']);
    expect(merged.gasLimit).toBe(estimateBatchGas(merged.batch));
  });
});
