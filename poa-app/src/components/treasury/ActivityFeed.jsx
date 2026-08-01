import React, { useMemo, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Link,
  Icon,
  Button,
  Collapse,
  useBreakpointValue,
} from '@chakra-ui/react';
import { FiExternalLink, FiChevronRight } from 'react-icons/fi';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';
import { getNetworkByChainId } from '@/config/networks';
import { usePOContext } from '@/context/POContext';
import UserIdentity from '@/components/common/UserIdentity';
import {
  ACCENT,
  INK,
  HAIRLINE,
  HAIRLINE_STRONG,
  ROW_HOVER,
  TABULAR,
  eyebrowStyle,
  SeriesDot,
} from './treasuryStyles';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'Money in' },
  { key: 'out', label: 'Shared out' },
  { key: 'gas', label: 'Fees' },
];

// Identity per flow: the dot wears the accent; text stays in ink tokens.
// Fee rows sit quiet — they're operational noise next to the money story.
const KIND = {
  'in':        { label: 'Money in',    dot: ACCENT.in,  quiet: false },
  'out':       { label: 'Shared out',  dot: ACCENT.out, quiet: false },
  'gas-in':    { label: 'Fees added',  dot: ACCENT.gas, quiet: true },
  'gas-out':   { label: 'Fee covered', dot: ACCENT.gas, quiet: true },
  'gas-group': { label: 'Fees',        dot: ACCENT.gas, quiet: true },
};

const MAX_ROWS = 20;

/**
 * ActivityFeed — the shared ledger. One chronological feed merging four event
 * sources: incoming payments, payouts, fee top-ups, and covered fees. Runs of
 * covered fees on the same day collapse into one expandable band so the money
 * story is never buried under fee dust. Every address routes through
 * UserIdentity; every row keeps its on-chain proof link.
 */
