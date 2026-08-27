/**
 * VoteCelebration — the centerpiece.
 *
 * Rendered inside PollDetail as a takeover the instant a member casts a vote.
 * Casting NEVER blocks on a spinner: the celebration is optimistic and the
 * corner toast carries tx status. The visual language is identical for
 * 'pending' and 'confirmed' — only 'failed' swaps to a calm inline error.
 *
 * Sequence (every step gated on usePrefersReducedMotion; Chakra keyframes only;
 * no backdrop-filter):
 *   1. Amethyst radial glow scales in; an SVG checkmark strokes itself (~500ms).
 *   2. Headline "Your vote is in!" + "Counted as {X}% of this decision".
 *   3. "You voted:" — their choice as a pill, or the weighted split list.
 *   4. Results reveal beneath: ResultBars animate 0→current with 80ms stagger,
 *      their pick carries a "you" dot, the actual leader is highlighted, plus a
 *      TurnoutMeter line.
 *   5. ~8 amethyst/coral particles rise once (~1.5s) then hold still. No loop,
 *      no confetti rain.
 *   6. "Done" button closes PollDetail.
 *
 * Props:
 *   poll          transformed proposal (post-optimistic-merge so bars include the vote)
 *   userVote      { optionIndexes:number[], optionWeights:number[] }
 *   totalSharePct number|null — useVotingPower headline share ("counted as X%")
 *   status        'pending' | 'confirmed' | 'failed'
 *   poMembers     number — turnout denominator fallback
 *   onDone        () => void — close PollDetail
 *   onRetry       () => void — restore the ballot after a failure
 */

import React, { useMemo } from 'react';
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Button,
  Badge,
  Icon,
  usePrefersReducedMotion,
  keyframes,
} from '@chakra-ui/react';
import { WarningTwoIcon } from '@chakra-ui/icons';
import {
  CELEBRATION_HEADLINE,
  celebrationShare,
  CELEBRATION_YOUR_CHOICE,
  CELEBRATION_DONE,
  CELEBRATION_ERROR_TITLE,
  CELEBRATION_ERROR_BODY,
  CELEBRATION_RETRY,
} from '@/config/votingVocabulary';
import { TurnoutMeter } from './meters/TurnoutMeter';
import { ResultBars } from './ResultBars';
import { turnoutInputs, VOTE_PALETTE } from './votingDisplay';

const { amethyst, amethystBright, coral, leaderText } = VOTE_PALETTE;

// ── Keyframes ───────────────────────────────────────────────────────────────
const glowIn = keyframes`
  0% { transform: scale(0.4); opacity: 0; }
  60% { opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;
const checkDraw = keyframes`
  from { stroke-dashoffset: 48; }
  to { stroke-dashoffset: 0; }
`;
const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;
// One-shot rise: particle floats up, fades, then holds at rest (forwards fill).
const particleRise = keyframes`
  0% { transform: translateY(0) scale(0.6); opacity: 0; }
  15% { opacity: 1; }
  70% { opacity: 0.9; }
  100% { transform: translateY(-120px) scale(1); opacity: 0; }
