/**
 * SignupModal Component
 * Modal for new user registration via UniversalAccountRegistry.
 * Reuses useDeployerUsername for validation and availability checking.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  FormErrorMessage,
  FormHelperText,
  Input,
  InputGroup,
  InputRightElement,
  VStack,
  Text,
  Spinner,
  Icon,
  useToast,
  useColorModeValue,
} from '@chakra-ui/react';
import { CheckIcon, WarningIcon } from '@chakra-ui/icons';
import { useWeb3 } from '@/hooks';
import { useDeployerUsername } from '@/features/deployer/hooks/useDeployerUsername';

const SignupModal = ({ isOpen, onClose }) => {
  const { user: userService, executeWithNotification } = useWeb3();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use the existing deployer username hook for validation
  const {
    existingUsername,
    isLoading: isLoadingExisting,
    inputUsername,
    setInputUsername,
    validationState,
    isReady,
    finalUsername,
  } = useDeployerUsername();

  // Colors
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) {
      setInputUsername('');
    }
  }, [isOpen, setInputUsername]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!userService || !isReady || !finalUsername) return;

    // If user already has an account, just close
    if (existingUsername) {
      toast({
        title: 'Already Registered',
        description: `You already have an account with username: ${existingUsername}`,
        status: 'info',
        duration: 5000,
        isClosable: true,
      });
      onClose();
      return;
    }

    setIsSubmitting(true);

    const result = await executeWithNotification(
      () => userService.createNewUser(finalUsername),
      {
        pendingMessage: 'Creating your account...',
        successMessage: `Account created! Welcome, ${finalUsername}!`,
        refreshEvent: 'user:created',
      }
    );

    setIsSubmitting(false);

    if (result.success) {
      onClose();
    }
  }, [userService, executeWithNotification, isReady, finalUsername, existingUsername, toast, onClose]);

  // Handle enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && isReady && !isSubmitting) {
      handleSubmit();
    }
  };

  // Determine input state for styling
  const getInputState = () => {
    if (!inputUsername) return 'default';
    if (validationState.isChecking) return 'checking';
    if (validationState.error) return 'error';
    if (validationState.isValid) return 'valid';
    return 'default';
  };

  const inputState = getInputState();

  // Get border color based on state
  const getInputBorderColor = () => {
    switch (inputState) {
      case 'valid':
        return 'green.400';
      case 'error':
        return 'red.400';
      case 'checking':
        return 'blue.400';
      default:
        return borderColor;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg={bgColor} borderRadius="xl" mx={4}>
        <ModalHeader>Create Your Account</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {isLoadingExisting ? (
            <VStack py={8}>
              <Spinner size="lg" color="teal.400" />
              <Text color="gray.500">Checking account status...</Text>
            </VStack>
          ) : existingUsername ? (
            <VStack py={4} spacing={4}>
              <Icon as={CheckIcon} boxSize={12} color="green.400" />
              <Text fontSize="lg" fontWeight="medium">
                You already have an account!
              </Text>
              <Text color="gray.500">
                Username: <strong>{existingUsername}</strong>
              </Text>
            </VStack>
          ) : (
            <VStack spacing={4} align="stretch">
              <Text color="gray.600" fontSize="sm">
                Choose a username for your account. This will be your identity across all Perpetual Organizations.
              </Text>

              <FormControl isInvalid={inputState === 'error'}>
                <FormLabel>Username</FormLabel>
                <InputGroup>
                  <Input
                    placeholder="Enter username"
                    value={inputUsername}
                    onChange={(e) => setInputUsername(e.target.value)}
                    onKeyPress={handleKeyPress}
                    borderColor={getInputBorderColor()}
                    _focus={{
                      borderColor: getInputBorderColor(),
                      boxShadow: `0 0 0 1px ${getInputBorderColor()}`,
                    }}
                    isDisabled={isSubmitting}
                  />
                  <InputRightElement>
                    {inputState === 'checking' && (
                      <Spinner size="sm" color="blue.400" />
                    )}
                    {inputState === 'valid' && (
                      <Icon as={CheckIcon} color="green.400" />
                    )}
                    {inputState === 'error' && (
                      <Icon as={WarningIcon} color="red.400" />
                    )}
                  </InputRightElement>
                </InputGroup>
                {validationState.error ? (
                  <FormErrorMessage>{validationState.error}</FormErrorMessage>
                ) : (
                  <FormHelperText>
                    3-32 characters, letters, numbers, and underscores only
                  </FormHelperText>
                )}
              </FormControl>
            </VStack>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose} isDisabled={isSubmitting}>
            Cancel
          </Button>
          {!existingUsername && (
            <Button
              colorScheme="teal"
              onClick={handleSubmit}
              isLoading={isSubmitting}
              loadingText="Creating..."
              isDisabled={!isReady || isSubmitting}
            >
              Create Account
            </Button>
          )}
          {existingUsername && (
            <Button colorScheme="teal" onClick={onClose}>
              Got it
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default SignupModal;
