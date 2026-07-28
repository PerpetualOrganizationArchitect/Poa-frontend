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
  keyframes,
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
  outcomeHeadline,
} from '@/config/votingVocabulary';
import { TurnoutMeter } from './meters/TurnoutMeter';
import { ResultBars } from './ResultBars';
import {
  lifecycleVariant,
  turnoutInputs,
  relativeTime,
  VOTE_PALETTE,
} from './votingDisplay';

const { amethyst, coral, leaderText } = VOTE_PALETTE;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`;

/** Live-status chip (LIVE · countdown / CLOSING SOON / awaiting count). */
function StatusChip({ variant, endTimestamp, reduceMotion }) {
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
      >
        {STATUS_AWAITING_COUNT}
      </Badge>
    );
  }

  const closingSoon = variant === 'closing-soon';
  const label = closingSoon
    ? STATUS_CLOSING_SOON
    : `${STATUS_LIVE} · ${relativeTime(endTimestamp)}`;

  return (
    <HStack spacing={1.5} align="center">
      <Box
        w="7px"
        h="7px"
        borderRadius="full"
        bg={closingSoon ? '#F6C177' : '#68D391'}
        animation={reduceMotion ? undefined : `${pulse} 2s ease-in-out infinite`}
      />
      <Text
        fontSize="2xs"
        fontWeight="700"
        letterSpacing="0.04em"
        color={closingSoon ? '#F6C177' : 'gray.200'}
        noOfLines={1}
      >
        {label}
      </Text>
    </HStack>
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

  const variant = useMemo(() => lifecycleVariant(proposal), [proposal]);
  const turnout = useMemo(() => turnoutInputs(proposal, poMembers), [proposal, poMembers]);

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
  const showTallies = proposal.userHasVoted || !proposal.isOngoing || proposal.isExpired;
  const restrictedRoleLock = proposal.isHatRestricted && (proposal.restrictedHatIds || []).length > 0;

  const userIndexes = proposal.userVote?.optionIndexes || [];
  const userWeights = proposal.userVote?.optionWeights || [];

  const openDetail = () => onOpen?.(proposal);

  return (
    <Box
      as="article"
      role="button"
      tabIndex={0}
      aria-label={`Open ${proposal.title}`}
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
        {/* Badge row */}
        <Flex justify="space-between" align="center" gap={2}>
          <Badge
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
            <StatusChip
              variant={variant}
              endTimestamp={proposal.endTimestamp}
              reduceMotion={prefersReduced}
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
              <Text fontSize="xs" fontWeight="600" color={leaderText} noOfLines={2}>
                {outcomeHeadline(proposal)}
              </Text>
              <ResultBars
                options={proposal.options}
                winningIndex={proposal.winningOption}
                userIndexes={userIndexes}
                maxRows={2}
                size="sm"
              />
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
