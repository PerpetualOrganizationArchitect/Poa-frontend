import React, { createContext, useContext, useReducer, useEffect, useMemo, useCallback, useState } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_ORG_FULL_DATA } from '../util/queries';
import { useRouter } from 'next/router';
import { formatTokenAmount } from '../util/formatToken';
import { resolveTokenLabel, DEFAULT_TOKEN_LABEL } from '../util/tokenLabel';
import { normalizeHourlyRate, DEFAULT_HOURLY_RATE } from '../util/taskUtils';
import { useRefreshSubscription, RefreshEvent } from './RefreshContext';
import { bytes32ToIpfsCid } from '@/services/web3/utils/encoding';
import { useIPFScontext } from './ipfsContext';
import { useIdentityContext } from './IdentityContext';
import { getSubgraphUrl, getAllSubgraphUrls } from '../config/networks';
import { useSubgraphClient } from '../util/apolloClient';
import { getDefaultOrgForHost, getVisitUrlForOrg } from '../config/hostDefaultOrg';
import { useOrgName } from '@/hooks/useOrgName';

// Re-export for back-compat with callers that imported these from POContext.
export { getDefaultOrgForHost, getVisitUrlForOrg };

const POContext = createContext();

export const usePOContext = () => useContext(POContext);

// Zero address constant - educationHub.id will be this when edu hub is disabled
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Transform users array to leaderboard format
function transformLeaderboardData(users, roleHatIds) {
    if (!users || !Array.isArray(users)) {
        return [];
    }
    return users.map(user => {
        const rawBalance = user.participationTokenBalance;
        const formattedBalance = formatTokenAmount(rawBalance || '0');
        return {
            id: user.id,
            address: user.address,
            name: user.account?.username || user.address?.slice(0, 8) + '...',
            hasUsername: !!user.account?.username,
            avatarCid: user.account?.metadata?.avatar || null,
            token: formattedBalance,
            // Derive role from hat IDs - first hat is typically the primary role
            hatIds: user.currentHatIds || [],
            totalTasksCompleted: parseInt(user.totalTasksCompleted, 10) || 0,
            totalVotes: parseInt(user.totalVotes, 10) || 0,
        };
    });
}

// Transform education modules from new schema
function transformEducationModules(modules) {
    if (!modules || !Array.isArray(modules)) {
        return [];
    }
    return modules.map(module => {
        // Convert bytes32 contentHash to CID format for IPFS gateway URLs
        const ipfsCid = module.contentHash ? bytes32ToIpfsCid(module.contentHash) : null;

        // Use subgraph-indexed metadata when available
        const meta = module.metadata;
        let description = 'Module content loading from IPFS...';
        let link = '';
        let question = '';
        let answers = [];
        let ipfsFetched = false;

        if (meta) {
            description = meta.description || 'No description available';
            link = meta.link || '';
            question = (meta.quiz && meta.quiz.length > 0) ? meta.quiz[0] : '';
            if (meta.answersJson) {
                try {
                    const parsed = JSON.parse(meta.answersJson);
                    answers = (parsed[0] || []).map((ans, i) => ({ index: i, answer: ans }));
                } catch (e) {
                    // Fall back to empty answers if JSON parsing fails
                }
            }
            ipfsFetched = true;
        }

        return {
            id: module.id,
            moduleId: module.moduleId,
            name: module.title || 'Indexing...',
            ipfsHash: ipfsCid,
            // Keep original bytes32 hash for any components that need it
            contentHashBytes32: module.contentHash,
            payout: formatTokenAmount(module.payout || '0'),
            status: module.status,
            isIndexing: !module.contentHash,
            description,
            link,
            question,
            answers,
            completions: module.completions || [],
            // For backward compatibility
            completetions: module.completions || [],
            _ipfsFetched: ipfsFetched,
        };
    });
}

