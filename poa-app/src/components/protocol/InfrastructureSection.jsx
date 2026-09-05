import React from 'react';
import { Box, Container, Heading, Text, SimpleGrid, VStack, HStack, Link, useClipboard, IconButton, Badge, Tooltip } from '@chakra-ui/react';
import { ExternalLinkIcon, CopyIcon, CheckIcon } from '@chakra-ui/icons';
import { motion } from 'framer-motion';

const MotionBox = motion.create(Box);

const AddressRow = ({ label, address, explorerUrl, version }) => {
  const { hasCopied, onCopy } = useClipboard(address || '');
  if (!address) return null;

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <HStack justify="space-between" py={2} px={3} bg="warmGray.50" borderRadius="md" spacing={2}>
      <VStack align="flex-start" spacing={0} flex={1} minW={0}>
        <HStack spacing={2}>
          <Text fontSize="xs" color="warmGray.500" fontWeight="500">{label}</Text>
          {version && <Badge fontSize="2xs" bg="amethyst.50" color="amethyst.600">{version}</Badge>}
        </HStack>
        <Text fontSize="sm" fontFamily="mono" color="warmGray.700" isTruncated>{truncated}</Text>
      </VStack>
      <HStack spacing={1}>
        <Tooltip label={hasCopied ? 'Copied!' : 'Copy address'}>
          <IconButton
            icon={hasCopied ? <CheckIcon /> : <CopyIcon />}
            size="xs"
            variant="ghost"
            color="warmGray.400"
            onClick={onCopy}
            aria-label="Copy"
          />
        </Tooltip>
        <Link href={`${explorerUrl}/address/${address}`} isExternal>
          <IconButton icon={<ExternalLinkIcon />} size="xs" variant="ghost" color="warmGray.400" aria-label="Explorer" />
        </Link>
      </HStack>
    </HStack>
  );
};

const ChainInfraCard = ({ chain }) => {
  const infra = chain.infrastructure;
  if (!infra) return null;

  const url = chain.blockExplorer;
  const contracts = [
    { label: 'PoaManager', address: infra.id },
    { label: 'OrgDeployer', address: infra.orgDeployerProxy },
    { label: 'OrgRegistry', address: infra.orgRegistryProxy },
    { label: 'PaymasterHub', address: infra.paymasterHubProxy },
    { label: 'AccountRegistry', address: infra.globalAccountRegistryProxy },
    { label: 'PasskeyFactory', address: infra.passkeyAccountFactoryProxy },
  ];

  return (
    <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="xl" p={5}>
      <HStack mb={4}>
        <Heading fontSize="md" fontWeight="700" color="warmGray.800">{chain.name}</Heading>
        <Badge bg="amethyst.50" color="amethyst.600" fontSize="2xs">Chain {chain.chainId}</Badge>
      </HStack>
      <VStack spacing={2} align="stretch">
        {contracts.map(c => (
          <AddressRow key={c.label} label={c.label} address={c.address} explorerUrl={url} />
        ))}
      </VStack>
    </Box>
  );
};

const InfrastructureSection = ({ chains }) => (
  <Box as="section" py={{ base: 12, md: 16 }} bg="white">
    <Container maxW="6xl">
      <MotionBox initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        <Text fontSize="sm" fontWeight="600" color="warmGray.400" letterSpacing="0.08em" textTransform="uppercase" mb={2}>
          Infrastructure
        </Text>
        <Heading fontSize={{ base: 'xl', md: '2xl' }} fontWeight="700" color="warmGray.800" mb={2}>
          Smart Contract Addresses
        </Heading>
        <Text fontSize="sm" color="warmGray.500" mb={6}>
          All contracts are verified on Blockscout and upgradeable via beacon proxy pattern.
        </Text>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
          {Object.values(chains).map(chain => (
            <ChainInfraCard key={chain.chainId} chain={chain} />
          ))}
        </SimpleGrid>
      </MotionBox>
    </Container>
  </Box>
);

export default InfrastructureSection;
