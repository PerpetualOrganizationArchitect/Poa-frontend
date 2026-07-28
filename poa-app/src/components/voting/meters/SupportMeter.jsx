/**
 * SupportMeter — "does the leading option clear the bar to pass?".
 *
 * Shows the leading option's support percentage against the pass threshold,
 * with a tick at the threshold. This DOES reveal a per-option tally, so it is
 * gated by the results-visibility policy: callers render it ONLY after the
 * viewer has voted or the poll has closed. This component does not enforce the
 * gate itself — that lives in ProposalCard / PollDetail.
 *
 * Props:
 *   supportPct    number — leading option's support % (0..100)
 *   thresholdPct  number — pass line (0 → no threshold, "leads with X%")
 *   leaderName    string — optional leading option name for the aria/label
 */

import React from 'react';
import { Box, HStack, Text, Icon } from '@chakra-ui/react';
import { PiSealCheck } from 'react-icons/pi';
import { supportCopy } from '@/config/votingVocabulary';

const AMETHYST = '#9473DC';

export function SupportMeter({ supportPct = 0, thresholdPct = 0, leaderName = null, votedCount = null }) {
  const support = Math.max(0, Math.min(100, Number(supportPct) || 0));
  const threshold = Math.max(0, Math.min(100, Number(thresholdPct) || 0));
  const passes = !threshold || support >= threshold;

  return (
    <Box
      w="100%"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(support)}
      aria-label={`Support: ${votedCount === 0 ? 'no votes were cast' : supportCopy(support, threshold)}`}
    >
      <HStack justify="space-between" mb={1.5} spacing={2}>
        <HStack spacing={1.5} align="center" minW={0}>
          <Icon
            as={PiSealCheck}
            boxSize="15px"
            color={passes ? 'green.300' : AMETHYST}
            flexShrink={0}
          />
          <Text fontSize="sm" color="gray.200" fontWeight="500" noOfLines={1}>
            {/* "Leading option has 0% support" reads absurd with zero ballots */}
            {votedCount === 0
              ? `No votes were cast${threshold ? ` · passing needs over ${Math.round(threshold)}%` : ''}`
              : supportCopy(support, threshold)}
          </Text>
        </HStack>
        <Text
          fontSize="sm"
          color={passes ? 'green.300' : 'gray.200'}
          fontWeight="700"
        >
          {Math.round(support)}%
        </Text>
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
          w={`${support}%`}
          borderRadius="full"
          bgGradient={
            passes
              ? 'linear(to-r, rgba(72,187,120,0.6), rgba(72,187,120,0.95))'
              : 'linear(to-r, rgba(148,115,220,0.55), rgba(148,115,220,0.95))'
          }
          transition="width 0.6s ease"
        />
      </Box>
      {threshold > 0 && (
        <Box position="relative" w="100%" h={0}>
          <Box
            position="absolute"
            top="-11px"
            left={`${threshold}%`}
            transform="translateX(-50%)"
            w="2px"
            h="12px"
            borderRadius="full"
            bg={passes ? 'green.300' : 'whiteAlpha.700'}
          />
        </Box>
      )}
    </Box>
  );
}

export default SupportMeter;
