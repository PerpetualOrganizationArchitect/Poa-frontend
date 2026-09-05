/**
 * ProposalCard — the ONE canonical vote card.
 *
 * Replaces VoteCard, HistoryCard, and the dashboard OngoingPolls / UserProposals
 * cards. One component, five lifecycle variants, two sizes.
 *
 * Variants (derived from the proposal, override with `variant`):
 *   live-unvoted     — live, viewer hasn't voted: option NAMES only, no tallies
 *   live-voted       — live, viewer voted: mini result bars + turnout
 *   closing-soon     — live, <24h left (same body rules as unvoted/voted)
 *   awaiting-finalize— voting window ended, Active: "Count the votes" button
 *   completed        — outcome line + execution chip + top-2 bars
 *
 * VISIBILITY POLICY (enforced INSIDE this card): per-option tallies render only
 * when `proposal.userHasVoted || !proposal.isOngoing`. Turnout is always shown.
 *
 * Props:
 *   proposal    transformed proposal (VotingContext.transformProposal shape)
 *   onOpen      (proposal) => void — open PollDetail (card is always clickable)
 *   onFinalize  (proposal) => void — shown only in awaiting-finalize
 *   isEligible  bool — viewer may vote (computed by caller via isEligibleToVote)
 *   typeBadge   'BINDING' | 'POLL' — from votingVocabulary
 *   size        'default' | 'compact'
 *   accent      bool — "needs your vote" accent treatment (tasks board convention)
 *   poMembers   number — eligible-denominator fallback for turnout
 */

import React, { useMemo } from 'react';
import { keyframes } from '@emotion/react';
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Badge,
  Button,
  Icon,
  Tooltip,
  usePrefersReducedMotion,
} from '@chakra-ui/react';
import { PiLockKey } from 'react-icons/pi';
import GlassBack from './GlassBack';
import {
  BINDING_BADGE,
  POLL_BADGE,
  YOU_VOTED_CHIP,
  STATUS_LIVE,
  STATUS_CLOSING_SOON,
  STATUS_AWAITING_COUNT,
  FINALIZE_VERB,
  earlyResultCaption,
  executionStatus,
  outcomeProblem,
} from '@/config/votingVocabulary';
import { useNow } from '@/hooks/useNow';
import { TurnoutMeter } from './meters/TurnoutMeter';
import { ResultBars } from './ResultBars';
import {
  lifecycleVariant,
  turnoutInputs,
  relativeTime,
  countdownFigure,
  TABULAR_NUMS,
  VOTE_PALETTE,
} from './votingDisplay';

