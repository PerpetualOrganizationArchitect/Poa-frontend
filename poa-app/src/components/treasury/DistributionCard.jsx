import React, { useState } from 'react';
import {
  Box,
  Flex,
  HStack,
  Text,
  Progress,
  Button,
  Link,
  Icon,
  Skeleton,
  useToast,
} from '@chakra-ui/react';
import { FiExternalLink, FiCheck } from 'react-icons/fi';
import { useAuth } from '@/context/AuthContext';
import { usePOContext } from '@/context/POContext';
import UserIdentity from '@/components/common/UserIdentity';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';
import { getNetworkByChainId } from '@/config/networks';
import {
  ACCENT,
  INK,
  HAIRLINE,
  TABULAR,
  eyebrowStyle,
  SeriesDot,
  LiveDot,
  useMountedValue,
  FILL_TRANSITION,
} from './treasuryStyles';

/**
 * DistributionCard — one payout as a full-width ledger band.
 * Left: which payout. Middle: how much has been claimed. Right: your moment —
 * the amount you can claim and the button, or a calm note when you're not in it.
 * Public facts (name, progress, totals) always render at full contrast; only
 * the personal column softens when the payout isn't yours.
 */
const DistributionCard = ({
  distribution,
  paymentManagerAddress,
  refetch,
  onClaim,
  claimData,       // { amount, proof } if user has a share, null if loading/not found
  isLoadingClaim,  // true while fetching IPFS tree
  claimNotFound,   // true if user has no share in this distribution
  claimError,      // true if the share lookup failed (IPFS error)
}) => {
  const [isClaiming, setIsClaiming] = useState(false);
  const { accountAddress: address } = useAuth();
  const { orgChainId } = usePOContext();
  const toast = useToast();

  const token = getTokenByAddress(distribution.payoutToken);
  const totalAmount = formatTokenAmount(distribution.totalAmount, token.decimals, 2);
  const totalClaimed = formatTokenAmount(distribution.totalClaimed, token.decimals, 2);

  // Progress via BigInt ratio — Number() on 18-decimal wei loses precision.
  const progressPercent = distribution.totalAmount && distribution.totalAmount !== '0'
    ? Number((BigInt(distribution.totalClaimed || '0') * 10000n) / BigInt(distribution.totalAmount)) / 100
    : 0;
  // Fills in on arrival instead of popping (no-op under reduced motion).
  const shownProgress = useMountedValue(progressPercent);

  // "Active" on-chain but empty in practice — don't advertise it as claimable.
  const isFullyClaimed = distribution.totalAmount && distribution.totalAmount !== '0'
    && BigInt(distribution.totalClaimed || '0') >= BigInt(distribution.totalAmount);

  const userClaim = distribution.claims?.find(
    c => c.claimer?.toLowerCase() === address?.toLowerCase()
  );
  const hasClaimed = !!userClaim;

  const dateStr = new Date(parseInt(distribution.createdAt) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const explorer = getNetworkByChainId(orgChainId)?.blockExplorer;
  const onChainHref = explorer && paymentManagerAddress
    ? `${explorer}/address/${paymentManagerAddress}`
    : null;

  const isOpen = distribution.status === 'Active' && !isFullyClaimed;
  const notMine = !hasClaimed && claimNotFound;
  const accent = hasClaimed ? ACCENT.in : notMine ? 'rgba(255,255,255,0.12)' : ACCENT.out;

  const status = isOpen
    ? { dot: ACCENT.in, label: 'Open to claim', color: INK.secondary }
    : isFullyClaimed
      ? { dot: 'rgba(255,255,255,0.30)', label: 'Fully claimed', color: INK.muted }
      : { dot: 'rgba(255,255,255,0.30)', label: 'Closed', color: INK.muted };

  const handleClaim = async () => {
    if (!onClaim) return;

    setIsClaiming(true);
    try {
      await onClaim(distribution.distributionId);
      toast({
        title: 'Claim submitted',
        description: 'Your claim has been submitted. Please wait for confirmation.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      refetch?.();
    } catch (error) {
      console.error('Claim error:', error);
      toast({
        title: 'Claim failed',
        description: error.message || 'Failed to claim distribution',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <Flex
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'stretch', md: 'center' }}
      gap={{ base: 4, md: 6 }}
      py={{ base: 4, md: 5 }}
      px={{ base: 4, md: 5 }}
      borderLeft={`3px solid ${accent}`}
      borderBottom={HAIRLINE}
      transition="background 0.15s ease"
      _hover={{ bg: 'rgba(255,255,255,0.02)' }}
    >
      {/* Which payout — always full contrast: the ledger is public */}
      <Box minW={{ md: '200px' }}>
        <HStack spacing={2} align="center">
          <Text fontWeight="bold" fontSize="md" color={INK.primary}>
            Payout #{distribution.distributionId}
          </Text>
          <HStack spacing={1.5}>
            {isOpen
              ? <LiveDot color={status.dot} size="6px" />
              : <SeriesDot color={status.dot} size="6px" />}
            <Text fontSize="xs" color={status.color}>{status.label}</Text>
          </HStack>
        </HStack>
        <HStack spacing={2} mt={1} fontSize="xs" color={INK.muted}>
          <Text>{dateStr}</Text>
          {onChainHref && (
            <Link href={onChainHref} isExternal color="purple.300">
              Proof <Icon as={FiExternalLink} boxSize={3} mb="1px" />
            </Link>
          )}
        </HStack>
      </Box>

      {/* How the pool is going */}
      <Box flex={1}>
        <Progress
          value={shownProgress}
          borderRadius="full"
          size="xs"
          bg="rgba(144,85,232,0.16)"
          sx={{ '& > div': { background: ACCENT.out, transition: FILL_TRANSITION } }}
        />
        <HStack justify="space-between" mt={1.5} align="center">
          <Text fontSize="xs" color={INK.muted} sx={TABULAR}>
            {totalClaimed} of {totalAmount} {token.symbol} claimed
          </Text>
          {/* Name who claimed — an open ledger doesn't do anonymous payouts */}
          {(distribution.claims?.length || 0) > 0 && (distribution.claims?.length || 0) <= 2 ? (
            <HStack spacing={1.5} fontSize="xs" color={INK.muted}>
              <Text>by</Text>
              {distribution.claims.map((c) => (
                <UserIdentity
                  key={c.claimer}
                  address={c.claimer}
                  size="2xs"
                  nameFontSize="xs"
                  nameColor="gray.300"
                />
              ))}
            </HStack>
          ) : (
            <Text fontSize="xs" color={INK.muted} sx={TABULAR}>
              {distribution.claims?.length || 0} member{(distribution.claims?.length || 0) === 1 ? '' : 's'}
            </Text>
          )}
        </HStack>
      </Box>

      {/* Your moment — the personal plane, separated by a hairline */}
      <Box
        minW={{ md: '240px' }}
        pt={{ base: 3, md: 0 }}
        pl={{ md: 6 }}
        borderTop={{ base: HAIRLINE, md: 'none' }}
        borderLeft={{ md: HAIRLINE }}
      >
        {hasClaimed && userClaim?.amount ? (
          <HStack spacing={2}>
            <Icon as={FiCheck} color={ACCENT.in} boxSize={4} />
            <Box>
              <Text fontSize="sm" fontWeight="semibold" color={INK.primary} sx={TABULAR}>
                {formatTokenAmount(userClaim.amount, token.decimals, 4)} {token.symbol}
              </Text>
              <Text fontSize="xs" color={INK.muted}>claimed by you</Text>
            </Box>
          </HStack>
        ) : notMine ? (
          <Box>
            <Text fontSize="sm" color={INK.secondary}>
              You&apos;re not in this payout.
            </Text>
            <Text fontSize="xs" color={INK.muted} mt={1}>
              Member lists lock at creation. Your share counts toward the next one.
            </Text>
          </Box>
        ) : claimError ? (
          <Text fontSize="sm" color={INK.secondary}>
            Couldn&apos;t load your share. Refresh to retry.
          </Text>
        ) : isLoadingClaim ? (
          <HStack spacing={3}>
            <Skeleton height="20px" width="90px" />
            <Text fontSize="xs" color={INK.muted}>Checking your share…</Text>
          </HStack>
        ) : claimData ? (
          <Flex
            align="center"
            justify={{ base: 'space-between', md: 'flex-end' }}
            gap={4}
          >
            <Box textAlign={{ md: 'right' }}>
              <Text as="span" sx={{ ...eyebrowStyle, fontSize: '10px' }}>You can claim</Text>
              <Text fontSize="xl" fontWeight="bold" color={INK.primary} lineHeight="1.2" sx={TABULAR}>
                {formatTokenAmount(claimData.amount, token.decimals, 4)} {token.symbol}
              </Text>
            </Box>
            {isOpen && (
              <Button
                colorScheme="purple"
                size="sm"
                onClick={handleClaim}
                isLoading={isClaiming}
                loadingText="Claiming…"
                isDisabled={!address}
                flexShrink={0}
                transition="transform 0.15s ease, box-shadow 0.2s ease"
                _hover={{
                  transform: 'translateY(-1px)',
                  boxShadow: '0 6px 18px rgba(144, 85, 232, 0.35)',
                }}
                _active={{ transform: 'translateY(0)' }}
              >
                Claim
              </Button>
            )}
          </Flex>
        ) : (
          <Text fontSize="xs" color={INK.muted}>Loading…</Text>
        )}
      </Box>
    </Flex>
  );
};

export default DistributionCard;
