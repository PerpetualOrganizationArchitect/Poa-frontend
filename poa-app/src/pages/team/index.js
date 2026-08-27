/**
 * Organization Structure Page
 * Displays org roles, permissions, members, and governance configuration
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import SEOHead from "@/components/common/SEOHead";
import {
  Box,
  VStack,
  Heading,
  Text,
  Center,
  Button,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import PulseLoader from "@/components/shared/PulseLoader";
import { FiArrowLeft } from 'react-icons/fi';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAccount } from 'wagmi';

import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import { useAuth } from '@/context/AuthContext';
import { useOrgStructure, useClaimRole, useVouches } from '@/hooks';
import { useOrgName } from '@/hooks/useOrgName';
import { useUserContext } from '@/context/UserContext';
import { useVotingContext } from '@/context/VotingContext';
import {
  OrgOverviewCard,
  RoleHierarchyTree,
  PermissionsMatrix,
  MembersSection,
  GovernanceConfigSection,
  DeveloperInfoSection,
  VouchingSection,
  RoleApplicationModal,
} from '@/components/orgStructure';
import { useOrgGate } from "@/components/shared/OrgDeadEnd";
// Access v2. Renders NOTHING on an org that is not on the MembershipAuthority path, so everything
// below it is the untouched legacy surface for every unmigrated org.
import { AccessV2TeamSection } from '@/components/accessV2';

const OrgStructurePage = () => {
  const router = useRouter();
  const userDAO = useOrgName();
  const orgGate = useOrgGate();
  const { isConnected, address: wagmiAddress } = useAccount();
  const { isAuthenticated, accountAddress } = useAuth();

  // Use unified address (works for both passkey and wallet users)
  const userAddress = accountAddress || wagmiAddress;

  // Get user's current hat IDs
  const { userData } = useUserContext();
  const userHatIds = userData?.hatIds || [];

  // Voting classes for governance display, and the ongoing proposals the access-v2 create-role
  // wizard needs: a subject-creating proposal that executes before ours shifts every predicted
  // subject id in our batch, and the only signal that another one is in flight is this list.
  const { votingClasses, ongoingPolls } = useVotingContext();

  const {
    orgName,
    orgMetadata,
    deployedAt,
    totalMembers,
    roles,
    permissionsMatrix,
    permissionColumns,
    membersByRole,
    governance,
    contracts,
    tokenInfo,
    eligibilityModuleAddress,
    loading,
    error,
  } = useOrgStructure();

  // Role claiming and application functionality
  const {
    claimRole,
    isClaimingHat,
    isReady: claimReady,
    applyForRole,
    withdrawApplication,
    checkApplicationStatuses,
    hasApplied,
    isApplyingForHat,
    isWithdrawingFromHat,
  } = useClaimRole(eligibilityModuleAddress);

  // Vouching data for claim eligibility
  const rolesWithVouching = roles?.filter(role => role.vouchingEnabled) || [];
  const { getVouchProgress } = useVouches(eligibilityModuleAddress, rolesWithVouching);

  // Default-eligible quick-join hats sponsor a role application's gas: the applicant
  // is eligible for these (so the paymaster pays) even though they're not yet eligible
  // for the vouch-gated hat they're applying for. See useClaimRole.applyForRole.
  const quickJoinHatIds = useMemo(
    () => (roles || []).filter((r) => r.isQuickJoinEligible).map((r) => r.hatId),
    [roles],
  );

  // Application modal state
  const [applicationModal, setApplicationModal] = useState({ isOpen: false, hatId: null, roleName: '' });

  const handleOpenApplicationModal = useCallback((hatId) => {
    const role = roles.find(r => r.hatId === hatId);
    setApplicationModal({ isOpen: true, hatId, roleName: role?.name || 'Role' });
  }, [roles]);

  const handleCloseApplicationModal = useCallback(() => {
    setApplicationModal({ isOpen: false, hatId: null, roleName: '' });
  }, []);

  const handleSubmitApplication = useCallback(async (applicationData) => {
    if (!applicationModal.hatId) return;
    handleCloseApplicationModal();
    await applyForRole(applicationModal.hatId, applicationData, quickJoinHatIds);
  }, [applicationModal.hatId, applyForRole, handleCloseApplicationModal, quickJoinHatIds]);

  // Withdraw is gas-sponsored the same way as applying — see quickJoinHatIds above.
  const handleWithdrawApplication = useCallback(
    (hatId) => withdrawApplication(hatId, quickJoinHatIds),
    [withdrawApplication, quickJoinHatIds],
  );

  // Refresh application statuses when roles data is available
  useEffect(() => {
    if (roles?.length && eligibilityModuleAddress && (userAddress || accountAddress)) {
      checkApplicationStatuses();
    }
  }, [roles, eligibilityModuleAddress, userAddress, accountAddress, checkApplicationStatuses]);

  const seoHead = (
    <SEOHead
      title="Organization Structure"
      description="View organization roles and governance structure."
      path="/team"
      noIndex
    />
  );

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;

  // Loading state
  if (loading) {
    return (
      <>
        {seoHead}
        <Box minH="100vh">
          <Navbar />
          <Center minH="60vh">
            <VStack spacing={4}>
              <PulseLoader size="xl" color="coral.500" />
              <Text color="warmGray.500">Loading organization structure...</Text>
            </VStack>
          </Center>
        </Box>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        {seoHead}
        <Box minH="100vh">
          <Navbar />
          <Center minH="60vh">
            <VStack spacing={4}>
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                Failed to load organization data
              </Alert>
              <Link href={`/dashboard?org=${encodeURIComponent(userDAO)}`} passHref>
                <Button leftIcon={<FiArrowLeft />} variant="ghost" color="warmGray.600" _hover={{ color: 'coral.500' }}>
                  Back to Dashboard
                </Button>
              </Link>
            </VStack>
          </Center>
        </Box>
      </>
    );
  }

  return (
    <>
    {seoHead}
    <Box minH="100vh">
      <Navbar />

      <Box
        maxW="1200px"
        mx="auto"
        px={{ base: 4, md: 6, lg: 8 }}
        py={{ base: 6, md: 8 }}
      >
        <VStack spacing={{ base: 6, md: 8 }} align="stretch">

          {/* Page Header */}
          <Box>
            <Link href={`/dashboard?org=${encodeURIComponent(userDAO)}`} passHref>
              <Button
                leftIcon={<FiArrowLeft />}
                variant="ghost"
                color="warmGray.600"
                _hover={{ color: 'coral.500' }}
                size="sm"
                mb={4}
              >
                Back to Dashboard
              </Button>
            </Link>
            <Heading size="xl" color="warmGray.900" mb={2}>
              Organization Structure
            </Heading>
            <Text color="warmGray.600">
              Explore the governance structure, roles, and permissions of this organization
            </Text>
          </Box>

          {/* Overview Section */}
          <Box as="section">
            <OrgOverviewCard
              name={orgName}
              description={orgMetadata.description}
              links={orgMetadata.links}
              logo={orgMetadata.logo}
              deployedAt={deployedAt}
              totalMembers={totalMembers}
              loading={loading}
            />
          </Box>

          {/* Access v2 — roles + groups, the claimable panel and the review window.
              Self-gating: `null` unless this org's MembershipAuthority is router-bound.
              `activeProposals` feeds the create-role wizard's id-prediction race warning. */}
          <AccessV2TeamSection activeProposals={ongoingPolls} />

          {/* Role Hierarchy Section */}
          <Box as="section" data-tour="org-roles">
            <Heading size="lg" color="warmGray.900" mb={4}>
              Roles
            </Heading>
            <Text color="warmGray.600" mb={4}>
              The organizational hierarchy defines who can do what within the organization
            </Text>
            <RoleHierarchyTree
              roles={roles}
              loading={loading}
              userHatIds={userHatIds}
              userAddress={userAddress}
              getVouchProgress={getVouchProgress}
              onClaimRole={claimRole}
              isClaimingHat={isClaimingHat}
              isConnected={isAuthenticated}
              showClaimButtons={Boolean(eligibilityModuleAddress)}
              hasApplied={hasApplied}
              isApplyingForHat={isApplyingForHat}
              isWithdrawingFromHat={isWithdrawingFromHat}
              onApplyForRole={handleOpenApplicationModal}
              onWithdrawApplication={handleWithdrawApplication}
            />
          </Box>

          {/* Permissions Matrix Section */}
          <Box as="section">
            <Heading size="lg" color="warmGray.900" mb={4}>
              Permissions
            </Heading>
            <Text color="warmGray.600" mb={4}>
              What each role can do across the organization&apos;s systems
            </Text>
            <PermissionsMatrix
              roles={roles}
              permissionsMatrix={permissionsMatrix}
              permissionColumns={permissionColumns}
              loading={loading}
            />
          </Box>

          {/* Members Section */}
          <Box as="section">
            <Heading size="lg" color="warmGray.900" mb={4}>
              Members
            </Heading>
            <Text color="warmGray.600" mb={4}>
              Members of the organization grouped by their roles
            </Text>
            <MembersSection
              roles={roles}
              membersByRole={membersByRole}
              loading={loading}
            />
          </Box>

          {/* Vouching Section - only shown if org has vouching enabled */}
          {roles.some(role => role.vouchingEnabled) && (
            <Box as="section">
              <Heading size="lg" color="warmGray.900" mb={4}>
                Member Vouching
              </Heading>
              <Text color="warmGray.600" mb={4}>
                Vouch for new members seeking roles in the organization
              </Text>
              <VouchingSection
                roles={roles}
                eligibilityModuleAddress={eligibilityModuleAddress}
                userHatIds={userHatIds}
                userAddress={userAddress}
                isConnected={isAuthenticated}
              />
            </Box>
          )}

          {/* Governance Section */}
          <Box as="section">
            <Heading size="lg" color="warmGray.900" mb={4}>
              Governance
            </Heading>
            <Text color="warmGray.600" mb={4}>
              How decisions are made in this organization
            </Text>
            <GovernanceConfigSection
              governance={governance}
              tokenInfo={tokenInfo}
              votingClasses={votingClasses}
              loading={loading}
            />
          </Box>

          {/* Developer Info Section (hidden by default) */}
          <DeveloperInfoSection contracts={contracts} />

        </VStack>
      </Box>

      <RoleApplicationModal
        isOpen={applicationModal.isOpen}
        onClose={handleCloseApplicationModal}
        onApply={handleSubmitApplication}
        roleName={applicationModal.roleName}
      />
    </Box>
    </>
  );
};
export default OrgStructurePage;
