import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Skeleton,
  Tooltip,
} from '@chakra-ui/react';
import { formatTokenAmount } from '@/util/formatToken';

const TokenBalanceCard = ({
  symbol,
  name,
  balance,
  decimals = 18,
  isLoading = false,
  tokenType = 'Token',
}) => {
  const formattedBalance = formatTokenAmount(balance || '0', decimals, decimals === 6 ? 2 : 0);

  // Token icon colors
  const iconColors = {
    PT: 'purple.400',
    ETH: 'blue.400',
    USDC: 'green.400',
    DAI: 'yellow.400',
    BREAD: 'orange.400',
  };

  const iconColor = iconColors[symbol] || 'gray.400';

  return (
    <Box
      p={4}
      bg="rgba(0, 0, 0, 0.4)"
      borderRadius="xl"
      border="1px solid"
      borderColor="rgba(148, 115, 220, 0.2)"
      transition="all 0.2s"
      _hover={{
        borderColor: 'rgba(148, 115, 220, 0.5)',
        transform: 'translateY(-2px)',
      }}
    >
      <VStack align="flex-start" spacing={2}>
        <HStack justify="space-between" w="100%">
          <HStack spacing={2}>
            <Box
              w="32px"
              h="32px"
              borderRadius="full"
              bg={iconColor}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontWeight="bold" fontSize="sm" color="white">
                {symbol.charAt(0)}
              </Text>
            </Box>
            <Text fontWeight="bold" fontSize="md">
              {symbol}
            </Text>
          </HStack>
          <Badge
            colorScheme={tokenType === 'Governance' ? 'purple' : 'blue'}
            fontSize="xs"
          >
            {tokenType}
          </Badge>
        </HStack>

        {isLoading ? (
          <Skeleton height="32px" width="100px" />
        ) : (
          <Tooltip label={`${name}: ${formattedBalance} ${symbol}`} placement="top">
            <Text fontSize="2xl" fontWeight="bold" color="white">
              {formattedBalance}
            </Text>
          </Tooltip>
        )}

        <Text fontSize="xs" color="gray.500">
          {name}
        </Text>
      </VStack>
    </Box>
  );
};

export default TokenBalanceCard;
