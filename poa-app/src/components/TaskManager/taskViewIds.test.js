import { describe, expect, it } from 'vitest';
import {
  ALL_TASKS_ID,
  MY_WORK_ID,
  getProjectNavigationQuery,
  getInitialTaskSelection,
} from './taskViewIds';

describe('getProjectNavigationQuery', () => {
  it('drops the temporary All Tasks view when returning to a project', () => {
    expect(
      getProjectNavigationQuery({
        projectId: ALL_TASKS_ID,
        view: 'list',
        org: 'example',
        filters: 'open',
      }),
    ).toEqual({ projectId: ALL_TASKS_ID, org: 'example', filters: 'open' });
  });

  it('drops a view mode from other cross-project surfaces', () => {
    expect(
      getProjectNavigationQuery({ projectId: MY_WORK_ID, view: 'list', org: 'example' }),
    ).toEqual({ projectId: MY_WORK_ID, org: 'example' });
  });

  it('preserves the active view during normal project-to-project navigation', () => {
    expect(
      getProjectNavigationQuery({ projectId: 'project-a', view: 'gantt', org: 'example' }),
    ).toEqual({ projectId: 'project-a', view: 'gantt', org: 'example' });
  });
});

describe('getInitialTaskSelection', () => {
  const task = { id: '0xabc-4', projectId: '0xabc-2' };
  const projects = [
    { id: '0xabc-1', columns: [{ id: 'open', tasks: [] }] },
    { id: '0xabc-2', columns: [{ id: 'completed', tasks: [task] }] },
  ];

  it.each([true, false])('resolves task-only links to their own project (mobile=%s)', (isMobile) => {
    const query = { org: 'example', task: task.id, view: 'board', q: 'search', filters: 'mine' };
    expect(getInitialTaskSelection({ query, projects, isMobile })).toEqual({
      projectId: task.projectId,
      query: { ...query, projectId: task.projectId },
    });
  });

  it('keeps unresolved task links intact instead of applying the mobile default', () => {
    expect(getInitialTaskSelection({ query: { task: '0xother-1' }, projects, isMobile: true })).toBeNull();
  });

  it('preserves search/filter query values when defaulting mobile to All Tasks', () => {
    const query = { org: 'example', q: 'search', filters: 'mine' };
    expect(getInitialTaskSelection({ query, projects, isMobile: true })).toEqual({
      projectId: ALL_TASKS_ID,
      query: { ...query, projectId: ALL_TASKS_ID, view: 'list' },
    });
  });

  it('keeps explicit project and cross-project selections unchanged', () => {
    for (const projectId of [projects[0].id, ALL_TASKS_ID, MY_WORK_ID]) {
      expect(getInitialTaskSelection({ query: { projectId }, projects, isMobile: true })).toEqual({ projectId });
    }
  });

  it('retains the first-project desktop default when there is no task link', () => {
    expect(getInitialTaskSelection({ projects })).toEqual({ projectId: projects[0].id });
  });

  it('ignores invalid query values', () => {
    expect(getInitialTaskSelection({ query: { projectId: '%' }, projects })).toBeNull();
    expect(getInitialTaskSelection({ query: { task: [task.id] }, projects })).toBeNull();
  });
});
