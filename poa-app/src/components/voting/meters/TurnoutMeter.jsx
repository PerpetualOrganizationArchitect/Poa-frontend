/**
 * TurnoutMeter — "how many of the people who could vote actually did".
 *
 * Product direction (Hudson): turnout is ALWAYS safe to show (it leaks no
 * per-option tally), so this renders in every lifecycle state. It carries the
 * quorum story too: a tick on the bar at the quorum fraction plus the copy
 * "7 of 18 voted · quorum met ✓" / "needs 2 more for quorum" (from
 * votingVocabulary.turnoutCopy).
 *
 * Denominator: prefer a real eligible count; callers fall back to the org
 * member count and pass `approximate` so the noun softens to "members".
 *
 * Props:
 *   voted        number  — distinct voters so far
 *   eligible     number  — eligible denominator (0 → "N voted", no fraction)
 *   quorum       number  — min voters for the result to count (0 → no quorum)
 *   approximate  bool    — denominator is the member-count fallback
 *   variant      "compact" (default, one line) | "full" (bar + line)
 */

import React, { useMemo } from 'react';
import { Box, HStack, Text, Icon, Tooltip } from '@chakra-ui/react';
import { PiUsersThree } from 'react-icons/pi';
import { turnoutCopy, lowQuorumTooltip } from '@/config/votingVocabulary';

const AMETHYST = '#9473DC';
const AMETHYST_SOFT = 'rgba(148, 115, 220, 0.16)';

export function TurnoutMeter({
  voted = 0,
  eligible = 0,
  quorum = 0,
  approximate = false,
  variant = 'compact',
}) {
  const { line, quorumMet, lowQuorum } = useMemo(
    () => turnoutCopy({ voted, eligible, quorum, approximate }),
    [voted, eligible, quorum, approximate]
  );
  // Green celebrates a healthy quorum being met; a trivially low quorum (or
  // zero turnout) renders neutral so the UI never endorses rubber-stamp rules.
  const lineColor = !quorumMet
    ? '#F6C177'
    : lowQuorum || voted === 0
      ? 'gray.300'
      : 'green.300';
  const ariaProps = {
    role: 'progressbar',
    'aria-valuemin': 0,
    'aria-valuemax': eligible > 0 ? eligible : undefined,
    'aria-valuenow': voted,
    'aria-label': `Turnout: ${line.replace(/\u00a0/g, ' ')}`,
  };
  const maybeTooltip = (node) =>
    lowQuorum && quorum > 0 ? (
      <Tooltip label={lowQuorumTooltip(quorum, eligible)} placement="top" hasArrow bg="gray.700" maxW="300px">
        {node}
      </Tooltip>
    ) : (
      node
    );

  // Fraction filled = voters / eligible (clamped). No denominator → show a
  // subtle empty rail rather than a misleading full/zero bar.
  const filledPct = eligible > 0 ? Math.min(100, Math.round((voted / eligible) * 100)) : 0;
  const quorumTickPct =
    eligible > 0 && quorum > 0 ? Math.min(100, (quorum / eligible) * 100) : null;

  if (variant === 'compact') {
    return maybeTooltip(
      <HStack spacing={1.5} align="center" minW={0} {...ariaProps} cursor={lowQuorum ? 'help' : undefined}>
        <Icon as={PiUsersThree} boxSize="14px" color={AMETHYST} flexShrink={0} />
        {/* No truncation: "quorum met ✓" clipping to "quorum me…" reads broken.
            Wrapping to a second line on narrow cards is the honest fallback. */}
        <Text
          fontSize="xs"
          color={quorumMet ? 'gray.200' : '#F6C177'}
          fontWeight="500"
        >
          {line}
        </Text>
      </HStack>
    );
  }

  return (
    <Box w="100%" {...ariaProps}>
      <HStack justify="space-between" mb={1.5} spacing={2}>
        <HStack spacing={1.5} align="center" minW={0}>
          <Icon as={PiUsersThree} boxSize="15px" color={AMETHYST} flexShrink={0} />
          <Text fontSize="sm" color="gray.200" fontWeight="500" noOfLines={1}>
            Turnout
          </Text>
        </HStack>
        {maybeTooltip(
          <Text
            fontSize="sm"
            color={lineColor}
            fontWeight="600"
            textAlign="right"
            cursor={lowQuorum ? 'help' : undefined}
          >
            {line}
          </Text>
        )}
      </HStack>
      <Box
        position="relative"
        w="100%"
        h="8px"
        borderRadius="full"
        bg="whiteAlpha.200"
        overflow="hidden"
      >
        <Box
          position="absolute"
          left={0}
          top={0}
          h="100%"
          w={`${filledPct}%`}
          borderRadius="full"
          bg={AMETHYST_SOFT}
          bgGradient="linear(to-r, rgba(148,115,220,0.55), rgba(148,115,220,0.95))"
          transition="width 0.5s ease"
        />
      </Box>
      {quorumTickPct != null && (
        // Quorum tick sits outside the clipped bar so it stays visible over
        // the fill. Marks where the quorum threshold falls along the rail.
        <Box position="relative" w="100%" h={0}>
          <Box
            position="absolute"
            top="-11px"
            left={`${quorumTickPct}%`}
            transform="translateX(-50%)"
            w="2px"
            h="12px"
            borderRadius="full"
            bg={quorumMet && voted > 0 && !lowQuorum ? 'green.300' : quorumMet ? 'whiteAlpha.500' : '#F6C177'}
          />
        </Box>
      )}
    </Box>
  );
}

export default TurnoutMeter;
