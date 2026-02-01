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
  Collapse,
  Skeleton,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import AccountSettingsModal from '@/components/userPage/AccountSettingsModal';
import { useVotingContext } from '@/context/VotingContext';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import Link2 from 'next/link';
import OngoingPolls from '@/components/userPage/OngoingPolls';
import UserProposals from '@/components/userPage/UserProposals';
import { useRouter } from 'next/router';
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import ExecutiveMenuModal from '@/components/profileHub/ExecutiveMenuModal';
import { useOrgStructure } from '@/hooks';
import { useVouches } from '@/hooks/useVouches';
import WelcomeClaimPage from '@/components/profileHub/WelcomeClaimPage';
import { PendingRequestsPanel } from '@/components/tokenRequest';
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
                bg="whiteAlpha.50"
                p={3}
                borderRadius="lg"
                _hover={{ bg: 'whiteAlpha.100' }}
                transition="background 0.2s"
                cursor="pointer"
              >
                <Text fontSize="sm" fontWeight="medium" color="white" noOfLines={1}>
                  {task.isIndexing ? 'Indexing...' : task.title}
                </Text>
                <HStack justify="space-between" mt={1}>
                  <Badge colorScheme="purple" fontSize="xs">{task.status}</Badge>
                  <Text fontSize="xs" color="gray.400">Payout {task.payout}</Text>
                </HStack>
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
  const [showPendingRequests, setShowPendingRequests] = useState(false);

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
                   'tasksProposals'
                   'pendingRequests'`,
            md: `'header header'
                 'tokensActivity roles'
                 'tokensActivity progressionOrTasks'
                 'tokenRequests tasksProposals'
                 'pendingRequests pendingRequests'`
          }}
          templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}
          templateRows={{ base: 'auto', md: 'auto auto auto auto auto' }}
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
              <Box p={4} pt={2}>
                {claimedTasks?.length > 0 ? (
                  <VStack spacing={2} align="stretch">
                    {claimedTasks.slice(0, 3).map((task) => (
                      <Link2
                        key={task.id}
                        href={`/tasks/?task=${task.id}&projectId=${encodeURIComponent(decodeURIComponent(task.projectId))}&userDAO=${userDAO}`}
                      >
                        <Box
                          bg="whiteAlpha.50"
                          p={3}
                          borderRadius="lg"
                          _hover={{ bg: 'whiteAlpha.100' }}
                          transition="background 0.2s"
                          cursor="pointer"
                        >
                          <Text fontSize="sm" fontWeight="medium" color="white" noOfLines={1}>
                            {task.isIndexing ? 'Indexing...' : task.title}
                          </Text>
                          <HStack justify="space-between" mt={1}>
                            <Badge colorScheme="purple" fontSize="xs">{task.status}</Badge>
                            <Text fontSize="xs" color="gray.400">Payout {task.payout}</Text>
                          </HStack>
                        </Box>
                      </Link2>
                    ))}
                  </VStack>
                ) : userProposals?.length > 0 ? (
                  <UserProposals userProposals={userProposals} />
                ) : (
                  <OngoingPolls OngoingPolls={ongoingPolls} />
                )}
              </Box>
            </Box>
          </GridItem>

          {/* Pending Requests Panel for Approvers */}
          {hasApproverRole && (
            <GridItem area="pendingRequests">
              <Box
                w="100%"
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <HStack
                  p={4}
                  cursor="pointer"
                  onClick={() => setShowPendingRequests(!showPendingRequests)}
                  justify="space-between"
                >
                  <Text fontWeight="bold" fontSize={{ base: 'lg', md: 'xl' }}>
                    Pending Token Requests (Approver)
                  </Text>
                  {showPendingRequests ? <ChevronUpIcon boxSize={6} /> : <ChevronDownIcon boxSize={6} />}
                </HStack>
                <Collapse in={showPendingRequests}>
                  <Box p={4} pt={0}>
                    <PendingRequestsPanel />
                  </Box>
                </Collapse>
              </Box>
            </GridItem>
          )}
        </Grid>
      </Box>

      {/* Modals */}
      <AccountSettingsModal isOpen={isSettingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
      <ExecutiveMenuModal isOpen={isExecutiveMenuOpen} onClose={() => setExecutiveMenuOpen(false)} />
    </>
  );
};

export default UserprofileHub;
