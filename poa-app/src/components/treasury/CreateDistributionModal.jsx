import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, VStack, HStack, Text, Button, Select, Input,
  InputGroup, InputRightElement, Box, Divider, Alert, AlertIcon,
} from '@chakra-ui/react';
import PulseLoader from "@/components/shared/PulseLoader";
import { FiCheck } from 'react-icons/fi';
import { ethers } from 'ethers';
import { useWeb3 } from '@/hooks/useWeb3Services';

import { usePOContext } from '@/context/POContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { getBountyTokenOptions } from '@/util/tokens';
import { formatTokenAmount, parseTokenAmount } from '@/util/formatToken';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { buildDistributionTree } from '@/util/merkleDistribution';
import { useQuery, gql } from '@apollo/client';
import { getClient } from '@/util/apolloClient';

const FETCH_PT_HOLDERS = gql`
  query FetchPTHolders($orgId: Bytes!) {
    organization(id: $orgId) {
      participationToken {
        id
        totalSupply
      }
      users(first: 1000, where: { membershipStatus: Active }) {
        address
        participationTokenBalance
        account {
          username
        }
      }
    }
  }
`;

const ERC20_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
];

const glassLayerStyle = {
  position: 'absolute', height: '100%', width: '100%',
  zIndex: -1, borderRadius: 'inherit', backgroundColor: 'rgba(0, 0, 0, .85)',
};

