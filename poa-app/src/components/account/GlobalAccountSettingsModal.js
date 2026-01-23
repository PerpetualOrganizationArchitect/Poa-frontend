/**
 * GlobalAccountSettingsModal
 * Modal for updating username on the global /account page.
 * Uses useGlobalAccount instead of useUserContext (no org dependency).
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  Input,
  useToast,
} from '@chakra-ui/react';
import { useWeb3 } from '@/hooks';
import { useGlobalAccount } from '@/hooks/useGlobalAccount';

const GlobalAccountSettingsModal = ({ isOpen, onClose }) => {
  const { globalUsername, refetchAccount } = useGlobalAccount();
  const { user: userService, executeWithNotification } = useWeb3();
  const toast = useToast();

  const [username, setUsername] = useState('');

  useEffect(() => {
    if (globalUsername) {
      setUsername(globalUsername);
    }
  }, [globalUsername]);

  const handleUsernameChange = (event) => setUsername(event.target.value);

  const handleSave = useCallback(async () => {
    if (!userService) return;

    if (globalUsername !== username) {
      const result = await executeWithNotification(
        () => userService.changeUsername(username),
        {
          pendingMessage: 'Updating username...',
          successMessage: 'Username updated successfully!',
          refreshEvent: 'user:username_changed',
        }
      );

      if (result.success) {
        // Refetch account data to get updated username
        setTimeout(() => refetchAccount(), 1500);
      }
    } else {
      toast({
        title: 'Username Unchanged',
        description: 'New username is the same as the old one. No changes made.',
        status: 'info',
        duration: 5000,
        isClosable: true,
      });
    }
    onClose();
  }, [userService, executeWithNotification, username, globalUsername, refetchAccount, toast, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Update Account Settings</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormControl>
            <FormLabel>Username</FormLabel>
            <Input value={username} onChange={handleUsernameChange} />
          </FormControl>
        </ModalBody>

        <ModalFooter>
          <Button colorScheme="blue" mr={3} onClick={handleSave}>
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default GlobalAccountSettingsModal;
