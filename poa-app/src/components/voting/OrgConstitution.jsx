/**
 * OrgConstitution — "Our rules".
 *
 * The mission claim is that each group picks its own rules, but those rules are
 * invisible on the voting surface today. This collapsible dark-glass panel makes
 * them legible and puts a change proposal one click away.
 *
 * Sections:
 *   HOW WE DECIDE        — one row per active voting class (label + slice +
 *                          quadratic + min-balance), plus the Direct-democracy
 *                          poll track.
 *   WHAT IT TAKES TO PASS— binding votes + polls, each with support-to-pass and
 *                          quorum phrased with the same fraction-of-members copy
 *                          the live meters use.
 *   WHO CAN OPEN A VOTE  — the group's actual creator roles, named. The two
 *                          creator sets come from useVoteCreateGate — the SAME
 *                          arrays that enable the Create-vote button, so the
 *                          rule and the affordance can never disagree.
 *                          describeVoteOpenRights (src/lib/voting) owns every
 *                          branch; this file only maps icon keys to components.
 *                          On an access-v2 org those arrays are SUBJECT ids, so
 *                          the role list and names come from useRoleNames (the
 *                          authority's roles) rather than POContext's legacy
 *                          Hats list, which froze at cutover and can name
 *                          nothing created since.
 *
 * That section used to guess ("polls are open more widely") and then apologise
 * for guessing ("creator roles set at deployment may not be listed"). Both were
 * wrong: across every live group the poll set is equal to or NARROWER than the
 * binding set — never wider — and the deploy-time creator hats the caveat
 * hedged about have been indexed since subgraph-pop #186. Nothing here states a
 * relationship between the two tracks; it renders both and lets them speak.
 *
 * Each rule row exposes "Propose a change" (creators only) wired to the matching
 * setter template via onProposeRuleChange(templateId, templateValues).
 *
 * Glass: parent position=relative + zIndex + <GlassBack /> child (never bare
 * glassLayerStyle, never backdrop-filter).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Badge,
  Button,
  Icon,
  Collapse,
  Divider,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import {
  PiScales,
  PiUsers,
  PiChartBar,
  PiSquareHalfFill,
  PiGavel,
  PiPencilSimpleLine,
  PiKey,
  PiLockKey,
  PiHourglass,
  PiWarningCircle,
} from 'react-icons/pi';
import GlassBack from './GlassBack';
import { useVotingContext } from '@/context/VotingContext';
import { usePOContext } from '@/context/POContext';
import { useRoleNames } from '@/hooks';
import {
  classLabel,
  sliceBadge,
  passRuleCopy,
} from '@/config/votingVocabulary';
import { describeVoteOpenRights } from '@/lib/voting/voteOpenRights';
import { getAvailableTemplateById } from '@/lib/voting/setterAvailability';
import { useOrgAuthority } from '@/hooks/accessV2/useOrgAuthority';
import { VOTE_PALETTE } from './votingDisplay';

const { amethyst, leaderText, amethystSoft, amethystBorder } = VOTE_PALETTE;

/** Setter templates keyed to each editable rule. */
const TEMPLATE = {
  thresholdHybrid: 'change-threshold-hybrid',
  thresholdDD: 'change-threshold-dd',
  quorumHybrid: 'change-quorum-hybrid',
  quorumDD: 'change-quorum-dd',
  split: 'change-voting-split',
};

/** Format a wei-denominated (18-decimal) min balance to a plain share count. */
function formatMinShares(minBalanceWei) {
  try {
    const wei = BigInt(minBalanceWei || '0');
    if (wei <= 0n) return null;
    // Whole-share display — voting classes use round share minimums in practice.
    const shares = wei / 10n ** 18n;
    return shares > 0n ? shares.toString() : '<1';
  } catch {
    return null;
  }
}

/**
 * Small "Propose a change" affordance shown on editable rule rows.
 *
 * `templateValues` prefills inputs the template gives no default (the
 * direct-democracy permission setter writes either the voting list or the
 * creator list and picks neither on its own).
 */
