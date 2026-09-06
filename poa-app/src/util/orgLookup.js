import { isSupportedOrganization, ORGANIZATION_SUPPORT_FIELDS } from '@/lib/supportedOrganizations';

export const ORG_LOOKUP_HINT_TTL_MS = 5 * 60 * 1000;
const HINT_STORAGE_KEY = 'poa:orgLookupHints:authority-only';
const MAX_HINTS = 50;
const LOOKUP_TIMEOUT_MS = 12000;

const sourceSignature = (sources) => JSON.stringify(sources.map(({ chainId, url }) => [chainId, url]));

/**
 * A hint caches which chain won a verified lookup, including the fact that
 * higher-priority chains answered empty. Cache hits never extend that evidence:
 * absence is reused for at most five minutes, and the next lookup after expiry
 * checks precedence again. An already-open page does not refresh on a timer.
 */
export function createOrgLookupHintCache({ storage, now = Date.now } = {}) {
  const entries = new Map();
  let loaded = false;
  const getStorage = () => typeof storage === 'function' ? storage() : storage;
  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      const saved = JSON.parse(getStorage()?.getItem(HINT_STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) return;
      for (const entry of saved.slice(-MAX_HINTS)) {
        if (Array.isArray(entry) && typeof entry[0] === 'string') entries.set(entry[0], entry[1]);
      }
    } catch { /* Storage is optional; in-memory hints still work. */ }
  };
  const persist = () => {
    try { getStorage()?.setItem(HINT_STORAGE_KEY, JSON.stringify([...entries])); } catch {}
  };

  return {
    get(name, sources) {
      load();
      const hint = entries.get(name);
      if (!hint) return null;
      const age = now() - hint.verifiedAt;
      if (hint.sources !== sourceSignature(sources)
          || !Number.isFinite(age) || age < 0 || age >= ORG_LOOKUP_HINT_TTL_MS
          || !Number.isInteger(hint.sourceIndex) || !sources[hint.sourceIndex]
          || typeof hint.orgId !== 'string' || !hint.orgId) {
        entries.delete(name);
        persist();
        return null;
      }
      return hint;
    },
    set(name, sources, sourceIndex, orgId) {
      load();
      entries.delete(name);
      entries.set(name, { sources: sourceSignature(sources), sourceIndex, orgId, verifiedAt: now() });
      while (entries.size > MAX_HINTS) entries.delete(entries.keys().next().value);
      persist();
    },
    delete(name) {
      load();
      entries.delete(name);
      persist();
    },
  };
}

const browserHints = createOrgLookupHintCache({
  storage: () => typeof window === 'undefined' ? null : window.localStorage,
});

export async function fetchOrgByName(source, name, { signal } = {}) {
  const controller = new AbortController();
  let rejectAborted;
  const aborted = new Promise((_, reject) => { rejectAborted = reject; });
  const abort = (errorName, message) => {
    const error = new Error(message);
    error.name = errorName;
    controller.abort(error);
    rejectAborted(error);
  };
  const cancel = () => abort('AbortError', 'Organization lookup cancelled');
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => abort('TimeoutError', 'Organization lookup timed out'), LOOKUP_TIMEOUT_MS);

  try {
    if (signal?.aborted) cancel();
    // Keep the timeout and caller cancellation alive through body parsing:
    // fetch() resolves at headers, which can precede a stalled JSON body.
    const request = (async () => {
      if (controller.signal.aborted) return null;
      const response = await fetch(source.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query FindOrg($name: String!) { organizations(where: { name: $name }, first: 100) { id name ${ORGANIZATION_SUPPORT_FIELDS} } }`,
          variables: { name },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Org lookup HTTP ${response.status}`);
      const json = await response.json();
      if (json?.errors?.length) throw new Error(json.errors[0]?.message || 'Org lookup GraphQL error');
      if (!Array.isArray(json?.data?.organizations)) throw new Error('Org lookup returned no organization list');
      return json.data.organizations.find(isSupportedOrganization) || null;
    })();
    return await Promise.race([aborted, request]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

/**
 * Fresh lookups retain source order, regardless of response order. A match can
 * finish early only after every higher-priority chain has answered empty;
 * lower-priority requests are then aborted. If endpoints fail, the final
 * settled result keeps the previous best-available-match behavior, but does
 * not cache unverified higher-priority absence.
 *
 * A live hint queries its chain by name again. Only the same org id can use
 * it; misses, renamed/replaced orgs, and failures evict the hint and query all
 * other chains, reusing the hinted response rather than fetching it twice.
 */
export function lookupOrganization({
  name,
  sources,
  signal,
  bypassCache = false,
  cache = browserHints,
  fetchSource = fetchOrgByName,
  onSourceError,
}) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const outcomes = new Array(sources.length).fill(null);
    const started = new Set();
    let finished = false;

    const cleanup = () => {
      signal?.removeEventListener('abort', cancel);
      controller.abort();
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      cleanup();
      const error = new Error('Organization lookup cancelled');
      error.name = 'AbortError';
      reject(error);
    };
    const finish = (org) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve({ org, anySourceFailed: outcomes.some((outcome) => outcome?.kind === 'error') });
    };
    if (signal?.aborted) {
      cancel();
      return;
    }
    signal?.addEventListener('abort', cancel, { once: true });

    const hint = bypassCache ? null : cache?.get(name, sources);

    const settle = () => {
      const matchIndex = outcomes.findIndex((outcome) => outcome?.kind === 'match');
      if (matchIndex !== -1 && outcomes.slice(0, matchIndex).every((outcome) => outcome?.kind === 'empty')) {
        const org = outcomes[matchIndex].org;
        cache?.set(name, sources, matchIndex, org.id);
        finish(org);
      } else if (outcomes.every(Boolean)) {
        finish(matchIndex === -1 ? null : outcomes[matchIndex].org);
      }
    };

    const startSource = (index, hinted = false) => {
      if (finished || started.has(index)) return;
      started.add(index);
      const source = sources[index];
      Promise.resolve().then(() => {
        if (finished) return null;
        return fetchSource(source, name, { signal: controller.signal });
      }).then((org) => {
        if (org && (!org.id || org.name !== name)) throw new Error('Org lookup returned an invalid match');
        return isSupportedOrganization(org)
          ? { kind: 'match', org: { ...org, chainId: source.chainId } }
          : { kind: 'empty' };
      }).catch((error) => ({ kind: 'error', error })).then((outcome) => {
        if (finished) return;
        outcomes[index] = outcome;
        if (outcome.kind === 'error') onSourceError?.(source, outcome.error);
        if (hinted) {
          if (outcome.kind === 'match' && outcome.org.id === hint.orgId && cache?.get(name, sources) === hint) {
            // Revalidate the org itself, but do not renew cached higher-chain absence.
            finish(outcome.org);
            return;
          }
          cache?.delete(name);
          sources.forEach((_, otherIndex) => startSource(otherIndex));
        }
        settle();
      });
    };

    if (hint) startSource(hint.sourceIndex, true);
    else {
      sources.forEach((_, index) => startSource(index));
      settle();
    }
  });
}
