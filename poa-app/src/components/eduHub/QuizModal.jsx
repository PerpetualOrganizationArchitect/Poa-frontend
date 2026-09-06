import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Flex,
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
import { ArrowForwardIcon, CheckIcon } from '@chakra-ui/icons';
import { useAccount, useSwitchChain } from 'wagmi';

import { usePOContext } from '@/context/POContext';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';
import { educationDialogStyle } from '@/components/eduHub/educationStyles';
import { useAuth } from '@/context/AuthContext';
import { useWeb3 } from '@/hooks';
import { getNetworkByChainId } from '@/config/networks';

const QuizModal = ({ module, isCompleted = false }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { educationHubAddress, orgChainId, tokenLabel = DEFAULT_TOKEN_LABEL } = usePOContext();
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
      <Button
        size="sm"
        h="40px"
        px={4}
        borderRadius="lg"
        variant="outline"
        borderColor="whiteAlpha.300"
        color={isCompleted ? 'green.200' : 'purple.200'}
        rightIcon={isCompleted ? <CheckIcon boxSize={3} /> : <ArrowForwardIcon />}
        onClick={onOpen}
        isDisabled={isCompleted}
        _hover={{ bg: 'whiteAlpha.100', borderColor: 'whiteAlpha.500' }}
        _active={{ bg: 'whiteAlpha.200' }}
        _disabled={{ opacity: 1, cursor: 'default', borderColor: 'transparent' }}
      >
        {isCompleted ? 'Completed' : 'Take quiz'}
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="lg"
        scrollBehavior="inside"
        isCentered
        closeOnOverlayClick={!isSubmitting}
        closeOnEsc={!isSubmitting}
      >
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent
          {...educationDialogStyle}
          mx={4}
          my={{ base: 4, md: 8 }}
          maxH="calc(100dvh - 32px)"
          overflow="hidden"
        >
          <ModalHeader px={{ base: 6, md: 8 }} pt={8} pb={6} pr={14}>
            <Text fontSize="xl" fontWeight="bold">
              Take a quiz
            </Text>
            <Text fontSize="sm" fontWeight="400" color="gray.300" mt={3} lineHeight="1.6" overflowWrap="anywhere">
              {module.name}
            </Text>
          </ModalHeader>
          <ModalCloseButton
            top={5}
            right={5}
            borderRadius="lg"
            color="gray.300"
            isDisabled={isSubmitting}
            _hover={{ bg: 'whiteAlpha.200', color: 'white' }}
          />
          <ModalBody px={{ base: 6, md: 8 }} pb={8}>
            <Flex
              align="center"
              justify="space-between"
              gap={4}
              py={4}
              mb={7}
              borderY="1px solid"
              borderColor="whiteAlpha.200"
            >
              <Text fontSize="sm" color="gray.300">Completion reward</Text>
              <Text fontSize="sm" color="purple.200" fontWeight="600">
                {module.payout} {tokenLabel}
              </Text>
            </Flex>
            <Box as="fieldset" minW={0} border="0" p={0} m={0}>
              <Text as="legend" fontSize="lg" fontWeight="600" lineHeight="1.5" mb={2} overflowWrap="anywhere">
                {module.question}
              </Text>
              <Text fontSize="sm" color="gray.300" mb={5}>Choose one answer.</Text>
              <RadioGroup onChange={setSelectedAnswerIndex} value={selectedAnswerIndex} isDisabled={isSubmitting}>
                <Stack direction="column" spacing={3}>
                  {module.answers?.map((answerObj) => {
                    const isSelected = selectedAnswerIndex === `${answerObj.index}`;
                    return (
                      <Box
                        key={answerObj.index}
                        border="1px solid"
                        borderColor={isSelected ? 'purple.400' : 'whiteAlpha.200'}
                        borderRadius="xl"
                        bg={isSelected ? 'rgba(148, 115, 220, 0.16)' : 'whiteAlpha.50'}
                        transition="background 0.15s ease, border-color 0.15s ease"
                        _hover={{ borderColor: isSelected ? 'purple.400' : 'whiteAlpha.400' }}
                        _focusWithin={{ boxShadow: '0 0 0 3px rgba(148, 115, 220, 0.25)' }}
                        sx={{ '.chakra-radio__label': { fontSize: 'sm', lineHeight: '1.6', overflowWrap: 'anywhere' } }}
                      >
                        <Radio
                          value={`${answerObj.index}`}
                          w="full"
                          px={4}
                          py={4}
                          minH="56px"
                          spacing={3}
                          borderColor="whiteAlpha.500"
                          colorScheme="purple"
                        >
                          {answerObj.answer}
                        </Radio>
                      </Box>
                    );
                  })}
                </Stack>
              </RadioGroup>
            </Box>
          </ModalBody>

          <ModalFooter
            px={{ base: 6, md: 8 }}
            py={5}
            borderTop="1px solid"
            borderColor="whiteAlpha.200"
            bg="whiteAlpha.50"
            gap={3}
            justifyContent="space-between"
            flexDirection={{ base: 'column-reverse', sm: 'row' }}
          >
            <Button
              variant="ghost"
              color="gray.300"
              borderRadius="lg"
              w={{ base: 'full', sm: 'auto' }}
              onClick={onClose}
              isDisabled={isSubmitting}
              _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
            >
              Back to learning
            </Button>
            <Button
              colorScheme="purple"
              borderRadius="lg"
              w={{ base: 'full', sm: 'auto' }}
              px={6}
              onClick={handleSubmit}
              isLoading={isSubmitting}
              loadingText="Submitting"
              isDisabled={selectedAnswerIndex === ''}
            >
              Submit answer
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default QuizModal;
