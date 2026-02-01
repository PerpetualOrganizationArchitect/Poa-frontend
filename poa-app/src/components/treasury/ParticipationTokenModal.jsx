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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { usePOContext } from '@/context/POContext';
import { formatTokenAmount } from '@/util/formatToken';
import { FETCH_ALL_TOKEN_REQUESTS } from '@/util/queries';
import { glassLayerWithShadowStyle } from '@/components/shared/glassStyles';

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

  const data = payload[0]?.payload;

  return (
    <Box
      bg="rgba(33, 33, 33, 0.95)"
      border="1px solid rgba(148, 115, 220, 0.5)"
      borderRadius="lg"
      p={3}
    >
      <Text fontWeight="bold" color="white" mb={1}>{data?.fullDate || label}</Text>
      {data?.dailyMinted !== undefined && (
        <Text color="green.300" fontSize="sm">
          Day&apos;s Minted: {data.dailyMinted.toLocaleString()}
        </Text>
      )}
      {data?.cumulative !== undefined && (
        <Text color="purple.300" fontSize="sm">
          Total Supply: {data.cumulative.toLocaleString()}
        </Text>
      )}
      {(data?.taskCount > 0 || data?.requestCount > 0) && (
        <VStack align="start" spacing={0} mt={1}>
          {data?.taskCount > 0 && (
            <Text color="gray.400" fontSize="xs">
              {data.taskCount} task{data.taskCount > 1 ? 's' : ''}
            </Text>
          )}
          {data?.requestCount > 0 && (
            <Text color="gray.400" fontSize="xs">
              {data.requestCount} request{data.requestCount > 1 ? 's' : ''}
            </Text>
          )}
        </VStack>
      )}
    </Box>
  );
};

