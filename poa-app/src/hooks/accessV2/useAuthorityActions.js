/**
 * useAuthorityActions — the direct (non-governance) authority writes, with notifications.
 *
 * Every one of these is sponsored: the user verbs (claim / renounce / vouch / revokeVouch) and the
 * manager verbs (delegated grant / offer / remove / unremove, finalize, cancel) all have rulebook
 * entries, so a passkey user pays nothing.
 *
 * `claim` passes the subject id as the paymaster hint. That is not optional for a first-time
 * claimer: the manager otherwise falls back to the hats the user already holds, and someone
 * claiming their FIRST role holds none.
 */

import { useCallback, useState } from 'react';
import { useWeb3Services, useTransactionWithNotification } from '@/hooks/useWeb3Services';
import { RefreshEvent } from '@/context/RefreshContext';
import { useOrgAuthority } from './useOrgAuthority';

export function useAuthorityActions() {
  const { membershipAuthority } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const authority = useOrgAuthority();
  const [busyKey, setBusyKey] = useState(null);

  const run = useCallback(
    async (key, fn, messages) => {
      if (!membershipAuthority || !authority.address) {
        return { success: false, error: new Error('We’re still getting things ready — please try again in a moment.') };
      }
      if (authority.paused) {
        // Pause gates WRITES only; reads stayed live, which is why the page still rendered.
        return { success: false, error: new Error('Membership changes are paused for this org right now.') };
      }
      setBusyKey(key);
      try {
        return await executeWithNotification(fn, messages);
      } finally {
        setBusyKey(null);
      }
    },
    [membershipAuthority, authority.address, authority.paused, executeWithNotification]
  );

  const claim = useCallback(
    (subjectId, roleName = 'role') =>
      run(`claim:${subjectId}`, () => membershipAuthority.claim(authority.address, subjectId), {
        pendingMessage: `Joining ${roleName}...`,
        successMessage: `You’re now in ${roleName}`,
        errorMessage: `Could not join ${roleName}`,
        refreshEvent: RefreshEvent.ROLE_CLAIMED,
        refreshData: { subjectId },
      }),
    [run, membershipAuthority, authority.address]
  );

  const renounce = useCallback(
    (subjectId, roleName = 'role') =>
      run(`renounce:${subjectId}`, () => membershipAuthority.renounce(authority.address, subjectId), {
        pendingMessage: `Leaving ${roleName}...`,
        successMessage: `You’ve left ${roleName}`,
        errorMessage: `Could not leave ${roleName}`,
        refreshEvent: RefreshEvent.ROLE_RENOUNCED,
        refreshData: { subjectId },
      }),
    [run, membershipAuthority, authority.address]
  );

  const vouch = useCallback(
    (subjectId, user) =>
      run(`vouch:${subjectId}:${user}`, () => membershipAuthority.vouch(authority.address, subjectId, user), {
        pendingMessage: 'Vouching...',
        successMessage: 'Vouch recorded',
        errorMessage: 'Could not record the vouch',
        refreshEvent: RefreshEvent.VOUCH_CHANGED,
        refreshData: { subjectId, user },
      }),
    [run, membershipAuthority, authority.address]
  );

  const revokeVouch = useCallback(
    (subjectId, user) =>
      run(`revoke:${subjectId}:${user}`, () => membershipAuthority.revokeVouch(authority.address, subjectId, user), {
        pendingMessage: 'Revoking your vouch...',
        successMessage: 'Vouch revoked',
        errorMessage: 'Could not revoke the vouch',
        refreshEvent: RefreshEvent.VOUCH_CHANGED,
        refreshData: { subjectId, user },
      }),
    [run, membershipAuthority, authority.address]
  );

  const delegatedGrant = useCallback(
    (subjectId, user) =>
      run(`grant:${subjectId}:${user}`, () => membershipAuthority.delegatedGrant(authority.address, subjectId, user), {
        pendingMessage: 'Adding them...',
        successMessage: 'Started — it takes effect after the review window',
        errorMessage: 'Could not add them',
        refreshEvent: RefreshEvent.MEMBERSHIP_PENDING,
        refreshData: { subjectId, user },
      }),
    [run, membershipAuthority, authority.address]
  );

  const delegatedOffer = useCallback(
    (subjectId, user) =>
      run(`offer:${subjectId}:${user}`, () => membershipAuthority.delegatedOffer(authority.address, subjectId, user), {
        pendingMessage: 'Sending the invitation...',
        successMessage: 'Invitation sent',
        errorMessage: 'Could not send the invitation',
        refreshEvent: RefreshEvent.MEMBERSHIP_PENDING,
        refreshData: { subjectId, user },
      }),
    [run, membershipAuthority, authority.address]
  );

  const delegatedRemove = useCallback(
    (subjectId, user, ban = false) =>
      run(
        `remove:${subjectId}:${user}`,
        () => membershipAuthority.delegatedRemove(authority.address, subjectId, user, ban),
        {
          pendingMessage: ban ? 'Blocking them...' : 'Removing them...',
          successMessage: 'Started — it takes effect after the review window',
          errorMessage: ban ? 'Could not block them' : 'Could not remove them',
          refreshEvent: RefreshEvent.MEMBERSHIP_PENDING,
          refreshData: { subjectId, user },
        }
      ),
    [run, membershipAuthority, authority.address]
  );

  const delegatedUnremove = useCallback(
    (subjectId, user) =>
      run(
        `unremove:${subjectId}:${user}`,
        () => membershipAuthority.delegatedUnremove(authority.address, subjectId, user),
        {
          pendingMessage: 'Unblocking them...',
          successMessage: 'Unblocked — they can take the role back themselves',
          errorMessage: 'Could not unblock them',
          refreshEvent: RefreshEvent.MEMBERSHIP_CHANGED,
          refreshData: { subjectId, user },
        }
      ),
    [run, membershipAuthority, authority.address]
  );

  const finalize = useCallback(
    (pendingId) =>
      run(`finalize:${pendingId}`, () => membershipAuthority.finalize(authority.address, pendingId), {
        pendingMessage: 'Applying...',
        successMessage: 'Done',
        errorMessage: 'Could not apply this yet',
        refreshEvent: RefreshEvent.MEMBERSHIP_CHANGED,
        refreshData: { pendingId },
      }),
    [run, membershipAuthority, authority.address]
  );

  const cancel = useCallback(
    (pendingId) =>
      run(`cancel:${pendingId}`, () => membershipAuthority.cancel(authority.address, pendingId), {
        pendingMessage: 'Cancelling...',
        successMessage: 'Cancelled',
        errorMessage: 'Could not cancel it',
        refreshEvent: RefreshEvent.MEMBERSHIP_CHANGED,
        refreshData: { pendingId },
      }),
    [run, membershipAuthority, authority.address]
  );

  const reconcile = useCallback(
    (subjectId, users) =>
      run(`reconcile:${subjectId}`, () => membershipAuthority.reconcile(authority.address, subjectId, users), {
        pendingMessage: 'Tidying up lapsed members...',
        successMessage: 'Done',
        errorMessage: 'Could not tidy up',
        refreshEvent: RefreshEvent.MEMBERSHIP_CHANGED,
        refreshData: { subjectId },
      }),
    [run, membershipAuthority, authority.address]
  );

  return {
    claim,
    renounce,
    vouch,
    revokeVouch,
    delegatedGrant,
    delegatedOffer,
    delegatedRemove,
    delegatedUnremove,
    finalize,
    cancel,
    reconcile,
    busyKey,
    isBusy: (key) => busyKey === key,
    enabled: authority.enabled,
    paused: authority.paused,
    authorityAddress: authority.address,
  };
}

export default useAuthorityActions;
