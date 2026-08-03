/**
 * Cross-chain username utilities
 *
 * Usernames are registered per-chain on UniversalAccountRegistry contracts.
 * These utilities query ALL mainnet subgraphs to ensure global uniqueness
 * and find existing usernames across chains.
 *
 * Each chain endpoint uses its own ApolloClient (via getClient), so repeated
 * lookups for the same address/username hit the Apollo cache instead of
 * re-fetching. Use writeQuery on the relevant cache (e.g. after a successful
 * username registration) to keep the cache fresh.
 */

import { gql } from '@apollo/client';
import { getAllSubgraphUrls, DEFAULT_CHAIN_ID } from '@/config/networks';
import { getClient } from '@/util/apolloClient';
import { GET_ACCOUNTS_BY_USERNAMES } from '@/util/queries';

const CHECK_USERNAME = gql`
  query CheckUsername($username: String!) {
    accounts(where: { username: $username }, first: 1) {
      id
      user
      username
    }
  }
`;

const FIND_USERNAME = gql`
  query FindUsername($id: Bytes!) {
    account(id: $id) {
      id
      username
    }
  }
`;

const FIND_USER_BY_USERNAME = gql`
  query FindUser($username: String!) {
    accounts(where: { username: $username }, first: 1) {
      id
      user
      username
    }
  }
`;

const SEARCH_USERS_BY_USERNAME = gql`
  query SearchUsersByUsername($query: String!, $first: Int!) {
    accounts(
      where: { username_contains_nocase: $query }
      first: $first
      orderBy: username
      orderDirection: asc
    ) {
      id
      user
      username
    }
  }
`;

const FIND_USER_PROFILE_BY_USERNAME = gql`
  query FindUserProfile($username: String!) {
    accounts(where: { username: $username }, first: 1) {
      id
      user
      username
      metadata {
        bio
        avatar
        github
        twitter
        website
      }
    }
  }
`;

const FIND_USER_PROFILE_BY_ADDRESS = gql`
  query FindUserProfileByAddress($id: Bytes!) {
    account(id: $id) {
      id
      username
      metadata {
        bio
        avatar
        github
        twitter
        website
      }
    }
  }
`;

const FIND_USER_PROFILES_BY_ADDRESSES = gql`
  query FindUserProfilesByAddresses($ids: [Bytes!]!) {
    accounts(where: { id_in: $ids }, first: 1000) {
      id
      username
      metadata {
        bio
        avatar
        github
        twitter
        website
      }
    }
  }
`;

const FETCH_USER_ORGS = gql`
  query FetchUserOrgs($userAddress: Bytes!) {
    users(where: { address: $userAddress, membershipStatus: Active }) {
      id
      membershipStatus
      participationTokenBalance
      totalTasksCompleted
      totalVotes
      firstSeenAt
      organization {
        id
        name
        metadataHash
        metadata {
          id
          logo
          description
        }
        participationToken { symbol }
      }
    }
  }
`;

/**
 * Run `query` against every mainnet subgraph in parallel via per-endpoint
 * ApolloClients. Each result is `{ source, data | error }`. Failures don't
 * block the others — the caller decides how to merge.
 */
async function queryAllChains(query, variables) {
  const sources = getAllSubgraphUrls();
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const { data } = await getClient(source.url).query({
        query,
        variables,
        fetchPolicy: 'cache-first',
      });
      return { source, data };
    })
  );
  return results;
}

/**
 * Check if a username is taken on ANY chain.
 *
 * @param {string} username - Username to check (case-insensitive)
 * @param {string} [excludeAddress] - Address to exclude (user's own address)
 * @returns {Promise<{ taken: boolean, chains: string[], owner: string|null }>}
 */
export async function isUsernameTakenGlobally(username, excludeAddress = null) {
  const trimmed = username.trim().toLowerCase();
  const results = await queryAllChains(CHECK_USERNAME, { username: trimmed });

  const takenOn = [];
  let owner = null;

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { source, data } = result.value;
    const account = data?.accounts?.[0];
    if (!account) continue;

    if (excludeAddress && account.id?.toLowerCase() === excludeAddress.toLowerCase()) {
      continue;
    }

    takenOn.push(source.name);
    owner = account.id;
  }

  return {
    taken: takenOn.length > 0,
    chains: takenOn,
    owner,
  };
}

/**
 * Find an existing username for an address across ALL chains.
 *
 * @param {string} address - Wallet address to look up
 * @returns {Promise<{ username: string|null, chain: string|null }>}
 */
export async function findUsernameAcrossChains(address) {
  const id = address.toLowerCase();
  const results = await queryAllChains(FIND_USERNAME, { id });

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { source, data } = result.value;
    const username = data?.account?.username;
    if (username && username.trim().length > 0) {
      return { username, chain: source.name };
    }
  }

  return { username: null, chain: null };
}

