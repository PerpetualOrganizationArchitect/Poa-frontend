// Resolve against the current project's complete columns, independently of the
// visible mobile tab or search results. Route changes may arrive one render
// before the selected project catches up, so both project IDs must agree.
export function selectTaskModal({ taskColumns, taskId, selectedProjectId, requestedProjectId }) {
  if (typeof taskId !== 'string' || !selectedProjectId || !Array.isArray(taskColumns)) return null;

  if (requestedProjectId !== undefined) {
    if (typeof requestedProjectId !== 'string') return null;
    try {
      if (decodeURIComponent(requestedProjectId) !== selectedProjectId) return null;
    } catch {
      return null;
    }
  }

  for (const column of taskColumns) {
    if (!Array.isArray(column?.tasks)) continue;
    const index = column.tasks.findIndex((task) =>
      task?.id === taskId && task.projectId === selectedProjectId,
    );
    if (index !== -1) return { task: column.tasks[index], columnId: column.id, index };
  }
  return null;
}
