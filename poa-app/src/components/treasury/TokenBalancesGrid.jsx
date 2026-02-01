import React from 'react';
import {
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import TokenBalanceCard from './TokenBalanceCard';

const TokenBalancesGrid = ({ totalSupply, onPTClick, isLoading }) => {
  // Build token list for display using subgraph data only
  const tokenList = [
    {
      symbol: 'Participation Token',
      name: 'Total Supply',
      balance: totalSupply || '0',
      decimals: 18,
      tokenType: 'Governance',
      isClickable: true,
      onClick: onPTClick,
    },
  ];

  if (!totalSupply && !isLoading) {
    return (
      <VStack py={4}>
        <Text color="gray.400">No participation token configured</Text>
      </VStack>
    );
  }

  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
      {tokenList.map((token) => (
        <TokenBalanceCard
          key={token.symbol}
          symbol={token.symbol}
          name={token.name}
          balance={token.balance}
          decimals={token.decimals}
          tokenType={token.tokenType}
          isLoading={isLoading}
          isClickable={token.isClickable}
          onClick={token.onClick}
        />
      ))}
    </SimpleGrid>
  );
};

export default TokenBalancesGrid;
