import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { RefreshEvent, useRefreshSubscription } from '@/context/RefreshContext';
import { useAuthoritySubjects } from '@/hooks/accessV2';
import { useWeb3Services } from '@/hooks/useWeb3Services';

/** Preflight every public role: newcomers have no indexed membership row until their first event. */
export function useAuthorityJoinRoles() {
  const { accountAddress } = useAuth();
  const { roles, authority, loading, error } = useAuthoritySubjects();
  const { membershipAuthority } = useWeb3Services();
  const [result, setResult] = useState({ key: null, states: {} });
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const key = `${authority.address || ''}:${accountAddress || ''}:${roles.map(role => role.subjectId).join(',')}`;
  const refetch = useCallback(() => setRevision(value => value + 1), []);
  useRefreshSubscription(
    [RefreshEvent.ROLE_CLAIMED, RefreshEvent.VOUCH_CHANGED, RefreshEvent.MEMBERSHIP_CHANGED, RefreshEvent.PROPOSAL_COMPLETED],
    refetch,
    [refetch],
  );
  useEffect(() => {
    const request = ++generation.current;
    if (!authority.enabled || !accountAddress || !membershipAuthority) return;
    let cancelled = false;
    Promise.all(roles.map(async role => {
      try {
        return [role.subjectId, await membershipAuthority.canClaim(authority.address, role.subjectId, accountAddress)];
      } catch {
        return [role.subjectId, { error: true }];
      }
    })).then(entries => {
      if (!cancelled && request === generation.current) setResult({ key, states: Object.fromEntries(entries) });
    });
    return () => { cancelled = true; };
  }, [key, roles, authority.enabled, authority.address, accountAddress, membershipAuthority, revision]);
  return { roles, authority, loading, error, states: result.key === key ? result.states : {}, refetch };
}
