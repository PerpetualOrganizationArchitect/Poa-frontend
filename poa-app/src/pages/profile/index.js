import React, { useState, useMemo } from 'react';
import SEOHead from "@/components/common/SEOHead";
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
import { FiClock, FiInbox, FiBarChart2 } from 'react-icons/fi';
import AccountSettingsModal from '@/components/userPage/AccountSettingsModal';
import { useVotingContext } from '@/context/VotingContext';
import { useUserContext } from '@/context/UserContext';
import { usePOContext } from '@/context/POContext';
import { useProjectContext } from '@/context/ProjectContext';
import Link2 from 'next/link';
import { useRouter } from 'next/router';
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import ExecutiveMenuModal from '@/components/profileHub/ExecutiveMenuModal';
import PulseLoader from "@/components/shared/PulseLoader";
import { useOrgStructure, useOrgTheme } from '@/hooks';
import { useOrgName } from '@/hooks/useOrgName';
import { useVouches } from '@/hooks/useVouches';
import WelcomeClaimPage from '@/components/profileHub/WelcomeClaimPage';
import { useAuth } from '@/context/AuthContext';

// Profile hub components
import ProfileHeader from '@/components/profileHub/ProfileHeader';
import EditProfileModal from '@/components/profile/EditProfileModal';
import { useGlobalAccount } from '@/hooks/useGlobalAccount';
import UserRolesCard from '@/components/profileHub/UserRolesCard';
import TokenActivityCard from '@/components/profileHub/TokenActivityCard';
import TokenRequestCard from '@/components/profileHub/TokenRequestCard';
import RoleProgressionCard, { hasRoleProgressionContent } from '@/components/profileHub/RoleProgressionCard';

import { useAllProjectsFlatTasks } from '@/components/TaskManager/views/useFlatTasks';
import { MY_WORK_ID } from '@/components/TaskManager/taskViewIds';
import {
  effectiveDeadlineSec,
  dueDateSec,
  formatRemaining,
  deadlineSeverity,
  SEVERITY_SCHEME,
} from '@/util/deadlineUtils';

// Shared utilities
import { glassLayerStyle } from '@/components/shared/glassStyles';
// TIER FEATURE - determineTier, calculateProgress commented out per redesign
// import { determineTier, calculateProgress, formatDateToAmerican, normalizeHatId } from '@/utils/profileUtils';
import { formatDateToAmerican, normalizeHatId } from '@/utils/profileUtils';

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
        minH="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        p={4}
      >
        <Box
          maxW="600px"
          w="100%"
          borderRadius="2xl"
          bg="rgba(0, 0, 0, 0.82)"
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
  const { tokenLabel = 'Shares' } = usePOContext() || {};
  const tokenLabelLower = tokenLabel.toLowerCase();

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
              href={`/tasks/?task=${task.id}&projectId=${encodeURIComponent(decodeURIComponent(task.projectId))}&org=${encodeURIComponent(userDAO)}`}
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
                transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                cursor="pointer"
              >
                <HStack justify="space-between">
                  <Text fontSize="sm" fontWeight="medium" color="white" noOfLines={1} flex={1}>
                    {task.isIndexing ? 'Saving...' : task.title}
                  </Text>
                  <Badge colorScheme="yellow" variant="subtle" fontSize="xs" ml={2}>
                    {task.payout} {tokenLabelLower}
                  </Badge>
                </HStack>
                <Badge colorScheme="green" fontSize="xs" mt={2}>{task.status}</Badge>
              </Box>
            </Link2>
          ))
        ) : (
          <Center py={8} flexDirection="column">
            <Icon as={FiInbox} boxSize={8} color="whiteAlpha.300" mb={3} />
            <Text fontSize="sm" color="whiteAlpha.500" fontWeight="medium">
              No recommended tasks yet
            </Text>
            <Text fontSize="xs" color="whiteAlpha.300" mt={1}>
              Tasks will appear here as they become available
            </Text>
          </Center>
        )}
      </VStack>
    </Box>
  );
}

