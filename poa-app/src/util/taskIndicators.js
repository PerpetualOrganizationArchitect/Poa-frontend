/**
 * Shared, pure task-indicator logic used by the filter predicate, the card /
 * row accents, and the "My Work" view — so every surface answers "is this mine"
 * and "does this need my review" identically.
 *
 * Review-permission resolution mirrors TaskCardModal.js:127-151: read the
 * project's per-project + global role permissions, then fall back to the legacy
 * `hasExecRole` bypass ONLY when the project has no role permissions configured.
 */

import { userCanReviewTask } from '@/util/permissions';

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
export function projectCanReview(project, userHatIds, hasExecRole) {
  const projectRolePermissions = project?.rolePermissions || [];
  const globalRolePermissions = project?.globalRolePermissions || [];
  if (userCanReviewTask(userHatIds, projectRolePermissions, globalRolePermissions)) {
    return true;
  }
  // Legacy fallback: only when the project has no role permissions configured.
  if (!projectRolePermissions?.length && hasExecRole) return true;
  return false;
}

/** True for an In Review task whose project the user can review. */
export function taskNeedsReview(columnId, project, userHatIds, hasExecRole) {
  if (columnId !== 'inReview') return false;
  return projectCanReview(project, userHatIds, hasExecRole);
}

/** True if the user can review in at least one project (chip/section gating). */
export function userCanReviewAnywhere(projectsData, userHatIds, hasExecRole) {
  return (projectsData || []).some((p) => projectCanReview(p, userHatIds, hasExecRole));
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
