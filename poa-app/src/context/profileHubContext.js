//profileHubContext

import React, { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { NETWORKS } from '../config/networks';
import { fetchOrgTaskCounts } from '@/util/orgTaskCounts';
import { isHiddenOrg } from '@/util/hiddenOrgs';

const ProfileHubContext = createContext();

// Calling this hook lazily triggers the cross-chain org fetch — the provider
// itself does nothing until a consumer subscribes. Keeps the marketing landing
// (the dominant entry path) from fanning out FetchAllOrgs to every mainnet
// subgraph on every visit.
export const useProfileHubContext = () => {
    const ctx = useContext(ProfileHubContext);
    useEffect(() => {
        ctx?.ensureLoaded?.();
    }, [ctx]);
    return ctx;
};

/**
 * Raw GQL string for fetching all orgs.
 * Direct fetch() per-subgraph to query all chains in parallel.
 */
const ALL_ORGS_QUERY = `
  query FetchAllOrgs {
    organizations(first: 100, orderBy: deployedAt, orderDirection: desc) {
      id
      name
      metadataHash
      deployedAt
      metadata { description logo }
      participationToken { id totalSupply }
      quickJoin { id }
      hybridVoting { id }
      directDemocracyVoting { id }
      taskManager { id }
      educationHub { id }
      users { id }
    }
  }
`;

/**
 * Fetches orgs from a single subgraph endpoint.
 * Returns [] on failure so one broken source doesn't block the page.
 */
async function fetchOrgsFromSource(endpoint, networkConfig) {
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: ALL_ORGS_QUERY }),
            // A hung gateway must degrade like a failed one ([] from the
            // catch below) instead of stranding isLoading=true forever.
            signal: AbortSignal.timeout(8000),
        });
        const json = await res.json();
        const orgs = json?.data?.organizations || [];
        return orgs.map(org => ({
            ...org,
            _network: networkConfig,
        }));
    } catch (err) {
        console.warn(`[ProfileHub] Failed to fetch from ${networkConfig.name}:`, err.message);
        return [];
    }
}

export const ProfileHubProvider = ({ children }) => {
    const [allOrgs, setAllOrgs] = useState([]);
    const [taskCounts, setTaskCounts] = useState({});
    // Default to loading=true so consumers see a skeleton from frame 1 (no
    // empty-state flash). The actual network fetch is deferred until a
    // consumer subscribes via useProfileHubContext() — pages that never read
    // the org list (every non-/explore route) avoid the cross-chain fan-out
    // entirely.
    const [loading, setLoading] = useState(true);
    const startedRef = useRef(false);

    const ensureLoaded = useCallback(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        (async () => {
            const entries = Object.values(NETWORKS).filter(n => !n.isTestnet);
            const results = await Promise.all(
                entries.map(net => fetchOrgsFromSource(net.subgraphUrl, net))
            );
            const merged = results.flat().sort((a, b) =>
                Number(a.deployedAt || 0) - Number(b.deployedAt || 0)
            );
            setAllOrgs(merged);
            setLoading(false);

            // Let the directory render while its task counts load separately.
            // Failed sources keep their organizations and show unavailable counts.
            await Promise.all(entries.map(async (net, index) => {
                const managerIds = [...new Set(results[index]
                    .filter(org => !isHiddenOrg(org.name || org.id))
                    .map(org => org.taskManager?.id).filter(Boolean))];
                let counts;
                try {
                    counts = await fetchOrgTaskCounts(net.subgraphUrl, managerIds);
                } catch (error) {
                    console.warn('[ProfileHub] Task counts unavailable:', error.message);
                    counts = Object.fromEntries(managerIds.map(id => [id, null]));
                }
                setTaskCounts(previous => ({
                    ...previous,
                    ...Object.fromEntries(Object.entries(counts).map(([id, count]) => [`${net.chainId}:${id}`, count])),
                }));
            }));
        })();
    }, []);

    const perpetualOrganizations = useMemo(() => {
        return allOrgs.map(org => {
            const network = org._network;
            return {
                id: org.name || org.id,
                orgId: org.id,
                logoHash: org.metadataHash,
                logoCid: org.metadata?.logo || null,
                totalMembers: org.users?.length || 0,
                taskCounts: org.taskManager?.id
                    ? taskCounts[`${network.chainId}:${org.taskManager.id}`]
                    : { open: 0, total: 0 },
                aboutInfo: org.metadata || null,
                deployedAt: org.deployedAt,
                quickJoinContract: org.quickJoin?.id,
                participationToken: org.participationToken,
                chainId: network.chainId,
                networkName: network.name,
            };
        });
    }, [allOrgs, taskCounts]);

    const contextValue = useMemo(() => ({
        perpetualOrganizations,
        isLoading: loading,
        ensureLoaded,
    }), [perpetualOrganizations, loading, ensureLoaded]);

    return (
        <ProfileHubContext.Provider value={contextValue}>
            {children}
        </ProfileHubContext.Provider>
    );
};
