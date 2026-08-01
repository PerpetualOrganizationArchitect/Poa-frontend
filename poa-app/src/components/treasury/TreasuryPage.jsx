import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useTour } from '@/features/tour';
import {
  Box,
  VStack,
  Grid,
  GridItem,
  Text,
  Center,
  useDisclosure,
  usePrefersReducedMotion,
} from '@chakra-ui/react';
import PulseLoader from "@/components/shared/PulseLoader";
import { useRouter } from 'next/router';
import { useQuery } from '@apollo/client';
import { getClient, useSubgraphClient } from '@/util/apolloClient';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useOrgName } from '@/hooks/useOrgName';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import { FETCH_TREASURY_DATA, FETCH_INFRASTRUCTURE_ADDRESSES } from '@/util/queries';
import { FETCH_GAS_POOL_DATA } from '@/util/passkeyQueries';
import { getBountyTokenOptions } from '@/util/tokens';
import { formatTokenAmount } from '@/util/formatToken';
import { createChainClients } from '@/services/web3/utils/chainClients';
import TreasuryHeader from './TreasuryHeader';
import TokenBalancesGrid from './TokenBalancesGrid';
import CurrentDistributions from './CurrentDistributions';
import HistoricalOverview from './HistoricalOverview';
import ActivityFeed from './ActivityFeed';
import ParticipationTokenModal from './ParticipationTokenModal';
import DepositModal from './DepositModal';
import CreateDistributionModal from './CreateDistributionModal';
import GasPoolSection from './GasPoolSection';
import GasPoolDepositModal from './GasPoolDepositModal';
import { SectionHeader, LEDGER_GLASS, Rise, flashRing } from './treasuryStyles';
import { useOrgTheme } from '@/hooks';
import { useOrgGate } from '@/components/shared/OrgDeadEnd';

// The ledger's glass surface — the accent palette in treasuryStyles.js was
// validated against this exact opacity over the mint page.
const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: LEDGER_GLASS,
};

const BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

