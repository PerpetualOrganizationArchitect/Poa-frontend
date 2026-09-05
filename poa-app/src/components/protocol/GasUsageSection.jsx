import React from 'react';
import { Box, Container, Heading, Text, SimpleGrid, HStack, Badge } from '@chakra-ui/react';
import { motion } from 'framer-motion';

const MotionBox = motion.create(Box);

const StatCard = ({ label, value, subtext, color = 'warmGray.800' }) => (
  <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="lg" p={4}>
    <Text fontSize="xs" color="warmGray.500" mb={1}>{label}</Text>
    <Text fontSize="xl" fontWeight="bold" color={color}>{value}</Text>
    {subtext && <Text fontSize="xs" color="warmGray.400" mt={1}>{subtext}</Text>}
  </Box>
);

const ChainGasCard = ({ chain }) => {
  const gas = chain.gasUsage;
  if (!gas || gas.totalUserOps === 0) return null;

  return (
    <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="xl" p={5}>
      <HStack mb={4}>
        <Heading fontSize="md" fontWeight="700" color="warmGray.800">{chain.name}</Heading>
        <Badge bg="amethyst.50" color="amethyst.600" fontSize="2xs">{chain.nativeCurrency}</Badge>
      </HStack>

      <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3}>
        <StatCard
          label="Gas Sponsored"
          value={`${parseFloat(gas.totalGasSponsored).toFixed(4)} ${chain.nativeCurrency}`}
          color="amethyst.600"
        />
        <StatCard
          label="Transactions Sponsored"
          value={gas.totalUserOps.toLocaleString()}
          subtext="Paymaster user operations"
        />
        <StatCard
          label="Current Pool Balance"
          value={`${parseFloat(gas.currentBalance).toFixed(4)} ${chain.nativeCurrency}`}
          subtext="Available across all orgs"
        />
        <StatCard
          label="Total Deposited"
          value={`${parseFloat(gas.totalDeposited).toFixed(4)} ${chain.nativeCurrency}`}
          subtext="Lifetime gas pool deposits"
        />
        <StatCard
          label="Spent from Deposits"
          value={`${parseFloat(gas.totalSpent).toFixed(4)} ${chain.nativeCurrency}`}
          subtext="Org-funded gas"
        />
        <StatCard
          label="Orgs with Gas Pools"
          value={gas.orgCount}
          subtext="Registered paymasters"
        />
      </SimpleGrid>
    </Box>
  );
};

const GasUsageSection = ({ chains }) => {
  const chainsWithGas = Object.values(chains).filter(c => c.gasUsage?.totalUserOps > 0);
  if (chainsWithGas.length === 0) return null;

  return (
    <Box as="section" py={{ base: 12, md: 16 }} bg="warmGray.50">
      <Container maxW="6xl">
        <MotionBox initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Text fontSize="sm" fontWeight="600" color="warmGray.400" letterSpacing="0.08em" textTransform="uppercase" mb={2}>
            Gas Usage
          </Text>
          <Heading fontSize={{ base: 'xl', md: '2xl' }} fontWeight="700" color="warmGray.800" mb={2}>
            Sponsored Gas
          </Heading>
          <Text fontSize="sm" color="warmGray.500" mb={6}>
            Gas covered by organization paymasters on behalf of their members. Does not include gas paid directly by wallet users.
          </Text>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
            {chainsWithGas.map(chain => (
              <ChainGasCard key={chain.chainId} chain={chain} />
            ))}
          </SimpleGrid>
        </MotionBox>
      </Container>
    </Box>
  );
};

export default GasUsageSection;
