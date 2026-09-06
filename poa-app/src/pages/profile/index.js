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
  Button,
} from '@chakra-ui/react';
import { FiClock, FiInbox, FiBarChart2, FiLock } from 'react-icons/fi';
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
import { useAuthoritySubjects, useMyMemberships } from '@/hooks/accessV2';
import { buildV2ProfileView } from '@/lib/accessV2/profileBridge';

// Profile hub components
import ProfileHeader from '@/components/profileHub/ProfileHeader';
import AccountControl from '@/components/common/AccountControl';
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
import { useOrgGate } from "@/components/shared/OrgDeadEnd";

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
  const orgGate = useOrgGate();
  const { accountAddress: userAddress, isAuthenticated, isAuthHydrated } = useAuth();
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
  const { claimedTasks, userProposals, graphUsername, userDataLoading, error, userData, hasMemberRole, hasApproverRole } = useUserContext();
  const poContext = usePOContext();
  const avatarCidMap = poContext?.avatarCidMap || {};
  const tokenLabel = poContext?.tokenLabel || 'Shares';

  // Fetch org structure for roles and claim page
  const {
    roles,
    eligibilityModuleAddress,
    orgName,
    orgMetadata,
    permissionsMatrix,
    loading: orgLoading,
    error: orgError,
  } = useOrgStructure();
  const legacyClaimableRoles = roles || [];

  // A router-bound Access v2 org no longer reads role truth from Hats. Join the live subject list
  // to this user's fold-mirror memberships so native roles, renamed roles, group-inherited
  // permissions, claimability, and top-hat filtering all agree with the Organization Structure
  // page. Both hooks are self-gating and put nothing on the wire for legacy orgs.
  const v2 = useAuthoritySubjects();
  const v2Memberships = useMyMemberships(userAddress);
  const v2Live = v2.enabled;
  const v2Profile = useMemo(() => buildV2ProfileView({
    roles: v2.roles,
    memberships: v2Memberships.rows,
    claimableMemberships: v2Memberships.claimable,
  }), [v2.roles, v2Memberships.rows, v2Memberships.claimable]);

  // Vouching data
  const rolesWithVouching = v2Live ? [] : (roles?.filter(r => r.vouchingEnabled) || []);
  const legacyVouchAddress = v2Live || v2.authority.loading || v2.authority.error
    ? null
    : eligibilityModuleAddress;
  const {
    getVouchProgress,
    pendingVouchRequests,
    loading: legacyVouchesLoading,
  } = useVouches(legacyVouchAddress, rolesWithVouching);

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
  const userHatIds = useMemo(() => userData?.hatIds || [], [userData?.hatIds]);
  const hasClaimedRole = v2Live ? v2Profile.hasClaimedRole : userHatIds.length > 0;

  // Get user's actual roles for header display
  const legacyUserRoles = useMemo(() => {
    if (!userHatIds.length || !roles?.length) return [];
    const normalizedUserHatIds = userHatIds.map((id) => normalizeHatId(id));
    return roles.filter((role) => {
      const normalizedRoleHatId = normalizeHatId(role.hatId);
      return normalizedUserHatIds.includes(normalizedRoleHatId);
    });
  }, [userHatIds, roles]);

  const profileRoles = v2Live ? v2Profile.roles : roles;
  const profileUserHatIds = v2Live ? v2Profile.userRoleIds : userHatIds;
  const userRoles = v2Live ? v2Profile.userRoles : legacyUserRoles;
  const canApproveRequests = v2Live ? v2Profile.canApproveRequests : hasApproverRole;
  const canRequestTokens = v2Live ? v2Profile.canRequestTokens : hasMemberRole;
  const v2Error = v2.authority.error || (v2Live ? (v2.error || v2Memberships.error) : null);

  // Check if there's role progression content to show
  const showRoleProgression = useMemo(() => {
    if (v2Live) {
      return v2Profile.progressionItems.length > 0 || v2Profile.claimableRoles.length > 0;
    }
    return hasRoleProgressionContent(userAddress, userHatIds, roles, getVouchProgress);
  }, [v2Live, v2Profile.progressionItems, v2Profile.claimableRoles, userAddress, userHatIds, roles, getVouchProgress]);

  // Composite loading state
  const isFullyLoaded = !orgLoading && !userDataLoading && !v2.authority.loading && orgName &&
    (!v2Live || (!v2.loading && !v2Memberships.loading)) &&
    (!legacyVouchAddress || !legacyVouchesLoading);

  const seoHead = (
    <SEOHead
      title="Profile"
      description="Your community profile and activity."
      path="/profile"
      noIndex
    />
  );

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;
  // Only trust `!isAuthenticated` once both auth backends have finished
  // restoring a prior session; before that every reload would flash this
  // screen at a user who is in fact signed in.
  if (isAuthHydrated && !isAuthenticated) {
    return (
      <>
        {seoHead}
        <Navbar />
        <Center height="100vh" background={pageBackground()} px={4}>
          <Box
            position="relative"
            zIndex={1}
            overflow="hidden"
            w="full"
            maxW="md"
            borderRadius="2xl"
            boxShadow="xl"
            px={{ base: 6, md: 10 }}
            py={{ base: 8, md: 10 }}
          >
            <div style={glassLayerStyle} />
            <VStack spacing={4} textAlign="center" position="relative">
              <Center
                w={12}
                h={12}
                borderRadius="full"
                bg="whiteAlpha.200"
                color="amethyst.200"
              >
                <Icon as={FiLock} boxSize={5} aria-hidden />
              </Center>
              <Text color="white" fontSize="xl" fontWeight="bold">
                You’re disconnected
              </Text>
              <Text color="gray.300">
                Sign in again to view your Profile Hub.
              </Text>
              <HStack spacing={3} justify="center" flexWrap="wrap">
                <Button colorScheme="purple" onClick={() => router.push('/')}>
                  Sign in options
                </Button>
                <AccountControl />
              </HStack>
            </VStack>
          </Box>
        </Center>
      </>
    );
  }
  if (v2Error || orgError) {
    return (
      <>
        {seoHead}
        <Navbar />
        <Center height="100vh" background={pageBackground()}>
          <Text color={onBackground}>Error loading roles: {(v2Error || orgError).message}</Text>
        </Center>
      </>
    );
  }
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
  if (!v2Live && !hasClaimedRole && legacyClaimableRoles.length > 0) {
    return (
      <>
        {seoHead}
        <WelcomeClaimPage
          orgName={orgName}
          orgMetadata={orgMetadata}
          claimableRoles={legacyClaimableRoles}
          eligibilityModuleAddress={eligibilityModuleAddress}
        />
      </>
    );
  }

  // Preserve the legacy onboarding path above: it historically remains usable when the broader
  // user-data query is degraded, because role claiming has its own data source.
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
              avatarCid={avatarCidMap[userInfo.username] || profileMetadata?.avatar}
              userRoles={userRoles}
              canApproveRequests={canApproveRequests}
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
                userHatIds={profileUserHatIds}
                roles={profileRoles}
                getVouchProgress={getVouchProgress}
                progressionItems={v2Live ? v2Profile.progressionItems : undefined}
                claimableRoleItems={v2Live ? v2Profile.claimableRoles : undefined}
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
              userHatIds={profileUserHatIds}
              roles={profileRoles}
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
            <TokenRequestCard hasMemberRole={canRequestTokens} />
          </GridItem>
        </Grid>
      </Box>

      {/* Modals */}
      <AccountSettingsModal isOpen={isSettingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
      <ExecutiveMenuModal isOpen={isExecutiveMenuOpen} onClose={() => setExecutiveMenuOpen(false)} hasApproverRole={canApproveRequests} />
      <EditProfileModal isOpen={isEditProfileOpen} onClose={() => setEditProfileOpen(false)} />
    </>
  );
};

export default UserprofileHub;
