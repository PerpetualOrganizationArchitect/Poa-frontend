/**
 * OrgDeadEnd — what an org-scoped page shows when there is no org to show.
 *
 * Org pages read `router.query.userDAO`; when it is absent or names nothing,
 * POContext resolves to `orgStatus: 'missing' | 'notFound'`. Before this, both
 * cases rendered a convincing empty organisation ("NoSuchOrg's Dashboard", a
 * treasury of 0, a board inviting you to join a group that does not exist) — or,
 * with no name at all, an eternal spinner. Say what happened and offer the way
 * out instead.
 *
 * Most pages want `useOrgGate()` rather than this panel directly — it returns a
 * whole replacement page (navbar + background + panel) or null, so a page reads:
 *
 *     const orgGate = useOrgGate();
 *     ...all other hooks...
 *     if (orgGate) return orgGate;      // AFTER every hook — rules of hooks
 *
 * Props:
 *   status   'missing' | 'notFound'
 *   orgName  the name that failed to resolve (only meaningful for 'notFound')
 */

import React from 'react';
import { Box, Button, Icon, Text, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { PiCompass, PiMagnifyingGlass } from 'react-icons/pi';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import SEOHead from '@/components/common/SEOHead';
import { usePOContext } from '@/context/POContext';
import { useOrgTheme } from '@/hooks/useOrgTheme';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';

const AMETHYST = '#9473DC';

export function OrgDeadEnd({ status = 'missing', orgName = '', notFoundTitle, notFoundBody }) {
  const router = useRouter();
  const notFound = status === 'notFound';

  return (
    <Box
      position="relative"
      borderRadius="2xl"
      p={{ base: 8, md: 12 }}
      overflow="hidden"
      zIndex={1}
      maxW="640px"
      mx="auto"
      my={{ base: 8, md: 16 }}
      boxShadow="lg"
    >
      <Box style={glassLayerStyle} position="absolute" inset={0} borderRadius="inherit" zIndex={-1} />
      <VStack spacing={4} align="center" textAlign="center">
        <Icon as={notFound ? PiMagnifyingGlass : PiCompass} boxSize={8} color={AMETHYST} />
        <Text fontSize="lg" fontWeight="800" color="white">
          {notFound
            ? (notFoundTitle ? notFoundTitle(orgName) : `We couldn’t find an organization named “${orgName}”`)
            : 'No organization selected'}
        </Text>
        <Text fontSize="sm" color="gray.200" maxW="420px" lineHeight="1.7">
          {notFound
            ? (notFoundBody || 'Names are case-sensitive, and a brand-new org can take a minute to appear. Check the link, or browse the organizations that are live now.')
            : 'This page belongs to an organization — its votes, tasks, treasury and people. Pick one to see them.'}
        </Text>
        <Button
          minH="44px"
          bg={AMETHYST}
          color="white"
          _hover={{ bg: '#B79BF0' }}
          onClick={() => router.push('/explore/')}
        >
          Browse organizations
        </Button>
      </VStack>
    </Box>
  );
}

/**
 * The whole replacement page, or null when there IS an org (including while it
 * is still resolving — 'loading' must keep rendering the page's own spinner, or
 * every navigation would blink a dead end).
 *
 * Returning an element from a hook is unusual, but it keeps the per-page edit to
 * two lines and puts the navbar/background chrome in ONE place instead of
 * thirteen. The hook itself must be called unconditionally at the top of the
 * component like any other; only the `return orgGate` is conditional, and it has
 * to sit after every remaining hook call.
 */
export function useOrgGate({ notFoundTitle, notFoundBody } = {}) {
  const router = useRouter();
  const { orgStatus, orgName } = usePOContext();
  const { pageBackground } = useOrgTheme();

  if (orgStatus !== 'missing' && orgStatus !== 'notFound') return null;

  return (
    <>
      {/* The page's own SEOHead is skipped by the early return, so supply one:
          a dead end must never be indexed, and the tab keeps the previous
          page's title otherwise. */}
      <SEOHead
        title={orgStatus === 'notFound' ? 'Organization not found' : 'Choose an organization'}
        description="This page belongs to an organization."
        path={router.pathname}
        noIndex
      />
      <Navbar />
      <Box minH="90vh" background={pageBackground()} px={{ base: 4, md: 8 }}>
        <OrgDeadEnd
          status={orgStatus}
          orgName={orgName}
          notFoundTitle={notFoundTitle}
          notFoundBody={notFoundBody}
        />
      </Box>
    </>
  );
}

export default OrgDeadEnd;
