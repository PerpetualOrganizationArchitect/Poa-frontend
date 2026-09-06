import { projectCtx } from '@/lib/accessV2/proposalBuilders';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';

const BITS = { canCreate: 1, canClaim: 2, canReview: 4, canAssign: 8, canSelfReview: 16, canBudget: 32, canEditMeta: 64, canEditFull: 128 };

/** Adapt CURRENT authority permissions to board row shapes. History stays in the graph untouched. */
export function authorityTaskPermissionRows(subjects, projectId = null) {
  let ctx;
  try { ctx = projectCtx(projectId); } catch { return []; }
  return (subjects || []).filter(subject => !subject.isGroup).map(subject => {
    let mask = 0;
    try { mask = Number(BigInt(subject.permEffective(PERM_KEYS.TM_PERMS, ctx)) & 255n); } catch {}
    return { hatId: subject.subjectId, mask, ...Object.fromEntries(Object.entries(BITS).map(([name, bit]) => [name, (mask & bit) !== 0])) };
  });
}
