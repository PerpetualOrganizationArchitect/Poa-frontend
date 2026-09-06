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
import CommunityLoadingState from "@/components/shared/CommunityLoadingState";
import { SearchIcon, ArrowBackIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";

import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { usePOContext } from "@/context/POContext";
import { useVotingContext } from "@/context/VotingContext";
import { useOrgTheme, useVoteLanes } from "@/hooks";
import { usePollNavigation } from "@/hooks/usePollNavigation";
import { useVoteActions } from "@/hooks/useVoteActions";
import { useOrgName } from "@/hooks/useOrgName";
import EmptyState from "@/components/voting/EmptyState";
import { ProposalCard } from "@/components/voting/ProposalCard";
import { PollDetail } from "@/components/voting/PollDetail";
import { useOrgGate } from "@/components/shared/OrgDeadEnd";
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
  const orgGate = useOrgGate();

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
    resolveMissingPoll,
    loadMoreProposals,
    loadingMoreProposals,
    hasMoreProposals,
  } = useVotingContext();

  // The archive shows completed proposals from the shared feed.
  const { all } = useVoteLanes();
  const completed = useMemo(() => all.filter((p) => !p.isOngoing), [all]);

  // Local state
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);

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
    resolveMissingPoll,
  });

  // The archive lists completed votes, but its PollDetail is not read-only: a
  // `?poll=` deep link resolves against the ongoing arrays too, and a
  // still-Active expired proposal can surface here. Both handlers are wired for
  // the same reason — a ballot or a "Count the votes" button with no handler
  // behind it would report success without sending a transaction.
  const { handleVote, handleFinalize } = useVoteActions(votingTypeSelected);

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

  // Two kinds of "more": rows we already hold but haven't rendered, and older
  // proposals still sitting on the server outside the query's page window.
  const hasLocalMore = displayCount < processedProposals.length;
  const hasMore = hasLocalMore || hasMoreProposals;
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

  // Render what we already have first; only go back to the subgraph once the
  // local list is exhausted. `loadMoreProposals` widens the shared pool, so the
  // newly fetched votes flow through the same transform and land in this list.
  const handleLoadMore = useCallback(async () => {
    if (hasLocalMore) {
      setDisplayCount((prev) => prev + ITEMS_PER_PAGE);
      return;
    }
    // `addedCompleted`, not `added`: a page of still-open votes grows the pool
    // but not the archive, and bumping the window then would show nothing.
    const { addedCompleted } = await loadMoreProposals();
    if (addedCompleted > 0) setDisplayCount((prev) => prev + ITEMS_PER_PAGE);
  }, [hasLocalMore, loadMoreProposals]);

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setSortOrder("newest");
    setFilter("all");
    resetPage();
  }, []);

  const hasActiveFilters =
    searchQuery.trim() || statusFilter !== "all" || sortOrder !== "newest" || filter !== "all";

  const seoHead = (
    <SEOHead
      title="Vote archive"
      description="View past votes and proposals."
      path="/votes"
      noIndex
    />
  );

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;

  if (poContextLoading) {
    return (
      <>
        {seoHead}
        <Navbar />
        <Center minH="90vh" background={pageBackground()}>
          <CommunityLoadingState label="Loading community decisions…" />
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
                      <option style={{ background: "#1a1a2e" }} value="invalid">Invalid (No Result)</option>
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
                      isLoading={loadingMoreProposals}
                      loadingText="Loading..."
                      borderRadius="xl"
                      px={8}
                      _hover={{ bg: "rgba(148, 115, 220, 0.2)", transform: "translateY(-2px)" }}
                      transition="transform 0.3s ease, background 0.3s ease"
                    >
                      {hasLocalMore
                        ? `Load More (${processedProposals.length - displayCount} remaining)`
                        : "Load older votes"}
                    </Button>
                  )}
                </VStack>
              ) : (
                <Center py={12}>
                  {hasActiveFilters ? (
                    <VStack spacing={4}>
                      <Text color="gray.300" fontSize="lg">No proposals match your filters</Text>
                      <HStack spacing={3}>
                        <Button variant="ghost" colorScheme="purple" onClick={handleClearFilters}>
                          Clear Filters
                        </Button>
                        {/* Search and filters only see what has been fetched, so
                            a miss here may just mean the match is older. */}
                        {hasMoreProposals && (
                          <Button
                            colorScheme="purple"
                            variant="outline"
                            onClick={handleLoadMore}
                            isLoading={loadingMoreProposals}
                            loadingText="Loading..."
                          >
                            Search older votes
                          </Button>
                        )}
                      </HStack>
                    </VStack>
                  ) : (
                    <VStack spacing={4}>
                      <EmptyState text="No Voting History" />
                      {/* An org whose newest 50 proposals are all still open has
                          an empty archive with older votes behind them — without
                          this there is no control to reach them. */}
                      {hasMoreProposals && (
                        <Button
                          colorScheme="purple"
                          variant="outline"
                          onClick={handleLoadMore}
                          isLoading={loadingMoreProposals}
                          loadingText="Loading..."
                          borderRadius="xl"
                        >
                          Load older votes
                        </Button>
                      )}
                    </VStack>
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
        onVote={handleVote}
        onFinalize={handleFinalize}
        contractAddress={getContractAddressForVotingType(
          directDemocracyVotingContractAddress,
          votingContractAddress
        )}
      />
    </>
  );
};

export default VotingHistoryPage;
