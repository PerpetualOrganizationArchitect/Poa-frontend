import React, { useState, useMemo } from 'react';
import {
  Box,
  VStack,
  Grid,
  GridItem,
  Text,
  HStack,
  Badge,
  Center,
  Skeleton,
  Icon,
} from '@chakra-ui/react';
import { FiClock } from 'react-icons/fi';
import AccountSettingsModal from '@/components/userPage/AccountSettingsModal';
import { useVotingContext } from '@/context/VotingContext';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import Link2 from 'next/link';
import { useRouter } from 'next/router';
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import ExecutiveMenuModal from '@/components/profileHub/ExecutiveMenuModal';
import { useOrgStructure } from '@/hooks';
import { useVouches } from '@/hooks/useVouches';
import WelcomeClaimPage from '@/components/profileHub/WelcomeClaimPage';
import { useAccount } from 'wagmi';

// Profile hub components
import ProfileHeader from '@/components/profileHub/ProfileHeader';
import UserRolesCard from '@/components/profileHub/UserRolesCard';
import TokenActivityCard from '@/components/profileHub/TokenActivityCard';
import TokenRequestCard from '@/components/profileHub/TokenRequestCard';
import RoleProgressionCard, { hasRoleProgressionContent } from '@/components/profileHub/RoleProgressionCard';

// Shared utilities
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { determineTier, calculateProgress, formatDateToAmerican, normalizeHatId } from '@/utils/profileUtils';

/**
 * Format remaining time from timestamp
 * @param {number} endTimestamp - Unix timestamp in seconds
 * @returns {string} - Formatted time string (e.g., "2d 5h", "45m", "Ended")
 */
