/**
 * VotingBoard — the lifecycle-lane presentation for /voting.
 *
 * Pure presentation: it receives the derived lanes (from useVoteLanes) plus the
 * filter state and card handlers, and renders:
 *   [All | Binding | Polls] filter chips → lanes
 *   Needs your vote (accent) / Live votes / Awaiting count / Recent outcomes.
 *
 * Empty lanes collapse entirely. Live lanes cap at 6 with a "Show all N"
 * expander. Loading shows skeleton rows (never a false-empty). Error shows the
 * "votes already cast are safe on-chain" banner with Retry.
 *
 * Product direction: per-option tallies never leak here (ProposalCard enforces
 * the visibility policy); turnout is always visible; "Blended"/"POLL" copy from
 * votingVocabulary. Every animation gates on usePrefersReducedMotion.
 */

import React, { useMemo, useState } from 'react';
import {
  Box,
  Flex,
  HStack,
  VStack,
  SimpleGrid,
  Text,
  Button,
  Badge,
  Icon,
} from '@chakra-ui/react';
import { WarningTwoIcon, ArrowForwardIcon } from '@chakra-ui/icons';
import { PiPlusCircle } from 'react-icons/pi';
import GlassBack from './GlassBack';
import { BINDING_BADGE, POLL_BADGE } from '@/config/votingVocabulary';
import { ProposalCard } from './ProposalCard';
import { VoteCardSkeleton } from './VoteCardSkeleton';
import { VOTE_PALETTE } from './votingDisplay';

const { amethyst, coral, leaderText } = VOTE_PALETTE;

const LANE_CAP = 6;
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'binding', label: 'Binding' },
  { key: 'polls', label: 'Polls' },
];

/** Segmented filter chips (NOT tabs — no navigation, pure client filter). */
function FilterChips({ value, onChange }) {
  return (
    <HStack
      spacing={1}
      p={1}
      borderRadius="full"
      bg="whiteAlpha.100"
      border="1px solid"
      borderColor="whiteAlpha.200"
      role="tablist"
      aria-label="Filter votes"
    >
      {FILTERS.map((f) => {
        const active = value === f.key;
        return (
          <Button
            key={f.key}
            size="sm"
            variant="ghost"
            minH="40px"
            px={4}
            borderRadius="full"
            role="tab"
            aria-selected={active}
            bg={active ? amethyst : 'transparent'}
            color={active ? 'white' : 'gray.200'}
            fontWeight="700"
            _hover={{ bg: active ? amethyst : 'whiteAlpha.200' }}
            onClick={() => onChange(f.key)}
          >
            {f.label}
          </Button>
        );
      })}
    </HStack>
  );
}

/** Section wrapper for one lane; collapses entirely when empty. */
function Lane({ title, count, accent = false, children }) {
  if (count === 0) return null;
  return (
    <VStack align="stretch" spacing={3}>
      <HStack spacing={2} align="center">
        {accent && <Box w="8px" h="8px" borderRadius="full" bg={coral} />}
        <Text fontSize="sm" fontWeight="800" letterSpacing="0.04em" color={accent ? '#F6B3A0' : 'gray.200'} textTransform="uppercase">
          {title}
        </Text>
        <Badge
          borderRadius="full"
          px={2}
          bg="whiteAlpha.200"
          color="gray.100"
          fontSize="2xs"
          fontWeight="700"
        >
          {count}
        </Badge>
      </HStack>
      {children}
    </VStack>
  );
}

/** Cards grid with a "Show all N" expander past the lane cap. */
function LaneGrid({ items, cardProps, accent = false }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, LANE_CAP);
  const hidden = items.length - shown.length;
  // Columns adapt to how many cards there are — 2 cards in a 3-column lane
  // leaves a hole that reads as a layout bug.
  const cols = Math.max(1, Math.min(3, shown.length));
  return (
    <VStack align="stretch" spacing={3}>
      <SimpleGrid columns={{ base: 1, md: Math.min(2, cols), xl: cols }} spacing={4}>
        {shown.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            typeBadge={p.typeBadge}
            isEligible={p._eligible}
            accent={accent}
            {...cardProps}
          />
        ))}
      </SimpleGrid>
      {(hidden > 0 || expanded) && items.length > LANE_CAP && (
        <Button
          alignSelf="center"
          size="sm"
          variant="ghost"
          color={leaderText}
          minH="40px"
          _hover={{ bg: 'whiteAlpha.100' }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : `Show all ${items.length}`}
        </Button>
      )}
    </VStack>
  );
}

function SkeletonLane({ title }) {
  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" fontWeight="800" letterSpacing="0.04em" color="gray.400" textTransform="uppercase">
        {title}
      </Text>
      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
        {[0, 1, 2].map((i) => (
          <VoteCardSkeleton key={i} />
        ))}
      </SimpleGrid>
    </VStack>
  );
}

/** Error banner — reassures that cast votes are safe, offers Retry. */
function ErrorBanner({ onRetry }) {
  return (
    <Box position="relative" borderRadius="2xl" p={6} overflow="hidden" zIndex={1}>
      <GlassBack />
      <VStack spacing={3} align="center" textAlign="center">
        <Icon as={WarningTwoIcon} boxSize={7} color="#F6C177" />
        <Text fontSize="sm" color="gray.100" maxW="480px">
          We can&apos;t reach the vote records right now. Votes already cast are safe on-chain.
        </Text>
        {onRetry && (
          <Button size="sm" minH="40px" bg={amethyst} color="white" _hover={{ bg: VOTE_PALETTE.amethystBright }} onClick={onRetry}>
            Retry
          </Button>
        )}
      </VStack>
    </Box>
  );
}

