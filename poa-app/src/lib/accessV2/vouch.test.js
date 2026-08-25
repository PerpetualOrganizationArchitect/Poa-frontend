import { describe, it, expect } from 'vitest';
import {
  normalizeVouchConfig,
  normalizeVouchRecord,
  normalizeVouchRecords,
  liveRecords,
  vouchProgress,
  vouchProgressCopy,
  hasVouched,
  canVouch,
  isMemberOfVoucherSubject,
  predictLints,
  LINT_CODE,
  LINT_COPY,
} from './vouch';
import { execsSubject, vouchRecord, ALICE, BOB, CAROL, EXECS_ID, MEMBERS_ID, EVERYONE_GROUP_ID } from './fixtures';

const config = () => normalizeVouchConfig(execsSubject().vouchConfig);

describe('normalizeVouchConfig', () => {
  it('reads quorum, voucher subject and epoch', () => {
    const c = config();
    expect(c.quorum).toBe(2);
    expect(c.enabled).toBe(true);
    expect(c.voucherSubjectId).toBe(EXECS_ID);
    expect(c.epoch).toBe('3');
  });

  it('flags self-vouching (legal and live — only an EMPTY subject deadlocks)', () => {
    expect(config().selfVouching).toBe(true);
  });

  it('quorum 0 means vouching is off', () => {
    expect(normalizeVouchConfig({ id: '1', quorum: 0 }).enabled).toBe(false);
  });
});

describe('epochs decide which records COUNT', () => {
  it('a record at the current epoch counts', () => {
    const recs = normalizeVouchRecords([vouchRecord()]);
    expect(liveRecords(recs, config())).toHaveLength(1);
  });

  it('a STALE-epoch record silently stops counting — with no event of its own', () => {
    // resetVouchEpoch bumped the config to 3; this record was written at 2.
    const recs = normalizeVouchRecords([vouchRecord({ epoch: '2' })]);
    expect(liveRecords(recs, config())).toHaveLength(0);
    expect(vouchProgress(recs, config()).stale).toBe(1);
  });

  it('a revoked record stops counting', () => {
    const recs = normalizeVouchRecords([vouchRecord({ active: false, revokedAt: '1750000900' })]);
    expect(liveRecords(recs, config())).toHaveLength(0);
  });

  it('normalises a seeded (migrated) record', () => {
    const r = normalizeVouchRecord(vouchRecord({ seeded: true }));
    expect(r.seeded).toBe(true);
    expect(r.voucher).toBe(ALICE);
  });
});

describe('vouchProgress', () => {
  it('reports count / quorum / remaining', () => {
    const recs = normalizeVouchRecords([vouchRecord()]);
    const p = vouchProgress(recs, config());
    expect(p).toMatchObject({ count: 1, quorum: 2, met: false, remaining: 1 });
    expect(vouchProgressCopy(p)).toBe('1 of 2 vouches — 1 more needed.');
  });

  it('reports met once the quorum is reached', () => {
    const recs = normalizeVouchRecords([
      vouchRecord(),
      vouchRecord({ id: 'r2', voucher: BOB }),
    ]);
    const p = vouchProgress(recs, config());
    expect(p.met).toBe(true);
    expect(vouchProgressCopy(p)).toMatch(/qualified/);
  });

  it('renders nothing when vouching is off', () => {
    expect(vouchProgressCopy(vouchProgress([], normalizeVouchConfig({ quorum: 0 })))).toBeNull();
  });
});

describe('canVouch — the contract checks, replayed so the button explains itself', () => {
  const base = { config: config(), records: normalizeVouchRecords([]), target: CAROL, viewerIsVoucherMember: true };

  it('allows a member of the voucher subject who has not vouched yet', () => {
    expect(canVouch({ ...base, viewer: ALICE })).toEqual({ can: true, reason: null });
  });

  it('blocks a non-member of the voucher subject (the admin-fallback branch is DELETED)', () => {
    const r = canVouch({ ...base, viewer: ALICE, viewerIsVoucherMember: false });
    expect(r.can).toBe(false);
    expect(r.reason).toMatch(/Only members of Executives/);
  });

  it('blocks self-vouching', () => {
    expect(canVouch({ ...base, viewer: CAROL }).reason).toMatch(/cannot vouch for yourself/);
  });

  it('blocks a double vouch and points at revoke instead', () => {
    const records = normalizeVouchRecords([vouchRecord()]);
    expect(canVouch({ ...base, records, viewer: ALICE }).reason).toMatch(/already vouched/);
  });

  it('blocks while the authority is paused (pause gates WRITES)', () => {
    expect(canVouch({ ...base, viewer: ALICE, paused: true }).reason).toMatch(/paused/);
  });

  it('blocks when vouching is not configured', () => {
    expect(canVouch({ ...base, config: null, viewer: ALICE }).reason).toMatch(/not enabled/);
  });

  it('asks for a connected account', () => {
    expect(canVouch({ ...base, viewer: '' }).reason).toMatch(/Connect your account/);
  });
});

