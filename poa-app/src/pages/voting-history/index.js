import React, { useState, useMemo, useCallback } from "react";
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
  Tabs,
  TabList,
  Tab,
  Center,
  Spinner,
  useDisclosure,
  useBreakpointValue,
} from "@chakra-ui/react";
import { SearchIcon, ArrowBackIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";

import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { usePOContext } from "@/context/POContext";
import { useVotingContext } from "@/context/VotingContext";
import HistoryCard from "@/components/voting/HistoryCard";
import EmptyState from "@/components/voting/EmptyState";
import CompletedPollModal from "@/templateComponents/studentOrgDAO/voting/CompletedPollModal";

const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backdropFilter: "blur(20px)",
  backgroundColor: "rgba(0, 0, 0, .8)",
  boxShadow: "inset 0 0 15px rgba(148, 115, 220, 0.15)",
  border: "1px solid rgba(148, 115, 220, 0.2)",
};

const ITEMS_PER_PAGE = 12;

const VotingHistoryPage = () => {
  const router = useRouter();
  const { userDAO } = router.query;

  // Context data
  const { poContextLoading } = usePOContext();
  const {
    democracyVotingCompleted,
    hybridVotingCompleted,
    votingType: PTVoteType,
  } = useVotingContext();

  // Local state
  const [selectedTab, setSelectedTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Modal state
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedPoll, setSelectedPoll] = useState(null);

  // Responsive values
  const headingSize = useBreakpointValue({ base: "lg", md: "xl" });
  const containerPadding = useBreakpointValue({ base: 4, md: 6, lg: 8 });
  const filterDirection = useBreakpointValue({ base: "column", md: "row" });

  // Get current proposals based on tab
  const currentProposals = useMemo(() => {
    return selectedTab === 0 ? democracyVotingCompleted : hybridVotingCompleted;
  }, [selectedTab, democracyVotingCompleted, hybridVotingCompleted]);

  // Filter and sort proposals
  const processedProposals = useMemo(() => {
    let result = [...(currentProposals || [])];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter === "valid") {
      result = result.filter((p) => p.isValid !== false);
    } else if (statusFilter === "invalid") {
      result = result.filter((p) => p.isValid === false);
    }

    // Sort
    if (sortOrder === "newest") {
      result.sort(
        (a, b) => parseInt(b.endTimestamp || 0) - parseInt(a.endTimestamp || 0)
      );
    } else if (sortOrder === "oldest") {
      result.sort(
        (a, b) => parseInt(a.endTimestamp || 0) - parseInt(b.endTimestamp || 0)
      );
    } else if (sortOrder === "votes") {
      result.sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0));
    }

    return result;
  }, [currentProposals, searchQuery, statusFilter, sortOrder]);

  // Displayed proposals (paginated)
  const displayedProposals = useMemo(() => {
    return processedProposals.slice(0, displayCount);
  }, [processedProposals, displayCount]);

  const hasMore = displayCount < processedProposals.length;
  const totalCount = processedProposals.length;

  // Handlers
  const handleBackClick = useCallback(() => {
    router.push(`/voting?userDAO=${userDAO}`);
  }, [router, userDAO]);

  const handleTabChange = useCallback((index) => {
    setSelectedTab(index);
    setDisplayCount(ITEMS_PER_PAGE);
  }, []);

  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
    setDisplayCount(ITEMS_PER_PAGE);
  }, []);

  const handleStatusChange = useCallback((e) => {
    setStatusFilter(e.target.value);
    setDisplayCount(ITEMS_PER_PAGE);
  }, []);

  const handleSortChange = useCallback((e) => {
    setSortOrder(e.target.value);
    setDisplayCount(ITEMS_PER_PAGE);
  }, []);

  const handleLoadMore = useCallback(() => {
    setIsLoadingMore(true);
    // Simulate async loading for smooth UX
    setTimeout(() => {
      setDisplayCount((prev) => prev + ITEMS_PER_PAGE);
      setIsLoadingMore(false);
    }, 300);
  }, []);

  const handlePollClick = useCallback(
    (proposal) => {
      setSelectedPoll(proposal);
      onOpen();
    },
    [onOpen]
  );

  const handleModalClose = useCallback(() => {
    onClose();
    setSelectedPoll(null);
  }, [onClose]);

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setSortOrder("newest");
    setDisplayCount(ITEMS_PER_PAGE);
  }, []);

  const hasActiveFilters =
    searchQuery.trim() || statusFilter !== "all" || sortOrder !== "newest";

  // Tab labels match main voting page (VotingTabs component)
  const getVotingTypeLabel = (index) => {
    return index === 0 ? "Democracy" : PTVoteType;
  };

  if (poContextLoading) {
    return (
      <>
        <Navbar />
        <Center height="90vh">
          <Spinner size="xl" color="purple.400" />
        </Center>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <Box position="relative" w="100%" minH="100vh" p={containerPadding}>
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
                _hover={{
                  bg: "rgba(148, 115, 220, 0.2)",
                  transform: "translateX(-3px)",
                }}
                transition="all 0.2s ease"
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
                <Heading
                  as="h1"
                  size={headingSize}
                  color="white"
                  fontWeight="bold"
                  letterSpacing="wide"
                >
                  Voting History
                </Heading>
              </Box>
            </Flex>

            {/* Tabs */}
            <Box
              position="relative"
              borderRadius="3xl"
              p={{ base: 3, md: 6 }}
              zIndex={0}
            >
              <Box
                style={glassLayerStyle}
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                borderRadius="inherit"
                zIndex={-1}
              />
              <Tabs
                index={selectedTab}
                onChange={handleTabChange}
                variant="soft-rounded"
                isFitted
              >
                <TabList gap={{ base: 2, md: 4 }}>
                  <Tab
                    fontSize={{ base: "md", sm: "xl", md: "2xl" }}
                    fontWeight="extrabold"
                    color="rgba(333, 333, 333, 1)"
                    _selected={{
                      backgroundColor: "rgba(148, 115, 220, 0.6)",
                      color: "white",
                      transform: "translateY(-2px)",
                      boxShadow: "0 4px 12px rgba(148, 115, 220, 0.4)",
                    }}
                    _hover={{
                      backgroundColor: "rgba(148, 115, 220, 0.3)",
                    }}
                    borderRadius="xl"
                    py={{ base: 2, md: 4 }}
                    px={{ base: 2, md: 4 }}
                    transition="all 0.3s ease"
                  >
                    {getVotingTypeLabel(0)}
                  </Tab>
                  <Tab
                    fontSize={{ base: "md", sm: "xl", md: "2xl" }}
                    fontWeight="extrabold"
                    color="rgba(333, 333, 333, 1)"
                    _selected={{
                      backgroundColor: "rgba(148, 115, 220, 0.6)",
                      color: "white",
                      transform: "translateY(-2px)",
                      boxShadow: "0 4px 12px rgba(148, 115, 220, 0.4)",
                    }}
                    _hover={{
                      backgroundColor: "rgba(148, 115, 220, 0.3)",
                    }}
                    borderRadius="xl"
                    py={{ base: 2, md: 4 }}
                    px={{ base: 2, md: 4 }}
                    transition="all 0.3s ease"
                  >
                    {getVotingTypeLabel(1)}
                  </Tab>
                </TabList>
              </Tabs>
            </Box>

            {/* Filters */}
            <Box
              position="relative"
              borderRadius="3xl"
              p={{ base: 4, md: 6 }}
              zIndex={0}
              boxShadow="lg"
            >
              <Box
                style={glassLayerStyle}
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                borderRadius="inherit"
                zIndex={-1}
              />
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
                      _placeholder={{ color: "gray.500" }}
                      _focus={{
                        borderColor: "rgba(148, 115, 220, 0.6)",
                        boxShadow: "0 0 0 1px rgba(148, 115, 220, 0.4)",
                      }}
                      _hover={{
                        borderColor: "rgba(148, 115, 220, 0.4)",
                      }}
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
                      _focus={{
                        borderColor: "rgba(148, 115, 220, 0.6)",
                      }}
                      iconColor="purple.400"
                      minW="150px"
                      flex={{ base: "1", md: "0 0 auto" }}
                    >
                      <option style={{ background: "#1a1a2e" }} value="all">
                        All Status
                      </option>
                      <option style={{ background: "#1a1a2e" }} value="valid">
                        Valid (Had Winner)
                      </option>
                      <option style={{ background: "#1a1a2e" }} value="invalid">
                        Invalid (No Quorum)
                      </option>
                    </Select>

                    <Select
                      value={sortOrder}
                      onChange={handleSortChange}
                      bg="rgba(0, 0, 0, 0.4)"
                      border="1px solid rgba(148, 115, 220, 0.3)"
                      borderRadius="xl"
                      color="white"
                      _focus={{
                        borderColor: "rgba(148, 115, 220, 0.6)",
                      }}
                      iconColor="purple.400"
                      minW="150px"
                      flex={{ base: "1", md: "0 0 auto" }}
                    >
                      <option style={{ background: "#1a1a2e" }} value="newest">
                        Newest First
                      </option>
                      <option style={{ background: "#1a1a2e" }} value="oldest">
                        Oldest First
                      </option>
                      <option style={{ background: "#1a1a2e" }} value="votes">
                        Most Votes
                      </option>
                    </Select>

                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        colorScheme="purple"
                        size="sm"
                        onClick={handleClearFilters}
                        _hover={{
                          bg: "rgba(148, 115, 220, 0.2)",
                        }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </HStack>
                </Flex>

                {/* Results count */}
                <Text color="gray.400" fontSize="sm">
                  Showing {displayedProposals.length} of {totalCount} proposals
                </Text>
              </VStack>
            </Box>

            {/* Grid of cards */}
            <Box
              position="relative"
              borderRadius="2xl"
              overflow="hidden"
              p={{ base: 4, md: 6 }}
              minH="400px"
            >
              <Box style={glassLayerStyle} />

              {displayedProposals.length > 0 ? (
                <VStack spacing={6}>
                  <SimpleGrid
                    columns={{ base: 1, sm: 1, md: 2, lg: 3, xl: 4 }}
                    spacing={4}
                    w="100%"
                    justifyItems="center"
                  >
                    {displayedProposals.map((proposal, index) => (
                      <Box
                        key={proposal.id || index}
                        w="100%"
                        display="flex"
                        justifyContent="center"
                        sx={{
                          animation: `fadeInUp 0.3s ease-out ${index * 0.03}s both`,
                          "@keyframes fadeInUp": {
                            from: {
                              opacity: 0,
                              transform: "translateY(20px)",
                            },
                            to: {
                              opacity: 1,
                              transform: "translateY(0)",
                            },
                          },
                        }}
                      >
                        <HistoryCard
                          proposal={proposal}
                          onPollClick={handlePollClick}
                        />
                      </Box>
                    ))}
                  </SimpleGrid>

                  {/* Load More button */}
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
                      _hover={{
                        bg: "rgba(148, 115, 220, 0.2)",
                        transform: "translateY(-2px)",
                      }}
                      transition="all 0.3s ease"
                    >
                      Load More ({processedProposals.length - displayCount} remaining)
                    </Button>
                  )}
                </VStack>
              ) : (
                <Center py={12}>
                  {hasActiveFilters ? (
                    <VStack spacing={4}>
                      <Text color="gray.400" fontSize="lg">
                        No proposals match your filters
                      </Text>
                      <Button
                        variant="ghost"
                        colorScheme="purple"
                        onClick={handleClearFilters}
                      >
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

      {/* Completed Poll Modal - skipRedirect keeps user on history page */}
      <CompletedPollModal
        isOpen={isOpen}
        onClose={handleModalClose}
        selectedPoll={selectedPoll}
        voteType={selectedTab === 0 ? "Direct Democracy" : PTVoteType}
        skipRedirect
      />
    </>
  );
};

export default VotingHistoryPage;
