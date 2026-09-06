import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { encodeShortCode, LINK_KIND } from '@/util/shortLinks';

const mocks = vi.hoisted(() => ({ readContract: vi.fn() }));
vi.mock('@/services/web3/utils/chainClients', () => ({ createPublicClientForChain: () => ({ readContract: mocks.readContract }) }));
vi.mock('@/config/networks', () => ({ NETWORKS: { arbitrum: { chainId: 42161 }, gnosis: { chainId: 100 } }, getSubgraphUrl: (id) => `https://graph.test/${id}` }));
const id = `0x${'3'.repeat(64)}`;
const tm = `0x${'a'.repeat(40)}`;
const hv = `0x${'b'.repeat(40)}`;
const dv = `0x${'c'.repeat(40)}`;
const projectId = `${tm}-0x${'0'.repeat(63)}2`;
const org = { id, name: 'Test6', taskManager: { id: tm }, hybridVoting: { id: hv }, directDemocracyVoting: { id: dv } };
const code = (kind, item = 0n) => encodeShortCode({ registry: 1, orgIndex: 0, kind, item });
let service;
let fetchMock;

beforeEach(async () => {
  vi.resetModules();
  mocks.readContract.mockReset().mockImplementation(async ({ functionName }) => functionName === 'getOrgIds' ? [id] : id);
  fetchMock = vi.fn(async (url, init) => {
    const request = JSON.parse(init.body);
    const data = request.query.includes('task(id:') ? { task: { id: request.variables.id, project: { id: projectId } } }
      : request.query.includes('organizations(where:') ? { organizations: url.endsWith('/100') ? [org] : [] }
      : { organization: org };
    return { ok: true, json: async () => ({ data }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  service = await import('@/services/web3/domain/ShortLinkService');
});
afterEach(() => vi.unstubAllGlobals());

describe('on-chain short-link resolution', () => {
  it('resolves the precise registry index, chain and task project without stored mappings', async () => {
    const query = await service.resolveShortLink('/tasks/', code(LINK_KIND.task, 10n));
    expect(query).toEqual({ org: 'Test6', orgId: id, chainId: '100', task: `${tm}-10`, projectId });
    expect(mocks.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'orgIds', args: [0n], address: '0x3744b372abc41589226313f2bb1db3acaa22a854' }));
    expect(fetchMock.mock.calls.every(([url]) => url === 'https://graph.test/100')).toBe(true);
  });

  it('uses the current org name after a rename and pins immutable identity against conflicting extras', async () => {
    const query = await service.resolveShortLink('/join/', code(LINK_KIND.org), { org: 'Old name', userDAO: 'Wrong org', chainId: '42161', orgId: 'wrong' });
    expect(query).toEqual({ org: 'Test6', orgId: id, chainId: '100' });
  });

  it.each([[LINK_KIND.hybrid, hv], [LINK_KIND.democracy, dv]])('opens a vote in its exact lane (%s)', async (kind, address) => {
    const query = await service.resolveShortLink('/votes/', code(kind, 10n));
    expect(query.poll).toBe(`${address}-10`);
  });

  it('keeps board filters and cross-project selection when opening a task', async () => {
    const query = await service.resolveShortLink('/tasks/', code(LINK_KIND.task, 10n), { projectId: '__all__', q: 'find me', view: 'list', filters: 'mine,open' });
    expect(query).toMatchObject({ projectId: '__all__', q: 'find me', view: 'list', filters: 'mine,open', task: `${tm}-10` });
  });

  it.each([[LINK_KIND.project, projectId, 2n], [LINK_KIND.allTasks, '__all__', 0n], [LINK_KIND.myWork, '__mine__', 0n]])('restores project selection (%s)', async (kind, expected, item) => {
    expect((await service.resolveShortLink('/tasks/', code(kind, item))).projectId).toBe(expected);
  });

  it('does not read chain state for malformed, unsupported or wrong-page links', async () => {
    for (const [page, token] of [['/tasks/', 'bad'], ['/join/', code(LINK_KIND.task, 1n)], ['/tasks/', encodeShortCode({ registry: 15, orgIndex: 0 })]]) {
      await expect(service.resolveShortLink(page, token)).rejects.toThrow();
    }
    expect(mocks.readContract).not.toHaveBeenCalled();
  });

  it('reports missing tasks without resolving to an unrelated project', async () => {
    fetchMock.mockImplementation(async (_, init) => ({ ok: true, json: async () => ({ data: JSON.parse(init.body).query.includes('task(id:') ? { task: null } : { organization: org } }) }));
    await expect(service.resolveShortLink('/tasks/', code(LINK_KIND.task, 999n))).rejects.toThrow('task could not be found');
  });

  it('creates a stable code from the registry ordering and reuses read results', async () => {
    const query = { org: 'Test6', task: `${tm}-10`, projectId };
    const first = await service.createShortLink('/tasks/', query);
    const second = await service.createShortLink('/tasks/', query);
    expect(first.url).toBe(`/tasks/?${code(LINK_KIND.task, 10n)}`);
    expect(second).toEqual(first);
    expect(mocks.readContract).toHaveBeenCalledTimes(1);
    expect(mocks.readContract.mock.calls[0][0].functionName).toBe('getOrgIds');
  });

  it('refreshes the registry when an org was appended after the cached read', async () => {
    mocks.readContract.mockResolvedValueOnce([]).mockResolvedValueOnce([id]);
    expect((await service.createShortLink('/join/', { org: 'Test6' })).url).toBe(`/join/?${code(LINK_KIND.org)}`);
    expect(mocks.readContract).toHaveBeenCalledTimes(2);
  });

  it('does not silently treat a failed chain as an empty or missing organization', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ errors: [{ message: 'unavailable' }] }) });
    await expect(service.createShortLink('/join/', { org: 'Test6' })).rejects.toThrow('Could not load');
    expect((await service.createShortLink('/join/', { org: 'Test6' })).url).toContain('?');
  });

  it('does not choose arbitrarily between same-name orgs across chains', async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ data: { organizations: [org] } }) }));
    await expect(service.createShortLink('/join/', { org: 'Test6' })).rejects.toThrow('unique organization');
  });

  it('does not let stale context or conflicting legacy IDs relabel a different org', async () => {
    const otherId = `0x${'4'.repeat(64)}`;
    mocks.readContract.mockResolvedValue([otherId, id]);
    fetchMock.mockImplementation(async (url, init) => {
      const request = JSON.parse(init.body);
      const data = request.query.includes('organizations(where:')
        ? { organizations: url.endsWith('/100') ? [org] : [] }
        : { organization: { ...org, id: otherId, name: 'A different organization' } };
      return { ok: true, json: async () => ({ data }) };
    });
    const result = await service.createShortLink('/join/', { org: 'Test6', orgId: otherId, chainId: '100' });
    expect(result.orgId).toBe(id);
    expect(result.url).toBe(`/join/?${encodeShortCode({ registry: 1, orgIndex: 1 })}`);
  });
});