function ProposeChange({
  templateId,
  templateValues = null,
  canPropose,
  onProposeRuleChange,
  label = 'Propose a change',
}) {
  // On a cut-over org the creator-hat / project-mask templates write tables the
  // contracts no longer read — their rows must not offer a vote that would pass
  // and change nothing. Legacy orgs see every row exactly as before.
  const authority = useOrgAuthority();
  const available = Boolean(
    templateId && getAvailableTemplateById(templateId, { authorityEnabled: authority.enabled })
  );
  if (!canPropose || !onProposeRuleChange || !templateId || !available) return null;
  return (
    <Button
      size="xs"
      variant="ghost"
      minH="32px"
      color={leaderText}
      leftIcon={<Icon as={PiPencilSimpleLine} boxSize={3.5} />}
      _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
      onClick={() => onProposeRuleChange(templateId, templateValues)}
      flexShrink={0}
    >
      {label}
    </Button>
  );
}

/** Icon key from describeVoteOpenRights → component. */
const OPEN_RIGHTS_ICON = {
  both: PiKey,
  binding: PiGavel,
  poll: PiUsers,
  closed: PiLockKey,
  pending: PiHourglass,
  failed: PiWarningCircle,
};

/** Icon for a voting class by strategy + quadratic. */
function classIcon(cls) {
  if (cls.strategy === 'DIRECT') return PiUsers;
  return cls.quadratic ? PiSquareHalfFill : PiChartBar;
}

/** One row in a section: label/detail on the left, badges + propose on the right. */
function RuleRow({ icon, title, detail, badges = [], right = null, children }) {
  return (
    <Flex
      align="flex-start"
      justify="space-between"
      gap={3}
      py={3}
      px={{ base: 3, md: 4 }}
      borderRadius="lg"
      bg="whiteAlpha.50"
      border="1px solid"
      borderColor="whiteAlpha.100"
      flexWrap="wrap"
    >
      <HStack align="flex-start" spacing={3} flex="1" minW="200px">
        {icon && <Icon as={icon} boxSize={5} color={amethyst} mt={0.5} />}
        <VStack align="start" spacing={1} minW={0}>
          <HStack spacing={2} flexWrap="wrap">
            <Text fontSize="sm" fontWeight="700" color="white">
              {title}
            </Text>
            {badges.map((b, i) => (
              <Badge
                key={i}
                fontSize="2xs"
                px={1.5}
                py={0.5}
                borderRadius="md"
                bg={amethystSoft}
                color={leaderText}
                border="1px solid"
                borderColor={amethystBorder}
                textTransform="none"
                fontWeight="600"
              >
                {b}
              </Badge>
            ))}
          </HStack>
          {detail && (
            <Text fontSize="xs" color="gray.300" lineHeight="1.5">
              {detail}
            </Text>
          )}
          {children}
        </VStack>
      </HStack>
      {right}
    </Flex>
  );
}

/** Uppercase section header. */
function SectionLabel({ icon, children }) {
  return (
    <HStack spacing={2} align="center" pt={1}>
      {icon && <Icon as={icon} boxSize={4} color={leaderText} />}
      <Text
        fontSize="xs"
        fontWeight="800"
        letterSpacing="0.08em"
        color="gray.200"
        textTransform="uppercase"
      >
        {children}
      </Text>
    </HStack>
  );
}

/**
 * @param {Object}  props
 * @param {boolean} props.defaultOpen — /rules renders the panel already open
 * @param {Function} props.onProposeRuleChange — (templateId, templateValues)
 * @param {Object}  props.voteGate — the whole useVoteCreateGate result, so the
 *   rule rows and the Create-vote button are driven by one read
 */