describe('config-time lints — warn BEFORE the vote is opened', () => {
  it('flags a vouch quorum on an OPEN role as a no-op', () => {
    const lints = predictLints({ defaultAllow: true, vouchQuorum: 2 });
    expect(lints.map((l) => l.code)).toContain('QuorumNoOp');
  });

  it('flags vouching combined with a seat cap (lapsed ghosts block grants)', () => {
    const lints = predictLints({ vouchQuorum: 2, maxMembers: 5 });
    expect(lints.map((l) => l.code)).toContain('VouchWithMaxMembers');
  });

  it('flags an open role carrying real power', () => {
    const lints = predictLints({ defaultAllow: true, hasStrongPerms: true });
    expect(lints.map((l) => l.code)).toContain('DefaultAllowStrongPerms');
  });

  it('flags self-vouching as a bootstrap hazard, not an error', () => {
    const lints = predictLints({ vouchQuorum: 2, subjectId: EXECS_ID, voucherSubjectId: EXECS_ID });
    const self = lints.find((l) => l.code === 'SelfVoucher');
    expect(self.message).toMatch(/EMPTY role cannot bootstrap/);
  });

  it('is silent on a clean config', () => {
    expect(predictLints({ defaultAllow: false, vouchQuorum: 0, maxMembers: 0 })).toEqual([]);
  });

  it('has copy for every lint code the contract can emit', () => {
    for (const name of Object.values(LINT_CODE)) {
      if (name === 'None') continue;
      expect(LINT_COPY[name], `missing copy for ${name}`).toBeTruthy();
    }
  });
});

describe('isMemberOfVoucherSubject', () => {
  // A vouch config whose voucherSubject is a GROUP is legal and works on chain: only the VOUCHED
  // subject may not be a group, and `vouch()` resolves `_isMember(cfg.voucherSubject, msg.sender)`
  // through the group's member roles. But SubjectMembership rows exist for roles only, so asking
  // the membership rows directly answers "no" for every group — a wrong-eligibility display that
  // disables the button for every legitimate voucher.
  const subjects = [
    { subjectId: MEMBERS_ID, isGroup: false, memberRoleIds: [] },
    { subjectId: EXECS_ID, isGroup: false, memberRoleIds: [] },
    { subjectId: EVERYONE_GROUP_ID, isGroup: true, memberRoleIds: [MEMBERS_ID, EXECS_ID] },
  ];
  const memberOf = (...ids) => (id) => ids.includes(String(id));

  it('resolves a ROLE voucher subject from the membership rows', () => {
    expect(isMemberOfVoucherSubject(EXECS_ID, subjects, memberOf(EXECS_ID))).toBe(true);
    expect(isMemberOfVoucherSubject(EXECS_ID, subjects, memberOf(MEMBERS_ID))).toBe(false);
  });

  it('resolves a GROUP voucher subject through its member roles', () => {
    expect(isMemberOfVoucherSubject(EVERYONE_GROUP_ID, subjects, memberOf(MEMBERS_ID))).toBe(true);
    expect(isMemberOfVoucherSubject(EVERYONE_GROUP_ID, subjects, memberOf(EXECS_ID))).toBe(true);
  });

  it('says no for a group the viewer holds none of the member roles of', () => {
    expect(isMemberOfVoucherSubject(EVERYONE_GROUP_ID, subjects, memberOf('12345'))).toBe(false);
  });

  it('says no for an EMPTY group (nothing to be a member of)', () => {
    const empty = [{ subjectId: EVERYONE_GROUP_ID, isGroup: true, memberRoleIds: [] }];
    expect(isMemberOfVoucherSubject(EVERYONE_GROUP_ID, empty, memberOf(MEMBERS_ID))).toBe(false);
  });

  it('falls back to the direct row when the subject list has not loaded yet', () => {
    expect(isMemberOfVoucherSubject(EXECS_ID, [], memberOf(EXECS_ID))).toBe(true);
    expect(isMemberOfVoucherSubject(EXECS_ID, undefined, memberOf(EXECS_ID))).toBe(true);
  });

  it('is false for an unset voucher subject or a missing predicate', () => {
    expect(isMemberOfVoucherSubject('0', subjects, memberOf(EXECS_ID))).toBe(false);
    expect(isMemberOfVoucherSubject(null, subjects, memberOf(EXECS_ID))).toBe(false);
    expect(isMemberOfVoucherSubject(EXECS_ID, subjects, undefined)).toBe(false);
  });

  it('unblocks the vouch button for a group voucher (the end-to-end symptom)', () => {
    const groupConfig = { ...config(), voucherSubjectId: EVERYONE_GROUP_ID, voucherSubjectName: 'Everyone' };
    const gate = canVouch({
      config: groupConfig,
      records: [],
      viewer: ALICE,
      target: CAROL,
      viewerIsVoucherMember: isMemberOfVoucherSubject(EVERYONE_GROUP_ID, subjects, memberOf(MEMBERS_ID)),
    });
    expect(gate).toEqual({ can: true, reason: null });
  });
});
