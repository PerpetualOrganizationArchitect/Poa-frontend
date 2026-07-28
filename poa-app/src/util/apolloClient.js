// apolloClient.js
import { useMemo } from 'react';
import { ApolloClient, InMemoryCache, from } from '@apollo/client';
import { HttpLink } from '@apollo/client/link/http';
import { RetryLink } from '@apollo/client/link/retry';
import { DEFAULT_SUBGRAPH_URL } from '../config/networks';

// Increment this when subgraph schema changes significantly to clear stale cache
const CACHE_VERSION = 'v13'; // v13: normalize Hat by hatId (preserve nested vouchConfig)

/**
 * Cache type policies. `Hat` objects are returned nested under `Role.hat` (and
 * elsewhere) but have no default cache key, so Apollo can't merge them across
 * queries/refetches — it warns "Cache data may be lost when replacing the hat
 * field of a Role object" and DROPS the previous hat, taking its nested
 * `vouchConfig { quorum }` with it. That made `vouchingQuorum` read as 0 on
 * refetch, which stranded new members on /join ("0 / 0 (Complete!)" with no
 * Complete-Join button). Hats-protocol `hatId` is globally unique within a
 * subgraph, so it's a safe normalization key.
 */
const typePolicies = {
  Hat: {
    // Normalize by hatId WHEN it's selected, so the cache can merge a Hat across
    // queries/refetches and preserve nested fields like `vouchConfig`. Some queries
    // select a Hat with only `name` (no hatId) — return `false` there so Apollo
    // embeds that object instead of throwing "Missing field 'hatId' while extracting
    // keyFields" (a hard error that breaks the query).
    keyFields: (obj) => (obj && obj.hatId != null ? ['hatId'] : false),
  },
};

/**
 * Retry link -- handles transient network failures with exponential backoff.
 * Only retries on network errors (not GraphQL errors, which indicate bad queries).
 */
const retryLink = new RetryLink({
  delay: {
    initial: 500,
    max: 5000,
    jitter: true,
  },
  attempts: {
    max: 3,
    // retryIf only receives network errors (not GraphQL errors).
    // Retry any network failure: fetch timeout, CORS, HTTP 5xx/429, etc.
    retryIf: (error) => !!error,
  },
});

/**
 * fetch wrapper that aborts after a timeout. A subgraph endpoint that hangs
 * (gateway latency, rate-limit queue, stalled connection) would otherwise leave
 * the request pending forever — no error fires, so RetryLink never retries and
 * the consuming query hangs in `loading: true` indefinitely. Aborting turns a
 * hang into a network error that RetryLink CAN retry, and that ultimately
 * surfaces to the UI as `error` instead of an eternal spinner.
 */
const QUERY_TIMEOUT_MS = 15000;
function fetchWithTimeout(input, init = {}) {
  if (typeof AbortController === 'undefined') return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Create an Apollo link chain for a given endpoint.
 */
function createLink(endpoint) {
  return from([
    retryLink,
    new HttpLink({ uri: endpoint, fetch: fetchWithTimeout }),
  ]);
}

/**
 * Default client for the home chain (Arbitrum). Pinned to DEFAULT_SUBGRAPH_URL —
 * org-scoped queries must use useSubgraphClient(subgraphUrl) instead of the
 * old `context: { subgraphUrl }` plumbing, so each chain gets its own
 * InMemoryCache and cross-chain pollution is impossible.
 */
const defaultClient = new ApolloClient({
  link: createLink(DEFAULT_SUBGRAPH_URL),
  cache: new InMemoryCache({ typePolicies }),
});

const clientCache = new Map();

/**
 * Get (or create) an ApolloClient for a specific subgraph endpoint.
 * Returns the default client if no URL is provided.
 *
 * Usage:
 *   const client = getClient(deploySubgraphUrl);
 *   useQuery(QUERY, { client });
 */
export function getClient(subgraphUrl) {
  if (!subgraphUrl || subgraphUrl === DEFAULT_SUBGRAPH_URL) {
    return defaultClient;
  }
  if (!clientCache.has(subgraphUrl)) {
    clientCache.set(subgraphUrl, new ApolloClient({
      link: createLink(subgraphUrl),
      cache: new InMemoryCache({ typePolicies }),
    }));
  }
  return clientCache.get(subgraphUrl);
}

/**
 * Memoized hook variant of getClient() for use with `useQuery({ client })`.
 * Prefer this over `context: { subgraphUrl }` against the shared client —
 * each chain gets its own InMemoryCache, eliminating cross-chain cache
 * poisoning risk for any entity whose id isn't chain-scoped.
 */
export function useSubgraphClient(subgraphUrl) {
  return useMemo(() => getClient(subgraphUrl), [subgraphUrl]);
}

// Clear stale cache when version changes (client-side only)
if (typeof window !== 'undefined') {
  const storedVersion = localStorage.getItem('poa-cache-version');
  if (storedVersion !== CACHE_VERSION) {
    defaultClient.clearStore().then(() => {
      localStorage.setItem('poa-cache-version', CACHE_VERSION);
      console.log('[Apollo] Cache cleared due to version change');
    }).catch((err) => {
      console.error('[Apollo] Failed to clear cache:', err);
    });
  }
}

export default defaultClient;
