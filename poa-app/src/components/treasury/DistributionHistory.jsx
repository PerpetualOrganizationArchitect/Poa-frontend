import React, { useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Link,
  useBreakpointValue,
} from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';
import { NETWORKS } from '@/config/networks';

const DistributionHistory = ({ distributions = [], payments = [] }) => {
  const isMobile = useBreakpointValue({ base: true, md: false });

  // Memoize combined and sorted history to avoid recalculation on every render
  const history = useMemo(() => {
    return [
      ...distributions.map(d => ({
        type: 'distribution',
        id: d.id,
        amount: d.totalAmount,
        token: d.payoutToken,
        timestamp: parseInt(d.finalizedAt || d.createdAt),
        status: d.status,
        claimCount: d.claims?.length || 0,
        txHash: d.claims?.[0]?.transactionHash,
      })),
      ...payments.map(p => ({
        type: 'payment',
        id: p.id,
        amount: p.amount,
        token: p.token,
        timestamp: parseInt(p.receivedAt),
        payer: p.payerUsername || `${p.payer?.slice(0, 6)}...${p.payer?.slice(-4)}`,
        txHash: p.transactionHash,
      })),
    ].sort((a, b) => b.timestamp - a.timestamp);
  }, [distributions, payments]);

  if (history.length === 0) {
    return (
      <VStack py={6}>
        <Text color="gray.400">No transaction history yet</Text>
        <Text fontSize="sm" color="gray.500">
          Distributions and payments will appear here
        </Text>
      </VStack>
    );
  }

  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getExplorerUrl = (txHash) => {
    const explorer = NETWORKS.hoodi?.blockExplorer || 'https://explorer.hoodi.ethpandaops.io';
    return `${explorer}/tx/${txHash}`;
  };

  if (isMobile) {
    return (
      <VStack spacing={3} align="stretch">
        {history.slice(0, 10).map((item) => {
          const token = getTokenByAddress(item.token);
          const formattedAmount = formatTokenAmount(item.amount, token.decimals, 2);

          return (
            <Box
              key={item.id}
              p={3}
              bg="rgba(0, 0, 0, 0.3)"
              borderRadius="lg"
            >
              <HStack justify="space-between" mb={2}>
                <Badge
                  colorScheme={item.type === 'payment' ? 'green' : 'purple'}
                >
                  {item.type === 'payment' ? 'Received' : 'Distributed'}
                </Badge>
                <Text fontSize="xs" color="gray.400">
                  {formatDate(item.timestamp)}
                </Text>
              </HStack>
              <HStack justify="space-between">
                <Text fontWeight="bold">
                  {item.type === 'payment' ? '+' : '-'}{formattedAmount} {token.symbol}
                </Text>
                {item.txHash && (
                  <Link
                    href={getExplorerUrl(item.txHash)}
                    isExternal
                    fontSize="xs"
                    color="purple.300"
                  >
                    View <ExternalLinkIcon mx="2px" />
                  </Link>
                )}
              </HStack>
              {item.type === 'payment' && (
                <Text fontSize="xs" color="gray.500">
                  From: {item.payer}
                </Text>
              )}
              {item.type === 'distribution' && (
                <Text fontSize="xs" color="gray.500">
                  {item.claimCount} members claimed
                </Text>
              )}
            </Box>
          );
        })}
      </VStack>
    );
  }

  return (
    <Box overflowX="auto">
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th color="gray.400">Date</Th>
            <Th color="gray.400">Type</Th>
            <Th color="gray.400" isNumeric>Amount</Th>
            <Th color="gray.400">Details</Th>
            <Th color="gray.400">Link</Th>
          </Tr>
        </Thead>
        <Tbody>
          {history.slice(0, 15).map((item) => {
            const token = getTokenByAddress(item.token);
            const formattedAmount = formatTokenAmount(item.amount, token.decimals, 2);

            return (
              <Tr key={item.id}>
                <Td color="gray.300" fontSize="sm">
                  {formatDate(item.timestamp)}
                </Td>
                <Td>
                  <Badge
                    colorScheme={item.type === 'payment' ? 'green' : 'purple'}
                    fontSize="xs"
                  >
                    {item.type === 'payment' ? 'Received' : 'Distributed'}
                  </Badge>
                </Td>
                <Td isNumeric fontWeight="bold" color={item.type === 'payment' ? 'green.300' : 'white'}>
                  {item.type === 'payment' ? '+' : '-'}{formattedAmount} {token.symbol}
                </Td>
                <Td fontSize="sm" color="gray.400">
                  {item.type === 'payment'
                    ? `From: ${item.payer}`
                    : `${item.claimCount} claimed`}
                </Td>
                <Td>
                  {item.txHash && (
                    <Link
                      href={getExplorerUrl(item.txHash)}
                      isExternal
                      fontSize="xs"
                      color="purple.300"
                    >
                      <ExternalLinkIcon />
                    </Link>
                  )}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
};

export default DistributionHistory;
