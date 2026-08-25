/**
 * PendingActionsPanel — the review window, made visible to the person it affects.
 *
 * This panel exists because of one design claim in the spec: a delegated action's delay is a
 * REVIEW WINDOW, not a security boundary. A window nobody can see is neither. So:
 *
 *   • a pending delegated REMOVAL against you is shown to YOU, in warning tone, with the time
 *     remaining and the manager who started it — not a silent timer that logs you out of your role;
 *   • an invitation shows its countdown, because `claim` reverts NotYetActive before the anchor;
 *   • anything you started yourself is cancellable from here for as long as it is open.
 *
 * Terminal states are event-sourced, never inferred: a cancelled/voided/finalised entry leaves the
 * open set entirely rather than being guessed at from a lifecycle verb.
 */

import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Alert,
  AlertIcon,
  Badge,
} from '@chakra-ui/react';
import { lightSectionStyle, lightCardStyle } from '@/components/shared/glassStyles';
import { usePendingActions, useAuthorityActions } from '@/hooks/accessV2';
import { formatCountdown } from '@/lib/accessV2/pendingActions';

const TONE_COLOR = { warning: 'orange', info: 'blue', neutral: 'gray' };

function PendingCard({ p, canCancel, onCancel, onFinalize, busyCancel, busyFinalize, paused }) {
  return (
    <Box
      {...lightCardStyle}
      p={4}
      borderLeft="3px solid"
      borderLeftColor={`${TONE_COLOR[p.copy?.tone] || 'gray'}.400`}
    >
      <VStack align="stretch" spacing={2}>
        <HStack justify="space-between" flexWrap="wrap" gap={2}>
          <Text fontWeight="semibold" color="warmGray.900">{p.copy?.title}</Text>
          <Badge colorScheme={TONE_COLOR[p.copy?.tone] || 'gray'}>
            {p.secondsRemaining > 0 ? `${formatCountdown(p.secondsRemaining)} left` : 'ready'}
          </Badge>
        </HStack>
        <Text fontSize="sm" color="warmGray.600">{p.copy?.body}</Text>

        <HStack spacing={2}>
          {/* An OFFER is finalised by the invitee's own claim — never by a finalize() button. */}
          {p.action !== 'Offer' && p.secondsRemaining === 0 && (
            <Button
              size="xs"
              colorScheme="coral"
              isDisabled={paused}
              isLoading={busyFinalize}
              onClick={() => onFinalize(p)}
            >
              Apply it
            </Button>
          )}
          {canCancel && (
            <Button size="xs" variant="ghost" isDisabled={paused} isLoading={busyCancel} onClick={() => onCancel(p)}>
              Cancel
            </Button>
          )}
        </HStack>
      </VStack>
    </Box>
  );
}

export default function PendingActionsPanel() {
  const { againstMe, mine, enabled, refetch } = usePendingActions();
  const { cancel, finalize, isBusy, paused } = useAuthorityActions();
  const [error, setError] = useState(null);

  if (!enabled) return null;

  // De-dupe: an action you started against yourself would otherwise appear twice.
  const seen = new Set(againstMe.map((p) => p.id));
  const rows = [...againstMe, ...mine.filter((p) => !seen.has(p.id))];
  if (rows.length === 0) return null;

  const run = async (fn, p) => {
    setError(null);
    const res = await fn(p.pendingId);
    if (res?.success) refetch?.();
    else if (res?.error) setError(res.error.message);
  };

  return (
    <Box {...lightSectionStyle} p={{ base: 4, md: 6 }}>
      <Text fontSize="lg" fontWeight="bold" color="warmGray.900" mb={1}>Waiting on a review window</Text>
      <Text fontSize="sm" color="warmGray.600" mb={4}>
        Changes a role’s managers have started. They take effect when the countdown ends, and can be
        cancelled until then.
      </Text>

      {error && (
        <Alert status="error" borderRadius="md" fontSize="sm" mb={4}>
          <AlertIcon />{error}
        </Alert>
      )}

      <VStack align="stretch" spacing={3}>
        {rows.map((p) => (
          <PendingCard
            key={p.id}
            p={p}
            paused={paused}
            canCancel={mine.some((m) => m.id === p.id)}
            busyCancel={isBusy(`cancel:${p.pendingId}`)}
            busyFinalize={isBusy(`finalize:${p.pendingId}`)}
            onCancel={(x) => run(cancel, x)}
            onFinalize={(x) => run(finalize, x)}
          />
        ))}
      </VStack>
    </Box>
  );
}
