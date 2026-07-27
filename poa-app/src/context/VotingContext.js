import React, { createContext, useContext, useEffect, useMemo, useCallback, useReducer, useRef, useState } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_VOTING_DATA_NEW, FETCH_VOTING_DATA_WITH_PROPOSER } from '../util/queries';
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
    const { data, loading, error, refetch } = useQuery(
        proposerSupported ? FETCH_VOTING_DATA_WITH_PROPOSER : FETCH_VOTING_DATA_NEW,
        {
        variables: { orgId: orgId },
        skip: !orgId,
        fetchPolicy: 'cache-first',
        pollInterval: isActive ? 30000 : 0,
        client,
        }
    );

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

                hybridProposals = (org.hybridVoting.proposals || []).map(p =>
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
                ddProposals = (org.directDemocracyVoting.ddvProposals || []).map(p =>
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
    }, [data, optimisticVotes, accountAddress]);

    // Stable refetch passthrough so a retry banner can re-run the query.
    const refetchVoting = useCallback(() => refetchRef.current?.(), []);

    const contextValue = useMemo(() => ({
        hybridVotingOngoing: state.hybridVotingOngoing,
        hybridVotingCompleted: state.hybridVotingCompleted,
        democracyVotingOngoing: state.democracyVotingOngoing,
        democracyVotingCompleted: state.democracyVotingCompleted,
        loading,
        error,
        refetch: refetchVoting,
        addOptimisticVote,
        removeOptimisticVote,
        ongoingPolls: state.ongoingPolls,
        votingType: state.votingType,
        votingClasses: state.votingClasses,
        hybridThresholdPct: state.hybridThresholdPct,
        hybridQuorum: state.hybridQuorum,
        ddThresholdPct: state.ddThresholdPct,
        ddQuorum: state.ddQuorum,
    }), [state, loading, error, refetchVoting, addOptimisticVote, removeOptimisticVote]);

    return (
        <VotingContext.Provider value={contextValue}>
            {children}
        </VotingContext.Provider>
    );
};
