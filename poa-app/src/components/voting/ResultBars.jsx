/**
 * ResultBars — the ONE unified per-option results bar list.
 *
 * Used by ProposalCard (live-voted / completed), PollDetail results zone, and
 * VoteCelebration's reveal. One unit system: % is primary, "N voters" is the
 * secondary count. The actual leader is highlighted; the viewer's own pick(s)
 * get a "you" dot.
 *
 * VISIBILITY POLICY: this component always renders tallies — callers are
 * responsible for only mounting it when the viewer has voted or the poll has
 * closed. It never gates itself.
 *
 * Bars animate 0→current width when `animate` is true (gated on reduced motion
 * by the caller passing `reduceMotion`), with an 80ms stagger for the reveal.
 *
 * Props:
 *   options       transformed proposal.options ({name, percentage, votes, displayVotes})
 *   winningIndex  number|null — highlight the actual leader/winner
 *   userIndexes   number[]    — option indexes the viewer voted for ("you" dot)
 *   userWeights   number[]    — parallel weights (weighted votes → "you · 60%")
 *   maxRows       number      — collapse to top N + "+M more" (default: all)
 *   animate       bool        — run the 0→current width reveal
 *   reduceMotion  bool        — skip the reveal, render final widths immediately
 *   size          "sm"|"md"   — bar thickness / typography
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Box, HStack, VStack, Text } from '@chakra-ui/react';
import { VOTE_PALETTE } from './votingDisplay';

const { amethyst, amethystBright, leaderText, coral } = VOTE_PALETTE;

function YouDot() {
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      gap="4px"
      px="6px"
      py="1px"
      ml={1}
      borderRadius="full"
      bg={VOTE_PALETTE.coralSoft}
      border="1px solid rgba(242, 131, 107, 0.4)"
    >
      <Box as="span" w="6px" h="6px" borderRadius="full" bg={coral} />
      <Text as="span" fontSize="2xs" fontWeight="700" color="#F6B3A0" letterSpacing="0.04em">
        YOU
      </Text>
    </Box>
  );
}

function Row({ option, index, isWinner, isUserPick, userWeight, animate, reduceMotion, size }) {
  const target = Math.max(0, Math.min(100, Number(option.percentage) || 0));
  // Start collapsed only when animating; otherwise render at final width.
  const [w, setW] = useState(animate && !reduceMotion ? 0 : target);

  useEffect(() => {
    if (animate && !reduceMotion) {
      const t = requestAnimationFrame(() => setW(target));
      return () => cancelAnimationFrame(t);
    }
    setW(target);
    return undefined;
  }, [animate, reduceMotion, target]);

  const voters = option.displayVotes ?? option.votes ?? 0;
  const barColor = isWinner
    ? `linear-gradient(90deg, ${amethyst}, ${amethystBright})`
    : 'linear-gradient(90deg, rgba(148,115,220,0.35), rgba(148,115,220,0.55))';
  const nameColor = isWinner ? leaderText : 'gray.100';
  const fontSize = size === 'sm' ? 'xs' : 'sm';
  const barH = size === 'sm' ? '7px' : '10px';

  return (
    <Box w="100%">
      <HStack justify="space-between" mb={1} spacing={2} align="baseline">
        <HStack spacing={0} minW={0} flex={1} align="center">
          <Text
            fontSize={fontSize}
            fontWeight={isWinner ? '700' : '500'}
            color={nameColor}
            noOfLines={1}
          >
            {option.name}
          </Text>
          {isUserPick && <YouDot />}
        </HStack>
        <HStack spacing={2} flexShrink={0} align="baseline">
          {isUserPick && userWeight != null && userWeight < 100 && (
            <Text fontSize="2xs" color="#F6B3A0" fontWeight="600">
              you · {Math.round(userWeight)}%
            </Text>
          )}
          <Text fontSize={fontSize} fontWeight="700" color={isWinner ? leaderText : 'gray.200'}>
            {Math.round(target)}%
          </Text>
          <Text fontSize="2xs" color="gray.400">
            {voters} {Number(voters) === 1 ? 'voter' : 'voters'}
          </Text>
        </HStack>
      </HStack>
      <Box w="100%" h={barH} borderRadius="full" bg="whiteAlpha.200" overflow="hidden">
        <Box
          h="100%"
          w={`${w}%`}
          borderRadius="full"
          bgGradient={barColor}
          transition={animate && !reduceMotion ? 'width 0.6s cubic-bezier(0.22,1,0.36,1)' : 'none'}
          boxShadow={isUserPick ? '0 0 8px rgba(242,131,107,0.45)' : 'none'}
        />
      </Box>
    </Box>
  );
}

export function ResultBars({
  options = [],
  winningIndex = null,
  userIndexes = [],
  userWeights = [],
  maxRows,
  animate = false,
  reduceMotion = false,
  size = 'md',
  // Caption + damped bars for results built from very few ballots — a 1-voter
  // 100% bar must not read like consensus (panel: ghost-town optics).
  earlyCaption = null,
}) {
  const userSet = useMemo(() => new Set((userIndexes || []).map(Number)), [userIndexes]);
  const weightByIndex = useMemo(() => {
    const map = {};
    (userIndexes || []).forEach((idx, i) => {
      map[Number(idx)] = userWeights?.[i];
    });
    return map;
  }, [userIndexes, userWeights]);

  // Preserve original indexes (they map back to winningIndex / userIndexes),
  // then optionally collapse to the top N by percentage.
  const indexed = options.map((option, index) => ({ option, index }));
  let shown = indexed;
  let hiddenCount = 0;
  if (maxRows && indexed.length > maxRows) {
    const sorted = [...indexed].sort(
      (a, b) => (b.option.percentage || 0) - (a.option.percentage || 0)
    );
    shown = sorted.slice(0, maxRows);
    hiddenCount = indexed.length - maxRows;
  }

  const staggerBase = 0.05; // 50ms lead so the first bar isn't at t=0 exactly

  return (
    <VStack align="stretch" spacing={size === 'sm' ? 2 : 3} w="100%" opacity={earlyCaption ? 0.8 : 1}>
      {earlyCaption && (
        <Text fontSize="2xs" color="gray.400" fontStyle="italic">
          {earlyCaption}
        </Text>
      )}
      {shown.map(({ option, index }, order) => (
        <Box
          key={option.id || index}
          sx={
            animate && !reduceMotion
              ? {
                  animation: `voteRowIn 0.4s ease ${(staggerBase + order * 0.08).toFixed(2)}s both`,
                  '@keyframes voteRowIn': {
                    from: { opacity: 0, transform: 'translateY(6px)' },
                    to: { opacity: 1, transform: 'translateY(0)' },
                  },
                }
              : undefined
          }
        >
          <Row
            option={option}
            index={index}
            isWinner={winningIndex != null && index === winningIndex}
            isUserPick={userSet.has(index)}
            userWeight={weightByIndex[index]}
            animate={animate}
            reduceMotion={reduceMotion}
            size={size}
          />
        </Box>
      ))}
      {hiddenCount > 0 && (
        <Text fontSize="xs" color="gray.400" pl={1}>
          +{hiddenCount} more {hiddenCount === 1 ? 'option' : 'options'}
        </Text>
      )}
    </VStack>
  );
}

export default ResultBars;