function formatTimeRemaining(endTimestamp) {
  if (!endTimestamp) return 'Active';

  const now = Math.floor(Date.now() / 1000);
  const remaining = endTimestamp - now;

  if (remaining <= 0) return 'Ended';

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Skeleton loader for WelcomeClaimPage
 */
function WelcomePageSkeleton() {
  return (
    <>
      <Navbar />
      <Box
        minH="calc(100vh - 80px)"
        display="flex"
        alignItems="center"
        justifyContent="center"
        p={4}
      >
        <Box
          maxW="600px"
          w="100%"
          borderRadius="2xl"
          bg="rgba(0, 0, 0, 0.73)"
          backdropFilter="blur(20px)"
          overflow="hidden"
          boxShadow="2xl"
        >
          <HStack px={6} py={3} borderBottom="1px solid" borderColor="whiteAlpha.100">
            <Skeleton height="24px" width="24px" borderRadius="full" startColor="whiteAlpha.100" endColor="whiteAlpha.300" />
            <Skeleton height="16px" width="120px" startColor="whiteAlpha.100" endColor="whiteAlpha.300" />
          </HStack>
          <VStack spacing={6} p={8} align="center">
            <Skeleton height="100px" width="100px" borderRadius="2xl" startColor="whiteAlpha.100" endColor="whiteAlpha.300" />
            <Skeleton height="36px" width="280px" startColor="whiteAlpha.100" endColor="whiteAlpha.300" />
            <Skeleton height="20px" width="320px" startColor="whiteAlpha.100" endColor="whiteAlpha.300" />
            <Skeleton height="2px" width="60px" startColor="purple.400" endColor="purple.600" />
            <Skeleton height="24px" width="220px" startColor="whiteAlpha.100" endColor="whiteAlpha.300" />
            <VStack w="100%" spacing={3}>
              <Skeleton height="80px" width="100%" borderRadius="xl" startColor="whiteAlpha.50" endColor="whiteAlpha.200" />
              <Skeleton height="80px" width="100%" borderRadius="xl" startColor="whiteAlpha.50" endColor="whiteAlpha.200" />
            </VStack>
            <Skeleton height="16px" width="260px" startColor="whiteAlpha.100" endColor="whiteAlpha.200" />
          </VStack>
        </Box>
      </Box>
    </>
  );
}

/**
 * Compact recommended tasks card for the right column
 */
function RecommendedTasksCompact({ tasks, userDAO }) {
  const displayTasks = tasks?.slice(0, 3) || [];

  return (
    <Box
      w="100%"
      h="100%"
      borderRadius="2xl"
      bg="transparent"
      boxShadow="lg"
      position="relative"
      zIndex={2}
    >
      <div style={glassLayerStyle} />

      {/* Darker header section */}
      <VStack pb={2} align="flex-start" position="relative" borderTopRadius="2xl">
        <div style={glassLayerStyle} />
        <Text pl={6} pt={2} fontWeight="bold" fontSize={{ base: 'xl', md: '2xl' }} color="white">
          Recommended Tasks
        </Text>
      </VStack>

      {/* Content */}
      <VStack spacing={2} align="stretch" p={4} pt={2}>
        {displayTasks.length > 0 ? (
          displayTasks.map((task) => (
            <Link2
              key={task.id}
              href={`/tasks/?task=${task.id}&projectId=${encodeURIComponent(decodeURIComponent(task.projectId))}&userDAO=${userDAO}`}
            >
              <Box
                bg="black"
                p={3}
                borderRadius="lg"
                _hover={{
                  bg: 'gray.800',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                }}
                transition="all 0.2s"
                cursor="pointer"
              >
                <HStack justify="space-between">
                  <Text fontSize="sm" fontWeight="medium" color="white" noOfLines={1} flex={1}>
                    {task.isIndexing ? 'Indexing...' : task.title}
                  </Text>
                  <Badge colorScheme="yellow" variant="subtle" fontSize="xs" ml={2}>
                    {task.payout} PT
                  </Badge>
                </HStack>
                <Badge colorScheme="green" fontSize="xs" mt={2}>{task.status}</Badge>
              </Box>
            </Link2>
          ))
        ) : (
          <Text color="gray.400" fontSize="sm" textAlign="center" py={4}>
            No tasks available
          </Text>
        )}
      </VStack>
    </Box>
  );
}

const UserprofileHub = () => {
  const router = useRouter();
  const { userDAO } = router.query;
  const { address: userAddress } = useAccount();

  const { ongoingPolls } = useVotingContext();
  const { recommendedTasks } = useProjectContext();
  const { claimedTasks, userProposals, graphUsername, userDataLoading, error, userData, hasExecRole, hasMemberRole, hasApproverRole } = useUserContext();

  // Fetch org structure for roles and claim page
  const { roles, eligibilityModuleAddress, orgName, orgMetadata, permissionsMatrix, loading: orgLoading } = useOrgStructure();
  const claimableRoles = roles || [];

  // Vouching data
  const rolesWithVouching = roles?.filter(r => r.vouchingEnabled) || [];
  const { getVouchProgress, pendingVouchRequests } = useVouches(eligibilityModuleAddress, rolesWithVouching);

  // Modal states
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isExecutiveMenuOpen, setExecutiveMenuOpen] = useState(false);

  // Compute user info from userData
  const userInfo = useMemo(() => {
    if (!userData) return {};

    const ptBalance = Number(userData.participationTokenBalance) || 0;
    const progressData = calculateProgress(ptBalance);

    return {
      username: graphUsername,
      ptBalance,
      memberStatus: userData.membershipStatus || 'Member',
      accountAddress: userData.id,
      tasksCompleted: userData.tasksCompleted || 0,
      totalVotes: userData.totalVotes || 0,
      dateJoined: userData.firstSeenAt ? formatDateToAmerican(userData.firstSeenAt) : 'Unknown',
      tier: determineTier(ptBalance),
      progress: progressData.progress,
      nextTier: progressData.nextTier,
      nextTierThreshold: progressData.nextTierThreshold,
    };
  }, [userData, graphUsername]);

  // Check if user has claimed any roles
  const userHatIds = userData?.hatIds || [];
  const hasClaimedRole = userHatIds.length > 0;

  // Check if there's role progression content to show
  const showRoleProgression = useMemo(() => {
    return hasRoleProgressionContent(userAddress, userHatIds, roles, getVouchProgress);
  }, [userAddress, userHatIds, roles, getVouchProgress]);

  // Composite loading state
  const isFullyLoaded = !orgLoading && !userDataLoading && orgName;

  if (!isFullyLoaded) {
    return <WelcomePageSkeleton />;
  }

  // Show welcome/claim page if user hasn't claimed any role yet
  if (!hasClaimedRole && claimableRoles.length > 0) {
    return (
      <WelcomeClaimPage
        orgName={orgName}
        orgMetadata={orgMetadata}
        claimableRoles={claimableRoles}
        eligibilityModuleAddress={eligibilityModuleAddress}
      />
    );
  }

  // Handle error state
  if (error) {
    return (
      <>
        <Navbar />
        <Center height="100vh">
          <Text color="white">Error: {error.message}</Text>
        </Center>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <Box mt={-2} p={4}>
        <Grid
          color="white"
          templateAreas={{
            base: `'header'
                   'tokensActivity'
                   'roles'
                   'progressionOrTasks'
                   'tokenRequests'
                   'tasksProposals'`,
            md: `'header header'
                 'tokensActivity roles'
                 'tokensActivity progressionOrTasks'
                 'tokenRequests tasksProposals'`
          }}
          templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}
          templateRows={{ base: 'auto', md: 'auto auto auto auto' }}
          gap={4}
        >
          {/* Profile Header */}
          <GridItem area="header">
            <ProfileHeader
              username={userInfo.username}
              address={userInfo.accountAddress}
              memberStatus={userInfo.memberStatus}
              isExec={hasExecRole}
              onSettingsClick={() => setSettingsModalOpen(true)}
              onExecutiveMenuClick={() => setExecutiveMenuOpen(true)}
            />
          </GridItem>

          {/* Tokens & Activity (Left Column) */}
          <GridItem area="tokensActivity">
            <TokenActivityCard
              ptBalance={userInfo.ptBalance}
              tier={userInfo.tier}
              progress={userInfo.progress}
              nextTier={userInfo.nextTier}
              nextTierThreshold={userInfo.nextTierThreshold}
              tasksCompleted={userInfo.tasksCompleted}
              totalVotes={userInfo.totalVotes}
              dateJoined={userInfo.dateJoined}
            />
          </GridItem>

          {/* User Roles (Right Column - Top) */}
          <GridItem area="roles">
            <UserRolesCard
              userHatIds={userHatIds}
              roles={roles}
              permissionsMatrix={permissionsMatrix}
              userDAO={userDAO}
            />
          </GridItem>

          {/* Role Progression OR Recommended Tasks (Right Column - Bottom) */}
          <GridItem area="progressionOrTasks">
            {showRoleProgression ? (
              <RoleProgressionCard
                userAddress={userAddress}
                userHatIds={userHatIds}
                roles={roles}
                getVouchProgress={getVouchProgress}
                pendingVouchRequests={pendingVouchRequests}
                userDAO={userDAO}
              />
            ) : (
              <RecommendedTasksCompact
                tasks={recommendedTasks}
                userDAO={userDAO}
              />
            )}
          </GridItem>

          {/* Token Requests (Left Column - Bottom) */}
          <GridItem area="tokenRequests">
            <TokenRequestCard hasMemberRole={hasMemberRole} />
          </GridItem>

          {/* Tasks & Proposals Section (Right Column - Bottom) */}
          <GridItem area="tasksProposals">
            <Box
              w="100%"
              h="100%"
              borderRadius="2xl"
              bg="transparent"
              position="relative"
              zIndex={2}
            >
              <div style={glassLayerStyle} />
              <VStack pb={2} align="flex-start" position="relative" borderTopRadius="2xl">
                <div style={glassLayerStyle} />
                <Text pl={6} pt={2} fontWeight="bold" fontSize={{ base: 'xl', md: '2xl' }}>
                  {claimedTasks?.length > 0 ? 'Claimed Tasks' : (userProposals?.length > 0 ? 'My Proposals' : 'Ongoing Proposals')}
                </Text>
              </VStack>
              <VStack spacing={2} align="stretch" p={4} pt={2}>
                {claimedTasks?.length > 0 ? (
                  // Claimed Tasks
                  claimedTasks.slice(0, 3).map((task) => (
                    <Link2
                      key={task.id}
                      href={`/tasks/?task=${task.id}&projectId=${encodeURIComponent(decodeURIComponent(task.projectId))}&userDAO=${userDAO}`}
                    >
                      <Box
                        bg="black"
                        p={3}
                        borderRadius="lg"
                        _hover={{
                          bg: 'gray.800',
                          transform: 'translateY(-2px)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                        }}
                        transition="all 0.2s"
                        cursor="pointer"
                      >
                        <HStack justify="space-between">
                          <Text fontSize="sm" fontWeight="medium" color="white" noOfLines={1} flex={1}>
                            {task.isIndexing ? 'Indexing...' : task.title}
                          </Text>
                          <Badge colorScheme="yellow" variant="subtle" fontSize="xs" ml={2}>
                            {task.payout} PT
                          </Badge>
                        </HStack>
                        <Badge colorScheme="purple" fontSize="xs" mt={2}>{task.status}</Badge>
                      </Box>
                    </Link2>
                  ))
                ) : userProposals?.length > 0 ? (
                  // User Proposals - render inline for consistency
                  userProposals.slice(0, 3).map((proposal) => (
                    <Link2
                      key={proposal.id}
                      href={`/voting/?poll=${proposal.id}&userDAO=${userDAO}`}
                    >
                      <Box
                        bg="black"
                        p={3}
                        borderRadius="lg"
                        _hover={{
                          bg: 'gray.800',
                          transform: 'translateY(-2px)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                        }}
                        transition="all 0.2s"
                        cursor="pointer"
                      >
                        <Text fontSize="sm" fontWeight="bold" color="white" noOfLines={1}>
                          {proposal.title}
                        </Text>
                        <HStack justify="space-between" mt={2}>
                          <Badge colorScheme="blue" fontSize="xs">
                            {proposal.type?.split('_')[0] || proposal.type}
                          </Badge>
                          <HStack spacing={1}>
                            <Icon as={FiClock} color="orange.300" boxSize={3} />
                            <Text fontSize="xs" color="orange.300">{formatTimeRemaining(proposal.endTimestamp)}</Text>
                          </HStack>
                        </HStack>
                      </Box>
                    </Link2>
                  ))
                ) : ongoingPolls?.length > 0 ? (
                  // Ongoing Polls - render inline for consistency
                  ongoingPolls.slice(0, 3).map((poll) => (
                    <Link2
                      key={poll.id}
                      href={`/voting/?poll=${poll.id}&userDAO=${userDAO}`}
                    >
                      <Box
                        bg="black"
                        p={3}
                        borderRadius="lg"
                        _hover={{
                          bg: 'gray.800',
                          transform: 'translateY(-2px)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                        }}
                        transition="all 0.2s"
                        cursor="pointer"
                      >
                        <Text fontSize="sm" fontWeight="bold" color="white" noOfLines={1}>
                          {poll.title}
                        </Text>
                        <HStack justify="space-between" mt={2}>
                          <Badge colorScheme="blue" fontSize="xs">
                            {poll.type?.split('_')[0] || poll.type}
                          </Badge>
                          <HStack spacing={1}>
                            <Icon as={FiClock} color="orange.300" boxSize={3} />
                            <Text fontSize="xs" color="orange.300">{formatTimeRemaining(poll.endTimestamp)}</Text>
                          </HStack>
                        </HStack>
                      </Box>
                    </Link2>
                  ))
                ) : (
                  <Text color="gray.400" fontSize="sm" textAlign="center" py={4}>
                    No proposals available
                  </Text>
                )}
              </VStack>
            </Box>
          </GridItem>
        </Grid>
      </Box>

      {/* Modals */}
      <AccountSettingsModal isOpen={isSettingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
      <ExecutiveMenuModal isOpen={isExecutiveMenuOpen} onClose={() => setExecutiveMenuOpen(false)} hasApproverRole={hasApproverRole} />
    </>
  );
};

export default UserprofileHub;
