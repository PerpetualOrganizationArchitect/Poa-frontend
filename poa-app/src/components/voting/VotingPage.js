import React, { useState, useEffect } from "react";
import {
  Container,
  Center,
  Spinner,
  TabPanel,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { ethers } from "ethers";
import { useWeb3Context } from "@/context/web3Context";
import { usePOContext } from "@/context/POContext";
import { useVotingContext } from "@/context/VotingContext";
import { useAccount } from "wagmi";

import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import HeadingVote from "@/templateComponents/studentOrgDAO/voting/header";
import PollModal from "@/templateComponents/studentOrgDAO/voting/pollModal";
import CompletedPollModal from "@/templateComponents/studentOrgDAO/voting/CompletedPollModal";

import VotingTabs from "./VotingTabs";
import VotingPanel from "./VotingPanel";
import CreateVoteModal from "./CreateVoteModal";

const VotingPage = () => {
  const router = useRouter();
  const { userDAO } = router.query;
  const toast = useToast();

  const {
    createProposalDDVoting,
    getWinnerDDVoting,
    getWinnerHybridVoting,
    createProposalParticipationVoting,
    ddVote,
    hybridVote,
    account,
  } = useWeb3Context();
  
  const { isOpen: isCompletedOpen, onOpen: onCompletedOpen, onClose: onCompletedClose } = useDisclosure();

  const { address } = useAccount();
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
    votingType
  } = useVotingContext();

  const PTVoteType = votingType;

  const [votingTypeSelected, setVotingTypeSelected] = useState("Direct Democracy");
  const [showDetermineWinner, setShowDetermineWinner] = useState({});
  const [selectedTab, setSelectedTab] = useState(0);
  const [ongoingStartIndex, setOngoingStartIndex] = useState(0);
  const [completedStartIndex, setCompletedStartIndex] = useState(0);
  const proposalDisplayLimit = 3;
  
  // Poll state
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedPoll, setSelectedPoll] = useState(null);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [selectedOption, setSelectedOption] = useState("");
  const [isPollCompleted, setIsPollCompleted] = useState(false);

  // Proposal state
  const defaultProposal = {
    name: "",
    description: "",
    execution: "",
    time: 0,
    options: [],
    type: "normal",
    transferAddress: "",
    transferAmount: "",
    id: 0,
  };
  const [proposal, setProposal] = useState(defaultProposal);

  // Safe array handling - POP uses HybridVoting (no separate ParticipationVoting)
  const safeVotingOngoing = Array.isArray(selectedTab === 0 ? democracyVotingOngoing : hybridVotingOngoing)
    ? (selectedTab === 0 ? democracyVotingOngoing : hybridVotingOngoing)
    : [];

  const safeVotingCompleted = Array.isArray(selectedTab === 0 ? democracyVotingCompleted : hybridVotingCompleted)
    ? (selectedTab === 0 ? democracyVotingCompleted : hybridVotingCompleted)
    : [];

  // Display filtered proposals
  const displayedOngoingProposals = safeVotingOngoing.slice(
    ongoingStartIndex,
    ongoingStartIndex + proposalDisplayLimit
  );

  const displayedCompletedProposals = [...safeVotingCompleted]
    .reverse()
    .slice(completedStartIndex, completedStartIndex + proposalDisplayLimit);

  const calculateRemainingTime = (expirationTimestamp) => {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const duration = expirationTimestamp - currentTimestamp;
    return Math.max(0, duration);
  };
  
  const updateWinnerStatus = async (expirationTimestamp, proposalId, isHybrid) => {
    const duration = calculateRemainingTime(expirationTimestamp);
    if (duration <= 0 ) {
      setShowDetermineWinner(prevState => ({
        ...prevState,
        [proposalId]: true
      }));
    }
  };
  
  const getWinner = async (contractAddress, proposalId, isHybrid = false) => {
    // In POP subgraph, id format is "contractAddress-proposalId"
    // Extract the actual proposalId (second part after split)
    const newID = proposalId.split("-")[1] || proposalId;
    if (isHybrid) {
      await getWinnerHybridVoting(contractAddress, newID);
    } else {
      await getWinnerDDVoting(contractAddress, newID);
    }
  };
  
  const handleTabsChange = (index) => {
    setSelectedTab(index);
    const voteType = index === 0 ? "Direct Democracy" : PTVoteType;
    setVotingTypeSelected(voteType);
    // Reset pagination when changing tabs
    setOngoingStartIndex(0);
    setCompletedStartIndex(0);
  };

  const handlePreviousProposalsClickOngoing = () => {
    setOngoingStartIndex(Math.max(0, ongoingStartIndex - proposalDisplayLimit));
  };

  const handleNextProposalsClickOngoing = () => {
    if (ongoingStartIndex + proposalDisplayLimit < safeVotingOngoing.length) {
      setOngoingStartIndex(ongoingStartIndex + proposalDisplayLimit);
    }
  };

  const handlePreviousProposalsClickCompleted = () => {
    setCompletedStartIndex(Math.max(0, completedStartIndex - proposalDisplayLimit));
  };

  const handleNextProposalsClickCompleted = () => {
    if (completedStartIndex + proposalDisplayLimit < safeVotingCompleted.length) {
      setCompletedStartIndex(completedStartIndex + proposalDisplayLimit);
    }
  };

  const handlePollClick = (poll, isCompleted = false) => {
    setSelectedPoll(poll);
    setIsPollCompleted(isCompleted);
    router.push(`/voting?poll=${poll.id}&userDAO=${userDAO}`);
    if (isCompleted) {
      onCompletedOpen();
    } else {
      onOpen();
    }
  };

  const handleCreatePollClick = () => {
    setShowCreatePoll(!showCreatePoll);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProposal({ ...proposal, [name]: value });
  };

  const handleOptionsChange = (e) => {
    const options = e.target.value.split(", ");
    setProposal({ ...proposal, options });
  };

  const handleProposalTypeChange = (e) => {
    const newType = e.target.value;
    setProposal({ ...proposal, type: newType });
  };

  const handleTransferAddressChange = (e) => {
    setProposal({ ...proposal, transferAddress: e.target.value });
  };

  const handleTransferAmountChange = (e) => {
    setProposal({ ...proposal, transferAmount: e.target.value });
  };

  const handlePollCreated = async () => {
    setLoadingSubmit(true);
    try {
      let numOptions;
      let batches = [];

      if (proposal.type === "transferFunds") {
        // Validate transfer inputs
        if (!proposal.transferAddress || !ethers.isAddress(proposal.transferAddress)) {
          toast({
            title: "Invalid Address",
            description: "Please enter a valid recipient address.",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          setLoadingSubmit(false);
          return;
        }

        const amount = parseFloat(proposal.transferAmount);
        if (isNaN(amount) || amount <= 0) {
          toast({
            title: "Invalid Amount",
            description: "Please enter a valid transfer amount.",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          setLoadingSubmit(false);
          return;
        }

        // Build batch execution for Yes/No vote
        // batches[0] = calls to execute if "Yes" (option 0) wins
        // batches[1] = calls to execute if "No" (option 1) wins (empty)
        const transferCall = {
          target: proposal.transferAddress,
          value: ethers.parseEther(proposal.transferAmount).toString(),
          data: "0x", // Empty data for ETH transfer
        };

        batches = [
          [transferCall], // Yes wins: execute transfer
          [],             // No wins: do nothing
        ];
        numOptions = 2;
      } else {
        // Normal proposal - use custom options or default to 2
        numOptions = proposal.options?.length || 2;
        batches = [];
      }

      await createProposalDDVoting(
        directDemocracyVotingContractAddress,
        proposal.name,
        proposal.description,
        proposal.time,        // duration in minutes
        numOptions,           // number of options
        batches,              // batches for execution
        []                    // hatIds - empty for unrestricted voting
      );

      setLoadingSubmit(false);
      setShowCreatePoll(false);
      setProposal(defaultProposal);

      toast({
        title: "Proposal Created",
        description: proposal.type === "transferFunds"
          ? `Transfer proposal created. If "Yes" wins, ${proposal.transferAmount} ETH will be sent to ${proposal.transferAddress.slice(0, 6)}...${proposal.transferAddress.slice(-4)}`
          : "Your proposal has been created successfully.",
        status: "success",
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      console.error("Error creating poll:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create proposal.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      setLoadingSubmit(false);
    }
  };

  // Effect to check for expired proposals
  useEffect(() => {
    safeVotingOngoing.forEach(proposal => {
      updateWinnerStatus(proposal?.endTimestamp, proposal?.id, proposal?.isHybrid);
    });
  }, [safeVotingOngoing]);

  // Effect to check for the poll id in the URL
  useEffect(() => {
    if (router.query.poll) {
      const pollId = router.query.poll;
      
      const findPoll = (proposals) => {
        return proposals.find((proposal) => proposal.id === pollId || proposal.title === pollId);
      };
      
      let pollFound = null;
      let pollType = "";
      
      if (Array.isArray(democracyVotingOngoing) && democracyVotingOngoing.length > 0) {
        pollFound = findPoll(democracyVotingOngoing);
        if (pollFound) pollType = "Direct Democracy";
      }
      
      if (!pollFound && Array.isArray(hybridVotingOngoing) && hybridVotingOngoing.length > 0) {
        pollFound = findPoll(hybridVotingOngoing);
        if (pollFound) pollType = "Hybrid";
      }


      if (!pollFound && Array.isArray(democracyVotingCompleted) && democracyVotingCompleted.length > 0) {
        pollFound = findPoll(democracyVotingCompleted);
        if (pollFound) pollType = "Direct Democracy";
      }

      if (!pollFound && Array.isArray(hybridVotingCompleted) && hybridVotingCompleted.length > 0) {
        pollFound = findPoll(hybridVotingCompleted);
        if (pollFound) pollType = "Hybrid";
      }


      if (pollFound) {
        setSelectedPoll(pollFound);
        setVotingTypeSelected(pollType);
        setSelectedTab(pollType === "Direct Democracy" ? 0 : 1);
        const isCompleted =
          (Array.isArray(democracyVotingCompleted) && democracyVotingCompleted.includes(pollFound)) ||
          (Array.isArray(hybridVotingCompleted) && hybridVotingCompleted.includes(pollFound));
        setIsPollCompleted(isCompleted);
        if (isCompleted) {
          onCompletedOpen();
        } else {
          onOpen();
        }
      }
    }
  }, [
    router.query.poll,
    democracyVotingOngoing,
    democracyVotingCompleted,
    hybridVotingOngoing,
    hybridVotingCompleted,
    onOpen,
    onCompletedOpen
  ]);

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
                displayedOngoingProposals={displayedOngoingProposals}
                displayedCompletedProposals={displayedCompletedProposals}
                showDetermineWinner={showDetermineWinner}
                getWinner={getWinner}
                calculateRemainingTime={calculateRemainingTime}
                contractAddress={directDemocracyVotingContractAddress}
                onPollClick={handlePollClick}
                onPreviousOngoingClick={handlePreviousProposalsClickOngoing}
                onNextOngoingClick={handleNextProposalsClickOngoing}
                onPreviousCompletedClick={handlePreviousProposalsClickCompleted}
                onNextCompletedClick={handleNextProposalsClickCompleted}
                onCreateClick={handleCreatePollClick}
                showCreatePoll={showCreatePoll}
              />
            </TabPanel>
            <TabPanel>
              <VotingPanel
                displayedOngoingProposals={displayedOngoingProposals}
                displayedCompletedProposals={displayedCompletedProposals}
                showDetermineWinner={showDetermineWinner}
                getWinner={getWinner}
                calculateRemainingTime={calculateRemainingTime}
                contractAddress={votingContractAddress}
                onPollClick={handlePollClick}
                onPreviousOngoingClick={handlePreviousProposalsClickOngoing}
                onNextOngoingClick={handleNextProposalsClickOngoing}
                onPreviousCompletedClick={handlePreviousProposalsClickCompleted}
                onNextCompletedClick={handleNextProposalsClickCompleted}
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
            handlePollCreated={handlePollCreated}
            loadingSubmit={loadingSubmit}
          />
          
          <PollModal
            isOpen={isOpen}
            onClose={onClose}
            handleVote={votingTypeSelected === "Direct Democracy" ? ddVote : hybridVote}
            contractAddress={votingTypeSelected === "Direct Democracy" ? directDemocracyVotingContractAddress : votingContractAddress}
            selectedPoll={selectedPoll}
            selectedOption={selectedOption}
            setSelectedOption={setSelectedOption}
            onOpen={onOpen}
          />
          
          <CompletedPollModal
            isOpen={isCompletedOpen}
            onClose={onCompletedClose}
            selectedPoll={selectedPoll}
            voteType={votingTypeSelected}
          />
        </Container>
      )}
    </>
  );
};

export default VotingPage; 