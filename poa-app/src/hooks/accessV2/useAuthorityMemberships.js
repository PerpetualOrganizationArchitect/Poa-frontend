/**
 * useAuthorityMemberships — the org-wide fold mirror, and one user's slice of it.
 *
 * ZERO eth_calls. `eligible` / `eligibilitySource` / `isMember` / `claimable` are recomputed by the
 * subgraph mapping on every relevant event, exactly mirroring the contract's fold — including
 * across the event-lag window (a vouch epoch reset or a subject-default flip emits only a config
 * event on chain; the mapping re-folds every accepted row itself, so the app never renders members
 * who silently lapsed).
 */

import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useAuth } from '@/context/AuthContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_AUTHORITY_MEMBERSHIPS, FETCH_USER_MEMBERSHIPS } from '@/util/queries';
import {
  normalizeMemberships,
  claimableMemberships,
  activeMemberships,
  groupBySubject,
} from '@/lib/accessV2/memberships';
import { normalizeRule } from '@/lib/accessV2/rules';
import { indexGroupCompositions, deriveGroupMembers } from '@/lib/accessV2/subjects';
import { useOrgAuthority } from './useOrgAuthority';
import { useAuthoritySubjects } from './useAuthoritySubjects';

const withRule = (m, raw) => ({ ...m, rule: normalizeRule(raw?.rule) });

/** Every membership row that matters in the org (a member, or a claimable seat). */
export function useAuthorityMemberships() {
  const { subgraphUrl } = usePOContext();
  const client = useSubgraphClient(subgraphUrl);
  const authority = useOrgAuthority();
  const { compositions, groups } = useAuthoritySubjects();

  const { data, loading, error, refetch } = useQuery(FETCH_AUTHORITY_MEMBERSHIPS, {
    variables: { authority: authority.address },
    skip: !authority.migrated || !authority.address,
    fetchPolicy: 'cache-and-network',
    client,
  });

  const value = useMemo(() => {
    const raw = data?.subjectMemberships || [];
    const rows = normalizeMemberships(raw).map((m, i) => withRule(m, raw[i]));
    const bySubject = groupBySubject(rows);

    // GROUPS ARE NOT TOKENS — there is no per-user group enumeration on chain and no group
    // TransferSingle, so group rosters are derived here the same way the contract derives them.
    const { rolesByGroup } = indexGroupCompositions(compositions);
    const groupMembers = new Map(
      (groups || []).map((g) => [g.subjectId, deriveGroupMembers(g.subjectId, rolesByGroup, rows)])
    );

    return {
      memberships: rows,
      members: activeMemberships(rows),
      membershipsBySubject: bySubject,
      groupMembers,
      membersOf: (subjectId) => {
        const direct = bySubject.get(String(subjectId));
        if (direct) return direct.filter((m) => m.isMember);
        return [];
      },
    };
  }, [data, compositions, groups]);

  return {
    ...value,
    loading: authority.migrated ? loading : false,
    error: authority.migrated ? error : null,
    enabled: authority.migrated,
    refetch,
  };
}

/**
 * One user's rows — "my roles" plus the CLAIMABLE panel.
 *
 * Claimable rows each carry WHY (offer / open role / vouch quorum / email verification /
 * a resigned-but-sticky seat held in reserve), straight from `eligibilitySource`. That badge is
 * not decoration: it is the difference between "accept this invitation" and "this role is open to
 * everyone", and between a seat you can take back and one you cannot.
 */
export function useMyMemberships(addressOverride) {
  const { subgraphUrl } = usePOContext();
  const { accountAddress } = useAuth();
  const client = useSubgraphClient(subgraphUrl);
  const authority = useOrgAuthority();

  const user = String(addressOverride || accountAddress || '').toLowerCase();

  const { data, loading, error, refetch } = useQuery(FETCH_USER_MEMBERSHIPS, {
    variables: { authority: authority.address, user },
    skip: !authority.migrated || !authority.address || !user,
    fetchPolicy: 'cache-and-network',
    client,
  });

  const value = useMemo(() => {
    const raw = data?.subjectMemberships || [];
    const rows = normalizeMemberships(raw).map((m, i) => withRule(m, raw[i]));
    return {
      rows,
      myRoles: activeMemberships(rows),
      claimable: claimableMemberships(rows),
      // A row that is neither a member nor claimable is the ANSWER to "why can't I see this role"
      // — usually an explicit ban. Surfacing it is what keeps support tickets out of the loop.
      blocked: rows.filter((m) => !m.isMember && !m.claimable && m.ruleKind === 'Ban'),
      isMemberOf: (subjectId) => rows.some((m) => m.subjectId === String(subjectId) && m.isMember),
    };
  }, [data]);

  return {
    ...value,
    user,
    loading: authority.migrated ? loading : false,
    error: authority.migrated ? error : null,
    enabled: authority.migrated,
    paused: authority.paused,
    refetch,
  };
}

export default useAuthorityMemberships;
