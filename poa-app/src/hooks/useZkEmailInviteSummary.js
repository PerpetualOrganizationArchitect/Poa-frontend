/**
 * useZkEmailInviteSummary — shared state machine for surfacing an org's email-invite allowlist.
 *
 * Subgraph-first, chain-authoritative: the canonical indexer already has the ACTIVE root + the
 * parsed allowlist entries (domain/email + hatIds), so a single subgraph query serves the common
 * case with no wallet, no public-RPC round-trips, and no IPFS fetch — and it works for every org.
 * But the subgraph is trusted ONLY for the fully-verified 'active' happy path (root committed, file
 * indexed, declared root matching, entries present); anything ambiguous — an indexer that lags the
 * activation tx, a file-data-source that hasn't landed, a root mismatch, an error — falls through
 * to the on-chain path, which alone decides dormant/degraded/unknown. An indexer can lag the chain,
 * so a subgraph zero-root must never be presented as authoritative dormancy.
 *
 * On-chain fallback: reads the ACTIVE allowlist commitment straight from the org's chain (a public
 * read-only RPC, so it works for visitors with no wallet connected — the join page's primary
 * audience), fetches the allowlist file from IPFS, verifies it against the on-chain merkle root, and
 * maps each entry's hatIds to human-readable role names.
 *
 * Status matrix (every consumer must handle all of these):
 *   'absent'   — org has no ZkEmailInvites module (or POContext still loading it). Render nothing.
 *   'loading'  — on-chain/IPFS reads in flight. Render nothing or a spinner — never actionable UI.
 *   'dormant'  — module deployed but no allowlist activated (root == 0). Claims would revert
 *                AllowlistNotActive, so surfaces must say "not activated yet", never show an upload.
 *   'active'   — allowlist live + file verified against the on-chain root. `domains`/`emailCount`
 *                /`roleNames` are trustworthy (entries come from the root-matched file).
 *   'degraded' — allowlist PROVABLY live on-chain (root != 0) but the file is unavailable or does
 *                not match the root (IPFS lag, swapped CID). Generic "invites are active" copy with
 *                no entry details; claiming may still work (the claim path re-fetches).
 *   'unknown'  — the on-chain read itself failed (RPC outage): liveness is NOT known. Surfaces must
 *                not advertise claimability (a dormant module would look identical). Offer a retry.
 *
 * Results are stamped with an (address, chain) key: switching orgs on the same route resets the
 * state synchronously instead of showing the previous org's verified data. Role-name mapping happens
 * at render time (useMemo), so POContext role refreshes never re-trigger the network reads.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { usePOContext } from '@/context/POContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { getNetworkByChainId } from '@/config/networks';
import { assertRootMatches } from '@/lib/zkemail/allowlist';

const ZERO_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000000';
const READ_ABI = [
  'function merkleRoot() view returns (bytes32)',
  'function allowlistCid() view returns (bytes32)',
];

// Public read fallbacks: the primary public RPCs rate-limit browsers (observed live: a single
// failed merkleRoot() read used to kill the whole claim flow). Order: configured URL first.
const FALLBACK_RPCS = {
  // Browser-verified (CORS + concurrent-safe): publicnode is far more generous than the default
  // rpc.gnosischain.com under browser load. drpc/blastapi 400 or CORS-fail in-browser; 1rpc fails
  // concurrent — all avoided.
  100: ['https://gnosis-rpc.publicnode.com', 'https://gnosis.publicnode.com'],
  42161: ['https://arbitrum-one-rpc.publicnode.com', 'https://arbitrum.publicnode.com'],
};

/** Read root+cid, trying each RPC in turn with a short retry — only throw when ALL fail. */
async function readCommitment(rpcUrls, address) {
  let lastErr;
  for (const url of rpcUrls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const provider = new ethers.providers.JsonRpcProvider(url);
        const contract = new ethers.Contract(address, READ_ABI, provider);
        // SEQUENTIAL, not Promise.all: two concurrent eth_calls double the per-IP rate-limit
        // pressure on public RPCs, so the second (allowlistCid) intermittently returns empty →
        // ethers CALL_EXCEPTION data="0x" (observed live). One at a time is far more reliable.
        const root = await contract.merkleRoot();
        const cid = await contract.allowlistCid();
        return { root, cid };
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  throw lastErr;
}

// Graph Node caps unbounded derived collections at first:100 and hard-caps `first` at 1000. We ask
// for the max; hitting it means the allowlist MIGHT be truncated, so we fall through to the full doc.
const SUBGRAPH_ENTRIES_MAX = 1000;

/**
 * Read the active allowlist summary from the subgraph (canonical indexer). Returns
 * { rawDomains, rawEmailHats, emailCount } ONLY for the fully-verified happy path:
 * active root committed, allowlist file indexed, its declared root matching the active root, and
 * the entry list non-empty and under the pagination cap. EVERYTHING else returns null — meaning
 * "the subgraph is not authoritative here, fall through to the on-chain RPC+IPFS path", which
 * alone decides dormant/degraded/unknown. Cases that intentionally fall through:
 *   - schema without the field / module node missing (gateway still syncing an older deployment)
 *   - activeRoot zero (could be genuine dormancy OR the activation tx not indexed yet — only the
 *     chain's merkleRoot() can tell them apart; a false "not activated" would dead-end real invitees)
 *   - allowlist entity null/empty (the file lands via an async IPFS file-data-source that can lag
 *     or fail permanently — the old path calls this 'degraded', never 'active with nobody invited')
 *   - declared root != activeRoot (swapped/stale CID; the indexer stores the doc's declared root but
 *     does not recompute the merkle tree — the fallback path does, via assertRootMatches)
 *   - entries at the pagination cap (possible silent truncation)
 *   - any HTTP/GraphQL/parse error, or a gateway hang (6s abort; a stalled fetch must not block the
 *     fallback the old code reached immediately)
 * Never throws.
 */
async function readSummaryFromSubgraph(subgraphUrl, moduleAddress) {
  try {
    const query = `{ zkEmailInvites(id: "${String(moduleAddress).toLowerCase()}") {
      activeRoot
      activeAllowlist { root entries(first: ${SUBGRAPH_ENTRIES_MAX}, orderBy: index) { entryType identifier hatIds } }
    } }`;
    const res = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.errors || !json.data) return null;
    const node = json.data.zkEmailInvites;
    if (!node) return null;
    if (!node.activeRoot || node.activeRoot === ZERO_ROOT) return null;
    const list = node.activeAllowlist;
    const entries = list?.entries || [];
    if (entries.length === 0 || entries.length >= SUBGRAPH_ENTRIES_MAX) return null;
    // A MISSING declared root falls through like a mismatched one: the indexer stores entries even
    // for docs whose root field is absent/malformed, so entries-non-empty does not imply it exists.
    if (!list.root || String(list.root).toLowerCase() !== String(node.activeRoot).toLowerCase()) return null;
    // Dedupe domains (first entry wins — mirrors proofForDomain, which proves the FIRST matching leaf).
    const byDomain = new Map();
    const rawEmailHats = [];
    let emailCount = 0;
    for (const e of entries) {
      if (e.entryType === 'domain' && e.identifier) {
        const d = String(e.identifier).toLowerCase();
        if (!byDomain.has(d)) byDomain.set(d, { domain: d, hatIds: e.hatIds || [] });
      } else if (e.entryType === 'email') {
        emailCount += 1;
        rawEmailHats.push(...(e.hatIds || []));
      }
    }
    return { rawDomains: [...byDomain.values()], rawEmailHats, emailCount };
  } catch (_) {
    return null; // network/timeout/parse error → fall through to the resilient on-chain path
  }
}

