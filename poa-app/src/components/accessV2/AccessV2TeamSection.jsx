/**
 * AccessV2TeamSection — THE mount point, and THE gate.
 *
 * Renders nothing at all unless the org's authority is live. That is the whole contract with the
 * legacy path: an unmigrated org (or a migrated one whose endpoint has not been republished yet)
 * gets `null` here and its existing team page is untouched, byte for byte.
 *
 * A migrated-but-not-yet-cut-over org gets the status banner and nothing else — its roles still
 * live in the legacy surfaces below, so showing an empty v2 panel would be a lie.
 */

import React, { useMemo } from 'react';
import { Box, VStack, Alert, AlertIcon, AlertTitle, AlertDescription } from '@chakra-ui/react';
import { useOrgAuthority } from '@/hooks/accessV2';
import { withSubjectCreationFlags } from '@/lib/accessV2/proposalRace';
import RolesGroupsPanel from './RolesGroupsPanel';
import ClaimableRolesPanel from './ClaimableRolesPanel';
import PendingActionsPanel from './PendingActionsPanel';

/**
 * @param {Array} activeProposals - the org's ONGOING proposals (VotingContext.ongoingPolls). Each
 *   is annotated here with `createsSubject`, which is what the create-role wizard's id-prediction
 *   race warning keys on. Resolved from the proposal's indexed `actionSummaries` — the subgraph
 *   does not index proposal calldata, and the competing proposal is usually someone else's.
 */
export default function AccessV2TeamSection({ activeProposals = [] }) {
  const authority = useOrgAuthority();
  const proposals = useMemo(() => withSubjectCreationFlags(activeProposals), [activeProposals]);

  // Legacy org, or an endpoint that cannot serve the v2 schema: render NOTHING.
  if (!authority.migrated) return null;

  const banner = authority.statusCopy && (
    <Alert status={authority.statusCopy.tone} borderRadius="lg">
      <AlertIcon />
      <Box>
        <AlertTitle fontSize="sm">{authority.statusCopy.title}</AlertTitle>
        <AlertDescription fontSize="sm">{authority.statusCopy.body}</AlertDescription>
      </Box>
    </Alert>
  );

  // Deployed but not yet router-bound: the modules still read the legacy path, so the v2 panels
  // would show a roster nothing is actually using.
  if (!authority.enabled) return <Box as="section">{banner}</Box>;

  return (
    <VStack as="section" align="stretch" spacing={{ base: 6, md: 8 }}>
      {banner}
      <PendingActionsPanel />
      <ClaimableRolesPanel />
      <RolesGroupsPanel activeProposals={proposals} />
    </VStack>
  );
}
