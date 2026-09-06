/**
 * SignInModal
 * Pure sign-in modal for existing users — passkey auth or wallet connect.
 * Does NOT handle account creation (use SolidarityOnboardingModal for that).
 */

import { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Button,
  Text,
  VStack,
  HStack,
  Icon,
  Divider,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { FaFingerprint, FaWallet } from 'react-icons/fa';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import useOnboardingColors from '@/components/shared/useOnboardingColors';
import { useAuth } from '../../context/AuthContext';

export default function SignInModal({ isOpen, onClose, onSuccess, onCreateAccount, variant }) {
  const { connectPasskey, passkeyConnecting } = useAuth();
  const { openConnectModal } = useConnectModal();
  const [error, setError] = useState(null);
  const isJoin = variant === 'join';
  const joinColors = useOnboardingColors();

  const handlePasskeyClick = async () => {
    setError(null);
    try {
      await connectPasskey();
      onClose();
      onSuccess?.();
    } catch (err) {
      console.error('Failed to sign in with passkey:', err);
      setError('We couldn’t sign you in. Please try again.');
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleWalletClick = () => {
    onClose();
    openConnectModal?.();
  };

  const handleCreateAccount = () => {
    onClose();
    onCreateAccount?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md">
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
          {isJoin ? 'Welcome back' : 'Sign In'}
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody px={6} pb={6}>
          <VStack spacing={4}>
            {error && (
              <Alert status="error" borderRadius="md" fontSize="sm">
                <AlertIcon />
                {error}
              </Alert>
            )}

            <Text fontSize="sm" color={isJoin ? joinColors.muted : 'warmGray.500'} textAlign={isJoin ? 'left' : 'center'} width={isJoin ? '100%' : undefined} mt={-1} lineHeight={isJoin ? '1.7' : undefined}>
              {isJoin ? 'Sign in to pick up where you left off.' : "Choose how you'd like to sign in"}
            </Text>

            {/* Passkey sign-in */}
            {/* Passkey sign-in — always visible */}
              <Button
                onClick={handlePasskeyClick}
                isLoading={passkeyConnecting}
                loadingText="Signing in..."
                w="100%"
                h="auto"
                py={4}
                px={5}
                bg="amethyst.50"
                border="1px solid"
                borderColor="amethyst.200"
                borderRadius={isJoin ? 'lg' : 'xl'}
                _hover={{ bg: 'amethyst.100', transform: 'translateY(-1px)', boxShadow: 'md' }}
                _active={{ bg: 'amethyst.200', transform: 'translateY(0)' }}
                display="flex"
                justifyContent="flex-start"
                textAlign="left"
                whiteSpace="normal"
                {...(isJoin ? { bg: joinColors.primary, borderColor: joinColors.primary, color: joinColors.primaryText, _hover: { bg: joinColors.hover }, _active: { bg: joinColors.hover }, _focusVisible: { boxShadow: joinColors.focusRing } } : {})}
              >
                <HStack spacing={4} w="100%">
                  <Icon as={FaFingerprint} w={isJoin ? 6 : 8} h={isJoin ? 6 : 8} color={isJoin ? joinColors.primaryText : 'amethyst.500'} flexShrink={0} />
                  <VStack align="start" spacing={0.5}>
                    <Text fontSize={isJoin ? 'sm' : 'md'} fontWeight="600" color={isJoin ? joinColors.primaryText : 'warmGray.800'}>
                      {isJoin ? 'Sign in with a passkey' : 'Sign in with Passkey'}
                    </Text>
                    <Text fontSize="xs" fontWeight="normal" color={isJoin ? joinColors.primaryText : 'warmGray.500'} lineHeight={isJoin ? '1.7' : undefined}>
                      {isJoin ? 'Use your face, fingerprint, or device PIN' : 'Use your fingerprint or device PIN'}
                    </Text>
                  </VStack>
                </HStack>
              </Button>

            <HStack width="100%" align="center" display={isJoin ? 'none' : undefined}>
              <Divider borderColor="warmGray.200" />
              <Text fontSize="xs" color="warmGray.400" whiteSpace="nowrap" px={2}>
                or
              </Text>
              <Divider borderColor="warmGray.200" />
            </HStack>

            {/* Wallet sign-in */}
            <Button
              onClick={handleWalletClick}
              w="100%"
              h="auto"
              py={4}
              px={5}
              bg="blue.50"
              border="1px solid"
              borderColor="blue.200"
              borderRadius={isJoin ? 'lg' : 'xl'}
              _hover={{ bg: 'blue.100', transform: 'translateY(-1px)', boxShadow: 'md' }}
              _active={{ bg: 'blue.200', transform: 'translateY(0)' }}
              display="flex"
              justifyContent="flex-start"
              textAlign="left"
              whiteSpace="normal"
              {...(isJoin ? { py: 3, minH: '44px', bg: 'transparent', borderColor: 'transparent', color: joinColors.muted, justifyContent: 'center', _hover: { bg: joinColors.soft }, _active: { bg: joinColors.soft } } : {})}
            >
              <HStack spacing={isJoin ? 2 : 4} w={isJoin ? 'auto' : '100%'}>
                <Icon as={FaWallet} w={isJoin ? 3.5 : 8} h={isJoin ? 3.5 : 8} color={isJoin ? joinColors.muted : 'blue.500'} flexShrink={0} />
                <VStack align="start" spacing={0.5}>
                  <Text fontSize={isJoin ? 'sm' : 'md'} fontWeight={isJoin ? '500' : '600'} color={isJoin ? joinColors.muted : 'warmGray.800'}>
                    {isJoin ? 'Use a wallet instead' : 'Connect Wallet'}
                  </Text>
                  <Text fontSize="xs" fontWeight="normal" color="warmGray.500" display={isJoin ? 'none' : undefined}>
                    Use your crypto wallet to sign in
                  </Text>
                </VStack>
              </HStack>
            </Button>

            {/* Create account link */}
            {onCreateAccount && (isJoin ? (
              <HStack flexWrap="wrap" justify="center" spacing={1} fontSize="sm" color={joinColors.muted}>
                <Text>New here?</Text>
                <Button variant="link" minH="44px" fontSize="sm" color={joinColors.link} onClick={handleCreateAccount}>
                  Create an account
                </Button>
              </HStack>
            ) : (
              <Text
                fontSize="sm"
                color="warmGray.500"
                textAlign="center"
                cursor="pointer"
                _hover={{ color: 'amethyst.600', textDecoration: 'underline' }}
                onClick={handleCreateAccount}
                mt={1}
              >
                Don&apos;t have an account? <Text as="span" fontWeight="600">Create one</Text>
              </Text>
            ))}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
