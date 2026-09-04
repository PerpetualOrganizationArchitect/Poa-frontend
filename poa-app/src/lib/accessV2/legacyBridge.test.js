import { describe, it, expect } from 'vitest';
import {
  V2_MATRIX_COLUMNS,
  buildV2MatrixView,
  buildV2LegacyRoles,
} from './legacyBridge';
import { PERM_KEYS } from './permKeys';

/**
 * A folded subject the way normalizeAuthoritySubjects hands them out: `own` are the subject's
 * OWN global rows, `groups` the folded group objects — permEffective folds own ∪ groups exactly
 * like normalize.foldGroupPerms (OR for the TM mask, any for booleans).
 */
function subject({ id, name, isGroup = false, own = {}, groups = [], vouch = false }) {
  const s = {
    subjectId: id,
    hatId: id,
    name,
    isGroup,
    groups,
    vouchConfig: vouch ? { enabled: true } : null,
    permGlobal: (key) => (own[key] ? { exists: true, value: String(own[key]) } : null),
  };
  s.permEffective = (key) => {
    let acc = BigInt(own[key] ?? 0);
    for (const g of groups) {
      const row = g.permGlobal?.(key);
      if (row?.exists) acc |= BigInt(row.value);
    }
    return acc.toString();
  };
  return s;
}

describe('legacyBridge', () => {
  it('column keys stay inside the legacy matrix vocabulary (SHORT_LABELS contract)', () => {
    for (const col of V2_MATRIX_COLUMNS) {
      expect(col.key).toBe(`${col.contractType}_${col.permissionRole}`);
    }
    expect(V2_MATRIX_COLUMNS.map((c) => c.key)).toContain('TaskManager_SelfReview');
    expect(V2_MATRIX_COLUMNS.map((c) => c.key)).not.toContain('TaskManager_SELF_REVIEW');
  });

  describe('buildV2MatrixView — a row must carry something distinct', () => {
    it('a role with its own perms and no groups renders plain own cells', () => {
      const member = subject({ id: '1', name: 'Member', own: { [PERM_KEYS.DD_VOTE]: 1, [PERM_KEYS.TM_PERMS]: 3 } });
      const view = buildV2MatrixView([member]);
      expect(view.rows.map((r) => r.name)).toEqual(['Member']);
      expect(view.matrix['1']).toEqual({
        DirectDemocracyVoting_Voter: true,
        TaskManager_Create: true,
        TaskManager_Claim: true,
      });
      expect(view.columns.map((c) => c.key)).toEqual([
        'DirectDemocracyVoting_Voter',
        'TaskManager_Create',
        'TaskManager_Claim',
      ]);
    });

    it('a perm-less role in a perm-less group is SILENT, not a dash-row (the KUBI board today)', () => {
      const execs = subject({ id: 'g', name: 'Executives', isGroup: true });
      const title = subject({ id: '2', name: 'Co-President', groups: [execs] });
      const view = buildV2MatrixView([title, execs]);
      expect(view.rows).toEqual([]);
      expect(view.hidden.silent).toEqual(['Co-President', 'Executives']);
      expect(view.hidden.inheritOnly).toEqual([]);
    });

    it('a role that only inherits is folded into its group with a pointer (inheritOnly)', () => {
      const execs = subject({ id: 'g', name: 'Executives', isGroup: true, own: { [PERM_KEYS.HV_CREATE]: 1 } });
      const title = subject({ id: '2', name: 'Co-President', groups: [execs] });
      const view = buildV2MatrixView([title, execs]);
      expect(view.rows.map((r) => r.name)).toEqual(['Executives']);
      expect(view.matrix.g).toEqual({ HybridVoting_Creator: true });
      expect(view.hidden.inheritOnly).toEqual([{ name: 'Co-President', groupNames: ['Executives'] }]);
    });

    it('a role with an ADDITION beyond its group shows the addition solid and the rest muted', () => {
      const execs = subject({ id: 'g', name: 'Executives', isGroup: true, own: { [PERM_KEYS.HV_CREATE]: 1 } });
      const treasurer = subject({
        id: '3',
        name: 'Treasurer',
        groups: [execs],
        own: { [PERM_KEYS.PAY_CREATE]: 1, [PERM_KEYS.HV_CREATE]: 1 }, // HV also own — but the group already covers it
      });
      const view = buildV2MatrixView([treasurer, execs]);
      expect(view.matrix['3']).toEqual({
        HybridVoting_Creator: 'inherited', // group-covered, even though an own row duplicates it
        PaymentManager_Payments: true, // the genuine addition
      });
      expect(view.rows.map((r) => r.name)).toEqual(['Treasurer', 'Executives']);
    });

    it('TM mask additions split per bit: own extra bits solid, group bits muted', () => {
      const execs = subject({ id: 'g', name: 'Executives', isGroup: true, own: { [PERM_KEYS.TM_PERMS]: 2 } });
      const lead = subject({ id: '4', name: 'Lead', groups: [execs], own: { [PERM_KEYS.TM_PERMS]: 4 } });
      const view = buildV2MatrixView([lead, execs]);
      expect(view.matrix['4']).toEqual({
        TaskManager_Claim: 'inherited',
        TaskManager_Review: true,
      });
    });
  });

  it('legacy role rows: roles first with live counts, groups after with derived counts', () => {
    const member = subject({ id: '1', name: 'Member', vouch: true });
    const title = subject({ id: '2', name: 'Co-President' });
    const execs = subject({ id: '3', name: 'Executives', isGroup: true });
    const membersOf = (id) => ({ 1: [{}, {}], 2: [{}] })[id] || [];
    const groupMembers = new Map([['3', ['0xaaa']]]);
    const rows = buildV2LegacyRoles({ roles: [member, title], groups: [execs], membersOf, groupMembers });
    expect(rows.map((r) => [r.name, r.memberCount, r.isGroup])).toEqual([
      ['Member', 2, false],
      ['Co-President', 1, false],
      ['Executives', 1, true],
    ]);
    expect(rows[0].vouchingEnabled).toBe(true);
  });
});
