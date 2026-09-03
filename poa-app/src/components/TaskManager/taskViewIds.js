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
