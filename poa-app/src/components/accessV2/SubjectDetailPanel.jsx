/**
 * SubjectDetailPanel — one role or group, in a centered modal.
 *
 * The design brief: simple, informative, intuitive. Permissions are the part people misread, so
 * they render as plain sentences from the PERM_CATALOGUE, clustered by area (Voting, Tasks,
 * Tokens, …), with a "via <group>" tag whenever a power is inherited rather than the subject's
 * own — the same distinction the permissions matrix draws. Task permissions are one line of
 * action chips, not eight cryptic rows.
 *
 * Every member line still carries its SOURCE badge, because "why is this person in this role" is
 * the question the removal flow answers: a member held only by the open default cannot be
 * soft-removed at all, and one held by a sticky governance grant cannot be removed by a manager
 * even with a ban.
 */

import React, { useMemo, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
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
  Icon,
  SimpleGrid,
} from '@chakra-ui/react';
import { FiCheck } from 'react-icons/fi';
import UserIdentity from '@/components/common/UserIdentity';
import { lightCardStyle } from '@/components/shared/glassStyles';
import { useAuthorityMemberships, usePendingActions, useAuthorityActions, useVouchCandidates } from '@/hooks/accessV2';
import SubjectVouchPanel from './SubjectVouchPanel';
import { eligibilityCopy } from '@/lib/accessV2/memberships';
import { managerConfigSummary, formatCountdown } from '@/lib/accessV2/pendingActions';
import { groupChangeBlastRadius } from '@/lib/accessV2/subjects';
import { PERM_CATALOGUE, PERM_KEYS, TASK_PERM_BITS } from '@/lib/accessV2/permKeys';

/** subjectId -> display name over self + groups, for "via <group>" tags. */
function sourceNames(subject, key) {
  if (typeof subject.permSources !== 'function') return [];
  const names = new Map((subject.groups || []).map((g) => [g.subjectId, g.name]));
  return subject
    .permSources(key)
    .filter((id) => id !== subject.subjectId)
    .map((id) => names.get(id))
    .filter(Boolean);
}

/**
 * The subject's powers as { areaLabel: [{ label, via }] }, plus the task-action chips.
 * Everything reads the FOLDED effective value — what a member can actually do.
 */
function usePowers(subject) {
  return useMemo(() => {
    if (!subject || typeof subject.permEffective !== 'function') {
      return { areas: [], taskActions: null, projectRuleCount: 0 };
    }

    const areas = new Map();
    for (const entry of PERM_CATALOGUE) {
      if (entry.key === PERM_KEYS.TM_PERMS) continue;
      let value = 0n;
      try {
        value = BigInt(subject.permEffective(entry.key) || 0);
      } catch {
        value = 0n;
      }
      if (value === 0n) continue;
      const via = sourceNames(subject, entry.key);
      const list = areas.get(entry.group) || [];
      list.push({ id: entry.id, label: entry.label, via });
      areas.set(entry.group, list);
    }

    let mask = 0n;
    try {
      mask = BigInt(subject.permEffective(PERM_KEYS.TM_PERMS) || 0);
    } catch {
      mask = 0n;
    }
    const taskActions =
      mask === 0n
        ? null
        : {
            labels: TASK_PERM_BITS.filter((b) => (mask & BigInt(b.value)) !== 0n).map((b) => b.label),
            via: sourceNames(subject, PERM_KEYS.TM_PERMS),
          };

    const projectRuleCount = new Set(
      (subject.permRows || []).filter((r) => r.exists && !r.isGlobalCtx).map((r) => r.ctx)
    ).size;

    return { areas: [...areas.entries()], taskActions, projectRuleCount };
  }, [subject]);
}

function ViaTag({ via }) {
  if (!via?.length) return null;
  return (
    <Tooltip label="Inherited: granted to a group this role belongs to, not to the role itself.">
      <Tag size="sm" colorScheme="purple" variant="subtle" flexShrink={0}>
        via {via.join(', ')}
      </Tag>
    </Tooltip>
  );
}