const initialState = {
    // Organization info
    orgId: null,
    orgChainId: null,
    poDescription: 'No description provided or IPFS content still being indexed',
    poLinks: [],
    logoHash: '',
    logoUrl: '',
    backgroundColor: null,
    metadataAdminHatId: null,
    poMembers: 0,
    activeTaskAmount: 0,
    completedTaskAmount: 0,
    ptTokenBalance: 0,

    // Contract addresses
    quickJoinContractAddress: '',
    treasuryContractAddress: '',
    taskManagerContractAddress: '',
    hybridVotingContractAddress: '',
    participationVotingContractAddress: '',
    directDemocracyVotingContractAddress: '',
    ddTokenContractAddress: '',
    nftMembershipContractAddress: '',
    votingContractAddress: '',
    educationHubAddress: '',
    zkEmailInvitesAddress: '',
    executorContractAddress: '',
    eligibilityModuleAddress: '',
    eligibilityModuleAdminHat: null,
    participationTokenAddress: '',
    paymentManagerAddress: '',

    // Derived data
    leaderboardData: [],
    poContextLoading: true,
    rules: null,
    educationModules: [],
    roleHatIds: [],
    topHatId: null,
    creatorHatIds: [],
    educationHubEnabled: false,
    zkEmailInvitesEnabled: false,
    hideTreasury: false,
    useTokenSymbol: false,
    // Org-level "Pay by hours only" task-payout setting (ignores difficulty).
    taskPayoutHoursOnly: false,
    taskPayoutHourlyRate: DEFAULT_HOURLY_RATE,
    participationTokenSymbol: null,
    tokenLabel: DEFAULT_TOKEN_LABEL,
    roleNames: {},
    roleCanVoteMap: {},
    organizerHatIds: [],
    foldersRoot: null,
};

function poReducer(state, action) {
    switch (action.type) {
        case 'SET_ORG_DATA':
            return { ...state, ...action.payload };
        case 'SET_LOGO_URL':
            return { ...state, logoUrl: action.payload };
        case 'SET_LOADING':
            return { ...state, poContextLoading: action.payload };
        default:
            return state;
    }
}

