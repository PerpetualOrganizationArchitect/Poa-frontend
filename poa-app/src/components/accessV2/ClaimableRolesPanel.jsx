/**
 * ClaimableRolesPanel — "roles you can take", straight off the fold mirror.
 *
 * A row is claimable when `!accepted && eligible`, and the panel always says WHY, from
 * `eligibilitySource`:
 *   • Invited        — an explicit grant (a vote, or a manager's offer)
 *   • Open role      — the subject's default is ALLOW, so anyone in the org qualifies
 *   • Vouched for    — the vouch quorum is met
 *   • Email verified — a live email verification qualifies you
 * plus the one that would otherwise look like a bug: a seat you RESIGNED from that is held in
 * reserve by a sticky governance grant, and can be taken back at any time.
 *
 * The countdown matters. A claimable seat that came from a delegated OFFER cannot be claimed until
 * its pending entry's `activatesAt` — `claim` reverts NotYetActive before then. So the button is
 * disabled with the remaining time on it, instead of failing on click.
 *
 * Leaving is here too, and its wording depends on the rule: a normal grant is given up, a sticky
 * one is held for you.
 */

import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  Alert,
  AlertIcon,
  Divider,
  Tooltip,
} from '@chakra-ui/react';
import { lightSectionStyle, lightCardStyle } from '@/components/shared/glassStyles';
import { useMyMemberships, useAuthorityActions } from '@/hooks/accessV2';
import { isHeldInReserve } from '@/lib/accessV2/memberships';
import { renounceCopy } from '@/lib/accessV2/rules';
import { formatCountdown, secondsUntilActive, isOpen as isPendingOpen } from '@/lib/accessV2/pendingActions';

function ClaimRow({ row, onClaim, busy, paused }) {
  const pending = row.pendingAction;
  // A delegated offer's anchor lives in the pending entry — claiming early reverts NotYetActive.
  const waiting = pending && isPendingOpen({ ...pending, status: pending.status })
    ? secondsUntilActive({ ...pending, activatesAt: Number(pending.activatesAt), status: pending.status })
    : 0;
  const heldInReserve = isHeldInReserve(row);

  return (
    <Box {...lightCardStyle} p={4}>
      <HStack justify="space-between" align="start" flexWrap="wrap" gap={2}>
        <VStack align="start" spacing={1}>
          <HStack>
            <Text fontWeight="semibold" color="warmGray.900">{row.subjectName || 'Role'}</Text>
            <Badge colorScheme={heldInReserve ? 'purple' : 'green'}>
              {heldInReserve ? 'Held for you' : row.badge}
            </Badge>
          </HStack>
          <Text fontSize="sm" color="warmGray.600">
            {heldInReserve
              ? 'You left this role, but the seat is still yours until a vote clears it.'
              : row.why}
          </Text>
        </VStack>

        <Tooltip
          isDisabled={waiting === 0}
          label="This was set up by a manager and is still in its review window."
        >
          <Button
            size="sm"
            colorScheme="coral"
            isDisabled={paused || waiting > 0}
            isLoading={busy}
            onClick={() => onClaim(row)}
          >
            {waiting > 0 ? `Available in ${formatCountdown(waiting)}` : 'Join'}
          </Button>
        </Tooltip>
      </HStack>
    </Box>
  );
}

function MyRoleRow({ row, onLeave, busy, paused }) {
  return (
    <Box {...lightCardStyle} p={4}>
      <HStack justify="space-between" align="start" flexWrap="wrap" gap={2}>
        <VStack align="start" spacing={1}>
          <HStack>
            <Text fontWeight="semibold" color="warmGray.900">{row.subjectName || 'Role'}</Text>
            {row.rule?.sticky && (
              <Tooltip label="Only a vote can take this role away from you.">
                <Badge colorScheme="purple">Locked to a vote</Badge>
              </Tooltip>
            )}
          </HStack>
          <Text fontSize="xs" color="warmGray.500">{renounceCopy(row.rule)}</Text>
        </VStack>
        <Button
          size="sm"
          variant="outline"
          isDisabled={paused}
          isLoading={busy}
          onClick={() => onLeave(row)}
        >
          Leave
        </Button>
      </HStack>
    </Box>
  );
}

export default function ClaimableRolesPanel() {
  const { claimable, myRoles, blocked, enabled, paused, refetch } = useMyMemberships();
  const { claim, renounce, isBusy } = useAuthorityActions();
  const [error, setError] = useState(null);

  if (!enabled) return null;
  if (claimable.length === 0 && myRoles.length === 0 && blocked.length === 0) return null;

  const act = async (fn, row) => {
    setError(null);
    const res = await fn(row.subjectId, row.subjectName || 'this role');
    if (res?.success) refetch?.();
    else if (res?.error) setError(res.error.message);
  };

  return (
    <Box {...lightSectionStyle} p={{ base: 4, md: 6 }}>
      <Text fontSize="lg" fontWeight="bold" color="warmGray.900" mb={1}>Your roles</Text>
      <Text fontSize="sm" color="warmGray.600" mb={4}>
        What you hold here, and what you can take.
      </Text>

      {error && (
        <Alert status="error" borderRadius="md" fontSize="sm" mb={4}>
          <AlertIcon />{error}
        </Alert>
      )}

      <VStack align="stretch" spacing={4}>
        {claimable.length > 0 && (
          <VStack align="stretch" spacing={2}>
            <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase">
              You can join
            </Text>
            {claimable.map((row) => (
              <ClaimRow
                key={row.id}
                row={row}
                paused={paused}
                busy={isBusy(`claim:${row.subjectId}`)}
                onClaim={(r) => act(claim, r)}
              />
            ))}
          </VStack>
        )}

        {myRoles.length > 0 && (
          <>
            {claimable.length > 0 && <Divider borderColor="warmGray.100" />}
            <VStack align="stretch" spacing={2}>
              <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase">
                You hold
              </Text>
              {myRoles.map((row) => (
                <MyRoleRow
                  key={row.id}
                  row={row}
                  paused={paused}
                  busy={isBusy(`renounce:${row.subjectId}`)}
                  onLeave={(r) => act(renounce, r)}
                />
              ))}
            </VStack>
          </>
        )}

        {blocked.length > 0 && (
          <Alert status="info" borderRadius="md" fontSize="sm">
            <AlertIcon />
            You are blocked from {blocked.map((b) => b.subjectName).join(', ')}. Only a vote (or the
            role’s managers, if they set the block) can lift it.
          </Alert>
        )}
      </VStack>
    </Box>
  );
}
