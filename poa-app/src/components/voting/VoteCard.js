import React from "react";
import { Box, Text, Button, HStack, VStack, Flex, useBreakpointValue } from "@chakra-ui/react";
import { TimeIcon } from "@chakra-ui/icons";
import { glassLayerWithShadowStyle } from '@/components/shared/glassStyles';
import CountDown from "@/templateComponents/studentOrgDAO/voting/countDown";

const VoteCard = ({
  proposal,
  showDetermineWinner,
  getWinner,
  calculateRemainingTime,
  onPollClick,
  contractAddress
}) => {
  // Use isExpired from proposal if available, fallback to showDetermineWinner
  const needsWinnerAnnouncement = proposal.isExpired || showDetermineWinner;
  // Use responsive sizing based on breakpoints
  const titleFontSize = useBreakpointValue({ base: "sm", sm: "md" });
  const cardHeight = useBreakpointValue({ base: "180px", sm: "200px" });
  const cardPadding = useBreakpointValue({ base: 3, sm: 4 });

  // Truncate description to first 100 characters
  const truncatedDescription = proposal.description
    ? proposal.description.length > 100
      ? proposal.description.substring(0, 100) + "..."
      : proposal.description
    : "";

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="space-between"
      borderRadius="2xl"
      boxShadow="lg"
      display="flex"
      w="100%"
      maxWidth={{ base: "320px", sm: "380px" }}
      bg="transparent"
      position="relative"
      color="rgba(333, 333, 333, 1)"
      p={cardPadding}
      zIndex={1}
      h={cardHeight}
      transition="all 0.3s ease"
      cursor="pointer"
      _hover={{
        transform: "translateY(-5px) scale(1.02)",
        boxShadow: "0 10px 20px rgba(148, 115, 220, 0.2)",
        "& .glass": {
          border: "1px solid rgba(148, 115, 220, 0.5)",
          boxShadow: "inset 0 0 20px rgba(148, 115, 220, 0.3)",
        }
      }}
      onClick={() => {
        if (!needsWinnerAnnouncement) {
          onPollClick(proposal);
        }
      }}
    >
      <Box
        className="glass"
        style={glassLayerWithShadowStyle}
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        borderRadius="inherit"
        zIndex={-1}
        transition="all 0.3s ease"
      />

      <VStack spacing={1} align="stretch" w="100%" h="100%" justify="space-between">
        {/* Title */}
        <Box>
          <Text
            fontSize={titleFontSize}
            fontWeight="extrabold"
            borderBottom="2px solid rgba(148, 115, 220, 0.5)"
            pb={1}
            textAlign="center"
            noOfLines={1}
            title={proposal.title}
          >
            {proposal.title}
          </Text>
        </Box>

        {/* Description preview */}
        {truncatedDescription && (
          <Text
            fontSize="sm"
            fontWeight="medium"
            color="gray.200"
            noOfLines={2}
            lineHeight="1.3"
            textAlign="center"
          >
            {truncatedDescription}
          </Text>
        )}

        {/* Time or Announce Winner button */}
        <Flex justify="center" align="center" py={2}>
          {needsWinnerAnnouncement ? (
            <Button
              colorScheme="purple"
              size="md"
              onClick={(e) => {
                e.stopPropagation();
                // Use proposalId (numeric ID for contract) not id (subgraph entity ID)
                getWinner(contractAddress, proposal.proposalId, proposal.type === 'Hybrid');
              }}
              bg="rgba(148, 115, 220, 0.3)"
              borderColor="rgba(148, 115, 220, 0.8)"
              border="1px solid"
              _hover={{ bg: "rgba(148, 115, 220, 0.5)" }}
              fontWeight="bold"
            >
              Announce Winner
            </Button>
          ) : (
            <HStack spacing={2} bg="rgba(148, 115, 220, 0.15)" px={4} py={2} borderRadius="lg">
              <TimeIcon color="purple.300" />
              <CountDown duration={calculateRemainingTime(proposal?.endTimestamp)} />
            </HStack>
          )}
        </Flex>

        {/* Voting Options - cleaner pill style */}
        <Box>
          <HStack spacing={2} flexWrap="wrap" justify="center">
            {proposal.options.slice(0, 4).map((option, index) => (
              <Box
                key={index}
                bg={index === 0 ? "rgba(148, 115, 220, 0.3)" : "rgba(100, 100, 100, 0.3)"}
                border="1px solid"
                borderColor={index === 0 ? "rgba(148, 115, 220, 0.6)" : "rgba(150, 150, 150, 0.4)"}
                px={3}
                py={1}
                borderRadius="full"
                fontSize="xs"
                fontWeight="medium"
                color={index === 0 ? "purple.200" : "gray.300"}
              >
                {option.name}
              </Box>
            ))}
            {proposal.options.length > 4 && (
              <Text fontSize="xs" color="gray.500">+{proposal.options.length - 4} more</Text>
            )}
          </HStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default VoteCard; 