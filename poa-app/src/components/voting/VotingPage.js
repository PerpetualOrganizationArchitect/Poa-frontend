/**
 * VotingPage — the lifecycle voting board.
 *
 * Wave 2: replaces the old tabbed VotingTabs/VotingPanel surface with a single
 * lifecycle board (VotingBoard) fed by useVoteLanes, one GovernanceStrip
 * education header on top, and ONE PollDetail (replacing pollModal +
 * CompletedPollModal) driven by usePollNavigation.
 *
 * Container responsibilities (kept out of the presentation components):
 *   - CreateVoteModal wiring + handleProposalSubmit (forwarding actionSummaries)
 *   - vote handlers (return the executeWithNotification result so PollDetail can
 *     roll back its optimistic celebration on failure)
 *   - the finalize handler ("Count the votes"), routed through PollDetail's
 *     AlertDialog confirm
 *   - tour auto-open of CreateVoteModal at the create-vote-preview step
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/router";
import { Box, Container, Center, Flex, Heading, Button, Icon, Link, useToast } from "@chakra-ui/react";
import { PiPlusCircle, PiScales } from "react-icons/pi";
import { getTemplateById, isContractAvailable, CONTRACT_MAP } from "@/config/setterDefinitions";
import PulseLoader from "@/components/shared/PulseLoader";
import GlassBack from "./GlassBack";
import { useOrgGate } from "@/components/shared/OrgDeadEnd";
import { usePOContext } from "@/context/POContext";
import { useVotingContext } from "@/context/VotingContext";
import { useUserContext } from "@/context/UserContext";
import { useAuth } from "@/context/AuthContext";
import { useWeb3, useOrgTheme, useVoteLanes } from "@/hooks";
import { useOrgName } from "@/hooks/useOrgName";
import { VotingType } from "@/services/web3/domain/VotingService";

import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import VotingEducationHeader from "./VotingEducationHeader";
import { VotingBoard } from "./VotingBoard";
import { PollDetail } from "./PollDetail";
import CreateVoteModal from "./CreateVoteModal";
import OrgConstitution from "./OrgConstitution";

// Custom hooks for logic extraction
import { usePollNavigation } from "../../hooks/usePollNavigation";
import { useProposalForm } from "../../hooks/useProposalForm";
import { useTour } from "@/features/tour";

const VotingPage = () => {
  const router = useRouter();
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const { currentStepDef, isActive: isTourActive } = useTour();
  const tourOpenedModalRef = useRef(false);

  // Auto-open/close CreateVoteModal when tour reaches the create-vote-preview step
  useEffect(() => {
    const tourWantsModal = isTourActive && currentStepDef?.id === 'create-vote-preview';
    if (tourWantsModal && !showCreatePoll) {
      tourOpenedModalRef.current = true;
      setShowCreatePoll(true);
    } else if (!tourWantsModal && tourOpenedModalRef.current) {
      // Only close if the tour opened it (not if user opened it manually)
      tourOpenedModalRef.current = false;
      setShowCreatePoll(false);
    }
  }, [isTourActive, currentStepDef?.id, showCreatePoll]);

  // Web3 services hook
  const { voting, executeWithNotification } = useWeb3();
  const { pageBackground } = useOrgTheme();
  const userDAO = useOrgName();
  const orgGate = useOrgGate();
  const toast = useToast();

  const {
    directDemocracyVotingContractAddress,
    votingContractAddress,
    taskManagerContractAddress,
    executorContractAddress,
    eligibilityModuleAddress,
    participationTokenAddress,
    zkEmailInvitesAddress,
    poContextLoading,
    roleNames,
    leaderboardData,
    poMembers,
  } = usePOContext();

  const {
    hybridVotingOngoing,
    democracyVotingOngoing,
    democracyVotingCompleted,
    hybridVotingCompleted,
    votingType: PTVoteType,
    resolveMissingPoll,
    votingClasses,
    hybridThresholdPct,
    hybridQuorum,
    ddThresholdPct,
    ddQuorum,
    refetch,
  } = useVotingContext();

  const { hasMemberRole } = useUserContext();
  const { accountAddress } = useAuth();
  const isConnected = !!accountAddress;

  // Derived lifecycle lanes (shared definitions with /votes + dashboard).
  const { lanes, loading, error } = useVoteLanes();

  // Poll navigation + the single PollDetail surface.
  const {
    selectedPoll,
    votingTypeSelected,
    handlePollClick,
    getContractAddressForVotingType,
    isDetailOpen,
    onDetailClose,
  } = usePollNavigation({
    democracyVotingOngoing,
    democracyVotingCompleted,
    hybridVotingOngoing,
    hybridVotingCompleted,
    PTVoteType,
    resolveMissingPoll,
  });

  // PollDetail must render LIVE data — selectedPoll is a click-time snapshot,
  // so optimistic votes and 30s polling refreshes would never reach an open
  // detail (celebration bars would exclude the user's own vote). Re-derive the
  // fresh transformed proposal by id on every context update.
  const livePoll = useMemo(() => {
    if (!selectedPoll) return null;
    const all = [
      ...hybridVotingOngoing,
      ...hybridVotingCompleted,
      ...democracyVotingOngoing,
      ...democracyVotingCompleted,
    ];
    return all.find((p) => p.id === selectedPoll.id) || selectedPoll;
  }, [selectedPoll, hybridVotingOngoing, hybridVotingCompleted, democracyVotingOngoing, democracyVotingCompleted]);

  // Proposal creation
  const handleProposalSubmit = useCallback(async (proposalData) => {
    if (!voting) return;

    const proposalParams = {
      name: proposalData.name,
      description: proposalData.description,
      durationMinutes: proposalData.time,
      numOptions: proposalData.numOptions,
      optionNames: proposalData.optionNames || [],
      batches: proposalData.batches || [],
      hatIds: proposalData.hatIds || [],
      // Forward human-readable action previews so the metadata JSON carries
      // them (useProposalForm emits this; the old VotingPage dropped it).
      actionSummaries: proposalData.actionSummaries || [],
    };

    const isExecutionProposal =
      proposalData.type === 'setter'
      || proposalData.type === 'election'
      || proposalData.type === 'createRole';

    const result = await executeWithNotification(
      () => isExecutionProposal
        ? voting.createHybridProposal(votingContractAddress, proposalParams)
        : voting.createDDProposal(directDemocracyVotingContractAddress, proposalParams),
      {
        pendingMessage: 'Creating proposal...',
        successMessage: 'Proposal created successfully!',
        refreshEvent: 'proposal:created',
      }
    );

    if (result.success) {
      setShowCreatePoll(false);
    }
  }, [voting, executeWithNotification, directDemocracyVotingContractAddress, votingContractAddress]);

  const {
    proposal,
    loadingSubmit,
    handleInputChange,
    handleOptionChange,
    addOption,
    removeOption,
    handleProposalTypeChange,
    handleTransferAddressChange,
    handleTransferAmountChange,
    handleRestrictedToggle,
    toggleRestrictedRole,
    handleSetterChange,
    handleSubmit,
    restoreProposal,
  } = useProposalForm({
    onSubmit: handleProposalSubmit,
  });

  // Keys here must cover every CONTRACT_MAP contextKey a setter template can
  // target — a missing key makes buildProposalData skip the encode step, and
  // the proposal would go on-chain carrying an empty batch.
  const contractAddresses = useMemo(() => ({
    votingContractAddress,
    directDemocracyVotingContractAddress,
    taskManagerContractAddress,
    executorContractAddress,
    participationTokenAddress,
    zkEmailInvitesAddress,
  }), [votingContractAddress, directDemocracyVotingContractAddress, taskManagerContractAddress, executorContractAddress, participationTokenAddress, zkEmailInvitesAddress]);

  const handlePollCreated = useCallback(() => {
    return handleSubmit(eligibilityModuleAddress, contractAddresses);
  }, [handleSubmit, eligibilityModuleAddress, contractAddresses]);

  const handleCreatePollClick = useCallback(() => {
    setShowCreatePoll(prev => !prev);
  }, []);

  // Current rule values, threaded to SetterActionSelector so the setter preview
  // can render a BEFORE → AFTER diff for the five rule templates.
  const currentRuleValues = useMemo(() => ({
    hybridThresholdPct,
    hybridQuorum,
    ddThresholdPct,
    ddQuorum,
    votingClasses,
  }), [hybridThresholdPct, hybridQuorum, ddThresholdPct, ddQuorum, votingClasses]);

  // "Propose a change" from the Constitution panel — prefills the create form
  // with the matching setter template preselected, then opens the modal. Mirrors
  // exactly the state SetterActionSelector.handleTemplateSelect sets on click
  // (setterContract/Function + initialized setterValues) so the modal lands on
  // the template's configured step, not the category picker.
  const handleProposeRuleChange = useCallback((templateId, initialValues = null) => {
    const template = getTemplateById(templateId);
    if (!template) return;
    // A ?propose= link can outlive the org it was copied from. Opening the form
    // for a contract this org never deployed would only build an empty proposal
    // — say so instead of dropping the click on the floor.
    if (!isContractAvailable(template.contract, contractAddresses)) {
      toast({
        title: "Not available here",
        description: `"${template.name}" needs ${CONTRACT_MAP[template.contract]?.displayName || template.contract}, `
          + 'which this group doesn\'t have set up.',
        status: "info",
        duration: 6000,
        isClosable: true,
      });
      return;
    }
    const setterValues = (template.inputs || []).reduce((acc, input) => {
      if (input.type === 'votingClassWeights') {
        acc[input.name] = votingClasses.length > 0 ? votingClasses.map(c => ({ ...c })) : [];
      } else {
        // Deep-link prefill (e.g. Settings staging an allowlist hands the root/cid straight to the
        // proposal) — falls back to the template default.
        acc[input.name] = initialValues?.[input.name] ?? (input.default || '');
      }
      return acc;
    }, {});
    restoreProposal({
      type: 'setter',
      setterMode: 'template',
      setterTemplate: templateId,
      setterContract: template.contract || '',
      setterFunction: template.functionName || '',
      setterValues,
      setterParams: [],
    });
    setShowCreatePoll(true);
  }, [restoreProposal, votingClasses, contractAddresses, toast]);

  // Deep link support: /voting?propose=<templateId> (from the /rules page)
  // opens the create modal with that rule template preselected, once.
  const proposeParamHandledRef = useRef(false);
  useEffect(() => {
    if (!router.isReady || proposeParamHandledRef.current) return;
    // Wait for POContext to resolve the org's contract addresses. Firing on
    // router.isReady alone races the subgraph fetch, and handleProposeRuleChange
    // would reject the template as "not deployed here" before we know better.
    if (poContextLoading) return;
    const templateId = router.query.propose;
    if (!templateId || typeof templateId !== 'string') return;
    proposeParamHandledRef.current = true;
    // Collect ?prefill_<inputName>=… params into the template's initial values.
    const prefill = {};
    for (const [key, value] of Object.entries(router.query)) {
      if (key.startsWith('prefill_') && typeof value === 'string') prefill[key.slice(8)] = value;
    }
    handleProposeRuleChange(templateId, Object.keys(prefill).length ? prefill : null);
    // Strip the params so a refresh / back doesn't reopen the modal.
    const rest = Object.fromEntries(
      Object.entries(router.query).filter(([key]) => key !== 'propose' && !key.startsWith('prefill_')),
    );
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
  }, [router.isReady, router.query, handleProposeRuleChange, router, poContextLoading]);

  // Finalize ("Count the votes") — routed through PollDetail's AlertDialog.
  // RETURNS the result so the confirm dialog can await it.
  const handleGetWinner = useCallback(async (contractAddress, proposalId, isHybrid = false) => {
    if (!voting) return { success: false };

    const type = isHybrid ? VotingType.HYBRID : VotingType.DIRECT_DEMOCRACY;
    return executeWithNotification(
      () => voting.announceWinner(type, contractAddress, proposalId),
      {
        pendingMessage: 'Counting the votes...',
        successMessage: 'Result recorded on-chain!',
        refreshEvent: 'proposal:completed',
      }
    );
  }, [voting, executeWithNotification]);

  // Vote handlers — RETURN the executeWithNotification result so PollDetail can
  // react (roll back the optimistic celebration + show the calm error on fail).
  const handleDDVote = useCallback(async (contractAddress, proposalId, optionIndices, weights) => {
    if (!voting) return { success: false };
    return executeWithNotification(
      () => voting.castDDVote(contractAddress, proposalId, optionIndices, weights),
      {
        pendingMessage: 'Casting vote...',
        successMessage: 'Vote cast successfully!',
        refreshEvent: 'proposal:voted',
      }
    );
  }, [voting, executeWithNotification]);

  const handleHybridVote = useCallback(async (contractAddress, proposalId, optionIndices, weights) => {
    if (!voting) return { success: false };
    return executeWithNotification(
      () => voting.castHybridVote(contractAddress, proposalId, optionIndices, weights),
      {
        pendingMessage: 'Casting vote...',
        successMessage: 'Vote cast successfully!',
        refreshEvent: 'proposal:voted',
      }
    );
  }, [voting, executeWithNotification]);

  const canCreate = hasMemberRole;

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;

  return (
    <>
      <Navbar />
      {poContextLoading ? (
        <Center height="90vh" background={pageBackground()}>
          <PulseLoader size="xl" />
        </Center>
      ) : (
        <Container maxW="container.2xl" py={4} px={{ base: "1%", md: "3%" }} minH="100vh" background={pageBackground()}>
          {/* GovernanceStrip — the one-line education header. `modalOpen` holds
              its first-visit coach-mark back while a modal owns the screen. */}
          <Box data-tour="voting-header" mb={6}>
            <VotingEducationHeader
              selectedTab={0}
              PTVoteType={PTVoteType}
              modalOpen={isDetailOpen || showCreatePoll}
            />
          </Box>

          {/* Board panel — the dark glass container the whole board lives in.
              Lane headers, chips, and cards are unreadable directly on themed
              org backgrounds (e.g. Test6 mint), so everything sits on glass,
              matching the /votes archive panels and the old VotingPanel. */}
          <Box
            position="relative"
            zIndex={1}
            borderRadius="3xl"
            p={{ base: 4, md: 8 }}
            mb={8}
            w="100%"
            maxW="1400px"
            mx="auto"
            boxShadow="lg"
          >
            <GlassBack />

            {/* Board header row: title + Create Vote CTA (top-right). */}
            <Flex justify="space-between" align="center" mb={5} gap={3} flexWrap="wrap">
              <Flex align="center" gap={3} flexWrap="wrap">
                <Heading as="h1" size="lg" color="white" fontWeight="800">
                  Votes
                </Heading>
                <Link
                  display="inline-flex"
                  alignItems="center"
                  gap={1}
                  fontSize="sm"
                  fontWeight="600"
                  color="gray.300"
                  _hover={{ color: "white", textDecoration: "none" }}
                  onClick={() => {
                    if (typeof document !== "undefined") {
                      document.getElementById("our-rules")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }}
                >
                  <Icon as={PiScales} boxSize={4} />
                  Our rules
                </Link>
              </Flex>
              {canCreate && (
                <Button
                  leftIcon={<Icon as={PiPlusCircle} boxSize={5} />}
                  minH="44px"
                  bg="#9473DC"
                  color="white"
                  _hover={{ bg: "#B79BF0" }}
                  onClick={handleCreatePollClick}
                >
                  Create vote
                </Button>
              )}
            </Flex>

            <VotingBoard
              lanes={lanes}
              loading={loading}
              error={error}
              onRetry={refetch}
              onOpenPoll={(p) => handlePollClick(p, !p.isOngoing)}
              onFinalize={(p) => handlePollClick(p, false)}
              poMembers={poMembers}
              isConnected={isConnected}
              isMember={hasMemberRole}
              canCreate={canCreate}
              onCreate={handleCreatePollClick}
              orgName={userDAO}
            />
          </Box>

          {/* Constitution — "Our rules" (collapsible, below the board). */}
          <OrgConstitution
            hasMemberRole={hasMemberRole}
            onProposeRuleChange={handleProposeRuleChange}
          />

          <CreateVoteModal
            isOpen={showCreatePoll}
            onClose={handleCreatePollClick}
            proposal={proposal}
            handleInputChange={handleInputChange}
            handleOptionChange={handleOptionChange}
            addOption={addOption}
            removeOption={removeOption}
            handleProposalTypeChange={handleProposalTypeChange}
            handleTransferAddressChange={handleTransferAddressChange}
            handleTransferAmountChange={handleTransferAmountChange}
            handleRestrictedToggle={handleRestrictedToggle}
            toggleRestrictedRole={toggleRestrictedRole}
            handleSetterChange={handleSetterChange}
            handlePollCreated={handlePollCreated}
            loadingSubmit={loadingSubmit}
            roleNames={roleNames}
            votingClasses={votingClasses}
            currentValues={currentRuleValues}
            leaderboardData={leaderboardData}
            ongoingProposals={hybridVotingOngoing}
            contractAddresses={contractAddresses}
          />

          {/* ONE detail surface for ongoing AND completed polls. */}
          <PollDetail
            poll={livePoll}
            isOpen={isDetailOpen}
            onClose={onDetailClose}
            onVote={votingTypeSelected === "Direct Democracy" ? handleDDVote : handleHybridVote}
            onFinalize={handleGetWinner}
            contractAddress={getContractAddressForVotingType(
              directDemocracyVotingContractAddress,
              votingContractAddress
            )}
            votingTypeSelected={votingTypeSelected}
          />
        </Container>
      )}
    </>
  );
};

export default VotingPage;
