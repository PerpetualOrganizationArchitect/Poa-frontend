/**
 * useProposalForm
 * Hook for managing proposal form state and submission
 */

import { useState, useCallback } from 'react';
import { useToast } from '@chakra-ui/react';
import { utils } from 'ethers';

const defaultProposal = {
  name: "",
  description: "",
  execution: "",
  time: 0,
  options: [],
  type: "normal",
  transferAddress: "",
  transferAmount: "",
  // Election fields
  electionCandidates: [], // Array of { name, address }
  electionRoleId: "",     // Hat ID for the role being elected
  // Voting restriction fields
  isRestricted: false,    // Whether to restrict who can vote
  restrictedHatIds: [],   // Hat IDs that can vote (if restricted)
  id: 0,
};

export function useProposalForm({ onSubmit }) {
  const toast = useToast();
  const [proposal, setProposal] = useState(defaultProposal);
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setProposal(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleOptionsChange = useCallback((e) => {
    const options = e.target.value.split(", ");
    setProposal(prev => ({ ...prev, options }));
  }, []);

  const handleProposalTypeChange = useCallback((e) => {
    setProposal(prev => ({ ...prev, type: e.target.value }));
  }, []);

  const handleTransferAddressChange = useCallback((e) => {
    setProposal(prev => ({ ...prev, transferAddress: e.target.value }));
  }, []);

  const handleTransferAmountChange = useCallback((e) => {
    setProposal(prev => ({ ...prev, transferAmount: e.target.value }));
  }, []);

  const handleElectionRoleChange = useCallback((roleId) => {
    setProposal(prev => ({ ...prev, electionRoleId: roleId }));
  }, []);

  const handleCandidatesChange = useCallback((candidates) => {
    setProposal(prev => ({ ...prev, electionCandidates: candidates }));
  }, []);

  const addCandidate = useCallback((name, address) => {
    setProposal(prev => ({
      ...prev,
      electionCandidates: [...prev.electionCandidates, { name, address }]
    }));
  }, []);

  const removeCandidate = useCallback((index) => {
    setProposal(prev => ({
      ...prev,
      electionCandidates: prev.electionCandidates.filter((_, i) => i !== index)
    }));
  }, []);

  const handleRestrictedToggle = useCallback((isRestricted) => {
    setProposal(prev => ({
      ...prev,
      isRestricted,
      restrictedHatIds: isRestricted ? prev.restrictedHatIds : [],
    }));
  }, []);

  const handleRestrictedRolesChange = useCallback((hatIds) => {
    setProposal(prev => ({ ...prev, restrictedHatIds: hatIds }));
  }, []);

  const toggleRestrictedRole = useCallback((hatId) => {
    setProposal(prev => {
      const current = prev.restrictedHatIds || [];
      const isSelected = current.includes(hatId);
      return {
        ...prev,
        restrictedHatIds: isSelected
          ? current.filter(id => id !== hatId)
          : [...current, hatId],
      };
    });
  }, []);

  const resetForm = useCallback(() => {
    setProposal(defaultProposal);
  }, []);

  const validateTransferProposal = useCallback(() => {
    if (!proposal.transferAddress || !utils.isAddress(proposal.transferAddress)) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid recipient address.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
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
      return false;
    }

    return true;
  }, [proposal.transferAddress, proposal.transferAmount, toast]);

  const validateElectionProposal = useCallback(() => {
    if (!proposal.electionRoleId) {
      toast({
        title: "No Role Selected",
        description: "Please select a role for this election.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    if (proposal.electionCandidates.length < 2) {
      toast({
        title: "Not Enough Candidates",
        description: "An election needs at least 2 candidates.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    // Validate all candidate addresses
    for (const candidate of proposal.electionCandidates) {
      if (!candidate.address || !utils.isAddress(candidate.address)) {
        toast({
          title: "Invalid Candidate Address",
          description: `"${candidate.name || 'Unnamed'}" has an invalid address.`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }
      if (!candidate.name || candidate.name.trim() === '') {
        toast({
          title: "Missing Candidate Name",
          description: "All candidates must have a name.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }
    }

    return true;
  }, [proposal.electionRoleId, proposal.electionCandidates, toast]);

  const buildProposalData = useCallback((eligibilityModuleAddress) => {
    let numOptions;
    let batches = [];
    let optionNames = [];

    if (proposal.type === "transferFunds") {
      const transferCall = {
        target: proposal.transferAddress,
        value: utils.parseEther(proposal.transferAmount).toString(),
        data: "0x",
      };

      batches = [
        [transferCall], // Yes wins: execute transfer
        [],             // No wins: do nothing
      ];
      numOptions = 2;
      optionNames = ["Yes", "No"];
    } else if (proposal.type === "election") {
      // Election proposal - each candidate is an option
      // When they win, the execution batch mints the role to them
      numOptions = proposal.electionCandidates.length;
      optionNames = proposal.electionCandidates.map(c => c.name);

      // Build execution batch for each candidate winning
      // Uses mintHatToAddress(uint256 hatId, address wearer) on EligibilityModule
      const iface = new utils.Interface([
        "function mintHatToAddress(uint256 hatId, address wearer)"
      ]);

      batches = proposal.electionCandidates.map(candidate => {
        const mintCall = {
          target: eligibilityModuleAddress,
          value: "0",
          data: iface.encodeFunctionData("mintHatToAddress", [
            proposal.electionRoleId,
            candidate.address
          ]),
        };
        return [mintCall];
      });
    } else {
      numOptions = proposal.options?.length || 2;
      optionNames = proposal.options || [];
      batches = [];
    }

    return { numOptions, batches, optionNames };
  }, [proposal]);

  const handleSubmit = useCallback(async (eligibilityModuleAddress) => {
    setLoadingSubmit(true);

    try {
      if (proposal.type === "transferFunds" && !validateTransferProposal()) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "election" && !validateElectionProposal()) {
        setLoadingSubmit(false);
        return;
      }

      const { numOptions, batches, optionNames } = buildProposalData(eligibilityModuleAddress);

      await onSubmit({
        name: proposal.name,
        description: proposal.description,
        time: proposal.time,
        numOptions,
        batches,
        optionNames,
        type: proposal.type,
        transferAddress: proposal.transferAddress,
        transferAmount: proposal.transferAmount,
        electionRoleId: proposal.electionRoleId,
        electionCandidates: proposal.electionCandidates,
        // Voting restrictions
        hatIds: proposal.isRestricted ? proposal.restrictedHatIds : [],
      });

      setLoadingSubmit(false);
      resetForm();

      let successDescription;
      if (proposal.type === "transferFunds") {
        successDescription = `Transfer proposal created. If "Yes" wins, ${proposal.transferAmount} ETH will be sent to ${proposal.transferAddress.slice(0, 6)}...${proposal.transferAddress.slice(-4)}`;
      } else if (proposal.type === "election") {
        successDescription = `Election created with ${proposal.electionCandidates.length} candidates. The winner will receive the role automatically.`;
      } else {
        successDescription = "Your proposal has been created successfully.";
      }

      toast({
        title: "Proposal Created",
        description: successDescription,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      return true;
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
      return false;
    }
  }, [proposal, validateTransferProposal, validateElectionProposal, buildProposalData, onSubmit, resetForm, toast]);

  return {
    proposal,
    loadingSubmit,
    handleInputChange,
    handleOptionsChange,
    handleProposalTypeChange,
    handleTransferAddressChange,
    handleTransferAmountChange,
    handleElectionRoleChange,
    handleCandidatesChange,
    addCandidate,
    removeCandidate,
    handleRestrictedToggle,
    handleRestrictedRolesChange,
    toggleRestrictedRole,
    handleSubmit,
    resetForm,
  };
}

export default useProposalForm;
