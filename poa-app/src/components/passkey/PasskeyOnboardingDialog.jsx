import { useId, useRef, useState } from 'react';
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
import useOnboardingColors from '@/components/shared/useOnboardingColors';
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
  variant,
}) {
  const [username, setUsername] = useState('');
  const inputRef = useRef(null);
  const toast = useToast();
  const usernameId = useId();
  const isJoin = variant === 'join';
  const joinColors = useOnboardingColors();
  const joinButtonStyle = isJoin ? {
    bg: joinColors.primary,
    color: joinColors.primaryText,
    _hover: { bg: joinColors.hover },
    _active: { bg: joinColors.hover },
    _focusVisible: { boxShadow: joinColors.focusRing },
  } : {};
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
  // Only the join presentation translates phase labels; the service's step data is unchanged.
  const joinStepLabels = {
    [OnboardingStep.CREATING_CREDENTIAL]: 'Create your passkey to continue.',
    [OnboardingStep.COMPUTING_ADDRESS]: 'Setting up your account…',
    [OnboardingStep.BUILDING_TRANSACTION]: 'Preparing your membership…',
    [OnboardingStep.SIGNING_REGISTRATION]: 'Confirm your username with your passkey.',
    [OnboardingStep.SIGNING]: 'Confirm with your passkey to continue.',
    [OnboardingStep.SUBMITTING]: 'Finishing your account setup…',
    [OnboardingStep.CONFIRMING]: 'Confirming your membership…',
  };

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
        bg={isJoin ? joinColors.surface : 'white'}
        color={isJoin ? joinColors.ink : undefined}
        border={isJoin ? '1px solid' : undefined}
        borderColor={isJoin ? joinColors.line : undefined}
        boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)"
        mx={4}
      >
        <ModalHeader textAlign={isJoin ? 'left' : 'center'} pt={isJoin ? 7 : 6} pr={isJoin ? 12 : undefined} pb={2} fontSize={isJoin ? '26px' : 'xl'} fontWeight={isJoin ? '600' : '700'} letterSpacing={isJoin ? '-0.035em' : undefined}>
          {isSuccess ? (isJoin ? 'You’re all set' : 'Account Created!') : (isJoin ? 'Create your account' : 'Create Passkey Account')}
        </ModalHeader>
        {!isInProgress && <ModalCloseButton />}

        <ModalBody px={6} pb={4}>
          {!isInProgress && !isSuccess && !isError && (
            <VStack spacing={5}>
              <Box textAlign={isJoin ? 'left' : 'center'}>
                <Icon as={FaFingerprint} w={isJoin ? 8 : 12} h={isJoin ? 8 : 12} color={isJoin ? joinColors.accent : 'amethyst.500'} mb={3} aria-hidden="true" />
                <Text fontSize="sm" color={isJoin ? joinColors.muted : 'warmGray.600'} lineHeight={isJoin ? '1.7' : '1.6'}>
                  {isJoin ? 'You’ll sign in with your face, fingerprint, or device PIN. Your passkey replaces a password.' : <>Create an account using your device&apos;s biometric authentication. No wallet extension or ETH needed.</>}
                </Text>
              </Box>

              <Box w="100%">
                <Text as="label" htmlFor={usernameId} display="block" fontSize="sm" fontWeight="600" mb={2} color={isJoin ? joinColors.ink : 'warmGray.700'}>
                  Choose a username
                </Text>
                <Input
                  ref={inputRef}
                  id={usernameId}
                  autoComplete={isJoin ? 'username' : undefined}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter username"
                  size="lg"
                  borderRadius={isJoin ? 'lg' : 'xl'}
                  borderColor={isJoin ? joinColors.line : 'warmGray.200'}
                  _focus={{
                    borderColor: 'amethyst.400',
                    boxShadow: '0 0 0 3px rgba(144, 85, 232, 0.15)',
                  }}
                  onKeyDown={(event) => event.key === 'Enter' && handleStart()}
                  {...(isJoin ? { bg: joinColors.surface, color: joinColors.ink, _placeholder: { color: joinColors.muted }, _focus: { borderColor: joinColors.primary, boxShadow: joinColors.inputFocusRing } } : {})}
                />
              </Box>

              {!isReady && (
                <Text fontSize="xs" color={isJoin ? joinColors.muted : 'warmGray.500'} textAlign="center">
                  {isJoin ? 'Getting things ready…' : 'Loading infrastructure...'}
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
                color={isJoin ? joinColors.accent : 'amethyst.500'}
                animation={
                  !isJoin && (step === OnboardingStep.SIGNING || step === OnboardingStep.CREATING_CREDENTIAL)
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

              <Text fontSize="md" fontWeight="600" color={isJoin ? joinColors.ink : 'warmGray.700'} textAlign="center" aria-live={isJoin ? 'polite' : undefined}>
                {isJoin ? (joinStepLabels[step] || stepMessage) : stepMessage}
              </Text>

              <Progress
                value={progress}
                size="sm"
                w="100%"
                borderRadius="full"
                colorScheme={isJoin ? 'amethyst' : 'purple'}
                hasStripe={!isJoin}
                isAnimated={!isJoin}
                aria-label="Account setup progress"
              />

              {(step === OnboardingStep.CREATING_CREDENTIAL || step === OnboardingStep.SIGNING) && (
                <Text fontSize="xs" color={isJoin ? joinColors.muted : 'warmGray.500'} textAlign="center">
                  {isJoin ? 'Use your face, fingerprint, or device PIN when prompted.' : 'Use Touch ID, Face ID, or your device PIN when prompted.'}
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
                bg={isJoin ? joinColors.soft : 'green.100'}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Icon as={FaCheck} w={8} h={8} color={isJoin ? joinColors.accent : 'green.500'} />
              </Box>

              <Text fontSize="sm" color={isJoin ? joinColors.muted : 'warmGray.600'} textAlign="center">
                {successMessage}
              </Text>

              <Box as={isJoin ? 'details' : 'div'} w="100%" p={3} bg={isJoin ? joinColors.soft : 'warmGray.50'} borderRadius="xl" textAlign={isJoin ? 'left' : 'center'}>
                <Text as={isJoin ? 'summary' : 'p'} fontSize="xs" color={isJoin ? joinColors.muted : 'warmGray.500'} mb={1} cursor={isJoin ? 'pointer' : undefined}>
                  {isJoin ? 'Account details' : 'Account Address'}
                </Text>
                <Text fontSize="sm" fontFamily="mono" color={isJoin ? joinColors.ink : 'warmGray.700'} wordBreak="break-all">
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

              <Text fontSize="sm" color={isJoin ? joinColors.ink : 'warmGray.700'} textAlign="center" fontWeight="600">
                Something went wrong
              </Text>
              <Text fontSize="xs" color={isJoin ? joinColors.muted : 'warmGray.500'} textAlign="center" role={isJoin ? 'alert' : undefined}>
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
                borderRadius={isJoin ? 'lg' : 'xl'}
                bg="amethyst.500"
                color="white"
                _hover={{ bg: 'amethyst.600', transform: 'translateY(-1px)', boxShadow: 'lg' }}
                _active={{ bg: 'amethyst.700', transform: 'translateY(0)' }}
                onClick={handleStart}
                isDisabled={!isReady || !username.trim()}
                leftIcon={<FaFingerprint />}
                {...joinButtonStyle}
              >
                {isJoin ? 'Create account' : 'Create with Passkey'}
              </Button>

              {onConnectWallet && (
                <>
                  <HStack width="100%" align="center" display={isJoin ? 'none' : undefined}>
                    <Divider borderColor="warmGray.200" />
                    <Text fontSize="xs" color="warmGray.400" whiteSpace="nowrap" px={2}>
                      or
                    </Text>
                    <Divider borderColor="warmGray.200" />
                  </HStack>

                  <Button
                    w="100%"
                    size="lg"
                    borderRadius={isJoin ? 'lg' : 'xl'}
                    bg="blue.50"
                    border="1px solid"
                    borderColor="blue.200"
                    color="warmGray.800"
                    _hover={{ bg: 'blue.100', transform: 'translateY(-1px)', boxShadow: 'md' }}
                    _active={{ bg: 'blue.200', transform: 'translateY(0)' }}
                    onClick={handleConnectWallet}
                    leftIcon={<Icon as={FaWallet} color="blue.500" />}
                    {...(isJoin ? { size: 'sm', minH: '44px', bg: 'transparent', borderColor: 'transparent', color: joinColors.muted, _hover: { bg: joinColors.soft }, _active: { bg: joinColors.soft }, leftIcon: <Icon as={FaWallet} color={joinColors.muted} /> } : {})}
                  >
                    {isJoin ? 'Use a wallet instead' : 'Connect Wallet'}
                  </Button>
                </>
              )}
            </VStack>
          )}

          {isSuccess && (
            <Button
              w="100%"
              size="lg"
              borderRadius={isJoin ? 'lg' : 'xl'}
              colorScheme="green"
              onClick={handleClose}
              {...joinButtonStyle}
            >
              {successActionLabel}
            </Button>
          )}

          {isError && (
            <HStack w="100%" spacing={3}>
              <Button flex={1} size="lg" borderRadius={isJoin ? 'lg' : 'xl'} variant="outline" onClick={handleClose} {...(isJoin ? { borderColor: joinColors.line, color: joinColors.ink, _hover: { bg: joinColors.soft } } : {})}>
                Cancel
              </Button>
              <Button
                flex={1}
                size="lg"
                borderRadius={isJoin ? 'lg' : 'xl'}
                bg="amethyst.500"
                color="white"
                _hover={{ bg: 'amethyst.600' }}
                onClick={reset}
                {...joinButtonStyle}
              >
                {isJoin ? 'Try again' : 'Try Again'}
              </Button>
            </HStack>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