`;

/** 8 pre-seeded particles (deterministic so SSR/CSR match — no Math.random). */
const PARTICLES = [
  { left: 12, delay: 0.15, color: amethyst, size: 8 },
  { left: 24, delay: 0.35, color: coral, size: 6 },
  { left: 38, delay: 0.05, color: amethystBright, size: 7 },
  { left: 48, delay: 0.45, color: amethyst, size: 5 },
  { left: 58, delay: 0.2, color: coral, size: 8 },
  { left: 70, delay: 0.4, color: amethystBright, size: 6 },
  { left: 82, delay: 0.1, color: amethyst, size: 7 },
  { left: 90, delay: 0.3, color: coral, size: 5 },
];

function Particles({ show }) {
  if (!show) return null;
  return (
    <Box position="absolute" inset={0} overflow="hidden" pointerEvents="none" aria-hidden>
      {PARTICLES.map((p, i) => (
        <Box
          key={i}
          position="absolute"
          bottom="42%"
          left={`${p.left}%`}
          w={`${p.size}px`}
          h={`${p.size}px`}
          borderRadius="full"
          bg={p.color}
          opacity={0}
          animation={`${particleRise} 1.5s ease-out ${p.delay}s forwards`}
        />
      ))}
    </Box>
  );
}

/** Animated stroke-draw checkmark inside a soft amethyst radial glow. */
function CheckmarkGlow({ reduceMotion }) {
  return (
    <Box position="relative" w="96px" h="96px" mx="auto">
      {/* Radial glow */}
      <Box
        position="absolute"
        inset="-24px"
        borderRadius="full"
        bg="radial-gradient(circle, rgba(148,115,220,0.55) 0%, rgba(148,115,220,0.15) 45%, transparent 70%)"
        animation={reduceMotion ? undefined : `${glowIn} 0.5s ease-out both`}
      />
      <Flex
        position="relative"
        w="96px"
        h="96px"
        borderRadius="full"
        align="center"
        justify="center"
        bg={VOTE_PALETTE.amethystSoft}
        border="2px solid"
        borderColor={VOTE_PALETTE.amethystBorder}
        animation={reduceMotion ? undefined : `${glowIn} 0.45s ease-out both`}
      >
        <Box as="svg" viewBox="0 0 52 52" w="52px" h="52px">
          <Box
            as="path"
            d="M14 27 L23 36 L39 18"
            fill="none"
            stroke={amethystBright}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            sx={{
              strokeDasharray: 48,
              strokeDashoffset: reduceMotion ? 0 : 48,
              animation: reduceMotion ? undefined : `${checkDraw} 0.5s ease-out 0.3s forwards`,
            }}
          />
        </Box>
      </Flex>
    </Box>
  );
}

/** The member's choice(s): single pill, or weighted split list "60% A / 40% B". */
function YourChoice({ poll, userVote }) {
  const idxs = userVote?.optionIndexes || [];
  const weights = userVote?.optionWeights || [];
  const isWeighted = idxs.length > 1;

  if (idxs.length === 0) return null;

  if (!isWeighted) {
    const name = poll.options?.[idxs[0]]?.name || `Option ${idxs[0] + 1}`;
    return (
      <Badge
        px={3}
        py={1.5}
        borderRadius="full"
        textTransform="none"
        fontSize="sm"
        fontWeight="700"
        bg={VOTE_PALETTE.amethystSoft}
        color={leaderText}
        border="1px solid"
        borderColor={VOTE_PALETTE.amethystBorder}
      >
        {name}
      </Badge>
    );
  }

  return (
    <VStack spacing={1.5} align="center">
      {idxs.map((idx, i) => (
        <HStack key={idx} spacing={2}>
          <Text fontSize="sm" fontWeight="800" color={leaderText}>
            {Math.round(weights[i] ?? 0)}%
          </Text>
          <Text fontSize="sm" color="gray.100">
            {poll.options?.[idx]?.name || `Option ${idx + 1}`}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
}

export function VoteCelebration({
  poll,
  userVote,
  totalSharePct = null,
  status = 'pending',
  poMembers = 0,
  onDone,
  onRetry,
}) {
  const reduceMotion = usePrefersReducedMotion();

  const turnout = useMemo(() => turnoutInputs(poll, poMembers), [poll, poMembers]);

  const leaderIndex = useMemo(() => {
    const opts = poll?.options || [];
    if (opts.length === 0) return null;
    let best = 0;
    for (let i = 1; i < opts.length; i++) {
      if ((opts[i].percentage || 0) > (opts[best].percentage || 0)) best = i;
    }
    return best;
  }, [poll]);

  // ── Failure state ──────────────────────────────────────────────────────────
  if (status === 'failed') {
    return (
      <Box position="relative" p={{ base: 2, md: 3 }} w="100%">
        <VStack spacing={4} textAlign="center">
          <Flex
            w="64px"
            h="64px"
            borderRadius="full"
            align="center"
            justify="center"
            bg="rgba(245, 101, 101, 0.14)"
            border="1px solid rgba(245, 101, 101, 0.4)"
          >
            <Icon as={WarningTwoIcon} boxSize={7} color="rose.300" />
          </Flex>
          <VStack spacing={1}>
            <Text fontSize="lg" fontWeight="700" color="white">
              {CELEBRATION_ERROR_TITLE}
            </Text>
            <Text fontSize="sm" color="gray.200">
              {CELEBRATION_ERROR_BODY}
            </Text>
          </VStack>
          <Button
            colorScheme="purple"
            onClick={onRetry}
            minH="48px"
            px={8}
            bg={amethyst}
            _hover={{ bg: amethystBright }}
          >
            {CELEBRATION_RETRY}
          </Button>
        </VStack>
      </Box>
    );
  }

  // ── Celebrating (pending/confirmed share one visual) ─────────────────────────
  const shareLine = celebrationShare(totalSharePct);

  return (
    // No inner glass panel: the celebration renders directly on PollDetail's
    // solid modal surface — an inset second box read as a misfitted seam.
    <Box position="relative" p={{ base: 1, md: 2 }} w="100%">
      <Particles show={!reduceMotion} />

      <VStack spacing={5} position="relative">
        <CheckmarkGlow reduceMotion={reduceMotion} />

        {/* Headline + share */}
        <VStack
          spacing={1.5}
          textAlign="center"
          sx={reduceMotion ? undefined : { animation: `${fadeUp} 0.5s ease 0.35s both` }}
        >
          <Text
            fontSize={{ base: '2xl', md: '3xl' }}
            fontWeight="800"
            bgGradient={`linear(to-r, ${amethystBright}, ${coral})`}
            bgClip="text"
            lineHeight="1.1"
          >
            {CELEBRATION_HEADLINE}
          </Text>
          {shareLine && (
            <Text fontSize="sm" color="gray.200" fontWeight="500">
              {shareLine}
            </Text>
          )}
        </VStack>

        {/* Your choice */}
        <VStack
          spacing={2}
          sx={reduceMotion ? undefined : { animation: `${fadeUp} 0.5s ease 0.5s both` }}
        >
          <Text fontSize="xs" color="gray.400" fontWeight="600" letterSpacing="0.04em">
            {CELEBRATION_YOUR_CHOICE}
          </Text>
          <YourChoice poll={poll} userVote={userVote} />
        </VStack>

        {/* Results reveal */}
        <Box
          w="100%"
          pt={2}
          sx={reduceMotion ? undefined : { animation: `${fadeUp} 0.5s ease 0.65s both` }}
        >
          <ResultBars
            options={poll.options}
            winningIndex={leaderIndex}
            userIndexes={userVote?.optionIndexes || []}
            userWeights={userVote?.optionWeights || []}
            animate
            reduceMotion={reduceMotion}
            size="md"
          />
          <Box mt={4}>
            <TurnoutMeter
              voted={turnout.voted}
              eligible={turnout.eligible}
              quorum={turnout.quorum}
              approximate={turnout.approximate}
              settled={turnout.settled}
              hasResult={turnout.hasResult}
              variant="full"
            />
          </Box>
        </Box>

        <Button
          onClick={onDone}
          minH="48px"
          px={10}
          bg={amethyst}
          color="white"
          _hover={{ bg: amethystBright }}
          fontWeight="700"
        >
          {CELEBRATION_DONE}
        </Button>
      </VStack>
    </Box>
  );
}

export default VoteCelebration;
