import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_VOTING_DATA_NEW } from '../util/queries';
import { useRouter } from 'next/router';
import { useAccount } from 'wagmi';
import { usePOContext } from './POContext';

const VotingContext = createContext();

export const useVotingContext = () => useContext(VotingContext);

function transformProposal(proposal, votingTypeId, type) {
    const currentTime = Math.floor(Date.now() / 1000);
    const endTime = parseInt(proposal.endTimestamp) || 0;
    const isOngoing = proposal.status === 'Active' && endTime > currentTime;

    // Aggregate votes per option
    const optionVotes = {};
    (proposal.votes || []).forEach(vote => {
        (vote.optionIndexes || []).forEach((optionIndex, i) => {
            // Use ?? instead of || to preserve 0 weights (0 || 1 = 1, but 0 ?? 1 = 0)
            const weight = vote.optionWeights?.[i] ?? 1;
            optionVotes[optionIndex] = (optionVotes[optionIndex] || 0) + weight;
        });
    });

    // Create options array
    const options = [];
    for (let i = 0; i < (proposal.numOptions || 2); i++) {
        options.push({
            id: `${proposal.id}-option-${i}`,
            name: `Option ${i + 1}`,
            votes: optionVotes[i] || 0,
        });
    }

    // Calculate percentages
    const totalVotes = Object.values(optionVotes).reduce((sum, v) => sum + v, 0);
    if (totalVotes > 0) {
        options.forEach((opt, i) => {
            opt.percentage = ((optionVotes[i] || 0) / totalVotes) * 100;
        });
    }

    // Parse winningOption as number (comes as BigInt string from subgraph)
    const winningOptionNum = proposal.winningOption !== null && proposal.winningOption !== undefined
        ? parseInt(proposal.winningOption, 10)
        : null;

    return {
        id: proposal.id,
        proposalId: proposal.proposalId,
        title: proposal.title || 'Indexing...',
        descriptionHash: proposal.descriptionHash,
        startTimestamp: proposal.startTimestamp,
        endTimestamp: proposal.endTimestamp,
        winningOption: winningOptionNum,
        isValid: proposal.isValid,
        wasExecuted: proposal.wasExecuted,
        status: proposal.status,
        isOngoing,
        options,
        totalVotes,
        votes: proposal.votes || [],
        votingTypeId,
        type,
        isHatRestricted: proposal.isHatRestricted,
        restrictedHatIds: proposal.restrictedHatIds || [],
    };
}

export const VotingProvider = ({ children }) => {
    const [hybridVotingOngoing, setHybridVotingOngoing] = useState([]);
    const [hybridVotingCompleted, setHybridVotingCompleted] = useState([]);
    const [democracyVotingOngoing, setDemocracyVotingOngoing] = useState([]);
    const [democracyVotingCompleted, setDemocracyVotingCompleted] = useState([]);
    const [ongoingPolls, setOngoingPolls] = useState([]);
    const [votingType, setVotingType] = useState('Hybrid');

    const { address } = useAccount();
    const router = useRouter();
    const { orgId } = usePOContext();

    const { data, loading, error, refetch } = useQuery(FETCH_VOTING_DATA_NEW, {
        variables: { orgId: orgId },
        skip: !orgId,
        fetchPolicy: 'cache-first',
        notifyOnNetworkStatusChange: true,
    });

    useEffect(() => {
        if (data?.organization) {
            const org = data.organization;

            if (org.hybridVoting) {
                setVotingType('Hybrid');
            } else if (org.directDemocracyVoting) {
                setVotingType('Direct Democracy');
            }

            // Process Hybrid Voting proposals
            if (org.hybridVoting) {
                const hybridProposals = (org.hybridVoting.proposals || []).map(p =>
                    transformProposal(p, org.hybridVoting.id, 'Hybrid')
                );
                setHybridVotingOngoing(hybridProposals.filter(p => p.isOngoing));
                setHybridVotingCompleted(hybridProposals.filter(p => !p.isOngoing));
            } else {
                setHybridVotingOngoing([]);
                setHybridVotingCompleted([]);
            }

            // Process Direct Democracy Voting proposals
            if (org.directDemocracyVoting) {
                const ddProposals = (org.directDemocracyVoting.ddvProposals || []).map(p =>
                    transformProposal(p, org.directDemocracyVoting.id, 'Direct Democracy')
                );
                setDemocracyVotingOngoing(ddProposals.filter(p => p.isOngoing));
                setDemocracyVotingCompleted(ddProposals.filter(p => !p.isOngoing));
            } else {
                setDemocracyVotingOngoing([]);
                setDemocracyVotingCompleted([]);
            }

            // Combine all ongoing polls
            const allOngoing = [
                ...(org.hybridVoting?.proposals || []).map(p =>
                    transformProposal(p, org.hybridVoting?.id, 'Hybrid')
                ).filter(p => p.isOngoing),
                ...(org.directDemocracyVoting?.ddvProposals || []).map(p =>
                    transformProposal(p, org.directDemocracyVoting?.id, 'Direct Democracy')
                ).filter(p => p.isOngoing),
            ];
            setOngoingPolls(allOngoing);
        }
    }, [data]);

    const contextValue = useMemo(() => ({
        hybridVotingOngoing,
        hybridVotingCompleted,
        democracyVotingOngoing,
        democracyVotingCompleted,
        loading,
        error,
        ongoingPolls,
        votingType,
        refetch,
    }), [
        hybridVotingOngoing,
        hybridVotingCompleted,
        democracyVotingOngoing,
        democracyVotingCompleted,
        loading,
        error,
        ongoingPolls,
        votingType,
        refetch,
    ]);

    return (
        <VotingContext.Provider value={contextValue}>
            {children}
        </VotingContext.Provider>
    );
};
