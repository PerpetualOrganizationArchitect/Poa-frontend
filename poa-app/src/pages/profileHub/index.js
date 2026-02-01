import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  VStack,
  Grid,
  GridItem,
  Text,
  HStack,
  Badge,
  Center,
  useDisclosure,
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
import { TokenRequestModal, PendingRequestsPanel, UserRequestHistory } from '@/components/tokenRequest';
import { useAccount } from 'wagmi';

// New profile hub components
import ProfileHeader from '@/components/profileHub/ProfileHeader';
import CompactTokenStatus from '@/components/profileHub/CompactTokenStatus';
import UserRolesCard from '@/components/profileHub/UserRolesCard';
import RoleProgressionCard from '@/components/profileHub/RoleProgressionCard';
import ActivitySummaryCard from '@/components/profileHub/ActivitySummaryCard';

// Shared utilities
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { determineTier, calculateProgress, formatDateToAmerican } from '@/utils/profileUtils';

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
  const { isOpen: isTokenRequestModalOpen, onOpen: openTokenRequestModal, onClose: closeTokenRequestModal } = useDisclosure();
  const [showPendingRequests, setShowPendingRequests] = useState(false);
  const [showRequestHistory, setShowRequestHistory] = useState(false);

  // Compute user info from userData - using useMemo instead of useEffect+useState
  // to avoid unnecessary re-renders and stale closure issues
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
                     'roles'
                     'tokens'
                     'progression'
                     'activity'
                     'tasks'
                     'proposals'
                     'tokenRequests'`,
              md: `'header header'
                   'roles tokens'
                   'progression activity'
                   'tasks tasks'
                   'proposals proposals'
                   'tokenRequests tokenRequests'`
            }}
            templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}
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

            {/* User Roles */}
            <GridItem area="roles">
              <UserRolesCard
                userHatIds={userHatIds}
                roles={roles}
                permissionsMatrix={permissionsMatrix}
                userDAO={userDAO}
              />
            </GridItem>

            {/* Compact Token Status */}
            <GridItem area="tokens">
              <CompactTokenStatus
                ptBalance={userInfo.ptBalance}
                tier={userInfo.tier}
                progress={userInfo.progress}
                nextTier={userInfo.nextTier}
                nextTierThreshold={userInfo.nextTierThreshold}
                hasMemberRole={hasMemberRole}
                onRequestTokens={openTokenRequestModal}
              />
            </GridItem>

            {/* Role Progression */}
            <GridItem area="progression">
              <RoleProgressionCard
                userAddress={userAddress}
                userHatIds={userHatIds}
                roles={roles}
                getVouchProgress={getVouchProgress}
                pendingVouchRequests={pendingVouchRequests}
                userDAO={userDAO}
              />
            </GridItem>

            {/* Activity Summary */}
            <GridItem area="activity">
              <ActivitySummaryCard
                tasksCompleted={userInfo.tasksCompleted}
                totalVotes={userInfo.totalVotes}
                dateJoined={userInfo.dateJoined}
              />
            </GridItem>

            {/* Tasks Section */}
            <GridItem area="tasks">
              <Box
                w="100%"
                borderRadius="2xl"
                bg="transparent"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={2} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={6} pt={2} fontWeight="bold" fontSize={{ base: 'xl', md: '2xl' }}>
                    {claimedTasks && claimedTasks.length > 0 ? 'Claimed Tasks' : 'Recommended Tasks'}
                  </Text>
                </VStack>
                <HStack
                  spacing="3.5%"
                  pb={4}
                  ml={4}
                  mr={4}
                  pt={4}
                  flexDir={{ base: 'column', md: 'row' }}
                  align={{ base: 'stretch', md: 'flex-start' }}
                >
                  {((claimedTasks && claimedTasks.length > 0) ? claimedTasks : recommendedTasks)?.slice(0, 3).map((task) => (
                    <Box
                      key={task.id}
                      w={{ base: '100%', md: '31%' }}
                      mb={{ base: 4, md: 0 }}
                      _hover={{ boxShadow: 'md', transform: 'scale(1.03)' }}
                      p={4}
                      borderRadius="2xl"
                      overflow="hidden"
                      bg="black"
                      transition="all 0.2s"
                    >
                      <Link2 href={`/tasks/?task=${task.id}&projectId=${encodeURIComponent(decodeURIComponent(task.projectId))}&userDAO=${userDAO}`}>
                        <VStack textColor="white" align="stretch" spacing={3}>
                          <Text fontSize="md" lineHeight="99%" fontWeight="extrabold">
                            {task.isIndexing ? 'Indexing...' : task.title}
                          </Text>
                          <HStack justify="space-between">
                            <Badge colorScheme="purple">{task.status}</Badge>
                            <Text fontWeight="bold">Payout {task.payout}</Text>
                          </HStack>
                        </VStack>
                      </Link2>
                    </Box>
                  ))}
                  {(!claimedTasks || claimedTasks.length === 0) && (!recommendedTasks || recommendedTasks.length === 0) && (
                    <Text pl={2} color="gray.400">No tasks available</Text>
                  )}
                </HStack>
              </Box>
            </GridItem>

            {/* Proposals Section */}
            <GridItem area="proposals">
              <Box
                w="100%"
                borderRadius="2xl"
                bg="transparent"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={2} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={6} pt={2} fontWeight="bold" fontSize={{ base: 'xl', md: '2xl' }}>
                    {userProposals && userProposals.length > 0 ? 'My Proposals' : 'Ongoing Proposals'}
                  </Text>
                </VStack>
                <Box mt="4" pb={4}>
                  {userProposals && userProposals.length > 0 ? (
                    <UserProposals userProposals={userProposals} />
                  ) : (
                    <OngoingPolls OngoingPolls={ongoingPolls} />
                  )}
                </Box>
              </Box>
            </GridItem>

            {/* Token Requests Section (Collapsible) */}
            <GridItem area="tokenRequests">
              <VStack spacing={4} align="stretch">
                {/* User's Token Request History */}
                {hasMemberRole && (
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
                      onClick={() => setShowRequestHistory(!showRequestHistory)}
                      justify="space-between"
                    >
                      <Text fontWeight="bold" fontSize={{ base: 'lg', md: 'xl' }}>
                        My Token Requests
                      </Text>
                      {showRequestHistory ? <ChevronUpIcon boxSize={6} /> : <ChevronDownIcon boxSize={6} />}
                    </HStack>
                    <Collapse in={showRequestHistory}>
                      <Box p={4} pt={0}>
                        <UserRequestHistory />
                      </Box>
                    </Collapse>
                  </Box>
                )}

                {/* Pending Requests Panel for Approvers */}
                {hasApproverRole && (
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
                )}
              </VStack>
            </GridItem>
          </Grid>
      </Box>

      {/* Modals */}
      <AccountSettingsModal isOpen={isSettingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
      <ExecutiveMenuModal isOpen={isExecutiveMenuOpen} onClose={() => setExecutiveMenuOpen(false)} />
      <TokenRequestModal isOpen={isTokenRequestModalOpen} onClose={closeTokenRequestModal} />
    </>
  );
};

export default UserprofileHub;
