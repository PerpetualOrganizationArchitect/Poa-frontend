import React, { createContext, useContext, useEffect, useMemo, useCallback, useReducer, useRef, useState } from 'react';
import { useQuery } from '@apollo/client';
import {
    FETCH_VOTING_DATA_NEW,
    FETCH_VOTING_DATA_WITH_PROPOSER,
    FETCH_PROPOSAL_BY_ID,
    FETCH_PROPOSAL_BY_ID_WITH_PROPOSER,
} from '../util/queries';
import { hasProposerField } from '../util/subgraphCapabilities';
import { usePOContext } from './POContext';
import { useRefreshSubscription, RefreshEvent } from './RefreshContext';
import { useSubgraphClient } from '../util/apolloClient';
import { useUserActive } from '../hooks/useUserActive';
import { useAuth } from './AuthContext';

const VotingContext = createContext();

export const useVotingContext = () => useContext(VotingContext);

/**
 * Grace period (ms) an optimistic vote stays merged before it auto-expires.
 * Matches the repo-wide optimistic grace convention — do NOT shorten. The
 * subgraph has 5-15s indexing lag; this window keeps the user's own vote
 * visible until the real vote is indexed.
 */
const OPTIMISTIC_VOTE_GRACE_MS = 65000;

/**
 * Proposals per page. The polled org query always asks for exactly this many
 * (newest first) and never widens — VotingProvider is app-global, so a bigger
 * window would tax every page twice a minute. Older proposals arrive on demand
 * via loadMoreProposals() / resolveMissingPoll().
 */
const PROPOSAL_PAGE_SIZE = 50;

/**
 * "No cursor" sentinel — max uint256, so `proposalId_lt` matches everything and
 * page 1 is simply the newest PROPOSAL_PAGE_SIZE.
 *
 * Paging is keyset (proposalId_lt), not offset (skip): proposals are only ever
 * appended at the top, so an offset window SHIFTS when someone opens a vote
 * mid-session — you'd re-fetch a row you already had and silently skip one you
 * didn't. A cursor anchored to the oldest id you hold cannot drift. proposalId
 * is a BigInt in the schema, and it increases with startTimestamp (both are set
 * at creation), so it is a valid cursor for this sort order.
 */
const NO_CURSOR = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

/**
 * Pure helper: find the merged vote cast by `address` on a transformed
 * proposal. Returns {optionIndexes, optionWeights} or null. Exported so
 * callers outside VotingProvider (or below a different auth boundary) can
 * derive per-user vote state without duplicating the lookup.
 *
 * @param {object} proposal - A transformed proposal (has `.votes`)
 * @param {string} address - Voter address (case-insensitive)
 */
export function findUserVote(proposal, address) {
    if (!proposal || !address) return null;
    const lower = address.toLowerCase();
    const match = (proposal.votes || []).find(
        v => (v.voter || '').toLowerCase() === lower
    );
    if (!match) return null;
    return {
        optionIndexes: match.optionIndexes || [],
        optionWeights: match.optionWeights || [],
    };
}

/**
 * Compute per-option scores for a Hybrid proposal using the same N-class
 * slice math the on-chain contract (VotingMath.pickWinnerNSlices) uses:
 *
 *   score[opt] = Σ_c [ optRaw[opt][c] × slice[c] / classTotal[c] ]
 *
 * Each class normalizes option shares independently, then contributes its
 * slice percentage weight. With full weight votes and every class having at
 * least one voter, scores sum to 100. Percentages are derived from these
 * scores (not from flat-summed raw powers, which lets token-balance classes
 * drown out direct-voter classes).
 *
 * @param {Array} votes - Array of Vote entities from the subgraph
 * @param {number} numOptions - Number of options in the proposal
 * @param {number[]} slices - Slice percentages per class (sums to 100)
 * @returns {{scores: number[], voterCounts: number[], distinctVoters: number}}
 */
