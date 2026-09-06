import { describe, expect, it, vi } from 'vitest';
import { fetchOrgTaskCounts } from './orgTaskCounts';

const respond = tasks => ({ ok: true, json: async () => ({ data: { tasks } }) });

describe('fetchOrgTaskCounts', () => {
  it('separates open from total tasks and keeps counts per manager', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond([
      { id: 'a-1', taskManager: 'a', status: 'Open' },
      { id: 'a-2', taskManager: 'a', status: 'Assigned' },
      { id: 'a-3', taskManager: 'a', status: 'Submitted' },
      { id: 'a-4', taskManager: 'a', status: 'Completed' },
      { id: 'b-1', taskManager: 'b', status: 'Open' },
    ]));

    await expect(fetchOrgTaskCounts('/registry', ['a', 'b', 'empty'], fetchImpl)).resolves.toEqual({
      a: { open: 1, total: 4 },
      b: { open: 1, total: 1 },
      empty: { open: 0, total: 0 },
    });
  });

  it('counts beyond the first thousand tasks using the last ID as its cursor', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `a-${String(index).padStart(4, '0')}`, taskManager: 'a', status: 'Completed',
    }));
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(respond(firstPage))
      .mockResolvedValueOnce(respond([{ id: 'a-1000', taskManager: 'a', status: 'Open' }]));

    await expect(fetchOrgTaskCounts('/registry', ['a'], fetchImpl)).resolves.toEqual({
      a: { open: 1, total: 1001 },
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).variables).toEqual({ managers: ['a'], after: 'a-0999' });
  });

  it('does not turn request failures or partial responses into zero counts', async () => {
    for (const response of [
      { ok: false },
      { ok: true, json: async () => ({ errors: [{ message: 'Unavailable' }], data: { tasks: [] } }) },
      { ok: true, json: async () => ({ data: {} }) },
    ]) {
      await expect(fetchOrgTaskCounts('/registry', ['a'], vi.fn().mockResolvedValue(response)))
        .rejects.toThrow('Task counts unavailable');
    }
  });

  it('rejects partial totals when a later page fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(respond(Array.from({ length: 1000 }, (_, index) => ({
        id: `a-${String(index).padStart(4, '0')}`, taskManager: 'a', status: 'Open',
      }))))
      .mockRejectedValueOnce(new Error('Connection lost'));
    await expect(fetchOrgTaskCounts('/registry', ['a'], fetchImpl)).rejects.toThrow('Connection lost');
  });

  it('does not request tasks when there are no managers', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchOrgTaskCounts('/registry', [], fetchImpl)).resolves.toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
