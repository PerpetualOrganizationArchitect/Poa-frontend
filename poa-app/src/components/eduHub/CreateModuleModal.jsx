import React, { useRef, useState } from 'react';
import {
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Grid,
  Input,
  InputGroup,
  InputRightAddon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Radio,
  RadioGroup,
  Stack,
  Text,
  Textarea,
  VisuallyHidden,
  useToast,
} from '@chakra-ui/react';
import { useAccount, useSwitchChain } from 'wagmi';
import { useAuth } from '@/context/AuthContext';
import { usePOContext } from '@/context/POContext';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';
import { educationDialogStyle, educationFieldStyle } from '@/components/eduHub/educationStyles';
import { useWeb3 } from '@/hooks';
import { getNetworkByChainId } from '@/config/networks';

const fieldStyle = educationFieldStyle;

const labelStyle = {
  fontSize: 'sm',
  fontWeight: '500',
  color: 'gray.200',
  mb: 2,
};

function validResourceLink(value) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function CreateModuleModal({ isOpen, onClose }) {
  const { educationHubAddress, orgChainId, tokenLabel = DEFAULT_TOKEN_LABEL } = usePOContext();
  const { education, executeWithNotification } = useWeb3();
  const { isPasskeyUser } = useAuth();
  const { chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const toast = useToast();
  const titleRef = useRef(null);
  const submittingRef = useRef(false);
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleDescription, setModuleDescription] = useState('');
  const [moduleLink, setModuleLink] = useState('');
  const [moduleQuestion, setModuleQuestion] = useState('');
  const [payout, setPayout] = useState('');
  const [answers, setAnswers] = useState(['', '', '', '']);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const errors = {
    title: !moduleTitle.trim(),
    description: !moduleDescription.trim(),
    link: !validResourceLink(moduleLink),
    question: !moduleQuestion.trim(),
    payout: !Number.isFinite(Number(payout)) || Number(payout) <= 0,
    answers: answers.some((answer) => !answer.trim()),
    correctAnswer: !Number.isInteger(correctAnswerIndex)
      || correctAnswerIndex < 0
      || correctAnswerIndex >= answers.length,
  };

  const closeModal = () => {
    if (!submittingRef.current) onClose();
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (submittingRef.current || !education || !educationHubAddress) return;
    setShowErrors(true);
    if (Object.values(errors).some(Boolean)) {
      const [fieldName] = [
        ['module-title', errors.title],
        ['module-description', errors.description],
        ['module-link', errors.link],
        ['module-payout', errors.payout],
        ['module-question', errors.question],
        ...answers.map((answer, index) => [`module-answer-${index}`, !answer.trim()]),
        ['module-correct-answer', errors.correctAnswer],
      ].find(([, isInvalid]) => isInvalid);
      const field = event.currentTarget.querySelector(`[name="${fieldName}"]`);
      // Let inline errors render before bringing the first field into view.
      requestAnimationFrame(() => {
        field?.focus({ preventScroll: true });
        (field?.closest('label') || field)?.scrollIntoView({ block: 'nearest' });
      });
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      // EOA transactions must use the organization's network; passkeys route
      // through the smart-account service automatically.
      if (!isPasskeyUser && orgChainId && connectedChain?.id !== orgChainId) {
        const networkName = getNetworkByChainId(orgChainId)?.name || 'the correct network';
        toast({
          title: 'Switching network',
          description: `Switching to ${networkName}...`,
          status: 'info',
          duration: 3000,
        });
        try {
          await switchChainAsync({ chainId: orgChainId });
        } catch {
          toast({
            title: 'Network switch failed',
            description: 'Please switch to the correct network and try again.',
            status: 'error',
            duration: 5000,
          });
          return;
        }
      }

      const formData = {
        name: moduleTitle.trim(),
        description: moduleDescription.trim(),
        link: moduleLink.trim(),
        quiz: [moduleQuestion.trim()],
        answers: [answers.map((answer) => answer.trim())],
        correctAnswers: [correctAnswerIndex],
        payout: Number(payout),
      };

      const result = await executeWithNotification(
        () => education.createModule(educationHubAddress, formData),
        {
          pendingMessage: 'Creating education module...',
          successMessage: 'Module created successfully!',
          refreshEvent: 'module:created',
        }
      );

      if (result?.success) {
        setModuleTitle('');
        setModuleDescription('');
        setModuleLink('');
        setModuleQuestion('');
        setPayout('');
        setAnswers(['', '', '', '']);
        setCorrectAnswerIndex(null);
        setShowErrors(false);
        onClose();
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      initialFocusRef={titleRef}
      scrollBehavior="inside"
      closeOnOverlayClick={!isSubmitting}
      closeOnEsc={!isSubmitting}
      isCentered
    >
      <ModalOverlay bg="blackAlpha.800" />
      <ModalContent
        as="form"
        onSubmit={handleCreate}
        noValidate
        maxW="760px"
        maxH="calc(100dvh - 2rem)"
        mx={4}
        my={4}
        {...educationDialogStyle}
        overflow="hidden"
      >
        <ModalHeader px={{ base: 5, md: 8 }} pt={{ base: 6, md: 7 }} pb={6} flexShrink={0}>
          <Text as="span" display="block" fontSize="xl" fontWeight="bold" pr={5}>
            Create a module
          </Text>
          <Text mt={2} fontSize="sm" fontWeight="400" lineHeight="1.6" color="gray.300">
            Add a resource, one question, and a reward for your community.
          </Text>
        </ModalHeader>
        <ModalCloseButton top={4} right={4} color="gray.300" isDisabled={isSubmitting} />

        <ModalBody px={{ base: 5, md: 8 }} py={0} minH={0}>
          <Grid
            templateColumns={{ base: '1fr', md: '1fr 1fr' }}
            gap={{ base: 7, md: 8 }}
            borderTop="1px solid"
            borderColor="whiteAlpha.200"
            pt={6}
            pb={7}
          >
            <Stack spacing={4}>
              <Text fontSize="xs" fontWeight="600" color="gray.300" mb={1}>Module details</Text>
              <FormControl isRequired isInvalid={showErrors && errors.title} isDisabled={isSubmitting}>
                <FormLabel {...labelStyle}>Title</FormLabel>
                <Input ref={titleRef} name="module-title" {...fieldStyle} placeholder="Give your module a clear title" value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} />
                <FormErrorMessage>Add a title.</FormErrorMessage>
              </FormControl>
              <FormControl isRequired isInvalid={showErrors && errors.description} isDisabled={isSubmitting}>
                <FormLabel {...labelStyle}>Description</FormLabel>
                <Textarea name="module-description" {...fieldStyle} rows={3} resize="vertical" minH="96px" placeholder="What will people learn?" value={moduleDescription} onChange={(event) => setModuleDescription(event.target.value)} />
                <FormErrorMessage>Add a short description.</FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={showErrors && errors.link} isDisabled={isSubmitting}>
                <FormLabel {...labelStyle}>Resource link <Text as="span" fontWeight="400" color="gray.400">(optional)</Text></FormLabel>
                <Input name="module-link" {...fieldStyle} type="url" placeholder="https://" value={moduleLink} onChange={(event) => setModuleLink(event.target.value)} />
                <FormErrorMessage>Use a full http:// or https:// link.</FormErrorMessage>
              </FormControl>
              <FormControl isRequired isInvalid={showErrors && errors.payout} isDisabled={isSubmitting}>
                <FormLabel {...labelStyle}>Completion reward</FormLabel>
                <InputGroup>
                  <Input name="module-payout" {...fieldStyle} type="number" inputMode="decimal" min="0" step="any" minW={0} h="auto" minH={10} placeholder="0" value={payout} onChange={(event) => setPayout(event.target.value)} />
                  <InputRightAddon maxW="45%" h="auto" minH={10} py={2} px={3} bg="whiteAlpha.100" borderColor="whiteAlpha.200" fontSize="xs" color="gray.300">
                    <Text noOfLines={2} whiteSpace="normal" overflowWrap="anywhere" title={tokenLabel}>{tokenLabel}</Text>
                  </InputRightAddon>
                </InputGroup>
                <FormErrorMessage>Enter a reward greater than zero.</FormErrorMessage>
                <FormHelperText fontSize="xs" color="gray.300">Earned when someone answers correctly.</FormHelperText>
              </FormControl>
            </Stack>

            <Stack spacing={4} borderLeftWidth={{ base: 0, md: '1px' }} borderColor="whiteAlpha.200" pl={{ md: 8 }}>
              <Text fontSize="xs" fontWeight="600" color="gray.300" mb={1}>Knowledge check</Text>
              <FormControl isRequired isInvalid={showErrors && errors.question} isDisabled={isSubmitting}>
                <FormLabel {...labelStyle}>Question</FormLabel>
                <Textarea name="module-question" {...fieldStyle} rows={3} resize="vertical" minH="96px" placeholder="Ask one question about the resource" value={moduleQuestion} onChange={(event) => setModuleQuestion(event.target.value)} />
                <FormErrorMessage>Add a question.</FormErrorMessage>
              </FormControl>
              <FormControl as="fieldset" isRequired isInvalid={showErrors && (errors.answers || errors.correctAnswer)} isDisabled={isSubmitting}>
                <FormLabel as="legend" {...labelStyle}>Answers</FormLabel>
                <Text id="module-answer-help" fontSize="xs" color="gray.300" mb={3}>
                  Add four options. Select the correct answer.
                </Text>
                <RadioGroup
                  name="module-correct-answer"
                  value={correctAnswerIndex === null ? '' : String(correctAnswerIndex)}
                  onChange={(value) => setCorrectAnswerIndex(Number(value))}
                  aria-label="Correct answer"
                  aria-describedby="module-answer-help"
                >
                  <Stack spacing={2}>
                    {answers.map((answer, index) => {
                      const letter = String.fromCharCode(65 + index);
                      const isSelected = correctAnswerIndex === index;
                      return (
                        <Flex
                          key={index}
                          align="center"
                          gap={3}
                          px={3}
                          minH="46px"
                          border="1px solid"
                          borderColor={isSelected ? 'purple.400' : 'whiteAlpha.200'}
                          bg={isSelected ? 'rgba(148, 115, 220, 0.16)' : 'whiteAlpha.50'}
                          borderRadius="lg"
                          transition="background-color 150ms, border-color 150ms"
                          _focusWithin={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                        >
                          <Radio id={`module-correct-answer-${index}`} value={String(index)} colorScheme="purple" borderColor="whiteAlpha.500" isDisabled={isSubmitting}>
                            <Text as="span" aria-hidden="true" fontSize="xs" color={isSelected ? 'purple.200' : 'gray.300'}>{letter}</Text>
                            <VisuallyHidden>Mark answer {letter} as correct</VisuallyHidden>
                          </Radio>
                          <Input
                            id={`module-answer-${index}`}
                            name={`module-answer-${index}`}
                            variant="unstyled"
                            fontSize="sm"
                            minW={0}
                            py={3}
                            placeholder={`Answer ${letter}`}
                            _placeholder={{ color: 'gray.400' }}
                            aria-label={`Answer ${letter}`}
                            aria-invalid={showErrors && !answer.trim()}
                            value={answer}
                            isDisabled={isSubmitting}
                            onChange={(event) => setAnswers((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                          />
                        </Flex>
                      );
                    })}
                  </Stack>
                </RadioGroup>
                <FormErrorMessage>
                  {errors.answers ? 'Fill in all four answers.' : 'Select the correct answer.'}
                </FormErrorMessage>
              </FormControl>
            </Stack>
          </Grid>
        </ModalBody>

        <ModalFooter gap={3} px={{ base: 5, md: 8 }} py={5} bg="whiteAlpha.50" borderTop="1px solid" borderColor="whiteAlpha.200" flexShrink={0}>
          <Button variant="ghost" _hover={{ bg: 'whiteAlpha.100' }} color="gray.300" onClick={closeModal} isDisabled={isSubmitting} fontSize="sm">Cancel</Button>
          <Button
            type="submit"
            colorScheme="purple"
            px={5}
            fontSize="sm"
            isLoading={isSubmitting}
            loadingText="Creating module"
            isDisabled={!education || !educationHubAddress}
          >
            Create module
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
