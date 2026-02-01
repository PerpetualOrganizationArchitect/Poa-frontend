import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import { usePublicClient } from 'wagmi';
import TokenBalanceCard from './TokenBalanceCard';
import { BOUNTY_TOKENS } from '@/util/tokens';
import { usePOContext } from '@/context/POContext';

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

const TokenBalancesGrid = ({ executorAddress }) => {
  const [balances, setBalances] = useState({
    eth: null,
    tokens: {},
  });
  const [isLoading, setIsLoading] = useState(true);
  const publicClient = usePublicClient();
  const { participationTokenAddress } = usePOContext();

  // Use ref to avoid re-running effect when publicClient reference changes
  const publicClientRef = useRef(publicClient);
  publicClientRef.current = publicClient;

  const fetchBalances = useCallback(async () => {
    const client = publicClientRef.current;
    if (!executorAddress || !client) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // Build list of token addresses to fetch (batch all reads)
      const tokenAddresses = [];
      if (participationTokenAddress) {
        tokenAddresses.push(participationTokenAddress);
      }
      for (const [key, token] of Object.entries(BOUNTY_TOKENS)) {
        if (token.address === '0x0000000000000000000000000000000000000000') continue;
        if (token.address.startsWith('0x00000000000000000000000000000000000000')) continue;
        tokenAddresses.push(token.address);
      }

      // Fetch ETH balance and all ERC20 balances in parallel
      const [ethBalance, ...tokenResults] = await Promise.all([
        client.getBalance({ address: executorAddress }),
        ...tokenAddresses.map(addr =>
          client.readContract({
            address: addr,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [executorAddress],
          }).catch(() => 0n) // Return 0 if token doesn't exist
        ),
      ]);

      // Map results back to token addresses
      const tokenBalances = {};
      tokenAddresses.forEach((addr, i) => {
        tokenBalances[addr.toLowerCase()] = tokenResults[i].toString();
      });

      setBalances({
        eth: ethBalance.toString(),
        tokens: tokenBalances,
      });
    } catch (err) {
      console.error('Error fetching balances:', err);
    } finally {
      setIsLoading(false);
    }
  }, [executorAddress, participationTokenAddress]);

  useEffect(() => {
    fetchBalances();

    // Refresh balances every 30 seconds
    const interval = setInterval(fetchBalances, 30000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  if (!executorAddress) {
    return (
      <VStack py={4}>
        <Text color="gray.400">No treasury address configured</Text>
      </VStack>
    );
  }

  // Build token list for display
  const tokenList = [
    {
      symbol: 'PT',
      name: 'Participation Token',
      balance: participationTokenAddress
        ? balances.tokens[participationTokenAddress.toLowerCase()] || '0'
        : '0',
      decimals: 18,
      tokenType: 'Governance',
    },
    {
      symbol: 'ETH',
      name: 'Ether',
      balance: balances.eth || '0',
      decimals: 18,
      tokenType: 'Native',
    },
  ];

  // Add other configured tokens if they have balances
  for (const [key, token] of Object.entries(BOUNTY_TOKENS)) {
    if (key === 'NONE') continue;
    if (token.address.startsWith('0x00000000000000000000000000000000000000')) continue;

    const balance = balances.tokens[token.address.toLowerCase()];
    if (balance && BigInt(balance) > 0n) {
      tokenList.push({
        symbol: token.symbol,
        name: token.name,
        balance: balance,
        decimals: token.decimals,
        tokenType: token.decimals === 6 ? 'Stablecoin' : 'Token',
      });
    }
  }

  return (
    <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3}>
      {tokenList.map((token) => (
        <TokenBalanceCard
          key={token.symbol}
          symbol={token.symbol}
          name={token.name}
          balance={token.balance}
          decimals={token.decimals}
          tokenType={token.tokenType}
          isLoading={isLoading}
        />
      ))}
    </SimpleGrid>
  );
};

export default TokenBalancesGrid;
