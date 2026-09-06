import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOrgLookupHintCache,
  fetchOrgByName,
  lookupOrganization,
  ORG_LOOKUP_HINT_TTL_MS,
} from '@/util/orgLookup';

const sources = [
  { chainId: 42161, name: 'Arbitrum', url: 'https://arbitrum.test/subgraph' },
  { chainId: 100, name: 'Gnosis', url: 'https://gnosis.test/subgraph' },
];
const park = { id: 'park-id', name: 'Decentral Park', membershipAuthority: { id: '0x' + '1'.repeat(40), isRouterBound: true, cutoverAt: '1750000000' } };
const duplicate = { ...park, id: 'other-park-id' };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const lookup = (options) => lookupOrganization({ name: park.name, sources, cache: null, ...options });

async function warmHint(cache) {
  await lookup({ cache, fetchSource: async (source) => source.chainId === 100 ? park : null });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ordered organization lookup', () => {
  it('returns a highest-priority match without waiting for a stalled lower chain', async () => {
    const high = deferred();
    const low = deferred();
    let lowerSignal;
    const pending = lookup({ fetchSource: (source, name, { signal }) => {
      if (source.chainId === 42161) return high.promise;
      lowerSignal = signal;
      return low.promise;
    } });
    await flush();
    high.resolve(park);
    await expect(pending).resolves.toEqual({ org: { ...park, chainId: 42161 }, anySourceFailed: false });
    expect(lowerSignal.aborted).toBe(true);
  });

  it('does not let a faster lower-priority duplicate win', async () => {
    const high = deferred();
    const low = deferred();
    let settled = false;
    const pending = lookup({ fetchSource: (source) => source.chainId === 42161 ? high.promise : low.promise });
    pending.then(() => { settled = true; });
    low.resolve(park);
    await flush();
    expect(settled).toBe(false);
    high.resolve(duplicate);
    await expect(pending).resolves.toMatchObject({ org: { ...duplicate, chainId: 42161 } });
  });

  it('resolves a lower match once earlier chains are empty, without waiting for later chains', async () => {
    const slowest = deferred();
    const thirdSource = { chainId: 999, name: 'Later', url: 'https://later.test/subgraph' };
    const result = await lookup({
      sources: [...sources, thirdSource],
      fetchSource: (source) => source.chainId === 42161 ? null : source.chainId === 100 ? park : slowest.promise,
    });
    expect(result).toEqual({ org: { ...park, chainId: 100 }, anySourceFailed: false });
  });

  it('preserves best-available fallback after a source failure without caching uncertain precedence', async () => {
    const cache = createOrgLookupHintCache();
    const result = await lookup({ cache, fetchSource: async (source) => {
      if (source.chainId === 42161) throw new Error('gateway offline');
      return park;
    } });
    expect(result).toEqual({ org: { ...park, chainId: 100 }, anySourceFailed: true });
    expect(cache.get(park.name, sources)).toBeNull();
  });

  it('distinguishes clean not-found from a retryable lookup failure', async () => {
    await expect(lookup({ fetchSource: async () => null })).resolves.toEqual({ org: null, anySourceFailed: false });
    await expect(lookup({ fetchSource: async (source) => {
      if (source.chainId === 42161) throw new Error('gateway offline');
      return null;
    } })).resolves.toEqual({ org: null, anySourceFailed: true });
  });

  it('cancels promptly even if a source ignores cancellation, and does not cache late results', async () => {
    const cache = createOrgLookupHintCache();
    const source = deferred();
    const controller = new AbortController();
    const pending = lookup({ cache, signal: controller.signal, fetchSource: () => source.promise });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    controller.abort();
    await rejection;
    source.resolve(park);
    await flush();
    expect(cache.get(park.name, sources)).toBeNull();
  });

  it('does not start network requests when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchSource = vi.fn();
    await expect(lookup({ signal: controller.signal, fetchSource })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSource).not.toHaveBeenCalled();
  });
});

