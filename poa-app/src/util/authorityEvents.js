/**
 * Which RefreshEvents can change a TaskManager authority input.
 *
 * Authority comes from three places — the visitor's hats (`user.currentHatIds`), a
 * project's managers (`_isPM`), and the per-hat role masks (`_permMask`) — and gates
 * that REFUSE an action must not conclude "you don't have it" out of a copy that is
 * mid-replacement. Between the event and its refetch landing, the answer we are
 * holding is known-suspect, so `permissionGate` (util/permissions) must report a
 * missing bit as pending rather than as a refusal.
 *
 * The lists are narrow on purpose. Treating *every* refetch as suspect would re-open
 * every gated control on ordinary activity — submitting a task, casting a vote,
 * finishing a module, or just alt-tabbing back — because those all refetch a document
 * for reasons that have nothing to do with authority. That would hand an unauthorised
 * member a live Claim button several times a session, which is the exact defect the
 * gate exists to remove. A poll or a tab-return catch-up is likewise NOT evidence that
 * anything changed; it is the same steady-state staleness every polling app carries.
 *
 * Kept here, next to a test that forces every RefreshEvent to be classified, so adding
 * a new grant event cannot silently miss the gate.
 */

import { RefreshEvent } from '@/util/refreshEvents';

/**
 * Events after which a project's managers or its role masks may have changed.
 * `setConfig(PROJECT_MANAGER, ...)`, `setProjectRolePerm` and `setConfig(ROLE_PERM, ...)`
 * are all executor-only in the app, so governance execution is the only in-app route —
 * plus createProject, which auto-adds its creator as a manager on-chain.
 */
export const PROJECT_AUTHORITY_EVENTS = [
  RefreshEvent.PROJECT_CREATED,
  RefreshEvent.PROJECT_DELETED,
  RefreshEvent.PROPOSAL_COMPLETED,
];

/**
 * Events after which the visitor's own hat set may have changed. A passing proposal can
 * mint or burn a hat, so PROPOSAL_COMPLETED appears in both lists.
 */
export const HAT_AUTHORITY_EVENTS = [
  RefreshEvent.MEMBER_JOINED,
  RefreshEvent.ROLE_CLAIMED,
  RefreshEvent.ROLE_VOUCHED,
  RefreshEvent.ROLE_VOUCH_REVOKED,
  RefreshEvent.PROPOSAL_COMPLETED,
];

/**
 * Every remaining event, listed explicitly rather than inferred, so that adding a new
 * RefreshEvent fails `authorityEvents.test.js` until someone decides which side it is on.
 */
export const NON_AUTHORITY_EVENTS = [
  RefreshEvent.PROPOSAL_CREATED,
  RefreshEvent.PROPOSAL_VOTED,
  RefreshEvent.TASK_CREATED,
  RefreshEvent.TASK_CLAIMED,
  RefreshEvent.TASK_SUBMITTED,
  RefreshEvent.TASK_COMPLETED,
  RefreshEvent.TASK_UPDATED,
  RefreshEvent.TASK_CANCELLED,
  RefreshEvent.TASK_REJECTED,
  RefreshEvent.TASK_APPLICATION_SUBMITTED,
  RefreshEvent.TASK_APPLICATION_APPROVED,
  RefreshEvent.TASK_ASSIGNED,
  RefreshEvent.TASK_UNCLAIMED,
  RefreshEvent.PROJECT_BUDGET_UPDATED,
  RefreshEvent.FOLDERS_UPDATED,
  RefreshEvent.ORGANIZER_HAT_UPDATED,
  RefreshEvent.MODULE_CREATED,
  RefreshEvent.MODULE_COMPLETED,
  RefreshEvent.TOKEN_REQUEST_CREATED,
  RefreshEvent.TOKEN_REQUEST_APPROVED,
  RefreshEvent.TOKEN_REQUEST_CANCELLED,
  RefreshEvent.METADATA_UPDATED,
  RefreshEvent.ROLE_APPLICATION_SUBMITTED,
  RefreshEvent.ROLE_APPLICATION_WITHDRAWN,
  RefreshEvent.TREASURY_DEPOSITED,
  RefreshEvent.GAS_POOL_DEPOSITED,
  RefreshEvent.USER_CREATED,
  RefreshEvent.USERNAME_CHANGED,
  RefreshEvent.PROFILE_UPDATED,
];

/**
 * Hold a "refetching" flag across a batch of refetches, releasing it only once EVERY one
 * has settled.
 *
 * The all-must-settle part is the whole point. Project managers and role masks live in two
 * different documents fetched by two independent requests, and the managers document is a
 * fraction of the size of the board (which drags every task and its metadata along), so it
 * reliably answers first. Releasing on the first — or on either one individually — would
 * re-arm the refusal while the other half of the grant was still in flight, which is the
 * same false denial the flag exists to prevent, just harder to see.
 *
 * `allSettled`, so a rejected refetch releases the flag rather than pinning it open: that
 * leaves the gate refusing on last-known data, which is the staleness the poll interval
 * already implies, instead of indefinitely trusting a grant that was never observed.
 *
 * @param {(v: boolean) => void} setFlag
 * @param {Array<() => Promise<any>>} refetchers
 * @returns {Promise<void>} resolves once the flag has been released (tests await this).
 */
export function trackAuthorityRefresh(setFlag, refetchers) {
  setFlag(true);
  return Promise.allSettled(refetchers.map((fn) => fn()))
    .then(() => { setFlag(false); });
}
