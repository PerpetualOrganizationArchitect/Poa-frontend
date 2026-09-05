// Dashboard "Ongoing Polls" — renders the canonical ProposalCard (compact).
// Clicking a card deep-links to /voting?poll=<id>&userDAO=<org>, where the
// board's PollDetail opens it. Data source (VotingContext ongoingPolls) and the
// deep link (with userDAO) are preserved from the prior implementation.

import React, { useMemo, useCallback } from 'react';
import { Button, Center, Icon, Text, SimpleGrid } from '@chakra-ui/react';
import { FiBarChart2, FiPlus } from 'react-icons/fi';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useOrgName } from '@/hooks/useOrgName';
import { usePOContext } from '@/context/POContext';
import { useVoteCreateGate } from '@/hooks/useVoteCreateGate';
import { ProposalCard } from '@/components/voting/ProposalCard';
import { BINDING_BADGE, POLL_BADGE } from '@/config/votingVocabulary';

const OngoingPolls = ({ OngoingPolls }) => {
    const router = useRouter();
    const userDAO = useOrgName();
    const { poMembers } = usePOContext();
    // Same on-chain creator-hat gate as the voting page's "Create vote"
    // button — membership alone is not enough, and signed-out viewers see
    // nothing. The empty state only prompts people who can actually act.
    const { canCreateAny, creatorGateSettled } = useVoteCreateGate();
    const ongoingPollsExist = OngoingPolls && OngoingPolls.length > 0;

    const polls = useMemo(
        () => (ongoingPollsExist ? [...OngoingPolls].slice(0, 3) : []),
        [OngoingPolls, ongoingPollsExist]
    );

    const openPoll = useCallback(
        (poll) => {
            router.push(`/voting?poll=${poll.id}&userDAO=${encodeURIComponent(userDAO)}`);
        },
        [router, userDAO]
    );

    if (!ongoingPollsExist) {
        return (
            <Center py={6} flexDirection="column">
                <Icon as={FiBarChart2} boxSize={7} color="whiteAlpha.300" mb={2.5} />
                <Text fontSize="sm" color="whiteAlpha.800" fontWeight="semibold">
                    No active polls
                </Text>
                <Text fontSize="xs" color="whiteAlpha.400" mt={1}>
                    Polls will appear here when voting is open
                </Text>
                {creatorGateSettled && canCreateAny && (
                    <Link href={`/voting?org=${encodeURIComponent(userDAO)}`}>
                        <Button
                            mt={4}
                            size="sm"
                            variant="outline"
                            leftIcon={<Icon as={FiPlus} />}
                            borderColor="purple.400"
                            color="purple.300"
                            _hover={{ bg: 'purple.900' }}
                            transition="all 0.2s"
                        >
                            Create vote
                        </Button>
                    </Link>
                )}
            </Center>
        );
    }

    return (
        <SimpleGrid minChildWidth="240px" spacing={3}>
            {polls.map((poll) => (
                <ProposalCard
                    key={poll.id}
                    proposal={poll}
                    size="compact"
                    typeBadge={poll.type === 'Direct Democracy' ? POLL_BADGE : BINDING_BADGE}
                    poMembers={poMembers}
                    onOpen={openPoll}
                />
            ))}
        </SimpleGrid>
    );
};

export default OngoingPolls;
