/**
 * VotingPage
 * Main voting page component for proposal management and voting
 */

import React, { useState, useCallback } from "react";
import {
  Container,
  Center,
  Spinner,
  TabPanel,
} from "@chakra-ui/react";
import { usePOContext } from "@/context/POContext";
import { useVotingContext } from "@/context/VotingContext";
import { useWeb3 } from "@/hooks";
import { VotingType } from "@/services/web3/domain/VotingService";

import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import HeadingVote from "@/templateComponents/studentOrgDAO/voting/header";
import PollModal from "@/templateComponents/studentOrgDAO/voting/pollModal";
import CompletedPollModal from "@/templateComponents/studentOrgDAO/voting/CompletedPollModal";

import VotingTabs from "./VotingTabs";
import VotingPanel from "./VotingPanel";
import CreateVoteModal from "./CreateVoteModal";

// Custom hooks for logic extraction
import { usePollNavigation } from "../../hooks/usePollNavigation";
import { useVotingPagination } from "../../hooks/useVotingPagination";
import { useProposalForm } from "../../hooks/useProposalForm";
import { useWinnerStatus } from "../../hooks/useWinnerStatus";

const VotingPage = () => {
  const [showCreatePoll, setShowCreatePoll] = useState(false);

  // Web3 services hook
  const { voting, executeWithNotification, isReady } = useWeb3();

  const {
    directDemocracyVotingContractAddress,
    votingContractAddress,
    poContextLoading,
  } = usePOContext();

  const {
    hybridVotingOngoing,
    hybridVotingCompleted,
    democracyVotingOngoing,
    democracyVotingCompleted,
    votingType: PTVoteType,
  } = useVotingContext();

  // Poll navigation and selection
  const {
    selectedPoll,
    selectedOption,
    setSelectedOption,
    selectedTab,
    votingTypeSelected,
    handleTabChange,
    handlePollClick,
    getContractAddressForVotingType,
    isPollModalOpen,
    onPollModalOpen,
    onPollModalClose,
    isCompletedModalOpen,
    onCompletedModalClose,
  } = usePollNavigation({
    democracyVotingOngoing,
    democracyVotingCompleted,
    hybridVotingOngoing,
    hybridVotingCompleted,
    PTVoteType,
  });

  // Get proposals for current tab
  const currentOngoing = selectedTab === 0 ? democracyVotingOngoing : hybridVotingOngoing;
  const currentCompleted = selectedTab === 0 ? democracyVotingCompleted : hybridVotingCompleted;

  // Pagination
  const {
    displayedOngoing,
    displayedCompleted,
    handlePreviousOngoing,
    handleNextOngoing,
    handlePreviousCompleted,
    handleNextCompleted,
    resetPagination,
  } = useVotingPagination({
    ongoingProposals: currentOngoing,
    completedProposals: currentCompleted,
  });

  // Winner status
  const {
    showDetermineWinner,
    calculateRemainingTime,
    getWinner,
  } = useWinnerStatus({
    proposals: currentOngoing,
  });

  // Proposal creation form
  const handleProposalSubmit = useCallback(async (proposalData) => {
    if (!voting) return;

    const result = await executeWithNotification(
      () => voting.createDDProposal(directDemocracyVotingContractAddress, {
        name: proposalData.name,
        description: proposalData.description,
        durationMinutes: proposalData.time,
        numOptions: proposalData.numOptions,
        batches: proposalData.batches || [],
        hatIds: [],
      }),
      {
        pendingMessage: 'Creating proposal...',
        successMessage: 'Proposal created successfully!',
        refreshEvent: 'proposal:created',
      }
    );

    if (result.success) {
      setShowCreatePoll(false);
    }
  }, [voting, executeWithNotification, directDemocracyVotingContractAddress]);

  const {
    proposal,
    loadingSubmit,
    handleInputChange,
    handleOptionsChange,
    handleProposalTypeChange,
    handleTransferAddressChange,
    handleTransferAmountChange,
    handleSubmit,
  } = useProposalForm({
    onSubmit: handleProposalSubmit,
  });

  // Handle tab changes with pagination reset
  const handleTabsChange = useCallback((index) => {
    handleTabChange(index);
    resetPagination();
  }, [handleTabChange, resetPagination]);

  // Toggle create poll modal
  const handleCreatePollClick = useCallback(() => {
    setShowCreatePoll(prev => !prev);
  }, []);

  // Get winner handler
  const handleGetWinner = useCallback(async (contractAddress, proposalId, isHybrid = false) => {
    if (!voting) return;

    const type = isHybrid ? VotingType.HYBRID : VotingType.DIRECT_DEMOCRACY;
    await executeWithNotification(
      () => voting.announceWinner(type, contractAddress, proposalId),
      {
        pendingMessage: 'Announcing winner...',
        successMessage: 'Winner announced successfully!',
        refreshEvent: 'proposal:completed',
      }
    );
  }, [voting, executeWithNotification]);

  // Vote handlers for PollModal
  const handleDDVote = useCallback(async (contractAddress, proposalId, optionIndices, weights) => {
    if (!voting) return;

    await executeWithNotification(
      () => voting.castDDVote(contractAddress, proposalId, optionIndices, weights),
      {
        pendingMessage: 'Casting vote...',
        successMessage: 'Vote cast successfully!',
        refreshEvent: 'proposal:voted',
      }
    );
  }, [voting, executeWithNotification]);

  const handleHybridVote = useCallback(async (contractAddress, proposalId, optionIndices, weights) => {
    if (!voting) return;

    await executeWithNotification(
      () => voting.castHybridVote(contractAddress, proposalId, optionIndices, weights),
      {
        pendingMessage: 'Casting vote...',
        successMessage: 'Vote cast successfully!',
        refreshEvent: 'proposal:voted',
      }
    );
  }, [voting, executeWithNotification]);

  return (
    <>
      <Navbar />
      {poContextLoading ? (
        <Center height="90vh">
          <Spinner size="xl" />
        </Center>
      ) : (
        <Container maxW="container.2xl" py={{ base: 20, md: 4 }} px={{ base: "1%", md: "3%" }}>
          <HeadingVote selectedTab={selectedTab} PTVoteType={PTVoteType} />

          <VotingTabs
            selectedTab={selectedTab}
            handleTabsChange={handleTabsChange}
            PTVoteType={PTVoteType}
          >
            <TabPanel>
              <VotingPanel
                displayedOngoingProposals={displayedOngoing}
                displayedCompletedProposals={displayedCompleted}
                showDetermineWinner={showDetermineWinner}
                getWinner={handleGetWinner}
                calculateRemainingTime={calculateRemainingTime}
                contractAddress={directDemocracyVotingContractAddress}
                onPollClick={handlePollClick}
                onPreviousOngoingClick={handlePreviousOngoing}
                onNextOngoingClick={handleNextOngoing}
                onPreviousCompletedClick={handlePreviousCompleted}
                onNextCompletedClick={handleNextCompleted}
                onCreateClick={handleCreatePollClick}
                showCreatePoll={showCreatePoll}
              />
            </TabPanel>
            <TabPanel>
              <VotingPanel
                displayedOngoingProposals={displayedOngoing}
                displayedCompletedProposals={displayedCompleted}
                showDetermineWinner={showDetermineWinner}
                getWinner={handleGetWinner}
                calculateRemainingTime={calculateRemainingTime}
                contractAddress={votingContractAddress}
                onPollClick={handlePollClick}
                onPreviousOngoingClick={handlePreviousOngoing}
                onNextOngoingClick={handleNextOngoing}
                onPreviousCompletedClick={handlePreviousCompleted}
                onNextCompletedClick={handleNextCompleted}
                onCreateClick={handleCreatePollClick}
                showCreatePoll={showCreatePoll}
              />
            </TabPanel>
          </VotingTabs>

          <CreateVoteModal
            isOpen={showCreatePoll}
            onClose={handleCreatePollClick}
            proposal={proposal}
            handleInputChange={handleInputChange}
            handleOptionsChange={handleOptionsChange}
            handleProposalTypeChange={handleProposalTypeChange}
            handleTransferAddressChange={handleTransferAddressChange}
            handleTransferAmountChange={handleTransferAmountChange}
            handlePollCreated={handleSubmit}
            loadingSubmit={loadingSubmit}
          />

          <PollModal
            isOpen={isPollModalOpen}
            onClose={onPollModalClose}
            handleVote={votingTypeSelected === "Direct Democracy" ? handleDDVote : handleHybridVote}
            contractAddress={getContractAddressForVotingType(
              directDemocracyVotingContractAddress,
              votingContractAddress
            )}
            selectedPoll={selectedPoll}
            selectedOption={selectedOption}
            setSelectedOption={setSelectedOption}
            onOpen={onPollModalOpen}
          />

          <CompletedPollModal
            isOpen={isCompletedModalOpen}
            onClose={onCompletedModalClose}
            selectedPoll={selectedPoll}
            voteType={votingTypeSelected}
          />
        </Container>
      )}
    </>
  );
};

export default VotingPage;
