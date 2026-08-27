/**
 * The ballot's half of the electorate activation gate.
 *
 * `activationGate` itself is covered in `memberships.test.js`. What is covered HERE is the wiring
 * glue the ballot depends on and that no React harness in this repo can exercise: which rows count
 * as the electorate, and — much more important — every case in which the gate must stay SILENT.
 * A false positive here removes a ballot from a member who is entitled to vote.
 */

import { describe, it, expect } from 'vitest';
import { ballotActivation, electorateRows } from './ballotGate';
import { normalizeMembership } from './memberships';
import { aliceMembership, carolOffer, MEMBERS_ID, EXECS_ID } from './fixtures';

const CREATED = 1750000000;

/** An accepted, eligible membership of `subjectId` that activated at `t`. */
const memberAt = (t, subjectId = MEMBERS_ID) =>
  normalizeMembership(aliceMembership({
    acceptedAt: String(t),
    subject: { id: subjectId, subjectId, kind: 'Role', name: 'Role', defaultAllow: true, maxMembers: 0 },
  }));

const base = { enabled: true, loading: false, proposalCreatedAt: CREATED };

describe('electorateRows', () => {
  it('an unrestricted poll counts every role the viewer holds', () => {
    const rows = [memberAt(1, MEMBERS_ID), memberAt(1, EXECS_ID)];
    expect(electorateRows(rows, [])).toHaveLength(2);
    expect(electorateRows(rows, undefined)).toHaveLength(2);
  });

  it('a restricted poll narrows to the named subjects', () => {
    const rows = [memberAt(1, MEMBERS_ID), memberAt(1, EXECS_ID)];
    const scoped = electorateRows(rows, [EXECS_ID]);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].subjectId).toBe(EXECS_ID);
  });

  it('normalises ids on BOTH sides — a hex restriction matches a decimal row', () => {
    const rows = [memberAt(1, MEMBERS_ID)];
    const asHex = '0x' + BigInt(MEMBERS_ID).toString(16);
    expect(electorateRows(rows, [asHex])).toHaveLength(1);
  });

  it('an unparseable restriction id does not silently widen the electorate', () => {
    const rows = [memberAt(1, MEMBERS_ID), memberAt(1, EXECS_ID)];
    expect(electorateRows(rows, [EXECS_ID, 'not-an-id'])).toHaveLength(1);
  });
});

describe('ballotActivation — blocks only what the contract blocks', () => {
  it('blocks a member who joined AFTER the proposal, and says why', () => {
    const out = ballotActivation({ ...base, rows: [memberAt(CREATED + 5000)] });
    expect(out.blocked).toBe(true);
    expect(out.reason).toBe('joined-after-proposal');
    expect(out.message).toMatch(/You joined after this proposal was created/);
    expect(out.activeSince).toBe(CREATED + 5000);
  });

  it('lets a member who joined BEFORE the proposal through', () => {
    const out = ballotActivation({ ...base, rows: [memberAt(CREATED - 5000)] });
    expect(out.blocked).toBe(false);
    expect(out.message).toBeNull();
    expect(out.checked).toBe(true);
  });

  it('a ceremony-seeded member is never blocked (backdated on chain to acceptedAt = 1)', () => {
    const seeded = normalizeMembership(aliceMembership({
      acceptedAt: String(CREATED + 90000),
      seededWhilePaused: true,
    }));
    expect(ballotActivation({ ...base, rows: [seeded] }).blocked).toBe(false);
  });

  it('the EARLIEST qualifying role governs — a new role does not disqualify an old member', () => {
    const rows = [memberAt(CREATED + 5000, EXECS_ID), memberAt(CREATED - 5000, MEMBERS_ID)];
    expect(ballotActivation({ ...base, rows }).blocked).toBe(false);
  });

  it('scopes to the poll electorate: an old OTHER role does not rescue a new restricted one', () => {
    const rows = [memberAt(CREATED + 5000, EXECS_ID), memberAt(CREATED - 5000, MEMBERS_ID)];
    const out = ballotActivation({ ...base, rows, restrictedSubjectIds: [EXECS_ID] });
    expect(out.blocked).toBe(true);
    expect(out.electorateRows).toBe(1);
  });
});

describe('ballotActivation — degrades to silence rather than to a wrong "no"', () => {
  const cases = [
    ['a legacy org (authority not enabled)', { ...base, enabled: false, rows: [memberAt(CREATED + 5000)] }],
    ['the memberships query still in flight', { ...base, loading: true, rows: [memberAt(CREATED + 5000)] }],
    ['no rows for this viewer yet', { ...base, rows: [] }],
    ['rows omitted entirely', { ...base, rows: undefined }],
    ['a proposal with no creation timestamp', { ...base, rows: [memberAt(CREATED + 5000)], proposalCreatedAt: 0 }],
    ['a proposal whose timestamp is missing', { ...base, rows: [memberAt(CREATED + 5000)], proposalCreatedAt: undefined }],
    ['no input at all', undefined],
  ];

  for (const [label, input] of cases) {
    it(`stays silent for ${label}`, () => {
      const out = ballotActivation(input);
      expect(out.blocked).toBe(false);
      expect(out.message).toBeNull();
    });
  }

  it('NEVER reports "not a member" — votingDisplay.voterEligibility owns that copy', () => {
    // A viewer with rows but no membership in the electorate. Blocking here would put a second,
    // contradictory sentence next to the legacy one, and would fire on any org mid-index.
    const offer = normalizeMembership(carolOffer());
    const out = ballotActivation({ ...base, rows: [offer] });
    expect(out.checked).toBe(true);
    expect(out.blocked).toBe(false);
    expect(out.reason).toBeNull();
  });

  it('a poll restricted to a role the viewer does not hold is not "blocked" either', () => {
    const out = ballotActivation({
      ...base,
      rows: [memberAt(CREATED - 5000, MEMBERS_ID)],
      restrictedSubjectIds: [EXECS_ID],
    });
    expect(out.blocked).toBe(false);
    expect(out.electorateRows).toBe(0);
  });
});
