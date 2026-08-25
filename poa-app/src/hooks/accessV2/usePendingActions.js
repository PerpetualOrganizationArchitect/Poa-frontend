/**
 * usePendingActions — the delegation review window, made visible.
 *
 * The delay on a delegated grant/offer/removal is only a "review window" if the people it affects
 * can SEE it. This hook is that data source:
 *   • `againstMe`   — a pending removal or grant naming the connected user. A removal you cannot
 *                     see is a silent timer, not a review window.
 *   • `myOffers`    — invitations with a countdown; claim before `activatesAt` reverts NotYetActive.
 *   • `finalizable` — open entries past their anchor, i.e. the finalise queue.
 *   • `mine`        — entries this user started and can still cancel.
 *
 * A ticking `now` is kept in state so countdowns actually count down without every consumer
 * writing its own interval.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useAuth } from '@/context/AuthContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_PENDING_ACTIONS } from '@/util/queries';
import {
  normalizePendingActions,
  pendingAgainstUser,
  pendingByActor,
  finalizable as finalizableOf,
  secondsUntilActive,
  formatCountdown,
  pendingActionCopy,
  PENDING_KIND,
} from '@/lib/accessV2/pendingActions';
import { useOrgAuthority } from './useOrgAuthority';

const TICK_MS = 1000;

export function usePendingActions({ tick = true } = {}) {
  const { subgraphUrl } = usePOContext();
  const { accountAddress } = useAuth();
  const client = useSubgraphClient(subgraphUrl);
  const authority = useOrgAuthority();

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!tick) return undefined;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), TICK_MS);
    return () => clearInterval(t);
  }, [tick]);

  const { data, loading, error, refetch } = useQuery(FETCH_PENDING_ACTIONS, {
    variables: { authority: authority.address, status: 'Pending' },
    skip: !authority.migrated || !authority.address,
    fetchPolicy: 'cache-and-network',
    client,
  });

  const user = String(accountAddress || '').toLowerCase();

  return useMemo(() => {
    const rows = normalizePendingActions(data?.pendingActions || []).map((p) => ({
      ...p,
      secondsRemaining: secondsUntilActive(p, now),
      countdown: formatCountdown(secondsUntilActive(p, now)),
      copy: pendingActionCopy(p, user, now),
    }));

    const againstMe = pendingAgainstUser(rows, user);
    return {
      pending: rows,
      againstMe,
      myOffers: againstMe.filter((p) => p.action === PENDING_KIND.OFFER),
      againstMeRemovals: againstMe.filter((p) => p.action === PENDING_KIND.REMOVE),
      mine: pendingByActor(rows, user),
      finalizable: finalizableOf(rows, now),
      forSubject: (subjectId) => rows.filter((p) => p.subjectId === String(subjectId)),
      forUser: (addr) => rows.filter((p) => p.user === String(addr || '').toLowerCase()),
      now,
      enabled: authority.migrated,
      loading: authority.migrated ? loading : false,
      error: authority.migrated ? error : null,
      refetch,
    };
  }, [data, now, user, authority.migrated, loading, error, refetch]);
}

export default usePendingActions;
