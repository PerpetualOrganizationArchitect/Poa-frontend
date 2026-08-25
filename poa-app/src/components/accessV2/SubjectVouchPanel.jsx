/**
 * SubjectVouchPanel — vouch for someone against a v2 SUBJECT.
 *
 * Two v1 behaviours are gone and the copy has to reflect it:
 *   • there is no combine-mode: a vouch quorum can only ALLOW, and can never override a block;
 *   • the admin-fallback voucher branch is deleted — only MEMBERS of the configured voucher
 *     subject can vouch (which, for a self-vouching role like KUBI's Execs, is the role itself).
 *
 * The count is computed, not read off a counter: `resetVouchEpoch` and `clearUserVouches` strand
 * records with no per-record event, so a stale-epoch vouch stops counting silently. `vouchProgress`
 * filters on the config epoch, and this panel says how many were stranded so the number is never
 * mysteriously lower than the list.
 */

import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Progress,
  Alert,
  AlertIcon,
  Badge,
  Tooltip,
} from '@chakra-ui/react';
import UserIdentity from '@/components/common/UserIdentity';
import { lightCardStyle } from '@/components/shared/glassStyles';
import { useSubjectVouches, useAuthorityActions } from '@/hooks/accessV2';

export default function SubjectVouchPanel({ subjectId, user }) {
  const { config, records, progress, progressCopy, vouchGate, viewerHasVouched, enabled, refetch, subject } =
    useSubjectVouches(subjectId, user);
  const { vouch, revokeVouch, isBusy } = useAuthorityActions();
  const [error, setError] = useState(null);

  if (!enabled || !config?.enabled) return null;

  const run = async (fn) => {
    setError(null);
    const res = await fn(subjectId, user);
    if (res?.success) refetch?.();
    else if (res?.error) setError(res.error.message);
  };

  return (
    <Box {...lightCardStyle} p={4}>
      <VStack align="stretch" spacing={3}>
        <HStack justify="space-between">
          <Text fontWeight="semibold" color="warmGray.900">
            Vouches for {subject?.name || 'this role'}
          </Text>
          {progress.met && <Badge colorScheme="green">Qualified</Badge>}
        </HStack>

        <Box>
          <Progress
            value={progress.quorum ? (progress.count / progress.quorum) * 100 : 0}
            size="sm"
            colorScheme={progress.met ? 'green' : 'coral'}
            borderRadius="full"
          />
          <Text fontSize="sm" color="warmGray.600" mt={1}>{progressCopy}</Text>
          {progress.stale > 0 && (
            <Text fontSize="xs" color="warmGray.500">
              {progress.stale} earlier vouch{progress.stale === 1 ? '' : 'es'} no longer count — the
              role’s vouches were reset.
            </Text>
          )}
        </Box>

        {error && (
          <Alert status="error" borderRadius="md" fontSize="sm">
            <AlertIcon />{error}
          </Alert>
        )}

        <VStack align="stretch" spacing={1}>
          {records.filter((r) => r.active).map((r) => (
            <HStack key={r.id} justify="space-between">
              <UserIdentity address={r.voucher} usernameHint={r.voucherUsername} size="xs" />
              {r.seeded && (
                <Tooltip label="Carried over from the org's previous roles system.">
                  <Badge fontSize="0.6rem" colorScheme="gray">carried over</Badge>
                </Tooltip>
              )}
            </HStack>
          ))}
          {records.length === 0 && (
            <Text fontSize="sm" color="warmGray.500">Nobody has vouched yet.</Text>
          )}
        </VStack>

        {viewerHasVouched ? (
          <Button
            size="sm"
            variant="outline"
            isLoading={isBusy(`revoke:${subjectId}:${user}`)}
            onClick={() => run(revokeVouch)}
          >
            Take back my vouch
          </Button>
        ) : (
          <Tooltip isDisabled={vouchGate.can} label={vouchGate.reason || ''}>
            <Box>
              <Button
                size="sm"
                colorScheme="coral"
                w="full"
                isDisabled={!vouchGate.can}
                isLoading={isBusy(`vouch:${subjectId}:${user}`)}
                onClick={() => run(vouch)}
              >
                Vouch for them
              </Button>
            </Box>
          </Tooltip>
        )}

        {!vouchGate.can && vouchGate.reason && (
          <Text fontSize="xs" color="warmGray.500">{vouchGate.reason}</Text>
        )}
      </VStack>
    </Box>
  );
}
