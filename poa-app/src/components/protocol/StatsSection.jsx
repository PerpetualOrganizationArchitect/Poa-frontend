import React from 'react';
import { Box, Container, Heading, Text, SimpleGrid, VStack, HStack, Badge } from '@chakra-ui/react';
import { motion } from 'framer-motion';

const MotionBox = motion.create(Box);

const ChainStatCard = ({ chain }) => {
  const orgs = chain.orgStats?.totalOrgs || '0';
  const contracts = chain.orgStats?.totalContracts || '0';
  const accounts = chain.accountStats?.totalAccounts || '0';
  const beacons = chain.infrastructure?.beaconCount || '0';

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="warmGray.100"
      borderRadius="xl"
      p={6}
      _hover={{ boxShadow: '0 4px 20px rgba(144,85,232,0.08)', borderColor: 'amethyst.200' }}
      transition="all 0.2s"
    >
      <HStack mb={4}>
        <Heading fontSize="lg" fontWeight="700" color="warmGray.800">{chain.name}</Heading>
        <Badge bg="amethyst.50" color="amethyst.600" fontSize="2xs">{chain.nativeCurrency}</Badge>
      </HStack>

      <SimpleGrid columns={2} spacing={4}>
        <VStack align="flex-start" spacing={0}>
          <Text fontSize="2xl" fontWeight="bold" color="warmGray.800">{orgs}</Text>
          <Text fontSize="xs" color="warmGray.500">Organizations</Text>
        </VStack>
        <VStack align="flex-start" spacing={0}>
          <Text fontSize="2xl" fontWeight="bold" color="warmGray.800">{accounts}</Text>
          <Text fontSize="xs" color="warmGray.500">Accounts</Text>
        </VStack>
        <VStack align="flex-start" spacing={0}>
          <Text fontSize="2xl" fontWeight="bold" color="warmGray.800">{contracts}</Text>
          <Text fontSize="xs" color="warmGray.500">Contracts</Text>
        </VStack>
        <VStack align="flex-start" spacing={0}>
          <Text fontSize="2xl" fontWeight="bold" color="warmGray.800">{beacons}</Text>
          <Text fontSize="xs" color="warmGray.500">Beacon Types</Text>
        </VStack>
      </SimpleGrid>
    </Box>
  );
};

const StatsSection = ({ chains }) => (
  <Box as="section" py={{ base: 12, md: 16 }} bg="warmGray.50">
    <Container maxW="6xl">
      <MotionBox initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        <Text fontSize="sm" fontWeight="600" color="warmGray.400" letterSpacing="0.08em" textTransform="uppercase" mb={2}>
          Network Stats
        </Text>
        <Heading fontSize={{ base: 'xl', md: '2xl' }} fontWeight="700" color="warmGray.800" mb={6}>
          Per-Chain Overview
        </Heading>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
          {Object.values(chains).map(chain => (
            <ChainStatCard key={chain.chainId} chain={chain} />
          ))}
        </SimpleGrid>
      </MotionBox>
    </Container>
  </Box>
);

export default StatsSection;
