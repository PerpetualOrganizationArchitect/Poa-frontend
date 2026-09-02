/**
 * useSubjectVouches — vouch records + quorum progress for one (subject, user).
 *
 * The count shown here is NOT a stored counter. `resetVouchEpoch` bumps the config epoch and every
 * record written at an older epoch stops counting WITHOUT any per-record event, and
 * `clearUserVouches` strands one user's records the same way — so the only honest count is
 * "records that are active AND at the current config epoch", which is what `vouchProgress` does.
 */

import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useAuth } from '@/context/AuthContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_SUBJECT_VOUCH_RECORDS } from '@/util/queries';
import { RefreshEvent, useRefreshSubscription } from '@/context/RefreshContext';
import {
  normalizeVouchRecords,
  normalizeVouchConfig,
  vouchProgress,
  vouchProgressCopy,
  canVouch,
  hasVouched,
  isMemberOfVoucherSubject,
} from '@/lib/accessV2/vouch';
import { useOrgAuthority } from './useOrgAuthority';
import { useAuthoritySubjects } from './useAuthoritySubjects';
import { useMyMemberships } from './useAuthorityMemberships';

export function useSubjectVouches(subjectId, targetUser) {
  const { subgraphUrl } = usePOContext();
  const { accountAddress } = useAuth();
  const client = useSubgraphClient(subgraphUrl);
  const authority = useOrgAuthority();
  const { subjects } = useAuthoritySubjects();
  const { isMemberOf } = useMyMemberships();

  const subject = useMemo(
    () => (subjects || []).find((s) => s.subjectId === String(subjectId)) || null,
    [subjects, subjectId]
  );

  const user = String(targetUser || '').toLowerCase();

  const { data, loading, error, refetch } = useQuery(FETCH_SUBJECT_VOUCH_RECORDS, {
    variables: { subject: String(subjectId || ''), user },
    skip: !authority.enabled || !subjectId || !user,
    fetchPolicy: 'cache-and-network',
    client,
  });

  useRefreshSubscription(
    [RefreshEvent.VOUCH_CHANGED, RefreshEvent.PROPOSAL_COMPLETED],
    () => {
      if (authority.enabled && subjectId && user) refetch?.();
    },
    [authority.enabled, subjectId, user, refetch]
  );

  return useMemo(() => {
    const rawRecords = data?.subjectVouchRecords || [];
    const records = normalizeVouchRecords(rawRecords);
    // Prefer the subject's own config (it carries the voucher subject NAME); fall back to the
    // config embedded on a record so a stale subject list cannot blank the progress bar.
    const config = subject?.vouchConfig
      || normalizeVouchConfig(rawRecords.find((r) => r.config)?.config)
      || null;

    const progress = vouchProgress(records, config);
    const viewer = String(accountAddress || '').toLowerCase();
    // Group-aware: a voucher subject may be a GROUP, which has no membership rows of its own.
    const viewerIsVoucherMember = isMemberOfVoucherSubject(config?.voucherSubjectId, subjects, isMemberOf);

    return {
      subject,
      config,
      records,
      progress,
      progressCopy: vouchProgressCopy(progress),
      viewerHasVouched: hasVouched(records, config, viewer),
      vouchGate: canVouch({
        config,
        records,
        viewer,
        target: user,
        viewerIsVoucherMember,
        paused: authority.paused,
      }),
      enabled: authority.enabled,
      loading: authority.enabled ? loading : false,
      error: authority.enabled ? error : null,
      refetch,
    };
  }, [data, subject, subjects, accountAddress, isMemberOf, user, authority.enabled, authority.paused, loading, error, refetch]);
}

export default useSubjectVouches;
