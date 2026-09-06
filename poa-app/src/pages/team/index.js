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
import { useOrgStructure } from '@/hooks';
import { useOrgName } from '@/hooks/useOrgName';
import { useUserContext } from '@/context/UserContext';
import { useVotingContext } from '@/context/VotingContext';
import {
  OrgOverviewCard,
  PermissionsMatrix,
  GovernanceConfigSection,
  DeveloperInfoSection,
} from '@/components/orgStructure';
import { useOrgGate } from "@/components/shared/OrgDeadEnd";
// Access v2 renders only its status/v2 panels; this page retains legacy Hats surfaces until the
// authority is router-bound, then swaps every retired role-derived section to authority data.
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
  const { votingClasses } = useVotingContext();

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
              Self-gating: `null` for legacy, status-only while pending, panels once router-bound.
              `activeProposals` feeds the create-role wizard's id-prediction race warning. */}
          <AccessV2TeamSection />

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
              roles={v2Sections?.matrixRoles || []}
              permissionsMatrix={v2Sections?.permissionsMatrix || {}}
              permissionColumns={v2Sections?.permissionColumns || []}
              loading={v2.loading}
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
            <MembersSpotlight legacyMembersByRole={membersByRole} loading={loading} />
          </Box>

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


    </Box>
    </>
  );
};
export default OrgStructurePage;
