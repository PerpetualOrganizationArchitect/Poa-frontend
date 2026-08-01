import React from 'react';
import NextLink from 'next/link';
import {
  Box,
  Flex,
  Text,
  HStack,
  Button,
  Tooltip,
  Icon,
  Skeleton,
  Link,
} from '@chakra-ui/react';
import {
  FiPlus,
  FiDownload,
  FiDollarSign,
  FiArrowDown,
  FiInfo,
  FiExternalLink,
  FiEye,
  FiCheckSquare,
} from 'react-icons/fi';
import { usePOContext } from '@/context/POContext';
import { useOrgName } from '@/hooks/useOrgName';
import { useTreasuryShare } from '@/hooks/useTreasuryShare';
import { getNetworkByChainId } from '@/config/networks';
import { getBountyTokenOptions } from '@/util/tokens';
import { INK, HAIRLINE, ACCENT, eyebrowStyle, MoneyFigure, TABULAR, useCountUp } from './treasuryStyles';

const formatPct = (frac) => {
  const pct = (Number(frac) || 0) * 100;
  if (pct === 0) return '0%';
  // Two decimals below 10% so the % reconciles with the $ under a calculator.
  return `${pct.toFixed(pct < 10 ? 2 : 1)}%`;
};

/** Hairline chip stating a concrete product promise. */
const TrustChip = ({ icon, children }) => (
  <HStack
    spacing={2}
    px={3}
    py={1.5}
    border={HAIRLINE}
    borderRadius="full"
    color={INK.secondary}
  >
    <Icon as={icon} boxSize={3.5} color={INK.muted} />
    <Text fontSize="xs" whiteSpace="nowrap">{children}</Text>
  </HStack>
);

/**
 * TreasuryHeader — Zone 1 hero: "What we hold + what's yours".
 *
 * One hero figure per view: the treasury's stablecoin holdings. The member's
 * estimated share sits beside it in a purple-ruled panel that always states
 * how the estimate becomes money. Admin actions are a quiet cluster — after
 * the money on phones, never before it.
 */
