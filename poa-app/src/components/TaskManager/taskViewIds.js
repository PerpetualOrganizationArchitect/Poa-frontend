// Sentinel projectId values used in the /tasks URL to select the cross-project
// "All Tasks" and personal "My Work" surfaces instead of a real project. Kept in
// a dependency-free leaf module so lightweight consumers (e.g. the profile page)
// can import the constant without pulling the whole TaskManager tree into their
// page bundle. Kept short + URL-safe.
export const ALL_TASKS_ID = '__all__';
export const MY_WORK_ID = '__mine__';
