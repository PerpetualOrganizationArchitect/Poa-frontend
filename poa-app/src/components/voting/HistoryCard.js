import React from "react";
import { Box, Text, Flex, VStack, HStack, Progress } from "@chakra-ui/react";
import { CheckCircleIcon, WarningIcon } from "@chakra-ui/icons";
import { glassLayerWithShadowStyle } from '@/components/shared/glassStyles';

const HistoryCard = ({ proposal, onPollClick }) => {
  const predefinedColors = [
    "#9B59B6", // Purple
    "#3498DB", // Blue
    "#2ECC71", // Green
    "#F1C40F", // Yellow
    "#E74C3C", // Red
  ];

  // Parse and normalize all vote counts
  const normalizedOptions = [];
  let totalCalculatedVotes = 0;

  if (proposal.options && Array.isArray(proposal.options)) {
    proposal.options.forEach((option, index) => {
      let voteCount = 0;

      try {
        if (option.votes !== undefined) {
          if (typeof option.votes === 'number') {
            voteCount = option.votes;
          } else if (typeof option.votes === 'string') {
            voteCount = parseInt(option.votes, 10) || 0;
          } else if (typeof option.votes === 'object') {
            if (option.votes && option.votes._hex) {
              voteCount = parseInt(option.votes._hex, 16) || 0;
            } else if (option.votes && typeof option.votes.toNumber === 'function') {
              try {
                voteCount = option.votes.toNumber() || 0;
              } catch (e) {
                voteCount = 0;
              }
            }
          }
        }
      } catch (error) {
        voteCount = 0;
      }

      normalizedOptions.push({
        ...option,
        normalizedVotes: voteCount,
        name: option.name || `Option ${index + 1}`,
      });

      totalCalculatedVotes += voteCount;
    });
  }

  const totalVotes = totalCalculatedVotes > 0
    ? totalCalculatedVotes
    : (proposal.totalVotes ? Number(proposal.totalVotes) : 1);

  // Create processed options array with percentages
  const processedOptions = normalizedOptions.map((option, index) => {
    const percentage = totalVotes > 0
      ? (option.normalizedVotes / totalVotes) * 100
      : 0;

    return {
      name: option.name,
      votes: option.normalizedVotes,
      percentage: percentage,
      color: predefinedColors[index % predefinedColors.length],
      isWinner: proposal.winningOption === index && proposal.isValid !== false,
    };
  });

  // Determine winner name
  let winnerName = "No Winner";
  let hasWinner = false;
  if (proposal.isValid !== false &&
      proposal.winningOption !== undefined &&
      proposal.winningOption !== null &&
      normalizedOptions[proposal.winningOption]) {
    winnerName = normalizedOptions[proposal.winningOption].name;
    hasWinner = true;
  }

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
      maxWidth="380px"
      bg="transparent"
      position="relative"
      color="rgba(333, 333, 333, 1)"
      p={4}
      zIndex={1}
      h="240px"
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
      onClick={() => onPollClick(proposal, true)}
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

      <VStack spacing={2} align="stretch" w="100%" h="100%">
        {/* Title */}
        <Box>
          <Text
            fontSize="md"
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
            fontSize="xs"
            color="gray.300"
            noOfLines={2}
            lineHeight="1.4"
            textAlign="center"
            px={1}
          >
            {truncatedDescription}
          </Text>
        )}

        {/* Results visualization */}
        <VStack spacing={1} flex="1" justify="center">
          {processedOptions.slice(0, 3).map((option, index) => (
            <HStack key={index} w="100%" spacing={2}>
              <Text
                fontSize="xs"
                color={option.isWinner ? "purple.300" : "gray.400"}
                fontWeight={option.isWinner ? "bold" : "normal"}
                w="70px"
                noOfLines={1}
              >
                {option.name}
              </Text>
              <Box flex="1">
                <Progress
                  value={option.percentage}
                  size="sm"
                  borderRadius="full"
                  bg="rgba(100, 100, 100, 0.3)"
                  sx={{
                    '& > div': {
                      background: option.isWinner
                        ? 'linear-gradient(90deg, rgba(148, 115, 220, 0.8), rgba(148, 115, 220, 1))'
                        : 'rgba(150, 150, 150, 0.5)',
                    }
                  }}
                />
              </Box>
              <Text fontSize="xs" color="gray.400" w="35px" textAlign="right">
                {option.percentage.toFixed(0)}%
              </Text>
            </HStack>
          ))}
          {processedOptions.length > 3 && (
            <Text fontSize="xs" color="gray.500">+{processedOptions.length - 3} more options</Text>
          )}
        </VStack>

        {/* Winner display */}
        <HStack justify="center" spacing={2} pt={1}>
          {hasWinner ? (
            <>
              <CheckCircleIcon color="green.400" boxSize={4} />
              <Text fontSize="sm" fontWeight="bold">
                Winner: <Text as="span" color="purple.300">{winnerName}</Text>
              </Text>
            </>
          ) : (
            <>
              <WarningIcon color="orange.400" boxSize={4} />
              <Text fontSize="sm" fontWeight="bold" color="orange.300">
                No Winner
              </Text>
            </>
          )}
        </HStack>
      </VStack>
    </Box>
  );
};

export default HistoryCard;
