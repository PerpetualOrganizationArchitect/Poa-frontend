/**
 * DeploymentPreviewModal — the last screen before an organization is created.
 *
 * Everything shown here is derived from `params`, the exact payload that will be
 * signed, so this is a real preview rather than a re-render of wizard state. But it
 * is written for the person launching a community, not for someone reading a struct:
 * contract names, hex addresses and protocol vocabulary live behind "Technical
 * details" for the people who want them, and the default view answers "what am I
 * about to make?" in plain language.
 */

import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  Text,
  VStack,
  HStack,
  Box,
  Divider,
  SimpleGrid,
  Icon,
  Tag,
  Collapse,
  useDisclosure,
} from '@chakra-ui/react';
import { PiCheckCircle, PiCaretDown, PiCaretUp } from 'react-icons/pi';
import { TaskPermission, hasPermission } from '@/util/permissions';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';

const MASK_LABELS = [
  { bit: TaskPermission.CREATE, label: 'Create tasks' },
  { bit: TaskPermission.CLAIM, label: 'Claim tasks' },
  { bit: TaskPermission.REVIEW, label: 'Review work' },
  { bit: TaskPermission.ASSIGN, label: 'Assign work' },
  { bit: TaskPermission.SELF_REVIEW, label: 'Review own work' },
  { bit: TaskPermission.BUDGET, label: 'Set budgets' },
  { bit: TaskPermission.EDIT_META, label: 'Edit details' },
  { bit: TaskPermission.EDIT_FULL, label: 'Edit anything' },
];

const PREDICTED_MODULES = [
  ['executor', 'Executor'],
  ['hybridVoting', 'Hybrid Voting'],
  ['directDemocracyVoting', 'Direct Democracy'],
  ['quickJoin', 'Quick Join'],
  ['participationToken', 'Participation Token'],
  ['taskManager', 'Task Manager'],
  ['educationHub', 'Education Hub'],
  ['paymentManager', 'Payment Manager'],
  ['eligibilityModule', 'Eligibility'],
  ['zkEmailInvites', 'Email Invites'],
];

