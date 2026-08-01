import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import { isTaskMine, taskNeedsReview } from '@/util/taskIndicators';

/**
 * Shared per-task indicator hook so the card, the list row, the filter chips,
 * and the My Work sections all answer "is this mine" / "does this need my
 * review" identically. Review permission is resolved from the task's project in
 * ProjectContext the same way TaskCardModal.js:127-151 does (project + global
 * role permissions, legacy hasExecRole fallback only when a project has none).
 *
 * `columnId` overrides task.columnId — the Board passes the column as a prop and
 * the raw task object may not carry it.
 *
 * @returns {{ isMine: boolean, needsMyReview: boolean }}
 */
export function useTaskIndicators(task, columnId) {
  const { accountAddress } = useAuth() || {};
  const {
    address: ctxAddress,
    graphUsername,
    userData,
    hasExecRole,
  } = useUserContext() || {};
  const { projectsData } = useProjectContext() || {};

  const address = accountAddress || ctxAddress || '';
  const userHatIds = userData?.hatIds || [];
  const col = columnId || task?.columnId;
  const projectId = task?.projectId;

  const project = useMemo(
    () => (projectsData || []).find((p) => p.id === projectId),
    [projectsData, projectId],
  );

  const isMine = useMemo(
    () => isTaskMine(task, address, graphUsername),
    [task, address, graphUsername],
  );

  const needsMyReview = useMemo(
    () => taskNeedsReview(col, project, userHatIds, hasExecRole),
    [col, project, userHatIds, hasExecRole],
  );

  return { isMine, needsMyReview };
}

export default useTaskIndicators;
