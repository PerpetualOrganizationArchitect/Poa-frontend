import React, { useMemo } from 'react';
import {
  Box,
  VStack,
  Grid,
  GridItem,
  Text,
  Spinner,
  Center,
  useBreakpointValue,
  useDisclosure,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import { FETCH_TREASURY_DATA } from '@/util/queries';
import TreasuryHeader from './TreasuryHeader';
import TokenBalancesGrid from './TokenBalancesGrid';
import CurrentDistributions from './CurrentDistributions';
import DistributionHistory from './DistributionHistory';
import HistoricalOverview from './HistoricalOverview';
import ParticipationTokenModal from './ParticipationTokenModal';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backdropFilter: 'blur(70px)',
  backgroundColor: 'rgba(0, 0, 0, .79)',
};

const TreasuryPage = () => {
  const router = useRouter();
  const { userDAO } = router.query;
  const {
    orgId,
    poContextLoading,
    executorContractAddress,
    participationTokenAddress,
    poMembers,
  } = usePOContext();
  const { hasExecRole } = useUserContext();

  // Modal state for PT stats
  const { isOpen: isPTModalOpen, onOpen: onPTModalOpen, onClose: onPTModalClose } = useDisclosure();

  // Responsive design
  const isMobile = useBreakpointValue({ base: true, md: false });
  const headingSize = useBreakpointValue({ base: '2xl', md: '3xl' });
  const sectionHeadingSize = useBreakpointValue({ base: 'lg', md: 'xl' });

  // Fetch treasury data from subgraph
  const { data: treasuryData, loading: treasuryLoading, refetch } = useQuery(FETCH_TREASURY_DATA, {
    variables: { orgId },
    skip: !orgId,
    fetchPolicy: 'cache-and-network',
  });

  const isLoading = poContextLoading || treasuryLoading;

  // Extract data from query
  const paymentManager = treasuryData?.organization?.paymentManager;
  const distributions = paymentManager?.distributions || [];
  const payments = paymentManager?.payments || [];
  const totalSupply = treasuryData?.organization?.participationToken?.totalSupply;

  // Memoize filtered distributions to avoid recalculation on every render
  const { activeDistributions, completedDistributions, totalDistributed } = useMemo(() => {
    const active = distributions.filter(d => d.status === 'Active');
    const completed = distributions.filter(d => d.status === 'Finalized');
    const total = distributions.reduce((sum, d) =>
      sum + BigInt(d.totalAmount || 0), BigInt(0));
    return { activeDistributions: active, completedDistributions: completed, totalDistributed: total };
  }, [distributions]);

  return (
    <>
      <Navbar />
      {isLoading ? (
        <Center height="100vh">
          <VStack spacing={4}>
            <Spinner size="xl" color="purple.400" />
            <Text color="gray.400">Loading treasury data...</Text>
          </VStack>
        </Center>
      ) : (
        <Box p={{ base: 2, md: 4 }} mt={{ base: 16, md: 0 }}>
          <Grid
            color="whitesmoke"
            templateAreas={{
              base: `
                'header'
                'balances'
                'distributions'
                'history'
                'charts'
              `,
              md: `
                'header header'
                'balances distributions'
                'history history'
                'charts charts'
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
                  onCreateDistribution={() => {/* TODO: Open modal */}}
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
                    executorAddress={executorContractAddress}
                    onPTClick={onPTModalOpen}
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
                    distributions={completedDistributions}
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
          </Grid>
        </Box>
      )}

      {/* PT Stats Modal */}
      <ParticipationTokenModal
        isOpen={isPTModalOpen}
        onClose={onPTModalClose}
        tokenAddress={participationTokenAddress}
        totalSupply={totalSupply}
      />
    </>
  );
};

export default TreasuryPage;
