import React from 'react';
import Link from 'next/link';
import { Box, Container, Heading, Text, SimpleGrid, VStack, HStack, Icon } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { HiGlobeAlt, HiUserGroup, HiCube, HiLink, HiLightningBolt } from 'react-icons/hi';

const MotionBox = motion.create(Box);

const StatPill = ({ icon, value, label }) => (
  <VStack spacing={1} px={6} py={4} bg="rgba(255,255,255,0.08)" borderRadius="xl" minW="120px">
    <Icon as={icon} boxSize={5} color="amethyst.200" />
    <Text fontSize="2xl" fontWeight="bold" color="white">{value}</Text>
    <Text fontSize="xs" color="whiteAlpha.700" textTransform="uppercase" letterSpacing="0.05em">{label}</Text>
  </VStack>
);

const HeroSection = ({ aggregated, isLoading }) => (
  <Box
    bg="linear-gradient(135deg, #1a1030 0%, #0d0d1a 50%, #1a0d2e 100%)"
    pt={{ base: 24, md: 32 }}
    pb={{ base: 16, md: 20 }}
    position="relative"
    overflow="hidden"
  >
    {/* Gradient orbs */}
    <Box position="absolute" top="-100px" right="-100px" w="400px" h="400px" borderRadius="full" bg="radial-gradient(circle, rgba(144,85,232,0.15), transparent 70%)" />
    <Box position="absolute" bottom="-50px" left="-50px" w="300px" h="300px" borderRadius="full" bg="radial-gradient(circle, rgba(232,93,133,0.1), transparent 70%)" />

    <Container maxW="6xl" position="relative">
      <MotionBox
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        textAlign="center"
      >
        <Text fontSize="sm" fontWeight="600" color="amethyst.300" letterSpacing="0.1em" textTransform="uppercase" mb={3}>
          Protocol Dashboard
        </Text>
        <Heading as="h1" fontSize={{ base: '3xl', md: '5xl' }} fontWeight="800" color="white" mb={4} letterSpacing="-0.02em">
          Poa Protocol. Live transparency.
        </Heading>
        <Text fontSize={{ base: 'md', md: 'lg' }} color="whiteAlpha.700" maxW="720px" mx="auto" mb={6} lineHeight="1.7">
          Poa Protocol is the open-source infrastructure that powers every community-owned organization on poa.box. The dashboard below shows real-time state across every supported chain: deployed organizations, solidarity-fund balance, gas sponsorship metrics, and protocol upgrade history. Everything on this page is verifiable on-chain. There is no central admin, and there is no opaque approval process.
        </Text>
        <Text fontSize={{ base: 'sm', md: 'md' }} color="whiteAlpha.600" maxW="640px" mx="auto" mb={10} lineHeight="1.7">
          New here? See the{' '}
          <Link href="/docs/what-is-poa" style={{ color: '#C4B5FD', textDecoration: 'underline' }}>
            introduction to Poa
          </Link>{' '}
          for what the protocol can do, or the{' '}
          <Link href="/docs/TheGraph" style={{ color: '#C4B5FD', textDecoration: 'underline' }}>
            subgraph overview
          </Link>{' '}
          for how this dashboard reads on-chain state.
        </Text>

        <HStack spacing={4} justify="center" flexWrap="wrap">
          <StatPill icon={HiUserGroup} value={isLoading ? '...' : aggregated.totalOrgs} label="Organizations" />
          <StatPill icon={HiGlobeAlt} value={isLoading ? '...' : aggregated.totalAccounts} label="Accounts" />
          <StatPill icon={HiLink} value={isLoading ? '...' : aggregated.chainsActive} label="Chains" />
          <StatPill icon={HiCube} value={isLoading ? '...' : aggregated.totalBeacons} label="Beacon Types" />
          <StatPill icon={HiLightningBolt} value={isLoading ? '...' : aggregated.totalUserOps} label="Txs Sponsored" />
        </HStack>
      </MotionBox>
    </Container>
  </Box>
);

export default HeroSection;