/**
 * Search for a user by username across ALL chains.
 *
 * @param {string} username - Username to search for
 * @returns {Promise<{ address: string|null, username: string|null, chain: string|null }>}
 */
export async function findUserByUsernameAcrossChains(username) {
  const trimmed = username.trim().toLowerCase();
  const results = await queryAllChains(FIND_USER_BY_USERNAME, { username: trimmed });

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { source, data } = result.value;
    const account = data?.accounts?.[0];
    if (account) {
      return { address: account.id, username: account.username, chain: source.name };
    }
  }

  return { address: null, username: null, chain: null };
}

/**
 * Batch-resolve usernames to addresses across ALL mainnet chains.
 * Home chain (Arbitrum) wins if a username somehow exists on multiple chains.
 * Throws when a chain was unreachable AND usernames remain unresolved, so
 * "endpoint down" is never reported as "user not found" (callers like the
 * deploy wizard would otherwise silently drop members from roles).
 *
 * @param {string[]} usernames - Usernames to resolve (case-insensitive)
 * @returns {Promise<{ resolved: Map<string, string>, notFound: string[] }>}
 */
export async function resolveUsernamesAcrossChains(usernames) {
  const resolved = new Map();
  if (!usernames || usernames.length === 0) return { resolved, notFound: [] };
  const normalized = [...new Set(
    usernames.map(u => u.toLowerCase().trim()).filter(u => u.length > 0)
  )];
  if (normalized.length === 0) return { resolved, notFound: [] };

  const sources = getAllSubgraphUrls();
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const { data } = await getClient(source.url).query({
        query: GET_ACCOUNTS_BY_USERNAMES,
        variables: { usernames: normalized },
        fetchPolicy: 'network-only', // pre-deploy validation must be fresh
      });
      return { source, data };
    })
  );

  let anyFailed = false;
  for (const result of results) {
    if (result.status !== 'fulfilled') { anyFailed = true; continue; }
    const { source, data } = result.value;
    const isHome = source.chainId === DEFAULT_CHAIN_ID;
    for (const acc of data?.accounts || []) {
      const key = acc.username?.toLowerCase();
      if (!key) continue;
      if (!resolved.has(key) || isHome) resolved.set(key, acc.user);
    }
  }

  const notFound = normalized.filter(u => !resolved.has(u));
  if (anyFailed && notFound.length > 0) {
    throw new Error('Could not reach all networks to verify usernames — please try again.');
  }
  return { resolved, notFound };
}

/**
 * Search for users whose username contains `query` (case-insensitive substring),
 * across ALL chains. Results are merged, de-duped by address, and ranked so that
 * exact matches come first, then prefix matches, then other substring matches
 * (alphabetical within each tier).
 *
 * Used to power as-you-type autocomplete — the caller should debounce and pass a
 * query of at least a couple of characters to keep result sets manageable.
 *
 * @param {string} query - Partial username to search for
 * @param {number} [limit=8] - Max number of merged results to return
 * @returns {Promise<Array<{ address: string, username: string, chain: string }>>}
 */
export async function searchUsersByUsernameAcrossChains(query, limit = 8) {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return [];

  // Over-fetch per chain so cross-chain de-duping still leaves enough results.
  const results = await queryAllChains(SEARCH_USERS_BY_USERNAME, {
    query: trimmed,
    first: limit * 2,
  });

  const byAddress = new Map();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { source, data } = result.value;
    const accounts = data?.accounts || [];
    for (const account of accounts) {
      const address = account.id?.toLowerCase();
      if (!address || !account.username) continue;
      if (!byAddress.has(address)) {
        byAddress.set(address, {
          address,
          username: account.username,
          chain: source.name,
        });
      }
    }
  }

  const rank = (username) => {
    const u = username.toLowerCase();
    if (u === trimmed) return 0; // exact match
    if (u.startsWith(trimmed)) return 1; // prefix match
    return 2; // other substring match
  };

  return Array.from(byAddress.values())
    .sort((a, b) => {
      const byRank = rank(a.username) - rank(b.username);
      if (byRank !== 0) return byRank;
      return a.username.toLowerCase().localeCompare(b.username.toLowerCase());
    })
    .slice(0, limit);
}

/**
 * Find a user's profile by username across ALL chains.
 * When the account exists on multiple chains, picks the metadata with the
 * most fields populated (profile may be updated on one chain but not another).
 *
 * @param {string} username - Username to search for
 * @returns {Promise<{ address: string|null, username: string|null, metadata: Object|null }>}
 */
