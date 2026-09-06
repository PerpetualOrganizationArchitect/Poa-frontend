import { describe, expect, it } from 'vitest';
import { normalizeAuthoritySubjects } from '@/lib/accessV2/normalize';
import { authorityTaskPermissionRows } from '@/lib/accessV2/taskPermissions';
import { PERM_KEYS, GLOBAL_CTX, encodePermWord } from '@/lib/accessV2/permKeys';
import { projectTaskPermissions } from '@/util/permissions';
import { membersSubject, everyoneGroup, MEMBERS_ID } from '@/lib/accessV2/fixtures';

const projectId = '0';
const projectContext = '0x' + '0'.repeat(63) + '1';
const perm = (value, ctx = GLOBAL_CTX, inheritGlobal = false) => ({ permKey: PERM_KEYS.TM_PERMS, ctx, word: encodePermWord({ value: BigInt(value), inheritGlobal }).toString() });
const role = perms => membersSubject({ perms, groups: [] });
const projected = raw => authorityTaskPermissionRows(normalizeAuthoritySubjects(raw).subjects, projectId);

describe('current authority task permissions', () => {
  it('inherits global masks only when there is no project override', () => {
    expect(projected([role([perm(33)])])[0]).toMatchObject({ mask: 33, canCreate: true, canBudget: true });
  });
  it('honors an explicit zero override instead of resurrecting the global grant', () => {
    const rows = projected([role([perm(255), perm(0, projectContext)])]);
    expect(rows[0].mask).toBe(0);
    const rights = projectTaskPermissions({ rolePermissions: rows, globalRolePermissions: [] }, [MEMBERS_ID], '0xabc');
    expect(rights.canCreate).toBe(false);
    expect(rights.canBudget).toBe(false);
  });
  it('combines global and project masks only with inheritGlobal', () => {
    expect(projected([role([perm(1), perm(2, projectContext, true)])])[0].mask).toBe(3);
    expect(projected([role([perm(1), perm(2, projectContext)])])[0].mask).toBe(2);
  });
  it('keeps project zero distinct from global and project one', () => {
    const subjects = normalizeAuthoritySubjects([role([perm(255), perm(0, projectContext), perm(4, '0x' + '0'.repeat(63) + '2')])]).subjects;
    expect(authorityTaskPermissionRows(subjects)[0].mask).toBe(255);
    expect(authorityTaskPermissionRows(subjects, '0')[0].mask).toBe(0);
    expect(authorityTaskPermissionRows(subjects, '1')[0].mask).toBe(4);
    expect(authorityTaskPermissionRows(subjects, '0x' + 'a'.repeat(40) + '-0')[0].mask).toBe(0);
  });
  it('keeps other project overrides isolated', () => {
    expect(projected([role([perm(1), perm(8, '0x' + 'b'.repeat(64))])])[0].mask).toBe(1);
  });
  it('folds a group’s own project override independently of the member role', () => {
    const rows = projected([
      membersSubject({ perms: [perm(1), perm(0, projectContext)] }),
      everyoneGroup({ perms: [perm(32), perm(4, projectContext, true)] }),
    ]);
    expect(rows.find(row => row.hatId === MEMBERS_ID).mask).toBe(36);
  });
  it('keeps the project-manager bypass but never grants a manager budget permission', () => {
    const rows = projected([role([perm(0)])]);
    const rights = projectTaskPermissions({ rolePermissions: rows, globalRolePermissions: [], managers: ['0xabc'] }, [MEMBERS_ID], '0xabc');
    expect(rights.canCreate).toBe(true);
    expect(rights.canBudget).toBe(false);
  });
});
