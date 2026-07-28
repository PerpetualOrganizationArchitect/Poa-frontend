/**
 * Organization Settings Page
 * Allows org admins to edit organization metadata (name, description, logo, links)
 */

import SEOHead from "@/components/common/SEOHead";
import React from 'react';
import {
  Box,
  VStack,
  Heading,
  Text,
  Center,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from '@chakra-ui/react';
import PulseLoader from "@/components/shared/PulseLoader";
import { useRouter } from 'next/router';

import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import { useAuth } from '@/context/AuthContext';
import { usePOContext } from '@/context/POContext';
import { useIsOrgAdmin, useOrgTheme } from '@/hooks';
import { useOrgName } from '@/hooks/useOrgName';
import OrgMetadataEditor from '@/components/settings/OrgMetadataEditor';
import EmailAllowlistEditor from '@/components/settings/EmailAllowlistEditor';

const SettingsPage = () => {
  const router = useRouter();
  const userDAO = useOrgName();
  const { isAuthenticated, accountAddress } = useAuth();

  const {
    orgId,
    orgChainId,
    poDescription,
    poLinks,
    logoUrl,
    backgroundColor,
    hideTreasury,
    useTokenSymbol,
    participationTokenSymbol,
    taskPayoutHoursOnly,
    taskPayoutHourlyRate,
    poContextLoading,
    error: contextError,
  } = usePOContext();

  // Check if user is an org admin using unified accountAddress
  const { isAdmin, loading: adminLoading, error: adminError } = useIsOrgAdmin(orgId, accountAddress);
  const { pageBackground, onBackground, onBackgroundMuted, onBackgroundSubtle } = useOrgTheme();

  const seoHead = (
    <SEOHead
      title="Settings"
      description="Organization settings and configuration."
      path="/settings"
      noIndex
    />
  );

  // Loading state
  if (poContextLoading || adminLoading) {
    return (
      <>
        {seoHead}
        <Box minH="100vh" background={pageBackground()}>
          <Navbar />
          <Center minH="80vh">
            <VStack spacing={4}>
              <PulseLoader size="xl" color="coral.500" />
              <Text color={onBackgroundSubtle}>Loading settings...</Text>
            </VStack>
          </Center>
        </Box>
      </>
    );
  }

  // Error state
  if (contextError || adminError) {
    return (
      <>
        {seoHead}
        <Box minH="100vh" background={pageBackground()}>
          <Navbar />
          <Center minH="80vh">
            <Alert status="error" maxW="lg" borderRadius="xl" bg="red.50">
              <AlertIcon />
              <Box>
                <AlertTitle>Error loading settings</AlertTitle>
                <AlertDescription>{contextError?.message || adminError?.message}</AlertDescription>
              </Box>
            </Alert>
          </Center>
        </Box>
      </>
    );
  }

  // Not authenticated state
  if (!isAuthenticated) {
    return (
      <>
        {seoHead}
        <Box minH="100vh" background={pageBackground()}>
          <Navbar />
          <Center minH="80vh">
            <Alert status="warning" maxW="lg" borderRadius="xl" bg="orange.50">
              <AlertIcon />
              <Box>
                <AlertTitle>Not signed in</AlertTitle>
                <AlertDescription>Please sign in to access organization settings.</AlertDescription>
              </Box>
            </Alert>
          </Center>
        </Box>
      </>
    );
  }

  // Not admin state
  if (!isAdmin) {
    return (
      <>
        {seoHead}
        <Box minH="100vh" background={pageBackground()}>
          <Navbar />
          <Center minH="80vh">
            <Alert status="warning" maxW="lg" borderRadius="xl" bg="orange.50">
              <AlertIcon />
              <Box>
                <AlertTitle>Access Denied</AlertTitle>
                <AlertDescription>
                  Only organization admins can access settings. You need to be wearing the admin hat or top hat to edit organization metadata.
                </AlertDescription>
              </Box>
            </Alert>
          </Center>
        </Box>
      </>
    );
  }

  return (
    <>
      {seoHead}
    <Box minH="100vh" background={pageBackground()}>
      <Navbar />
      <Box maxW="2xl" mx="auto" px={4} pt={{ base: 4, md: 10 }} pb={12}>
        <VStack spacing={8} align="stretch">
          <Box>
            <Heading size="lg" color={onBackground} mb={2} fontWeight="600">
              Organization Settings
            </Heading>
            <Text color={onBackgroundMuted} fontSize="md">
              Edit your organization&apos;s name, description, logo, and links
            </Text>
          </Box>

          <OrgMetadataEditor
            orgId={orgId}
            orgChainId={orgChainId}
            currentName={userDAO}
            currentDescription={poDescription}
            currentLinks={poLinks}
            currentLogoHash={logoUrl}
            currentBackgroundColor={backgroundColor}
            currentHideTreasury={hideTreasury}
            currentUseTokenSymbol={useTokenSymbol}
            currentTokenSymbol={participationTokenSymbol}
            currentTaskPayoutHoursOnly={taskPayoutHoursOnly}
            currentTaskPayoutHourlyRate={taskPayoutHourlyRate}
          />

          <EmailAllowlistEditor orgId={orgId} orgChainId={orgChainId} currentName={userDAO} />
        </VStack>
      </Box>
    </Box>
    </>
  );
};

export default SettingsPage;
