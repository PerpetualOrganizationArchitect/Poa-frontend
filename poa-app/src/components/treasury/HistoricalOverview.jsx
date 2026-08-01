import React, { useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  SimpleGrid,
} from '@chakra-ui/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';
import { ACCENT, INK, TABULAR, SeriesDot, twoDp, UnitSpan } from './treasuryStyles';

// Series hues validated against the card surface (see treasuryStyles.js).
const COLORS = {
  inflow: ACCENT.in,
  outflow: ACCENT.out,
};

// ─── Stat tiles ───
// Values wear ink, never the series color; the dot beside the label carries
// identity and ties the tile to its series in the chart below.

const StatTile = ({ label, value, unit, subtext, dot }) => (
  <Box py={1}>
    <HStack spacing={1.5} mb={1.5}>
      {dot && <SeriesDot color={dot} size="7px" />}
      <Text fontSize="xs" color={INK.muted}>{label}</Text>
    </HStack>
    <Text fontSize="2xl" fontWeight="semibold" color={INK.primary} lineHeight="1.1">
      {value}
      {unit && <UnitSpan>{unit}</UnitSpan>}
    </Text>
    {subtext && <Text fontSize="xs" color={INK.muted} mt={1}>{subtext}</Text>}
  </Box>
);

// ─── Custom Tooltip ───

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <Box bg="rgba(13,20,17,0.97)" border="1px solid rgba(255,255,255,0.14)" borderRadius="lg" p={3} maxW="220px">
      <Text fontWeight="semibold" color={INK.primary} fontSize="sm" mb={1.5}>{label}</Text>
      {payload.map((entry, i) => (
        <HStack key={i} justify="space-between" spacing={4}>
          <HStack spacing={1.5}>
            <SeriesDot color={entry.color} size="7px" />
            <Text fontSize="xs" color={INK.secondary}>{entry.name}</Text>
          </HStack>
          <Text fontSize="xs" color={INK.primary} fontWeight="medium" sx={TABULAR}>
            {typeof entry.value === 'number' ? entry.value.toFixed(4) : entry.value}
          </Text>
        </HStack>
      ))}
    </Box>
  );
};

// ─── Main Component ───

const HistoricalOverview = ({ distributions = [], payments = [] }) => {
  // ─── Aggregate stats ───
  const stats = useMemo(() => {
    let totalReceived = 0;
    let totalDistributed = 0;
    let totalClaimed = 0;
    let tokenSymbol = '';

    payments.forEach(p => {
      const token = getTokenByAddress(p.token);
      if (!tokenSymbol && token.symbol !== 'ERC20') tokenSymbol = token.symbol;
      totalReceived += parseFloat(formatTokenAmount(p.amount, token.decimals, 6));
    });

    distributions.forEach(d => {
      const token = getTokenByAddress(d.payoutToken);
      if (!tokenSymbol && token.symbol !== 'ERC20') tokenSymbol = token.symbol;
      totalDistributed += parseFloat(formatTokenAmount(d.totalAmount, token.decimals, 6));
      totalClaimed += parseFloat(formatTokenAmount(d.totalClaimed || '0', token.decimals, 6));
    });

    return {
      totalReceived: totalReceived.toFixed(4),
      totalDistributed: totalDistributed.toFixed(4),
      totalClaimed: totalClaimed.toFixed(4),
      claimRate: totalDistributed > 0 ? ((totalClaimed / totalDistributed) * 100).toFixed(0) : '0',
      tokenSymbol: tokenSymbol || 'tokens',
      distributionCount: distributions.length,
      paymentCount: payments.length,
    };
  }, [distributions, payments]);

  // ─── Timeline data (daily events) ───
  const timelineData = useMemo(() => {
    const days = {};

    payments.forEach(p => {
      const date = new Date(parseInt(p.receivedAt) * 1000);
      const key = date.toISOString().split('T')[0];
      const token = getTokenByAddress(p.token);
      const amount = parseFloat(formatTokenAmount(p.amount, token.decimals, 6));

      if (!days[key]) days[key] = { date: key, received: 0, distributed: 0 };
      days[key].received += amount;
    });

    distributions.forEach(d => {
      const timestamp = d.createdAt;
      const date = new Date(parseInt(timestamp) * 1000);
      const key = date.toISOString().split('T')[0];
      const token = getTokenByAddress(d.payoutToken);
      const amount = parseFloat(formatTokenAmount(d.totalClaimed || '0', token.decimals, 6));

      if (!days[key]) days[key] = { date: key, received: 0, distributed: 0 };
      days[key].distributed += amount;
    });

    return Object.values(days)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        ...d,
        label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        received: parseFloat(d.received.toFixed(4)),
        distributed: parseFloat(d.distributed.toFixed(4)),
      }));
  }, [distributions, payments]);

  if (distributions.length === 0 && payments.length === 0) {
    return (
      <VStack py={8}>
        <Text color={INK.secondary} fontSize="sm">No financial activity yet</Text>
        <Text fontSize="xs" color={INK.muted}>
          Activity will appear here after deposits or payouts
        </Text>
      </VStack>
    );
  }

  return (
    <VStack spacing={5} align="stretch">
      {/* ─── Insight strip ─── */}
      <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={4}>
        <StatTile
          label="Total received"
          value={twoDp(stats.totalReceived)}
          unit={stats.tokenSymbol}
          subtext={`${stats.paymentCount} deposit${stats.paymentCount !== 1 ? 's' : ''}`}
          dot={COLORS.inflow}
        />
        <StatTile
          label="Shared with members"
          value={twoDp(stats.totalDistributed)}
          unit={stats.tokenSymbol}
          subtext={`${stats.distributionCount} payout${stats.distributionCount !== 1 ? 's' : ''}`}
          dot={COLORS.outflow}
        />
        <StatTile
          label="Claimed by members"
          value={twoDp(stats.totalClaimed)}
          unit={stats.tokenSymbol}
          subtext={`${stats.claimRate}% of what was shared`}
        />
      </SimpleGrid>

      {/* ─── Activity Chart ─── */}
      {timelineData.length > 0 && (
        <Box>
          <Box h={{ base: '170px', md: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} barGap={2}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'rgba(255,255,255,0.40)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.40)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend
                  wrapperStyle={{ fontSize: '11px' }}
                  iconType="square"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ color: 'rgba(255,255,255,0.66)' }}>{value}</span>
                  )}
                />
                <Bar dataKey="received" name="Money in" fill={COLORS.inflow} radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="distributed" name="Shared out" fill={COLORS.outflow} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Text fontSize="xs" color={INK.faint} mt={2}>
            Amounts shown in the org&apos;s main payout token.
          </Text>
        </Box>
      )}
    </VStack>
  );
};

export default HistoricalOverview;
