/**
 * /votes — the Vote archive.
 *
 * Wave 2: swaps the old Hybrid/Democracy tabs for the same [All | Binding |
 * Polls] filter chips as the board, renders the canonical ProposalCard, and
 * opens the same PollDetail via ?poll= (keeping userDAO). Search / sort /
 * load-more are preserved. Completed cards show results (policy: closed =
 * visible).
 */

import React, { useState, useMemo, useCallback } from "react";
import SEOHead from "@/components/common/SEOHead";
import {
  Box,
  Container,
  Heading,
  VStack,
  HStack,
  Flex,
  SimpleGrid,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Button,
  Text,
  IconButton,
  Center,
  useBreakpointValue,
} from "@chakra-ui/react";
import PulseLoader from "@/components/shared/PulseLoader";
import { SearchIcon, ArrowBackIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";

import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { usePOContext } from "@/context/POContext";
import { useVotingContext } from "@/context/VotingContext";
import { useOrgTheme, useVoteLanes } from "@/hooks";
import { usePollNavigation } from "@/hooks/usePollNavigation";
import { useOrgName } from "@/hooks/useOrgName";
import { useWeb3 } from "@/hooks";
import { VotingType } from "@/services/web3/domain/VotingService";
import EmptyState from "@/components/voting/EmptyState";
import { ProposalCard } from "@/components/voting/ProposalCard";
import { PollDetail } from "@/components/voting/PollDetail";
import { BINDING_BADGE, POLL_BADGE } from "@/config/votingVocabulary";

const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backgroundColor: "rgba(0, 0, 0, .85)",
  boxShadow: "inset 0 0 15px rgba(148, 115, 220, 0.15)",
  border: "1px solid rgba(148, 115, 220, 0.2)",
};

const AMETHYST = "#9473DC";
const ITEMS_PER_PAGE = 12;
const FILTERS = [
  { key: "all", label: "All" },
  { key: "binding", label: "Binding" },
  { key: "polls", label: "Polls" },
];

