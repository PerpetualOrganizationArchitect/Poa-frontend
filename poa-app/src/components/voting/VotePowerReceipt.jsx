/**
 * VotePowerReceipt — "why your vote counts N%"
 *
 * A compact glass panel that renders the TRUTHFUL per-class breakdown of a
 * member's voting power (from useVotingPower().classBreakdown), one row per
 * active voting class, totaling to a headline share of the decision.
 *
 * Product direction (Hudson): honest power. No fabricated 50/50 default — a
 * skeleton shows until real classes load. Per-option tallies are NOT shown
 * here; this is purely "how much say do I have", which is safe to show
 * pre-vote.
 *
 * Props:
 *   variant           "full" (default) | "compact"  (compact = one-line "Your voice: 8.9% ▸")
 *   restrictedHatIds  optional string[] — when the poll is role-restricted and
 *                     the user holds none of these, render a restriction notice
 *                     instead of a power number.
 */

import React, { useMemo, useState } from 'react';
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Badge,
  Icon,
  Collapse,
  Button,
  Skeleton,
  SkeletonText,
} from '@chakra-ui/react';
import { ChevronRightIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon, CloseIcon } from '@chakra-ui/icons';
import { PiUsers, PiChartBar, PiSquareHalfFill } from 'react-icons/pi';
import GlassBack from './GlassBack';
import { useVotingPower, useRoleNames } from '@/hooks';
import { useUserContext } from '@/context/UserContext';
import { usePOContext } from '@/context/POContext';
import {
  classLabel,
  sliceBadge,
  ineligibleCopy,
  BLENDED_EXPLAINER,
} from '@/config/votingVocabulary';

const AMETHYST = '#9473DC';
const AMETHYST_SOFT = 'rgba(148, 115, 220, 0.14)';
const AMETHYST_BORDER = 'rgba(148, 115, 220, 0.28)';

function normalizeHatId(id) {
  if (id === null || id === undefined) return '';
  const str = String(id).trim();
  if (!str) return '';
  try {
    return BigInt(str).toString();
  } catch {
    return str.toLowerCase();
  }
}

function pct(n) {
  if (n == null || Number.isNaN(n)) return '0%';
  const v = Number(n);
  // Show one decimal for small shares, whole numbers cleanly.
  return `${v.toFixed(1)}%`;
}

/**
 * Build the "your standing" sentence for one class entry.
 */
function standingText(entry) {
  if (!entry.eligible) {
    let minLabel = null;
    if (entry.ineligibleReason === 'below_min_balance') {
      // minBalance is 18-decimal wei; show a rounded share count.
      minLabel = undefined;
    }
    return ineligibleCopy(entry.ineligibleReason, { minLabel });
  }

  if (entry.strategy === 'DIRECT') {
    const holders = entry._holders || 1;
    const share = pct(entry.contributionToTotalPct);
    const approx = entry.approximate ? '~' : '';
    return `you: 1 of ${approx}${holders} equal votes = ${share}`;
  }

  // ERC20_BAL
  const share = pct(entry.contributionToTotalPct);
  const raw = Math.round(entry.userRawPower);
  if (entry.quadratic) {
    return `${raw} share-weight → ${share} of this decision`;
  }
  return `${raw} shares → ${share} of this decision`;
}

function ClassIcon({ entry }) {
  const IconCmp =
    entry.strategy === 'DIRECT'
      ? PiUsers
      : entry.quadratic
      ? PiSquareHalfFill
      : PiChartBar;
  return <Icon as={IconCmp} boxSize={4} color={AMETHYST} opacity={0.9} />;
}

/**
 * One class row.
 */
function ClassRow({ entry }) {
  const label = classLabel(entry, entry.roleNames);
  const eligible = entry.eligible;

  return (
    <Flex
      align="flex-start"
      justify="space-between"
      gap={3}
      py={2.5}
      px={3}
      borderRadius="lg"
      bg={eligible ? AMETHYST_SOFT : 'whiteAlpha.50'}
      border="1px solid"
      borderColor={eligible ? AMETHYST_BORDER : 'whiteAlpha.100'}
      opacity={eligible ? 1 : 0.75}
    >
      <VStack align="start" spacing={1} flex={1} minW={0}>
        <HStack spacing={2} flexWrap="wrap">
          <ClassIcon entry={entry} />
          <Text fontSize="sm" fontWeight="600" color="white" noOfLines={1}>
            {label}
          </Text>
          <Badge
            fontSize="2xs"
            px={1.5}
            py={0.5}
            borderRadius="md"
            bg={AMETHYST_SOFT}
            color="#C6B4F5"
            border="1px solid"
            borderColor={AMETHYST_BORDER}
            textTransform="none"
          >
            {sliceBadge(entry.slicePct)}
          </Badge>
        </HStack>
        <HStack spacing={1.5} align="center">
          {eligible ? (
            <CheckIcon boxSize="10px" color="green.300" />
          ) : (
            <CloseIcon boxSize="9px" color="rose.300" />
          )}
          <Text
            fontSize="xs"
            color={eligible ? 'gray.200' : 'gray.300'}
            fontStyle={eligible ? 'normal' : 'italic'}
          >
            {standingText(entry)}
          </Text>
        </HStack>
      </VStack>
    </Flex>
  );
}

