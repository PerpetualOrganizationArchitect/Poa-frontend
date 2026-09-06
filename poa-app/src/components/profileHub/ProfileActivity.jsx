import React, { useMemo } from 'react';
import { Badge, Box, Button, Heading, HStack, Icon, Link, Skeleton, Text, VStack } from '@chakra-ui/react';
import NextLink from 'next/link';
import { FiArrowRight, FiCheck, FiCheckCircle, FiMessageCircle } from 'react-icons/fi';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { MY_WORK_ID } from '@/components/TaskManager/taskViewIds';
import { useNow } from '@/hooks/useNow';
import { useVoteLanes } from '@/hooks/useVoteLanes';
import { deadlineSeverity, formatRemaining, SEVERITY_SCHEME } from '@/util/deadlineUtils';
import { profileDecisions, profileTaskHref, profileWork } from '@/lib/profile/hub';

function Section({ title, description, href, linkLabel, children }) {
  return (
    <Box as="section" position="relative" zIndex={2} borderRadius="2xl" border="1px solid" borderColor="whiteAlpha.100" boxShadow="lg" p={{ base: 5, md: 6 }}>
      <div style={{ ...glassLayerStyle, inset: 0 }} />
      <Box mb={4}>
        <HStack justify="space-between" align="center" spacing={3}>
          <Heading as="h2" color="white" fontSize="lg" fontWeight="600" letterSpacing="-0.02em">{title}</Heading>
          <Link as={NextLink} href={href} color="purple.200" fontSize="sm" flexShrink={0} py={1} aria-label={linkLabel} _hover={{ color: 'white' }}>
            View all <Icon as={FiArrowRight} ml={1} verticalAlign="middle" aria-hidden />
          </Link>
        </HStack>
        {description && <Text mt={1} color="gray.400" fontSize="sm" lineHeight="1.6">{description}</Text>}
      </Box>
      {children}
    </Box>
  );
}

function ActivityLink({ href, title, children, trailing }) {
  return (
    <Link as={NextLink} href={href} display="block" px={3} py={2.5} mx={-3} borderRadius="xl" _hover={{ bg: 'whiteAlpha.100', textDecoration: 'none' }} _focusVisible={{ outline: '2px solid', outlineColor: 'purple.300', outlineOffset: '2px' }} transition="background 0.15s">
      <HStack justify="space-between" align="center" spacing={3}>
        <Box minW={0} flex={1}>
          <Text fontWeight="500" color="white" fontSize="sm" noOfLines={2}>{title}</Text>
          <HStack mt={2} spacing={2} flexWrap="wrap" rowGap={1}>{children}</HStack>
        </Box>
        {trailing}
        <Icon as={FiArrowRight} color="gray.500" boxSize={4} flexShrink={0} aria-hidden />
      </HStack>
    </Link>
  );
}

function LoadingRows() {
  return <VStack spacing={4} py={2} align="stretch" aria-label="Loading activity"><Skeleton height="40px" startColor="whiteAlpha.100" endColor="whiteAlpha.200" borderRadius="lg" /><Skeleton height="40px" startColor="whiteAlpha.100" endColor="whiteAlpha.200" borderRadius="lg" /></VStack>;
}

