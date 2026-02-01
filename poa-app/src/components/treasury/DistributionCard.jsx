import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Progress,
  Button,
  useToast,
  Tooltip,
} from '@chakra-ui/react';
import { useAccount } from 'wagmi';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';

const DistributionCard = ({
  distribution,
  paymentManagerAddress,
  refetch,
  onClaim,
}) => {
  const [isClaiming, setIsClaiming] = useState(false);
  const { address } = useAccount();
  const toast = useToast();

  const token = getTokenByAddress(distribution.payoutToken);
  const totalAmount = formatTokenAmount(distribution.totalAmount, token.decimals, 2);
  const totalClaimed = formatTokenAmount(distribution.totalClaimed, token.decimals, 2);
  const remaining = BigInt(distribution.totalAmount) - BigInt(distribution.totalClaimed);
  const remainingFormatted = formatTokenAmount(remaining.toString(), token.decimals, 2);

  // Calculate progress percentage
  const progressPercent = distribution.totalAmount !== '0'
    ? (Number(distribution.totalClaimed) / Number(distribution.totalAmount)) * 100
    : 0;

  // Check if current user has already claimed
  const userClaim = distribution.claims?.find(
    c => c.claimer?.toLowerCase() === address?.toLowerCase()
  );
  const hasClaimed = !!userClaim;

  // Format date
  const createdDate = new Date(parseInt(distribution.createdAt) * 1000);
  const dateStr = createdDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleClaim = async () => {
    if (!onClaim) return;

    setIsClaiming(true);
    try {
      await onClaim(distribution.distributionId);
      toast({
        title: 'Claim Submitted',
        description: 'Your claim has been submitted. Please wait for confirmation.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      refetch?.();
    } catch (error) {
      console.error('Claim error:', error);
      toast({
        title: 'Claim Failed',
        description: error.message || 'Failed to claim distribution',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <Box
      p={4}
      bg="rgba(0, 0, 0, 0.4)"
      borderRadius="xl"
      border="1px solid"
      borderColor={distribution.status === 'Active' ? 'purple.500' : 'gray.600'}
      transition="all 0.2s"
      _hover={{
        borderColor: 'purple.400',
        transform: 'translateY(-2px)',
      }}
    >
      <VStack align="stretch" spacing={3}>
        <HStack justify="space-between">
          <VStack align="flex-start" spacing={0}>
            <Text fontWeight="bold" fontSize="lg">
              Profit Share #{distribution.distributionId}
            </Text>
            <Text fontSize="xs" color="gray.400">
              {dateStr}
            </Text>
          </VStack>
          <Badge
            colorScheme={distribution.status === 'Active' ? 'green' : 'gray'}
            fontSize="sm"
          >
            {distribution.status === 'Active' ? 'Active' : 'Completed'}
          </Badge>
        </HStack>

        <Box>
          <HStack justify="space-between" mb={1}>
            <Text fontSize="sm" color="gray.400">
              Progress
            </Text>
            <Text fontSize="sm" color="gray.400">
              {progressPercent.toFixed(0)}% claimed
            </Text>
          </HStack>
          <Progress
            value={progressPercent}
            colorScheme="purple"
            borderRadius="full"
            size="sm"
            bg="rgba(148, 115, 220, 0.2)"
          />
        </Box>

        <HStack justify="space-between">
          <VStack align="flex-start" spacing={0}>
            <Text fontSize="xs" color="gray.500">Total Pool</Text>
            <Text fontWeight="bold">
              {totalAmount} {token.symbol}
            </Text>
          </VStack>
          <VStack align="flex-end" spacing={0}>
            <Text fontSize="xs" color="gray.500">Remaining</Text>
            <Text fontWeight="bold" color="purple.300">
              {remainingFormatted} {token.symbol}
            </Text>
          </VStack>
        </HStack>

        <Text fontSize="sm" color="gray.400">
          {distribution.claims?.length || 0} members claimed
        </Text>

        {distribution.status === 'Active' && (
          <Tooltip
            label={hasClaimed && userClaim?.amount ? `You claimed ${formatTokenAmount(userClaim.amount, token.decimals, 2)} ${token.symbol}` : 'Claim your share'}
            placement="top"
          >
            <Button
              colorScheme="purple"
              size="sm"
              w="100%"
              onClick={handleClaim}
              isLoading={isClaiming}
              isDisabled={hasClaimed || !address}
            >
              {hasClaimed ? 'Already Claimed' : 'Claim Your Share'}
            </Button>
          </Tooltip>
        )}
      </VStack>
    </Box>
  );
};

export default DistributionCard;