/**
 * Expandable "How Blended voting works" footer.
 */
function HowItWorksFooter({ breakdown }) {
  const [open, setOpen] = useState(false);

  // Build a worked example from the actual classes when possible.
  const example = useMemo(() => {
    if (!breakdown || breakdown.length === 0) return null;
    const direct = breakdown.find((c) => c.strategy === 'DIRECT');
    const token = breakdown.find((c) => c.strategy === 'ERC20_BAL');
    const lines = [];
    if (direct) {
      const holders = direct._holders || 6;
      lines.push(
        `Members (${Math.round(direct.slicePct)}%): 1 of ${holders} equal votes = ${(
          direct.slicePct / holders
        ).toFixed(1)}%`
      );
    }
    if (token) {
      lines.push(
        `Contributors (${Math.round(token.slicePct)}%): your shares as a fraction of all shares${
          token.quadratic ? ', square-root weighted' : ''
        }`
      );
    }
    return lines;
  }, [breakdown]);

  return (
    <Box w="100%">
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setOpen((v) => !v)}
        color="#C6B4F5"
        _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
        rightIcon={open ? <ChevronUpIcon /> : <ChevronDownIcon />}
        fontWeight="500"
      >
        How Blended voting works
      </Button>
      <Collapse in={open} animateOpacity>
        <Box
          mt={2}
          p={3}
          borderRadius="lg"
          bg="whiteAlpha.50"
          border="1px solid"
          borderColor="whiteAlpha.100"
        >
          <VStack align="start" spacing={2}>
            <Text fontSize="xs" color="gray.200" lineHeight="1.5">
              {BLENDED_EXPLAINER}
            </Text>
            {example && example.length > 0 && (
              <VStack align="start" spacing={0.5} pl={1}>
                {example.map((line, i) => (
                  <Text key={i} fontSize="xs" color="#C6B4F5">
                    {line}
                  </Text>
                ))}
              </VStack>
            )}
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * Skeleton state while real classes load.
 */
function ReceiptSkeleton({ variant }) {
  if (variant === 'compact') {
    return <Skeleton height="18px" width="140px" borderRadius="md" />;
  }
  return (
    <Box
      position="relative"
      zIndex={1}
      borderRadius="2xl"
      p={4}
      w="100%"
      overflow="hidden"
    >
      <GlassBack />
      <VStack align="stretch" spacing={3}>
        <Skeleton height="16px" width="180px" />
        <Skeleton height="52px" borderRadius="lg" />
        <Skeleton height="52px" borderRadius="lg" />
        <SkeletonText noOfLines={1} skeletonHeight="3" width="60%" />
      </VStack>
    </Box>
  );
}

/**
 * Restriction notice — user can't vote on this poll.
 */
function RestrictionNotice({ rolesText, variant }) {
  const msg = `You can't vote on this one — it's restricted to ${rolesText}`;
  if (variant === 'compact') {
    return (
      <HStack spacing={1.5}>
        <CloseIcon boxSize="9px" color="rose.300" />
        <Text fontSize="sm" color="gray.200" noOfLines={1}>
          {msg}
        </Text>
      </HStack>
    );
  }
  return (
    <Box position="relative" borderRadius="2xl" p={4} w="100%" overflow="hidden" zIndex={1}>
      <GlassBack />
      <HStack spacing={2} align="center">
        <CloseIcon boxSize="11px" color="rose.300" />
        <Text fontSize="sm" color="gray.100">
          {msg}
        </Text>
      </HStack>
    </Box>
  );
}

export function VotePowerReceipt({ variant = 'full', restrictedHatIds = null, hideExplainer = false }) {
  const {
    classBreakdown,
    totalSharePct,
    breakdownStatus,
    votingType,
    percentOfTotal,
  } = useVotingPower();
  const { getRoleNamesString } = useRoleNames();
  const { userData } = useUserContext();
  const { poMembers } = usePOContext();

  const [compactOpen, setCompactOpen] = useState(false);

  // Per-poll restriction: does the user hold any of the restricted hats?
  const restricted = useMemo(() => {
    if (!restrictedHatIds || restrictedHatIds.length === 0) return false;
    const userSet = new Set((userData?.hatIds || []).map(normalizeHatId));
    const holds = restrictedHatIds.map(normalizeHatId).some((h) => userSet.has(h));
    return !holds;
  }, [restrictedHatIds, userData]);

  if (restricted) {
    const rolesText = getRoleNamesString(restrictedHatIds);
    return <RestrictionNotice rolesText={rolesText} variant={variant} />;
  }

  // Direct-democracy-only orgs: no classes, equal voice for everyone.
  if (votingType && votingType !== 'Hybrid') {
    const memberCount = poMembers || 0;
    const headline =
      memberCount > 0
        ? `Equal voice: 1 of ${memberCount} members = ${pct(100 / memberCount)}`
        : percentOfTotal && percentOfTotal > 0
        ? `Equal voice: your share ${pct(percentOfTotal)}`
        : 'Equal voice — one person, one vote';
    if (variant === 'compact') {
      return (
        <HStack spacing={1.5}>
          <PiUsers color={AMETHYST} />
          <Text fontSize="sm" color="white" fontWeight="600">
            {headline}
          </Text>
        </HStack>
      );
    }
    return (
      <Box position="relative" borderRadius="2xl" p={4} w="100%" overflow="hidden" zIndex={1}>
        <GlassBack />
        <HStack spacing={2}>
          <Icon as={PiUsers} boxSize={4} color={AMETHYST} />
          <Text fontSize="sm" color="white" fontWeight="600">
            {headline}
          </Text>
        </HStack>
        <Text fontSize="xs" color="gray.300" mt={1}>
          Every member has one vote of equal weight.
        </Text>
      </Box>
    );
  }

  // Loading / not yet real classes → skeleton (NEVER a fabricated 50/50).
  if (breakdownStatus === 'loading' || !classBreakdown) {
    return <ReceiptSkeleton variant={variant} />;
  }

  const headlinePct = totalSharePct != null ? pct(totalSharePct) : '—';

  // Compact variant: one line, expandable to the full receipt.
  if (variant === 'compact') {
    return (
      <Box w="100%">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCompactOpen((v) => !v)}
          color="white"
          _hover={{ bg: 'whiteAlpha.100' }}
          rightIcon={compactOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
          fontWeight="600"
          px={2}
        >
          Your voice: {headlinePct}
        </Button>
        <Collapse in={compactOpen} animateOpacity>
          <Box mt={2}>
            <FullReceiptBody breakdown={classBreakdown} headlinePct={headlinePct} hideExplainer={hideExplainer} />
          </Box>
        </Collapse>
      </Box>
    );
  }

  return <FullReceiptBody breakdown={classBreakdown} headlinePct={headlinePct} hideExplainer={hideExplainer} />;
}

/**
 * The full glass-panel body — extracted so the compact variant can reuse it.
 */
function FullReceiptBody({ breakdown, headlinePct, hideExplainer = false }) {
  return (
    <Box position="relative" borderRadius="2xl" p={{ base: 4, md: 5 }} w="100%" overflow="hidden" zIndex={1}>
      <GlassBack />
      <VStack align="stretch" spacing={3}>
        {/* Headline */}
        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="sm" color="gray.300" fontWeight="500">
            Why your vote counts
          </Text>
          <HStack spacing={1.5} align="baseline">
            <Text fontSize="xs" color="gray.400">
              Your voice:
            </Text>
            <Text fontSize="xl" fontWeight="bold" color="#C6B4F5" lineHeight="1">
              {headlinePct}
            </Text>
            <Text fontSize="xs" color="gray.400">
              of this decision
            </Text>
          </HStack>
        </Flex>

        {/* One row per class */}
        <VStack align="stretch" spacing={2}>
          {breakdown.map((entry) => (
            <ClassRow key={entry.classIndex} entry={entry} />
          ))}
        </VStack>

        {/* Footer explainer */}
        {/* hideExplainer: the education header renders its own "How Blended
            voting works" expander directly below the receipt — two identical
            expanders stacked reads as a bug. */}
        {!hideExplainer && <HowItWorksFooter breakdown={breakdown} />}
      </VStack>
    </Box>
  );
}

export default VotePowerReceipt;
