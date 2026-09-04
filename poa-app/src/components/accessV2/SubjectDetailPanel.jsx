/**
 * SubjectDetailPanel — one role or group in full.
 *
 * ROLE: its members with the SOURCE each one qualifies through, its permissions, its delegation,
 * its vouch config, and the pending actions in its review window.
 * GROUP: its member roles, the permissions it shares, and the derived roster — plus the
 * change-once-affects-all message, stated before anyone edits anything.
 *
 * Every member line carries the SOURCE badge from the fold mirror, because "why is this person in
 * this role" is the question the removal flow answers with: a member held only by the open default
 * cannot be soft-removed at all, and one held by a sticky governance grant cannot be removed by a
 * manager even with a ban. Showing the source here is what stops that being a surprise later.
 */

import React, { useMemo, useState } from 'react';
import {
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerCloseButton,
  VStack,
  HStack,
  Text,
  Badge,
  Box,
  Divider,
  Tag,
  Wrap,
  WrapItem,
  Alert,
  AlertIcon,
  Button,
  Tooltip,
} from '@chakra-ui/react';
import UserIdentity from '@/components/common/UserIdentity';
import { lightCardStyle } from '@/components/shared/glassStyles';
import { useAuthorityMemberships, usePendingActions, useAuthorityActions, useVouchCandidates } from '@/hooks/accessV2';
import SubjectVouchPanel from './SubjectVouchPanel';
import { eligibilityCopy } from '@/lib/accessV2/memberships';
import { managerConfigSummary, formatCountdown } from '@/lib/accessV2/pendingActions';
import { groupChangeBlastRadius } from '@/lib/accessV2/subjects';
import { permKeyName, taskPermLabels, foldTag, FOLD_TAG } from '@/lib/accessV2/permKeys';
import { PERM_CATALOGUE } from '@/lib/accessV2/permKeys';

const CATALOGUE_BY_ID = PERM_CATALOGUE.reduce((acc, e) => { acc[e.id] = e; return acc; }, {});

function PermRowLine({ row }) {
  const name = permKeyName(row.permKey);
  const entry = CATALOGUE_BY_ID[name];
  const isMask = foldTag(row.permKey) === FOLD_TAG.OR_MASK;
  return (
    <HStack justify="space-between" fontSize="sm">
      <Text color="warmGray.700">{entry?.label || name || 'Unknown permission'}</Text>
      <HStack spacing={2}>
        {isMask && <Text color="warmGray.500" fontSize="xs">{taskPermLabels(row.value).join(', ') || 'none'}</Text>}
        {!row.isGlobalCtx && <Badge colorScheme="blue" fontSize="0.6rem">this project only</Badge>}
        {!row.isGlobalCtx && row.inheritGlobal && (
          <Tooltip label="Adds to what this role already gets org-wide, instead of replacing it.">
            <Badge colorScheme="gray" fontSize="0.6rem">+ org-wide</Badge>
          </Tooltip>
        )}
      </HStack>
    </HStack>
  );
}

function MemberLine({ membership }) {
  const copy = eligibilityCopy(membership.eligibilitySource);
  return (
    <HStack justify="space-between" py={1}>
      <UserIdentity address={membership.user} usernameHint={membership.username} />
      <Tooltip label={copy.memberWhy}>
        <Badge colorScheme={membership.rule?.sticky ? 'purple' : 'gray'} fontSize="0.65rem">
          {membership.rule?.sticky ? 'Locked to a vote' : copy.memberBadge || copy.badge}
        </Badge>
      </Tooltip>
    </HStack>
  );
}

