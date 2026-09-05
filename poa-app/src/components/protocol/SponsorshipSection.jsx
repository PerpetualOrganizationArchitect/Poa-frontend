import React from 'react';
import { Box, Container, Heading, Text, SimpleGrid, VStack, HStack, Badge, Divider } from '@chakra-ui/react';
import { motion } from 'framer-motion';

const MotionBox = motion.create(Box);

const ConfigRow = ({ label, value, color = 'warmGray.700' }) => (
  <HStack justify="space-between" py={1}>
    <Text fontSize="xs" color="warmGray.500">{label}</Text>
    <Text fontSize="sm" fontWeight="600" color={color}>{value}</Text>
  </HStack>
);

const ChainSponsorshipCard = ({ chain }) => {
  const onboarding = chain.onboarding;
  const orgDeploy = chain.orgDeploy;

  return (
    <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="xl" p={5}>
      <Heading fontSize="md" fontWeight="700" color="warmGray.800" mb={4}>{chain.name}</Heading>

      {/* Onboarding */}
      <Box mb={4}>
        <HStack mb={2}>
          <Text fontSize="sm" fontWeight="600" color="warmGray.700">Account Creation</Text>
          <Badge
            fontSize="2xs"
            bg={onboarding?.enabled ? 'green.50' : 'warmGray.100'}
            color={onboarding?.enabled ? 'green.600' : 'warmGray.500'}
          >
            {onboarding?.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </HStack>
        {onboarding ? (
          <VStack spacing={0} align="stretch">
            <ConfigRow label="Max Cost per Creation" value={`${parseFloat(onboarding.maxGasPerCreation).toFixed(4)} ${chain.nativeCurrency}`} />
            <ConfigRow label="Daily Limit" value={`${onboarding.dailyCreationLimit} accounts`} />
          </VStack>
        ) : (
          <Text fontSize="xs" color="warmGray.400">Not configured</Text>
        )}
      </Box>

      <Divider borderColor="warmGray.100" />

      {/* Org Deploy */}
      <Box mt={4}>
        <HStack mb={2}>
          <Text fontSize="sm" fontWeight="600" color="warmGray.700">Org Deployment</Text>
          <Badge
            fontSize="2xs"
            bg={orgDeploy?.enabled ? 'green.50' : 'warmGray.100'}
            color={orgDeploy?.enabled ? 'green.600' : 'warmGray.500'}
          >
            {orgDeploy?.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </HStack>
        {orgDeploy ? (
          <VStack spacing={0} align="stretch">
            <ConfigRow label="Max Cost per Deploy" value={`${parseFloat(orgDeploy.maxGasPerDeploy).toFixed(4)} ${chain.nativeCurrency}`} />
            <ConfigRow label="Daily Limit" value={`${orgDeploy.dailyDeployLimit} deploys`} />
            <ConfigRow label="Max per Account" value={`${orgDeploy.maxDeploysPerAccount} lifetime`} />
          </VStack>
        ) : (
          <Text fontSize="xs" color="warmGray.400">Not configured</Text>
        )}
      </Box>
    </Box>
  );
};

const SponsorshipSection = ({ chains }) => (
  <Box as="section" py={{ base: 12, md: 16 }} bg="white">
    <Container maxW="6xl">
      <MotionBox initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        <Text fontSize="sm" fontWeight="600" color="warmGray.400" letterSpacing="0.08em" textTransform="uppercase" mb={2}>
          Gas Sponsorship
        </Text>
        <Heading fontSize={{ base: 'xl', md: '2xl' }} fontWeight="700" color="warmGray.800" mb={2}>
          Paymaster Configuration
        </Heading>
        <Text fontSize="sm" color="warmGray.500" mb={6}>
          ERC-4337 paymaster settings for gasless account creation and org deployment. Funded by the solidarity fund.
        </Text>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
          {Object.values(chains).map(chain => (
            <ChainSponsorshipCard key={chain.chainId} chain={chain} />
          ))}
        </SimpleGrid>
      </MotionBox>
    </Container>
  </Box>
);

export default SponsorshipSection;
