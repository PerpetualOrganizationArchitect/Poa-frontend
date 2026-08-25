/**
 * useVouchCandidates — who is partway to a vouch quorum, per subject.
 *
 * Needed because a part-vouched person is INVISIBLE in the membership query: they are neither a
 * member nor claimable (the quorum has not tipped), so the only trace of them is their vouch
 * records. Without this the vouch UI would only appear once someone no longer needs vouches.
 *
 * Records are grouped by (subject, user) and stale-epoch rows are dropped here too — a reset epoch
 * strands records with no per-record event, so counting raw rows would overstate every candidate.
 */

import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_AUTHORITY_VOUCH_RECORDS } from '@/util/queries';
import { normalizeVouchRecords } from '@/lib/accessV2/vouch';
import { toSubjectId } from '@/lib/accessV2/ids';
import { useOrgAuthority } from './useOrgAuthority';

export function useVouchCandidates() {
  const { subgraphUrl } = usePOContext();
  const client = useSubgraphClient(subgraphUrl);
  const authority = useOrgAuthority();

  const { data, loading, error, refetch } = useQuery(FETCH_AUTHORITY_VOUCH_RECORDS, {
    variables: { authority: authority.address },
    skip: !authority.enabled || !authority.address,
    fetchPolicy: 'cache-and-network',
    client,
  });

  return useMemo(() => {
    const raw = data?.subjectVouchRecords || [];
    const records = normalizeVouchRecords(raw);
    const configEpochBySubject = new Map();
    raw.forEach((r, i) => {
      const sid = toSubjectId(r.subject?.subjectId ?? r.subject?.id);
      if (sid && r.config?.epoch !== undefined) configEpochBySubject.set(sid, String(r.config.epoch));
      records[i].subjectId = sid;
      records[i].subjectName = r.subject?.name || '';
    });

    const bySubject = new Map();
    for (const r of records) {
      if (!r.subjectId) continue;
      const epoch = configEpochBySubject.get(r.subjectId);
      // Stale-epoch records are dead with no event of their own.
      if (epoch !== undefined && String(r.epoch) !== epoch) continue;
      if (!bySubject.has(r.subjectId)) bySubject.set(r.subjectId, new Map());
      const users = bySubject.get(r.subjectId);
      if (!users.has(r.user)) users.set(r.user, []);
      users.get(r.user).push(r);
    }

    return {
      candidatesFor: (subjectId) => {
        const users = bySubject.get(String(subjectId));
        if (!users) return [];
        return [...users.entries()].map(([user, rows]) => ({ user, records: rows, count: rows.length }));
      },
      enabled: authority.enabled,
      loading: authority.enabled ? loading : false,
      error: authority.enabled ? error : null,
      refetch,
    };
  }, [data, authority.enabled, loading, error, refetch]);
}

export default useVouchCandidates;
