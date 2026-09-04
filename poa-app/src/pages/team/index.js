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
import MembersSpotlight from '@/components/accessV2/MembersSpotlight';
import { useAuthoritySubjects, useAuthorityMemberships } from '@/hooks/accessV2';
import { buildV2LegacyRoles, buildV2MatrixView } from '@/lib/accessV2/legacyBridge';

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

  // On a live-authority org the legacy sections below the v2 panel must read the fold mirror,
  // not the retired hat entities — those stop updating at cutover and render raw subject ids,
  // ghost roles, and an empty permissions matrix. `enabled` is router-bound, i.e. post-cutover.
  const v2 = useAuthoritySubjects();
  const { membersOf, groupMembers } = useAuthorityMemberships();
  const v2Live = v2.enabled;

  const v2Sections = useMemo(() => {
    if (!v2Live) return null;
    const subjects = [...(v2.roles || []), ...(v2.groups || [])];
    const view = buildV2MatrixView(subjects);
    return {
      matrixRoles: buildV2LegacyRoles({
        roles: view.rows.filter((s) => !s.isGroup),
        groups: view.rows.filter((s) => s.isGroup),
        membersOf,
        groupMembers,
      }),
      permissionColumns: view.columns,
      permissionsMatrix: view.matrix,
      hidden: view.hidden,
    };
  }, [v2Live, v2.roles, v2.groups, membersOf, groupMembers]);

  // The matrix only lists rows with DISTINCT permissions; everyone left out gets a sentence.
  const matrixNotes = useMemo(() => {
    if (!v2Sections) return [];
    const notes = [];
    const { inheritOnly, silent } = v2Sections.hidden;
    if (inheritOnly.length) {
      const groups = [...new Set(inheritOnly.flatMap((r) => r.groupNames))].join(', ');
      notes.push(
        inheritOnly.length === 1
          ? `${inheritOnly[0].name} isn't listed — it holds exactly what ${groups || 'its group'} grants (see the group's row).`
          : `${inheritOnly.length} roles aren't listed — they hold exactly what ${groups || 'their group'} grants (see the group's row).`
      );
    }
    if (silent.length) {
      const shownNames = silent.slice(0, 3).join(', ');
      const rest = silent.length - 3;
      notes.push(
        `${shownNames}${rest > 0 ? ` and ${rest} more` : ''} ${silent.length === 1 ? 'has' : 'have'} no extra permissions yet — a role-edit vote can grant some.`
      );
    }
    return notes;
  }, [v2Sections]);

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

          {/* Role Hierarchy Section — legacy orgs only: on a live authority the v2 panel above
              IS the roles surface, and this tree would re-render the retired hat entities
              (raw bytes32 names, ghost roles) beside it. */}
          {!v2Live && (
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
          )}

          {/* Permissions Matrix Section — v2 orgs read the fold mirror via the legacy bridge.
              Only rows with DISTINCT permissions render; the notes explain everyone else. */}
          <Box as="section">
            <Heading size="lg" color="warmGray.900" mb={4}>
              Permissions
            </Heading>
            <Text color="warmGray.600" mb={4}>
              {v2Live
                ? 'Who can do what — only roles and groups with permissions of their own are listed'
                : "What each role can do across the organization's systems"}
            </Text>
            <PermissionsMatrix
              roles={v2Sections ? v2Sections.matrixRoles : roles}
              permissionsMatrix={v2Sections ? v2Sections.permissionsMatrix : permissionsMatrix}
              permissionColumns={v2Sections ? v2Sections.permissionColumns : permissionColumns}
              loading={v2Live ? v2.loading : loading}
            />
            {matrixNotes.map((note) => (
              <Text key={note} fontSize="sm" color="warmGray.500" mt={2}>
                {note}
              </Text>
            ))}
          </Box>

          {/* Members Section — v2 orgs get the people-first spotlight (roles are the badges);
              legacy orgs keep the grouped-by-role accordions. */}
          <Box as="section">
            <Heading size="lg" color="warmGray.900" mb={4}>
              Members
            </Heading>
            <Text color="warmGray.600" mb={4}>
              {v2Live ? 'The people behind the org — expand to meet everyone' : 'Members of the organization grouped by their roles'}
            </Text>
            {v2Live ? (
              <MembersSpotlight legacyMembersByRole={membersByRole} loading={loading} />
            ) : (
              <MembersSection
                roles={roles}
                membersByRole={membersByRole}
                loading={loading}
              />
            )}
          </Box>

          {/* Vouching Section — legacy orgs only: v2 vouching lives in the role drawer and the
              claimable panel, with per-subject quorums the legacy section cannot express. */}
          {!v2Live && roles.some(role => role.vouchingEnabled) && (
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
