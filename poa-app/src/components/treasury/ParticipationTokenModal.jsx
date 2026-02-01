import React, { useMemo } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Box,
  VStack,
  HStack,
  Text,
  SimpleGrid,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  Center,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { FETCH_ALL_TOKEN_REQUESTS } from '@/util/queries';
import { usePOContext } from '@/context/POContext';
import { formatTokenAmount } from '@/util/formatToken';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backdropFilter: 'blur(20px)',
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  boxShadow: 'inset 0 0 15px rgba(148, 115, 220, 0.15)',
  border: '1px solid rgba(148, 115, 220, 0.3)',
};

const StatCard = ({ label, value, subtext }) => (
  <Box
    p={4}
    bg="rgba(0, 0, 0, 0.3)"
    borderRadius="lg"
    border="1px solid rgba(148, 115, 220, 0.2)"
    textAlign="center"
  >
    <Text fontSize="2xl" fontWeight="bold" color="white">
      {value}
    </Text>
    <Text fontSize="sm" color="gray.400">
      {label}
    </Text>
    {subtext && (
      <Text fontSize="xs" color="gray.500" mt={1}>
        {subtext}
      </Text>
    )}
  </Box>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <Box
      bg="rgba(33, 33, 33, 0.95)"
      border="1px solid rgba(148, 115, 220, 0.5)"
      borderRadius="lg"
      p={3}
    >
      <Text fontWeight="bold" color="white" mb={1}>{label}</Text>
      {payload.map((entry, index) => (
        <Text key={index} color={entry.color} fontSize="sm">
          {entry.name}: {Number(entry.value).toLocaleString()}
        </Text>
      ))}
    </Box>
  );
};