const { amethyst, coral, leaderText } = VOTE_PALETTE;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`;

/** Per-state ink for the status plate. */
const PLATE_TONE = {
  live: {
    label: STATUS_LIVE,
    dot: VOTE_PALETTE.live,
    // gray.100, not white: the countdown must never out-shout the card's title.
    figure: 'gray.100',
    unit: 'whiteAlpha.600',
    suffix: 'whiteAlpha.500',
    eyebrow: 'gray.400',
  },
  urgent: {
    label: STATUS_CLOSING_SOON,
    dot: VOTE_PALETTE.urgent,
    figure: VOTE_PALETTE.urgent,
    unit: 'rgba(246, 193, 119, 0.72)',
    suffix: 'rgba(246, 193, 119, 0.6)',
    eyebrow: VOTE_PALETTE.urgent,
  },
};

/**
 * Live-status plate: the time remaining set as a real figure, with the state
 * word demoted to an eyebrow above it (desktop) and dropped entirely on mobile,
 * where the amber ink carries the urgency on its own.
 *
 * Never combine `noOfLines` with a responsive `display` in here — Chakra's
 * noOfLines injects `display:-webkit-box` last and annihilates the media query,
 * which would leak "CLOSING SOON" onto mobile. The plate is right-aligned and
 * stacked, so nothing in it needs to truncate.
 */
function StatusPlate({ variant, figure, reduceMotion, compact }) {
  if (variant === 'awaiting-finalize') {
    return (
      <Badge
        display="inline-flex"
        alignItems="center"
        gap={1}
        px={2}
        py={0.5}
        borderRadius="md"
        bg={VOTE_PALETTE.coralSoft}
        color="#F6B3A0"
        border="1px solid rgba(242, 131, 107, 0.4)"
        textTransform="none"
        fontSize="2xs"
        fontWeight="700"
        letterSpacing="0.02em"
        // The longest status in the header; it is the side that gives, so a
        // narrow card clips this tail instead of overrunning the type badge.
        minW={0}
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {STATUS_AWAITING_COUNT}
      </Badge>
    );
  }

  const tone = variant === 'closing-soon' ? PLATE_TONE.urgent : PLATE_TONE.live;

  return (
    <VStack spacing={0} align="flex-end" flexShrink={0} aria-hidden="true">
      <Text
        display={compact ? 'none' : { base: 'none', md: 'block' }}
        fontSize="10px"
        fontWeight="700"
        letterSpacing="0.12em"
        textTransform="uppercase"
        lineHeight="1"
        whiteSpace="nowrap"
        // Cancels the trailing letter-space so the eyebrow's right edge
        // optically aligns with the figure's.
        mr="-0.12em"
        color={tone.eyebrow}
      >
        {tone.label}
      </Text>
      <HStack spacing={1.5} align="center" mt={compact ? 0 : { base: 0, md: '2px' }}>
        <Box
          w="7px"
          h="7px"
          borderRadius="full"
          bg={tone.dot}
          flexShrink={0}
          animation={reduceMotion ? undefined : `${pulse} 2s ease-in-out infinite`}
        />
        <Text
          as="span"
          fontSize={compact ? { base: 'sm', md: 'md' } : { base: 'md', md: 'xl' }}
          fontWeight="800"
          lineHeight="1"
          letterSpacing="-0.02em"
          color={tone.figure}
          whiteSpace="nowrap"
          sx={TABULAR_NUMS}
        >
          {figure.prefix && (
            <Text as="span" fontSize="0.6em" fontWeight="600" color={tone.unit} mr="0.1em">
              {figure.prefix}
            </Text>
          )}
          {figure.parts.map((part, i) => (
            <React.Fragment key={part.unit}>
              {i > 0 && ' '}
              {part.value}
              <Text as="span" fontSize="0.6em" fontWeight="700" color={tone.unit}>
                {part.unit}
              </Text>
            </React.Fragment>
          ))}
          <Text as="span" fontSize="0.5em" fontWeight="600" color={tone.suffix} ml="0.35em" letterSpacing="0.02em">
            left
          </Text>
        </Text>
      </HStack>
    </VStack>
  );
}

/** Completed execution-status chip with plain-language tooltip. */
function CompletedStatusChip({ proposal }) {
  const status = executionStatus(proposal);
  return (
    <Tooltip label={status.explain} placement="top" hasArrow bg="gray.700" openDelay={200}>
      <Badge
        colorScheme={status.colorScheme}
        variant="subtle"
        px={2}
        py={0.5}
        borderRadius="md"
        textTransform="none"
        fontSize="2xs"
        fontWeight="700"
        cursor="help"
      >
        {status.label}
      </Badge>
    </Tooltip>
  );
}

export function ProposalCard({
  proposal,
  onOpen,
  onFinalize,
  isEligible = true,
  typeBadge,
  size = 'default',
  accent = false,
  poMembers = 0,
}) {
  const prefersReduced = usePrefersReducedMotion();
  const compact = size === 'compact';

  // A hero-sized countdown that never moves is worse than the tiny frozen badge
  // it replaces: VotingContext's poll pauses on an idle tab, so without a tick
  // the card can sit on a stale "LIVE" long after the window closed. useNow is
  // a shared registry — one timer for the whole board.
  const now = useNow(30000);
  const variant = useMemo(() => lifecycleVariant(proposal, now), [proposal, now]);
  const turnout = useMemo(() => turnoutInputs(proposal, poMembers), [proposal, poMembers]);
  const figure = useMemo(
    () => countdownFigure(proposal?.endTimestamp, now),
    [proposal?.endTimestamp, now]
  );

  // Option-name preview for the pre-vote body: "Yes · No · +2 more".
  // (Hook must run before ANY early return — rules-of-hooks.)
  const optionPreview = useMemo(() => {
    const names = (proposal?.options || []).map((o) => o.name);
    const head = names.slice(0, 3).join(' · ');
    const extra = names.length > 3 ? ` · +${names.length - 3} more` : '';
    return head + extra;
  }, [proposal?.options]);

  if (!proposal) return null;

  const isBinding = typeBadge
    ? typeBadge === BINDING_BADGE
    : proposal.type === 'Hybrid';
  const badgeText = typeBadge || (isBinding ? BINDING_BADGE : POLL_BADGE);

  // Voting ended => standings visible (provisional) — no bandwagon risk remains.
  // Derived from the ticking `variant`, NOT from proposal.isExpired: that flag is
  // frozen at transform time, so a card that flips past its deadline while mounted
  // would otherwise show "VOTING ENDED" over a pre-vote option teaser.
  const showTallies =
    proposal.userHasVoted || variant === 'completed' || variant === 'awaiting-finalize';
  const restrictedRoleLock = proposal.isHatRestricted && (proposal.restrictedHatIds || []).length > 0;

  const userIndexes = proposal.userVote?.optionIndexes || [];
  const userWeights = proposal.userVote?.optionWeights || [];

  // A completed card narrates its outcome ONLY when something went wrong.
  // `problem === null` gates both the sentence and the seal, so a card can
  // never show both — nor, absent a data gap, neither.
  const problem = variant === 'completed' ? outcomeProblem(proposal) : null;
  const winnerName = proposal.options?.[proposal.winningOption]?.name || null;
  const winnerConfirmed = variant === 'completed' && problem === null && !!winnerName;

  // The plate is aria-hidden and mobile drops the state word, so the card's own
  // label is what a screen reader actually announces (role="button" makes all
  // descendant text presentational).
  //
  // Deliberately COARSE: an accessible name that changed every 30s would make a
  // screen reader re-announce whichever card has focus. One unit only, so it
  // changes about once an hour on a long vote; PollDetail carries the precise time.
  const coarseLeft = `${figure.prefix}${figure.parts[0].value}${figure.parts[0].unit} left`;
  const statusAria =
    variant === 'completed'
      ? [
          problem || (winnerConfirmed ? `passed, “${winnerName}” won` : 'voting complete'),
          // The execution chip is visual-only; fold its taxonomy in, without
          // repeating it when the problem sentence already says the same thing.
          executionStatus(proposal).key === 'no_quorum' ? null : executionStatus(proposal).label,
        ]
          .filter(Boolean)
          .join(' — ')
      : variant === 'awaiting-finalize'
        ? 'voting ended, awaiting count'
        : variant === 'closing-soon'
          ? `closing soon, about ${coarseLeft}`
          : `about ${coarseLeft}`;

  const openDetail = () => onOpen?.(proposal);

  return (
    <Box
      as="article"
      role="button"
      tabIndex={0}
      aria-label={`Open ${proposal.title} — ${statusAria}`}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetail();
        }
      }}
      position="relative"
      zIndex={1}
      w="100%"
      borderRadius="2xl"
      overflow="hidden"
      cursor="pointer"
      p={compact ? 4 : 5}
      minH={compact ? '132px' : '168px'}
      transition="transform 0.2s ease, box-shadow 0.2s ease"
      _hover={
        prefersReduced
          ? { boxShadow: '0 8px 22px rgba(148,115,220,0.18)' }
          : { transform: 'translateY(-2px) scale(1.01)', boxShadow: '0 10px 24px rgba(148,115,220,0.2)' }
      }
      _focusVisible={{ outline: '2px solid', outlineColor: amethyst, outlineOffset: '2px' }}
    >
      <GlassBack />
      {accent && (
        // "Needs your vote" left accent rail (tasks-board mine/needs-review convention).
        <Box position="absolute" left={0} top={0} bottom={0} w="3px" bg={coral} borderLeftRadius="2xl" />
      )}

      <VStack align="stretch" spacing={compact ? 2 : 2.5} h="100%">
        {/* Badge row — fixed band so live, completed and awaiting cards keep
            identical header heights and their titles align across a grid row. */}
        <Flex
          justify="space-between"
          align="center"
          gap={2}
          minH={compact ? '22px' : { base: '22px', md: '34px' }}
        >
          <Badge
            // No minW={0}: a Chakra Badge is white-space:nowrap, so letting it
            // shrink below min-content makes "BINDING" overflow into the status.
            flexShrink={0}
            px={2}
            py={0.5}
            borderRadius="md"
            textTransform="none"
            fontSize="2xs"
            fontWeight="700"
            bg={isBinding ? VOTE_PALETTE.amethystSoft : 'rgba(66, 153, 225, 0.16)'}
            color={isBinding ? leaderText : '#90CDF4'}
            border="1px solid"
            borderColor={isBinding ? VOTE_PALETTE.amethystBorder : 'rgba(66, 153, 225, 0.3)'}
          >
            {badgeText}
          </Badge>
          {variant === 'completed' ? (
            <CompletedStatusChip proposal={proposal} />
          ) : (
            <StatusPlate
              variant={variant}
              figure={figure}
              reduceMotion={prefersReduced}
              compact={compact}
            />
          )}
        </Flex>

        {/* Title */}
        <Text
          fontSize={compact ? 'sm' : 'md'}
          fontWeight="700"
          color="white"
          textAlign="left"
          noOfLines={2}
          lineHeight="1.3"
        >
          {proposal.title}
        </Text>

        {/* Plain-language translation of what a binding proposal enacts —
            technical titles ("setUniversalFactory…") get a human subtitle. */}
        {isBinding && (proposal.actionSummaries?.length || 0) > 0 && (
          <Text fontSize="xs" color="gray.300" noOfLines={1} fontStyle="italic">
            {proposal.actionSummaries[0]}
          </Text>
        )}

        {/* Meta line — opened + reserved proposer slot */}
        <HStack spacing={1.5} color="gray.300" fontSize="xs">
          <Text noOfLines={1}>
            opened {relativeTime(proposal.startTimestamp, { pastPrefix: '', pastSuffix: ' ago', futureSuffix: '', coarse: true })}
          </Text>
          {proposal.proposerUsername && (
            <>
              <Text color="gray.500">·</Text>
              <Text noOfLines={1}>by {proposal.proposerUsername}</Text>
            </>
          )}
        </HStack>

        {/* State body */}
        <Box flex={1}>
          {variant === 'completed' ? (
            <VStack align="stretch" spacing={2}>
              <ResultBars
                options={proposal.options}
                winningIndex={proposal.winningOption}
                winnerConfirmed={winnerConfirmed}
                userIndexes={userIndexes}
                maxRows={2}
                size="sm"
              />
              {problem && (
                // A footnote under the result, not a headline over it: the bars
                // are the content, the shortfall is the annotation.
                <Text
                  fontSize={compact ? '2xs' : 'xs'}
                  fontWeight="600"
                  color={VOTE_PALETTE.urgent}
                  lineHeight="1.4"
                  borderLeft="2px solid rgba(246, 193, 119, 0.45)"
                  pl={2}
                  noOfLines={2}
                >
                  {problem}
                </Text>
              )}
            </VStack>
          ) : showTallies ? (
            <ResultBars
              options={proposal.options}
              winningIndex={currentLeaderIndex(proposal)}
              userIndexes={userIndexes}
              userWeights={userWeights}
              maxRows={3}
              size="sm"
              earlyCaption={
                proposal.isOngoing && turnout.voted > 0 && turnout.voted < 3
                  ? earlyResultCaption(turnout.voted, turnout.eligible)
                  : null
              }
            />
          ) : (
            // Pre-vote: neutral option NAMES only — no bars, counts, or pills.
            <Text fontSize="sm" color="gray.200" noOfLines={2}>
              {optionPreview}
            </Text>
          )}
        </Box>

        {/* awaiting-finalize action */}
        {variant === 'awaiting-finalize' && onFinalize && (
          <Button
            size="sm"
            variant="outline"
            borderColor="rgba(242, 131, 107, 0.5)"
            color="#F6B3A0"
            _hover={{ bg: VOTE_PALETTE.coralSoft }}
            minH="40px"
            onClick={(e) => {
              e.stopPropagation();
              onFinalize(proposal);
            }}
          >
            {FINALIZE_VERB}
          </Button>
        )}

        {/* Footer: turnout + you-voted + lock */}
        <Flex justify="space-between" align="center" gap={2} pt={1} flexWrap="wrap">
          <TurnoutMeter
            voted={turnout.voted}
            eligible={turnout.eligible}
            quorum={turnout.quorum}
            approximate={turnout.approximate}
            settled={turnout.settled}
            hasResult={turnout.hasResult}
            variant="compact"
          />
          <HStack spacing={2} flexShrink={0}>
            {proposal.userHasVoted && (
              <Badge
                px={1.5}
                py={0.5}
                borderRadius="md"
                textTransform="none"
                fontSize="2xs"
                fontWeight="700"
                bg="rgba(72, 187, 120, 0.16)"
                color="green.200"
                border="1px solid rgba(72, 187, 120, 0.3)"
              >
                {YOU_VOTED_CHIP}
              </Badge>
            )}
            {restrictedRoleLock && (
              <Tooltip label="Restricted vote — only certain roles can take part" placement="top" hasArrow bg="gray.700">
                <HStack spacing={1} color="gray.300" cursor="help">
                  <Icon as={PiLockKey} boxSize="12px" />
                  <Text fontSize="2xs" fontWeight="600" noOfLines={1}>
                    Restricted
                  </Text>
                </HStack>
              </Tooltip>
            )}
          </HStack>
        </Flex>
      </VStack>
    </Box>
  );
}

// Live-voted bars highlight the ACTUAL current leader (not the winningOption,
// which is only set once counted). Return the top-percentage index.
function currentLeaderIndex(proposal) {
  const opts = proposal.options || [];
  if (opts.length === 0) return null;
  let best = 0;
  for (let i = 1; i < opts.length; i++) {
    if ((opts[i].percentage || 0) > (opts[best].percentage || 0)) best = i;
  }
  return best;
}

export default ProposalCard;
