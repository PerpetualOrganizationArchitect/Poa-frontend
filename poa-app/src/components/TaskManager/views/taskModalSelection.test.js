import { describe, expect, it } from 'vitest';
import { selectTaskModal } from './taskModalSelection';

const projectId = '0xabc-1';
const inProgressTask = { id: '0xabc-3', projectId };
const completedTask = { id: '0xabc-4', projectId };
const taskColumns = [
  { id: 'open', tasks: [] },
  { id: 'inProgress', tasks: [inProgressTask] },
  { id: 'inReview', tasks: [] },
  { id: 'completed', tasks: [completedTask] },
];
const select = (overrides) => selectTaskModal({
  taskColumns,
  taskId: completedTask.id,
  selectedProjectId: projectId,
  requestedProjectId: projectId,
  ...overrides,
});

describe('task modal selection', () => {
  it('resolves a deep link to a task outside the initially visible Open column', () => {
    expect(select()).toEqual({ task: completedTask, columnId: 'completed', index: 0 });
  });

  it('uses the real In Progress task and edit index for an Open takeover shortcut', () => {
    expect(select({ taskId: inProgressTask.id })).toEqual({
      task: inProgressTask, columnId: 'inProgress', index: 0,
    });
  });

  it('drops the modal when browser Back removes the task query', () => {
    expect(select({ taskId: undefined })).toBeNull();
  });

  it('waits for the selected project to catch up with a route change', () => {
    expect(select({ requestedProjectId: '0xabc-2' })).toBeNull();
  });

  it('rejects a task from another project even if its ID matches', () => {
    expect(select({ taskColumns: [{ id: 'open', tasks: [{ ...completedTask, projectId: '0xabc-2' }] }] })).toBeNull();
  });

  it('ignores invalid query values without throwing', () => {
    expect(select({ taskId: [completedTask.id] })).toBeNull();
    expect(select({ requestedProjectId: [projectId] })).toBeNull();
    expect(select({ requestedProjectId: '%' })).toBeNull();
    expect(select({ taskColumns: undefined })).toBeNull();
  });

  it('keeps the current task column and index after a status change', () => {
    expect(select({ taskColumns: [{ id: 'inReview', tasks: [inProgressTask, completedTask] }] })).toEqual({
      task: completedTask, columnId: 'inReview', index: 1,
    });
  });
});