const ParticipationTokenModal = ({ isOpen, onClose, tokenAddress, totalSupply }) => {
  const { leaderboardData } = usePOContext();

  // Fetch all token requests for mint history
  const { data: requestsData, loading: requestsLoading } = useQuery(FETCH_ALL_TOKEN_REQUESTS, {
    variables: { tokenAddress: tokenAddress?.toLowerCase() },
    skip: !tokenAddress,
  });

  // Compute stats from data
  const stats = useMemo(() => {
    const tokenRequests = requestsData?.tokenRequests || [];
    const approvedRequests = tokenRequests.filter(r => r.status === 'Approved');

    // Calculate holder count from leaderboard
    const holders = leaderboardData.filter(u => {
      const balance = u.token || '0';
      try {
        return BigInt(balance) > 0n;
      } catch {
        return false;
      }
    }).length;

    // Calculate total supply as BigInt
    const supply = totalSupply ? BigInt(totalSupply) : 0n;

    // Calculate average balance
    const avgBalance = holders > 0 ? supply / BigInt(holders) : 0n;

    // Calculate 30-day metrics
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    const recentMints = approvedRequests.filter(
      r => r.approvedAt && parseInt(r.approvedAt) > thirtyDaysAgo
    );
    const monthlyMinted = recentMints.reduce((sum, r) => {
      try {
        return sum + BigInt(r.amount || 0);
      } catch {
        return sum;
      }
    }, 0n);

    // Calculate inflation rate
    const inflationRate = supply > 0n
      ? (Number(monthlyMinted) / Number(supply)) * 100
      : 0;

    // Average request size
    const totalApprovedAmount = approvedRequests.reduce((sum, r) => {
      try {
        return sum + BigInt(r.amount || 0);
      } catch {
        return sum;
      }
    }, 0n);
    const avgRequestSize = approvedRequests.length > 0
      ? totalApprovedAmount / BigInt(approvedRequests.length)
      : 0n;

    return {
      approvedRequests,
      recentMints,
      holders,
      supply,
      avgBalance,
      monthlyMinted,
      inflationRate,
      avgRequestSize,
      totalRequests: tokenRequests.length,
      pendingRequests: tokenRequests.filter(r => r.status === 'Pending').length,
    };
  }, [requestsData, leaderboardData, totalSupply]);

  // Build chart data - cumulative supply over time
  const chartData = useMemo(() => {
    if (!stats.approvedRequests.length) return [];

    // Sort by approval date
    const sorted = [...stats.approvedRequests]
      .filter(r => r.approvedAt)
      .sort((a, b) => parseInt(a.approvedAt) - parseInt(b.approvedAt));

    // Group by month and calculate cumulative
    const monthlyData = {};
    let cumulative = 0n;

    sorted.forEach(request => {
      const date = new Date(parseInt(request.approvedAt) * 1000);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

      try {
        cumulative += BigInt(request.amount || 0);
      } catch {
        // Skip invalid amounts
      }

      monthlyData[monthKey] = {
        monthKey,
        monthLabel,
        cumulative: Number(cumulative / BigInt(10 ** 18)), // Convert to whole tokens
      };
    });

    return Object.values(monthlyData);
  }, [stats.approvedRequests]);

  // Format recent mints for table
  const recentMints = useMemo(() => {
    return stats.approvedRequests
      .filter(r => r.approvedAt)
      .sort((a, b) => parseInt(b.approvedAt) - parseInt(a.approvedAt))
      .slice(0, 10)
      .map(r => ({
        id: r.id,
        date: new Date(parseInt(r.approvedAt) * 1000).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        recipient: r.requester
          ? `${r.requester.slice(0, 6)}...${r.requester.slice(-4)}`
          : 'Unknown',
        amount: formatTokenAmount(r.amount || '0', 18, 0),
        status: r.status,
      }));
  }, [stats.approvedRequests]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(10px)" />
      <ModalContent
        bg="transparent"
        borderRadius="xl"
        position="relative"
        boxShadow="dark-lg"
        mx={4}
      >
        <Box style={glassLayerStyle} />

        <ModalHeader color="white" fontSize="xl" fontWeight="bold" pb={2}>
          Participation Token Stats
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody pb={6}>
          {requestsLoading ? (
            <Center py={8}>
              <Spinner size="lg" color="purple.400" />
            </Center>
          ) : (
            <VStack spacing={6} align="stretch">
              {/* Summary Stats */}
              <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3}>
                <StatCard
                  label="Total Supply"
                  value={formatTokenAmount(stats.supply.toString(), 18, 0)}
                  subtext="tokens minted"
                />
                <StatCard
                  label="Holders"
                  value={stats.holders.toLocaleString()}
                  subtext="members with balance"
                />
                <StatCard
                  label="Avg Balance"
                  value={formatTokenAmount(stats.avgBalance.toString(), 18, 0)}
                  subtext="per holder"
                />
              </SimpleGrid>

              {/* Mint History Chart */}
              {chartData.length > 0 && (
                <Box>
                  <Text fontSize="md" fontWeight="bold" color="white" mb={3}>
                    Supply Growth
                  </Text>
                  <Box h="200px" bg="rgba(0, 0, 0, 0.2)" borderRadius="lg" p={2}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="supplyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="rgba(148, 115, 220, 0.8)" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="rgba(148, 115, 220, 0.1)" stopOpacity={0.1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                          dataKey="monthLabel"
                          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                        />
                        <YAxis
                          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="cumulative"
                          name="Total Supply"
                          stroke="rgba(148, 115, 220, 1)"
                          fill="url(#supplyGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
              )}

              {/* Inflation Metrics */}
              <Box>
                <Text fontSize="md" fontWeight="bold" color="white" mb={3}>
                  Inflation Metrics
                </Text>
                <SimpleGrid columns={2} spacing={3}>
                  <HStack
                    p={3}
                    bg="rgba(0, 0, 0, 0.2)"
                    borderRadius="lg"
                    justify="space-between"
                  >
                    <Text fontSize="sm" color="gray.400">Monthly Rate</Text>
                    <Text fontWeight="bold" color={stats.inflationRate > 5 ? 'orange.300' : 'green.300'}>
                      {stats.inflationRate.toFixed(2)}%
                    </Text>
                  </HStack>
                  <HStack
                    p={3}
                    bg="rgba(0, 0, 0, 0.2)"
                    borderRadius="lg"
                    justify="space-between"
                  >
                    <Text fontSize="sm" color="gray.400">30-Day Minted</Text>
                    <Text fontWeight="bold" color="purple.300">
                      {formatTokenAmount(stats.monthlyMinted.toString(), 18, 0)}
                    </Text>
                  </HStack>
                  <HStack
                    p={3}
                    bg="rgba(0, 0, 0, 0.2)"
                    borderRadius="lg"
                    justify="space-between"
                  >
                    <Text fontSize="sm" color="gray.400">Avg Request</Text>
                    <Text fontWeight="bold" color="white">
                      {formatTokenAmount(stats.avgRequestSize.toString(), 18, 0)}
                    </Text>
                  </HStack>
                  <HStack
                    p={3}
                    bg="rgba(0, 0, 0, 0.2)"
                    borderRadius="lg"
                    justify="space-between"
                  >
                    <Text fontSize="sm" color="gray.400">Pending</Text>
                    <Text fontWeight="bold" color={stats.pendingRequests > 0 ? 'yellow.300' : 'gray.400'}>
                      {stats.pendingRequests}
                    </Text>
                  </HStack>
                </SimpleGrid>
              </Box>

              {/* Recent Mints Table */}
              {recentMints.length > 0 && (
                <Box>
                  <Text fontSize="md" fontWeight="bold" color="white" mb={3}>
                    Recent Mints
                  </Text>
                  <Box overflowX="auto">
                    <Table variant="simple" size="sm">
                      <Thead>
                        <Tr>
                          <Th color="gray.400" borderColor="gray.600">Date</Th>
                          <Th color="gray.400" borderColor="gray.600">Recipient</Th>
                          <Th color="gray.400" borderColor="gray.600" isNumeric>Amount</Th>
                          <Th color="gray.400" borderColor="gray.600">Status</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {recentMints.map((mint) => (
                          <Tr key={mint.id}>
                            <Td color="gray.300" fontSize="sm" borderColor="gray.700">
                              {mint.date}
                            </Td>
                            <Td color="gray.300" fontSize="sm" borderColor="gray.700" fontFamily="mono">
                              {mint.recipient}
                            </Td>
                            <Td color="white" fontWeight="bold" borderColor="gray.700" isNumeric>
                              {mint.amount}
                            </Td>
                            <Td borderColor="gray.700">
                              <Badge colorScheme="green" fontSize="xs">
                                {mint.status}
                              </Badge>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                </Box>
              )}

              {/* Empty state */}
              {!requestsLoading && recentMints.length === 0 && (
                <Box textAlign="center" py={6}>
                  <Text color="gray.400">No mint history yet</Text>
                  <Text fontSize="sm" color="gray.500">
                    Token requests will appear here once approved
                  </Text>
                </Box>
              )}
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ParticipationTokenModal;
