import React, { useState, useCallback } from 'react';
import {
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  RadioGroup,
  Radio,
  Stack,
  Text,
  useToast,
  useDisclosure
} from '@chakra-ui/react';
import { useAccount, useSwitchChain } from 'wagmi';

import { usePOContext } from '@/context/POContext';
import { useAuth } from '@/context/AuthContext';
import { useWeb3 } from '@/hooks';
import { getNetworkByChainId } from '@/config/networks';

const QuizModal = ({ module }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { educationHubAddress, orgChainId } = usePOContext();
  const { education, executeWithNotification } = useWeb3();
  const { isPasskeyUser } = useAuth();
  const { chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const toast = useToast();

  const handleSubmit = useCallback(async () => {
    if (selectedAnswerIndex === '' || !education) return;
    setIsSubmitting(true);

    // Ensure EOA wallet is on the org's chain before transacting
    try {
      if (!isPasskeyUser && orgChainId && connectedChain?.id !== orgChainId) {
        const networkName = getNetworkByChainId(orgChainId)?.name || 'the correct network';
        toast({
          title: 'Switching network',
          description: `Switching to ${networkName}...`,
          status: 'info',
          duration: 3000,
        });
        await switchChainAsync({ chainId: orgChainId });
      }
    } catch (e) {
      toast({
        title: 'Network switch failed',
        description: 'Please switch to the correct network and try again.',
        status: 'error',
        duration: 5000,
      });
      setIsSubmitting(false);
      return;
    }

    const result = await executeWithNotification(
      () => education.completeModule(
        educationHubAddress,
        module.id,
        [parseInt(selectedAnswerIndex)]
      ),
      {
        pendingMessage: 'Submitting quiz answer...',
        successMessage: 'Quiz completed successfully!',
        refreshEvent: 'module:completed',
      }
    );

    if (!result.success) {
      // Check if it's an incorrect answer vs other error
      const errorMessage = result.error?.userMessage || '';
      if (errorMessage.includes('incorrect') || errorMessage.includes('wrong') || errorMessage.includes('InvalidAnswer')) {
        toast({
          title: "Incorrect Answer",
          description: "Please try again.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    }

    setIsSubmitting(false);
    onClose();
  }, [selectedAnswerIndex, education, executeWithNotification, educationHubAddress, module.id, toast, onClose, isPasskeyUser, orgChainId, connectedChain, switchChainAsync]);

  return (
    <>
      <Button size="sm" onClick={onOpen}>Take Quiz</Button>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{module.name} Quiz</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text mb={4}>{module.question}</Text>
            <RadioGroup onChange={setSelectedAnswerIndex} value={selectedAnswerIndex}>
              <Stack direction="column">
                {module.answers?.map((answerObj) => (
                  <Radio key={answerObj.index} value={`${answerObj.index}`}>
                    {answerObj.answer}
                  </Radio>
                ))}
              </Stack>
            </RadioGroup>
          </ModalBody>

          <ModalFooter>
            <Button
              colorScheme="blue"
              mr={3}
              onClick={handleSubmit}
              isLoading={isSubmitting}
              isDisabled={selectedAnswerIndex === ''}
            >
              Submit
            </Button>
            <Button variant="ghost" onClick={onClose} isDisabled={isSubmitting}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default QuizModal;