describe('verified organization chain hints', () => {
  it('revalidates the known org by name on only its chain during the fixed TTL', async () => {
    let now = 0;
    const cache = createOrgLookupHintCache({ now: () => now });
    await warmHint(cache);
    const verifiedAt = cache.get(park.name, sources).verifiedAt;
    now = ORG_LOOKUP_HINT_TTL_MS - 1;
    const fetchSource = vi.fn().mockResolvedValue(park);
    await expect(lookup({ cache, fetchSource })).resolves.toMatchObject({ org: { ...park, chainId: 100 } });
    expect(fetchSource).toHaveBeenCalledTimes(1);
    expect(fetchSource).toHaveBeenCalledWith(sources[1], park.name, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(cache.get(park.name, sources).verifiedAt).toBe(verifiedAt);
    now += 1;
    expect(cache.get(park.name, sources)).toBeNull();
  });

  it('checks higher-priority chains again after expiry and discovers a new duplicate', async () => {
    let now = 0;
    const cache = createOrgLookupHintCache({ now: () => now });
    await warmHint(cache);
    now = ORG_LOOKUP_HINT_TTL_MS;
    const fetchSource = vi.fn(async (source) => source.chainId === 42161 ? duplicate : park);
    await expect(lookup({ cache, fetchSource })).resolves.toMatchObject({ org: { ...duplicate, chainId: 42161 } });
    expect(fetchSource).toHaveBeenCalledTimes(2);
  });

  it('does not trust a hint that expires while the hinted request is in flight', async () => {
    let now = 0;
    const cache = createOrgLookupHintCache({ now: () => now });
    await warmHint(cache);
    const hinted = deferred();
    const fetchSource = vi.fn((source) => source.chainId === 100 ? hinted.promise : duplicate);
    const pending = lookup({ cache, fetchSource });
    await flush();
    now = ORG_LOOKUP_HINT_TTL_MS;
    hinted.resolve(park);
    await expect(pending).resolves.toMatchObject({ org: { ...duplicate, chainId: 42161 } });
    expect(fetchSource).toHaveBeenCalledTimes(2);
  });

  it.each(['missing', 'renamed', 'replaced', 'failed'])(
    'evicts a %s cached match and reuses its result in the full lookup',
    async (mode) => {
      const cache = createOrgLookupHintCache();
      await warmHint(cache);
      const fetchSource = vi.fn(async (source) => {
        if (source.chainId === 42161) return duplicate;
        if (mode === 'failed') throw new Error('gateway offline');
        if (mode === 'renamed') return { ...park, name: 'A new name' };
        if (mode === 'replaced') return { ...park, id: 'replacement-id' };
        return null;
      });
      await expect(lookup({ cache, fetchSource })).resolves.toMatchObject({ org: { ...duplicate, chainId: 42161 } });
      expect(fetchSource.mock.calls.map(([source]) => source.chainId)).toEqual([100, 42161]);
      expect(cache.get(park.name, sources).sourceIndex).toBe(0);
    },
  );

  it('bypasses cached precedence for newly deployed organizations', async () => {
    const cache = createOrgLookupHintCache();
    await warmHint(cache);
    const fetchSource = vi.fn(async (source) => source.chainId === 42161 ? duplicate : park);
    await expect(lookup({ cache, bypassCache: true, fetchSource })).resolves.toMatchObject({ org: { ...duplicate, chainId: 42161 } });
    expect(fetchSource).toHaveBeenCalledTimes(2);
  });

  it.each(['order', 'url', 'chain'])('invalidates hints when source %s changes', async (change) => {
    const cache = createOrgLookupHintCache();
    await warmHint(cache);
    const changed = change === 'order' ? [...sources].reverse()
      : sources.map((source, index) => index ? source : {
        ...source,
        ...(change === 'url' ? { url: 'https://new.test/subgraph' } : { chainId: 123 }),
      });
    expect(cache.get(park.name, changed)).toBeNull();
  });

  it('persists hints across reloads and tolerates unavailable browser storage', async () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
    await warmHint(createOrgLookupHintCache({ storage }));
    const reloaded = createOrgLookupHintCache({ storage });
    expect(reloaded.get(park.name, sources)).toMatchObject({ sourceIndex: 1, orgId: park.id });
    const blocked = createOrgLookupHintCache({ storage: () => { throw new Error('blocked'); } });
    await warmHint(blocked);
    expect(blocked.get(park.name, sources)).toMatchObject({ sourceIndex: 1 });
  });

  it('caps the persisted hint list so browsing orgs cannot grow storage indefinitely', () => {
    let saved;
    const cache = createOrgLookupHintCache({ storage: { setItem: (_, value) => { saved = JSON.parse(value); } } });
    for (let i = 0; i < 60; i += 1) cache.set(`Org ${i}`, sources, 1, `id-${i}`);
    expect(saved).toHaveLength(50);
    expect(cache.get('Org 0', sources)).toBeNull();
    expect(cache.get('Org 59', sources)).not.toBeNull();
  });
});

describe('org lookup HTTP responses', () => {
  it('times out a stalled JSON body after headers have already arrived', async () => {
    vi.useFakeTimers();
    const body = deferred();
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => body.promise });
    vi.stubGlobal('fetch', fetch);
    const result = fetchOrgByName(sources[0], park.name).catch((error) => error);
    await vi.advanceTimersByTimeAsync(12000);
    expect((await result).name).toBe('TimeoutError');
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps caller cancellation connected while parsing the response body', async () => {
    const body = deferred();
    const json = vi.fn(() => body.promise);
    const fetch = vi.fn().mockResolvedValue({ ok: true, json });
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const result = fetchOrgByName(sources[0], park.name, { signal: controller.signal }).catch((error) => error);
    await flush();
    expect(json).toHaveBeenCalled();
    controller.abort();
    expect((await result).name).toBe('AbortError');
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it.each([
    { ok: false, status: 503 },
    { ok: true, json: async () => ({ errors: [{ message: 'quota exceeded' }] }) },
    { ok: true, json: async () => ({ data: null }) },
  ])('treats an invalid endpoint response as a failure, never a clean not-found', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(fetchOrgByName(sources[0], park.name)).rejects.toBeInstanceOf(Error);
  });
});

describe('Wave G direct links and cached hints', () => {
  it('evicts a previously supported cached org after rollback without restoring legacy access', async () => {
    const cache = createOrgLookupHintCache();
    await warmHint(cache);
    const result = await lookup({ cache, fetchSource: async source => source.chainId === 100 ? { ...park, membershipAuthority: { ...park.membershipAuthority, isRouterBound: false } } : null });
    expect(result.org).toBeNull();
    expect(cache.get(park.name, sources)).toBeNull();
  });
  it('refuses a stale legacy hint even when the org still has the same id and name', async () => {
    const cache = createOrgLookupHintCache();
    cache.set(park.name, sources, 1, park.id);
    const result = await lookup({ cache, fetchSource: async () => ({ id: park.id, name: park.name }) });
    expect(result.org).toBeNull();
  });
});
