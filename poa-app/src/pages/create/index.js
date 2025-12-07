import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Spinner,
  Center,
  Box,
  useToast,
  Button,
  Text,
  Flex,
  Image,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useBreakpointValue,
} from "@chakra-ui/react";
import { ChevronLeftIcon, CloseIcon } from "@chakra-ui/icons";
import OpenAI from "openai";
import { useQuery } from "@apollo/client";
import ArchitectInput from "@/components/Architect/ArchitectInput";
import LogoDropzoneModal from "@/components/Architect/LogoDropzoneModal";
import LinksModal from "@/components/Architect/LinksModal";
import ConversationLog from "@/components/Architect/ConversationLog";
import { useAccount } from "wagmi";
import { useEthersSigner } from "@/components/ProviderConverter";
import { useIPFScontext } from "@/context/ipfsContext";
import { main } from "../../../scripts/newDeployment";
import { useRouter } from "next/router";
import { FETCH_INFRASTRUCTURE_ADDRESSES } from "@/util/queries";

// New deployer imports
import {
  DeployerProvider,
  useDeployer,
  DeployerWizard,
  mapStateToDeploymentParams,
  createDeploymentConfig,
} from "@/features/deployer";
import { resolveRoleUsernames } from "@/features/deployer/utils/usernameResolver";

/**
 * Inner component that has access to DeployerContext
 */