function PowerLine({ label, via }) {
  return (
    <HStack spacing={2} align="baseline">
      <Icon as={FiCheck} color="green.500" boxSize={3.5} alignSelf="center" flexShrink={0} />
      <Text fontSize="sm" color="warmGray.800">{label}</Text>
      <ViaTag via={via} />
    </HStack>
  );
}

function PowersSection({ subject }) {
  const { areas, taskActions, projectRuleCount } = usePowers(subject);
  const empty = areas.length === 0 && !taskActions;

  return (
    <Box>
      <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase" mb={3}>
        {subject.isGroup ? 'What this group grants' : 'What members can do'}
      </Text>

      {empty ? (
        <Text fontSize="sm" color="warmGray.500">
          {subject.isGroup
            ? 'Nothing yet. A permission granted here reaches everyone in all of its roles at once.'
            : (subject.groups || []).length
              ? 'Nothing beyond its groups yet — and those grant nothing so far. A role-edit vote can change that.'
              : 'Nothing yet. A role-edit vote can grant permissions.'}
        </Text>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacingX={6} spacingY={4}>
          {areas.map(([area, entries]) => (
            <Box key={area}>
              <Text fontSize="xs" fontWeight="semibold" color="coral.500" mb={1}>{area}</Text>
              <VStack align="stretch" spacing={1}>
                {entries.map((e) => <PowerLine key={e.id} label={e.label} via={e.via} />)}
              </VStack>
            </Box>
          ))}
          {taskActions && (
            <Box>
              <HStack spacing={2} mb={1}>
                <Text fontSize="xs" fontWeight="semibold" color="coral.500">Tasks</Text>
                <ViaTag via={taskActions.via} />
              </HStack>
              <Wrap spacing={1}>
                {taskActions.labels.map((l) => (
                  <WrapItem key={l}>
                    <Tag size="sm" variant="subtle" colorScheme="green">{l}</Tag>
                  </WrapItem>
                ))}
              </Wrap>
              {projectRuleCount > 0 && (
                <Text fontSize="xs" color="warmGray.500" mt={1}>
                  {projectRuleCount === 1
                    ? 'One project sets its own task rules for this role.'
                    : `${projectRuleCount} projects set their own task rules for this role.`}
                </Text>
              )}
            </Box>
          )}
        </SimpleGrid>
      )}
    </Box>
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

  const roleCount = subject.memberRoles?.length || 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size={{ base: 'full', md: '2xl' }} scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="white" borderRadius={{ base: 0, md: '2xl' }}>
        <ModalCloseButton />
        <ModalHeader pb={2}>
          <VStack align="start" spacing={1}>
            <HStack>
              <Text color="warmGray.900">{subject.name || 'Untitled'}</Text>
              {subject.isGroup && <Badge colorScheme="purple">Group</Badge>}
              {subject.isOpen && <Badge colorScheme="green">Open</Badge>}
            </HStack>
            <Text fontSize="xs" color="warmGray.500" fontWeight="normal">
              {subject.isGroup
                ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'} through ${roleCount} role${roleCount === 1 ? '' : 's'}`
                : subject.unlimitedSeats
                  ? `${rows.length} member${rows.length === 1 ? '' : 's'}`
                  : `${rows.length} of ${subject.maxMembers} seats`}
            </Text>
          </VStack>
        </ModalHeader>

        <ModalBody pb={8}>
          <VStack align="stretch" spacing={5}>
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

            {subject.isGroup ? (
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
                  {roleCount === 0 && <Text fontSize="sm" color="warmGray.500">None yet.</Text>}
                </Wrap>
              </Box>
            ) : (
              (subject.groups || []).length > 0 && (
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
                    Everything those groups grant is included below.
                  </Text>
                </Box>
              )
            )}

            <Divider borderColor="warmGray.100" />
            <PowersSection subject={subject} />

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
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
