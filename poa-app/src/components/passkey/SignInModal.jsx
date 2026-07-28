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
import { useAuth } from '../../context/AuthContext';

export default function SignInModal({ isOpen, onClose, onSuccess, onCreateAccount }) {
  const { hasStoredPasskey, connectPasskey, passkeyConnecting } = useAuth();
  const { openConnectModal } = useConnectModal();
  const [error, setError] = useState(null);

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
        bg="white"
        boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)"
        mx={4}
      >
        <ModalHeader textAlign="center" pt={6} pb={2} fontSize="xl" fontWeight="700">
          Sign In
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

            <Text fontSize="sm" color="warmGray.500" textAlign="center" mt={-1}>
              Choose how you'd like to sign in
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
                borderRadius="xl"
                _hover={{ bg: 'amethyst.100', transform: 'translateY(-1px)', boxShadow: 'md' }}
                _active={{ bg: 'amethyst.200', transform: 'translateY(0)' }}
                display="flex"
                justifyContent="flex-start"
                textAlign="left"
                whiteSpace="normal"
              >
                <HStack spacing={4} w="100%">
                  <Icon as={FaFingerprint} w={8} h={8} color="amethyst.500" flexShrink={0} />
                  <VStack align="start" spacing={0.5}>
                    <Text fontSize="md" fontWeight="600" color="warmGray.800">
                      Sign in with Passkey
                    </Text>
                    <Text fontSize="xs" fontWeight="normal" color="warmGray.500">
                      Use your fingerprint or device PIN
                    </Text>
                  </VStack>
                </HStack>
              </Button>

            <HStack width="100%" align="center">
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
              borderRadius="xl"
              _hover={{ bg: 'blue.100', transform: 'translateY(-1px)', boxShadow: 'md' }}
              _active={{ bg: 'blue.200', transform: 'translateY(0)' }}
              display="flex"
              justifyContent="flex-start"
              textAlign="left"
              whiteSpace="normal"
            >
              <HStack spacing={4} w="100%">
                <Icon as={FaWallet} w={8} h={8} color="blue.500" flexShrink={0} />
                <VStack align="start" spacing={0.5}>
                  <Text fontSize="md" fontWeight="600" color="warmGray.800">
                    Connect Wallet
                  </Text>
                  <Text fontSize="xs" fontWeight="normal" color="warmGray.500">
                    Use your crypto wallet to sign in
                  </Text>
                </VStack>
              </HStack>
            </Button>

            {/* Create account link */}
            {onCreateAccount && (
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
            )}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
