import { describe, expect, it, vi } from 'vitest';
import { fetchSupportedOrganizations } from '@/util/orgDirectory';
import { authorityNode } from '@/lib/accessV2/fixtures';
const response = organizations => ({ ok: true, json: async () => ({ data: { organizations } }) });
const current = { id: '0xffff', name: 'Poa', membershipAuthority: authorityNode() };
describe('supported org directory', () => {
  it('hides retired rows while preserving metadata and full survivor history totals', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([{ id: 'argus', name: 'Argus' }, current]));
    expect(await fetchSupportedOrganizations('endpoint', { fetcher })).toEqual([current]);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).query).toContain('isRouterBound cutoverAt');
  });
  it('paginates across a whole page of retired orgs to find a future supported org', async () => {
    const retired = Array.from({ length: 100 }, (_, index) => ({ id: `0x${index.toString(16).padStart(4, '0')}`, name: 'Retired' }));
    const fetcher = vi.fn().mockResolvedValueOnce(response(retired)).mockResolvedValueOnce(response([current]));
    expect(await fetchSupportedOrganizations('endpoint', { fetcher })).toEqual([current]);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).variables.after).toBe(retired.at(-1).id);
  });
  it('never falls back to the old org schema after an unknown field error or partial response', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { organizations: [current] }, errors: [{ message: 'Unknown field membershipAuthority' }] }) });
    await expect(fetchSupportedOrganizations('endpoint', { fetcher })).rejects.toThrow('Unknown field');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
