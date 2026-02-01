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
} from '@chakra-ui/react';
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
  ComposedChart,
  Line,
} from 'recharts';
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
      {data?.taskCount !== undefined && data.taskCount > 0 && (
        <Text color="gray.400" fontSize="xs" mt={1}>
          {data.taskCount} task{data.taskCount > 1 ? 's' : ''} completed
        </Text>
      )}
    </Box>
  );
};

const ParticipationTokenModal = ({ isOpen, onClose, totalSupply, completedTasks = [] }) => {
  const { leaderboardData } = usePOContext();

  // Compute stats from completed tasks (the actual source of PT mints)
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

    // Filter tasks with valid payouts and completion dates
    const validTasks = completedTasks.filter(t => t.payout && t.completedAt);

    // Calculate 30-day metrics
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    const recentTasks = validTasks.filter(
      t => parseInt(t.completedAt) > thirtyDaysAgo
    );
    const monthlyMinted = recentTasks.reduce((sum, t) => {
      try {
        return sum + BigInt(t.payout || 0);
      } catch {
        return sum;
      }
    }, 0n);

    // Calculate inflation rate
    const inflationRate = supply > 0n
      ? (Number(monthlyMinted) / Number(supply)) * 100
      : 0;

    // Total minted from tasks
    const totalMintedFromTasks = validTasks.reduce((sum, t) => {
      try {
        return sum + BigInt(t.payout || 0);
      } catch {
        return sum;
      }
    }, 0n);

    // Average payout per task
    const avgPayout = validTasks.length > 0
      ? totalMintedFromTasks / BigInt(validTasks.length)
      : 0n;

    return {
      validTasks,
      recentTasks,
      holders,
      supply,
      avgBalance,
      monthlyMinted,
      inflationRate,
      avgPayout,
      totalTasks: validTasks.length,
      recentTaskCount: recentTasks.length,
    };
  }, [completedTasks, leaderboardData, totalSupply]);

  // Build chart data - daily data points based on task completions
  const chartData = useMemo(() => {
    if (!stats.validTasks.length) return [];

    // Sort by completion date
    const sorted = [...stats.validTasks]
      .sort((a, b) => parseInt(a.completedAt) - parseInt(b.completedAt));

    // Group by day and calculate cumulative
    const dailyData = {};
    let cumulative = 0n;

    sorted.forEach(task => {
      const timestamp = parseInt(task.completedAt);
      const date = new Date(timestamp * 1000);
      // Use date string as key for daily grouping
      const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

      const payout = BigInt(task.payout || 0);
      cumulative += payout;

      if (!dailyData[dayKey]) {
        dailyData[dayKey] = {
          dayKey,
          timestamp,
          dailyMinted: 0n,
          cumulative: 0n,
          taskCount: 0,
        };
      }

      dailyData[dayKey].dailyMinted += payout;
      dailyData[dayKey].cumulative = cumulative;
      dailyData[dayKey].taskCount += 1;
    });

    // Convert to array and format for chart
    const dataArray = Object.values(dailyData).sort((a, b) => a.timestamp - b.timestamp);

    // Determine date format based on data range
    const dataSpanDays = dataArray.length > 1
      ? (dataArray[dataArray.length - 1].timestamp - dataArray[0].timestamp) / (24 * 60 * 60)
      : 0;

    return dataArray.map(d => {
      const date = new Date(d.timestamp * 1000);

      // Format label based on data range
      let dateLabel;
      if (dataSpanDays <= 14) {
        // Show "Jan 15" for short ranges
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (dataSpanDays <= 90) {
        // Show "Jan 15" for medium ranges
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        // Show "Jan '26" for longer ranges
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }

      return {
        dayKey: d.dayKey,
        dateLabel,
        fullDate: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        dailyMinted: Number(d.dailyMinted / BigInt(10 ** 18)),
        cumulative: Number(d.cumulative / BigInt(10 ** 18)),
        taskCount: d.taskCount,
      };
    });
  }, [stats.validTasks]);

  // Format recent task payouts for table
  const recentPayouts = useMemo(() => {
    return stats.validTasks
      .sort((a, b) => parseInt(b.completedAt) - parseInt(a.completedAt))
      .slice(0, 10)
      .map(t => ({
        id: t.id,
        date: new Date(parseInt(t.completedAt) * 1000).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        task: t.title || `Task #${t.taskId}`,
        recipient: t.completerUsername || t.assigneeUsername ||
          (t.completer ? `${t.completer.slice(0, 6)}...${t.completer.slice(-4)}` :
           t.assignee ? `${t.assignee.slice(0, 6)}...${t.assignee.slice(-4)}` : 'Unknown'),
        amount: formatTokenAmount(t.payout || '0', 18, 0),
      }));
  }, [stats.validTasks]);

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

            {/* Daily Activity Chart */}
            {chartData.length > 0 && (
              <Box>
                <Text fontSize="md" fontWeight="bold" color="white" mb={3}>
                  Daily Minting Activity
                </Text>
                <Box h="160px" bg="rgba(0, 0, 0, 0.2)" borderRadius="lg" p={2}>
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
                        width={40}
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
                <Box h="160px" bg="rgba(0, 0, 0, 0.2)" borderRadius="lg" p={2}>
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
                        width={40}
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
                  <Text fontSize="sm" color="gray.400">Avg Task Payout</Text>
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
                  <Text fontSize="sm" color="gray.400">Total Tasks</Text>
                  <Text fontWeight="bold" color="white">
                    {stats.totalTasks}
                  </Text>
                </HStack>
              </SimpleGrid>
            </Box>

            {/* Recent Task Payouts Table */}
            {recentPayouts.length > 0 && (
              <Box>
                <Text fontSize="md" fontWeight="bold" color="white" mb={3}>
                  Recent Task Payouts
                </Text>
                <Box overflowX="auto">
                  <Table variant="simple" size="sm">
                    <Thead>
                      <Tr>
                        <Th color="gray.400" borderColor="gray.600">Date</Th>
                        <Th color="gray.400" borderColor="gray.600">Task</Th>
                        <Th color="gray.400" borderColor="gray.600">Recipient</Th>
                        <Th color="gray.400" borderColor="gray.600" isNumeric>Payout</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {recentPayouts.map((payout) => (
                        <Tr key={payout.id}>
                          <Td color="gray.300" fontSize="sm" borderColor="gray.700">
                            {payout.date}
                          </Td>
                          <Td color="gray.300" fontSize="sm" borderColor="gray.700" maxW="150px" isTruncated>
                            {payout.task}
                          </Td>
                          <Td color="gray.300" fontSize="sm" borderColor="gray.700" fontFamily="mono">
                            {payout.recipient}
                          </Td>
                          <Td color="white" fontWeight="bold" borderColor="gray.700" isNumeric>
                            {payout.amount}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              </Box>
            )}

            {/* Empty state */}
            {recentPayouts.length === 0 && (
              <Box textAlign="center" py={6}>
                <Text color="gray.400">No completed tasks yet</Text>
                <Text fontSize="sm" color="gray.500">
                  Task payouts will appear here once tasks are completed
                </Text>
              </Box>
            )}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ParticipationTokenModal;
