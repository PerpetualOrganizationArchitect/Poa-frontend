import React from 'react';
import {
  Box,
  Grid,
  HStack,
  Text,
  VStack,
  Image,
  Skeleton,
  Icon,
  Link,
} from '@chakra-ui/react';
import { FiExternalLink, FiChevronRight } from 'react-icons/fi';
import { formatTokenAmount } from '@/util/formatToken';
import { usePOContext } from '@/context/POContext';
import { ACCENT, INK, HAIRLINE, ROW_HOVER, TABULAR, SeriesDot } from './treasuryStyles';

const TokenIcon = ({ logo, symbol, tint }) => {
  const letter = (symbol || '?').charAt(0).toUpperCase();
  const fallback = (
    <Box
      w="28px"
      h="28px"
      borderRadius="full"
      bg={tint || 'rgba(255,255,255,0.10)'}
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      <Text fontWeight="bold" fontSize="xs" color="white">{letter}</Text>
    </Box>
  );
  if (!logo) return fallback;
  return (
    <Image
      src={logo}
      alt={symbol}
      boxSize="28px"
      borderRadius="full"
      objectFit="cover"
      flexShrink={0}
      fallback={fallback}
    />
  );
};

/** Small text tag — quieter than a Badge, still names the kind of asset.
 *  Hidden on the smallest screens, where the row captions carry the meaning. */
const KindTag = ({ children, color = INK.muted }) => (
  <Text
    as="span"
    display={{ base: 'none', sm: 'inline-block' }}
    fontSize="10px"
    fontWeight="600"
    letterSpacing="0.08em"
    textTransform="uppercase"
    color={color}
    border={HAIRLINE}
    borderRadius="4px"
    px={1.5}
    py={0.5}
    whiteSpace="nowrap"
    justifySelf="end"
  >
    {children}
  </Text>
);

// One shared column template so every amount sits on the same right edge:
// icon | name (flex) | amount | kind chip | chevron gutter (reserved on all rows)
const ROW_COLUMNS = { base: '28px 1fr auto 16px', sm: '28px 1fr 110px 118px 16px' };

/**
 * TokenBalancesGrid — the "What we hold" ledger.
 *
 * One hairline-ruled row per asset: stablecoins (counted in the hero $ total)
 * first, other tokens in native units, then the task-reward pool (the
 * TaskManager's own balance, which completed tasks pay bounties from), the
 * participation supply last. Amounts are right-aligned tabular figures on a
 * single shared edge, as in a bank-book.
 */
