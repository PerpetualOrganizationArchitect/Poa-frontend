import { describe, expect, it, vi } from 'vitest';
import { fetchSupportedOrganizations } from '@/util/orgDirectory';
import { authorityNode } from '@/lib/accessV2/fixtures';
import { buildSchema, graphql } from 'graphql';
import { fetchOrgTaskCounts } from '@/util/orgTaskCounts';
const response = organizations => ({ ok: true, json: async () => ({ data: { organizations } }) });
const current = { id: '0xffff', name: 'Poa', membershipAuthority: authorityNode() };
describe('supported org directory', () => {
  it('loads task counts for surviving orgs through the fields actually selected by GraphQL', async () => {
    const schema = buildSchema(`
      scalar Bytes
      enum Organization_orderBy { id }
      enum OrderDirection { asc desc }
      input Organization_filter { id_gt: Bytes }
      type Authority { id: ID, isRouterBound: Boolean, cutoverAt: String }
      type Metadata { description: String, logo: String }
      type Token { id: ID, totalSupply: String }
      type Contract { id: ID }
      type User { id: ID }
      type Organization { id: ID, name: String, metadataHash: String, deployedAt: String, membershipAuthority: Authority, metadata: Metadata, participationToken: Token, quickJoin: Contract, taskManager: Contract, users(first: Int): [User] }
      type Query { organizations(first: Int, where: Organization_filter, orderBy: Organization_orderBy, orderDirection: OrderDirection): [Organization] }
    `);
    const manager = '0x' + '1'.repeat(40);
    const fetcher = async (_, options) => {
      const { query, variables } = JSON.parse(options.body);
      return { ok: true, json: () => graphql({ schema, source: query, variableValues: variables, rootValue: { organizations: [{ id: 'argus', name: 'Argus', taskManager: { id: 'retired-manager' } }, { ...current, taskManager: { id: manager } }] } }) };
    };
    const orgs = await fetchSupportedOrganizations('endpoint', { fetcher });
    expect(orgs).toHaveLength(1);
    expect(orgs[0].taskManager).toEqual({ id: manager });
    const countsFetcher = vi.fn(async (_, options) => {
      expect(JSON.parse(options.body).variables.managers).toEqual([manager]);
      return { ok: true, json: async () => ({ data: { tasks: [{ id: 'task', taskManager: manager, status: 'Open' }] } }) };
    });
    const counts = await fetchOrgTaskCounts('endpoint', orgs.map(org => org.taskManager.id), countsFetcher);
    expect(counts).toEqual({ [manager]: { open: 1, total: 1 } });
  });
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