export async function findUserProfileByUsername(username) {
  const trimmed = username.trim().toLowerCase();
  const results = await queryAllChains(FIND_USER_PROFILE_BY_USERNAME, { username: trimmed });

  let bestResult = null;
  let bestRichness = -1;

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const account = result.value.data?.accounts?.[0];
    if (!account) continue;
    const meta = account.metadata;
    let richness = 0;
    if (meta) {
      if (meta.bio) richness++;
      if (meta.avatar) richness++;
      if (meta.github) richness++;
      if (meta.twitter) richness++;
      if (meta.website) richness++;
    }
    if (!bestResult || richness > bestRichness) {
      bestResult = account;
      bestRichness = richness;
    }
  }

  if (bestResult) {
    return {
      address: bestResult.id,
      username: bestResult.username,
      metadata: bestResult.metadata || null,
    };
  }

  return { address: null, username: null, metadata: null };
}

/**
 * Find a user's profile by address across ALL chains.
 * Picks the richest metadata; ties go to the home chain (Arbitrum).
 *
 * @param {string} address - Wallet address to look up
 * @returns {Promise<{ address: string|null, username: string|null, metadata: Object|null, sourceChain: string|null, sourceChainId: number|null }>}
 */
export async function findUserProfileByAddress(address) {
  if (!address) {
    return { address: null, username: null, metadata: null, sourceChain: null, sourceChainId: null };
  }
  const id = address.toLowerCase();
  const results = await queryAllChains(FIND_USER_PROFILE_BY_ADDRESS, { id });

  let best = null;
  let bestRichness = -1;
  let bestIsHome = false;

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { source, data } = result.value;
    const account = data?.account;
    if (!account) continue;
    const meta = account.metadata;
    let richness = 0;
    if (account.username) richness++;
    if (meta) {
      if (meta.bio) richness++;
      if (meta.avatar) richness++;
      if (meta.github) richness++;
      if (meta.twitter) richness++;
      if (meta.website) richness++;
    }
    const isHome = source.chainId === DEFAULT_CHAIN_ID;
    const beats =
      richness > bestRichness ||
      (richness === bestRichness && isHome && !bestIsHome);
    if (!best || beats) {
      best = { account, source };
      bestRichness = richness;
      bestIsHome = isHome;
    }
  }

  if (best) {
    return {
      address: best.account.id,
      username: best.account.username || null,
      metadata: best.account.metadata || null,
      sourceChain: best.source.name,
      sourceChainId: best.source.chainId,
    };
  }

  return { address: null, username: null, metadata: null, sourceChain: null, sourceChainId: null };
}

/**
 * Batch variant of findUserProfileByAddress: fetches profiles for many
 * addresses across all chains in parallel. Returns a Map<lowerAddress, profileRecord>.
 *
 * @param {string[]} addresses
 * @returns {Promise<Map<string, { username: string|null, metadata: Object|null, sourceChain: string|null, sourceChainId: number|null }>>}
 */
export async function findUserProfilesByAddresses(addresses) {
  const map = new Map();
  if (!Array.isArray(addresses) || addresses.length === 0) return map;

  const ids = Array.from(new Set(addresses.map(a => a?.toLowerCase()).filter(Boolean)));
  if (ids.length === 0) return map;

  const results = await queryAllChains(FIND_USER_PROFILES_BY_ADDRESSES, { ids });

  const richness = (account) => {
    let r = 0;
    if (account.username) r++;
    const m = account.metadata;
    if (m) {
      if (m.bio) r++;
      if (m.avatar) r++;
      if (m.github) r++;
      if (m.twitter) r++;
      if (m.website) r++;
    }
    return r;
  };

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { source, data } = result.value;
    const accounts = data?.accounts || [];
    const isHome = source.chainId === DEFAULT_CHAIN_ID;
    for (const account of accounts) {
      const key = account.id?.toLowerCase();
      if (!key) continue;
      const next = {
        username: account.username || null,
        metadata: account.metadata || null,
        sourceChain: source.name,
        sourceChainId: source.chainId,
      };
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ...next, _richness: richness(account), _isHome: isHome });
        continue;
      }
      const nextRichness = richness(account);
      const beats =
        nextRichness > prev._richness ||
        (nextRichness === prev._richness && isHome && !prev._isHome);
      if (beats) {
        map.set(key, { ...next, _richness: nextRichness, _isHome: isHome });
      }
    }
  }

  for (const [, value] of map.entries()) {
    delete value._richness;
    delete value._isHome;
  }

  return map;
}

/**
 * Find all organization memberships for an address across ALL chains.
 *
 * @param {string} address - Wallet address
 */
export async function findUserOrgsAcrossChains(address) {
  const results = await queryAllChains(FETCH_USER_ORGS, { userAddress: address.toLowerCase() });

  const orgs = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const users = result.value.data?.users || [];
    orgs.push(...users);
  }
  return orgs;
}
