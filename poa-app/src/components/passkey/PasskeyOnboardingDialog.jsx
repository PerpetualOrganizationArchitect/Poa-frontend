import { useRef, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  HStack,
  Icon,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { FaCheck, FaExclamationTriangle, FaFingerprint, FaWallet } from 'react-icons/fa';
import { OnboardingStep } from '@/services/web3/domain/PasskeyOnboardingService';

const STEP_PROGRESS = {
  [OnboardingStep.IDLE]: 0,
  [OnboardingStep.CREATING_CREDENTIAL]: 15,
  [OnboardingStep.COMPUTING_ADDRESS]: 30,
  [OnboardingStep.BUILDING_TRANSACTION]: 45,
  [OnboardingStep.SIGNING]: 55,
  [OnboardingStep.SUBMITTING]: 70,
  [OnboardingStep.CONFIRMING]: 85,
  [OnboardingStep.SUCCESS]: 100,
  [OnboardingStep.ERROR]: 0,
};

/**
 * Shared presentation for both organization-funded and solidarity-funded
 * passkey onboarding. The wrappers own the distinct data/transaction hooks;
 * this component owns the identical form, progress, success, and error UI.
 */
export default function PasskeyOnboardingDialog({
  isOpen,
  onClose,
  onSuccess,
  onboarding,
  startOnboarding,
  successMessage,
  successActionLabel,
  onConnectWallet,
}) {
  const [username, setUsername] = useState('');
  const inputRef = useRef(null);
  const toast = useToast();
  const {
    step,
    stepMessage,
    error,
    result,
    isOnboarding,
    isReady,
    reset,
  } = onboarding;

  const progress = STEP_PROGRESS[step] || 0;
  const isInProgress = isOnboarding || (
    step !== OnboardingStep.IDLE &&
    step !== OnboardingStep.SUCCESS &&
    step !== OnboardingStep.ERROR
  );
  const isSuccess = step === OnboardingStep.SUCCESS;
  const isError = step === OnboardingStep.ERROR;

  const handleStart = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      toast({
        title: 'Username required',
        description: 'Please enter a username for your account.',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    if (trimmed.length < 3) {
      toast({
        title: 'Username too short',
        description: 'Username must be at least 3 characters.',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    await startOnboarding(trimmed);
  };

  const handleClose = () => {
    if (isInProgress) return;
    const wasSuccess = isSuccess;
    reset();
    setUsername('');
    onClose();
    if (wasSuccess) onSuccess?.(result);
  };

  const handleConnectWallet = () => {
    onClose();
    onConnectWallet?.();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      isCentered
      size="md"
      closeOnOverlayClick={!isInProgress}
      closeOnEsc={!isInProgress}
    >
      <ModalOverlay bg="blackAlpha.600" />
      <ModalContent
        borderRadius="2xl"
        bg="white"
        boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)"
        mx={4}
      >
        <ModalHeader textAlign="center" pt={6} pb={2} fontSize="xl" fontWeight="700">
          {isSuccess ? 'Account Created!' : 'Create Passkey Account'}
        </ModalHeader>
        {!isInProgress && <ModalCloseButton />}

        <ModalBody px={6} pb={4}>
          {!isInProgress && !isSuccess && !isError && (
            <VStack spacing={5}>
              <Box textAlign="center">
                <Icon as={FaFingerprint} w={12} h={12} color="amethyst.500" mb={3} />
                <Text fontSize="sm" color="warmGray.600" lineHeight="1.6">
                  Create an account using your device&apos;s biometric authentication.
                  No wallet extension or ETH needed.
                </Text>
              </Box>

              <Box w="100%">
                <Text fontSize="sm" fontWeight="600" mb={2} color="warmGray.700">
                  Choose a username
                </Text>
                <Input
                  ref={inputRef}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter username"
                  size="lg"
                  borderRadius="xl"
                  borderColor="warmGray.200"
                  _focus={{
                    borderColor: 'amethyst.400',
                    boxShadow: '0 0 0 3px rgba(144, 85, 232, 0.15)',
                  }}
                  onKeyDown={(event) => event.key === 'Enter' && handleStart()}
                />
              </Box>

              {!isReady && (
                <Text fontSize="xs" color="warmGray.500" textAlign="center">
                  Loading infrastructure...
                </Text>
              )}
            </VStack>
          )}

          {isInProgress && (
            <VStack spacing={5} py={4}>
              <Icon
                as={FaFingerprint}
                w={16}
                h={16}
                color="amethyst.500"
                animation={
                  step === OnboardingStep.SIGNING || step === OnboardingStep.CREATING_CREDENTIAL
                    ? 'pulse 1.5s ease-in-out infinite'
                    : undefined
                }
                sx={{
                  '@keyframes pulse': {
                    '0%': { transform: 'scale(1)', opacity: 1 },
                    '50%': { transform: 'scale(1.1)', opacity: 0.7 },
                    '100%': { transform: 'scale(1)', opacity: 1 },
                  },
                }}
              />

              <Text fontSize="md" fontWeight="600" color="warmGray.700" textAlign="center">
                {stepMessage}
              </Text>

              <Progress
                value={progress}
                size="sm"
                w="100%"
                borderRadius="full"
                colorScheme="purple"
                hasStripe
                isAnimated
              />

              {(step === OnboardingStep.CREATING_CREDENTIAL || step === OnboardingStep.SIGNING) && (
                <Text fontSize="xs" color="warmGray.500" textAlign="center">
                  Use Touch ID, Face ID, or your device PIN when prompted.
                </Text>
              )}
            </VStack>
          )}

          {isSuccess && result && (
            <VStack spacing={4} py={4}>
              <Box
                w={16}
                h={16}
                borderRadius="full"
                bg="green.100"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Icon as={FaCheck} w={8} h={8} color="green.500" />
              </Box>

              <Text fontSize="sm" color="warmGray.600" textAlign="center">
                {successMessage}
              </Text>

              <Box w="100%" p={3} bg="warmGray.50" borderRadius="xl" textAlign="center">
                <Text fontSize="xs" color="warmGray.500" mb={1}>
                  Account Address
                </Text>
                <Text fontSize="sm" fontFamily="mono" color="warmGray.700" wordBreak="break-all">
                  {result.accountAddress}
                </Text>
              </Box>
            </VStack>
          )}

          {isError && error && (
            <VStack spacing={4} py={4}>
              <Box
                w={16}
                h={16}
                borderRadius="full"
                bg="red.100"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Icon as={FaExclamationTriangle} w={8} h={8} color="red.500" />
              </Box>

              <Text fontSize="sm" color="warmGray.700" textAlign="center" fontWeight="600">
                Something went wrong
              </Text>
              <Text fontSize="xs" color="warmGray.500" textAlign="center">
                {error.message || 'An unexpected error occurred. Please try again.'}
              </Text>
            </VStack>
          )}
        </ModalBody>

        <ModalFooter px={6} pb={6} pt={2}>
          {!isInProgress && !isSuccess && !isError && (
            <VStack w="100%" spacing={3}>
              <Button
                w="100%"
                size="lg"
                borderRadius="xl"
                bg="amethyst.500"
                color="white"
                _hover={{ bg: 'amethyst.600', transform: 'translateY(-1px)', boxShadow: 'lg' }}
                _active={{ bg: 'amethyst.700', transform: 'translateY(0)' }}
                onClick={handleStart}
                isDisabled={!isReady || !username.trim()}
                leftIcon={<FaFingerprint />}
              >
                Create with Passkey
              </Button>

              {onConnectWallet && (
                <>
                  <HStack width="100%" align="center">
                    <Divider borderColor="warmGray.200" />
                    <Text fontSize="xs" color="warmGray.400" whiteSpace="nowrap" px={2}>
                      or
                    </Text>
                    <Divider borderColor="warmGray.200" />
                  </HStack>

                  <Button
                    w="100%"
                    size="lg"
                    borderRadius="xl"
                    bg="blue.50"
                    border="1px solid"
                    borderColor="blue.200"
                    color="warmGray.800"
                    _hover={{ bg: 'blue.100', transform: 'translateY(-1px)', boxShadow: 'md' }}
                    _active={{ bg: 'blue.200', transform: 'translateY(0)' }}
                    onClick={handleConnectWallet}
                    leftIcon={<Icon as={FaWallet} color="blue.500" />}
                  >
                    Connect Wallet
                  </Button>
                </>
              )}
            </VStack>
          )}

          {isSuccess && (
            <Button
              w="100%"
              size="lg"
              borderRadius="xl"
              colorScheme="green"
              onClick={handleClose}
            >
              {successActionLabel}
            </Button>
          )}

          {isError && (
            <HStack w="100%" spacing={3}>
              <Button flex={1} size="lg" borderRadius="xl" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                flex={1}
                size="lg"
                borderRadius="xl"
                bg="amethyst.500"
                color="white"
                _hover={{ bg: 'amethyst.600' }}
                onClick={reset}
              >
                Try Again
              </Button>
            </HStack>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
