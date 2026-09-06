import React, { useState, useCallback, useEffect } from 'react';
import { useTour } from '@/features/tour';
import SEOHead from "@/components/common/SEOHead";
import {
  Box,
  Center,
  Grid,
  GridItem,
  Heading,
  Text,
  Link as ChakraLink,
  Flex,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Input,
  Textarea,
  NumberInput,
  NumberInputField,
  FormControl,
  FormLabel,
  FormErrorMessage,
  useDisclosure,
  useToast,
  Progress,
  Icon,
} from '@chakra-ui/react';
import CommunityLoadingState from "@/components/shared/CommunityLoadingState";
import { CheckIcon } from '@chakra-ui/icons';
import { useAccount, useSwitchChain } from 'wagmi';
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { usePOContext } from '@/context/POContext';
import { useAuth } from '@/context/AuthContext';
import { useWeb3, useOrgTheme } from '@/hooks';
import { useOrgName } from '@/hooks/useOrgName';
import { useUserContext } from '@/context/UserContext';
import { useEducationCreateGate } from '@/hooks/useEducationCreateGate';
import { getNetworkByChainId } from '@/config/networks';
import QuizModal from '@/components/eduHub/QuizModal';
import { useRouter } from 'next/router';
import { useOrgGate } from "@/components/shared/OrgDeadEnd";