function DeployerPageContent() {
  const { address } = useAccount();
  const signer = useEthersSigner();
  const { addToIpfs } = useIPFScontext();
  const toast = useToast();
  const router = useRouter();
  const { state, actions } = useDeployer();

  // Fetch infrastructure addresses from subgraph
  const { data: infraData, loading: infraLoading, error: infraError } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    fetchPolicy: 'network-only',
  });

  // Debug logging for infrastructure addresses
  console.log('Infrastructure query:', { loading: infraLoading, error: infraError, data: infraData });

  // Extract addresses from subgraph data
  const infrastructureAddresses = useMemo(() => {
    const poaManager = infraData?.poaManagerContracts?.[0];

    // Infrastructure PROXY addresses (from PoaManager - these are what you actually call)
    const orgDeployerAddress = poaManager?.orgDeployerProxy || null;
    const orgRegistryProxy = poaManager?.orgRegistryProxy || null;
    const paymasterHubProxy = poaManager?.paymasterHubProxy || null;
    const globalAccountRegistryProxy = poaManager?.globalAccountRegistryProxy || null;

    // Use globalAccountRegistryProxy as registryAddress (this is the UniversalAccountRegistry)
    const registryAddress = globalAccountRegistryProxy;
    const poaManagerAddress = poaManager?.id || null;
    const orgRegistryAddress = orgRegistryProxy;

    // Helper to find beacon by type name (beacons are for org-level contract implementations)
    const findBeacon = (typeName) => {
      const beacon = infraData?.beacons?.find(b => b.typeName === typeName);
      return beacon?.beaconAddress || null;
    };

    // Extract beacon addresses (for reference - not typically called directly)
    const taskManagerBeacon = findBeacon('TaskManager');
    const hybridVotingBeacon = findBeacon('HybridVoting');
    const directDemocracyVotingBeacon = findBeacon('DirectDemocracyVoting');
    const educationHubBeacon = findBeacon('EducationHub');
    const participationTokenBeacon = findBeacon('ParticipationToken');
    const quickJoinBeacon = findBeacon('QuickJoin');
    const executorBeacon = findBeacon('Executor');
    const paymentManagerBeacon = findBeacon('PaymentManager');
    const eligibilityModuleBeacon = findBeacon('EligibilityModule');
    const toggleModuleBeacon = findBeacon('ToggleModule');

    return {
      // Core contracts
      registryAddress,
      poaManagerAddress,
      orgRegistryAddress,
      // Infrastructure proxies (the actual contracts to interact with)
      orgDeployerAddress,
      orgRegistryProxy,
      paymasterHubProxy,
      globalAccountRegistryProxy,
      // Beacons (for reference)
      taskManagerBeacon,
      hybridVotingBeacon,
      directDemocracyVotingBeacon,
      educationHubBeacon,
      participationTokenBeacon,
      quickJoinBeacon,
      executorBeacon,
      paymentManagerBeacon,
      eligibilityModuleBeacon,
      toggleModuleBeacon,
    };
  }, [infraData]);

  // AI Chatbot state
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [assistant, setAssistant] = useState(null);
  const [thread, setThread] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [openai, setOpenai] = useState(null);
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const previousMessagesRef = useRef([]);
  const initChatBotCalled = useRef(false);

  // Modal states
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  // Responsive values
  const exitButtonTop = useBreakpointValue({ base: "8px", lg: "8px", xl: "12px" });
  const exitButtonRight = useBreakpointValue({ base: "10px", lg: "16px", xl: "25px" });
  const exitButtonSize = useBreakpointValue({ base: "md", lg: "md", xl: "lg" });

  // Initialize chatbot on mount
  useEffect(() => {
    if (!initChatBotCalled.current) {
      initChatBot();
      initChatBotCalled.current = true;
    }
  }, []);

  const initChatBot = async () => {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

    if (!apiKey) {
      const introMessage =
        'Welcome to the Organization Creator!\n\n' +
        'The AI assistant is not available (no API key configured).\n\n' +
        'You can still create your organization using the form on the right side of the screen. ' +
        'Fill in your organization details and proceed through each step.';

      addMessage(introMessage, "Poa");
      previousMessagesRef.current = [{
        speaker: "Poa",
        text: introMessage,
        isTyping: false,
        isPreTyped: false
      }];
      return;
    }

    try {
      const openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true,
      });
      setOpenai(openai);

      const assistant = await openai.beta.assistants.retrieve(
        "asst_HopuEd843XXuOmDlfRCCfT7k"
      );
      const thread = await openai.beta.threads.create();
      setAssistant(assistant);
      setThread(thread);

      const introMessage =
        'Hello! I\'m Poa\n\n' +
        'I\'m your Perpetual Organization architect. I\'m here to help you build unstoppable, fully community-owned organizations.\n\n' +
        'Feel free to ask me any questions as you go through the setup process on the right side of the screen.';

      addMessage(introMessage, "Poa");
      previousMessagesRef.current = [{
        speaker: "Poa",
        text: introMessage,
        isTyping: false,
        isPreTyped: false
      }];
    } catch (error) {
      console.error('Error initializing chatbot:', error);
      const errorMessage =
        'Welcome to the Organization Creator!\n\n' +
        'The AI assistant could not be initialized.\n\n' +
        'You can still create your organization using the form on the right side of the screen.';

      addMessage(errorMessage, "Poa");
      previousMessagesRef.current = [{
        speaker: "Poa",
        text: errorMessage,
        isTyping: false,
        isPreTyped: false
      }];
    }
  };

  const addMessage = (text, speaker = "Poa", isTyping = false) => {
    const messageId = `message-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    setMessages((prevMessages) => [
      ...prevMessages,
      { speaker, text, isTyping, isPreTyped: false, id: messageId },
    ]);
  };

  const handleSendClick = () => {
    if (!userInput.trim()) return;
    handleUserInput(userInput.trim());
    setUserInput("");
  };

  const handleUserInput = async (input) => {
    addMessage(input, "User");
    await askChatBot(input);
  };

  const askChatBot = async (input) => {
    if (!openai || !thread || !assistant) {
      addMessage(
        "The AI assistant is not available. Please use the form on the right to configure your organization.",
        "Poa"
      );
      return;
    }

    setIsWaiting(true);
    const messageId = `message-${Date.now()}`;

    setMessages((prevMessages) => [
      ...prevMessages,
      { speaker: "Poa", text: "", isTyping: true, isPreTyped: false, id: messageId },
    ]);

    try {
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: input,
      });

      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id,
      });

      let response = await openai.beta.threads.runs.retrieve(thread.id, run.id);

      while (response.status === "in_progress" || response.status === "queued") {
        await new Promise((resolve) => setTimeout(resolve, 200));
        response = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      }

      setIsWaiting(false);
      const messageList = await openai.beta.threads.messages.list(thread.id);
      const lastMessage = messageList.data.find(
        (message) => message.run_id === run.id && message.role === "assistant"
      );

      if (lastMessage) {
        setMessages((prevMessages) => {
          const updatedMessages = prevMessages.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  text: lastMessage.content[0]["text"].value,
                  isTyping: false,
                  isPreTyped: false,
                  id: messageId,
                }
              : msg
          );
          previousMessagesRef.current = JSON.parse(JSON.stringify(updatedMessages));
          return updatedMessages;
        });
      }
    } catch (error) {
      console.error("Error in chat:", error);
      setIsWaiting(false);
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== messageId)
      );
      addMessage("Sorry, I encountered an error. Please try again.", "Poa");
    }
  };

  const toggleCollapse = () => {
    const newCollapsedState = !isCollapsed;

    if (newCollapsedState) {
      previousMessagesRef.current = JSON.parse(JSON.stringify(messages));
    } else {
      if (previousMessagesRef.current.length > 0) {
        setMessages(previousMessagesRef.current.map(msg => ({
          ...msg,
          isPreTyped: true,
          isTyping: false
        })));
      }
    }

    setIsCollapsed(newCollapsedState);
  };

  const handleExitClick = () => {
    setIsExitModalOpen(true);
  };

  const handleExitConfirm = () => {
    setIsExitModalOpen(false);
    router.push("/landing");
  };

  const handleExitCancel = () => {
    setIsExitModalOpen(false);
  };

  // Handle deployment from DeployerWizard
  const handleDeployStart = async (config) => {
    setIsDeploying(true);

    try {
      // Resolve all usernames to addresses before deployment
      const rolesWithResolvedAddresses = await resolveRoleUsernames(state.roles);

      // Upload description and links to IPFS first
      const links = state.organization.links || [];
      const jsonData = {
        description: state.organization.description || '',
        links: links.map((link) => ({
          name: link.name,
          url: link.url,
        })),
        template: state.organization.template || 'default',
      };

      console.log('[DEPLOY] Preparing IPFS metadata:', jsonData);

      let infoIPFSHash = state.organization.infoIPFSHash;
      if (!infoIPFSHash) {
        console.log('[DEPLOY] No existing IPFS hash, uploading new metadata...');
        const result = await addToIpfs(JSON.stringify(jsonData));
        infoIPFSHash = result.path;
        console.log('[DEPLOY] IPFS upload complete. CID:', infoIPFSHash);
        console.log('[DEPLOY] Verify content at: https://api.thegraph.com/ipfs/api/v0/cat?arg=' + infoIPFSHash);
        actions.setIPFSHash(infoIPFSHash);
      } else {
        console.log('[DEPLOY] Using existing IPFS hash:', infoIPFSHash);
      }

      console.log('[DEPLOY] Final infoIPFSHash for deployment:', infoIPFSHash);

      // Get deployment params with resolved addresses
      const stateWithResolvedRoles = {
        ...state,
        roles: rolesWithResolvedAddresses,
      };

      console.log('=== DEPLOYMENT DEBUG ===');
      console.log('Infrastructure addresses:', infrastructureAddresses);

      const deployParams = mapStateToDeploymentParams(stateWithResolvedRoles, address, infrastructureAddresses);

      console.log('Deployment params:', deployParams);
      console.log('Deploying with params:', deployParams);

      // Check if any role has additionalWearers
      const hasAdditionalWearers = deployParams.roles.some(
        role => role.distribution.additionalWearers && role.distribution.additionalWearers.length > 0
      );
      console.log('Has additional wearers:', hasAdditionalWearers);

      console.log('Roles structure:');
      deployParams.roles.forEach((role, idx) => {
        console.log(`  Role [${idx}] ${role.name}:`, {
          canVote: role.canVote,
          vouching: role.vouching,
          defaults: role.defaults,
          hierarchy: {
            adminRoleIndex: role.hierarchy.adminRoleIndex?.toString?.() || role.hierarchy.adminRoleIndex
          },
          distribution: {
            mintToDeployer: role.distribution.mintToDeployer,
            mintToExecutor: role.distribution.mintToExecutor,
            additionalWearers: role.distribution.additionalWearers,
          },
          hatConfig: role.hatConfig,
        });
      });

      // Call the deployment function
      // Note: The existing `main` function signature may need to be updated
      // to accept the new params format. For now, mapping to existing format:
      const membershipTypeNames = state.roles.map(r => r.name);
      const executiveRoleNames = state.roles
        .filter(r => r.hierarchy.adminRoleIndex === null)
        .map(r => r.name);

      const hasQuadratic = state.voting.classes.some(c => c.quadratic);
      const hybridVotingEnabled = state.voting.classes.length > 1;

      // Only pass customRoles if there are additionalWearers to assign
      // This preserves original behavior when no usernames are added
      const customRoles = hasAdditionalWearers ? deployParams.roles : null;
      console.log('Passing customRoles:', customRoles !== null);

      await main(
        membershipTypeNames,
        executiveRoleNames,
        state.organization.name,
        hasQuadratic,
        50, // democracyVoteWeight - will be replaced by voting classes
        50, // participationVoteWeight
        hybridVotingEnabled,
        !hybridVotingEnabled, // participationVotingEnabled
        state.features.electionHubEnabled,
        state.features.educationHubEnabled,
        state.organization.logoURL,
        infoIPFSHash,
        'DirectDemocracy', // votingControlType
        state.voting.ddQuorum,
        state.voting.hybridQuorum,
        state.organization.username || '',
        signer,
        customRoles,  // Only pass custom roles if there are additionalWearers
        infrastructureAddresses  // Addresses fetched from subgraph
      );

      toast({
        title: "Deployment successful!",
        description: "Your organization has been created.",
        status: "success",
        duration: 10000,
        isClosable: true,
      });

    } catch (error) {
      console.error("Error deploying organization:", error);
      toast({
        title: "Deployment failed",
        description: error.message || "There was an error during deployment.",
        status: "error",
        duration: 9000,
        isClosable: true,
      });
    } finally {
      setIsDeploying(false);
    }
  };

  // Handlers for modals that OrganizationStep needs
  const handleOpenLogoModal = () => setIsLogoModalOpen(true);
  const handleOpenLinksModal = () => setIsLinksModalOpen(true);

  const handleSaveLogo = (ipfsUrl) => {
    actions.setLogoURL(ipfsUrl);
    setIsLogoModalOpen(false);
  };

  const handleSaveLinks = (links) => {
    actions.updateOrganization({ links });
    setIsLinksModalOpen(false);
  };

  return (
    <Flex height="100vh" overflow="hidden" direction={{ base: "column", md: "row" }}>
      {/* Beta Badge */}
      {!isCollapsed && (
        <Box
          position="absolute"
          top="14px"
          left="14px"
          display={["none", "none", "block"]}
          bg="red.500"
          color="white"
          fontSize="12px"
          w="100px"
          px={3}
          py={3}
          borderRadius="md"
          fontWeight="500"
          zIndex={2}
        >
          Beta on Hoodi Testnet
        </Box>
      )}

      {/* Exit Button */}
      <Box position="absolute" top={exitButtonTop} right={exitButtonRight} zIndex={10}>
        <IconButton
          onClick={handleExitClick}
          colorScheme="blackAlpha"
          aria-label="Exit"
          icon={<CloseIcon />}
          size={exitButtonSize}
          isRound
        />
      </Box>

      {/* Left Sidebar for Chat Bot */}
      <Box
        width={isCollapsed ? "129px" : { base: "100%", md: "100%", lg: "35%" }}
        overflow="hidden"
        position="relative"
        p={0}
        bg={isCollapsed ? "transparent" : "rgba(0, 0, 0, 0.45)"}
        borderRight={isCollapsed ? "none" : { base: "none", lg: "none" }}
      >
        {!isCollapsed ? (
          <>
            <Button
              position="absolute"
              top="20px"
              right="6px"
              onClick={toggleCollapse}
              borderRadius="full"
              colorScheme="teal"
              zIndex="10"
            >
              <ChevronLeftIcon />
            </Button>
            <Box
              position="relative"
              overflowY="hidden"
              height="100%"
              width="full"
              pt="4"
              pb="100px"
              pl="2"
              pr="0"
            >
              <Center mb={4}>
                <Image
                  src="/images/high_res_poa.png"
                  alt="Poa"
                  width={{ base: "80px", md: "100px" }}
                  height={{ base: "80px", md: "100px" }}
                />
              </Center>

              <ConversationLog messages={messages} selectionHeight={80} />
            </Box>
            {isInputVisible && (
              <Box
                position="absolute"
                bottom="0"
                width="full"
                p={0}
                bg="gray.100"
                borderTop="1px solid #e2e8f0"
                height="80px"
              >
                <ArchitectInput
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onSubmit={handleSendClick}
                  isDisabled={isWaiting}
                />
              </Box>
            )}
          </>
        ) : (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="top"
            height="100%"
            cursor="pointer"
            onClick={toggleCollapse}
            mt="6"
            ml="4"
          >
            <Image
              src="/images/high_res_poa.png"
              alt="Poa Logo"
              width="100px"
              height="100px"
            />
          </Box>
        )}
      </Box>

      {/* Right Content Area - New Deployer Wizard */}
      <Box
        width={isCollapsed ? "100%" : { base: "100%", md: "100%", lg: "65%" }}
        overflowY="auto"
        bg="gray.50"
      >
        <DeployerWizard
          onDeployStart={handleDeployStart}
          deployerAddress={address}
        />
      </Box>

      {/* Modals */}
      <LogoDropzoneModal
        isOpen={isLogoModalOpen}
        onSave={handleSaveLogo}
        onClose={() => setIsLogoModalOpen(false)}
      />
      <LinksModal
        isOpen={isLinksModalOpen}
        onSave={handleSaveLinks}
        onClose={() => setIsLinksModalOpen(false)}
      />

      {/* Exit Confirmation Modal */}
      <Modal isOpen={isExitModalOpen} onClose={handleExitCancel}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Are you sure?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            All progress will be lost. Do you really want to stop creating your organization?
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="red" mr={3} onClick={handleExitConfirm}>
              Yes, Exit
            </Button>
            <Button variant="ghost" onClick={handleExitCancel}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {isDeploying && (
        <Center
          position="fixed"
          top="0"
          left="0"
          right="0"
          bottom="0"
          bg="blackAlpha.600"
          zIndex={1000}
        >
          <Box textAlign="center" color="white">
            <Spinner size="xl" mb={4} />
            <Text fontSize="lg">Deploying your organization...</Text>
          </Box>
        </Center>
      )}
    </Flex>
  );
}

/**
 * Main page component that wraps content with DeployerProvider
 */
const ArchitectPage = () => {
  return (
    <DeployerProvider>
      <DeployerPageContent />
    </DeployerProvider>
  );
};

export default ArchitectPage;