// Org-lookup fetch timeout. A hanging subgraph endpoint (gateway latency,
// rate-limit queue, stalled connection) must not hang the whole org resolution
// forever — abort so the per-source try/catch treats it as a (retryable) failure
// instead of leaving Promise.all pending indefinitely.
const ORG_LOOKUP_TIMEOUT_MS = 12000;
function fetchWithTimeout(url, init = {}, timeoutMs = ORG_LOOKUP_TIMEOUT_MS) {
  if (typeof AbortController === 'undefined') return fetch(url, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const POProvider = ({ children }) => {
    const router = useRouter();
    // useOrgName covers query-param + window.location.search fallback +
    // host-default in one place; POProvider used to inline the same logic.
    const poName = useOrgName();
    const { safeFetchFromIpfs } = useIPFScontext();
    const { seedIdentities } = useIdentityContext();

    const [state, dispatch] = useReducer(poReducer, initialState);

    // Filtered leaderboard for display (only users with registered usernames)
    const leaderboardDisplayData = useMemo(() => {
        return state.leaderboardData.filter(user => user.hasUsername);
    }, [state.leaderboardData]);

    // Username → avatar IPFS URL map for components to look up profile pictures.
    // Backwards-compat view; new code should resolve via IdentityContext / <UserIdentity>.
    const avatarMap = useMemo(() => {
        const map = {};
        for (const user of state.leaderboardData) {
            if (user.name && user.avatarCid) {
                map[user.name] = `https://ipfs.io/ipfs/${user.avatarCid}`;
            }
        }
        return map;
    }, [state.leaderboardData]);

    // Seed IdentityContext with leaderboard data so cross-app components can
    // resolve avatar/username for these addresses without re-fetching.
    useEffect(() => {
        if (!state.leaderboardData || state.leaderboardData.length === 0) return;
        const entries = state.leaderboardData
            .filter(u => u.address)
            .map(u => ({
                address: u.address,
                username: u.hasUsername ? u.name : null,
                avatarCid: u.avatarCid,
            }));
        if (entries.length > 0) seedIdentities(entries);
    }, [state.leaderboardData, seedIdentities]);

    // Step 1: Look up org by name across all chains via parallel fetch
    const [orgLookupLoading, setOrgLookupLoading] = useState(!!poName);
    const [orgLookupError, setOrgLookupError] = useState(null);
    const isNewOrg = router.query.newOrg === 'true';

    useEffect(() => {
        if (!poName) {
            setOrgLookupLoading(false);
            return;
        }
        let cancelled = false;
        let retryCount = 0;
        const MAX_RETRIES = 20;
        const RETRY_INTERVAL = 3000;
        setOrgLookupLoading(true);
        setOrgLookupError(null);

        async function findOrg() {
            const sources = getAllSubgraphUrls();
            // Track whether ANY source failed (timeout / network / abort) vs every
            // source responding cleanly with "no such org". A failure is transient
            // and should be retried; a clean "not found everywhere" is terminal.
            let anySourceFailed = false;
            try {
                const results = await Promise.all(sources.map(async (source) => {
                    try {
                        const res = await fetchWithTimeout(source.url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                query: 'query FindOrg($name: String!) { organizations(where: { name: $name }, first: 1) { id name } }',
                                variables: { name: poName },
                            }),
                        });
                        const json = await res.json();
                        const org = json?.data?.organizations?.[0];
                        return org ? { ...org, chainId: source.chainId } : null;
                    } catch (err) {
                        anySourceFailed = true;
                        console.warn(`[POContext] Failed to query ${source.name}:`, err.message);
                        return null;
                    }
                }));
                if (cancelled) return;
                const found = results.find(Boolean);
                if (found) {
                    dispatch({
                        type: 'SET_ORG_DATA',
                        payload: { orgId: found.id, orgChainId: found.chainId },
                    });
                    setOrgLookupLoading(false);
                } else if ((isNewOrg || anySourceFailed) && retryCount < MAX_RETRIES) {
                    // Either a newly deployed org the subgraph hasn't indexed yet, OR a
                    // transient lookup failure (a source hung/timed out/errored). Retry
                    // rather than wrongly concluding the org doesn't exist — otherwise a
                    // single slow gateway strands the user (e.g. on /join) at a dead end.
                    retryCount++;
                    console.log(`[POContext] Org "${poName}" unresolved (newOrg=${isNewOrg}, sourceFailed=${anySourceFailed}), retrying (${retryCount}/${MAX_RETRIES})...`);
                    setTimeout(() => {
                        if (!cancelled) findOrg();
                    }, RETRY_INTERVAL);
                    // Don't set loading to false — still polling
                } else {
                    console.warn(`[POContext] Organization "${poName}" not found on any chain`);
                    setOrgLookupLoading(false);
                    dispatch({ type: 'SET_LOADING', payload: false });
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('[POContext] Org lookup failed:', err);
                    setOrgLookupError(err);
                    setOrgLookupLoading(false);
                }
            }
        }

        findOrg();
        return () => { cancelled = true; };
    }, [poName]);

    // Step 2: Fetch full org data using bytes ID, routed to the correct chain's subgraph
    const subgraphUrl = getSubgraphUrl(state.orgChainId);
    const client = useSubgraphClient(subgraphUrl);

    const { data: orgData, loading: orgDataLoading, error: orgDataError, refetch: refetchOrgData } = useQuery(FETCH_ORG_FULL_DATA, {
        variables: { orgId: state.orgId },
        skip: !state.orgId,
        fetchPolicy: 'cache-first',
        client,
    });

    // Ref-stabilize refetch so callbacks don't re-create when Apollo returns a new reference
    const refetchRef = React.useRef(refetchOrgData);
    refetchRef.current = refetchOrgData;

    // Refetch immediately — executeWithNotification already waited for the
    // subgraph to index the transaction block before emitting the event.
    const handleRefresh = useCallback(() => {
        if (state.orgId) {
            refetchRef.current();
        }
    }, [state.orgId]);

    // Subscribe to relevant events
    useRefreshSubscription(
        [
            RefreshEvent.MEMBER_JOINED,
            RefreshEvent.MODULE_CREATED,
            RefreshEvent.MODULE_COMPLETED,
            RefreshEvent.TASK_COMPLETED, // Updates user stats
            RefreshEvent.METADATA_UPDATED, // Updates org metadata (name, description, etc.)
        ],
        handleRefresh,
        [handleRefresh]
    );

    // Process org data when available — single atomic dispatch
    useEffect(() => {
        if (orgData?.organization) {
            const org = orgData.organization;

            // Build role names map and canVote map from roles data
            const roleNamesMap = {};
            const roleCanVoteMap = {};
            if (org.roles && Array.isArray(org.roles)) {
                org.roles.forEach((role, index) => {
                    const hatId = role.hatId;
                    const name = role.name || role.hat?.name || `Role ${index + 1}`;
                    roleNamesMap[hatId] = name;
                    roleNamesMap[String(hatId)] = name;
                    roleCanVoteMap[hatId] = role.canVote !== false;
                    roleCanVoteMap[String(hatId)] = role.canVote !== false;
                });
            }

            // Calculate task counts from taskManager projects
            let activeTasks = 0;
            let completedTasks = 0;
            if (org.taskManager?.projects) {
                org.taskManager.projects.forEach(project => {
                    project.tasks?.forEach(task => {
                        if (task.status === 'Completed') {
                            completedTasks++;
                        } else if (task.status !== 'Cancelled') {
                            activeTasks++;
                        }
                    });
                });
            }

            // Process education modules
            const modules = org.educationHub?.modules || [];

            // Build metadata fields
            const eduHubId = org.educationHub?.id || '';
            // ZkEmailInvites is an OPTIONAL per-org module (like EducationHub) — present only when
            // the org opted in and the chain has ZK Email infra wired. Empty/absent otherwise.
            const zkEmailInvitesId = org.zkEmailInvites?.id || '';
            const adminHat = org.metadataAdminHatId;

            // The subgraph keeps `eligibilityModuleAdminHat` in
            // org.roleHatIds (it's still a real hat in the tree), but it's a
            // system hat — wearer is the EligibilityModule contract itself —
            // and we don't want it appearing in role pickers, the team-page
            // role tree, or the leaderboard. Strip it here so every downstream
            // consumer of roleHatIds gets the user-facing list. The companion
            // structural fix (don't add system hats to roleHatIds + mark
            // Role.isUserRole=false) lives on the subgraph side.
            const eligibilityAdminHatId = org.eligibilityModule?.eligibilityModuleAdminHat || null;
            const userFacingRoleHatIds = eligibilityAdminHatId
                ? (org.roleHatIds || []).filter(h => String(h) !== String(eligibilityAdminHatId))
                : (org.roleHatIds || []);

            let poDescription = 'No description provided or IPFS content still being indexed';
            let poLinks = [];
            if (org.metadata) {
                poDescription = org.metadata.description || 'No description provided';
                if (org.metadata.links && org.metadata.links.length > 0) {
                    // Older IPFS metadata occasionally has `url` as an object
                    // instead of a string; rendering it produced "[object
                    // Object]" hrefs that 404'd. Coerce to string and drop
                    // empty entries.
                    poLinks = org.metadata.links
                        .map(link => ({
                            name: typeof link.name === 'string' ? link.name : String(link?.name ?? ''),
                            url: typeof link.url === 'string' ? link.url : '',
                        }))
                        .filter(l => l.url && l.name);
                }
            } else if (org.metadataHash) {
                poDescription = 'Organization description loading from IPFS...';
            }

            // Single atomic dispatch replaces 25+ individual setState calls
            dispatch({
                type: 'SET_ORG_DATA',
                payload: {
                    logoHash: org.metadataHash || '',
                    logoUrl: org.metadata?.logo || '',
                    backgroundColor: org.metadata?.backgroundColor || null,
                    hideTreasury: org.metadata?.hideTreasury === true,
                    useTokenSymbol: org.metadata?.useTokenSymbol === true,
                    // Hours-only payout config. These fields may be absent from
                    // the subgraph response until subgraph-pop indexes them; the
                    // IPFS fallback effect below backfills them in that window.
                    taskPayoutHoursOnly: org.metadata?.taskPayoutHoursOnly === true,
                    taskPayoutHourlyRate: normalizeHourlyRate(org.metadata?.taskPayoutHourlyRate),
                    participationTokenSymbol: org.participationToken?.symbol || null,
                    tokenLabel: resolveTokenLabel({
                        useTokenSymbol: org.metadata?.useTokenSymbol === true,
                        symbol: org.participationToken?.symbol,
                    }),
                    poMembers: org.users?.length || 0,
                    ptTokenBalance: formatTokenAmount(org.participationToken?.totalSupply || '0'),
                    topHatId: org.topHatId,
                    roleHatIds: userFacingRoleHatIds,
                    metadataAdminHatId: adminHat && adminHat !== '0' ? adminHat : null,
                    eligibilityModuleAdminHat: eligibilityAdminHatId,
                    creatorHatIds: org.taskManager?.creatorHatIds || [],
                    // organizerHatIds is on TaskManager; foldersRoot is on
                    // Organization (per subgraph-pop PR #177). Both fall back
                    // to lens reads via useTaskManagerV4State until the PR
                    // deploys — the optional chains are undefined-safe.
                    organizerHatIds: org.taskManager?.organizerHatIds || [],
                    foldersRoot: org.foldersRoot || null,
                    roleNames: roleNamesMap,
                    roleCanVoteMap: roleCanVoteMap,
                    quickJoinContractAddress: org.quickJoin?.id || '',
                    taskManagerContractAddress: org.taskManager?.id || '',
                    hybridVotingContractAddress: org.hybridVoting?.id || '',
                    directDemocracyVotingContractAddress: org.directDemocracyVoting?.id || '',
                    educationHubAddress: eduHubId,
                    educationHubEnabled: !!(eduHubId && eduHubId !== ZERO_ADDRESS),
                    zkEmailInvitesAddress: zkEmailInvitesId,
                    zkEmailInvitesEnabled: !!(zkEmailInvitesId && zkEmailInvitesId !== ZERO_ADDRESS),
                    executorContractAddress: org.executorContract?.id || '',
                    eligibilityModuleAddress: org.eligibilityModule?.id || '',
                    participationTokenAddress: org.participationToken?.id || '',
                    paymentManagerAddress: org.paymentManager?.id || '',
                    participationVotingContractAddress: org.hybridVoting?.id || '',
                    votingContractAddress: org.hybridVoting?.id || '',
                    treasuryContractAddress: org.executorContract?.id || '',
                    ddTokenContractAddress: '',
                    nftMembershipContractAddress: '',
                    activeTaskAmount: activeTasks,
                    completedTaskAmount: completedTasks,
                    educationModules: transformEducationModules(modules),
                    leaderboardData: transformLeaderboardData(org.users, userFacingRoleHatIds),
                    rules: {
                        HybridVoting: org.hybridVoting ? {
                            id: org.hybridVoting.id,
                            quorum: org.hybridVoting.thresholdPct,
                        } : null,
                        DirectDemocracyVoting: org.directDemocracyVoting ? {
                            id: org.directDemocracyVoting.id,
                            quorum: org.directDemocracyVoting.thresholdPct,
                        } : null,
                        ParticipationVoting: org.hybridVoting ? {
                            id: org.hybridVoting.id,
                            quorum: org.hybridVoting.thresholdPct,
                        } : null,
                        NFTMembership: null,
                        Treasury: org.executorContract ? {
                            id: org.executorContract.id,
                        } : null,
                    },
                    poDescription,
                    poLinks,
                    poContextLoading: false,
                },
            });

            // Clean up newOrg query param now that full data is loaded
            // (deferred from org lookup to prevent flashing from PostDeployLoadingScreen to bare Spinner)
            if (router.query.newOrg === 'true') {
                const { newOrg, ...restQuery } = router.query;
                router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true });
            }
        }
    }, [orgData, router]);

    // Backfill metadata fields from IPFS that the subgraph hasn't surfaced yet.
    // Two cases:
    //   1. Subgraph has no `metadata` at all (brand-new org, pre-index) — fill
    //      logo / hideTreasury / backgroundColor / useTokenSymbol.
    //   2. Subgraph has `metadata` but not the hours-only payout fields. Those
    //      live in the IPFS metadata JSON and aren't in the subgraph schema
    //      until subgraph-pop ships them, so backfill just those. This bridge
    //      self-disables once the subgraph returns `taskPayoutHoursOnly`
    //      (defined, even when false).
    useEffect(() => {
        async function fetchMetadataFromIpfs() {
            const org = orgData?.organization;
            if (!org?.metadataHash) {
                return;
            }
            const subgraphHasMetadata = !!org.metadata;
            const subgraphHasPayoutConfig = org.metadata?.taskPayoutHoursOnly !== undefined;
            // Skip IPFS fetch only when the subgraph already provided everything.
            if (subgraphHasMetadata && subgraphHasPayoutConfig) {
                return;
            }
            try {
                const metadata = await safeFetchFromIpfs(org.metadataHash);
                const payload = {};
                if (!subgraphHasMetadata) {
                    dispatch({ type: 'SET_LOGO_URL', payload: metadata?.logo || '' });
                    const useTokenSymbol = metadata?.useTokenSymbol === true;
                    const symbol = org.participationToken?.symbol || null;
                    payload.hideTreasury = metadata?.hideTreasury === true;
                    payload.backgroundColor = metadata?.backgroundColor || null;
                    payload.useTokenSymbol = useTokenSymbol;
                    payload.participationTokenSymbol = symbol;
                    payload.tokenLabel = resolveTokenLabel({ useTokenSymbol, symbol });
                }
                if (!subgraphHasPayoutConfig) {
                    payload.taskPayoutHoursOnly = metadata?.taskPayoutHoursOnly === true;
                    payload.taskPayoutHourlyRate = normalizeHourlyRate(metadata?.taskPayoutHourlyRate);
                }
                if (Object.keys(payload).length > 0) {
                    dispatch({ type: 'SET_ORG_DATA', payload });
                }
            } catch (e) {
                console.warn('[POContext] Failed to fetch metadata from IPFS:', e);
            }
        }
        fetchMetadataFromIpfs();
    }, [orgData, safeFetchFromIpfs]);

    // Fetch IPFS content for education modules (description, quiz, answers, link)
    // The subgraph only stores title + contentHash; the rest lives in IPFS.
    useEffect(() => {
        async function fetchModuleContent() {
            const modules = state.educationModules;
            if (!modules || modules.length === 0) return;

            const modulesNeedingFetch = modules.filter(m => m.ipfsHash && !m._ipfsFetched);
            if (modulesNeedingFetch.length === 0) return;

            const updated = await Promise.all(
                modules.map(async (module) => {
                    if (!module.ipfsHash || module._ipfsFetched) return module;
                    try {
                        const content = await safeFetchFromIpfs(module.ipfsHash);
                        if (!content) return { ...module, _ipfsFetched: true };
                        return {
                            ...module,
                            description: content.description || module.description,
                            link: content.link || '',
                            question: content.quiz?.[0] || '',
                            answers: (content.answers?.[0] || []).map((ans, i) => ({
                                index: i,
                                answer: ans,
                            })),
                            _ipfsFetched: true,
                        };
                    } catch (e) {
                        console.warn('[POContext] Failed to fetch education module IPFS content:', e);
                        return { ...module, _ipfsFetched: true };
                    }
                })
            );

            dispatch({
                type: 'SET_ORG_DATA',
                payload: { educationModules: updated },
            });
        }
        fetchModuleContent();
    }, [state.educationModules, safeFetchFromIpfs]);

    // Combined loading and error states
    const loading = orgLookupLoading || orgDataLoading;
    const rawError = orgLookupError || orgDataError;
    // Stabilize error: only change when the message string changes, not the object reference
    const errorMessage = rawError?.message || null;

    // Note: "org not found" is handled inline in the parallel fetch above

    const contextValue = useMemo(() => ({
        // Organization info
        orgId: state.orgId,
        orgChainId: state.orgChainId,
        subgraphUrl,
        poDescription: state.poDescription,
        poLinks: state.poLinks,
        logoHash: state.logoHash,
        logoUrl: state.logoUrl,
        backgroundColor: state.backgroundColor,
        metadataAdminHatId: state.metadataAdminHatId,
        poMembers: state.poMembers,
        activeTaskAmount: state.activeTaskAmount,
        completedTaskAmount: state.completedTaskAmount,
        ptTokenBalance: state.ptTokenBalance,

        // Contract addresses
        quickJoinContractAddress: state.quickJoinContractAddress,
        treasuryContractAddress: state.treasuryContractAddress,
        taskManagerContractAddress: state.taskManagerContractAddress,
        hybridVotingContractAddress: state.hybridVotingContractAddress,
        participationVotingContractAddress: state.participationVotingContractAddress,
        directDemocracyVotingContractAddress: state.directDemocracyVotingContractAddress,
        ddTokenContractAddress: state.ddTokenContractAddress,
        nftMembershipContractAddress: state.nftMembershipContractAddress,
        votingContractAddress: state.votingContractAddress,
        educationHubAddress: state.educationHubAddress,
        zkEmailInvitesAddress: state.zkEmailInvitesAddress,
        executorContractAddress: state.executorContractAddress,
        eligibilityModuleAddress: state.eligibilityModuleAddress,
        eligibilityModuleAdminHat: state.eligibilityModuleAdminHat,
        participationTokenAddress: state.participationTokenAddress,
        paymentManagerAddress: state.paymentManagerAddress,

        // Derived data
        loading,
        error: errorMessage ? { message: errorMessage } : null,
        leaderboardData: state.leaderboardData,
        leaderboardDisplayData,
        avatarMap,
        poContextLoading: state.poContextLoading,
        rules: state.rules,
        educationModules: state.educationModules,

        // POP-specific data
        roleHatIds: state.roleHatIds,
        topHatId: state.topHatId,
        creatorHatIds: state.creatorHatIds,
        organizerHatIds: state.organizerHatIds,
        foldersRoot: state.foldersRoot,
        educationHubEnabled: state.educationHubEnabled,
        zkEmailInvitesEnabled: state.zkEmailInvitesEnabled,
        hideTreasury: state.hideTreasury,
        useTokenSymbol: state.useTokenSymbol,
        // Hours-only task payout: raw fields (for the settings editor) plus a
        // convenience object to hand straight to calculatePayout().
        taskPayoutHoursOnly: state.taskPayoutHoursOnly,
        taskPayoutHourlyRate: state.taskPayoutHourlyRate,
        taskPayoutConfig: {
            hoursOnly: state.taskPayoutHoursOnly,
            hourlyRate: state.taskPayoutHourlyRate,
        },
        participationTokenSymbol: state.participationTokenSymbol,
        tokenLabel: state.tokenLabel,
        roleNames: state.roleNames,
        roleCanVoteMap: state.roleCanVoteMap,
    }), [state, loading, errorMessage, leaderboardDisplayData, avatarMap, subgraphUrl]);

    return (
        <POContext.Provider value={contextValue}>
            {errorMessage && <div>Error: {errorMessage}</div>}
            {children}
        </POContext.Provider>
    );
};
