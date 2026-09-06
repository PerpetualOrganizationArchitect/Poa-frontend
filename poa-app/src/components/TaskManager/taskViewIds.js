// Sentinel projectId values used in the /tasks URL to select the cross-project
// "All Tasks" and personal "My Work" surfaces instead of a real project. Kept in
// a dependency-free leaf module so lightweight consumers (e.g. the profile page)
// can import the constant without pulling the whole TaskManager tree into their
// page bundle. Kept short + URL-safe.
export const ALL_TASKS_ID = '__all__';
export const MY_WORK_ID = '__mine__';

export const isCrossProjectTaskView = (projectId) =>
  projectId === ALL_TASKS_ID || projectId === MY_WORK_ID;

// All Tasks may temporarily force Board users into List because a cross-project
// kanban is not supported. Do not carry that fallback into the next real
// project: dropping `view` lets useViewMode restore the user's saved project
// preference. Normal project-to-project navigation still preserves `view`.
export const getProjectNavigationQuery = (query = {}) => {
  const nextQuery = { ...query };
  if (isCrossProjectTaskView(query.projectId)) delete nextQuery.view;
  return nextQuery;
};

// Resolve a task-only deep link before choosing a default surface. Projects
// belong to the active org; searching their columns cannot select another org.
export const getInitialTaskSelection = ({ query = {}, projects = [], isMobile = false }) => {
  if (query.projectId !== undefined) {
    if (typeof query.projectId !== 'string') return null;
    try {
      return { projectId: decodeURIComponent(query.projectId) };
    } catch {
      return null;
    }
  }

  if (!Array.isArray(projects) || projects.length === 0) return null;

  if (query.task !== undefined) {
    if (typeof query.task !== 'string' || !query.task) return null;
    const project = projects.find((candidate) => candidate?.columns?.some((column) =>
      column?.tasks?.some((task) => task?.id === query.task && task.projectId === candidate.id),
    ));
    // Keep an unresolved task URL intact while the indexer catches up.
    if (!project) return null;
    return { projectId: project.id, query: { ...query, projectId: project.id } };
  }

  if (isMobile) {
    return {
      projectId: ALL_TASKS_ID,
      query: { ...query, projectId: ALL_TASKS_ID, view: 'list' },
    };
  }
  return { projectId: projects[0].id };
};
