import { describe, expect, it } from 'vitest';
import {
  ALL_TASKS_ID,
  MY_WORK_ID,
  getProjectNavigationQuery,
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
