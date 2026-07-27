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
import { POLL_BADGE, displayName, TYPE_EXPLAINER } from '@/config/votingVocabulary';
import { formatVotingEnds } from './DurationField';

/**
 * "Review your ballot" — the confirm view for normal + transferFunds proposals
 * (election / createRole / setter already have live previews). Renders the
 * ballot exactly as voters will see it.
 *
 * Per product direction this NEVER shows tallies or results — it is only the
 * ballot (title, description, options, end date, who-can-vote).
 */

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

const BallotReview = ({ proposal, whoCanVoteLabel, nativeCurrencySymbol = 'ETH' }) => {
  const isTransfer = proposal.type === 'transferFunds';
  const options = isTransfer
    ? ['Yes — send the funds', 'No — do not send']
    : (proposal.options || []).filter(o => o.trim() !== '');

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
        {/* Binding-ness at the moment of confirmation — normal + transferFunds
            both run as informal direct-democracy polls. */}
        <Badge
          px={2}
          py={0.5}
          borderRadius="md"
          textTransform="none"
          fontSize="2xs"
          fontWeight="700"
          bg="rgba(66, 153, 225, 0.16)"
          color="#90CDF4"
          border="1px solid rgba(66, 153, 225, 0.3)"
        >
          {POLL_BADGE} · {displayName('Direct Democracy')}
        </Badge>
      </HStack>
      <Text fontSize="2xs" color="gray.400" mt={-2}>
        {TYPE_EXPLAINER}
      </Text>

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
          {options.map((opt, i) => (
            <HStack key={i} spacing={2}>
              <Box boxSize={2} borderRadius="full" bg="purple.300" flexShrink={0} />
              <Text fontSize="sm" color="white">{opt}</Text>
            </HStack>
          ))}
          {options.length === 0 && (
            <Text fontSize="sm" color="gray.500">(no options yet)</Text>
          )}
        </VStack>
      </Row>

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
