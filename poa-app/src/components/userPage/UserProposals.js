// Dashboard "My proposals" — renders the canonical ProposalCard (compact).
// Clicking deep-links to /voting?poll=<id>&userDAO=<org>, opened by the board's
// PollDetail. Data source (userProposals) and the userDAO deep link preserved.

import React, { useCallback } from 'react';
import { Text, SimpleGrid } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useOrgName } from '@/hooks/useOrgName';
import { usePOContext } from '@/context/POContext';
import { ProposalCard } from '@/components/voting/ProposalCard';
import { BINDING_BADGE, POLL_BADGE } from '@/config/votingVocabulary';

const UserProposals = ({ userProposals }) => {
    const router = useRouter();
    const userDAO = useOrgName();
    const { poMembers } = usePOContext();
    const userProposalsExist = userProposals && userProposals.length > 0;

    const openPoll = useCallback(
        (poll) => {
            router.push(`/voting?poll=${poll.id}&userDAO=${encodeURIComponent(userDAO)}`);
        },
        [router, userDAO]
    );

    if (!userProposalsExist) {
        return <Text mt="4" ml="7" color="gray.200">No proposals available</Text>;
    }

    const myProposals = userProposals.slice(0, 3);

    return (
        <SimpleGrid minChildWidth="240px" spacing={3} px={2}>
            {myProposals.map((proposal) => (
                <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    size="compact"
                    typeBadge={proposal.type === 'Direct Democracy' ? POLL_BADGE : BINDING_BADGE}
                    poMembers={poMembers}
                    onOpen={openPoll}
                />
            ))}
        </SimpleGrid>
    );
};

export default UserProposals;
