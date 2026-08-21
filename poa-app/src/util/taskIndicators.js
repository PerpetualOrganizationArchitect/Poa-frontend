/**
 * Shared, pure task-indicator logic used by the filter predicate, the card /
 * row accents, and the "My Work" view — so every surface answers "is this mine"
 * and "does this need my review" identically.
 *
 * Review permission is resolved exactly as `completeTask` / `rejectTask` gate it
 * on-chain — `_checkPerm(pid, REVIEW)` = the REVIEW bit from the per-project /
 * global mask, OR being a manager of that project. Every consumer passes the
 * connected address so the manager half can be evaluated.
 */

import { projectTaskPermissions } from '@/util/permissions';

/** Task is "mine": assignee address matches, or claimer username matches. */
export function isTaskMine(task, address, graphUsername) {
  if (!task) return false;
  const addr = (address || '').toLowerCase();
  const claimed = (task.claimedBy || '').toLowerCase();
  if (addr && claimed && addr === claimed) return true;
  const gu = (graphUsername || '').toLowerCase();
  const cu = (task.claimerUsername || '').toLowerCase();
  if (gu && cu && gu === cu) return true;
  return false;
}

/** Whether the user can review tasks in this specific project. */
export function projectCanReview(project, userHatIds, address) {
  return projectTaskPermissions(project, userHatIds, address).canReview;
}

/**
 * True for an In Review task whose project the user can review.
 *
 * Pass `task` where you have it: `completeTask` additionally requires SELF_REVIEW
 * when the reviewer is the claimer (project managers exempt), so flagging your own
 * submission as "needs your review" advertises an action the app will refuse. The
 * card and row accents render this badge with no `isMine` guard of their own, so the
 * exclusion has to live here. Omitting `task` keeps the plain REVIEW answer, which is
 * what the "can I review anywhere at all" fold wants.
 */
export function taskNeedsReview(columnId, project, userHatIds, address, task) {
  if (columnId !== 'inReview') return false;
  const perms = projectTaskPermissions(project, userHatIds, address);
  if (!perms.canReview) return false;
  const claimer = (task?.claimedBy || '').toLowerCase();
  const me = (address || '').toLowerCase();
  if (claimer && me && claimer === me && !perms.canSelfReview) return false;
  return true;
}

/** True if the user can review in at least one project (chip/section gating). */
export function userCanReviewAnywhere(projectsData, userHatIds, address) {
  return (projectsData || []).some((p) => projectCanReview(p, userHatIds, address));
}

/** Whether one of my applications on an open task is still pending approval. */
export function hasPendingApplication(task, address, graphUsername) {
  if (!task || !Array.isArray(task.applicants)) return false;
  const addr = (address || '').toLowerCase();
  const gu = (graphUsername || '').toLowerCase();
  return task.applicants.some((a) => {
    if (!a || a.approved) return false;
    const aAddr = (a.address || '').toLowerCase();
    const aUser = (a.username || '').toLowerCase();
    return (addr && aAddr && aAddr === addr) || (gu && aUser && aUser === gu);
  });
}