const VotingHistoryPage = () => {
  const router = useRouter();
  const userDAO = useOrgName();

  const {
    poContextLoading,
    poMembers,
    votingContractAddress,
    directDemocracyVotingContractAddress,
  } = usePOContext();
  const { pageBackground } = useOrgTheme();
  const {
    democracyVotingOngoing,
    democracyVotingCompleted,
    hybridVotingOngoing,
    hybridVotingCompleted,
    votingType: PTVoteType,
  } = useVotingContext();
  const { voting, executeWithNotification } = useWeb3();

  // The archive shows completed proposals from the shared feed.
  const { all } = useVoteLanes();
  const completed = useMemo(() => all.filter((p) => !p.isOngoing), [all]);

  // Local state
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Responsive values
  const headingSize = useBreakpointValue({ base: "lg", md: "xl" });
  const containerPadding = useBreakpointValue({ base: 4, md: 6, lg: 8 });
  const filterDirection = useBreakpointValue({ base: "column", md: "row" });

  // The same PollDetail surface as the board, driven by ?poll= + userDAO.
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
  });

  // PollDetail must render LIVE data — selectedPoll is a click-time snapshot;
  // optimistic votes / 30s polling refreshes only reach the context arrays.
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

  const processedProposals = useMemo(() => {
    let result = [...completed];

    if (filter === "binding") result = result.filter((p) => p.typeBadge === BINDING_BADGE);
    else if (filter === "polls") result = result.filter((p) => p.typeBadge === POLL_BADGE);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }

    if (statusFilter === "valid") {
      result = result.filter((p) => p.isValid !== false);
    } else if (statusFilter === "invalid") {
      result = result.filter((p) => p.isValid === false);
    }

    if (sortOrder === "newest") {
      result.sort((a, b) => parseInt(b.endTimestamp || 0) - parseInt(a.endTimestamp || 0));
    } else if (sortOrder === "oldest") {
      result.sort((a, b) => parseInt(a.endTimestamp || 0) - parseInt(b.endTimestamp || 0));
    } else if (sortOrder === "votes") {
      result.sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0));
    }

    return result;
  }, [completed, filter, searchQuery, statusFilter, sortOrder]);

  const displayedProposals = useMemo(
    () => processedProposals.slice(0, displayCount),
    [processedProposals, displayCount]
  );

  const hasMore = displayCount < processedProposals.length;
  const totalCount = processedProposals.length;

  const handleBackClick = useCallback(() => {
    router.push(`/voting?userDAO=${encodeURIComponent(userDAO)}`);
  }, [router, userDAO]);

  const resetPage = () => setDisplayCount(ITEMS_PER_PAGE);

  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
    resetPage();
  }, []);

  const handleStatusChange = useCallback((e) => {
    setStatusFilter(e.target.value);
    resetPage();
  }, []);

  const handleSortChange = useCallback((e) => {
    setSortOrder(e.target.value);
    resetPage();
  }, []);

  const handleLoadMore = useCallback(() => {
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayCount((prev) => prev + ITEMS_PER_PAGE);
      setIsLoadingMore(false);
    }, 300);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setSortOrder("newest");
    setFilter("all");
    resetPage();
  }, []);

  const hasActiveFilters =
    searchQuery.trim() || statusFilter !== "all" || sortOrder !== "newest" || filter !== "all";

  // Finalize ("Count the votes") — completed archive rarely needs it, but a
  // still-Active expired proposal can surface here; route it through PollDetail.
  const handleGetWinner = useCallback(async (contractAddress, proposalId, isHybrid = false) => {
    if (!voting) return { success: false };
    const type = isHybrid ? VotingType.HYBRID : VotingType.DIRECT_DEMOCRACY;
    return executeWithNotification(
      () => voting.announceWinner(type, contractAddress, proposalId),
      {
        pendingMessage: "Counting the votes...",
        successMessage: "Result recorded on-chain!",
        refreshEvent: "proposal:completed",
      }
    );
  }, [voting, executeWithNotification]);

  const seoHead = (
    <SEOHead
      title="Vote archive"
      description="View past votes and proposals."
      path="/votes"
      noIndex
    />
  );

  if (poContextLoading) {
    return (
      <>
        {seoHead}
        <Navbar />
        <Center height="90vh" background={pageBackground()}>
          <PulseLoader size="xl" color="purple.400" />
        </Center>
      </>
    );
  }

  return (
    <>
      {seoHead}
      <Navbar />
      <Box position="relative" w="100%" minH="100vh" p={containerPadding} background={pageBackground()}>
        <Container maxW="1400px" mx="auto">
          <VStack spacing={6} align="stretch">
            {/* Header with back button */}
            <Flex align="center" gap={4}>
              <IconButton
                aria-label="Back to Voting"
                icon={<ArrowBackIcon boxSize={5} />}
                variant="ghost"
                colorScheme="purple"
                borderRadius="full"
                size="lg"
                _hover={{ bg: "rgba(148, 115, 220, 0.2)", transform: "translateX(-3px)" }}
                transition="transform 0.2s ease, background 0.2s ease"
                onClick={handleBackClick}
              />
              <Box position="relative" borderRadius="xl" px={6} py={3} overflow="hidden">
                <Box
                  position="absolute"
                  inset={0}
                  borderRadius="inherit"
                  bg="rgba(0, 0, 0, 0.7)"
                  border="1px solid rgba(148, 115, 220, 0.3)"
                  zIndex={-1}
                />
                <Heading as="h1" size={headingSize} color="white" fontWeight="bold" letterSpacing="wide">
                  Vote archive
                </Heading>
              </Box>
            </Flex>

            {/* Filter chips [All | Binding | Polls] — dark track so the
                inactive labels stay readable on light org theme backgrounds
                (this row sits outside the glass panels). */}
            <HStack
              spacing={1}
              p={1}
              borderRadius="full"
              bg="blackAlpha.600"
              border="1px solid"
              borderColor="whiteAlpha.200"
              alignSelf="flex-start"
              role="tablist"
              aria-label="Filter votes"
            >
              {FILTERS.map((fchip) => {
                const active = filter === fchip.key;
                return (
                  <Button
                    key={fchip.key}
                    size="sm"
                    variant="ghost"
                    minH="40px"
                    px={5}
                    borderRadius="full"
                    role="tab"
                    aria-selected={active}
                    bg={active ? AMETHYST : "transparent"}
                    color={active ? "white" : "gray.200"}
                    fontWeight="700"
                    _hover={{ bg: active ? AMETHYST : "whiteAlpha.200" }}
                    onClick={() => {
                      setFilter(fchip.key);
                      resetPage();
                    }}
                  >
                    {fchip.label}
                  </Button>
                );
              })}
            </HStack>

            {/* Filters */}
            <Box position="relative" borderRadius="3xl" p={{ base: 4, md: 6 }} zIndex={0} boxShadow="lg">
              <Box style={glassLayerStyle} position="absolute" inset={0} borderRadius="inherit" zIndex={-1} />
              <VStack spacing={4} align="stretch">
                <Flex
                  direction={filterDirection}
                  gap={4}
                  align={{ base: "stretch", md: "center" }}
                  justify="space-between"
                  flexWrap="wrap"
                >
                  <InputGroup flex={{ base: "1", md: "0 1 350px" }} minW="200px">
                    <InputLeftElement pointerEvents="none">
                      <SearchIcon color="purple.300" />
                    </InputLeftElement>
                    <Input
                      placeholder="Search proposals..."
                      value={searchQuery}
                      onChange={handleSearchChange}
                      bg="rgba(0, 0, 0, 0.4)"
                      border="1px solid rgba(148, 115, 220, 0.3)"
                      borderRadius="xl"
                      color="white"
                      _placeholder={{ color: "gray.400" }}
                      _focus={{ borderColor: "rgba(148, 115, 220, 0.6)", boxShadow: "0 0 0 1px rgba(148, 115, 220, 0.4)" }}
                      _hover={{ borderColor: "rgba(148, 115, 220, 0.4)" }}
                    />
                  </InputGroup>

                  <HStack spacing={3} flexWrap="wrap" flex={{ base: "1", md: "0 1 auto" }}>
                    <Select
                      value={statusFilter}
                      onChange={handleStatusChange}
                      bg="rgba(0, 0, 0, 0.4)"
                      border="1px solid rgba(148, 115, 220, 0.3)"
                      borderRadius="xl"
                      color="white"
                      _focus={{ borderColor: "rgba(148, 115, 220, 0.6)" }}
                      iconColor="purple.400"
                      minW="150px"
                      flex={{ base: "1", md: "0 0 auto" }}
                    >
                      <option style={{ background: "#1a1a2e" }} value="all">All Status</option>
                      <option style={{ background: "#1a1a2e" }} value="valid">Valid (Had Winner)</option>
                      <option style={{ background: "#1a1a2e" }} value="invalid">Invalid (No Quorum)</option>
                    </Select>

                    <Select
                      value={sortOrder}
                      onChange={handleSortChange}
                      bg="rgba(0, 0, 0, 0.4)"
                      border="1px solid rgba(148, 115, 220, 0.3)"
                      borderRadius="xl"
                      color="white"
                      _focus={{ borderColor: "rgba(148, 115, 220, 0.6)" }}
                      iconColor="purple.400"
                      minW="150px"
                      flex={{ base: "1", md: "0 0 auto" }}
                    >
                      <option style={{ background: "#1a1a2e" }} value="newest">Newest First</option>
                      <option style={{ background: "#1a1a2e" }} value="oldest">Oldest First</option>
                      <option style={{ background: "#1a1a2e" }} value="votes">Most Votes</option>
                    </Select>

                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        colorScheme="purple"
                        size="sm"
                        onClick={handleClearFilters}
                        _hover={{ bg: "rgba(148, 115, 220, 0.2)" }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </HStack>
                </Flex>

                <Text color="gray.300" fontSize="sm">
                  Showing {displayedProposals.length} of {totalCount} proposals
                </Text>
              </VStack>
            </Box>

            {/* Grid of cards */}
            <Box position="relative" borderRadius="3xl" p={{ base: 4, md: 6 }} minH="400px" zIndex={0} boxShadow="lg">
              <Box style={glassLayerStyle} position="absolute" inset={0} borderRadius="inherit" zIndex={-1} />

              {displayedProposals.length > 0 ? (
                <VStack spacing={6}>
                  <SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing={4} w="100%">
                    {displayedProposals.map((proposal) => (
                      <ProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        typeBadge={proposal.typeBadge}
                        isEligible={proposal._eligible}
                        poMembers={poMembers}
                        onOpen={(p) => handlePollClick(p, !p.isOngoing)}
                        onFinalize={(p) => handlePollClick(p, false)}
                      />
                    ))}
                  </SimpleGrid>

                  {hasMore && (
                    <Button
                      colorScheme="purple"
                      variant="outline"
                      size="lg"
                      onClick={handleLoadMore}
                      isLoading={isLoadingMore}
                      loadingText="Loading..."
                      borderRadius="xl"
                      px={8}
                      _hover={{ bg: "rgba(148, 115, 220, 0.2)", transform: "translateY(-2px)" }}
                      transition="transform 0.3s ease, background 0.3s ease"
                    >
                      Load More ({processedProposals.length - displayCount} remaining)
                    </Button>
                  )}
                </VStack>
              ) : (
                <Center py={12}>
                  {hasActiveFilters ? (
                    <VStack spacing={4}>
                      <Text color="gray.300" fontSize="lg">No proposals match your filters</Text>
                      <Button variant="ghost" colorScheme="purple" onClick={handleClearFilters}>
                        Clear Filters
                      </Button>
                    </VStack>
                  ) : (
                    <EmptyState text="No Voting History" />
                  )}
                </Center>
              )}
            </Box>
          </VStack>
        </Container>
      </Box>

      {/* The same PollDetail surface as the board. */}
      <PollDetail
        poll={livePoll}
        isOpen={isDetailOpen}
        onClose={onDetailClose}
        onVote={undefined}
        onFinalize={handleGetWinner}
        contractAddress={getContractAddressForVotingType(
          directDemocracyVotingContractAddress,
          votingContractAddress
        )}
        votingTypeSelected={votingTypeSelected}
      />
    </>
  );
};

export default VotingHistoryPage;
