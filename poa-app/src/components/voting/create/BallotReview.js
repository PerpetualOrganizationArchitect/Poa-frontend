import React from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Divider,
  Badge,
} from '@chakra-ui/react';
import { utils } from 'ethers';
import { POLL_BADGE, BINDING_BADGE, displayName, TYPE_EXPLAINER } from '@/config/votingVocabulary';
import { VOTE_PALETTE } from '@/components/voting/votingDisplay';
import { formatVotingEnds } from './DurationField';

/**
 * "Review your ballot" — the confirm view for the create-a-vote wizard.
 *
 * Defaults describe the informal poll types (normal + transferFunds): a
 * direct-democracy POLL whose choices come straight off `proposal`. Binding
 * types (setter / election / createRole) auto-execute on-chain, so they pass
 * their own `badge` (`${BINDING_BADGE} · ${displayName('Hybrid')}`),
 * `explainer`, `options`, and an `outcome` node describing what happens if the
 * vote passes.
 *
 * Per product direction this NEVER shows tallies or results — it is only the
 * ballot (title, description, options, end date, who-can-vote).
 */

/** Default badge — the informal, non-binding direct-democracy poll. */
export const POLL_REVIEW_BADGE = `${POLL_BADGE} · ${displayName('Direct Democracy')}`;

/** Badge binding (auto-executing) proposal types pass in. */
export const BINDING_REVIEW_BADGE = `${BINDING_BADGE} · ${displayName('Hybrid')}`;

/** The static Yes/No ballot a transferFunds payout is voted on. */
export const TRANSFER_OPTIONS = ['Yes — send the funds', 'No — do not send'];

/**
 * Choices as voters will see them, derived from the form state. transferFunds
 * has no editable options — it is always the static Yes/No ballot above.
 */
export function deriveBallotOptions(proposal) {
  if (proposal?.type === 'transferFunds') return TRANSFER_OPTIONS;
  return (proposal?.options || []).filter(o => o.trim() !== '');
}

function checksumTruncate(address) {
  if (!address || !utils.isAddress(address)) return address || '';
  const checked = utils.getAddress(address);
  return `${checked.slice(0, 6)}…${checked.slice(-4)}`;
}

const Row = ({ label, children }) => (
  <Box>
    <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="wide" mb={1}>
      {label}
    </Text>
    {children}
  </Box>
);

const BallotReview = ({
  proposal,
  whoCanVoteLabel,
  nativeCurrencySymbol = 'ETH',
  badge = POLL_REVIEW_BADGE,
  explainer = TYPE_EXPLAINER,
  options,
  outcome = null,
}) => {
  const isTransfer = proposal.type === 'transferFunds';
  const shownOptions = options || deriveBallotOptions(proposal);

  // Binding badges get the amethyst treatment PollDetail already uses; poll
  // badges stay blue. Read off the badge text so callers pass one prop, not two.
  const isBinding = typeof badge === 'string' && badge.startsWith(BINDING_BADGE);

  // Row label already reads "Voting ends" — the value is just the date.
  const endsLabel = (formatVotingEnds(proposal.time) || 'Duration not set').replace(/^Voting ends /, '');

  return (
    <VStack
      spacing={4}
      align="stretch"
      p={4}
      borderRadius="md"
      bg="whiteAlpha.50"
      border="1px solid rgba(148, 115, 220, 0.3)"
    >
      <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
        <Text fontSize="xs" fontWeight="bold" color="purple.300" textTransform="uppercase" letterSpacing="wide">
          Review your ballot
        </Text>
        {/* Binding-ness at the moment of confirmation — the last screen before
            a vote that may auto-execute, so this must never read "POLL". */}
        <Badge
          px={2}
          py={0.5}
          borderRadius="md"
          textTransform="none"
          fontSize="2xs"
          fontWeight="700"
          bg={isBinding ? VOTE_PALETTE.amethystSoft : 'rgba(66, 153, 225, 0.16)'}
          color={isBinding ? VOTE_PALETTE.leaderText : '#90CDF4'}
          border="1px solid"
          borderColor={isBinding ? VOTE_PALETTE.amethystBorder : 'rgba(66, 153, 225, 0.3)'}
        >
          {badge}
        </Badge>
      </HStack>
      {explainer && (
        <Text fontSize="2xs" color="gray.400" mt={-2}>
          {explainer}
        </Text>
      )}

      <Row label="Title">
        <Text fontSize="md" fontWeight="bold" color="white">
          {proposal.name?.trim() || <Text as="span" color="gray.500">(no title)</Text>}
        </Text>
      </Row>

      {proposal.description?.trim() && (
        <Row label="Description">
          <Text fontSize="sm" color="gray.300" whiteSpace="pre-wrap">
            {proposal.description.trim()}
          </Text>
        </Row>
      )}

      {isTransfer && (
        <Row label="Payout">
          <Text fontSize="sm" color="gray.200">
            Send{' '}
            <Text as="span" color="green.300" fontWeight="bold">
              {proposal.transferAmount || '0'} {nativeCurrencySymbol}
            </Text>{' '}
            to{' '}
            <Text as="span" fontFamily="mono" color="white">
              {checksumTruncate(proposal.transferAddress)}
            </Text>
          </Text>
        </Row>
      )}

      <Row label={isTransfer ? 'Choices' : 'Options'}>
        <VStack align="stretch" spacing={1.5} pl={1}>
          {shownOptions.map((opt, i) => (
            <HStack key={i} spacing={2}>
              <Box boxSize={2} borderRadius="full" bg="purple.300" flexShrink={0} />
              <Text fontSize="sm" color="white">{opt}</Text>
            </HStack>
          ))}
          {shownOptions.length === 0 && (
            <Text fontSize="sm" color="gray.500">(no options yet)</Text>
          )}
        </VStack>
      </Row>

      {/* "If this passes, here's what happens" — the binding types' own preview
          bodies (election ledger, role preview, setter BEFORE→AFTER diff). */}
      {outcome && <Box>{outcome}</Box>}

      <Divider borderColor="whiteAlpha.200" />

      <HStack justify="space-between" align="flex-start" spacing={4}>
        <Row label="Voting ends">
          <Text fontSize="sm" color="gray.200">{endsLabel}</Text>
        </Row>
        <Row label="Who can vote">
          <Text fontSize="sm" color="gray.200" textAlign="right">{whoCanVoteLabel}</Text>
        </Row>
      </HStack>
    </VStack>
  );
};

export default BallotReview;
