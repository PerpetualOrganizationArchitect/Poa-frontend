/**
 * VoteCardSkeleton — glass loading placeholder matching ProposalCard proportions.
 *
 * Rendered (3 per visible lane) while VotingContext is loading so the board
 * never flashes a false-empty state. Mirrors ProposalCard's anatomy: badge row,
 * two-line title, meta line, body block, footer turnout line.
 *
 * Props:
 *   size  'default' | 'compact'
 */

import React from 'react';
import { Box, Flex, VStack, HStack, Skeleton } from '@chakra-ui/react';
import GlassBack from './GlassBack';

export function VoteCardSkeleton({ size = 'default' }) {
  const compact = size === 'compact';
  return (
    <Box
      position="relative"
      zIndex={1}
      w="100%"
      borderRadius="2xl"
      overflow="hidden"
      p={compact ? 4 : 5}
      minH={compact ? '132px' : '168px'}
    >
      <GlassBack />
      <VStack align="stretch" spacing={compact ? 2 : 3} h="100%">
        <Flex justify="space-between" align="center">
          <Skeleton height="16px" width="64px" borderRadius="md" />
          <Skeleton height="16px" width="88px" borderRadius="md" />
        </Flex>
        <Skeleton height="18px" width="82%" borderRadius="md" />
        <Skeleton height="18px" width="55%" borderRadius="md" />
        <Skeleton height="12px" width="40%" borderRadius="md" />
        <Box flex={1} pt={1}>
          <Skeleton height="10px" width="100%" borderRadius="full" mb={2} />
          <Skeleton height="10px" width="90%" borderRadius="full" />
        </Box>
        <HStack justify="space-between" pt={1}>
          <Skeleton height="14px" width="45%" borderRadius="md" />
          <Skeleton height="14px" width="60px" borderRadius="md" />
        </HStack>
      </VStack>
    </Box>
  );
}

export default VoteCardSkeleton;