const EducationHub = () => {
  const { poContextLoading, orgStatus, educationModules, educationHubAddress, educationHubEnabled, orgChainId } = usePOContext();
  const { pageBackground } = useOrgTheme();
  const { completedModules } = useUserContext();
  const { education, executeWithNotification } = useWeb3();
  const { isPasskeyUser } = useAuth();
  const { chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const router = useRouter();
  const userDAO = useOrgName();
  const orgGate = useOrgGate();

  // Redirect to dashboard if education hub is disabled (skip during tour).
  // Gated on orgStatus === 'ready', NOT on `userDAO` being truthy: an early
  // return does not cancel an effect declared above it, so without this a
  // not-found org gets bounced off its dead end onto /dashboard — which shows
  // its own dead end, after a confusing detour. A disabled education hub is
  // only a real fact once there is a real org.
  const { isActive: isTourActive } = useTour();
  useEffect(() => {
    if (orgStatus !== 'ready') return;
    if (!poContextLoading && !educationHubEnabled && userDAO && !isTourActive) {
      router.replace(`/dashboard/?org=${encodeURIComponent(userDAO)}`);
    }
  }, [orgStatus, poContextLoading, educationHubEnabled, userDAO, isTourActive, router]);

  // Form state
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleDescription, setModuleDescription] = useState('');
  const [moduleLink, setModuleLink] = useState('');
  const [moduleQuestion, setModuleQuestion] = useState('');
  const [payout, setPayout] = useState(0);
  const [answers, setAnswers] = useState(['', '', '', '']);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Module creation follows the EducationHub's on-chain creator hats — the gate
  // createModule actually enforces. The hook falls open to plain membership only
  // while that read is in flight or unavailable.
  const { canCreateModule } = useEducationCreateGate();

  const handleAddModule = useCallback(async () => {
    if (!education) return;

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

    // Reset form immediately and close modal
    const formData = {
      name: moduleTitle,
      description: moduleDescription,
      link: moduleLink,
      quiz: [moduleQuestion],
      answers: [answers],
      correctAnswers: [correctAnswerIndex],
      payout,
    };

    setModuleTitle('');
    setModuleDescription('');
    setModuleLink('');
    setModuleQuestion('');
    setPayout(0);
    setAnswers(['', '', '', '']);
    setCorrectAnswerIndex(null);
    onClose();

    const result = await executeWithNotification(
      () => education.createModule(educationHubAddress, formData),
      {
        pendingMessage: 'Creating education module...',
        successMessage: 'Module created successfully!',
        refreshEvent: 'module:created',
      }
    );

    setIsSubmitting(false);
  }, [education, executeWithNotification, educationHubAddress, moduleTitle, moduleDescription, moduleLink, moduleQuestion, answers, correctAnswerIndex, payout, onClose, isPasskeyUser, orgChainId, connectedChain, switchChainAsync, toast]);


  const totalModules = educationModules.length;
  const completedModuleIds = completedModules?.map((m) => m.moduleId) || [];
  const modulesCompletedCount = completedModules?.length || 0;
  const progressPercentage = totalModules ? (modulesCompletedCount / totalModules) * 100 : 0;

  // Sort modules: uncompleted first
  const sortedModules = [...educationModules].sort((a, b) => {
    const aCompleted = completedModuleIds.includes(a.moduleId);
    const bCompleted = completedModuleIds.includes(b.moduleId);
    if (aCompleted && !bCompleted) {
      return 1; 
    } else if (!aCompleted && bCompleted) {
      return -1; 
    } else {
      return 0; 
    }
  });

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;
  return (
    <>
      <SEOHead
        title="Education Hub"
        description="Learning resources and educational content."
        path="/learn"
        noIndex
      />
      <Box minH="100vh" background={pageBackground()}>
      <Navbar />
      {poContextLoading ? (
        <Center minH="90vh">
          <CommunityLoadingState label="Loading your learning space…" />
        </Center>
      ) : (
        <Box position="relative" data-tour="education-hub-content">
          {/* Main Box */}
          <Box
            p={5}
            pt={{ base: 4, md: 5 }}
            sx={{
              backgroundColor: 'rgba(0, 0, 0, 0.82)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
            borderRadius="lg"
            mx="auto"
            mt={{ base: 4, md: 6 }}
            maxWidth="800px"
            textAlign="center"
          >
            <Heading as="h2" size="lg" color="white" mb={3}>
              Education Hub
            </Heading>
            <Text fontSize="lg" color="gray.100">
              Learn and take short quizzes to earn tokens
            </Text>

            {/* Progress Bar */}
            <Box mt={6} display="flex" flexDirection="column" alignItems="center">
              <Progress
                value={progressPercentage}
                size="lg"
                colorScheme="green"
                borderRadius="md"
                w="50%" 
              />
              <Text color="gray.200" mt={2} fontSize="sm">
                {modulesCompletedCount} of {totalModules} modules completed
              </Text>
            </Box>


            {canCreateModule && (
              <Button
                onClick={onOpen}
                colorScheme="blue"
                position="absolute"
                top="13px"
                right="13px"
                width="40px"
                height="40px"
                size="lg"
                p="0"
                borderRadius="full"
                boxShadow="xl"
                _hover={{ transform: 'scale(1.1)' }}
              >
                <Box as="span" fontSize="4xl">+</Box>
              </Button>
            )}
          </Box>

          {/* Add Module Modal */}
          <Modal isOpen={isOpen} onClose={onClose} size="lg">
            <ModalOverlay />
            <ModalContent>
              <ModalHeader>Add New Module</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                {/* Module Form */}
                <FormControl isRequired mb={4}>
                  <FormLabel>Module Title</FormLabel>
                  <Input
                    placeholder="Enter module title"
                    value={moduleTitle}
                    onChange={(e) => setModuleTitle(e.target.value)}
                  />
                </FormControl>
                <FormControl isRequired mb={4}>
                  <FormLabel>Module Description</FormLabel>
                  <Textarea
                    placeholder="Enter module description"
                    value={moduleDescription}
                    onChange={(e) => setModuleDescription(e.target.value)}
                  />
                </FormControl>
                <FormControl mb={4}>
                  <FormLabel>Module Link</FormLabel>
                  <Input
                    placeholder="Enter module link (optional)"
                    value={moduleLink}
                    onChange={(e) => setModuleLink(e.target.value)}
                  />
                </FormControl>
                <FormControl isRequired mb={4}>
                  <FormLabel>Quiz Question</FormLabel>
                  <Input
                    placeholder="Enter quiz question"
                    value={moduleQuestion}
                    onChange={(e) => setModuleQuestion(e.target.value)}
                  />
                </FormControl>
                <FormControl isRequired mb={4}>
                  <FormLabel>Payout (Tokens)</FormLabel>
                  <NumberInput min={0} value={payout} onChange={(valueString) => setPayout(Number(valueString))}>
                    <NumberInputField />
                  </NumberInput>
                </FormControl>
                <FormControl isRequired mb={4}>
                  <FormLabel>Answers</FormLabel>
                  {answers.map((answer, index) => (
                    <Input
                      key={index}
                      placeholder={`Answer ${index + 1}`}
                      value={answer}
                      onChange={(e) => {
                        const newAnswers = [...answers];
                        newAnswers[index] = e.target.value;
                        setAnswers(newAnswers);
                      }}
                      mt={index > 0 ? 2 : 0}
                    />
                  ))}
                </FormControl>
                <FormControl isRequired mb={4}>
                  <FormLabel>Correct Answer</FormLabel>
                  <NumberInput
                    min={1}
                    max={answers.length}
                    value={correctAnswerIndex !== null ? correctAnswerIndex + 1 : ''}
                    onChange={(valueString) => setCorrectAnswerIndex(Number(valueString) - 1)}
                  >
                    <NumberInputField placeholder="Enter the number of the correct answer" />
                  </NumberInput>
                  <FormErrorMessage>Please select the correct answer index.</FormErrorMessage>
                </FormControl>
              </ModalBody>
              <ModalFooter>
                <Button
                  colorScheme="teal"
                  mr={3}
                  onClick={handleAddModule}
                  isLoading={isSubmitting}
                  isDisabled={
                    !moduleTitle ||
                    !moduleDescription ||
                    !moduleQuestion || 
                    payout <= 0 ||
                    answers.some((ans) => !ans) ||
                    correctAnswerIndex === null
                  }
                >
                  Create Module
                </Button>
                <Button variant="ghost" onClick={onClose} isDisabled={isSubmitting}>
                  Cancel
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <Box p={6} bg="transparent" borderRadius="lg" mx="auto" mt={2} maxWidth="1200px">
            <Grid
              templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }}
              gap={8}
            >
              {sortedModules.map((module) => {
                const isCompleted = completedModuleIds.includes(module.moduleId);
                return (
                  <GridItem
                    key={module.id}
                    borderRadius="md"
                    p={6}
                    position="relative" // To position the check mark
                    sx={{
                      backgroundColor: 'rgba(0, 0, 0, 0.82)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    }}
                    transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
                    display="flex"
                    flexDirection="column"
                    justifyContent="space-between"
                  >
                    {/* Check Mark for Completed Modules */}
                    {isCompleted && (
                      <Box
                        position="absolute"
                        top="10px"
                        right="10px"
                        color="green.400"
                      >
                        <Icon as={CheckIcon} w={6} h={6} />
                      </Box>
                    )}
                    <Box mb={6}>
                      <Heading as="h3" fontSize="27" mb={6} color="white">
                        {module.name}
                      </Heading>
                      {module.isIndexing ? (
                        <Box 
                          p={4} 
                          bg="purple.100" 
                          borderRadius="md" 
                          color="purple.800"
                          mb={4}
                        >
                          <Text fontWeight="bold">
                            Module information is being indexed from IPFS
                          </Text>
                          <Text fontSize="sm" mt={2}>
                            This module was recently created and its data is still being indexed from IPFS to the subgraph.
                            Please check back in a few moments when indexing is complete.
                          </Text>
                        </Box>
                      ) : (
                        <Text fontSize="16" color="gray.200">
                          {module.description}
                        </Text>
                      )}
                    </Box>
                    <Box mt="auto">
                      <Text mb={2} fontSize="lg" fontWeight="bold" color="white">
                        Reward: {module.payout} Tokens
                      </Text>
                      <Flex justifyContent="space-between" alignItems="center" mt={4}>
                        {module.isIndexing ? (
                          <Button
                            _hover={{ transform: 'scale(1.07)', boxShadow: 'xl' }}
                            size="lg"
                            colorScheme="gray"
                            isDisabled={true}
                          >
                            Coming Soon
                          </Button>
                        ) : module.link ? (
                          <ChakraLink href={module.link} isExternal>
                            <Button
                              _hover={{ transform: 'scale(1.07)', boxShadow: 'xl' }}
                              size="lg"
                              colorScheme="green"
                            >
                              Learn
                            </Button>
                          </ChakraLink>
                        ) : (
                          <ChakraLink href={`https://ipfs.io/ipfs/${module.ipfsHash}`} isExternal>
                            <Button
                              _hover={{ transform: 'scale(1.07)', boxShadow: 'xl' }}
                              size="lg"
                              colorScheme="green"
                            >
                              Learn
                            </Button>
                          </ChakraLink>
                        )}
                        {!module.isIndexing && <QuizModal module={module} />}
                      </Flex>
                    </Box>
                  </GridItem>
                );
              })}
            </Grid>
          </Box>
        </Box>
      )}
      </Box>
    </>
  );
};

export default EducationHub;
