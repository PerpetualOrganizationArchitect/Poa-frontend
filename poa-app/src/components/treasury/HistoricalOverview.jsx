import React, { useMemo } from 'react';
import {
  Box,
  VStack,
  Text,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  useBreakpointValue,
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
} from 'recharts';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';

const glassTabStyle = {
  bg: 'rgba(148, 115, 220, 0.1)',
  borderRadius: 'lg',
  _selected: {
    bg: 'rgba(148, 115, 220, 0.3)',
    color: 'white',
  },
};

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
          {entry.name}: {entry.value.toLocaleString()}
        </Text>
      ))}
    </Box>
  );
};

const HistoricalOverview = ({ distributions = [], payments = [] }) => {
  const isMobile = useBreakpointValue({ base: true, md: false });

  // Process data for charts
  const monthlyData = useMemo(() => {
    const months = {};

    // Process payments (inflows)
    payments.forEach(p => {
      const date = new Date(parseInt(p.receivedAt) * 1000);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const token = getTokenByAddress(p.token);
      const amount = parseFloat(formatTokenAmount(p.amount, token.decimals, 2));

      if (!months[monthKey]) {
        months[monthKey] = { month: monthKey, inflow: 0, outflow: 0 };
      }
      months[monthKey].inflow += amount;
    });

    // Process distributions (outflows)
    distributions.forEach(d => {
      const timestamp = d.finalizedAt || d.createdAt;
      const date = new Date(parseInt(timestamp) * 1000);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const token = getTokenByAddress(d.payoutToken);
      const amount = parseFloat(formatTokenAmount(d.totalClaimed, token.decimals, 2));

      if (!months[monthKey]) {
        months[monthKey] = { month: monthKey, inflow: 0, outflow: 0 };
      }
      months[monthKey].outflow += amount;
    });

    // Sort by month and format labels
    return Object.values(months)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12) // Last 12 months
      .map(item => ({
        ...item,
        monthLabel: new Date(item.month + '-01').toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        }),
      }));
  }, [distributions, payments]);

  // Distribution amounts by period
  const distributionData = useMemo(() => {
    return distributions
      .filter(d => d.status === 'Finalized')
      .slice(0, 10)
      .reverse()
      .map(d => {
        const token = getTokenByAddress(d.payoutToken);
        return {
          id: `#${d.distributionId}`,
          amount: parseFloat(formatTokenAmount(d.totalClaimed, token.decimals, 2)),
          claims: d.claims?.length || 0,
        };
      });
  }, [distributions]);

  if (distributions.length === 0 && payments.length === 0) {
    return (
      <VStack py={8}>
        <Text color="gray.400">No historical data available yet</Text>
        <Text fontSize="sm" color="gray.500">
          Charts will appear once there are distributions or payments
        </Text>
      </VStack>
    );
  }

  return (
    <Tabs variant="soft-rounded" colorScheme="purple">
      <TabList mb={4}>
        <Tab sx={glassTabStyle} mr={2}>Money Flow</Tab>
        <Tab sx={glassTabStyle}>Distributions</Tab>
      </TabList>

      <TabPanels>
        {/* Money Flow Chart */}
        <TabPanel p={0}>
          {monthlyData.length > 0 ? (
            <Box h={{ base: '200px', md: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="inflow"
                    name="Received"
                    stackId="1"
                    stroke="#2ECC71"
                    fill="rgba(46, 204, 113, 0.4)"
                  />
                  <Area
                    type="monotone"
                    dataKey="outflow"
                    name="Distributed"
                    stackId="2"
                    stroke="#9B59B6"
                    fill="rgba(155, 89, 182, 0.4)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <VStack py={6}>
              <Text color="gray.400">No flow data available</Text>
            </VStack>
          )}
        </TabPanel>

        {/* Distribution Bar Chart */}
        <TabPanel p={0}>
          {distributionData.length > 0 ? (
            <Box h={{ base: '200px', md: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distributionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis
                    dataKey="id"
                    tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="amount"
                    name="Amount"
                    fill="rgba(148, 115, 220, 0.8)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <VStack py={6}>
              <Text color="gray.400">No distribution data available</Text>
            </VStack>
          )}
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
};

export default HistoricalOverview;
