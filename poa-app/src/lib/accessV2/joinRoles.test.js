import { describe, expect, it } from 'vitest';
import { joinRoleState } from '@/lib/accessV2/joinRoles';
describe('authority join preflights', () => {
  it.each([undefined, { error: true }, {}, { reason: null }, { reason: 3 }, { reason: 5 }, { reason: 6 }, { reason: 8 }, { reason: 9 }, { reason: 11 }, { reason: 99 }])('does not offer a claim for unavailable preflight %j', value => {
    expect(joinRoleState(value).canClaim).toBe(false);
  });
  it('offers a claim only for an explicit successful authority preflight', () => {
    expect(joinRoleState({ reason: 0 }).canClaim).toBe(true);
    expect(joinRoleState({ reason: 3 }).isMember).toBe(true);
  });
  it('lets a resigned member reclaim their sticky governance grant', () => {
    expect(joinRoleState({ reason: 10 })).toMatchObject({ canClaim: true, isMember: false });
  });
});