const short = (a) => (a && typeof a === 'string' && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const toNum = (v) => {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (v.toNumber) { try { return v.toNumber(); } catch { return Number(v.toString()); } }
  return Number(v.toString());
};
const isZeroAddr = (a) => !a || /^0x0+$/.test(a);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** A labelled line in the plain-language summary. */
function Line({ label, children }) {
  return (
    <HStack justify="space-between" align="start" spacing={6}>
      <Text fontSize="sm" color="warmGray.500" flexShrink={0}>{label}</Text>
      <Box flex="1" textAlign="right"><Text fontSize="sm" color="warmGray.800">{children}</Text></Box>
    </HStack>
  );
}

function Section({ title, children }) {
  return (
    <Box>
      <Text fontSize="xs" fontWeight="700" color="warmGray.400" textTransform="uppercase" letterSpacing="wide" mb={2}>
        {title}
      </Text>
      <VStack align="stretch" spacing={1.5}>{children}</VStack>
    </Box>
  );
}

/**
 * Describe the voting split the way a member would experience it, rather than as
 * "N voting classes". Strategy 0 = one vote per member; 1 = weighted by shares.
 */
function describeVoting(classes, tokenWord) {
  // "Shares" is ours to lowercase mid-sentence; a founder's ticker (COMFY) is not.
  const asset = tokenWord === DEFAULT_TOKEN_LABEL ? tokenWord.toLowerCase() : tokenWord;
  const list = (classes || []).map((c) => ({ strategy: toNum(c.strategy), slice: toNum(c.slicePct) }));
  if (list.length === 0) return 'Not configured';
  if (list.length === 1) {
    return list[0].strategy === 0 ? 'Everyone gets one equal vote' : `Voting power follows ${asset}`;
  }
  const direct = list.filter((c) => c.strategy === 0).reduce((n, c) => n + c.slice, 0);
  const weighted = list.filter((c) => c.strategy !== 0).reduce((n, c) => n + c.slice, 0);
  if (direct && weighted) {
    return `${direct}% one-person-one-vote, ${weighted}% weighted by ${asset}`;
  }
  return `${plural(list.length, 'voting group', 'voting groups')}`;
}

export function DeploymentPreviewModal({ data, onConfirm, onCancel }) {
  const tech = useDisclosure();
  const isOpen = !!data;
  if (!isOpen) return null;

  const { orgName, isPasskey, deployerAddress, networkName, nativeSymbol, fundingEth, params, predicted } = data;
  const roles = params?.roles || [];
  const tmp = params?.taskManagerPerms || { roleIndices: [], masks: [] };
  const tmpEntries = (tmp.roleIndices || []).map((ri, i) => ({
    roleIndex: toNum(ri),
    mask: toNum(tmp.masks?.[i]),
  }));
  const projects = params?.bootstrap?.projects || [];
  const tasks = params?.bootstrap?.tasks || [];

  const metaAdminIdx = toNum(params?.metadataAdminRoleIndex);
  const metaAdminLabel = Number.isFinite(metaAdminIdx) && metaAdminIdx < roles.length
    ? roles[metaAdminIdx]?.name || `Role ${metaAdminIdx}`
    : 'Only by a vote';

  // The org's contribution asset. The app calls it "Shares" unless the founder
  // chose a ticker of their own (see util/tokenLabel).
  const tokenWord = params?.tokenSymbol?.trim() || DEFAULT_TOKEN_LABEL;

  const hybridQuorum = toNum(params?.hybridQuorum) || 0;
  const ddQuorum = toNum(params?.ddQuorum) || 0;
  const threshold = toNum(params?.hybridThresholdPct);

  // `predicted` comes from the dry run, so a non-zero address is the authoritative
  // answer to "will this module actually exist?" — better than the wizard's toggle.
  const hasEducation = !isZeroAddr(predicted?.educationHub);
  const hasEmailInvites = !isZeroAddr(predicted?.zkEmailInvites);
  const vouchedRoles = roles.filter((r) => r.vouching?.enabled).map((r) => r.name);
  const fundsGas = Number(fundingEth) > 0;

  return (
    // zIndex must clear the ReviewStep DeploymentOverlay (zIndex 9999), which is
    // visible while this modal awaits confirmation — otherwise it intercepts the
    // Confirm/Cancel clicks and the deploy hangs.
    <Modal isOpen={isOpen} onClose={onCancel} size="xl" scrollBehavior="inside" isCentered>
      <ModalOverlay zIndex={10000} />
      <ModalContent containerProps={{ zIndex: 10001 }} borderRadius="2xl">
        <ModalHeader pb={2}>
          <Text fontSize="sm" color="warmGray.500" fontWeight="500">Ready to launch</Text>
          <Text fontSize="2xl" fontWeight="700" color="warmGray.800" lineHeight="short">{orgName}</Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={5}>
            <HStack
              spacing={3}
              align="start"
              bg="green.50"
              borderRadius="lg"
              p={3}
              border="1px solid"
              borderColor="green.100"
            >
              <Icon as={PiCheckCircle} color="green.500" boxSize={5} mt="1px" />
              <Text fontSize="sm" color="green.900">
                We ran your whole setup against {networkName} first, and it worked. Nothing has been
                created yet — that happens when you confirm.
              </Text>
            </HStack>

            <Section title="Your organization">
              <Line label="Lives on">{networkName}</Line>
              <Line label="Founded by">
                you, with {isPasskey ? 'your passkey' : 'your wallet'}
              </Line>
              <Line label="Contributions earn">{tokenWord}</Line>
              {fundsGas && (
                <Line label="Gas">
                  you&apos;re pre-paying {fundingEth}{nativeSymbol ? ` ${nativeSymbol}` : ''} so members
                  don&apos;t have to
                </Line>
              )}
            </Section>

            <Divider />

            <Section title="Who's in it">
              <HStack flexWrap="wrap" spacing={2}>
                {roles.map((r, i) => (
                  <Tag key={i} size="md" borderRadius="full" colorScheme={r.canVote ? 'purple' : 'gray'}>
                    {r.name}
                  </Tag>
                ))}
              </HStack>
              <Text fontSize="xs" color="warmGray.500" pt={1}>
                {plural(roles.filter((r) => r.canVote).length, 'role votes', 'roles vote')} on decisions.
                {vouchedRoles.length === 0
                  ? ' Anyone can join.'
                  : vouchedRoles.length === roles.length
                    ? ' Every role needs existing members to vouch for a newcomer before they can join.'
                    : ` ${vouchedRoles.join(' and ')} ${vouchedRoles.length === 1 ? 'needs' : 'need'} a vouch from existing members; the rest are open to anyone.`}
              </Text>
            </Section>

            <Divider />

            <Section title="How decisions get made">
              <Line label="To pass">
                {Number.isFinite(threshold) ? `${threshold}% of the vote` : 'a majority'}
              </Line>
              <Line label="Voting power">{describeVoting(params?.hybridClasses, tokenWord)}</Line>
              {(hybridQuorum > 0 || ddQuorum > 0) && (
                <Line label="Turnout needed">
                  at least {plural(Math.max(hybridQuorum, ddQuorum), 'person', 'people')} must vote
                </Line>
              )}
              <Line label="Org profile edits">{metaAdminLabel}</Line>
            </Section>

            {(hasEducation || hasEmailInvites || projects.length > 0 || tasks.length > 0 || tmpEntries.length > 0) && (
              <>
                <Divider />
                <Section title="Also set up">
                  {hasEducation && <Line label="Learning">course modules for your members</Line>}
                  {hasEmailInvites && (
                    <Line label="Email invites">
                      ready, but switched off — add addresses in Settings and turn it on with a vote
                    </Line>
                  )}
                  {(projects.length > 0 || tasks.length > 0) && (
                    <Line label="Starting work">
                      {plural(projects.length, 'project', 'projects')}
                      {tasks.length > 0 ? ` and ${plural(tasks.length, 'task', 'tasks')}` : ''}
                    </Line>
                  )}
                  {tmpEntries.map(({ roleIndex, mask }) => (
                    <HStack key={roleIndex} justify="space-between" align="start" spacing={6}>
                      <Text fontSize="sm" color="warmGray.500" flexShrink={0}>
                        {roles[roleIndex]?.name || `Role ${roleIndex}`} can
                      </Text>
                      <HStack flex="1" justify="flex-end" flexWrap="wrap" spacing={1}>
                        {MASK_LABELS.filter((m) => hasPermission(mask, m.bit)).map((m) => (
                          <Tag key={m.label} size="sm" colorScheme="purple" borderRadius="full">{m.label}</Tag>
                        ))}
                      </HStack>
                    </HStack>
                  ))}
                </Section>
              </>
            )}

            {predicted && (
              <Box pt={1}>
                <Button
                  variant="link"
                  size="xs"
                  color="warmGray.500"
                  fontWeight="500"
                  rightIcon={<Icon as={tech.isOpen ? PiCaretUp : PiCaretDown} boxSize={3} />}
                  onClick={tech.onToggle}
                >
                  Technical details
                </Button>
                <Collapse in={tech.isOpen} animateOpacity>
                  <Box mt={3} p={3} bg="warmGray.50" borderRadius="lg">
                    <Text fontSize="xs" color="warmGray.500" mb={2}>
                      The contracts your organization will own, at the addresses the dry run predicted.
                    </Text>
                    <SimpleGrid columns={{ base: 1, sm: 2 }} spacingX={4} spacingY={1}>
                      {PREDICTED_MODULES.map(([key, label]) => {
                        const addr = predicted[key];
                        if (isZeroAddr(addr)) return null;
                        return (
                          <HStack key={key} justify="space-between">
                            <Text fontSize="xs" color="warmGray.500">{label}</Text>
                            <Text fontSize="xs" fontFamily="mono">{short(addr)}</Text>
                          </HStack>
                        );
                      })}
                      <HStack justify="space-between">
                        <Text fontSize="xs" color="warmGray.500">Founder</Text>
                        <Text fontSize="xs" fontFamily="mono">{short(deployerAddress)}</Text>
                      </HStack>
                    </SimpleGrid>
                  </Box>
                </Collapse>
              </Box>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onCancel}>Not yet</Button>
          <Button colorScheme="purple" onClick={onConfirm}>Create {orgName}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default DeploymentPreviewModal;
