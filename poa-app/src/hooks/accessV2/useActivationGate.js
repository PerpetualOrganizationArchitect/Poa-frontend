/**
 * useActivationGate — "can this member vote on THIS proposal, given when they joined?"
 *
 * A thin wrapper. It adds NO query of its own: it reuses `useMyMemberships` (already mounted by
 * the claimable-roles panel) and hands its rows to the pure `lib/accessV2/ballotGate`, where the
 * rule and every degrade-to-silence case live and are unit-tested.
 *
 * On a legacy org `useMyMemberships().enabled` is false, the rows are empty, and this returns the
 * silent answer — the ballot renders exactly as it does today.
 */

import { useMemo } from 'react';
import { ballotActivation } from '@/lib/accessV2/ballotGate';
import { useMyMemberships } from './useAuthorityMemberships';

/**
 * @param {object} poll - a transformed proposal (VotingContext): `startTimestamp`,
 *   `isHatRestricted`, `restrictedHatIds`
 */
export function useActivationGate(poll) {
  const { rows, loading, enabled } = useMyMemberships();

  const restrictedSubjectIds = poll?.isHatRestricted ? (poll?.restrictedHatIds || []) : [];
  // Depend on the joined ids, not the array identity: VotingContext rebuilds the poll object on
  // every refresh, and an identity dependency would re-run the fold on every render.
  const restrictionKey = restrictedSubjectIds.join(',');

  return useMemo(
    () => ballotActivation({
      enabled,
      loading,
      rows,
      restrictedSubjectIds: restrictionKey ? restrictionKey.split(',') : [],
      proposalCreatedAt: poll?.startTimestamp,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, loading, rows, restrictionKey, poll?.startTimestamp]
  );
}

export default useActivationGate;