const TokenBalancesGrid = ({
  totalSupply,
  onPTClick,
  isLoading,
  erc20Balances = [],
  bountyPool = [],
  onFundBounties,
}) => {
  const { tokenLabel = 'Shares' } = usePOContext() || {};

  // Hide anything the member would read as zero: filter on the DISPLAYED
  // amount, not raw wei, so dust balances don't render as a "0.00" row.
  const displayAmount = (t) => formatTokenAmount(t.balance || '0', t.decimals, t.isStable ? 2 : 4);
  const fmt = (value, t) => formatTokenAmount(value || '0', t.decimals, t.isStable ? 2 : 4);
  const nonZero = erc20Balances.filter(t => parseFloat(displayAmount(t)) > 0);
  const stables = nonZero.filter(t => t.isStable);
  const others = nonZero.filter(t => !t.isStable);

  // The pool row stays visible at zero when live tasks still promise bounties —
  // an empty pot that owes money is exactly what the ledger must not hide.
  const poolRows = bountyPool.filter(
    t => parseFloat(displayAmount(t)) > 0 || BigInt(t.committed || '0') > 0n
  );

  const rows = [
    ...stables.map(t => ({
      key: t.symbol,
      icon: <TokenIcon logo={t.logo} symbol={t.symbol} tint="rgba(34,165,94,0.35)" />,
      symbol: t.symbol,
      caption: t.name,
      tag: <KindTag color={INK.secondary}>Cash · USD</KindTag>,
      amount: displayAmount(t),
      projectUrl: t.projectUrl,
    })),
    ...others.map(t => ({
      key: t.symbol,
      icon: <TokenIcon logo={t.logo} symbol={t.symbol} />,
      symbol: t.symbol,
      caption: `${t.name} · no $ price`,
      tag: <KindTag>Token</KindTag>,
      amount: displayAmount(t),
      projectUrl: t.projectUrl,
    })),
    ...poolRows.map(t => ({
      key: `pool-${t.symbol}-${t.address}`,
      icon: <TokenIcon logo={t.logo} symbol={t.symbol} tint="rgba(201,133,0,0.35)" />,
      symbol: t.symbol,
      caption: 'task-reward pool',
      tag: <KindTag>Task rewards</KindTag>,
      // An empty-but-owing pool renders as a real figure ("0.00", not "0") so
      // it sits on the ledger's shared decimal edge like every other amount.
      amount: parseFloat(displayAmount(t)) > 0 ? displayAmount(t) : (t.isStable ? '0.00' : '0'),
      projectUrl: t.projectUrl,
      shortNote: BigInt(t.shortfall || '0') > 0n
        ? {
            committed: fmt(t.committed, t),
            shortfall: fmt(t.shortfall, t),
            symbol: t.symbol,
          }
        : null,
    })),
  ];

  const supplyFormatted = formatTokenAmount(totalSupply || '0', 18, 0);
  const hasSupply = parseFloat(supplyFormatted) > 0;

  if (rows.length === 0 && !hasSupply && !isLoading) {
    return (
      <VStack py={4}>
        <Text color={INK.muted} fontSize="sm">Nothing in the treasury yet</Text>
      </VStack>
    );
  }

  if (isLoading && rows.length === 0) {
    return (
      <VStack spacing={2} align="stretch" py={1}>
        <Skeleton height="44px" borderRadius="md" />
        <Skeleton height="44px" borderRadius="md" />
      </VStack>
    );
  }

  const handlePTKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPTClick?.();
    }
  };

  return (
    <Box>
      {rows.map((row) => (
        <Box key={row.key} borderBottom={HAIRLINE}>
          <Grid
            templateColumns={ROW_COLUMNS}
            gap={3}
            py={3}
            alignItems="center"
          >
            {row.icon}
            <HStack spacing={2} minW={0}>
              <Text fontWeight="semibold" fontSize="sm" color={INK.primary} whiteSpace="nowrap">
                {row.symbol}
              </Text>
              <Text fontSize="xs" color={INK.muted} noOfLines={{ base: 2, sm: 1 }}>
                {row.caption}
              </Text>
              {row.projectUrl && (
                <Link
                  href={row.projectUrl}
                  isExternal
                  aria-label={`${row.symbol} project site`}
                  color={INK.muted}
                  _hover={{ color: 'purple.300' }}
                  display="inline-flex"
                  alignItems="center"
                  p={1.5}
                  m={-1.5}
                >
                  <Icon as={FiExternalLink} boxSize={3} />
                </Link>
              )}
            </HStack>
            <Text fontWeight="semibold" fontSize="sm" color={INK.primary} sx={TABULAR} textAlign="right">
              {row.amount}
            </Text>
            {row.tag}
            <Box />
          </Grid>
          {row.shortNote && (
            <HStack spacing={2} pb={3} pl={{ base: 0, sm: '40px' }} align="center">
              <SeriesDot color={ACCENT.attention} size="6px" />
              <Text fontSize="xs" color={INK.secondary}>
                Open tasks promise {row.shortNote.committed} {row.shortNote.symbol} — the pool
                is {row.shortNote.shortfall} short, so finishing them can't pay out yet.
              </Text>
              {onFundBounties && (
                <Text
                  as="button"
                  type="button"
                  onClick={onFundBounties}
                  fontSize="xs"
                  fontWeight="semibold"
                  color="purple.300"
                  whiteSpace="nowrap"
                  _hover={{ textDecoration: 'underline' }}
                >
                  Top up
                </Text>
              )}
            </HStack>
          )}
        </Box>
      ))}

      {/* Participation supply — the ownership denominator, clickable for detail */}
      {hasSupply && (
        <Grid
          templateColumns={ROW_COLUMNS}
          gap={3}
          py={3}
          alignItems="center"
          cursor="pointer"
          onClick={onPTClick}
          onKeyDown={handlePTKey}
          role="button"
          tabIndex={0}
          aria-label={`${tokenLabel} participation details`}
          borderRadius="md"
          mx={-2}
          px={2}
          transition="background 0.15s ease"
          _hover={{ bg: ROW_HOVER }}
          _focusVisible={{ bg: ROW_HOVER, outline: '1px solid rgba(144,85,232,0.6)' }}
        >
          <TokenIcon symbol={tokenLabel} tint="rgba(144,85,232,0.45)" />
          <HStack spacing={2} minW={0}>
            <Text fontWeight="semibold" fontSize="sm" color={INK.primary} whiteSpace="nowrap">
              {tokenLabel}
            </Text>
            <Text fontSize="xs" color={INK.muted} noOfLines={{ base: 2, sm: 1 }}>
              earned by working, sets each share
            </Text>
          </HStack>
          <Text fontWeight="semibold" fontSize="sm" color={INK.primary} sx={TABULAR} textAlign="right">
            {supplyFormatted}
          </Text>
          <KindTag color="purple.300">Participation</KindTag>
          <Icon as={FiChevronRight} boxSize={3.5} color={INK.muted} />
        </Grid>
      )}
    </Box>
  );
};

export default TokenBalancesGrid;
