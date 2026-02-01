import React from 'react';
import {
  VStack,
  Text,
  SimpleGrid,
  Box,
} from '@chakra-ui/react';
import { FiInbox } from 'react-icons/fi';
import DistributionCard from './DistributionCard';

const CurrentDistributions = ({
  distributions = [],
  paymentManagerAddress,
  refetch,
}) => {
  // TODO: Implement claim function via TreasuryService
  const handleClaim = async (distributionId) => {
    console.log('Claiming distribution:', distributionId);
    // This will be implemented with TreasuryService
    throw new Error('Claim functionality coming soon');
  };

  if (distributions.length === 0) {
    return (
      <VStack py={8} spacing={3}>
        <Box
          p={4}
          borderRadius="full"
          bg="rgba(148, 115, 220, 0.1)"
        >
          <FiInbox size={32} color="rgba(148, 115, 220, 0.5)" />
        </Box>
        <Text color="gray.400" textAlign="center">
          No active distributions
        </Text>
        <Text fontSize="sm" color="gray.500" textAlign="center">
          Distributions are created to share profits with members based on their participation.
        </Text>
      </VStack>
    );
  }

  return (
    <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
      {distributions.map((distribution) => (
        <DistributionCard
          key={distribution.id}
          distribution={distribution}
          paymentManagerAddress={paymentManagerAddress}
          refetch={refetch}
          onClaim={handleClaim}
        />
      ))}
    </SimpleGrid>
  );
};

export default CurrentDistributions;