const TreasuryPage = () => {
  const router = useRouter();
  const userDAO = useOrgName();
  const orgGate = useOrgGate();
  const {
    orgId,
    poContextLoading,
    poMembers,
    participationTokenAddress,
    taskManagerContractAddress: taskManagerAddress,
    hybridVotingContractAddress,
    subgraphUrl,
    hideTreasury,
    orgChainId,
  } = usePOContext();
  const { hasExecRole } = useUserContext();
  const { pageBackground } = useOrgTheme();

  // Redirect to dashboard if treasury is hidden (skip during tour to prevent bricking)
  const { isActive: isTourActive } = useTour();
  useEffect(() => {
    if (hideTreasury && !poContextLoading && !isTourActive) {
      router.replace(`/dashboard/?org=${encodeURIComponent(userDAO)}`);
    }
  }, [hideTreasury, poContextLoading, isTourActive, router, userDAO]);

  // Modal state
  const { isOpen: isPTModalOpen, onOpen: onPTModalOpen, onClose: onPTModalClose } = useDisclosure();
  const { isOpen: isDepositOpen, onOpen: onDepositOpen, onClose: onDepositClose } = useDisclosure();
  const { isOpen: isBountyDepositOpen, onOpen: onBountyDepositOpen, onClose: onBountyDepositClose } = useDisclosure();
  const { isOpen: isCreateDistOpen, onOpen: onCreateDistOpen, onClose: onCreateDistClose } = useDisclosure();
  const { isOpen: isGasPoolDepositOpen, onOpen: onGasPoolDepositOpen, onClose: onGasPoolDepositClose } = useDisclosure();

  const client = useSubgraphClient(subgraphUrl);

  // Fetch treasury data from subgraph
  const { data: treasuryData, loading: treasuryLoading, refetch } = useQuery(FETCH_TREASURY_DATA, {
    variables: { orgId },
    skip: !orgId,
    fetchPolicy: 'cache-first',
    client,
  });

  // Fetch gas pool data
  const { data: gasPoolData, loading: gasPoolLoading, refetch: refetchGasPool } = useQuery(FETCH_GAS_POOL_DATA, {
    variables: { orgId },
    skip: !orgId,
    fetchPolicy: 'cache-first',
    client,
  });

  // Fetch paymaster hub address from infrastructure.
  // Per-chain client prevents cache poisoning: each endpoint has its own InMemoryCache.
  const orgClient = useMemo(() => getClient(subgraphUrl), [subgraphUrl]);
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    client: orgClient,
    skip: !subgraphUrl,
  });
  const paymasterHubAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;

  const isLoading = poContextLoading || treasuryLoading;

  // Extract data from query
  const paymentManager = treasuryData?.organization?.paymentManager;
  const distributions = paymentManager?.distributions || [];
  const payments = paymentManager?.payments || [];
  const totalSupply = treasuryData?.organization?.participationToken?.totalSupply;

  // Gas pool events for the unified activity feed
  const gasConfig = gasPoolData?.paymasterOrgConfigs?.[0];
  const gasDepositEvents = gasConfig?.depositEvents || [];
  const gasUsageEvents = gasConfig?.usageEvents || [];

  // Extract completed tasks from all projects (flattened)
  const completedTasks = useMemo(() => {
    const projects = treasuryData?.organization?.taskManager?.projects || [];
    return projects.flatMap(p => p.tasks || []);
  }, [treasuryData]);

  // Active distributions drive Zone 2 (the member's claimable payouts).
  // "Open" for the header count means genuinely claimable — an Active payout
  // whose pool is fully claimed must not be advertised as open.
  const activeDistributions = useMemo(
    () => distributions.filter(d => d.status === 'Active'),
    [distributions]
  );
  const openDistributionCount = useMemo(
    () => activeDistributions.filter(d =>
      !d.totalAmount || d.totalAmount === '0' ||
      BigInt(d.totalClaimed || '0') < BigInt(d.totalAmount)
    ).length,
    [activeDistributions]
  );

  // Claim CTA in the hero scrolls to the payouts zone, which answers with a
  // brief ring so the eye knows where it landed.
  const payoutsRef = useRef(null);
  const [payoutsFlash, setPayoutsFlash] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const scrollToPayouts = useCallback(() => {
    payoutsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setPayoutsFlash(true);
    setTimeout(() => setPayoutsFlash(false), 1600);
  }, []);

  // ERC20 treasury balance fetching
  const [erc20Balances, setErc20Balances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);

  // Non-stable holdings the hero must disclose beside the $ figure ("the group
  // also holds X — no reliable dollar price"). Display-zero balances excluded.
  const otherHoldings = useMemo(
    () => erc20Balances
      .filter(t => !t.isStable)
      .map(t => ({ symbol: t.symbol, amount: formatTokenAmount(t.balance || '0', t.decimals, 4) }))
      .filter(t => parseFloat(t.amount) > 0),
    [erc20Balances]
  );

  const fetchErc20Balances = useCallback(async () => {
    if (!paymentManager?.id || !orgChainId) return;

    const tokens = getBountyTokenOptions(orgChainId);
    if (tokens.length === 0) return;

    const clients = createChainClients(orgChainId);
    const client = clients?.publicClient;
    if (!client) return;

    setBalancesLoading(true);
    try {
      const balances = await Promise.all(
        tokens.map(async (token) => {
          try {
            const balance = await client.readContract({
              address: token.address,
              abi: BALANCE_OF_ABI,
              functionName: 'balanceOf',
              args: [paymentManager.id],
            });
            return { ...token, balance: balance.toString() };
          } catch (e) {
            console.warn(`Failed to fetch balance for ${token.symbol}:`, e.message);
            return { ...token, balance: '0' };
          }
        })
      );
      setErc20Balances(balances);
    } catch (e) {
      console.error('Failed to fetch treasury balances:', e);
    } finally {
      setBalancesLoading(false);
    }
  }, [paymentManager?.id, orgChainId]);

  // Fetch balances on initial load
  useEffect(() => {
    fetchErc20Balances();
  }, [fetchErc20Balances]);

  // Refetch immediately — executeWithNotification already waited for the
  // subgraph to index the transaction block before emitting these events.
  useRefreshSubscription(RefreshEvent.TREASURY_DEPOSITED, () => {
    refetch();
    fetchErc20Balances();
  }, [fetchErc20Balances]);

  useRefreshSubscription(RefreshEvent.GAS_POOL_DEPOSITED, () => {
    refetchGasPool();
  }, [refetchGasPool]);

  const zoneBox = {
    borderRadius: '2xl',
    bg: 'transparent',
    boxShadow: 'lg',
    position: 'relative',
    zIndex: 2,
  };

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;
  return (
    <>
      <Navbar />
      {isLoading ? (
        <Center height="100vh" background={pageBackground()}>
          <VStack spacing={4}>
            <PulseLoader size="xl" color="purple.400" />
            <Text color="gray.400">Loading treasury data...</Text>
          </VStack>
        </Center>
      ) : (
        <Box p={{ base: 2, md: 4 }} mt={{ base: 16, md: 0 }} minH="100vh" background={pageBackground()}>
          <Grid
            color="whitesmoke"
            templateAreas={{
              base: `
                'hero'
                'payouts'
                'insights'
                'gas'
                'feed'
              `,
              md: `
                'hero hero hero'
                'payouts payouts payouts'
                'insights insights gas'
                'feed feed feed'
              `,
            }}
            templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}
            gap={{ base: 3, md: 4 }}
          >
            {/* Zone 1 — Hero: what we hold + what's yours (+ the holdings ledger) */}
            <GridItem area="hero">
              <Rise delay={0} w="100%" {...zoneBox}>
                <div style={glassLayerStyle} />
                <TreasuryHeader
                  memberCount={poMembers}
                  activeDistributionCount={openDistributionCount}
                  isAdmin={hasExecRole}
                  onCreateDistribution={onCreateDistOpen}
                  onDeposit={onDepositOpen}
                  onFundBounties={taskManagerAddress ? onBountyDepositOpen : undefined}
                  onClaimScroll={scrollToPayouts}
                  otherHoldings={otherHoldings}
                />
                <Box px={{ base: 4, md: 8 }} pb={{ base: 5, md: 7 }} pt={{ base: 4, md: 6 }}>
                  <SectionHeader mb={1}>What we hold</SectionHeader>
                  <TokenBalancesGrid
                    totalSupply={totalSupply}
                    onPTClick={onPTModalOpen}
                    isLoading={treasuryLoading || balancesLoading}
                    erc20Balances={erc20Balances}
                  />
                </Box>
              </Rise>
            </GridItem>

            {/* Zone 2 — Payouts you can claim */}
            <GridItem area="payouts" ref={payoutsRef}>
              <Rise
                delay={0.07}
                h="100%"
                {...zoneBox}
                animation={flashRing(payoutsFlash, prefersReducedMotion)}
              >
                <div style={glassLayerStyle} />
                <Box px={{ base: 4, md: 8 }} py={{ base: 4, md: 6 }}>
                  <SectionHeader
                    meta={openDistributionCount > 0
                      ? `${openDistributionCount} open to claim`
                      : undefined}
                  >
                    Payouts
                  </SectionHeader>
                  <CurrentDistributions
                    distributions={activeDistributions}
                    paymentManagerAddress={paymentManager?.id}
                    hybridVotingId={hybridVotingContractAddress}
                    subgraphUrl={subgraphUrl}
                    refetch={refetch}
                  />
                </Box>
              </Rise>
            </GridItem>

            {/* Zone 3a — Money in & out (insight strip + chart) */}
            <GridItem area="insights">
              <Rise delay={0.14} h="100%" {...zoneBox}>
                <div style={glassLayerStyle} />
                <Box px={{ base: 4, md: 8 }} py={{ base: 4, md: 6 }}>
                  <SectionHeader>Money in &amp; out</SectionHeader>
                  <HistoricalOverview
                    distributions={distributions}
                    payments={payments}
                  />
                </Box>
              </Rise>
            </GridItem>

            {/* Zone 3c — Compact network-fees card (hugs its content) */}
            <GridItem area="gas" alignSelf="start">
              <Rise delay={0.18} {...zoneBox}>
                <div style={glassLayerStyle} />
                <Box px={{ base: 4, md: 6 }} py={{ base: 4, md: 6 }}>
                  <GasPoolSection
                    gasPoolData={gasPoolData}
                    isLoading={gasPoolLoading}
                    onDeposit={onGasPoolDepositOpen}
                    paymasterHubAddress={paymasterHubAddress}
                  />
                </Box>
              </Rise>
            </GridItem>

            {/* Zone 3b — Recent activity (unified feed) */}
            <GridItem area="feed">
              <Rise delay={0.22} {...zoneBox}>
                <div style={glassLayerStyle} />
                <Box px={{ base: 4, md: 8 }} py={{ base: 4, md: 6 }}>
                  <SectionHeader
                    meta={`${payments.length + distributions.length + gasDepositEvents.length + gasUsageEvents.length} entries`}
                  >
                    Recent activity
                  </SectionHeader>
                  <ActivityFeed
                    distributions={distributions}
                    payments={payments}
                    gasDepositEvents={gasDepositEvents}
                    gasUsageEvents={gasUsageEvents}
                  />
                </Box>
              </Rise>
            </GridItem>
          </Grid>
        </Box>
      )}

      {/* PT Stats Modal */}
      <ParticipationTokenModal
        isOpen={isPTModalOpen}
        onClose={onPTModalClose}
        totalSupply={totalSupply}
        completedTasks={completedTasks}
        tokenAddress={participationTokenAddress}
      />

      {/* Deposit Modal (Treasury) */}
      <DepositModal
        isOpen={isDepositOpen}
        onClose={onDepositClose}
        paymentManagerAddress={paymentManager?.id}
        orgChainId={orgChainId}
      />

      {/* Deposit Modal (Task Bounties) */}
      {taskManagerAddress && (
        <DepositModal
          isOpen={isBountyDepositOpen}
          onClose={onBountyDepositClose}
          paymentManagerAddress={paymentManager?.id}
          orgChainId={orgChainId}
          targetAddress={taskManagerAddress}
          targetLabel="Task Bounties"
          useDirectTransfer
        />
      )}

      {/* Create Distribution Proposal Modal */}
      <CreateDistributionModal
        isOpen={isCreateDistOpen}
        onClose={onCreateDistClose}
        paymentManagerAddress={paymentManager?.id}
        orgChainId={orgChainId}
        votingContractAddress={hybridVotingContractAddress}
      />

      {/* Gas Pool Deposit Modal */}
      <GasPoolDepositModal
        isOpen={isGasPoolDepositOpen}
        onClose={onGasPoolDepositClose}
        paymasterHubAddress={paymasterHubAddress}
      />
    </>
  );
};

export default TreasuryPage;