const EMPTY = { status: 'absent', key: '', rawDomains: [], rawEmailHats: [], emailCount: 0 };

/** Normalize any hat-id representation (hex or decimal string) to a canonical decimal string. */
export function hatKey(id) {
  try {
    return BigInt(String(id).trim()).toString();
  } catch (_) {
    return '';
  }
}

export function useZkEmailInviteSummary() {
  const { zkEmailInvitesAddress, zkEmailInvitesEnabled, orgChainId, subgraphUrl, roleNames: contextRoleNames } =
    usePOContext();
  const { safeFetchFromIpfs, bytes32ToIpfsCid } = useIPFScontext();

  const [state, setState] = useState(EMPTY);
  const [tick, setTick] = useState(0); // bumped by refresh() — re-runs the reads for dormant/degraded/unknown
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const key = `${String(zkEmailInvitesAddress || '').toLowerCase()}:${orgChainId || ''}`;

    if (!zkEmailInvitesEnabled || !zkEmailInvitesAddress) {
      setState({ ...EMPTY, key });
      return undefined;
    }
    const network = getNetworkByChainId(orgChainId);
    if (!network?.rpcUrl && !subgraphUrl) {
      setState({ ...EMPTY, key });
      return undefined;
    }

    // Keep verified data only if it belongs to THIS org+chain — an org switch resets synchronously.
    setState((s) =>
      s.key === key && s.status === 'active' ? s : { status: 'loading', key, rawDomains: [], rawEmailHats: [], emailCount: 0 },
    );

    let retryTimer;
    (async () => {
      // 0. Subgraph-first: one query, no wallet, no public-RPC/IPFS round-trips, works for every org.
      //    Non-null is ONLY the fully-verified active happy path (see readSummaryFromSubgraph);
      //    every ambiguous state (zero root, missing/empty/mismatched file, errors) returns null and
      //    the on-chain path below stays the sole authority for dormant/degraded/unknown.
      if (subgraphUrl) {
        const sg = await readSummaryFromSubgraph(subgraphUrl, zkEmailInvitesAddress);
        if (!alive) return;
        if (sg) {
          setState({
            status: 'active',
            key,
            rawDomains: sg.rawDomains,
            rawEmailHats: sg.rawEmailHats,
            emailCount: sg.emailCount,
          });
          return;
        }
      }

      // 1. On-chain fallback. Needs a configured RPC; without one, liveness is genuinely unknown.
      if (!network?.rpcUrl) {
        setState((s) => (s.key === key && s.status === 'active' ? s : { status: 'unknown', key, rawDomains: [], rawEmailHats: [], emailCount: 0 }));
        return;
      }
      let root;
      let cid;
      try {
        // Active commitment from the org's chain (public RPCs with fallbacks — no wallet needed).
        const rpcs = [network.rpcUrl, ...(FALLBACK_RPCS[orgChainId] || [])];
        ({ root, cid } = await readCommitment(rpcs, zkEmailInvitesAddress));
      } catch (e) {
        if (!alive) return;
        console.warn('[zkemail] allowlist on-chain read failed on all RPCs:', e?.message);
        // Stale-while-error: NEVER downgrade already-verified data for the same org on a transient
        // failure — hiding the claim flow mid-claim strands the user (observed live). Claims always
        // re-verify on-chain, so serving the last verified summary is safe.
        setState((s) => {
          if (s.key === key && s.status === 'active') return s;
          return { status: 'unknown', key, rawDomains: [], rawEmailHats: [], emailCount: 0 };
        });
        // Self-healing: quietly retry in 15s (each pass itself tries all RPCs twice).
        retryTimer = setTimeout(() => {
          if (alive) setTick((t) => t + 1);
        }, 15_000);
        return;
      }
      if (!alive) return;

      if (!root || root === ZERO_ROOT) {
        setState({ status: 'dormant', key, rawDomains: [], rawEmailHats: [], emailCount: 0 });
        return;
      }

      try {
        // 2. Fetch + verify the allowlist file. Any failure → 'degraded' (never show unverified data).
        const doc = await safeFetchFromIpfs(bytes32ToIpfsCid(cid));
        if (!alive) return;
        if (!doc || !Array.isArray(doc.entries) || doc.entries.length === 0) {
          setState((s) =>
            s.key === key && s.status === 'active'
              ? s
              : { status: 'degraded', key, rawDomains: [], rawEmailHats: [], emailCount: 0 },
          );
          return;
        }
        try {
          assertRootMatches(doc, root);
        } catch (e) {
          console.warn('[zkemail] allowlist file does not match the on-chain root:', e?.message);
          setState({ status: 'degraded', key, rawDomains: [], rawEmailHats: [], emailCount: 0 });
          return;
        }

        // 3. Collect verified entries. Domains are deduped (first entry wins — mirrors proofForDomain,
        //    which proves against the FIRST matching leaf, so we never advertise roles a claim
        //    wouldn't actually grant).
        const byDomain = new Map();
        const rawEmailHats = [];
        let emailCount = 0;
        for (const entry of doc.entries) {
          if (entry.type === 'domain' && entry.identifier) {
            const d = String(entry.identifier).toLowerCase();
            if (!byDomain.has(d)) byDomain.set(d, { domain: d, hatIds: entry.hatIds || [] });
          } else if (entry.type === 'email') {
            emailCount += 1;
            rawEmailHats.push(...(entry.hatIds || []));
          }
        }
        setState({ status: 'active', key, rawDomains: [...byDomain.values()], rawEmailHats, emailCount });
      } catch (e) {
        if (!alive) return;
        console.warn('[zkemail] allowlist summary failed:', e?.message);
        setState({ status: 'degraded', key, rawDomains: [], rawEmailHats: [], emailCount: 0 });
      }
    })();

    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [zkEmailInvitesEnabled, zkEmailInvitesAddress, orgChainId, subgraphUrl, tick, safeFetchFromIpfs, bytes32ToIpfsCid]);

  // Render-time role-name mapping: POContext role refreshes update names WITHOUT re-running the
  // network reads (doc hatIds are hex; the subgraph uses decimal strings — bridge via BigInt).
  return useMemo(() => {
    const roleNameByHat = {};
    Object.entries(contextRoleNames || {}).forEach(([id, name]) => {
      const k = hatKey(id);
      if (k) roleNameByHat[k] = name;
    });
    const nameOf = (hatId) => roleNameByHat[hatKey(hatId)] || null;
    const allNames = new Set();
    const domains = state.rawDomains.map(({ domain, hatIds }) => {
      const names = (hatIds || []).map(nameOf).filter(Boolean);
      names.forEach((n) => allNames.add(n));
      return { domain, roleNames: names };
    });
    const emailHatKeySet = new Set(state.rawEmailHats.map(hatKey).filter(Boolean));
    const domainsByHatKey = new Map();
    state.rawDomains.forEach(({ domain, hatIds }) => {
      (hatIds || []).forEach((h) => {
        const k = hatKey(h);
        if (!k) return;
        if (!domainsByHatKey.has(k)) domainsByHatKey.set(k, []);
        domainsByHatKey.get(k).push(domain);
      });
    });
    /** Is a given role hat claimable via the ACTIVE allowlist? -> { claimable, byDomain, byEmail, domains } */
    const claimableInfoFor = (hatId) => {
      const k = hatKey(hatId);
      const ds = (k && domainsByHatKey.get(k)) || [];
      const byEmail = !!k && emailHatKeySet.has(k);
      return { claimable: ds.length > 0 || byEmail, byDomain: ds.length > 0, byEmail, domains: ds };
    };
    const firstClaimableHatKey = domainsByHatKey.keys().next().value || [...emailHatKeySet][0] || null;
    return {
      status: state.status,
      domains,
      emailCount: state.emailCount,
      roleNames: [...allNames],
      claimableInfoFor,
      firstClaimableHatKey,
      refresh,
    };
  }, [state, contextRoleNames, refresh]);
}

export default useZkEmailInviteSummary;