const CreateDistributionModal = ({
  isOpen, onClose, paymentManagerAddress, orgChainId,
  votingContractAddress,
}) => {
  const { voting, executeWithNotification, isReady } = useWeb3();

  const { orgId, subgraphUrl } = usePOContext();
  const { addToIpfs } = useIPFScontext();

  const [selectedToken, setSelectedToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('1440');
  const [treasuryBalance, setTreasuryBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState('form'); // form | building | submitting | success

  const tokens = useMemo(() => getBountyTokenOptions(orgChainId), [orgChainId]);

  // Fetch PT holders from subgraph.
  // Per-chain client prevents cache poisoning: each endpoint has its own InMemoryCache.
  const orgClient = useMemo(() => getClient(subgraphUrl), [subgraphUrl]);
  const { data: holderData } = useQuery(FETCH_PT_HOLDERS, {
    variables: { orgId },
    skip: !orgId || !isOpen,
    client: orgClient,
  });

  const holders = useMemo(() => {
    if (!holderData?.organization?.users) return [];
    return holderData.organization.users
      .filter(u => u.participationTokenBalance && u.participationTokenBalance !== '0')
      .map(u => ({
        address: u.address,
        balance: u.participationTokenBalance,
        username: u.account?.username || null,
      }));
  }, [holderData]);

  // Reset on close
  const resetForm = useCallback(() => {
    setSelectedToken(null);
    setAmount('');
    setDurationMinutes('1440');
    setTreasuryBalance('0');
    setIsLoading(false);
    setStep('form');
  }, []);

  useEffect(() => {
    if (!isOpen) resetForm();
  }, [isOpen, resetForm]);

  // Fetch treasury balance for selected token
  useEffect(() => {
    if (!selectedToken || !paymentManagerAddress || !orgChainId) return;
    let cancelled = false;
    const fetch = async () => {
      try {
        const clients = createChainClients(orgChainId);
        const client = clients?.publicClient;
        if (!client || cancelled) return;
        const bal = await client.readContract({
          address: selectedToken.address,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [paymentManagerAddress],
        });
        if (!cancelled) setTreasuryBalance(bal.toString());
      } catch { if (!cancelled) setTreasuryBalance('0'); }
    };
    fetch();
    return () => { cancelled = true; };
  }, [selectedToken, paymentManagerAddress, orgChainId]);

  const formattedBalance = selectedToken
    ? formatTokenAmount(treasuryBalance, selectedToken.decimals, 4)
    : '0';

  const isAmountValid = () => {
    if (!amount || !selectedToken || Number(amount) <= 0) return false;
    try {
      const wei = parseTokenAmount(amount, selectedToken.decimals);
      return ethers.BigNumber.from(wei).gt(0) &&
        ethers.BigNumber.from(wei).lte(ethers.BigNumber.from(treasuryBalance));
    } catch { return false; }
  };

  const handleSubmit = async () => {
    if (!isAmountValid() || !voting || !isReady || holders.length === 0) return;

    setIsLoading(true);
    setStep('building');

    try {
      const weiAmount = parseTokenAmount(amount, selectedToken.decimals);

      // 1. Build merkle tree from holder balances
      const treeResult = buildDistributionTree(holders, weiAmount);
      console.log('[Distribution] Merkle tree built:', {
        root: treeResult.root,
        holders: treeResult.holderCount,
        total: treeResult.totalDistributed,
      });

      // 2. Get checkpoint block
      const clients = createChainClients(orgChainId);
      const blockNumber = await clients.publicClient.getBlockNumber();
      const checkpointBlock = Number(blockNumber) - 1; // Must be in the past

      // 3. Upload merkle tree to IPFS
      const treeIpfsData = {
        token: selectedToken.address,
        tokenSymbol: selectedToken.symbol,
        totalAmount: weiAmount,
        checkpointBlock,
        merkleRoot: treeResult.root,
        claims: treeResult.claims,
        createdAt: Date.now(),
      };
      const ipfsResult = await addToIpfs(JSON.stringify(treeIpfsData));
      const treeCid = ipfsResult.path;
      console.log('[Distribution] Tree uploaded to IPFS:', treeCid);

      // 4. Encode the createDistribution call
      const iface = new ethers.utils.Interface([
        'function createDistribution(address payoutToken, uint256 amount, bytes32 merkleRoot, uint256 checkpointBlock)',
      ]);
      const callData = iface.encodeFunctionData('createDistribution', [
        selectedToken.address,
        weiAmount,
        treeResult.root,
        checkpointBlock,
      ]);

      // 5. Build proposal batches: [yes: execute, no: do nothing]
      const batches = [
        [{ target: paymentManagerAddress, value: '0', data: callData }],
        [],
      ];

      // 6. Submit governance proposal
      setStep('submitting');
      const proposalData = {
        name: `Distribute ${amount} ${selectedToken.symbol}`,
        description: `Proportional distribution of ${amount} ${selectedToken.symbol} to ${treeResult.holderCount} shareholders based on share balances. Merkle tree: ipfs://${treeCid} Root: ${treeResult.root}`,
        durationMinutes: parseInt(durationMinutes) || 1440,
        numOptions: 2,
        optionNames: ['Approve Distribution', 'Reject'],
        batches,
        hatIds: [],
      };

      const result = await executeWithNotification(
        () => voting.createHybridProposal(votingContractAddress, proposalData),
        {
          pendingMessage: 'Creating distribution proposal...',
          successMessage: 'Distribution proposal created! Members can now vote.',
        }
      );

      if (result.success) {
        setStep('success');
        setTimeout(() => onClose(), 2000);
      } else {
        setStep('form');
      }
    } catch (error) {
      console.error('[Distribution] Failed:', error);
      setStep('form');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg" closeOnOverlayClick={!isLoading}>
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="transparent" boxShadow="xl" borderRadius="2xl" position="relative" color="whitesmoke">
        <div style={glassLayerStyle} />
        <ModalHeader borderBottom="1px solid" borderColor="whiteAlpha.100">
          Create Distribution Proposal
        </ModalHeader>
        <ModalCloseButton isDisabled={isLoading} />

        <ModalBody py={6}>
          {step === 'success' ? (
            <VStack spacing={4} py={8}>
              <Box w="64px" h="64px" borderRadius="full" bg="green.500" display="flex" alignItems="center" justifyContent="center">
                <FiCheck size={32} color="white" />
              </Box>
              <Text fontSize="xl" fontWeight="bold">Proposal Created!</Text>
              <Text color="gray.400" textAlign="center">
                Members can now vote on distributing {amount} {selectedToken?.symbol} to {holders.length} holders.
              </Text>
            </VStack>
          ) : step === 'building' || step === 'submitting' ? (
            <VStack spacing={4} py={8}>
              <PulseLoader size="xl" color="purple.400" />
              <Text fontSize="lg" fontWeight="bold">
                {step === 'building' ? 'Building merkle tree...' : 'Creating proposal...'}
              </Text>
              <Text color="gray.400" textAlign="center" fontSize="sm">
                {step === 'building'
                  ? `Computing proportional shares for ${holders.length} holders`
                  : 'Please confirm the transaction in your wallet.'}
              </Text>
            </VStack>
          ) : (
            <VStack spacing={5}>
              <Alert status="info" borderRadius="md" bg="whiteAlpha.100" color="gray.300">
                <AlertIcon color="purple.300" />
                <Text fontSize="sm">
                  This creates a governance proposal. Members vote to approve the distribution.
                </Text>
              </Alert>

              {/* Token selector */}
              <Box w="100%">
                <Text mb={2} fontSize="sm" fontWeight="medium" color="gray.300">Token</Text>
                <Select
                  placeholder="Select token"
                  value={selectedToken?.address || ''}
                  onChange={(e) => {
                    const token = tokens.find(t => t.address === e.target.value) || null;
                    setSelectedToken(token);
                    setAmount('');
                  }}
                  bg="rgba(0,0,0,0.4)" border="1px solid" borderColor="whiteAlpha.200"
                  _hover={{ borderColor: 'purple.400' }}
                  _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                >
                  {tokens.map(t => (
                    <option key={t.address} value={t.address} style={{ background: '#1a1a2e' }}>
                      {t.symbol} · {t.name}
                    </option>
                  ))}
                </Select>
              </Box>

              {/* Amount */}
              <Box w="100%">
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="sm" fontWeight="medium" color="gray.300">Amount</Text>
                  {selectedToken && (
                    <Text fontSize="xs" color="gray.500">
                      Treasury: {formattedBalance} {selectedToken.symbol}
                    </Text>
                  )}
                </HStack>
                <InputGroup>
                  <Input
                    type="number" placeholder="0.00" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    isDisabled={!selectedToken}
                    bg="rgba(0,0,0,0.4)" border="1px solid" borderColor="whiteAlpha.200"
                    _hover={{ borderColor: 'purple.400' }}
                    _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                    step="any"
                  />
                  {selectedToken && (
                    <InputRightElement pr={3} pointerEvents="none">
                      <Text fontSize="sm" color="gray.400" fontWeight="medium">{selectedToken.symbol}</Text>
                    </InputRightElement>
                  )}
                </InputGroup>
                {amount && selectedToken && !isAmountValid() && (
                  <Text fontSize="xs" color="red.300" mt={1}>
                    {Number(amount) <= 0 ? 'Must be greater than 0' : 'Exceeds treasury balance'}
                  </Text>
                )}
              </Box>

              {/* Voting duration */}
              <Box w="100%">
                <Text mb={2} fontSize="sm" fontWeight="medium" color="gray.300">Voting Duration</Text>
                <Select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  bg="rgba(0,0,0,0.4)" border="1px solid" borderColor="whiteAlpha.200"
                  _hover={{ borderColor: 'purple.400' }}
                  _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                >
                  <option value="60" style={{ background: '#1a1a2e' }}>1 hour</option>
                  <option value="720" style={{ background: '#1a1a2e' }}>12 hours</option>
                  <option value="1440" style={{ background: '#1a1a2e' }}>24 hours</option>
                  <option value="4320" style={{ background: '#1a1a2e' }}>3 days</option>
                  <option value="10080" style={{ background: '#1a1a2e' }}>7 days</option>
                </Select>
              </Box>

              <Divider borderColor="whiteAlpha.100" />

              {/* Holder preview */}
              <Box w="100%" bg="rgba(0,0,0,0.3)" borderRadius="md" p={3}>
                <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={1}>Distribution Preview</Text>
                <Text fontSize="xs" color="gray.400">
                  {holders.length > 0
                    ? `${holders.length} shareholders will receive proportional distributions based on their share balance.`
                    : 'Loading holder data...'}
                </Text>
                {holders.length > 0 && amount && Number(amount) > 0 && selectedToken && (
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Top holder gets ~{(() => {
                      try {
                        const maxBal = holders.reduce((max, h) =>
                          ethers.BigNumber.from(h.balance).gt(ethers.BigNumber.from(max.balance)) ? h : max, holders[0]);
                        const totalSupply = holders.reduce((s, h) => s.add(ethers.BigNumber.from(h.balance)), ethers.BigNumber.from(0));
                        const share = ethers.BigNumber.from(maxBal.balance).mul(ethers.utils.parseUnits(amount, selectedToken.decimals)).div(totalSupply);
                        return formatTokenAmount(share.toString(), selectedToken.decimals, 4);
                      } catch { return '?'; }
                    })()} {selectedToken.symbol}
                    {holders[0]?.username ? ` (${holders.reduce((max, h) => ethers.BigNumber.from(h.balance).gt(ethers.BigNumber.from(max.balance)) ? h : max, holders[0]).username})` : ''}
                  </Text>
                )}
              </Box>
            </VStack>
          )}
        </ModalBody>

        {step === 'form' && (
          <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.100" gap={3}>
            <Button variant="ghost" onClick={onClose} isDisabled={isLoading}>Cancel</Button>
            <Button
              colorScheme="purple"
              onClick={handleSubmit}
              isDisabled={!isAmountValid() || isLoading || !isReady || holders.length === 0 || !votingContractAddress}
              isLoading={isLoading}
            >
              Create Proposal
            </Button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
};

export default CreateDistributionModal;