function computeHybridOptionScores(votes, numOptions, slices) {
    const numClasses = slices.length;
    const classTotalRaw = new Array(numClasses).fill(0n);
    const optionClassRaw = Array.from({ length: numOptions }, () => new Array(numClasses).fill(0n));
    const voterCounts = new Array(numOptions).fill(0);

    for (const vote of votes) {
        const rawPowers = (vote.classRawPowers || []).map(p => BigInt(p || 0));
        while (rawPowers.length < numClasses) rawPowers.push(0n);

        for (let c = 0; c < numClasses; c++) {
            classTotalRaw[c] += rawPowers[c];
        }

        const idxs = vote.optionIndexes || [];
        const weights = vote.optionWeights || [];
        for (let i = 0; i < idxs.length; i++) {
            const optIdx = idxs[i];
            if (optIdx < 0 || optIdx >= numOptions) continue;
            const weight = BigInt(weights[i] ?? 100);
            for (let c = 0; c < numClasses; c++) {
                optionClassRaw[optIdx][c] += (rawPowers[c] * weight) / 100n;
            }
            voterCounts[optIdx] += 1;
        }
    }

    const scores = new Array(numOptions).fill(0);
    for (let opt = 0; opt < numOptions; opt++) {
        let score = 0;
        for (let c = 0; c < numClasses; c++) {
            if (classTotalRaw[c] > 0n) {
                // Use basis-point precision (×10000) in BigInt math, then convert.
                // Max contribution per class ≤ slice[c] × 10000 = 1,000,000 — safe in Number.
                const scoreBp = (optionClassRaw[opt][c] * BigInt(slices[c]) * 10000n) / classTotalRaw[c];
                score += Number(scoreBp) / 10000;
            }
        }
        scores[opt] = score;
    }

    return { scores, voterCounts, distinctVoters: votes.length };
}

function transformProposal(proposal, votingTypeId, type, thresholdPct = 0, quorum = 0, votingClasses = [], viewerAddress = null) {
    const currentTime = Math.floor(Date.now() / 1000);
    const endTime = parseInt(proposal.endTimestamp) || 0;
    // A proposal is "ongoing" if it's still Active (needs voting or winner announcement)
    // It moves to "completed" only after status changes from Active
    const isOngoing = proposal.status === 'Active';
    // Track if voting period has ended (but winner may not be announced yet)
    const isExpired = endTime <= currentTime;

    // Get metadata from IPFS (if subgraph has indexed it)
    const metadata = proposal.metadata || {};
    const description = metadata.description || '';
    const optionNames = metadata.optionNames || [];
    const numOptions = proposal.numOptions || 2;

    const options = [];
    let totalVotes = 0;

    if (type === 'Hybrid') {
        // Replicate the on-chain winner math. If we don't have voting classes yet
        // (subgraph lag or no classes defined), fall back to voter-count only —
        // percentages may be briefly off until classes load.
        const slices = votingClasses.map(c => Number(c.slicePct));
        const votes = proposal.votes || [];

        if (slices.length > 0 && slices.some(s => s > 0)) {
            const { scores, voterCounts, distinctVoters } = computeHybridOptionScores(
                votes, numOptions, slices
            );
            const scoreSum = scores.reduce((a, b) => a + b, 0);
            totalVotes = distinctVoters;

            for (let i = 0; i < numOptions; i++) {
                // Normalize so bars visually sum to 100% even when some classes
                // have zero voters (contract's raw score can be < 100 in that case).
                const percentage = scoreSum > 0 ? (scores[i] / scoreSum) * 100 : 0;
                options.push({
                    id: `${proposal.id}-option-${i}`,
                    name: optionNames[i] || `Option ${i + 1}`,
                    votes: voterCounts[i],
                    displayVotes: String(voterCounts[i]),
                    percentage,
                    currentPercentage: Math.round(percentage),
                    rawScore: scores[i], // 0-100 scale (contract units) before normalization
                });
            }
        } else {
            // Fallback: count voters per option with no class weighting
            const voterCounts = new Array(numOptions).fill(0);
            for (const vote of votes) {
                (vote.optionIndexes || []).forEach(optIdx => {
                    if (optIdx >= 0 && optIdx < numOptions) voterCounts[optIdx] += 1;
                });
            }
            const total = voterCounts.reduce((a, b) => a + b, 0);
            totalVotes = votes.length;
            for (let i = 0; i < numOptions; i++) {
                const percentage = total > 0 ? (voterCounts[i] / total) * 100 : 0;
                options.push({
                    id: `${proposal.id}-option-${i}`,
                    name: optionNames[i] || `Option ${i + 1}`,
                    votes: voterCounts[i],
                    displayVotes: String(voterCounts[i]),
                    percentage,
                    currentPercentage: Math.round(percentage),
                });
            }
        }
    } else {
        // Direct Democracy: 1-person-1-vote with weight distribution
        const optionWeightSum = new Array(numOptions).fill(0);
        const voterCounts = new Array(numOptions).fill(0);
        for (const vote of proposal.votes || []) {
            (vote.optionIndexes || []).forEach((optIdx, i) => {
                if (optIdx < 0 || optIdx >= numOptions) return;
                const weight = vote.optionWeights?.[i] ?? 100;
                optionWeightSum[optIdx] += weight;
                voterCounts[optIdx] += 1;
            });
            totalVotes += 100;
        }
        const totalWeight = optionWeightSum.reduce((a, b) => a + b, 0);
        for (let i = 0; i < numOptions; i++) {
            const percentage = totalWeight > 0 ? (optionWeightSum[i] / totalWeight) * 100 : 0;
            options.push({
                id: `${proposal.id}-option-${i}`,
                name: optionNames[i] || `Option ${i + 1}`,
                votes: voterCounts[i],
                displayVotes: String(voterCounts[i]),
                percentage,
                currentPercentage: Math.round(percentage),
            });
        }
    }

    // Parse winningOption as number (comes as BigInt string from subgraph)
    const winningOptionNum = proposal.winningOption !== null && proposal.winningOption !== undefined
        ? parseInt(proposal.winningOption, 10)
        : null;

    // Per-viewer vote state (merged votes array includes any optimistic vote).
    // Additive fields only — existing output shape is unchanged.
    const mergedVotes = proposal.votes || [];
    let userVote = null;
    if (viewerAddress) {
        const lower = viewerAddress.toLowerCase();
        const own = mergedVotes.find(v => (v.voter || '').toLowerCase() === lower);
        if (own) {
            userVote = {
                optionIndexes: own.optionIndexes || [],
                optionWeights: own.optionWeights || [],
            };
        }
    }

    return {
        id: proposal.id,
        proposalId: proposal.proposalId,
        title: proposal.title || 'Indexing...',
        description: description,
        descriptionHash: proposal.descriptionHash,
        startTimestamp: proposal.startTimestamp,
        endTimestamp: proposal.endTimestamp,
        winningOption: winningOptionNum,
        isValid: proposal.isValid,
        wasExecuted: proposal.wasExecuted,
        executionFailed: proposal.executionFailed === true,
        executionError: proposal.executionError || null,
        status: proposal.status,
        isOngoing,
        isExpired,
        options,
        totalVotes,
        votes: proposal.votes || [],
        votingTypeId,
        type,
        thresholdPct,
        quorum,
        isHatRestricted: proposal.isHatRestricted,
        restrictedHatIds: proposal.restrictedHatIds || [],
        // Passthroughs for subgraph fields that ship later (undefined until the
        // query fetches them — ProposalCard's proposer slot self-enables).
        proposerUsername: proposal.proposerUsername ?? proposal.creatorUsername ?? null,
        actionSummaries: metadata.actionSummaries || [],
        promotedFrom: metadata.promotedFrom || null,
        userHasVoted: userVote !== null,
        userVote,
    };
}