/** Empty-state variants: not-connected / not-member / genuinely quiet. */
function EmptyBoard({ kind, orgName, onCreate, canCreate }) {
  let heading;
  let body;
  let cta = null;
  if (kind === 'not-connected') {
    heading = 'Connect to see votes';
    body = 'Connect your account to view and take part in this org’s decisions.';
  } else if (kind === 'not-member') {
    heading = `Join ${orgName || 'this org'} to participate`;
    body = 'Members vote on proposals and shape how the group is run.';
  } else {
    heading = 'No live votes right now';
    body = canCreate ? 'Start one to get the group deciding.' : 'New votes will appear here as members open them.';
    if (canCreate && onCreate) {
      cta = (
        <Button
          leftIcon={<Icon as={PiPlusCircle} boxSize={5} />}
          minH="44px"
          bg={amethyst}
          color="white"
          _hover={{ bg: VOTE_PALETTE.amethystBright }}
          onClick={onCreate}
        >
          Create vote
        </Button>
      );
    }
  }
  return (
    <Box position="relative" borderRadius="2xl" p={{ base: 8, md: 12 }} overflow="hidden" zIndex={1}>
      <GlassBack />
      <VStack spacing={3} align="center" textAlign="center">
        <Text fontSize="lg" fontWeight="800" color="white">
          {heading}
        </Text>
        <Text fontSize="sm" color="gray.200" maxW="420px">
          {body}
        </Text>
        {cta}
      </VStack>
    </Box>
  );
}

export function VotingBoard({
  lanes,
  loading,
  error,
  onRetry,
  onOpenPoll,
  onFinalize,
  poMembers = 0,
  isConnected = true,
  isMember = true,
  canCreate = false,
  onCreate,
  orgName,
}) {
  const [filter, setFilter] = useState('all');

  const matchesFilter = useMemo(() => {
    return (p) => {
      if (filter === 'binding') return p.typeBadge === BINDING_BADGE;
      if (filter === 'polls') return p.typeBadge === POLL_BADGE;
      return true;
    };
  }, [filter]);

  const cardProps = { onOpen: onOpenPoll, onFinalize, poMembers };

  const f = (arr) => (arr || []).filter(matchesFilter);
  const needsVote = f(lanes?.needsVote);
  const liveVotes = f(lanes?.liveVotes);
  const awaitingCount = f(lanes?.awaitingCount);
  const recentOutcomes = f(lanes?.recentOutcomes);
  const recentThree = recentOutcomes.slice(0, 3);

  const totalLive = needsVote.length + liveVotes.length + awaitingCount.length;
  const totalAny = totalLive + recentOutcomes.length;

  return (
    <VStack align="stretch" spacing={8} data-tour="voting-panel">
      <Flex justify="flex-start">
        <FilterChips value={filter} onChange={setFilter} />
      </Flex>

      {error ? (
        <ErrorBanner onRetry={onRetry} />
      ) : loading ? (
        <VStack align="stretch" spacing={8}>
          <SkeletonLane title="Needs your vote" />
          <SkeletonLane title="Live votes" />
        </VStack>
      ) : !isConnected ? (
        <EmptyBoard kind="not-connected" orgName={orgName} />
      ) : !isMember ? (
        <EmptyBoard kind="not-member" orgName={orgName} />
      ) : totalAny === 0 ? (
        <EmptyBoard kind="quiet" orgName={orgName} onCreate={onCreate} canCreate={canCreate} />
      ) : (
        <VStack align="stretch" spacing={8}>
          <Lane title="Needs your vote" count={needsVote.length} accent>
            <LaneGrid items={needsVote} cardProps={cardProps} accent />
          </Lane>

          <Lane title="Live votes" count={liveVotes.length}>
            <LaneGrid items={liveVotes} cardProps={cardProps} />
          </Lane>

          <Lane title="Awaiting count" count={awaitingCount.length}>
            <LaneGrid items={awaitingCount} cardProps={cardProps} />
          </Lane>

          {recentThree.length > 0 && (
            <VStack align="stretch" spacing={3}>
              <Flex justify="space-between" align="center">
                <HStack spacing={2} align="center">
                  <Text fontSize="sm" fontWeight="800" letterSpacing="0.04em" color="gray.200" textTransform="uppercase">
                    Recent outcomes
                  </Text>
                  <Badge borderRadius="full" px={2} bg="whiteAlpha.200" color="gray.100" fontSize="2xs" fontWeight="700">
                    {recentOutcomes.length}
                  </Badge>
                </HStack>
                {onViewAllHref(orgName) && (
                  <Button
                    as="a"
                    href={onViewAllHref(orgName)}
                    size="sm"
                    variant="ghost"
                    color={leaderText}
                    minH="40px"
                    rightIcon={<ArrowForwardIcon />}
                    _hover={{ bg: 'whiteAlpha.100' }}
                  >
                    View all
                  </Button>
                )}
              </Flex>
              <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
                {recentThree.map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    typeBadge={p.typeBadge}
                    isEligible={p._eligible}
                    {...cardProps}
                  />
                ))}
              </SimpleGrid>
            </VStack>
          )}
        </VStack>
      )}
    </VStack>
  );
}

/** Deep link to the full archive, preserving org context via userDAO. */
function onViewAllHref(orgName) {
  if (!orgName) return '/votes';
  return `/votes?userDAO=${encodeURIComponent(orgName)}`;
}

export default VotingBoard;
