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
 *   WHO CAN PROPOSE      — honest partial data: the subgraph under-reports
 *                          creator hats set at initialize, so we never fabricate
 *                          a role list — the caveat line is always shown.
 *
 * Each rule row exposes "Propose a change" (members only) wired to the matching
 * setter template via onProposeRuleChange(templateId).
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

/** Small "Propose a change" affordance shown on editable rule rows. */
function ProposeChange({ templateId, canPropose, onProposeRuleChange, label = 'Propose a change' }) {
  if (!canPropose || !onProposeRuleChange || !templateId) return null;
  return (
    <Button
      size="xs"
      variant="ghost"
      minH="32px"
      color={leaderText}
      leftIcon={<Icon as={PiPencilSimpleLine} boxSize={3.5} />}
      _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
      onClick={() => onProposeRuleChange(templateId)}
      flexShrink={0}
    >
      {label}
    </Button>
  );
}

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

export function OrgConstitution({
  defaultOpen = false,
  onProposeRuleChange,
  hasMemberRole = false,
}) {
  const {
    votingClasses,
    hybridThresholdPct,
    hybridQuorum,
    ddThresholdPct,
    ddQuorum,
  } = useVotingContext();
  const { orgId, poMembers } = usePOContext();
  const { getRoleNames } = useRoleNames();

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

  const canPropose = hasMemberRole;
  const eligible = poMembers || 0;

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

            <Divider borderColor="whiteAlpha.200" />

            {/* ── WHO CAN PROPOSE ── (honest partial data) */}
            <VStack align="stretch" spacing={3}>
              <SectionLabel icon={PiPencilSimpleLine}>Who can propose</SectionLabel>
              <RuleRow
                icon={PiPencilSimpleLine}
                title="Members with a creator role"
                detail="Members holding a proposal-creator role can open binding votes; polls are open more widely."
              />
              <Text fontSize="xs" color="gray.400" fontStyle="italic" px={1}>
                Creator roles set at deployment may not be listed — check with your
                org admin.
              </Text>
            </VStack>
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
}

export default OrgConstitution;
