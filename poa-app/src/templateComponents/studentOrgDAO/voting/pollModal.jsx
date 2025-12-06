import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Button,
  Text,
  VStack,
  HStack,
  Radio,
  RadioGroup,
  Alert,
  AlertIcon,
  Switch,
  FormControl,
  FormLabel,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Box,
} from "@chakra-ui/react";
import { ethers } from "ethers";
import CountDown from "./countDown";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";


const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backdropFilter: "blur(9px)",
  backgroundColor: "rgba(33, 33, 33, 0.97)",
};

const PollModal = ({
  onOpen,
  isOpen,
  onClose,
  selectedPoll,
  handleVote,
  contractAddress,
  loadingVote,
  selectedOption,
  setSelectedOption,
}) => {
  const router = useRouter();
  const { userDAO } = router.query;
  const { address } = useAccount();

  // Weighted voting state (for Hybrid voting)
  const [isWeightedMode, setIsWeightedMode] = useState(false);
  const [voteWeights, setVoteWeights] = useState({});

  // Calculate remaining weight to distribute
  const remainingWeight = useMemo(() => {
    const used = Object.values(voteWeights).reduce((sum, w) => sum + w, 0);
    return 100 - used;
  }, [voteWeights]);

  // Check if user has already voted
  const hasVoted = useMemo(() => {
    if (!address || !selectedPoll?.votes) return false;
    return selectedPoll.votes.some(
      v => v.voter?.toLowerCase() === address.toLowerCase()
    );
  }, [address, selectedPoll?.votes]);

  // Reset weighted state when modal opens with new poll
  useEffect(() => {
    setIsWeightedMode(false);
    setVoteWeights({});
    setSelectedOption("");
  }, [selectedPoll?.id]);

  const handleModalClose = () => {
    onClose();
    router.push(`/voting/?userDAO=${userDAO}`);
  };

  const handleWeightChange = (optionIndex, newValue) => {
    const currentWeight = voteWeights[optionIndex] || 0;
    const maxAllowed = remainingWeight + currentWeight;
    const clampedValue = Math.min(newValue, maxAllowed);

    setVoteWeights(prev => {
      const updated = { ...prev };
      if (clampedValue > 0) {
        updated[optionIndex] = clampedValue;
      } else {
        delete updated[optionIndex];
      }
      return updated;
    });
  };

  const vote = () => {
    let optionIndices, weights;

    if (isWeightedMode) {
      // Weighted voting - get all options with weights
      optionIndices = Object.keys(voteWeights).map(k => parseInt(k));
      weights = Object.values(voteWeights);

      // Validate total is 100
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      if (totalWeight !== 100) {
        alert("Weights must sum to 100%");
        return;
      }
    } else {
      // Single option voting
      const selectedOptionIndex = parseInt(selectedOption);
      optionIndices = [selectedOptionIndex];
      weights = [100];
    }

    handleModalClose();

    // In POP subgraph, id format is "contractAddress-proposalId"
    // Use proposalId directly if available, otherwise extract from id
    let newPollId = selectedPoll.proposalId || selectedPoll.id.split("-")[1];

    handleVote(contractAddress, newPollId, optionIndices, weights);
  };

  // Check if vote is valid
  const isVoteValid = useMemo(() => {
    if (isWeightedMode) {
      const totalWeight = Object.values(voteWeights).reduce((sum, w) => sum + w, 0);
      return totalWeight === 100;
    }
    return selectedOption !== "";
  }, [isWeightedMode, voteWeights, selectedOption]);

  return (
    <Modal onOpen={onOpen} isOpen={isOpen} onClose={handleModalClose}>
      <ModalOverlay />
      <ModalContent
        alignItems="center"
        justifyContent="center"
        borderRadius="3xl"
        boxShadow="lg"
        display="flex"
        w="100%"
        maxWidth="40%"
        bg="transparent"
        position="relative"
        p={4}
        zIndex={1}
        mt="10%"
        color="ghostwhite"
      >
        <div className="glass" style={glassLayerStyle} />
        <ModalHeader
          color="rgba(333, 333, 333, 1)"
          fontWeight={"extrabold"}
          fontSize={"2xl"}
        >
          {selectedPoll?.title}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={6}>
            {/* Description Section */}
            <VStack ml="6" mr="6" spacing={2} alignItems="start">
              <Text color="rgba(333, 333, 333, 1)" fontSize="md">
                {selectedPoll?.description}
              </Text>
            </VStack>

            <CountDown
              duration={
                parseInt(selectedPoll?.endTimestamp || 0) -
                Math.floor(Date.now() / 1000)
              }
            />

            {/* Already voted alert */}
            {hasVoted && (
              <Alert status="info" borderRadius="md" bg="rgba(66, 153, 225, 0.15)">
                <AlertIcon color="blue.300" />
                <Text fontSize="sm" color="gray.300">
                  You have already voted on this proposal.
                </Text>
              </Alert>
            )}

            {/* Weighted voting toggle (only for Hybrid) */}
            {selectedPoll?.type === "Hybrid" && !hasVoted && (
              <FormControl display="flex" alignItems="center" justifyContent="center">
                <FormLabel htmlFor="weighted-mode" mb="0" color="gray.300" fontSize="sm">
                  Split vote across options
                </FormLabel>
                <Switch
                  id="weighted-mode"
                  isChecked={isWeightedMode}
                  onChange={(e) => {
                    setIsWeightedMode(e.target.checked);
                    setVoteWeights({});
                    setSelectedOption("");
                  }}
                  colorScheme="purple"
                />
              </FormControl>
            )}

            {/* Voting Options Section */}
            <VStack color="rgba(333, 333, 333, 1)" spacing={4} w="100%">
              {isWeightedMode ? (
                // Weighted voting mode - sliders for each option
                <VStack spacing={4} w="100%" px={4}>
                  {selectedPoll?.options?.map((option, index) => (
                    <Box key={index} w="100%">
                      <HStack justify="space-between" mb={1}>
                        <Text fontSize="sm" fontWeight="medium">
                          {option.name}
                        </Text>
                        <Text fontSize="sm" fontWeight="bold" color="purple.300">
                          {voteWeights[index] || 0}%
                        </Text>
                      </HStack>
                      <Slider
                        value={voteWeights[index] || 0}
                        min={0}
                        max={100}
                        step={5}
                        onChange={(val) => handleWeightChange(index, val)}
                        colorScheme="purple"
                      >
                        <SliderTrack bg="gray.600">
                          <SliderFilledTrack />
                        </SliderTrack>
                        <SliderThumb boxSize={4} />
                      </Slider>
                    </Box>
                  ))}
                  <Text
                    fontSize="sm"
                    fontWeight="bold"
                    color={remainingWeight === 0 ? "green.400" : "orange.400"}
                  >
                    {remainingWeight === 0
                      ? "✓ All 100% allocated"
                      : `Remaining: ${remainingWeight}%`}
                  </Text>
                </VStack>
              ) : (
                // Simple single-option selection
                <RadioGroup onChange={setSelectedOption} value={selectedOption}>
                  <VStack align="flex-start">
                    {selectedPoll?.options?.map((option, index) => (
                      <Radio size="lg" key={index} value={String(index)}>
                        {option.name}{" "}
                        {selectedPoll.type === "Hybrid" ? (
                          `(${option.currentPercentage || 0}%)`
                        ) : (
                          `(${option.votes || 0} votes)`
                        )}
                      </Radio>
                    ))}
                  </VStack>
                </RadioGroup>
              )}
            </VStack>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button
            colorScheme="purple"
            onClick={vote}
            mr={3}
            isLoading={loadingVote}
            loadingText="Handling Vote"
            isDisabled={hasVoted || !isVoteValid}
          >
            {hasVoted ? "Already Voted" : "Vote"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default PollModal;