const initialVotingState = {
    hybridVotingOngoing: [],
    hybridVotingCompleted: [],
    democracyVotingOngoing: [],
    democracyVotingCompleted: [],
    ongoingPolls: [],
    votingType: 'Hybrid',
    votingClasses: [],
    // Rule constants (additive — surfaced for the Constitution panel). These are
    // the same threshold/quorum values already read from the org in the data
    // effect; storing them here makes the group's live rules legible on /voting.
    hybridThresholdPct: 0,
    hybridQuorum: 0,
    ddThresholdPct: 0,
    ddQuorum: 0,
};

function votingReducer(state, action) {
    switch (action.type) {
        case 'SET_VOTING_DATA':
            return { ...state, ...action.payload };
        default:
            return state;
    }
}

export const VotingProvider = ({ children }) => {
    const [state, dispatch] = useReducer(votingReducer, initialVotingState);

    const { orgId, subgraphUrl } = usePOContext();
    const client = useSubgraphClient(subgraphUrl);
    const isActive = useUserActive();
    const { accountAddress } = useAuth();

    // Proposer attribution self-enables: probe the serving subgraph's schema
    // once (cached) and upgrade to the richer query only when the field exists
    // — asking for an unknown field errors the entire org query.
    const [proposerSupported, setProposerSupported] = useState(false);
    useEffect(() => {
        let cancelled = false;
        // Reset on every endpoint switch: a cross-chain org may serve an older
        // schema, and carrying `true` over would error its entire org query.
        setProposerSupported(false);
        if (!subgraphUrl) return undefined;
        hasProposerField(subgraphUrl).then((has) => {
            if (!cancelled) setProposerSupported(!!has);
        });
        return () => { cancelled = true; };
    }, [subgraphUrl]);

    // pollInterval keeps voting data fresh so another member's vote appears
    // without a reload. Voting is event-driven, but events only fire for the
    // acting user; gentle 30s polling surfaces everyone else's activity.
    // Polling pauses when the tab is hidden or the user is idle (useUserActive).
    const votingQuery = proposerSupported ? FETCH_VOTING_DATA_WITH_PROPOSER : FETCH_VOTING_DATA_NEW;

    const { data, loading, error, refetch } = useQuery(
        votingQuery,
        {
        // The polled query's window NEVER widens. VotingProvider is app-global,
        // so a bigger `first` would tax /dashboard, /tasks and /profile with a
        // heavier payload twice a minute. Older pages are fetched once, on
        // demand, by loadMoreProposals() below — which reuses THIS document
        // with a real cursor, so the two can never drift apart.
        variables: {
            orgId,
            first: PROPOSAL_PAGE_SIZE,
            hybridBefore: NO_CURSOR,
            ddBefore: NO_CURSOR,
        },
        skip: !orgId,
        fetchPolicy: 'cache-first',
        pollInterval: isActive ? 30000 : 0,
        client,
        }
    );

    // ── Proposals outside the polled window ─────────────────────────────
    // The polled query only ever carries the newest PROPOSAL_PAGE_SIZE
    // proposals. Everything older is fetched on demand and held here, then
    // spliced into the RAW lists so it flows through the same transformProposal
    // call as everything else — same percentages, lifecycle and lanes.
    //
    // Two callers fill this pool:
    //   resolveMissingPoll(id)  — one proposal, for a ?poll= deep link
    //   loadMoreProposals()     — the next page, for the /votes archive
    const [extraProposals, setExtraProposals] = useState({}); // { [id]: { type, raw } }
    const rescueAttemptedRef = useRef(new Set());
    // Extra PAGES fetched per kind, and whether the server has run out. `done`
    // is per kind because the two lists are independent (Argus: 75 hybrid, and
    // no direct-democracy contract at all).
    const [morePages, setMorePages] = useState({ hybrid: 0, dd: 0 });
    const [moreDone, setMoreDone] = useState({ hybrid: false, dd: false });
    const [loadingMore, setLoadingMore] = useState(false);

    // A different org (or endpoint) has a different proposal universe.
    useEffect(() => {
        setExtraProposals({});
        rescueAttemptedRef.current = new Set();
        setMorePages({ hybrid: 0, dd: 0 });
        setMoreDone({ hybrid: false, dd: false });
        setLoadingMore(false);
    }, [orgId, subgraphUrl]);

    const rescuedRef = useRef(extraProposals);
    rescuedRef.current = extraProposals;

    // Read inside loadMoreProposals without making it a new function on every
    // page load (it is handed to /votes and used in a click handler).
    const morePagesRef = useRef(morePages);
    morePagesRef.current = morePages;
    const moreDoneRef = useRef(moreDone);
    moreDoneRef.current = moreDone;
    const loadingMoreRef = useRef(false);
    const votingQueryRef = useRef(votingQuery);
    votingQueryRef.current = votingQuery;
    const dataRef = useRef(data);
    dataRef.current = data;
    const orgIdRef = useRef(orgId);
    orgIdRef.current = orgId;

    // The org's voting contract addresses, which are also the prefix of every
    // proposal id they own. Kept in a ref so the resolver below stays stable
    // across the 30s poll. `bulkLoaded` guards the resolver against running
    // before the org query has answered — at that point `client` is still the
    // DEFAULT (home-chain) client, and a by-id lookup there returns null for a
    // perfectly good Gnosis proposal: a wrong "this vote doesn't exist".
    const votingIdsRef = useRef({ hybrid: null, dd: null, bulkLoaded: false });
    votingIdsRef.current = {
        hybrid: data?.organization?.hybridVoting?.id || null,
        dd: data?.organization?.directDemocracyVoting?.id || null,
        bulkLoaded: !!data,
    };

    /** Merge any rescued raw proposals of `type` into a raw list, no duplicates. */
    const withRescued = useCallback((list, type) => {
        const base = list || [];
        const extra = Object.values(rescuedRef.current).filter(
            (r) => r.type === type && !base.some((p) => p.id === r.raw.id)
        );
        return extra.length ? [...base, ...extra.map((r) => r.raw)] : base;
    }, []);

    /**
     * Resolve a poll id that isn't in the loaded arrays.
     * Returns 'found' | 'foreign' | 'notFound' | 'error' | 'pending'.
     * 'found' means the raw proposal was spliced in — the caller's own array
     * search will pick it up on the next render.
     */
    const resolveMissingPoll = useCallback(async (pollId) => {
        if (!pollId || !client) return 'error';
        if (rescueAttemptedRef.current.has(pollId)) return 'pending';

        // Wait for the org query. Before it answers we neither know which
        // endpoint to ask nor which proposals are ours; the caller retries as
        // the arrays update.
        const { hybrid: hybridPrefix, dd: ddPrefix, bulkLoaded } = votingIdsRef.current;
        if (!bulkLoaded) return 'pending';

        // Proposal ids are `{votingContractAddress}-{n}`, so we can tell a link
        // meant for another org from one of ours WITHOUT a network round trip.
        const belongsHere =
            (hybridPrefix && pollId.startsWith(`${hybridPrefix}-`)) ||
            (ddPrefix && pollId.startsWith(`${ddPrefix}-`));
        if (!belongsHere) return 'foreign';

        rescueAttemptedRef.current.add(pollId);
        try {
            const { data: byId } = await client.query({
                query: proposerSupported ? FETCH_PROPOSAL_BY_ID_WITH_PROPOSER : FETCH_PROPOSAL_BY_ID,
                variables: { proposalId: pollId },
                fetchPolicy: 'network-only',
            });
            const raw = byId?.proposal || byId?.ddvProposal;
            if (!raw) return 'notFound';
            setExtraProposals((prev) => ({
                ...prev,
                [pollId]: { type: byId.proposal ? 'Hybrid' : 'Direct Democracy', raw },
            }));
            return 'found';
        } catch (e) {
            // Transient (gateway hiccup): allow a later attempt rather than
            // telling the user their link is dead.
            rescueAttemptedRef.current.delete(pollId);
            console.warn('[VotingContext] proposal rescue failed:', e?.message);
            return 'error';
        }
    }, [client, proposerSupported]);

    /** Oldest proposalId we currently hold for a kind — the next page's cursor. */
    const oldestHeldId = useCallback((kind) => {
        const org = dataRef.current?.organization;
        const base = kind === 'Hybrid'
            ? (org?.hybridVoting?.proposals || [])
            : (org?.directDemocracyVoting?.ddvProposals || []);
        const pool = Object.values(rescuedRef.current)
            .filter((r) => r.type === kind)
            .map((r) => r.raw);
        let min = null;
        for (const p of [...base, ...pool]) {
            const n = BigInt(p.proposalId ?? 0);
            if (min === null || n < min) min = n;
        }
        return min === null ? NO_CURSOR : min.toString();
    }, []);

    /**
     * Fetch the next page of older proposals for BOTH kinds into the pool. Uses
     * the SAME document as the polled query — only the cursor differs — so the
     * selection sets can never drift apart, and because it is imperative the
     * 30s poll keeps its small, fixed window.
     *
     * Returns { added, addedCompleted }: total new rows, and how many of them
     * are finished votes (the only ones the archive renders).
     */
    const loadMoreProposals = useCallback(async () => {
        // Same guard as the rescue: before the org query answers, `client` may
        // still be the home-chain default and would return an empty page.
        if (!client || !orgId || !votingIdsRef.current.bulkLoaded) return { added: 0, addedCompleted: 0 };
        if (loadingMoreRef.current) return { added: 0, addedCompleted: 0 };
        loadingMoreRef.current = true;
        setLoadingMore(true);
        const requestedOrg = orgId;
        const done = moreDoneRef.current;
        try {
            const { data: page } = await client.query({
                query: votingQueryRef.current,
                variables: {
                    orgId,
                    first: PROPOSAL_PAGE_SIZE,
                    // A kind that has already run out asks for nothing more.
                    hybridBefore: done.hybrid ? '0' : oldestHeldId('Hybrid'),
                    ddBefore: done.dd ? '0' : oldestHeldId('Direct Democracy'),
                },
                fetchPolicy: 'network-only',
            });

            // The org switched under us — merging these rows would mix two orgs'
            // proposals into one pool (they are keyed by id, not by org).
            if (requestedOrg !== orgIdRef.current) return { added: 0, addedCompleted: 0 };

            // A response with no organization is a fault (wrong endpoint, gateway
            // 200-with-null), NOT proof that there is nothing older. Latching
            // `done` on it would delete the affordance for good.
            if (!page?.organization) {
                console.warn('[VotingContext] older-proposal page came back without an organization');
                return { added: 0, addedCompleted: 0, error: true };
            }

            const hybridRaw = page.organization.hybridVoting?.proposals || [];
            const ddRaw = page.organization.directDemocracyVoting?.ddvProposals || [];

            const additions = {};
            for (const raw of hybridRaw) additions[raw.id] = { type: 'Hybrid', raw };
            for (const raw of ddRaw) additions[raw.id] = { type: 'Direct Democracy', raw };

            let added = 0;
            let addedCompleted = 0;
            setExtraProposals((prev) => {
                const next = { ...prev };
                for (const [id, v] of Object.entries(additions)) {
                    if (next[id]) continue;
                    next[id] = v;
                    added += 1;
                    // transformProposal calls anything not 'Active' completed.
                    if (v.raw.status !== 'Active') addedCompleted += 1;
                }
                return next;
            });

            // A short page means the server has nothing older for that kind.
            // Safe to latch with a cursor: new proposals are only ever appended
            // at the TOP, so "nothing older" stays true.
            setMorePages({
                hybrid: done.hybrid ? morePagesRef.current.hybrid : morePagesRef.current.hybrid + 1,
                dd: done.dd ? morePagesRef.current.dd : morePagesRef.current.dd + 1,
            });
            setMoreDone({
                hybrid: done.hybrid || hybridRaw.length < PROPOSAL_PAGE_SIZE,
                dd: done.dd || ddRaw.length < PROPOSAL_PAGE_SIZE,
            });
            return { added, addedCompleted };
        } catch (e) {
            console.warn('[VotingContext] loading older proposals failed:', e?.message);
            return { added: 0, addedCompleted: 0, error: true };
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [client, orgId, oldestHeldId]);

    // Ref-stabilize refetch so callbacks don't re-create when Apollo returns a new reference
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;

    // When the user returns (tab visible / mouse moves), refetch immediately
    // so stale data doesn't persist until the next poll tick.
    const wasActiveRef = useRef(isActive);
    useEffect(() => {
        if (isActive && !wasActiveRef.current && orgId) {
            refetchRef.current();
        }
        wasActiveRef.current = isActive;
    }, [isActive, orgId]);

    // ── Optimistic votes ────────────────────────────────────────────────
    // Map<proposalCompositeId, { vote, insertedAt }>. Merged into the matching
    // raw proposal's votes array before transformProposal so the user's own
    // vote shows instantly during the 5-15s subgraph indexing window.
    const [optimisticVotes, setOptimisticVotes] = useState({});
    const optimisticTimersRef = useRef(new Map());

    const addOptimisticVote = useCallback((proposalCompositeId, vote) => {
        if (!proposalCompositeId || !vote) return;
        setOptimisticVotes(prev => ({
            ...prev,
            [proposalCompositeId]: { vote, insertedAt: Date.now() },
        }));

        // Grace: auto-expire 65s after insertion. Firing a state update forces
        // the merge to recompute so the entry drops out (by which point the
        // real subgraph vote should have indexed). Do NOT shorten this window.
        const existingTimer = optimisticTimersRef.current.get(proposalCompositeId);
        if (existingTimer) clearTimeout(existingTimer);
        const timer = setTimeout(() => {
            optimisticTimersRef.current.delete(proposalCompositeId);
            setOptimisticVotes(prev => {
                if (!prev[proposalCompositeId]) return prev;
                const next = { ...prev };
                delete next[proposalCompositeId];
                return next;
            });
        }, OPTIMISTIC_VOTE_GRACE_MS);
        optimisticTimersRef.current.set(proposalCompositeId, timer);
    }, []);

    // Roll back an optimistic vote (e.g. the cast tx failed). Clears the entry
    // and its pending expiry timer so the celebration can restore the ballot
    // without a stale merged vote lingering for the rest of the grace window.
    const removeOptimisticVote = useCallback((proposalCompositeId) => {
        if (!proposalCompositeId) return;
        const timer = optimisticTimersRef.current.get(proposalCompositeId);
        if (timer) {
            clearTimeout(timer);
            optimisticTimersRef.current.delete(proposalCompositeId);
        }
        setOptimisticVotes(prev => {
            if (!prev[proposalCompositeId]) return prev;
            const next = { ...prev };
            delete next[proposalCompositeId];
            return next;
        });
    }, []);

    // Clear any pending expiry timers on unmount.
    useEffect(() => {
        const timers = optimisticTimersRef.current;
        return () => {
            timers.forEach(t => clearTimeout(t));
            timers.clear();
        };
    }, []);

    // Refetch immediately — executeWithNotification already waited for the
    // subgraph to index the transaction block before emitting the event.
    const handleRefresh = useCallback(() => {
        if (orgId) {
            refetchRef.current();
        }
    }, [orgId]);

    // Subscribe only to voting-specific events (not ALL, which fires on every event)
    useRefreshSubscription(
        [RefreshEvent.PROPOSAL_CREATED, RefreshEvent.PROPOSAL_VOTED, RefreshEvent.PROPOSAL_COMPLETED],
        handleRefresh,
        [handleRefresh]
    );

    useEffect(() => {
        if (data?.organization) {
            const org = data.organization;
            let hybridProposals = [];
            let ddProposals = [];
            const update = {};

            // Merge any optimistic vote for a proposal into a COPY of its raw
            // votes array before transforming. Dedupe: if a real subgraph vote
            // from the same voter already exists, drop the optimistic one (the
            // real vote wins). Returns the proposal (possibly a shallow copy).
            const mergeOptimistic = (proposal) => {
                const entry = optimisticVotes[proposal.id];
                if (!entry) return proposal;
                const { vote } = entry;
                const voterLower = (vote.voter || '').toLowerCase();
                const realVotes = proposal.votes || [];
                const alreadyReal = realVotes.some(
                    v => (v.voter || '').toLowerCase() === voterLower
                );
                if (alreadyReal) return proposal;
                return {
                    ...proposal,
                    votes: [
                        ...realVotes,
                        {
                            voter: vote.voter,
                            voterUsername: vote.voterUsername || '',
                            optionIndexes: vote.optionIndexes || [],
                            optionWeights: vote.optionWeights || [],
                            classRawPowers: vote.classRawPowers || [],
                        },
                    ],
                };
            };

            if (org.hybridVoting) {
                update.votingType = 'Hybrid';
            } else if (org.directDemocracyVoting) {
                update.votingType = 'Direct Democracy';
            }

            // Process Hybrid Voting proposals and classes
            if (org.hybridVoting) {
                const hybridThreshold = org.hybridVoting.thresholdPct || 0;
                const hybridQuorum = org.hybridVoting.quorum || 0;
                update.hybridThresholdPct = hybridThreshold;
                update.hybridQuorum = hybridQuorum;

                // Process voting classes first — transformProposal needs them for
                // the per-class-weighted percentage math (matches contract logic).
                // Filter to latest version only (subgraph bug: old versions stay isActive).
                // NOTE: This uses CURRENT classes, not the classesSnapshot stored on
                // each proposal at creation time. If classes changed mid-proposal
                // lifetime, percentages may drift from the exact on-chain calculation.
                const rawClasses = org.hybridVoting.votingClasses || [];
                const maxVersion = rawClasses.reduce(
                    (max, c) => Math.max(max, Number(c.version || 0)), 0
                );
                const activeClasses = rawClasses
                    .filter(c => Number(c.version || 0) === maxVersion)
                    .map(c => ({
                        classIndex: Number(c.classIndex),
                        strategy: c.strategy,
                        slicePct: Number(c.slicePct),
                        quadratic: c.quadratic,
                        minBalance: c.minBalance?.toString() || '0',
                        asset: c.asset,
                        hatIds: (c.hatIds || []).map(h => h.toString()),
                    }))
                    .sort((a, b) => a.classIndex - b.classIndex);
                update.votingClasses = activeClasses;

                hybridProposals = withRescued(org.hybridVoting.proposals, 'Hybrid').map(p =>
                    transformProposal(mergeOptimistic(p), org.hybridVoting.id, 'Hybrid', hybridThreshold, hybridQuorum, activeClasses, accountAddress)
                );
                update.hybridVotingOngoing = hybridProposals.filter(p => p.isOngoing);
                const hybridCompleted = hybridProposals.filter(p => !p.isOngoing);
                hybridCompleted.sort((a, b) => parseInt(b.endTimestamp) - parseInt(a.endTimestamp));
                update.hybridVotingCompleted = hybridCompleted;
            } else {
                update.hybridVotingOngoing = [];
                update.hybridVotingCompleted = [];
                update.votingClasses = [];
                update.hybridThresholdPct = 0;
                update.hybridQuorum = 0;
            }

            // Process Direct Democracy Voting proposals
            if (org.directDemocracyVoting) {
                const ddThreshold = org.directDemocracyVoting.thresholdPct || 0;
                const ddQuorum = org.directDemocracyVoting.quorum || 0;
                update.ddThresholdPct = ddThreshold;
                update.ddQuorum = ddQuorum;
                ddProposals = withRescued(org.directDemocracyVoting.ddvProposals, 'Direct Democracy').map(p =>
                    transformProposal(mergeOptimistic(p), org.directDemocracyVoting.id, 'Direct Democracy', ddThreshold, ddQuorum, [], accountAddress)
                );
                update.democracyVotingOngoing = ddProposals.filter(p => p.isOngoing);
                const ddCompleted = ddProposals.filter(p => !p.isOngoing);
                ddCompleted.sort((a, b) => parseInt(b.endTimestamp) - parseInt(a.endTimestamp));
                update.democracyVotingCompleted = ddCompleted;
            } else {
                update.democracyVotingOngoing = [];
                update.democracyVotingCompleted = [];
                update.ddThresholdPct = 0;
                update.ddQuorum = 0;
            }

            // Combine all ongoing polls from already-transformed proposals
            update.ongoingPolls = [
                ...hybridProposals.filter(p => p.isOngoing),
                ...ddProposals.filter(p => p.isOngoing),
            ];

            // Single dispatch — one re-render instead of 7
            dispatch({ type: 'SET_VOTING_DATA', payload: update });
        }
        // `extraProposals` is a dependency: an on-demand fetch lands AFTER this
        // effect last ran, and without it the fetched proposals would sit in
        // state and never reach the arrays.
    }, [data, optimisticVotes, accountAddress, extraProposals, withRescued]);

    // Stable refetch passthrough so a retry banner can re-run the query.
    const refetchVoting = useCallback(() => refetchRef.current?.(), []);

    /**
     * Might the server still have older proposals? A kind is a candidate only
     * while its LAST page came back full — page 1 for a kind we've never paged,
     * or the most recent extra page. A kind whose voting contract doesn't exist
     * (Argus has no direct democracy) never qualifies.
     */
    const hasMoreProposals = useMemo(() => {
        const full = (list) => (list?.length || 0) === PROPOSAL_PAGE_SIZE;
        const hybridMaybe = !moreDone.hybrid
            && (morePages.hybrid > 0 || full(data?.organization?.hybridVoting?.proposals));
        const ddMaybe = !moreDone.dd
            && (morePages.dd > 0 || full(data?.organization?.directDemocracyVoting?.ddvProposals));
        return hybridMaybe || ddMaybe;
    }, [data, moreDone, morePages]);

    const contextValue = useMemo(() => ({
        hybridVotingOngoing: state.hybridVotingOngoing,
        hybridVotingCompleted: state.hybridVotingCompleted,
        democracyVotingOngoing: state.democracyVotingOngoing,
        democracyVotingCompleted: state.democracyVotingCompleted,
        loading,
        error,
        refetch: refetchVoting,
        resolveMissingPoll,
        loadMoreProposals,
        loadingMoreProposals: loadingMore,
        hasMoreProposals,
        addOptimisticVote,
        removeOptimisticVote,
        ongoingPolls: state.ongoingPolls,
        votingType: state.votingType,
        votingClasses: state.votingClasses,
        hybridThresholdPct: state.hybridThresholdPct,
        hybridQuorum: state.hybridQuorum,
        ddThresholdPct: state.ddThresholdPct,
        ddQuorum: state.ddQuorum,
    }), [
        state, loading, error, refetchVoting, resolveMissingPoll,
        loadMoreProposals, loadingMore, hasMoreProposals,
        addOptimisticVote, removeOptimisticVote,
    ]);

    return (
        <VotingContext.Provider value={contextValue}>
            {children}
        </VotingContext.Provider>
    );
};
