import React, { useState, useMemo } from 'react';
import { Box, VStack, Grid, Text, HStack, Center, Icon, Button } from '@chakra-ui/react';
import { FiLock } from 'react-icons/fi';
import { useRouter } from 'next/router';
import SEOHead from '@/components/common/SEOHead';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import AccountSettingsModal from '@/components/userPage/AccountSettingsModal';
import ExecutiveMenuModal from '@/components/profileHub/ExecutiveMenuModal';
import PulseLoader from '@/components/shared/PulseLoader';
import { useUserContext } from '@/context/UserContext';
import { usePOContext } from '@/context/POContext';
import { useProjectContext } from '@/context/ProjectContext';
import { useOrgStructure, useOrgTheme } from '@/hooks';
import { useOrgName } from '@/hooks/useOrgName';
import { useVouches } from '@/hooks/useVouches';
import { useAuth } from '@/context/AuthContext';
import { useAuthoritySubjects, useMyMemberships } from '@/hooks/accessV2';
import { buildV2ProfileView } from '@/lib/accessV2/profileBridge';
import { profileMemberSince } from '@/lib/profile/hub';
import WelcomeClaimPage from '@/components/profileHub/WelcomeClaimPage';
import ProfileHeader from '@/components/profileHub/ProfileHeader';
import AccountControl from '@/components/common/AccountControl';
import EditProfileModal from '@/components/profile/EditProfileModal';
import { useGlobalAccount } from '@/hooks/useGlobalAccount';
import UserRolesCard from '@/components/profileHub/UserRolesCard';
import TokenActivityCard from '@/components/profileHub/TokenActivityCard';
import TokenRequestCard from '@/components/profileHub/TokenRequestCard';
import RoleProgressionCard, { hasRoleProgressionContent } from '@/components/profileHub/RoleProgressionCard';
import ProfileActivity from '@/components/profileHub/ProfileActivity';
import { useAllProjectsFlatTasks } from '@/components/TaskManager/views/useFlatTasks';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { normalizeHatId } from '@/utils/profileUtils';
import { useOrgGate } from '@/components/shared/OrgDeadEnd';

export default function ProfileHub() {
  const router = useRouter();
  const userDAO = useOrgName();
  const orgGate = useOrgGate();
  const { accountAddress: userAddress, isAuthenticated, isAuthHydrated } = useAuth();
  const { pageBackground, onBackground } = useOrgTheme();

  const { recommendedTasks, projectsLoading } = useProjectContext();
  // Full cross-project task objects carry deadline fields (the user's
  // assignedTasks query does not), so look up each in-flight task by id to
  // surface a deadline chip. Purely client-side over already-fetched data.
  const flatTasks = useAllProjectsFlatTasks();
  const { claimedTasks, graphUsername, userDataLoading, error, userData, hasMemberRole, hasApproverRole } = useUserContext();
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

    return {
      username: graphUsername,
      ptBalance,
      // user.id from the subgraph is the composite `${orgId}-${address}` —
      // user.address is the bare wallet/account address we actually want to display.
      accountAddress: userData.address || userAddress,
      tasksCompleted: userData.tasksCompleted || 0,
      totalVotes: userData.totalVotes || 0,
      dateJoined: profileMemberSince(userData.firstSeenAt),
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
                Sign in again to view your profile.
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
          <Text color={onBackground}>We couldn’t load your roles. Please refresh to try again.</Text>
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
          <Text color={onBackground}>We couldn’t load your profile. Please refresh to try again.</Text>
        </Center>
      </>
    );
  }

  return (
    <>
      {seoHead}
      <Navbar />
      <Box as="main" minH="100vh" background={pageBackground()} px={{ base: 4, md: 6, lg: 10 }} py={{ base: 5, md: 8 }}>
        <VStack maxW="1200px" mx="auto" spacing={{ base: 5, md: 6 }} align="stretch">
          <ProfileHeader
            username={userInfo.username}
            address={userInfo.accountAddress}
            avatarCid={avatarCidMap[userInfo.username] || profileMetadata?.avatar}
            orgName={orgName}
            dateJoined={userInfo.dateJoined}
            userRoles={userRoles}
            canApproveRequests={canApproveRequests}
            profileMetadata={profileMetadata}
            canEdit={!!userAddress}
            onEditProfileClick={() => setEditProfileOpen(true)}
            onSettingsClick={() => setSettingsModalOpen(true)}
            onExecutiveMenuClick={() => setExecutiveMenuOpen(true)}
          />
          <Grid templateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 1.55fr) minmax(0, 1fr)' }} gap={{ base: 5, md: 6 }} alignItems="start">
            <VStack spacing={{ base: 5, md: 6 }} align="stretch" minW={0}>
              <ProfileActivity
                claimedTasks={claimedTasks}
                userAddress={userAddress}
                flatTasks={flatTasks}
                recommendedTasks={recommendedTasks}
                projectsLoading={projectsLoading}
                userDAO={userDAO}
                tokenLabel={tokenLabel}
              />
              {showRoleProgression && (
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
              )}
            </VStack>
            <VStack spacing={{ base: 5, md: 6 }} align="stretch" minW={0}>
              <TokenActivityCard
                ptBalance={userInfo.ptBalance}
                tasksCompleted={userInfo.tasksCompleted}
                totalVotes={userInfo.totalVotes}
              >
                {canRequestTokens && <TokenRequestCard hasMemberRole={canRequestTokens} embedded />}
              </TokenActivityCard>
              <UserRolesCard
                userHatIds={profileUserHatIds}
                roles={profileRoles}
                permissionsMatrix={permissionsMatrix}
                userDAO={userDAO}
              />
            </VStack>
          </Grid>
        </VStack>
      </Box>
      <AccountSettingsModal isOpen={isSettingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
      <ExecutiveMenuModal isOpen={isExecutiveMenuOpen} onClose={() => setExecutiveMenuOpen(false)} hasApproverRole={canApproveRequests} />
      <EditProfileModal isOpen={isEditProfileOpen} onClose={() => setEditProfileOpen(false)} />
    </>
  );
}
