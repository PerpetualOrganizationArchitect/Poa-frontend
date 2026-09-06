import { actionReasonCopy } from '@/lib/accessV2/rules';

/** A failed/missing preflight never fabricates eligibility from retired role tables. */
export function joinRoleState(preflight) {
  if (!preflight) return { canClaim: false, isMember: false, message: 'Checking whether you can join…' };
  if (preflight.error) return { canClaim: false, isMember: false, message: 'Could not check this role. Try again.' };
  const reason = actionReasonCopy(Number.isInteger(preflight.reason) ? preflight.reason : -1);
  return {
    // Renounced sticky governance grants remain claimable (MembershipAuthority.canClaim).
    canClaim: preflight.reason === 0 || preflight.reason === 10,
    isMember: reason.name === 'AlreadyMember',
    message: reason.name === 'AlreadyMember' ? 'You hold this role.' : reason.message || (reason.ok ? 'You can join this role.' : 'This role is unavailable.'),
  };
}
