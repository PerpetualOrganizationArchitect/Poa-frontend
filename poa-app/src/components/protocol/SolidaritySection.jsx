import React, { useState } from 'react';
import { Box, Container, Heading, Text, SimpleGrid, VStack, HStack, Badge, Table, Thead, Tbody, Tr, Th, Td, Link, Button, Input, InputGroup, InputRightAddon, useToast, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton } from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons';
import { motion } from 'framer-motion';
import { useAccount, useSwitchChain, useConfig } from 'wagmi';
import { getConnectorClient } from 'wagmi/actions';
import { clientToSigner } from '@/components/ProviderConverter';
import { useAuth } from '@/context/AuthContext';
import { ethers } from 'ethers';

const MotionBox = motion.create(Box);

const StatCard = ({ label, value, subtext, color = 'warmGray.800' }) => (
  <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="lg" p={4}>
    <Text fontSize="xs" color="warmGray.500" mb={1}>{label}</Text>
    <Text fontSize="xl" fontWeight="bold" color={color}>{value}</Text>
    {subtext && <Text fontSize="xs" color="warmGray.400" mt={1}>{subtext}</Text>}
  </Box>
);

const DonateModal = ({ isOpen, onClose, chain }) => {
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();
  const { chain: currentChain } = useAccount();
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);

  const paymasterAddress = chain.infrastructure?.paymasterHubProxy;

  const handleDonate = async () => {
    if (!amount || parseFloat(amount) <= 0 || !paymasterAddress) return;

    setIsSending(true);
    try {
      if (currentChain?.id !== chain.chainId) {
        await switchChainAsync({ chainId: chain.chainId });
      }
      const freshClient = await getConnectorClient(wagmiConfig, { chainId: chain.chainId });
      const signer = clientToSigner(freshClient);

      const tx = await signer.sendTransaction({
        to: paymasterAddress,
        data: new ethers.utils.Interface(['function donateToSolidarity() payable']).encodeFunctionData('donateToSolidarity'),
        value: ethers.utils.parseEther(amount),
      });
      await tx.wait();

      toast({ title: `Donated ${amount} ${chain.nativeCurrency}!`, status: 'success', duration: 5000 });
      setAmount('');
      onClose();
    } catch (err) {
      toast({ title: 'Donation failed', description: err.message, status: 'error', duration: 5000 });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Donate to Solidarity Fund</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" color="warmGray.500" mb={4}>
            Your donation helps subsidize gas for new organizations on {chain.name}.
          </Text>
          <InputGroup>
            <Input
              placeholder="0.5"
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              isDisabled={isSending}
            />
            <InputRightAddon>{chain.nativeCurrency}</InputRightAddon>
          </InputGroup>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose} isDisabled={isSending}>Cancel</Button>
          <Button
            colorScheme="green"
            onClick={handleDonate}
            isLoading={isSending}
            loadingText="Sending..."
            isDisabled={!amount || parseFloat(amount) <= 0 || !isAuthenticated}
          >
            Donate
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const ChainSolidarityCard = ({ chain }) => {
  const solidarity = chain.solidarity;
  const grace = chain.grace;
  const events = chain.solidarityEvents || [];
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isAuthenticated, isPasskeyUser } = useAuth();

  return (
    <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="xl" p={5}>
      <HStack mb={4} justify="space-between">
        <HStack>
          <Heading fontSize="md" fontWeight="700" color="warmGray.800">{chain.name}</Heading>
          <Badge
            bg={solidarity?.distributionPaused ? 'warmGray.100' : 'green.50'}
            color={solidarity?.distributionPaused ? 'warmGray.500' : 'green.600'}
            fontSize="2xs"
          >
            {solidarity?.distributionPaused === true ? 'Paused' : solidarity?.distributionPaused === false ? 'Active' : '...'}
          </Badge>
        </HStack>
        {isAuthenticated && !isPasskeyUser && (
          <Button size="xs" colorScheme="green" variant="outline" onClick={onOpen}>
            Donate
          </Button>
        )}
      </HStack>
      <DonateModal isOpen={isOpen} onClose={onClose} chain={chain} />

      <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3} mb={4}>
        <StatCard
          label="Fund Balance"
          value={solidarity ? `${solidarity.balance} ${chain.nativeCurrency}` : '...'}
          color="green.600"
        />
        <StatCard
          label="Total Fees Collected"
          value={solidarity ? `${solidarity.totalFeesCollected} ${chain.nativeCurrency}` : '...'}
          subtext="Cumulative from all orgs"
          color="amethyst.600"
        />
        <StatCard
          label="Total Orgs"
          value={chain.orgStats?.totalOrgs ?? '...'}
          subtext="Deployed organizations"
        />
        <StatCard
          label="Fee Rate"
          value={solidarity ? `${(solidarity.feePercentageBps / 100).toFixed(1)}%` : '1.0%'}
          subtext="Collected on gas"
        />
        <StatCard
          label="Grace Period"
          value={grace ? `${grace.initialGraceDays} days` : '...'}
          subtext={grace ? `Max ${grace.maxSpendDuringGrace} ${chain.nativeCurrency}` : ''}
        />
      </SimpleGrid>

      {events.length > 0 && (
        <Box>
          <Text fontSize="xs" fontWeight="600" color="warmGray.500" mb={2} textTransform="uppercase">
            Recent Activity
          </Text>
          <Box overflowX="auto" maxH="200px" overflowY="auto">
            <Table size="sm" variant="simple">
              <Thead>
                <Tr>
                  <Th color="warmGray.400" fontSize="2xs">Type</Th>
                  <Th color="warmGray.400" fontSize="2xs" isNumeric>Amount</Th>
                  <Th color="warmGray.400" fontSize="2xs">Date</Th>
                </Tr>
              </Thead>
              <Tbody>
                {events.slice(0, 10).map(e => (
                  <Tr key={e.id}>
                    <Td>
                      <Badge
                        fontSize="2xs"
                        bg={e.eventType === 'Donation' ? 'green.50' : e.eventType === 'FeeCollected' ? 'amethyst.50' : 'warmGray.50'}
                        color={e.eventType === 'Donation' ? 'green.600' : e.eventType === 'FeeCollected' ? 'amethyst.600' : 'warmGray.600'}
                      >
                        {e.eventType}
                      </Badge>
                    </Td>
                    <Td isNumeric fontSize="xs" fontFamily="mono">
                      {(parseInt(e.amount) / 1e18).toFixed(6)}
                    </Td>
                    <Td fontSize="xs" color="warmGray.500">
                      <HStack spacing={1}>
                        <Text>{new Date(parseInt(e.eventAt) * 1000).toLocaleDateString()}</Text>
                        {e.transactionHash && (
                          <Link href={`${chain.blockExplorer}/tx/${e.transactionHash}`} isExternal>
                            <ExternalLinkIcon boxSize={3} color="warmGray.400" />
                          </Link>
                        )}
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </Box>
      )}
    </Box>
  );
};

const SolidaritySection = ({ chains }) => (
  <Box as="section" py={{ base: 12, md: 16 }} bg="warmGray.50">
    <Container maxW="6xl">
      <MotionBox initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        <Text fontSize="sm" fontWeight="600" color="warmGray.400" letterSpacing="0.08em" textTransform="uppercase" mb={2}>
          Solidarity Fund
        </Text>
        <Heading fontSize={{ base: 'xl', md: '2xl' }} fontWeight="700" color="warmGray.800" mb={2}>
          Shared Gas Sponsorship
        </Heading>
        <Text fontSize="sm" color="warmGray.500" mb={6}>
          The solidarity fund subsidizes gas costs for new organizations during their grace period. Funded by a small fee on all sponsored transactions.
        </Text>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
          {Object.values(chains).map(chain => (
            <ChainSolidarityCard key={chain.chainId} chain={chain} />
          ))}
        </SimpleGrid>
      </MotionBox>
    </Container>
  </Box>
);

export default SolidaritySection;
