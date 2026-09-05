/**
 * AccessV2TeamSection — THE mount point, and THE gate.
 *
 * Renders no v2 role panels unless the org's authority is router-bound. The team page retains the
 * legacy hierarchy until then; this component contributes only a setup-status banner while pending.
 *
 * A migrated-but-not-yet-cut-over org gets the status banner only — its roles still live in Hats,
 * so showing the v2 panels in that window would be a lie.
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

  // Legacy org, or an endpoint that cannot serve the v2 schema: render nothing here.
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
    <VStack as="section" data-tour="org-roles" align="stretch" spacing={{ base: 6, md: 8 }}>
      {banner}
      <PendingActionsPanel />
      <ClaimableRolesPanel />
      <RolesGroupsPanel activeProposals={proposals} />
    </VStack>
  );
}
