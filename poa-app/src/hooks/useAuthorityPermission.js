import { useMemo } from 'react';
import { useAuthoritySubjects, useMyMemberships } from '@/hooks/accessV2';
import { subjectHoldsPerm } from '@/lib/voting/createGate';

/** Missing authority/membership data denies a write instead of consulting retired Hats tables. */
export function useAuthorityPermission(key) {
  const authority = useAuthoritySubjects();
  const membership = useMyMemberships();
  const loading = authority.authority.loading || authority.loading || membership.loading;
  const enabled = authority.enabled && !authority.error && !membership.error && !loading;
  const allowed = useMemo(() => {
    if (!enabled) return false;
    const mine = new Set(membership.myRoles.map(role => role.subjectId));
    return authority.roles.some(role => mine.has(role.subjectId) && subjectHoldsPerm(role, key));
  }, [enabled, authority.roles, membership.myRoles, key]);
  return { allowed, loading };
}
