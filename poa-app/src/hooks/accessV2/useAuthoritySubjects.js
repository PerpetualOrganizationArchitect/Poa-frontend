/**
 * useAuthoritySubjects — the org's roles and groups, with their wiring.
 *
 * Feeds the roles/groups admin page, the create-role wizard's group picker, and the subject picker
 * for restricted polls. Returns a LEGACY-COMPATIBLE projection alongside the v2 shape: every role
 * also carries `hatId` / `name` / `image`, the fields `useRoleNames` and the role badges already
 * consume, because a migrated org ADOPTS its hatIds verbatim as subject ids.
 *
 * Silent when the org is not on the v2 path — no query, empty arrays.
 */

import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_AUTHORITY_SUBJECTS } from '@/util/queries';
import { normalizeSubjects, attachGroups, splitSubjects, subjectNameMap } from '@/lib/accessV2/subjects';
import { normalizeVouchConfig } from '@/lib/accessV2/vouch';
import { normalizeManagerConfig } from '@/lib/accessV2/pendingActions';
import { decodePermWord, permKeyName, PERM_KEYS, isGlobalCtx } from '@/lib/accessV2/permKeys';
import { useOrgAuthority } from './useOrgAuthority';

/** Decode a subject's perm rows into `{ byKey, rows }` and derive the legacy `canVote` flag. */
function attachPerms(subject, rawPerms = []) {
  const rows = (rawPerms || []).map((p) => ({
    id: p.id,
    permKey: p.permKey,
    keyName: permKeyName(p.permKey),
    ctx: p.ctx,
    isGlobalCtx: p.isGlobalCtx !== undefined ? Boolean(p.isGlobalCtx) : isGlobalCtx(p.ctx),
    foldTag: Number(p.foldTag ?? 0),
    ...decodePermWord(p.word),
  }));

  const byKey = {};
  for (const r of rows) {
    if (!r.exists) continue;
    const bucket = byKey[String(r.permKey).toLowerCase()] || (byKey[String(r.permKey).toLowerCase()] = []);
    bucket.push(r);
  }
  const globalOf = (key) => (byKey[String(key).toLowerCase()] || []).find((r) => r.isGlobalCtx) || null;

  return {
    ...subject,
    permRows: rows,
    permsByKey: byKey,
    permGlobal: globalOf,
    // Legacy-compatible: `canVote` was the pre-v2 role flag every roster/label consumer reads.
    canVote: Boolean(globalOf(PERM_KEYS.DD_VOTE)?.enabled),
    canCreateVote: Boolean(
      globalOf(PERM_KEYS.DD_CREATE)?.enabled || globalOf(PERM_KEYS.HV_CREATE)?.enabled
    ),
    taskMask: globalOf(PERM_KEYS.TM_PERMS)?.value ?? '0',
  };
}

export function useAuthoritySubjects() {
  const { subgraphUrl } = usePOContext();
  const client = useSubgraphClient(subgraphUrl);
  const authority = useOrgAuthority();

  const { data, loading, error, refetch } = useQuery(FETCH_AUTHORITY_SUBJECTS, {
    variables: { authority: authority.address },
    skip: !authority.migrated || !authority.address,
    fetchPolicy: 'cache-and-network',
    client,
  });

  const value = useMemo(() => {
    const raw = data?.membershipAuthorityContract?.subjects || [];
    // Group composition rows come back on both sides of the relation; one flat list is enough
    // (indexGroupCompositions de-dupes) and keeps the group derivation in ONE pure place.
    const compositions = raw.flatMap((s) => [...(s.memberRoles || []), ...(s.groups || [])]);

    const withGroups = attachGroups(normalizeSubjects(raw), compositions);
    const rawById = new Map(raw.map((s) => [String(s.subjectId ?? s.id), s]));

    const subjects = withGroups.map((s) => {
      const src = rawById.get(s.subjectId) || {};
      return {
        ...attachPerms(s, src.perms),
        vouchConfig: normalizeVouchConfig(src.vouchConfig),
        managerConfig: normalizeManagerConfig(src.managerConfig),
      };
    });

    const { roles, groups } = splitSubjects(subjects);
    return {
      subjects,
      roles,
      groups,
      compositions,
      // Legacy-shaped lookups so existing consumers can be pointed here unchanged.
      roleNames: subjectNameMap(subjects),
      roleHatIds: roles.map((r) => r.subjectId),
    };
  }, [data]);

  return {
    ...value,
    authority,
    enabled: authority.migrated,
    loading: authority.migrated ? loading : false,
    error: authority.migrated ? error : null,
    refetch,
  };
}

export default useAuthoritySubjects;
