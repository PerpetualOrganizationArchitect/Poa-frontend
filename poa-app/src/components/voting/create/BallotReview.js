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
import {
  TRANSFER_DESTINATION,
  BOUNTY_POOL_LABEL,
  TRANSFER_OPTION_NAMES,
  BOUNTY_POOL_OPTION_NAMES,
  transferOptionNames,
} from '@/lib/voting/treasuryBatches';
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

/** The static Yes/No ballot a transferFunds payout is voted on — the SAME pair submitted on chain. */
export const TRANSFER_OPTIONS = TRANSFER_OPTION_NAMES;

/** The same ballot when the money goes to the task-reward pool instead of a person. */
export const BOUNTY_POOL_OPTIONS = BOUNTY_POOL_OPTION_NAMES;

/**
 * Choices as voters will see them, derived from the form state. transferFunds
 * has no editable options — it is always a static Yes/No ballot, and it is the
 * exact pair `useProposalForm` submits as the option names.
 */
export function deriveBallotOptions(proposal) {
  if (proposal?.type === 'transferFunds') return transferOptionNames(proposal.transferDestination);
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
  // The symbol of the asset a payout moves. `nativeCurrencySymbol` is the
  // historical prop name and is still accepted; it was always the SELECTED
  // asset's symbol, not the chain's, so `symbol` says what it means.
  symbol,
  nativeCurrencySymbol = 'ETH',
  badge = POLL_REVIEW_BADGE,
  explainer = TYPE_EXPLAINER,
  options,
  outcome = null,
}) => {
  const isTransfer = proposal.type === 'transferFunds';
  const payoutSymbol = symbol || nativeCurrencySymbol;
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
            {proposal.transferDestination === TRANSFER_DESTINATION.BOUNTY_POOL ? 'Move' : 'Send'}{' '}
            <Text as="span" color="green.300" fontWeight="bold">
              {proposal.transferAmount || '0'} {payoutSymbol}
            </Text>{' '}
            to{' '}
            {proposal.transferDestination === TRANSFER_DESTINATION.BOUNTY_POOL ? (
              <Text as="span" color="white">the {BOUNTY_POOL_LABEL}</Text>
            ) : (
              <Text as="span" fontFamily="mono" color="white">
                {checksumTruncate(proposal.transferAddress)}
              </Text>
            )}
          </Text>
          {proposal.transferSourceLabel && (
            <Text fontSize="xs" color="gray.400" mt={1}>
              Paid from {proposal.transferSourceLabel}
            </Text>
          )}
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
