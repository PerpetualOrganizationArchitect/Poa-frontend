/**
 * useProposalForm
 * Hook for managing proposal form state and submission
 */

import { useState, useCallback } from 'react';
import { useToast } from '@chakra-ui/react';
import { ethers } from 'ethers';

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

  const resetForm = useCallback(() => {
    setProposal(defaultProposal);
  }, []);

  const validateTransferProposal = useCallback(() => {
    if (!proposal.transferAddress || !ethers.isAddress(proposal.transferAddress)) {
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

  const buildProposalData = useCallback(() => {
    let numOptions;
    let batches = [];

    if (proposal.type === "transferFunds") {
      const transferCall = {
        target: proposal.transferAddress,
        value: ethers.parseEther(proposal.transferAmount).toString(),
        data: "0x",
      };

      batches = [
        [transferCall], // Yes wins: execute transfer
        [],             // No wins: do nothing
      ];
      numOptions = 2;
    } else {
      numOptions = proposal.options?.length || 2;
      batches = [];
    }

    return { numOptions, batches };
  }, [proposal]);

  const handleSubmit = useCallback(async () => {
    setLoadingSubmit(true);

    try {
      if (proposal.type === "transferFunds" && !validateTransferProposal()) {
        setLoadingSubmit(false);
        return;
      }

      const { numOptions, batches } = buildProposalData();

      await onSubmit({
        name: proposal.name,
        description: proposal.description,
        time: proposal.time,
        numOptions,
        batches,
        type: proposal.type,
        transferAddress: proposal.transferAddress,
        transferAmount: proposal.transferAmount,
      });

      setLoadingSubmit(false);
      resetForm();

      toast({
        title: "Proposal Created",
        description: proposal.type === "transferFunds"
          ? `Transfer proposal created. If "Yes" wins, ${proposal.transferAmount} ETH will be sent to ${proposal.transferAddress.slice(0, 6)}...${proposal.transferAddress.slice(-4)}`
          : "Your proposal has been created successfully.",
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
  }, [proposal, validateTransferProposal, buildProposalData, onSubmit, resetForm, toast]);

  return {
    proposal,
    loadingSubmit,
    handleInputChange,
    handleOptionsChange,
    handleProposalTypeChange,
    handleTransferAddressChange,
    handleTransferAmountChange,
    handleSubmit,
    resetForm,
  };
}

export default useProposalForm;