const ActivityFeed = ({
  distributions = [],
  payments = [],
  gasDepositEvents = [],
  gasUsageEvents = [],
}) => {
  const { orgChainId } = usePOContext();
  const isMobile = useBreakpointValue({ base: true, md: false });
  // Money in leads by default — the ledger's job is the money story; fees and
  // the full stream are one tap away.
  const [filter, setFilter] = useState('in');
  const [expanded, setExpanded] = useState(() => new Set());

  const network = getNetworkByChainId(orgChainId);
  const nativeSymbol = network?.nativeCurrency?.symbol || 'ETH';
  const explorer = network?.blockExplorer;

  const rows = useMemo(() => {
    const paymentRows = payments.map((p) => {
      const token = getTokenByAddress(p.token);
      return {
        id: `pay-${p.id}`,
        kind: 'in',
        sign: '+',
        amount: `${formatTokenAmount(p.amount, token.decimals, 2)} ${token.symbol}`,
        timestamp: parseInt(p.receivedAt),
        fromAddress: p.payer,
        fromUsername: p.payerUsername || null,
        detail: null,
        txHash: p.transactionHash,
      };
    });

    const distRows = distributions.map((d) => {
      const token = getTokenByAddress(d.payoutToken);
      return {
        id: `dist-${d.id}`,
        kind: 'out',
        sign: '−',
        amount: `${formatTokenAmount(d.totalAmount, token.decimals, 2)} ${token.symbol}`,
        timestamp: parseInt(d.finalizedAt || d.createdAt),
        fromAddress: null,
        fromUsername: null,
        detail: `${d.claims?.length || 0} members claimed`,
        txHash: d.claims?.[0]?.transactionHash,
      };
    });

    const gasInRows = gasDepositEvents.map((e) => ({
      id: `gasd-${e.id}`,
      kind: 'gas-in',
      sign: '+',
      amount: `${formatTokenAmount(e.amount, 18, 6)} ${nativeSymbol}`,
      timestamp: parseInt(e.eventAt),
      fromAddress: e.from,
      fromUsername: null,
      detail: null,
      txHash: e.transactionHash,
    }));

    const gasOutRows = gasUsageEvents.map((e) => ({
      id: `gasu-${e.id}`,
      kind: 'gas-out',
      sign: '−',
      amount: `${formatTokenAmount(e.delta, 18, 6)} ${nativeSymbol}`,
      timestamp: parseInt(e.eventAt),
      rawWei: e.delta || '0',
      fromAddress: null,
      fromUsername: null,
      detail: 'Network fee covered',
      txHash: e.transactionHash,
    }));

    return [...paymentRows, ...distRows, ...gasInRows, ...gasOutRows].sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }, [distributions, payments, gasDepositEvents, gasUsageEvents, nativeSymbol]);

  const dayOf = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

  // Collapse same-day runs of covered fees into one expandable band.
  const grouped = useMemo(() => {
    const out = [];
    let run = [];
    const flush = () => {
      if (run.length === 0) return;
      if (run.length === 1) {
        out.push(run[0]);
      } else {
        const sum = run.reduce((acc, r) => acc + BigInt(r.rawWei || '0'), 0n);
        out.push({
          id: `fees-${run[0].id}`,
          kind: 'gas-group',
          sign: '−',
          amount: `${formatTokenAmount(sum.toString(), 18, 6)} ${nativeSymbol}`,
          timestamp: run[0].timestamp,
          detail: `${run.length} network fees covered`,
          children: run,
        });
      }
      run = [];
    };
    for (const r of rows) {
      if (r.kind === 'gas-out') {
        if (run.length > 0 && dayOf(run[0].timestamp) !== dayOf(r.timestamp)) flush();
        run.push(r);
      } else {
        flush();
        out.push(r);
      }
    }
    flush();
    return out;
  }, [rows, nativeSymbol]);

  const filtered = useMemo(() => {
    if (filter === 'all') return grouped.slice(0, MAX_ROWS);
    // Filtered views show individual rows — no grouping to hide behind.
    const match = (kind) =>
      filter === 'gas' ? kind.startsWith('gas') : kind === filter;
    return rows.filter((r) => match(r.kind)).slice(0, MAX_ROWS);
  }, [rows, grouped, filter]);

  const shownEntries = filtered.reduce((n, r) => n + (r.children?.length || 1), 0);

  // Per-filter counts, shown on the pills so the ledger's totals cross-foot
  // on screen ("54 entries" = money in + shared out + fees, visibly).
  const counts = useMemo(() => ({
    all: rows.length,
    in: rows.filter((r) => r.kind === 'in').length,
    out: rows.filter((r) => r.kind === 'out').length,
    gas: rows.filter((r) => r.kind.startsWith('gas')).length,
  }), [rows]);
  const totalEntries = counts[filter];

  const txHref = (h) => (explorer && h ? `${explorer}/tx/${h}` : null);
  const formatDate = (ts) =>
    new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (rows.length === 0) {
    return (
      <VStack py={6}>
        <Text color={INK.secondary} fontSize="sm">No activity yet</Text>
        <Text fontSize="xs" color={INK.muted}>Deposits, payouts, and fees appear here.</Text>
      </VStack>
    );
  }

  const toggleGroup = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const kindCell = (r) => (
    <HStack spacing={1.5}>
      <SeriesDot color={KIND[r.kind].dot} size="6px" />
      <Text fontSize="xs" color={KIND[r.kind].quiet ? INK.muted : INK.secondary} whiteSpace="nowrap">
        {KIND[r.kind].label}
      </Text>
    </HStack>
  );

  const detailCell = (r) => {
    if (r.fromAddress) {
      return (
        <HStack spacing={1}>
          <Text color={INK.muted}>From</Text>
          <UserIdentity
            address={r.fromAddress}
            usernameHint={r.fromUsername}
            size="2xs"
            nameFontSize="xs"
            nameColor="gray.300"
          />
        </HStack>
      );
    }
    return <Text color={INK.muted}>{r.detail || ''}</Text>;
  };

  const proofLink = (r) =>
    txHref(r.txHash) ? (
      <Link
        href={txHref(r.txHash)}
        isExternal
        aria-label="View transaction proof"
        display="inline-flex"
        p={2}
        m={-2}
        color={INK.muted}
        _hover={{ color: 'purple.300' }}
      >
        <Icon as={FiExternalLink} boxSize={3.5} />
      </Link>
    ) : null;

  const amountColor = (r) => (KIND[r.kind].quiet ? INK.muted : INK.primary);

  const filterBar = (
    <HStack
      spacing={0}
      mb={4}
      border={HAIRLINE_STRONG}
      borderRadius="full"
      p="3px"
      w="fit-content"
      maxW="100%"
      overflowX="auto"
    >
      {FILTERS.map((f) => (
        <Button
          key={f.key}
          size="xs"
          h="26px"
          px={3}
          borderRadius="full"
          variant="unstyled"
          display="inline-flex"
          alignItems="center"
          fontWeight={filter === f.key ? 'semibold' : 'medium'}
          color={filter === f.key ? 'white' : INK.muted}
          bg={filter === f.key ? 'rgba(144,85,232,0.55)' : 'transparent'}
          _hover={{ color: 'white' }}
          onClick={() => setFilter(f.key)}
          flexShrink={0}
        >
          {f.label}
          <Text as="span" ml={1.5} fontWeight="normal" opacity={0.75} sx={TABULAR}>
            {counts[f.key]}
          </Text>
        </Button>
      ))}
    </HStack>
  );

  const footer = totalEntries > shownEntries && (
    <Text fontSize="xs" color={INK.muted} mt={3} sx={TABULAR}>
      Latest {shownEntries} of {totalEntries} entries. Every entry has proof.
    </Text>
  );

  const EMPTY_FILTER_COPY = {
    in: 'No money in yet. Deposits appear here.',
    out: 'Nothing shared out yet. Payouts appear here.',
    gas: 'No network fees yet.',
    all: 'No activity yet.',
  };
  const emptyFiltered = filtered.length === 0 && (
    <Text fontSize="sm" color={INK.muted} py={5} textAlign="center">
      {EMPTY_FILTER_COPY[filter]}
    </Text>
  );

  if (isMobile) {
    return (
      <Box>
        {filterBar}
        {emptyFiltered}
        <VStack spacing={0} align="stretch">
          {filtered.map((r) => {
            const isGroup = r.kind === 'gas-group';
            const isOpen = isGroup && expanded.has(r.id);
            return (
              <Box key={r.id} borderBottom={HAIRLINE}>
                <Box
                  py={3}
                  onClick={isGroup ? () => toggleGroup(r.id) : undefined}
                  cursor={isGroup ? 'pointer' : 'default'}
                  role={isGroup ? 'button' : undefined}
                  tabIndex={isGroup ? 0 : undefined}
                  aria-expanded={isGroup ? isOpen : undefined}
                  aria-label={isGroup ? `${r.detail}, ${isOpen ? 'collapse' : 'expand'}` : undefined}
                  onKeyDown={isGroup ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleGroup(r.id);
                    }
                  } : undefined}
                  _focusVisible={{ bg: ROW_HOVER, outline: '1px solid rgba(144,85,232,0.6)', outlineOffset: '-1px' }}
                >
                  <HStack justify="space-between" mb={1}>
                    <HStack spacing={1.5}>
                      {kindCell(r)}
                      {isGroup && (
                        <Icon
                          as={FiChevronRight}
                          boxSize={3.5}
                          color={INK.muted}
                          transform={isOpen ? 'rotate(90deg)' : 'none'}
                          transition="transform 0.2s ease"
                        />
                      )}
                    </HStack>
                    <Text fontSize="xs" color={INK.muted} sx={TABULAR}>{formatDate(r.timestamp)}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="semibold" fontSize="sm" color={amountColor(r)} sx={TABULAR}>
                      {r.sign}{r.amount}
                    </Text>
                    {!isGroup && proofLink(r)}
                  </HStack>
                  <Box fontSize="xs" mt={0.5}>{detailCell(r)}</Box>
                </Box>
                {isGroup && (
                  <Collapse in={isOpen} animateOpacity>
                    {r.children.map((c) => (
                      <HStack key={c.id} justify="space-between" py={2} pl={4} borderTop={HAIRLINE}>
                        <Text fontSize="xs" color={INK.muted} sx={TABULAR}>
                          {c.sign}{c.amount}
                        </Text>
                        {proofLink(c)}
                      </HStack>
                    ))}
                  </Collapse>
                )}
              </Box>
            );
          })}
        </VStack>
        {footer}
      </Box>
    );
  }

  let prevDate = null;

  return (
    <Box>
      {filterBar}
      <Box overflowX="auto" role="table" aria-label="Treasury activity ledger">
        {/* Ledger header */}
        <HStack
          role="row"
          spacing={4}
          pb={2}
          borderBottom={HAIRLINE_STRONG}
          sx={{ '& > *': { ...eyebrowStyle, fontSize: '10px', whiteSpace: 'nowrap' } }}
        >
          <Text role="columnheader" w="110px" flexShrink={0}>When</Text>
          <Text role="columnheader" w="110px" flexShrink={0}>Activity</Text>
          <Text role="columnheader" flex={1} textAlign="right">Amount</Text>
          <Text role="columnheader" w="220px" flexShrink={0} pl={6}>Details</Text>
          <Text role="columnheader" w="56px" flexShrink={0} textAlign="right">Proof</Text>
        </HStack>

        {emptyFiltered}
        {filtered.map((r) => {
          const isGroup = r.kind === 'gas-group';
          const isOpen = isGroup && expanded.has(r.id);
          const dateStr = formatDate(r.timestamp);
          const showDate = dateStr !== prevDate;
          prevDate = dateStr;

          const mainRow = (
            <HStack
              role="row"
              key={r.id}
              spacing={4}
              py={2.5}
              borderBottom={isOpen ? 'none' : HAIRLINE}
              transition="background 0.12s ease"
              _hover={{ bg: ROW_HOVER }}
              onClick={isGroup ? () => toggleGroup(r.id) : undefined}
              cursor={isGroup ? 'pointer' : 'default'}
              tabIndex={isGroup ? 0 : undefined}
              aria-expanded={isGroup ? isOpen : undefined}
              aria-label={isGroup ? `${r.detail}, ${isOpen ? 'collapse' : 'expand'}` : undefined}
              onKeyDown={isGroup ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleGroup(r.id);
                }
              } : undefined}
              _focusVisible={{ bg: ROW_HOVER, outline: '1px solid rgba(144,85,232,0.6)', outlineOffset: '-1px' }}
            >
              <Text role="cell" w="110px" flexShrink={0} fontSize="xs" color={showDate ? INK.muted : 'transparent'} sx={TABULAR}>
                {dateStr}
              </Text>
              <Box role="cell" w="110px" flexShrink={0}>{kindCell(r)}</Box>
              <Text
                role="cell"
                flex={1}
                textAlign="right"
                fontWeight="semibold"
                fontSize="sm"
                color={amountColor(r)}
                sx={TABULAR}
              >
                {r.sign}{r.amount}
              </Text>
              <Box role="cell" w="220px" flexShrink={0} pl={6} fontSize="xs">{detailCell(r)}</Box>
              <Box role="cell" w="56px" flexShrink={0} textAlign="right">
                {isGroup ? (
                  <Icon
                    as={FiChevronRight}
                    boxSize={3.5}
                    color={INK.muted}
                    aria-hidden="true"
                    transform={isOpen ? 'rotate(90deg)' : 'none'}
                    transition="transform 0.2s ease"
                  />
                ) : proofLink(r)}
              </Box>
            </HStack>
          );

          if (!isGroup) return mainRow;
          return (
            <Box key={r.id} borderBottom={isOpen ? HAIRLINE : 'none'}>
              {mainRow}
              <Collapse in={isOpen} animateOpacity>
                {r.children.map((c) => (
                  <HStack role="row" key={c.id} spacing={4} py={1.5} pl="126px" _hover={{ bg: ROW_HOVER }}>
                    <Box role="cell" w="110px" flexShrink={0}>
                      <Text fontSize="xs" color={INK.muted}>Fee covered</Text>
                    </Box>
                    <Text role="cell" flex={1} textAlign="right" fontSize="xs" color={INK.muted} sx={TABULAR}>
                      {c.sign}{c.amount}
                    </Text>
                    <Box role="cell" w="220px" flexShrink={0} pl={6} />
                    <Box role="cell" w="56px" flexShrink={0} textAlign="right">{proofLink(c)}</Box>
                  </HStack>
                ))}
              </Collapse>
            </Box>
          );
        })}
      </Box>
      {footer}
    </Box>
  );
};

export default ActivityFeed;
