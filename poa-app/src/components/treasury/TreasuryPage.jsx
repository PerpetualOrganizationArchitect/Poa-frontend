import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useTour } from '@/features/tour';
import {
  Box,
  VStack,
  Grid,
  GridItem,
  Text,
  Center,
  useBreakpointValue,
  useDisclosure,
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
import { createChainClients } from '@/services/web3/utils/chainClients';
import TreasuryHeader from './TreasuryHeader';
import TokenBalancesGrid from './TokenBalancesGrid';
import CurrentDistributions from './CurrentDistributions';
import DistributionHistory from './DistributionHistory';
import HistoricalOverview from './HistoricalOverview';
import ParticipationTokenModal from './ParticipationTokenModal';
import DepositModal from './DepositModal';
import CreateDistributionModal from './CreateDistributionModal';
import GasPoolSection from './GasPoolSection';
import GasPoolDepositModal from './GasPoolDepositModal';
import { useOrgTheme } from '@/hooks';
import { useOrgGate } from '@/components/shared/OrgDeadEnd';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(0, 0, 0, .79)',
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

  // Responsive design
  const sectionHeadingSize = useBreakpointValue({ base: 'lg', md: 'xl' });

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

  // Extract completed tasks from all projects (flattened)
  const completedTasks = useMemo(() => {
    const projects = treasuryData?.organization?.taskManager?.projects || [];
    return projects.flatMap(p => p.tasks || []);
  }, [treasuryData]);

  // Memoize filtered distributions to avoid recalculation on every render
  const { activeDistributions, completedDistributions, totalDistributed } = useMemo(() => {
    const active = distributions.filter(d => d.status === 'Active');
    const completed = distributions.filter(d => d.status === 'Finalized');
    const total = distributions.reduce((sum, d) =>
      sum + BigInt(d.totalAmount || 0), BigInt(0));
    return { activeDistributions: active, completedDistributions: completed, totalDistributed: total };
  }, [distributions]);

  // ERC20 treasury balance fetching
  const [erc20Balances, setErc20Balances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);

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
                'header'
                'balances'
                'distributions'
                'history'
                'charts'
                'gaspool'
              `,
              md: `
                'header header'
                'balances distributions'
                'history history'
                'charts charts'
                'gaspool gaspool'
              `,
            }}
            templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}
            gap={{ base: 3, md: 4 }}
          >
            {/* Treasury Header */}
            <GridItem area="header">
              <Box
                w="100%"
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <TreasuryHeader
                  memberCount={poMembers}
                  totalDistributed={totalDistributed.toString()}
                  distributionCount={distributions.length}
                  isAdmin={hasExecRole}
                  onCreateDistribution={onCreateDistOpen}
                  onDeposit={onDepositOpen}
                  onFundBounties={taskManagerAddress ? onBountyDepositOpen : undefined}
                  refetch={refetch}
                />
              </Box>
            </GridItem>

            {/* Token Balances */}
            <GridItem area="balances">
              <Box
                h="100%"
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Treasury Balances
                  </Text>
                </VStack>
                <Box p={{ base: 2, md: 4 }}>
                  <TokenBalancesGrid
                    totalSupply={totalSupply}
                    onPTClick={onPTModalOpen}
                    isLoading={treasuryLoading || balancesLoading}
                    erc20Balances={erc20Balances}
                  />
                </Box>
              </Box>
            </GridItem>

            {/* Current Distributions */}
            <GridItem area="distributions">
              <Box
                h="100%"
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Active Profit Shares
                  </Text>
                </VStack>
                <Box p={{ base: 2, md: 4 }}>
                  <CurrentDistributions
                    distributions={activeDistributions}
                    paymentManagerAddress={paymentManager?.id}
                    hybridVotingId={hybridVotingContractAddress}
                    subgraphUrl={subgraphUrl}
                    refetch={refetch}
                  />
                </Box>
              </Box>
            </GridItem>

            {/* Distribution History */}
            <GridItem area="history">
              <Box
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Distribution History
                  </Text>
                </VStack>
                <Box p={{ base: 2, md: 4 }}>
                  <DistributionHistory
                    distributions={distributions}
                    payments={payments}
                  />
                </Box>
              </Box>
            </GridItem>

            {/* Historical Charts */}
            <GridItem area="charts">
              <Box
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Financial Overview
                  </Text>
                </VStack>
                <Box p={{ base: 2, md: 4 }}>
                  <HistoricalOverview
                    distributions={distributions}
                    payments={payments}
                  />
                </Box>
              </Box>
            </GridItem>

            {/* Gas Pool */}
            <GridItem area="gaspool">
              <Box
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Gas Pool
                  </Text>
                </VStack>
                <Box p={{ base: 2, md: 4 }}>
                  <GasPoolSection
                    gasPoolData={gasPoolData}
                    isLoading={gasPoolLoading}
                    onDeposit={onGasPoolDepositOpen}
                  />
                </Box>
              </Box>
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
