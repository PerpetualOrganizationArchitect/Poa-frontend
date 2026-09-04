import { describe, it, expect } from 'vitest';
import {
  V2_MATRIX_COLUMNS,
  buildV2PermissionColumns,
  buildV2PermissionsMatrix,
  buildV2LegacyRoles,
  buildV2MembersByRole,
} from './legacyBridge';
import { PERM_KEYS } from './permKeys';

/** A folded subject the way normalizeAuthoritySubjects hands them out. */
function subject({ id, name, isGroup = false, effective = {}, vouch = false, active = 0 }) {
  return {
    subjectId: id,
    hatId: id,
    name,
    isGroup,
    activeMemberCount: active,
    vouchConfig: vouch ? { enabled: true } : null,
    permEffective: (key) => String(effective[key] ?? 0),
  };
}

const MEMBER = subject({
  id: '1',
  name: 'Member',
  effective: { [PERM_KEYS.DD_VOTE]: 1, [PERM_KEYS.TM_PERMS]: 1 | 2 },
  vouch: true,
});
// A board title with no perms of its own — the shape every KUBI title role has.
const TITLE = subject({ id: '2', name: 'Co-President' });
const EXECS = subject({ id: '3', name: 'Executives', isGroup: true });

const membersOf = (id) =>
  ({
    1: [
      { user: '0xaaa', username: 'alice', isMember: true },
      { user: '0xbbb', username: 'bob', isMember: true },
    ],
    2: [{ user: '0xaaa', username: 'alice', isMember: true }],
    3: [],
  })[id] || [];
const groupMembers = new Map([['3', ['0xaaa']]]);

describe('legacyBridge', () => {
  it('column keys stay inside the legacy matrix vocabulary (SHORT_LABELS contract)', () => {
    // PermissionsMatrix resolves headers by column key; an unknown key renders a raw enum id.
    for (const col of V2_MATRIX_COLUMNS) {
      expect(col.key).toBe(`${col.contractType}_${col.permissionRole}`);
    }
    expect(V2_MATRIX_COLUMNS.map((c) => c.key)).toContain('TaskManager_SelfReview');
    expect(V2_MATRIX_COLUMNS.map((c) => c.key)).not.toContain('TaskManager_SELF_REVIEW');
  });

  it('only columns somebody grants get a header, like the legacy builder', () => {
    const cols = buildV2PermissionColumns([MEMBER, TITLE, EXECS]);
    expect(cols.map((c) => c.key)).toEqual([
      'DirectDemocracyVoting_Voter',
      'TaskManager_Create',
      'TaskManager_Claim',
    ]);
  });

  it('matrix rows read the FOLDED value, mask bits split into their own columns', () => {
    const matrix = buildV2PermissionsMatrix([MEMBER, TITLE, EXECS]);
    expect(matrix['1']).toEqual({
      DirectDemocracyVoting_Voter: true,
      TaskManager_Create: true,
      TaskManager_Claim: true,
    });
    expect(matrix['2']).toEqual({}); // a perm-less title role is honestly empty
  });

  it('legacy role rows: roles first with live counts, groups after with derived counts', () => {
    const rows = buildV2LegacyRoles({ roles: [MEMBER, TITLE], groups: [EXECS], membersOf, groupMembers });
    expect(rows.map((r) => [r.name, r.memberCount, r.isGroup])).toEqual([
      ['Member', 2, false],
      ['Co-President', 1, false],
      ['Executives', 1, true],
    ]);
    expect(rows[0].vouchingEnabled).toBe(true);
    expect(rows[1].vouchingEnabled).toBe(false);
  });

  it('membersByRole joins v2 rosters to legacy stat records by address, minimal fallback otherwise', () => {
    const legacy = {
      '0xdeadhat': [
        { id: 'u1', address: '0xAAA', username: 'alice', participationTokenBalance: '42', totalVotes: 7 },
      ],
    };
    const grouped = buildV2MembersByRole({
      roles: [MEMBER, TITLE],
      groups: [EXECS],
      membersOf,
      groupMembers,
      legacyMembersByRole: legacy,
    });
    // alice keeps her rich legacy record (joined by address, case-insensitive)…
    expect(grouped['1'][0].participationTokenBalance).toBe('42');
    // …bob has no legacy record and degrades to a minimal one instead of vanishing
    expect(grouped['1'][1]).toMatchObject({ address: '0xbbb', username: 'bob' });
    // group rosters come from the derived member set
    expect(grouped['3']).toHaveLength(1);
    expect(grouped['3'][0].participationTokenBalance).toBe('42');
  });
});
