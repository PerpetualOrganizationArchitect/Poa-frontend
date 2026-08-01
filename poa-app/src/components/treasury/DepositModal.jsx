import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  VStack,
  HStack,
  Text,
  Button,
  Select,
  Input,
  InputGroup,
  InputRightElement,
  Box,
} from '@chakra-ui/react';
import PulseLoader from "@/components/shared/PulseLoader";
import { FiCheck } from 'react-icons/fi';
import { ethers } from 'ethers';
import { useWeb3 } from '@/hooks/useWeb3Services';
import { useAuth } from '@/context/AuthContext';
import { RefreshEvent } from '@/context/RefreshContext';
import { getBountyTokenOptions } from '@/util/tokens';
import { formatTokenAmount, parseTokenAmount } from '@/util/formatToken';
import { createChainClients } from '@/services/web3/utils/chainClients';

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(0, 0, 0, .85)',
};

const DepositModal = ({
  isOpen,
  onClose,
  paymentManagerAddress,
  orgChainId,
  // Optional: override deposit target (e.g., TaskManager for bounty funding)
  targetAddress,       // defaults to paymentManagerAddress
  targetLabel,         // defaults to "Treasury"
  useDirectTransfer,   // if true, use ERC20.transfer instead of PaymentManager.payERC20
}) => {
  const depositTarget = targetAddress || paymentManagerAddress;
  const depositLabel = targetLabel || 'Treasury';
  const { treasury, executeWithNotification, isReady } = useWeb3();
  const { accountAddress } = useAuth();

  const [selectedToken, setSelectedToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [userBalance, setUserBalance] = useState('0');
  const [currentAllowance, setCurrentAllowance] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  const [step, setStep] = useState('form'); // 'form' | 'approving' | 'depositing' | 'success'

  const tokens = getBountyTokenOptions(orgChainId);

  const resetForm = useCallback(() => {
    setSelectedToken(null);
    setAmount('');
    setUserBalance('0');
    setCurrentAllowance('0');
    setIsLoading(false);
    setIsFetchingBalance(false);
    setStep('form');
  }, []);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) resetForm();
  }, [isOpen, resetForm]);

  // Fetch user balance and allowance when token is selected
  useEffect(() => {
    if (!selectedToken || !accountAddress || !depositTarget || !orgChainId) return;

    let cancelled = false;

    const fetchTokenData = async () => {
      setIsFetchingBalance(true);
      try {
        const clients = createChainClients(orgChainId);
        const client = clients?.publicClient;
        if (!client || cancelled) return;

        // Always fetch user balance; skip allowance for direct transfers (not needed)
        const balancePromise = client.readContract({
          address: selectedToken.address,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [accountAddress],
        });

        if (useDirectTransfer) {
          const balance = await balancePromise;
          if (!cancelled) {
            setUserBalance(balance.toString());
            setCurrentAllowance(ethers.constants.MaxUint256.toString()); // skip approval
          }
        } else {
          const [balance, allowance] = await Promise.all([
            balancePromise,
            client.readContract({
              address: selectedToken.address,
              abi: ERC20_BALANCE_ABI,
              functionName: 'allowance',
              args: [accountAddress, depositTarget],
            }),
          ]);
          if (!cancelled) {
            setUserBalance(balance.toString());
            setCurrentAllowance(allowance.toString());
          }
        }
      } catch (e) {
        console.warn('Failed to fetch token data:', e.message);
        if (!cancelled) {
          setUserBalance('0');
          setCurrentAllowance('0');
        }
      } finally {
        if (!cancelled) setIsFetchingBalance(false);
      }
    };

    fetchTokenData();
    return () => { cancelled = true; };
  }, [selectedToken, accountAddress, depositTarget, orgChainId, useDirectTransfer]);

  const handleTokenChange = (e) => {
    const address = e.target.value;
    const token = tokens.find(t => t.address === address) || null;
    setSelectedToken(token);
    setAmount('');
  };

  const handleMaxClick = () => {
    if (!selectedToken || userBalance === '0') return;
    const formatted = formatTokenAmount(userBalance, selectedToken.decimals, selectedToken.decimals <= 6 ? 6 : 4);
    setAmount(formatted);
  };

  const formattedUserBalance = selectedToken
    ? formatTokenAmount(userBalance, selectedToken.decimals, selectedToken.decimals <= 6 ? 6 : 4)
    : '0';

  const isAmountValid = () => {
    if (!amount || !selectedToken || Number(amount) <= 0) return false;
    try {
      const weiAmount = parseTokenAmount(amount, selectedToken.decimals);
      const balanceBN = ethers.BigNumber.from(userBalance);
      const amountBN = ethers.BigNumber.from(weiAmount);
      return amountBN.gt(0) && amountBN.lte(balanceBN);
    } catch {
      return false;
    }
  };

  const handleDeposit = async () => {
    if (!isAmountValid() || !treasury || !isReady) return;

    setIsLoading(true);
    const weiAmount = parseTokenAmount(amount, selectedToken.decimals);

    try {
      if (useDirectTransfer) {
        // Direct ERC20 transfer (e.g., funding TaskManager for bounties)
        setStep('depositing');
        const transferResult = await executeWithNotification(
          () => treasury.transferERC20(
            selectedToken.address,
            depositTarget,
            weiAmount
          ),
          {
            pendingMessage: `Sending ${amount} ${selectedToken.symbol} to ${depositLabel}...`,
            successMessage: `Sent ${amount} ${selectedToken.symbol} to ${depositLabel}!`,
            refreshEvent: RefreshEvent.TREASURY_DEPOSITED,
            refreshData: { token: selectedToken.symbol, amount },
          }
        );

        if (transferResult.success) {
          setStep('success');
          setTimeout(() => { onClose(); }, 1500);
        } else {
          setStep('form');
        }
      } else {
        // Standard approve + deposit flow (PaymentManager)
        const allowanceBN = ethers.BigNumber.from(currentAllowance);
        const amountBN = ethers.BigNumber.from(weiAmount);

        if (allowanceBN.lt(amountBN)) {
          setStep('approving');
          const approveResult = await executeWithNotification(
            () => treasury.approveToken(
              selectedToken.address,
              depositTarget,
              weiAmount
            ),
            {
              pendingMessage: `Approving ${selectedToken.symbol}...`,
              successMessage: `${selectedToken.symbol} approved!`,
            }
          );

          if (!approveResult.success) {
            setStep('form');
            setIsLoading(false);
            return;
          }
          setCurrentAllowance(weiAmount);
        }

        setStep('depositing');
        const depositResult = await executeWithNotification(
          () => treasury.depositERC20(
            depositTarget,
            selectedToken.address,
            weiAmount
          ),
          {
            pendingMessage: `Depositing ${amount} ${selectedToken.symbol}...`,
            successMessage: `Deposited ${amount} ${selectedToken.symbol} to ${depositLabel}!`,
            refreshEvent: RefreshEvent.TREASURY_DEPOSITED,
            refreshData: { token: selectedToken.symbol, amount },
          }
        );

        if (depositResult.success) {
          setStep('success');
          setTimeout(() => { onClose(); }, 1500);
        } else {
          setStep('form');
        }
      }
    } catch (error) {
      console.error('Deposit failed:', error);
      setStep('form');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md" closeOnOverlayClick={!isLoading}>
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent
        bg="transparent"
        boxShadow="xl"
        borderRadius="2xl"
        position="relative"
        color="whitesmoke"
      >
        <div style={glassLayerStyle} />
        <ModalHeader borderBottom="1px solid" borderColor="whiteAlpha.100">
          Deposit to {depositLabel}
        </ModalHeader>
        <ModalCloseButton isDisabled={isLoading} />

        <ModalBody py={6}>
          {step === 'success' ? (
            <VStack spacing={4} py={8}>
              <Box
                w="64px"
                h="64px"
                borderRadius="full"
                bg="green.500"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <FiCheck size={32} color="white" />
              </Box>
              <Text fontSize="xl" fontWeight="bold">
                Deposit Successful!
              </Text>
              <Text color="gray.400" textAlign="center">
                {amount} {selectedToken?.symbol} has been deposited to {depositLabel}.
              </Text>
            </VStack>
          ) : step === 'approving' || step === 'depositing' ? (
            <VStack spacing={4} py={8}>
              <PulseLoader size="xl" color="purple.400" />
              <Text fontSize="lg" fontWeight="bold">
                {step === 'approving'
                  ? `Approving ${selectedToken?.symbol}...`
                  : `Depositing ${amount} ${selectedToken?.symbol}...`}
              </Text>
              <Text color="gray.400" textAlign="center" fontSize="sm">
                Please confirm the transaction in your wallet.
              </Text>
            </VStack>
          ) : (
            <VStack spacing={5}>
              {/* Token selector */}
              <Box w="100%">
                <Text mb={2} fontSize="sm" fontWeight="medium" color="gray.300">
                  Token
                </Text>
                <Select
                  placeholder="Select token"
                  value={selectedToken?.address || ''}
                  onChange={handleTokenChange}
                  bg="rgba(0, 0, 0, 0.4)"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  _hover={{ borderColor: 'purple.400' }}
                  _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                >
                  {tokens.map(token => (
                    <option key={token.address} value={token.address} style={{ background: '#1a1a2e' }}>
                      {token.symbol} · {token.name}
                    </option>
                  ))}
                </Select>
              </Box>

              {/* Amount input */}
              <Box w="100%">
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="sm" fontWeight="medium" color="gray.300">
                    Amount
                  </Text>
                  {selectedToken && (
                    <HStack spacing={1}>
                      <Text fontSize="xs" color="gray.500">
                        Balance: {isFetchingBalance ? '...' : formattedUserBalance}
                      </Text>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="purple"
                        onClick={handleMaxClick}
                        isDisabled={!selectedToken || userBalance === '0' || isFetchingBalance}
                      >
                        MAX
                      </Button>
                    </HStack>
                  )}
                </HStack>
                <InputGroup>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    isDisabled={!selectedToken}
                    bg="rgba(0, 0, 0, 0.4)"
                    border="1px solid"
                    borderColor="whiteAlpha.200"
                    _hover={{ borderColor: 'purple.400' }}
                    _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                    step="any"
                  />
                  {selectedToken && (
                    <InputRightElement pr={3} pointerEvents="none">
                      <Text fontSize="sm" color="gray.400" fontWeight="medium">
                        {selectedToken.symbol}
                      </Text>
                    </InputRightElement>
                  )}
                </InputGroup>
              </Box>

              {/* Validation message */}
              {amount && selectedToken && !isAmountValid() && (
                <Text fontSize="xs" color="red.300">
                  {Number(amount) <= 0
                    ? 'Amount must be greater than 0'
                    : 'Amount exceeds your balance'}
                </Text>
              )}
            </VStack>
          )}
        </ModalBody>

        {step === 'form' && (
          <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.100" gap={3}>
            <Button variant="ghost" onClick={onClose} isDisabled={isLoading}>
              Cancel
            </Button>
            <Button
              colorScheme="purple"
              onClick={handleDeposit}
              isDisabled={!isAmountValid() || isLoading || !isReady || isFetchingBalance}
              isLoading={isLoading}
            >
              Deposit
            </Button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
};

export default DepositModal;