export function OrgConstitution({
  defaultOpen = false,
  onProposeRuleChange,
  voteGate = {},
}) {
  const {
    votingClasses,
    hybridThresholdPct,
    hybridQuorum,
    ddThresholdPct,
    ddQuorum,
  } = useVotingContext();
  const { orgId, poMembers } = usePOContext();
  // The role list and names come from useRoleNames, not straight from POContext: on an
  // access-v2 org useVoteCreateGate returns SUBJECT ids, and POContext's frozen legacy Hats list
  // cannot name a role created after cutover — the section would count it as "1 more role"
  // instead of naming it. On a legacy org these are POContext's own values, unchanged.
  const { getRoleNames, roleHatIds, roleNamesById } = useRoleNames();

  // undefined = not yet resolved from storage. defaultOpen (the /rules page)
  // wins immediately; otherwise remember the member's last choice per-org.
  const [open, setOpen] = useState(defaultOpen ? true : undefined);
  const storageKey = orgId ? `poa:rulesOpen:${orgId}` : null;

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
      return;
    }
    if (!storageKey) {
      setOpen(false);
      return;
    }
    let remembered = false;
    try {
      remembered =
        typeof window !== 'undefined' &&
        window.localStorage.getItem(storageKey) === '1';
    } catch {
      remembered = false;
    }
    setOpen(remembered);
  }, [defaultOpen, storageKey]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* ignore storage failures */
      }
    }
  };

  // Rule changes are setter proposals on HybridVoting, so the propose rows
  // follow the binding-vote creator gate, not bare membership.
  const canPropose = !!voteGate.canCreateProposal;
  const eligible = poMembers || 0;

  // Who may open each track — computed, never assumed. See voteOpenRights.js.
  const openRights = useMemo(() => describeVoteOpenRights({
    bindingHatIds: voteGate.bindingCreatorHatIds,
    pollHatIds: voteGate.pollCreatorHatIds,
    roleHatIds,
    roleNames: roleNamesById,
    hasBinding: voteGate.hasBinding,
    hasPolls: voteGate.hasPolls,
    settled: voteGate.creatorGateSettled,
    bindingFailed: voteGate.bindingReadFailed,
    pollFailed: voteGate.pollReadFailed,
    canOpenBinding: voteGate.canCreateProposal,
    canOpenPoll: voteGate.canCreatePoll,
    isMember: voteGate.isMember,
  }), [voteGate, roleHatIds, roleNamesById]);

  // Resolve DIRECT-class gating hats to role names for a specific label.
  const classRows = useMemo(() => {
    return (votingClasses || []).map((cls) => {
      const roleNames =
        cls.strategy === 'DIRECT' ? getRoleNames(cls.hatIds || []) : [];
      return { cls, roleNames };
    });
  }, [votingClasses, getRoleNames]);

  const hasClasses = classRows.length > 0;
  const isOpen = open === true;

  return (
    <Box
      id="our-rules"
      position="relative"
      zIndex={1}
      borderRadius="3xl"
      w="100%"
      maxW="1400px"
      mx="auto"
      mb={8}
      boxShadow="lg"
      overflow="hidden"
    >
      <GlassBack />

      {/* Header — always visible, click to expand/collapse. */}
      <Flex
        as="button"
        type="button"
        onClick={toggle}
        align="center"
        justify="space-between"
        gap={3}
        w="100%"
        textAlign="left"
        p={{ base: 4, md: 6 }}
        aria-expanded={isOpen}
      >
        <HStack spacing={3} align="center">
          <Icon as={PiScales} boxSize={6} color={amethyst} />
          <VStack align="start" spacing={0}>
            <Text fontSize="lg" fontWeight="800" color="white">
              Our rules
            </Text>
            <Text fontSize="xs" color="gray.300">
              How this group decides — and what it takes to change it.
            </Text>
          </VStack>
        </HStack>
        <Icon
          as={isOpen ? ChevronUpIcon : ChevronDownIcon}
          boxSize={6}
          color="gray.300"
        />
      </Flex>

      <Collapse in={isOpen} animateOpacity>
        <Box px={{ base: 4, md: 6 }} pb={{ base: 5, md: 7 }}>
          <VStack align="stretch" spacing={5}>
            <Divider borderColor="whiteAlpha.200" />

            {/* ── HOW WE DECIDE ── */}
            <VStack align="stretch" spacing={3}>
              <Flex justify="space-between" align="center" gap={2} flexWrap="wrap">
                <SectionLabel icon={PiScales}>How we decide</SectionLabel>
                {hasClasses && (
                  <ProposeChange
                    templateId={TEMPLATE.split}
                    canPropose={canPropose}
                    onProposeRuleChange={onProposeRuleChange}
                  />
                )}
              </Flex>

              {hasClasses ? (
                classRows.map(({ cls, roleNames }) => {
                  const minShares = formatMinShares(cls.minBalance);
                  const badges = [sliceBadge(cls.slicePct)];
                  if (cls.quadratic) badges.push('quadratic');
                  return (
                    <RuleRow
                      key={cls.classIndex}
                      icon={classIcon(cls)}
                      title={classLabel(cls, roleNames)}
                      badges={badges}
                      detail={
                        minShares
                          ? `Needs ≥ ${minShares} shares to count`
                          : undefined
                      }
                    />
                  );
                })
              ) : (
                <RuleRow
                  icon={PiUsers}
                  title="Every member counts equally"
                  detail="This group decides binding votes one person, one vote."
                />
              )}

              {/* Direct-democracy poll track. */}
              <RuleRow
                icon={PiUsers}
                title="Polls — every member counts equally"
                badges={['One person, one vote']}
                detail="Polls gauge sentiment before anything binds. Everyone's vote weighs the same."
              />
            </VStack>

            <Divider borderColor="whiteAlpha.200" />

            {/* ── WHAT IT TAKES TO PASS ── */}
            <VStack align="stretch" spacing={3}>
              <SectionLabel icon={PiGavel}>What it takes to pass</SectionLabel>

              {/* Binding votes (Blended). Support + quorum, each proposable. */}
              <RuleRow
                icon={PiGavel}
                title="Binding votes"
                detail={passRuleCopy({
                  thresholdPct: hybridThresholdPct,
                  quorum: hybridQuorum,
                  eligible,
                })}
                right={
                  <VStack align="end" spacing={1} flexShrink={0}>
                    <ProposeChange
                      templateId={TEMPLATE.thresholdHybrid}
                      canPropose={canPropose}
                      onProposeRuleChange={onProposeRuleChange}
                      label="Change support"
                    />
                    <ProposeChange
                      templateId={TEMPLATE.quorumHybrid}
                      canPropose={canPropose}
                      onProposeRuleChange={onProposeRuleChange}
                      label="Change quorum"
                    />
                  </VStack>
                }
              />

              {/* Polls (Direct democracy). */}
              <RuleRow
                icon={PiUsers}
                title="Polls"
                detail={passRuleCopy({
                  thresholdPct: ddThresholdPct,
                  quorum: ddQuorum,
                  eligible,
                })}
                right={
                  <VStack align="end" spacing={1} flexShrink={0}>
                    <ProposeChange
                      templateId={TEMPLATE.thresholdDD}
                      canPropose={canPropose}
                      onProposeRuleChange={onProposeRuleChange}
                      label="Change support"
                    />
                    <ProposeChange
                      templateId={TEMPLATE.quorumDD}
                      canPropose={canPropose}
                      onProposeRuleChange={onProposeRuleChange}
                      label="Change quorum"
                    />
                  </VStack>
                }
              />
            </VStack>

            {/* ── WHO CAN OPEN A VOTE ── (the org's real creator hats) */}
            {openRights.rows.length > 0 && (
              <>
                <Divider borderColor="whiteAlpha.200" />

                <VStack align="stretch" spacing={3}>
                  <SectionLabel icon={PiKey}>Who can open a vote</SectionLabel>

                  {openRights.rows.map((row) => (
                    <RuleRow
                      key={row.key}
                      icon={OPEN_RIGHTS_ICON[row.icon] || PiKey}
                      title={row.title}
                      badges={row.badges}
                      detail={row.detail}
                      right={row.actions.length > 0 ? (
                        <VStack align="end" spacing={1} flexShrink={0}>
                          {row.actions.map((action) => (
                            <ProposeChange
                              key={action.templateId}
                              templateId={action.templateId}
                              templateValues={action.templateValues}
                              canPropose={canPropose}
                              onProposeRuleChange={onProposeRuleChange}
                              {...(action.label ? { label: action.label } : {})}
                            />
                          ))}
                        </VStack>
                      ) : null}
                    >
                      {/* Answers "is that me?" out loud — an absent chip reads
                          the same to an excluded member and to a visitor. */}
                      {row.youLine && (
                        <Text fontSize="xs" color="gray.400" lineHeight="1.5">
                          {row.youLine}
                        </Text>
                      )}
                    </RuleRow>
                  ))}

                  {openRights.note && (
                    <Text fontSize="xs" color="gray.400" px={1} lineHeight="1.6">
                      {openRights.note}
                    </Text>
                  )}
                </VStack>
              </>
            )}
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
}

export default OrgConstitution;