const ParticipationTokenModal = ({ isOpen, onClose, totalSupply, completedTasks = [], tokenAddress }) => {
  const { leaderboardData } = usePOContext();

  // Fetch token requests
  const { data: requestsData, loading: requestsLoading } = useQuery(FETCH_ALL_TOKEN_REQUESTS, {
    variables: { tokenAddress: tokenAddress?.toLowerCase() },
    skip: !tokenAddress || !isOpen,
  });

  // Get approved token requests
  const approvedRequests = useMemo(() => {
    const requests = requestsData?.tokenRequests || [];
    return requests.filter(r => r.status === 'Approved' && r.approvedAt);
  }, [requestsData]);

  // Combine task completions and token requests into unified mint events
  const allMintEvents = useMemo(() => {
    const taskEvents = completedTasks
      .filter(t => t.payout && t.completedAt)
      .map(t => ({
        id: t.id,
        type: 'task',
        amount: t.payout,
        timestamp: parseInt(t.completedAt),
        title: t.title || `Task #${t.taskId}`,
        recipient: t.completerUsername || t.assigneeUsername ||
          (t.completer ? `${t.completer.slice(0, 6)}...${t.completer.slice(-4)}` :
           t.assignee ? `${t.assignee.slice(0, 6)}...${t.assignee.slice(-4)}` : 'Unknown'),
      }));

    const requestEvents = approvedRequests.map(r => ({
      id: r.id,
      type: 'request',
      amount: r.amount,
      timestamp: parseInt(r.approvedAt),
      title: 'Token Request',
      recipient: r.requester
        ? `${r.requester.slice(0, 6)}...${r.requester.slice(-4)}`
        : 'Unknown',
    }));

    return [...taskEvents, ...requestEvents].sort((a, b) => b.timestamp - a.timestamp);
  }, [completedTasks, approvedRequests]);

  // Compute stats from all mint events
  const stats = useMemo(() => {
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

    // Calculate 30-day metrics from all events
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    const recentEvents = allMintEvents.filter(e => e.timestamp > thirtyDaysAgo);
    const monthlyMinted = recentEvents.reduce((sum, e) => {
      try {
        return sum + BigInt(e.amount || 0);
      } catch {
        return sum;
      }
    }, 0n);

    // Calculate inflation rate
    const inflationRate = supply > 0n
      ? (Number(monthlyMinted) / Number(supply)) * 100
      : 0;

    // Total minted from all events
    const totalMinted = allMintEvents.reduce((sum, e) => {
      try {
        return sum + BigInt(e.amount || 0);
      } catch {
        return sum;
      }
    }, 0n);

    // Average payout
    const avgPayout = allMintEvents.length > 0
      ? totalMinted / BigInt(allMintEvents.length)
      : 0n;

    // Separate counts
    const taskCount = allMintEvents.filter(e => e.type === 'task').length;
    const requestCount = allMintEvents.filter(e => e.type === 'request').length;

    return {
      holders,
      supply,
      avgBalance,
      monthlyMinted,
      inflationRate,
      avgPayout,
      totalEvents: allMintEvents.length,
      taskCount,
      requestCount,
      recentCount: recentEvents.length,
    };
  }, [allMintEvents, leaderboardData, totalSupply]);

  // Build chart data - daily data points from all mint events
  const chartData = useMemo(() => {
    if (!allMintEvents.length) return [];

    // Sort by date ascending for cumulative calculation
    const sorted = [...allMintEvents].sort((a, b) => a.timestamp - b.timestamp);

    // Group by day and calculate cumulative
    const dailyData = {};
    let cumulative = 0n;

    sorted.forEach(event => {
      const date = new Date(event.timestamp * 1000);
      const dayKey = date.toISOString().split('T')[0];

      const amount = BigInt(event.amount || 0);
      cumulative += amount;

      if (!dailyData[dayKey]) {
        dailyData[dayKey] = {
          dayKey,
          timestamp: event.timestamp,
          dailyMinted: 0n,
          cumulative: 0n,
          taskCount: 0,
          requestCount: 0,
        };
      }

      dailyData[dayKey].dailyMinted += amount;
      dailyData[dayKey].cumulative = cumulative;
      if (event.type === 'task') {
        dailyData[dayKey].taskCount += 1;
      } else {
        dailyData[dayKey].requestCount += 1;
      }
    });

    // Convert to array and format for chart
    const dataArray = Object.values(dailyData).sort((a, b) => a.timestamp - b.timestamp);

    // Determine date format based on data range
    const dataSpanDays = dataArray.length > 1
      ? (dataArray[dataArray.length - 1].timestamp - dataArray[0].timestamp) / (24 * 60 * 60)
      : 0;

    return dataArray.map(d => {
      const date = new Date(d.timestamp * 1000);

      let dateLabel;
      if (dataSpanDays <= 14) {
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (dataSpanDays <= 90) {
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }

      return {
        dayKey: d.dayKey,
        dateLabel,
        fullDate: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        dailyMinted: Number(d.dailyMinted / BigInt(10 ** 18)),
        cumulative: Number(d.cumulative / BigInt(10 ** 18)),
        taskCount: d.taskCount,
        requestCount: d.requestCount,
      };
    });
  }, [allMintEvents]);

  // Format recent mint events for table
  const recentEvents = useMemo(() => {
    return allMintEvents.slice(0, 10).map(e => ({
      id: e.id,
      date: new Date(e.timestamp * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      source: e.title,
      type: e.type,
      recipient: e.recipient,
      amount: formatTokenAmount(e.amount || '0', 18, 0),
    }));
  }, [allMintEvents]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(10px)" />
      <ModalContent
        bg="transparent"
        borderRadius="xl"
        position="relative"
        boxShadow="dark-lg"
        mx={4}
        maxW="900px"
      >
        <Box style={glassLayerWithShadowStyle} />

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
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
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
                  label="From Tasks"
                  value={stats.taskCount.toLocaleString()}
                  subtext="completed tasks"
                />
                <StatCard
                  label="From Requests"
                  value={stats.requestCount.toLocaleString()}
                  subtext="approved requests"
                />
              </SimpleGrid>

              {/* Daily Activity Chart */}
              {chartData.length > 0 && (
                <Box>
                  <Text fontSize="md" fontWeight="bold" color="white" mb={3}>
                    Daily Minting Activity
                  </Text>
                  <Box h="180px" bg="rgba(0, 0, 0, 0.2)" borderRadius="lg" p={2}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                          dataKey="dateLabel"
                          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                          width={50}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar
                          dataKey="dailyMinted"
                          name="Daily Minted"
                          fill="rgba(72, 187, 120, 0.8)"
                          radius={[2, 2, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
              )}

              {/* Cumulative Supply Chart */}
              {chartData.length > 0 && (
                <Box>
                  <Text fontSize="md" fontWeight="bold" color="white" mb={3}>
                    Cumulative Supply
                  </Text>
                  <Box h="180px" bg="rgba(0, 0, 0, 0.2)" borderRadius="lg" p={2}>
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
                          dataKey="dateLabel"
                          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                          width={50}
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

              {/* Minting Metrics */}
              <Box>
                <Text fontSize="md" fontWeight="bold" color="white" mb={3}>
                  Minting Metrics
                </Text>
                <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
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
                    <Text fontSize="sm" color="gray.400">Avg Payout</Text>
                    <Text fontWeight="bold" color="white">
                      {formatTokenAmount(stats.avgPayout.toString(), 18, 0)}
                    </Text>
                  </HStack>
                  <HStack
                    p={3}
                    bg="rgba(0, 0, 0, 0.2)"
                    borderRadius="lg"
                    justify="space-between"
                  >
                    <Text fontSize="sm" color="gray.400">Avg Balance</Text>
                    <Text fontWeight="bold" color="white">
                      {formatTokenAmount(stats.avgBalance.toString(), 18, 0)}
                    </Text>
                  </HStack>
                </SimpleGrid>
              </Box>

              {/* Recent Mint Events Table */}
              {recentEvents.length > 0 && (
                <Box>
                  <Text fontSize="md" fontWeight="bold" color="white" mb={3}>
                    Recent Mint Events
                  </Text>
                  <Box overflowX="auto">
                    <Table variant="simple" size="sm">
                      <Thead>
                        <Tr>
                          <Th color="gray.400" borderColor="gray.600">Date</Th>
                          <Th color="gray.400" borderColor="gray.600">Source</Th>
                          <Th color="gray.400" borderColor="gray.600">Type</Th>
                          <Th color="gray.400" borderColor="gray.600">Recipient</Th>
                          <Th color="gray.400" borderColor="gray.600" isNumeric>Amount</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {recentEvents.map((event) => (
                          <Tr key={event.id}>
                            <Td color="gray.300" fontSize="sm" borderColor="gray.700">
                              {event.date}
                            </Td>
                            <Td color="gray.300" fontSize="sm" borderColor="gray.700" maxW="200px" isTruncated>
                              {event.source}
                            </Td>
                            <Td borderColor="gray.700">
                              <Badge
                                colorScheme={event.type === 'task' ? 'green' : 'blue'}
                                fontSize="xs"
                              >
                                {event.type === 'task' ? 'Task' : 'Request'}
                              </Badge>
                            </Td>
                            <Td color="gray.300" fontSize="sm" borderColor="gray.700" fontFamily="mono">
                              {event.recipient}
                            </Td>
                            <Td color="white" fontWeight="bold" borderColor="gray.700" isNumeric>
                              {event.amount}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                </Box>
              )}

              {/* Empty state */}
              {recentEvents.length === 0 && (
                <Box textAlign="center" py={6}>
                  <Text color="gray.400">No mint events yet</Text>
                  <Text fontSize="sm" color="gray.500">
                    Tokens are minted from completed tasks and approved requests
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