export default function ProfileActivity({ claimedTasks, flatTasks, recommendedTasks = [], projectsLoading, userDAO, tokenLabel, userAddress }) {
  const now = useNow(30000);
  const { all: proposals, loading: decisionsLoading, error: decisionsError } = useVoteLanes();
  const work = useMemo(() => profileWork(claimedTasks, flatTasks, userAddress), [claimedTasks, flatTasks, userAddress]);
  const decisions = useMemo(() => profileDecisions(proposals, now), [proposals, now]);
  const tasksHref = `/tasks/?org=${encodeURIComponent(userDAO)}`;
  const votingHref = `/voting/?org=${encodeURIComponent(userDAO)}`;
  const suggestions = recommendedTasks.filter(task => task.status === 'Open' && !task.isIndexing).slice(0, 2);

  return (
    <>
      <Section title="Your work" description={work.length > 0 && work.every(task => task.status === 'Submitted') ? 'Your submitted work is awaiting review.' : 'Pick up where you left off.'} href={`${tasksHref}&projectId=${MY_WORK_ID}`} linkLabel="View all your work">
        {projectsLoading && work.length === 0 ? <LoadingRows /> : work.length > 0 ? (
          <VStack align="stretch" spacing={1}>
            {work.slice(0, 3).map(task => (
              <ActivityLink key={task.id} href={profileTaskHref(task, userDAO)} title={task.isIndexing ? 'Saving your task…' : task.title || 'Untitled task'}>
                <Text color="gray.400" fontSize="xs">{task.status === 'Submitted' ? 'In review' : 'In progress'}</Text>
                {task.deadline !== null && <Badge fontSize="xs" fontWeight="500" borderRadius="md" colorScheme={SEVERITY_SCHEME[deadlineSeverity(task.deadline, now)] || 'gray'}>{formatRemaining(task.deadline, now)}</Badge>}
                {task.projectName && <><Text as="span" color="gray.400" fontSize="xs" aria-hidden>·</Text><Text color="gray.400" fontSize="xs" noOfLines={1}>{task.projectName}</Text></>}
              </ActivityLink>
            ))}
            {work.length > 3 && <Text color="gray.400" fontSize="xs" pt={2}>{work.length - 3} more in your work</Text>}
          </VStack>
        ) : (
          <HStack align="start" spacing={3} py={3}>
            <Icon as={FiCheckCircle} color="purple.200" boxSize={5} mt={0.5} aria-hidden />
            <Box><Text color="white" fontSize="sm" fontWeight="500">Room for something new.</Text><Text color="gray.400" fontSize="sm" mt={1}>You have no work in progress. Find a task you’d like to take on.</Text></Box>
          </HStack>
        )}
        {!projectsLoading && work.length === 0 && suggestions.length > 0 && (
          <Box mt={4} pt={5} borderTop="1px solid" borderColor="whiteAlpha.100">
            <Text color="gray.400" fontSize="xs" fontWeight="500" mb={2}>Explore available work</Text>
            {suggestions.map(task => (
              <ActivityLink key={task.id} href={profileTaskHref(task, userDAO)} title={task.title || 'Untitled task'}>
                {task.projectTitle && <Text color="gray.400" fontSize="xs" noOfLines={1}>{task.projectTitle}</Text>}
                {Number(task.payout) > 0 && <Text color="purple.200" fontSize="xs">{Number(task.payout).toLocaleString('en-US')} {tokenLabel}</Text>}
              </ActivityLink>
            ))}
          </Box>
        )}
        {!projectsLoading && work.length === 0 && suggestions.length === 0 && <Button as={NextLink} href={tasksHref} mt={3} size="sm" variant="outline" color="purple.200" borderColor="whiteAlpha.300" _hover={{ bg: 'whiteAlpha.100' }} rightIcon={<FiArrowRight />}>Explore tasks</Button>}
      </Section>
      <Section title="Open decisions" description={decisions.length > 0 ? 'See what your organization is deciding.' : undefined} href={votingHref} linkLabel="View all decisions">
        {decisionsError ? <Text role="status" color="gray.300" fontSize="sm">Decisions couldn’t load. Open all decisions to try again.</Text> : decisionsLoading && decisions.length === 0 ? <LoadingRows /> : decisions.length > 0 ? (
          <VStack align="stretch" spacing={1}>
            {decisions.slice(0, 3).map(proposal => (
              <ActivityLink key={proposal.id} href={`${votingHref}&poll=${encodeURIComponent(proposal.id)}`} title={proposal.title === 'Indexing...' ? 'Saving decision…' : proposal.title || 'Untitled decision'}>
                {proposal.userHasVoted ? <HStack spacing={1} color="green.200"><Icon as={FiCheck} boxSize={3} aria-hidden /><Text fontSize="xs">Voted</Text></HStack> : <Text color="purple.200" fontSize="xs">Voting open</Text>}
                <Text color="gray.400" fontSize="xs">{formatRemaining(Number(proposal.endTimestamp), now)}</Text>
              </ActivityLink>
            ))}
          </VStack>
        ) : (
          <HStack align="start" spacing={3} py={1}>
            <Icon as={FiMessageCircle} color="gray.400" boxSize={4} mt={0.5} flexShrink={0} aria-hidden />
            <Text color="gray.400" fontSize="sm">No decisions open for voting.</Text>
          </HStack>
        )}
      </Section>
    </>
  );
}