const TreasuryHeader = ({
  memberCount = 0,
  activeDistributionCount = 0,
  isAdmin = false,
  onCreateDistribution,
  onDeposit,
  onFundBounties,
  onClaimScroll,
  otherHoldings = [], // non-stable tokens held, [{ symbol, amount }] — shown but not $-counted
}) => {
  const { orgChainId, paymentManagerAddress, tokenLabel = 'Shares' } = usePOContext();
  const userDAO = useOrgName();
  const {
    treasuryShare,
    stableTotal,
    userSharePct,
    userPtBalance,
    totalPtSupply,
    isLoading,
  } = useTreasuryShare();

  const explorer = getNetworkByChainId(orgChainId)?.blockExplorer;
  const onChainHref = explorer && paymentManagerAddress
    ? `${explorer}/address/${paymentManagerAddress}`
    : null;

  // The stablecoin list is chain-specific — never name tokens the org can't hold.
  const stableSymbols = getBountyTokenOptions(orgChainId)
    .filter((t) => t.isStable)
    .map((t) => t.symbol)
    .join(', ');

  const hasShare = userSharePct > 0;
  const hasOpenPayouts = activeDistributionCount > 0;
  const isZero = !isLoading && (Number(stableTotal) || 0) === 0;

  // The money wakes up on arrival — figures count up once real data lands.
  const heroValue = useCountUp(isLoading ? 0 : stableTotal);
  const shareValue = useCountUp(isLoading || !hasShare ? 0 : treasuryShare);

  const othersText = otherHoldings
    .map((t) => `${t.amount} ${t.symbol}`)
    .join(', ');

  // Admin/actions cluster — rendered twice: in the title row on desktop, and
  // AFTER the money on phones (answers before asks).
  const actionButtons = (
    <HStack spacing={1} flexWrap="wrap" rowGap={1}>
      {onDeposit && (
        <Button
          leftIcon={<FiDownload />}
          variant="ghost"
          color={INK.secondary}
          _hover={{ color: 'white', bg: 'rgba(255,255,255,0.06)' }}
          size="sm"
          fontWeight="medium"
          onClick={onDeposit}
        >
          Deposit
        </Button>
      )}
      {onFundBounties && (
        <Button
          leftIcon={<FiDollarSign />}
          variant="ghost"
          color={INK.secondary}
          _hover={{ color: 'white', bg: 'rgba(255,255,255,0.06)' }}
          size="sm"
          fontWeight="medium"
          onClick={onFundBounties}
        >
          Fund task rewards
        </Button>
      )}
      {isAdmin && (
        <Button
          leftIcon={<FiPlus />}
          colorScheme="purple"
          variant="outline"
          size="sm"
          onClick={onCreateDistribution}
        >
          Propose a payout
        </Button>
      )}
    </HStack>
  );

  return (
    <Box p={{ base: 4, md: 8 }} pb={{ base: 2, md: 4 }}>
      {/* Title row — actions ride along on desktop only */}
      <Flex
        direction={{ base: 'column', md: 'row' }}
        justify="space-between"
        align={{ base: 'flex-start', md: 'center' }}
        gap={4}
      >
        <Text
          fontSize={{ base: '2xl', md: '3xl' }}
          fontWeight="bold"
          letterSpacing="-0.02em"
        >
          Our Shared Treasury
        </Text>
        <Box display={{ base: 'none', md: 'block' }} flexShrink={0}>
          {actionButtons}
        </Box>
      </Flex>

      {/* Trust promises — concrete, not prose */}
      <HStack spacing={2} mt={3} flexWrap="wrap" rowGap={2}>
        <TrustChip icon={FiEye}>Visible to every member</TrustChip>
        <TrustChip icon={FiCheckSquare}>Big spending needs a vote</TrustChip>
      </HStack>

      {/* The ledger opening: holdings hero + your share */}
      <Flex
        direction={{ base: 'column', lg: 'row' }}
        gap={{ base: 6, lg: 12 }}
        mt={{ base: 6, md: 10 }}
        align="stretch"
      >
        {/* Hero figure — the one big number on this page */}
        <Box flex="1.4">
          <HStack spacing={3} align="center" mb={3}>
            <Text as="span" sx={eyebrowStyle}>In the treasury</Text>
            <Box flex={1} borderTop={HAIRLINE} />
          </HStack>

          {isLoading ? (
            <Skeleton height="72px" width="280px" />
          ) : (
            <MoneyFigure value={isZero ? 0 : heroValue} size="hero" />
          )}

          <Box mt={3}>
            <HStack spacing={3} color={INK.secondary} fontSize="xs" flexWrap="wrap" rowGap={1}>
              <Text>
                {isZero
                  ? `Cash counts stablecoins only${stableSymbols ? ` (${stableSymbols})` : ''}.`
                  : `Held in stablecoins${stableSymbols ? ` (${stableSymbols}, each ≈ $1)` : ''}.`}
              </Text>
              {onChainHref && (
                <Link href={onChainHref} isExternal color="purple.300" whiteSpace="nowrap" fontSize="xs">
                  Proof <Icon as={FiExternalLink} boxSize={3} mb="1px" />
                </Link>
              )}
            </HStack>
            {othersText && (
              <Text fontSize="xs" color={INK.secondary} mt={1}>
                Also held: {othersText}. No reliable dollar price, so it isn&apos;t counted.
              </Text>
            )}
          </Box>
        </Box>

        {/* Your share — the member's panel, ruled and washed in the ownership color */}
        <Box
          flex="1"
          pl={{ base: 4, lg: 6 }}
          pr={4}
          py={3}
          borderLeft={`3px solid ${ACCENT.out}`}
          borderRightRadius="lg"
          bgGradient="linear(to-r, rgba(144,85,232,0.07), transparent 65%)"
        >
          <HStack spacing={2} align="center" mb={3}>
            <Text as="span" sx={eyebrowStyle} whiteSpace="nowrap">Your estimated share</Text>
            <Tooltip
              hasArrow
              placement="top"
              label="Your slice of participation applied to the treasury's cash. It moves as either changes. Exact claim amounts appear on each payout below."
            >
              <Box as="button" type="button" aria-label="How your share is estimated" display="flex" p={1} m={-1}>
                <Icon as={FiInfo} boxSize={3} color={INK.muted} />
              </Box>
            </Tooltip>
            <Box flex={1} borderTop={HAIRLINE} />
          </HStack>

          {isLoading ? (
            <Skeleton height="40px" width="150px" />
          ) : hasShare ? (
            <>
              <MoneyFigure value={shareValue} size="panel" />
              <Text fontSize="sm" color={INK.secondary} mt={2} sx={TABULAR}>
                {formatPct(userSharePct)} of participation (your {userPtBalance} of {totalPtSupply} {tokenLabel})
              </Text>
              <Text fontSize="xs" color={INK.muted} mt={0.5}>
                {memberCount} members share this treasury
              </Text>
              {/* The loop closer: how the estimate becomes money, always stated */}
              <Text fontSize="xs" color={INK.secondary} mt={3}>
                {hasOpenPayouts
                  ? 'A payout is open now. Check yours below.'
                  : 'It becomes money when the group votes to run a payout. Claims appear below.'}
              </Text>
              {hasOpenPayouts && (
                <Button
                  mt={3}
                  leftIcon={<FiArrowDown />}
                  colorScheme="purple"
                  size="md"
                  onClick={onClaimScroll}
                >
                  Check open payouts
                </Button>
              )}
            </>
          ) : (
            <>
              <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="semibold" color={INK.secondary} lineHeight="1.2">
                Not earning a share yet
              </Text>
              <Text fontSize="xs" color={INK.muted} mt={2}>
                Complete tasks to start earning one.
                {memberCount > 0 && ` ${memberCount} members share this treasury.`}
              </Text>
              <Button
                as={NextLink}
                href={`/tasks/?org=${encodeURIComponent(userDAO || '')}`}
                mt={3}
                size="xs"
                variant="outline"
                colorScheme="purple"
              >
                Browse tasks
              </Button>
            </>
          )}
        </Box>
      </Flex>

      {/* On phones the actions come after the money — answers before asks */}
      <Box display={{ base: 'block', md: 'none' }} mt={5}>
        {actionButtons}
      </Box>
    </Box>
  );
};

export default TreasuryHeader;
