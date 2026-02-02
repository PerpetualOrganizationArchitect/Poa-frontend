import React from "react";
import {
  Heading,
  Box,
  Flex,
  SimpleGrid,
  Button,
  useBreakpointValue
} from "@chakra-ui/react";
import { ArrowForwardIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";
import HistoryCard from "./HistoryCard";
import EmptyState from "./EmptyState";

const VotingHistoryPreview = ({
  completedProposals = [],
  onPollClick,
  maxItems = 3,
}) => {
  const router = useRouter();
  const { userDAO } = router.query;

  const headingSize = useBreakpointValue({ base: "xl", md: "2xl" });

  const displayedProposals = completedProposals.slice(0, maxItems);
  const hasMoreItems = completedProposals.length > maxItems;

  const getColumnCount = (count) => {
    if (count === 1) return { base: 1 };
    if (count === 2) return { base: 1, md: 2 };
    return { base: 1, md: 2, lg: 3 };
  };

  const handleViewAllClick = () => {
    router.push(`/voting-history?userDAO=${userDAO}`);
  };

  return (
    <Box w="100%" mt={{ base: 4, md: 6 }}>
      <Flex
        justify="space-between"
        align="center"
        mb={{ base: 3, md: 4 }}
        px={2}
        flexWrap="wrap"
        gap={2}
      >
        <Heading
          color="rgba(333, 333, 333, 1)"
          fontSize={headingSize}
        >
          Voting History
        </Heading>

        {hasMoreItems && (
          <Button
            rightIcon={<ArrowForwardIcon />}
            variant="ghost"
            colorScheme="purple"
            fontWeight="semibold"
            fontSize={{ base: "sm", md: "md" }}
            _hover={{
              bg: "rgba(148, 115, 220, 0.2)",
              transform: "translateX(4px)",
            }}
            _active={{
              bg: "rgba(148, 115, 220, 0.3)",
            }}
            transition="all 0.3s ease"
            onClick={handleViewAllClick}
          >
            View All History
          </Button>
        )}
      </Flex>

      <Flex direction="column" w="100%" align="center">
        {displayedProposals.length > 0 ? (
          <SimpleGrid
            columns={getColumnCount(displayedProposals.length)}
            spacing={4}
            w="100%"
            justifyItems="center"
            justifyContent="center"
            maxW="1200px"
            mx="auto"
          >
            {displayedProposals.map((proposal, index) => (
              <Flex w="100%" key={proposal.id || index} justify="center">
                <HistoryCard
                  proposal={proposal}
                  onPollClick={onPollClick}
                />
              </Flex>
            ))}
          </SimpleGrid>
        ) : (
          <EmptyState text="No Voting History" />
        )}
      </Flex>
    </Box>
  );
};

export default VotingHistoryPreview;