const UserprofileHub = () => {
  const router = useRouter();
  const userDAO = useOrgName();
  const { accountAddress: userAddress } = useAuth();
  const { pageBackground, onBackground } = useOrgTheme();

  const { ongoingPolls } = useVotingContext();
  const { recommendedTasks } = useProjectContext();
  // Full cross-project task objects carry deadline fields (the user's
  // assignedTasks query does not), so look up each in-flight task by id to
  // surface a deadline chip. Purely client-side over already-fetched data.
  const flatTasks = useAllProjectsFlatTasks();
  const taskById = useMemo(() => {
    const m = new Map();
    for (const t of flatTasks) m.set(t.id, t);
    return m;
  }, [flatTasks]);
  const { claimedTasks, userProposals, graphUsername, userDataLoading, error, userData, hasExecRole, hasMemberRole, hasApproverRole } = useUserContext();
  const poContext = usePOContext();
  const avatarMap = poContext?.avatarMap || {};
  const tokenLabel = poContext?.tokenLabel || 'Shares';

  // Fetch org structure for roles and claim page
  const { roles, eligibilityModuleAddress, orgName, orgMetadata, permissionsMatrix, loading: orgLoading } = useOrgStructure();
  const claimableRoles = roles || [];

  // Vouching data
  const rolesWithVouching = roles?.filter(r => r.vouchingEnabled) || [];
  const { getVouchProgress, pendingVouchRequests } = useVouches(eligibilityModuleAddress, rolesWithVouching);

  // Modal states
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isExecutiveMenuOpen, setExecutiveMenuOpen] = useState(false);
  const [isEditProfileOpen, setEditProfileOpen] = useState(false);

  // Global profile metadata (cross-chain) — used for completeness nudge + avatar fallback
  const { profileMetadata } = useGlobalAccount();

  // Compute user info from userData
  const userInfo = useMemo(() => {
    if (!userData) return {};

    const ptBalance = Number(userData.participationTokenBalance) || 0;

    // TIER FEATURE - tier/progress computation commented out per redesign
    // const progressData = calculateProgress(ptBalance);

    return {
      username: graphUsername,
      ptBalance,
      memberStatus: userData.membershipStatus || 'Member',
      // user.id from the subgraph is the composite `${orgId}-${address}` —
      // user.address is the bare wallet/account address we actually want to display.
      accountAddress: userData.address || userAddress,
      tasksCompleted: userData.tasksCompleted || 0,
      totalVotes: userData.totalVotes || 0,
      dateJoined: userData.firstSeenAt ? formatDateToAmerican(userData.firstSeenAt) : 'Unknown',
      // TIER FEATURE - commented out per redesign
      // tier: determineTier(ptBalance),
      // progress: progressData.progress,
      // nextTier: progressData.nextTier,
      // nextTierThreshold: progressData.nextTierThreshold,
    };
  }, [userData, graphUsername, userAddress]);

  // Check if user has claimed any roles
  const userHatIds = userData?.hatIds || [];
  const hasClaimedRole = userHatIds.length > 0;

  // Get user's actual roles for header display
  const userRoles = useMemo(() => {
    if (!userHatIds.length || !roles?.length) return [];
    const normalizedUserHatIds = userHatIds.map((id) => normalizeHatId(id));
    return roles.filter((role) => {
      const normalizedRoleHatId = normalizeHatId(role.hatId);
      return normalizedUserHatIds.includes(normalizedRoleHatId);
    });
  }, [userHatIds, roles]);

  // Check if there's role progression content to show
  const showRoleProgression = useMemo(() => {
    return hasRoleProgressionContent(userAddress, userHatIds, roles, getVouchProgress);
  }, [userAddress, userHatIds, roles, getVouchProgress]);

  // Composite loading state
  const isFullyLoaded = !orgLoading && !userDataLoading && orgName;

  const seoHead = (
    <SEOHead
      title="Profile"
      description="Your community profile and activity."
      path="/profile"
      noIndex
    />
  );

  if (!isFullyLoaded) {
    return (
      <>
        {seoHead}
        <Navbar />
        <Center height="100vh" background={pageBackground()}>
          <PulseLoader size="xl" />
        </Center>
      </>
    );
  }

  // Show welcome/claim page if user hasn't claimed any role yet
  if (!hasClaimedRole && claimableRoles.length > 0) {
    return (
      <>
        {seoHead}
        <WelcomeClaimPage
          orgName={orgName}
          orgMetadata={orgMetadata}
          claimableRoles={claimableRoles}
          eligibilityModuleAddress={eligibilityModuleAddress}
        />
      </>
    );
  }

  // Handle error state
  if (error) {
    return (
      <>
        {seoHead}
        <Navbar />
        <Center height="100vh" background={pageBackground()}>
          <Text color={onBackground}>Error: {error.message}</Text>
        </Center>
      </>
    );
  }

  return (
    <>
      {seoHead}
      <Navbar />
      <Box p={4} minH="100vh" background={pageBackground()}>
        <Grid
          color="white"
          templateAreas={{
            base: `'header'
                   'tokensActivity'
                   'roles'
                   'progressionOrTasks'
                   'tasksProposals'
                   'tokenRequests'`,
            md: `'header header'
                 'tokensActivity progressionOrTasks'
                 'roles tasksProposals'
                 'tokenRequests .'`
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
              avatarUrl={
                avatarMap[userInfo.username] ||
                (profileMetadata?.avatar ? `https://ipfs.io/ipfs/${profileMetadata.avatar}` : undefined)
              }
              userRoles={userRoles}
              isExec={hasExecRole}
              profileMetadata={profileMetadata}
              canEdit={!!userAddress}
              onEditProfileClick={() => setEditProfileOpen(true)}
              onSettingsClick={() => setSettingsModalOpen(true)}
              onExecutiveMenuClick={() => setExecutiveMenuOpen(true)}
            />
          </GridItem>

          {/* Tokens & Activity (Left Top) */}
          <GridItem area="tokensActivity">
            <TokenActivityCard
              ptBalance={userInfo.ptBalance}
              tasksCompleted={userInfo.tasksCompleted}
              totalVotes={userInfo.totalVotes}
              dateJoined={userInfo.dateJoined}
            />
          </GridItem>

          {/* Recommended Tasks OR Role Progression (Right Top) */}
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

          {/* User Roles (Left Bottom) */}
          <GridItem area="roles">
            <UserRolesCard
              userHatIds={userHatIds}
              roles={roles}
              permissionsMatrix={permissionsMatrix}
              userDAO={userDAO}
            />
          </GridItem>

          {/* Tasks & Proposals (Right Bottom) */}
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
                  {claimedTasks?.length > 0 ? 'My Work' : (userProposals?.length > 0 ? 'My Proposals' : 'Ongoing Proposals')}
                </Text>
              </VStack>
              <VStack spacing={2} align="stretch" p={4} pt={2}>
                {claimedTasks?.length > 0 ? (
                  // In-flight tasks
                  <>
                    {claimedTasks.slice(0, 3).map((task) => {
                      const full = taskById.get(task.id);
                      const deadlineSec = full
                        ? (effectiveDeadlineSec(full) ?? dueDateSec(full))
                        : null;
                      const linkProjectId = full?.projectId || task.projectId;
                      return (
                        <Link2
                          key={task.id}
                          href={`/tasks/?task=${task.id}${linkProjectId ? `&projectId=${encodeURIComponent(decodeURIComponent(linkProjectId))}` : ''}&org=${encodeURIComponent(userDAO)}`}
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
                            transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                            cursor="pointer"
                          >
                            <HStack justify="space-between">
                              <Text fontSize="sm" fontWeight="medium" color="white" noOfLines={1} flex={1}>
                                {task.isIndexing ? 'Saving...' : task.title}
                              </Text>
                              <Badge colorScheme="yellow" variant="subtle" fontSize="xs" ml={2}>
                                {task.payout} {tokenLabel.toLowerCase()}
                              </Badge>
                            </HStack>
                            <HStack mt={2} spacing={2}>
                              <Badge colorScheme="purple" fontSize="xs">{task.status}</Badge>
                              {deadlineSec !== null && (
                                <Badge colorScheme={SEVERITY_SCHEME[deadlineSeverity(deadlineSec)] || 'gray'} fontSize="xs">
                                  {formatRemaining(deadlineSec)}
                                </Badge>
                              )}
                            </HStack>
                          </Box>
                        </Link2>
                      );
                    })}
                    <Link2 href={`/tasks?projectId=${MY_WORK_ID}&org=${encodeURIComponent(userDAO)}`}>
                      <Text
                        fontSize="sm"
                        color="purple.300"
                        fontWeight="600"
                        textAlign="right"
                        pt={1}
                        _hover={{ color: 'purple.200' }}
                      >
                        View all →
                      </Text>
                    </Link2>
                  </>
                ) : userProposals?.length > 0 ? (
                  // User Proposals - render inline for consistency
                  userProposals.slice(0, 3).map((proposal) => (
                    <Link2
                      key={proposal.id}
                      href={`/voting/?poll=${proposal.id}&org=${encodeURIComponent(userDAO)}`}
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
                        transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
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
                      href={`/voting/?poll=${poll.id}&org=${encodeURIComponent(userDAO)}`}
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
                        transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
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
                  <Center py={8} flexDirection="column">
                    <Icon as={FiBarChart2} boxSize={8} color="whiteAlpha.300" mb={3} />
                    <Text fontSize="sm" color="whiteAlpha.500" fontWeight="medium">
                      No active proposals
                    </Text>
                    <Text fontSize="xs" color="whiteAlpha.300" mt={1}>
                      Proposals will appear here when voting is open
                    </Text>
                  </Center>
                )}
              </VStack>
            </Box>
          </GridItem>

          {/* Token Requests (Bottom Left - Half Width) */}
          <GridItem area="tokenRequests">
            <TokenRequestCard hasMemberRole={hasMemberRole} />
          </GridItem>
        </Grid>
      </Box>

      {/* Modals */}
      <AccountSettingsModal isOpen={isSettingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
      <ExecutiveMenuModal isOpen={isExecutiveMenuOpen} onClose={() => setExecutiveMenuOpen(false)} hasApproverRole={hasApproverRole} />
      <EditProfileModal isOpen={isEditProfileOpen} onClose={() => setEditProfileOpen(false)} />
    </>
  );
};

export default UserprofileHub;