export default function SubjectDetailPanel({ subject, isOpen, onClose }) {
  const { membersOf, groupMembers, memberships } = useAuthorityMemberships();
  const { forSubject } = usePendingActions();
  const { cancel, finalize, isBusy, paused } = useAuthorityActions();
  const { candidatesFor } = useVouchCandidates();
  const [error, setError] = useState(null);

  const rows = useMemo(() => {
    if (!subject) return [];
    if (!subject.isGroup) return membersOf(subject.subjectId);
    // Groups have no acceptance of their own — the roster is derived from the member roles.
    const addrs = new Set(groupMembers.get(subject.subjectId) || []);
    const seen = new Set();
    return (memberships || []).filter((m) => {
      if (!m.isMember || !addrs.has(m.user) || seen.has(m.user)) return false;
      seen.add(m.user);
      return true;
    });
  }, [subject, membersOf, groupMembers, memberships]);

  const pending = subject ? forSubject(subject.subjectId) : [];

  if (!subject) return null;

  return (
    <Drawer isOpen={isOpen} placement="right" size="md" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent bg="white">
        <DrawerCloseButton />
        <DrawerHeader>
          <VStack align="start" spacing={1}>
            <HStack>
              <Text color="warmGray.900">{subject.name || 'Untitled'}</Text>
              {subject.isGroup && <Badge colorScheme="purple">Group</Badge>}
              {subject.isOpen && <Badge colorScheme="green">Open</Badge>}
            </HStack>
            <Text fontSize="xs" color="warmGray.500" fontWeight="normal">
              {subject.isGroup
                ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'} through ${subject.memberRoles?.length || 0} role${(subject.memberRoles?.length || 0) === 1 ? '' : 's'}`
                : subject.unlimitedSeats
                  ? `${rows.length} member${rows.length === 1 ? '' : 's'}`
                  : `${rows.length} of ${subject.maxMembers} seats`}
            </Text>
          </VStack>
        </DrawerHeader>

        <DrawerBody>
          <VStack align="stretch" spacing={5} pb={8}>
            {error && (
              <Alert status="error" borderRadius="md" fontSize="sm">
                <AlertIcon />{error}
              </Alert>
            )}

            {subject.isGroup && (
              <Alert status="info" borderRadius="md" fontSize="sm">
                <AlertIcon />
                {groupChangeBlastRadius(subject)}
              </Alert>
            )}

            {subject.isGroup && (
              <Box>
                <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase" mb={2}>
                  Roles in this group
                </Text>
                <Wrap>
                  {(subject.memberRoles || []).map((r) => (
                    <WrapItem key={r.subjectId}>
                      <Tag colorScheme="coral" variant="subtle">{r.name}</Tag>
                    </WrapItem>
                  ))}
                  {(subject.memberRoles || []).length === 0 && (
                    <Text fontSize="sm" color="warmGray.500">None yet.</Text>
                  )}
                </Wrap>
              </Box>
            )}

            {!subject.isGroup && (subject.groups || []).length > 0 && (
              <Box>
                <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase" mb={2}>
                  In these groups
                </Text>
                <Wrap>
                  {subject.groups.map((g) => (
                    <WrapItem key={g.subjectId}>
                      <Tag colorScheme="purple" variant="subtle">{g.name}</Tag>
                    </WrapItem>
                  ))}
                </Wrap>
                <Text fontSize="xs" color="warmGray.500" mt={1}>
                  It also gets everything those groups give.
                </Text>
              </Box>
            )}

            <Box>
              <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase" mb={2}>
                Permissions
              </Text>
              <VStack align="stretch" spacing={1}>
                {(subject.permRows || []).filter((r) => r.exists).map((r) => (
                  <PermRowLine key={r.id} row={r} />
                ))}
                {(subject.permRows || []).filter((r) => r.exists).length === 0 && (
                  <Text fontSize="sm" color="warmGray.500">
                    {subject.isGroup ? 'This group gives nothing yet.' : 'No permissions of its own.'}
                  </Text>
                )}
              </VStack>
            </Box>

            {!subject.isGroup && (
              <>
                <Divider borderColor="warmGray.100" />
                <Box>
                  <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase" mb={2}>
                    Who can change the members
                  </Text>
                  <Text fontSize="sm" color="warmGray.700">
                    {managerConfigSummary(subject.managerConfig)}
                  </Text>
                </Box>

                {subject.vouchConfig?.enabled && (
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase" mb={2}>
                      Vouching
                    </Text>
                    <Text fontSize="sm" color="warmGray.700" mb={3}>
                      Needs {subject.vouchConfig.quorum} vouch
                      {subject.vouchConfig.quorum === 1 ? '' : 'es'} from
                      {' '}
                      {subject.vouchConfig.selfVouching
                        ? 'existing members of this role'
                        : subject.vouchConfig.voucherSubjectName || 'the designated role'}.
                    </Text>
                    {/* People partway to the quorum are invisible in the membership query — they
                        are neither a member nor claimable yet — so their vouch records are the
                        only trace of them. */}
                    <VStack align="stretch" spacing={3}>
                      {candidatesFor(subject.subjectId).map((c) => (
                        <SubjectVouchPanel key={c.user} subjectId={subject.subjectId} user={c.user} />
                      ))}
                    </VStack>
                  </Box>
                )}
              </>
            )}

            {pending.length > 0 && (
              <>
                <Divider borderColor="warmGray.100" />
                <Box>
                  <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase" mb={2}>
                    In the review window
                  </Text>
                  <VStack align="stretch" spacing={2}>
                    {pending.map((p) => (
                      <Box key={p.id} {...lightCardStyle} p={3}>
                        <Text fontSize="sm" fontWeight="medium" color="warmGray.900">{p.copy?.title}</Text>
                        <Text fontSize="xs" color="warmGray.600">{p.copy?.body}</Text>
                        <HStack mt={2} spacing={2}>
                          {p.action !== 'Offer' && p.secondsRemaining === 0 && (
                            <Button
                              size="xs"
                              colorScheme="coral"
                              isDisabled={paused}
                              isLoading={isBusy(`finalize:${p.pendingId}`)}
                              onClick={async () => {
                                const r = await finalize(p.pendingId);
                                if (!r?.success && r?.error) setError(r.error.message);
                              }}
                            >
                              Apply now
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="ghost"
                            isDisabled={paused}
                            isLoading={isBusy(`cancel:${p.pendingId}`)}
                            onClick={async () => {
                              const r = await cancel(p.pendingId);
                              if (!r?.success && r?.error) setError(r.error.message);
                            }}
                          >
                            Cancel
                          </Button>
                          {p.secondsRemaining > 0 && (
                            <Text fontSize="xs" color="warmGray.500">
                              {formatCountdown(p.secondsRemaining)} left
                            </Text>
                          )}
                        </HStack>
                      </Box>
                    ))}
                  </VStack>
                </Box>
              </>
            )}

            <Divider borderColor="warmGray.100" />
            <Box>
              <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase" mb={2}>
                {subject.isGroup ? 'People in this group' : 'Members'}
              </Text>
              <VStack align="stretch" spacing={0} divider={<Divider borderColor="warmGray.50" />}>
                {rows.map((m) => <MemberLine key={m.id} membership={m} />)}
                {rows.length === 0 && <Text fontSize="sm" color="warmGray.500">Nobody yet.</Text>}
              </VStack>
            </Box>
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
