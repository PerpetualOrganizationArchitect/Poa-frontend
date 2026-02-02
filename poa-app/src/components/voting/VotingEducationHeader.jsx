/**
 * VotingEducationHeader
 * Comprehensive educational header for the voting page that explains the hybrid voting system
 * using progressive disclosure and the "Two Voices" metaphor.
 *
 * Displays:
 * - User's actual voting power values
 * - Class weights from the contract
 * - Step-by-step explanation of how votes are calculated
 * - Visual representation of voting power breakdown
 */

import React, { useState } from "react";
import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Collapse,
  Button,
  useBreakpointValue,
  Tooltip,
  Badge,
  SimpleGrid,
  Divider,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Skeleton,
  keyframes,
} from "@chakra-ui/react";

// Breathing animation for official governance indicator
const breathe = keyframes`
  0%, 100% {
    box-shadow: 0 0 8px rgba(237, 137, 54, 0.3);
    border-color: rgba(237, 137, 54, 0.3);
  }
  50% {
    box-shadow: 0 0 16px rgba(237, 137, 54, 0.5);
    border-color: rgba(237, 137, 54, 0.5);
  }
`;
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import { useVotingPower, useRoleNames } from "@/hooks";
import { useUserContext } from "@/context/UserContext";
import { usePOContext } from "@/context/POContext";

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

/**
 * Formats a large number with appropriate suffix (K, M, etc.)
 */
const formatPowerNumber = (num) => {
  if (num === 0) return "0";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toFixed(0);
};

/**
 * Compact education dropdown for users without voting power
 */
const LearnMoreDropdown = ({ classWeights, classConfig }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { allRoles } = useRoleNames();
  const memberRole = allRoles?.[0]?.name || "Member";

  const democracyWeight = classWeights?.democracy ?? 50;
  const contributionWeight = classWeights?.contribution ?? 50;
  const isQuadratic = classConfig?.some(c => c.strategy === 'ERC20_BAL' && c.quadratic) ?? false;

  return (
    <Box w="100%" display="flex" flexDirection="column" alignItems="center">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(prev => !prev)}
        color="gray.400"
        _hover={{ color: "white", bg: "whiteAlpha.100" }}
        rightIcon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
        fontWeight="normal"
      >
        Learn more about hybrid voting
      </Button>

      <Collapse in={isExpanded} animateOpacity>
        <Box
          mt={4}
          p={{ base: 4, md: 5 }}
          bg="whiteAlpha.50"
          borderRadius="xl"
          border="1px solid"
          borderColor="whiteAlpha.100"
        >
          <VStack spacing={4} align="stretch">
            {/* Introduction */}
            <VStack align="start" spacing={2}>
              <Heading size="sm" color="white">
                Two Voices, One Decision
              </Heading>
              <Text fontSize="sm" color="gray.300">
                Hybrid voting combines the fairness of democracy with recognition for those who
                contribute the most. Every vote has two components that blend together.
              </Text>
            </VStack>

            <Divider borderColor="whiteAlpha.200" />

            {/* The Two Voices Explained */}
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              {/* Membership Voice */}
              <Box
                p={3}
                bg="rgba(128, 90, 213, 0.1)"
                borderRadius="lg"
                border="1px solid"
                borderColor="rgba(128, 90, 213, 0.3)"
              >
                <VStack align="start" spacing={2}>
                  <HStack>
                    <Box w="12px" h="12px" borderRadius="full" bg="purple.400" />
                    <Text fontWeight="bold" color="purple.300" fontSize="sm">
                      Membership Voice
                    </Text>
                    <Badge colorScheme="purple" variant="subtle" fontSize="2xs">
                      {democracyWeight}%
                    </Badge>
                  </HStack>
                  <Text fontSize="xs" color="gray.300">
                    As a {memberRole}, you receive <strong>100 base points</strong> — the same
                    as every other member. This ensures democratic equality.
                  </Text>
                </VStack>
              </Box>

              {/* Work Voice */}
              <Box
                p={3}
                bg="rgba(49, 130, 206, 0.1)"
                borderRadius="lg"
                border="1px solid"
                borderColor="rgba(49, 130, 206, 0.3)"
              >
                <VStack align="start" spacing={2}>
                  <HStack>
                    <Box w="12px" h="12px" borderRadius="full" bg="blue.400" />
                    <Text fontWeight="bold" color="blue.300" fontSize="sm">
                      Work Voice
                    </Text>
                    <Badge colorScheme="blue" variant="subtle" fontSize="2xs">
                      {contributionWeight}%
                    </Badge>
                  </HStack>
                  <Text fontSize="xs" color="gray.300">
                    Your participation tokens represent completed work. The more you contribute,
                    the more voting power you earn.
                    {isQuadratic && " Uses quadratic scaling for fairness."}
                  </Text>
                </VStack>
              </Box>
            </SimpleGrid>

            {/* Why Hybrid Voting - compact version */}
            <Box
              p={3}
              bg="linear-gradient(135deg, rgba(128, 90, 213, 0.1) 0%, rgba(49, 130, 206, 0.1) 100%)"
              borderRadius="lg"
              borderLeft="3px solid"
              borderColor="purple.400"
            >
              <VStack align="start" spacing={1}>
                <Text fontWeight="bold" color="white" fontSize="sm">
                  Why Hybrid Voting?
                </Text>
                <Text fontSize="xs" color="gray.300">
                  Every member has a meaningful voice while contributors earn greater influence.
                  No single person can dominate, and active participation is rewarded.
                </Text>
              </VStack>
            </Box>
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
};

/**
 * Visual component showing the "Two Voices" voting power breakdown
 * with actual numerical values and class weights
 */
const TwoVoicesBar = ({ membershipPower, contributionPower, classWeights, classConfig, isLoading, status, message, hasMemberRole }) => {
  const totalPower = membershipPower + contributionPower;
  const democracyWeight = classWeights?.democracy ?? 50;
  const contributionWeight = classWeights?.contribution ?? 50;

  // Determine if quadratic voting is enabled (strategy is string enum: 'DIRECT' or 'ERC20_BAL')
  const isQuadratic = classConfig?.some(c => c.strategy === 'ERC20_BAL' && c.quadratic) ?? false;

  // Debug output
  console.log('[TwoVoicesBar] Rendering with:', { membershipPower, contributionPower, totalPower, isLoading, status, hasMemberRole });

  // If loading, show skeleton
  if (isLoading) {
    return (
      <VStack spacing={3} w="100%" maxW="500px">
        <Skeleton height="20px" width="150px" />
        <Skeleton height="32px" width="100%" borderRadius="full" />
        <Skeleton height="16px" width="200px" />
      </VStack>
    );
  }

  // Don't show the voting power bar if user has no voting power
  // (LearnMoreDropdown is now shown separately for all users)
  if (totalPower === 0 || !hasMemberRole) {
    return null;
  }

  return (
    <VStack spacing={3} w="100%" maxW="500px">
      <Text fontSize="sm" color="gray.300" fontWeight="semibold">
        Your Personal Voting Power
      </Text>

      {/* The two-voice bar with actual percentages */}
      <Box w="100%" position="relative">
        <Flex w="100%" h="36px" borderRadius="full" overflow="hidden" bg="gray.700" boxShadow="inner">
          {/* Membership Voice */}
          <Tooltip
            label={
              <VStack spacing={1} align="start" p={1}>
                <Text fontWeight="bold">Membership Voice</Text>
                <Text fontSize="xs">Your base power: {membershipPower} points</Text>
                <Text fontSize="xs">Weight in final decision: {democracyWeight}%</Text>
                <Text fontSize="xs" color="gray.300" fontStyle="italic">
                  Equal for all members
                </Text>
              </VStack>
            }
            placement="top"
            hasArrow
            bg="gray.700"
            p={2}
          >
            <Flex
              w={`${democracyWeight}%`}
              h="100%"
              bg="linear-gradient(90deg, #805AD5 0%, #9F7AEA 100%)"
              align="center"
              justify="center"
              cursor="help"
              transition="all 0.3s"
              _hover={{ filter: "brightness(1.15)" }}
              position="relative"
            >
              <VStack spacing={0}>
                <Text fontSize="sm" fontWeight="bold" color="white">
                  {democracyWeight}%
                </Text>
                <Text fontSize="2xs" color="whiteAlpha.800">
                  {membershipPower} pts
                </Text>
              </VStack>
            </Flex>
          </Tooltip>

          {/* Contribution Voice */}
          <Tooltip
            label={
              <VStack spacing={1} align="start" p={1}>
                <Text fontWeight="bold">Work Voice</Text>
                <Text fontSize="xs">Your contribution power: {formatPowerNumber(contributionPower)} points</Text>
                <Text fontSize="xs">Weight in final decision: {contributionWeight}%</Text>
                {isQuadratic && (
                  <Text fontSize="xs" color="blue.200" fontStyle="italic">
                    Quadratic voting: sqrt(tokens) × 100
                  </Text>
                )}
              </VStack>
            }
            placement="top"
            hasArrow
            bg="gray.700"
            p={2}
          >
            <Flex
              w={`${contributionWeight}%`}
              h="100%"
              bg="linear-gradient(90deg, #3182CE 0%, #63B3ED 100%)"
              align="center"
              justify="center"
              cursor="help"
              transition="all 0.3s"
              _hover={{ filter: "brightness(1.15)" }}
            >
              <VStack spacing={0}>
                <Text fontSize="sm" fontWeight="bold" color="white">
                  {contributionWeight}%
                </Text>
                <Text fontSize="2xs" color="whiteAlpha.800">
                  {formatPowerNumber(contributionPower)} pts
                </Text>
              </VStack>
            </Flex>
          </Tooltip>
        </Flex>
      </Box>

      {/* Legend with actual values */}
      <HStack spacing={6} justify="center" flexWrap="wrap">
        <HStack spacing={2}>
          <Box w="12px" h="12px" borderRadius="full" bg="purple.400" />
          <VStack spacing={0} align="start">
            <Text fontSize="xs" color="gray.300" fontWeight="medium">Membership</Text>
            <Text fontSize="2xs" color="gray.500">{membershipPower} pts × {democracyWeight}%</Text>
          </VStack>
        </HStack>
        <HStack spacing={2}>
          <Box w="12px" h="12px" borderRadius="full" bg="blue.400" />
          <VStack spacing={0} align="start">
            <Text fontSize="xs" color="gray.300" fontWeight="medium">Work</Text>
            <Text fontSize="2xs" color="gray.500">{formatPowerNumber(contributionPower)} pts × {contributionWeight}%</Text>
          </VStack>
        </HStack>
        {isQuadratic && (
          <Badge colorScheme="blue" variant="subtle" fontSize="2xs">
            Quadratic Voting
          </Badge>
        )}
      </HStack>
    </VStack>
  );
};

/**
 * Stats panel showing user's voting power metrics
 */
const VotingPowerStats = ({ membershipPower, contributionPower, classWeights, ptBalance, poMembers, orgStats }) => {
  const totalPower = membershipPower + contributionPower;
  const democracyWeight = classWeights?.democracy ?? 50;
  const contributionWeight = classWeights?.contribution ?? 50;

  return (
    <VStack spacing={4} w="100%" maxW="700px">
      {/* Main power breakdown */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} w="100%">
        <Stat textAlign="center">
          <StatLabel color="gray.400" fontSize="xs">Membership</StatLabel>
          <StatNumber color="purple.300" fontSize="lg">{membershipPower}</StatNumber>
          <StatHelpText color="gray.500" fontSize="2xs" m={0}>
            base points
          </StatHelpText>
        </Stat>
        <Stat textAlign="center">
          <StatLabel color="gray.400" fontSize="xs">Work</StatLabel>
          <StatNumber color="blue.300" fontSize="lg">{formatPowerNumber(contributionPower)}</StatNumber>
          <StatHelpText color="gray.500" fontSize="2xs" m={0}>
            from {ptBalance || 0} tokens
          </StatHelpText>
        </Stat>
        <Stat textAlign="center">
          <StatLabel color="gray.400" fontSize="xs">Total Power</StatLabel>
          <StatNumber color="green.300" fontSize="lg">{formatPowerNumber(totalPower)}</StatNumber>
          <StatHelpText color="gray.500" fontSize="2xs" m={0}>
            combined
          </StatHelpText>
        </Stat>
        <Stat textAlign="center">
          <StatLabel color="gray.400" fontSize="xs">Your Share</StatLabel>
          <StatNumber color="yellow.300" fontSize="lg">
            {orgStats?.percentOfTotal ? `${orgStats.percentOfTotal.toFixed(1)}%` : '—'}
          </StatNumber>
          <StatHelpText color="gray.500" fontSize="2xs" m={0}>
            of org power
          </StatHelpText>
        </Stat>
      </SimpleGrid>

      {/* Context comparison */}
      {orgStats && orgStats.totalOrgPower > 0 && (
        <HStack
          spacing={4}
          p={3}
          bg="whiteAlpha.50"
          borderRadius="lg"
          border="1px solid"
          borderColor="whiteAlpha.100"
          flexWrap="wrap"
          justify="center"
        >
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.400">Org average:</Text>
            <Text fontSize="xs" color="gray.300" fontWeight="medium">
              {formatPowerNumber(orgStats.averagePower)} pts
            </Text>
          </HStack>
          <Divider orientation="vertical" h="16px" borderColor="whiteAlpha.300" display={{ base: "none", md: "block" }} />
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.400">You are</Text>
            <Badge
              colorScheme={orgStats.aboveAverage ? "green" : "gray"}
              variant="subtle"
              fontSize="2xs"
            >
              {orgStats.aboveAverage ? "above average" : "below average"}
            </Badge>
          </HStack>
          <Divider orientation="vertical" h="16px" borderColor="whiteAlpha.300" display={{ base: "none", md: "block" }} />
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.400">Members:</Text>
            <Text fontSize="xs" color="gray.300" fontWeight="medium">{poMembers}</Text>
          </HStack>
        </HStack>
      )}
    </VStack>
  );
};

const VotingEducationHeader = ({ selectedTab, PTVoteType }) => {

  const { userData, hasMemberRole } = useUserContext();
  const { poMembers } = usePOContext();

  const {
    membershipPower,
    contributionPower,
    classWeights,
    classConfig,
    orgStats,
    isHybrid,
    hasVotingPower,
    message,
    isLoading,
    status,
  } = useVotingPower();

  const headingSize = useBreakpointValue({ base: "lg", md: "xl" });
  // Tab 0 = Hybrid/Participation Voting, Tab 1 = Direct Democracy
  const showHybridEducation = selectedTab === 0 && PTVoteType === "Hybrid";
  const showParticipationEducation = selectedTab === 0 && PTVoteType === "Participation";

  // Debug logging
  console.log('[VotingEducationHeader] Render state:', {
    selectedTab,
    PTVoteType,
    showHybridEducation,
    hasMemberRole,
    hasVotingPower,
    isLoading,
    status,
    membershipPower,
    contributionPower,
  });

  // Get the appropriate title and tagline
  // Tab 0 = Hybrid/Participation Voting, Tab 1 = Direct Democracy
  const getTitle = () => {
    if (selectedTab === 1) {
      return "Quick Temperature Check";
    } else if (PTVoteType === "Hybrid") {
      return "Hybrid Voting";
    } else {
      return "Participation Voting";
    }
  };

  const getTagline = () => {
    if (selectedTab === 1) {
      return "One person, one vote — gauge sentiment without commitment";
    } else if (PTVoteType === "Hybrid") {
      return "Binding decisions weighted by membership + contributions";
    } else {
      return "Official governance based on your contributions";
    }
  };

  // Get user's participation token balance
  const ptBalance = userData?.participationTokenBalance || "0";

  return (
    <Flex
      align="center"
      mb={{ base: 4, md: 6 }}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      borderRadius="3xl"
      boxShadow="lg"
      p={{ base: 4, md: 6 }}
      w="100%"
      maxW="1440px"
      mx="auto"
      bg="transparent"
      position="relative"
      display="flex"
      zIndex={0}
      transition="all 0.3s ease"
    >
      <Box
        className="glass"
        style={glassLayerStyle}
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        borderRadius="inherit"
        zIndex={-1}
      />

      <VStack spacing={5} w="100%">
        {/* Type indicator badge + Title */}
        <VStack spacing={3}>
          {/* Official/Informal badge */}
          {/* Tab 0 = Hybrid/Participation (Official), Tab 1 = Democracy (Informal) */}
          {selectedTab === 0 ? (
            <HStack
              spacing={2}
              bg="rgba(237, 137, 54, 0.1)"
              border="1px solid rgba(237, 137, 54, 0.3)"
              borderRadius="full"
              px={3}
              py={1.5}
              animation={`${breathe} 3s ease-in-out infinite`}
            >
              <Box
                w="8px"
                h="8px"
                borderRadius="full"
                bg="linear-gradient(135deg, #F6AD55 0%, #ED8936 100%)"
                boxShadow="0 0 8px rgba(237, 137, 54, 0.6)"
              />
              <Text
                fontSize="xs"
                color="orange.300"
                fontWeight="semibold"
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Official Governance
              </Text>
            </HStack>
          ) : (
            <HStack
              spacing={2}
              bg="whiteAlpha.100"
              borderRadius="full"
              px={3}
              py={1.5}
            >
              <Box
                w="8px"
                h="8px"
                borderRadius="full"
                bg="blue.400"
                boxShadow="0 0 8px rgba(66, 153, 225, 0.5)"
              />
              <Text
                fontSize="xs"
                color="gray.400"
                fontWeight="semibold"
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Informal Poll
              </Text>
            </HStack>
          )}

          {/* Title */}
          <Heading
            color="ghostwhite"
            size={headingSize}
            bgGradient={selectedTab === 0
              ? "linear(to-r, orange.300, purple.400)"
              : "linear(to-r, blue.300, blue.400)"
            }
            bgClip="text"
            textAlign="center"
          >
            {getTitle()}
          </Heading>
          <Text
            color="gray.300"
            fontSize={{ base: "sm", md: "md" }}
            textAlign="center"
          >
            {getTagline()}
          </Text>
        </VStack>

        {/* Hybrid Voting Education Section */}
        {showHybridEducation && (
          <>
            {/* Organization Voting Split - shows the actual class weights */}
            {!isLoading && classWeights && (
              <Box
                p={4}
                bg="whiteAlpha.50"
                borderRadius="xl"
                border="1px solid"
                borderColor="rgba(237, 137, 54, 0.15)"
                w="100%"
                maxW="500px"
              >
                <VStack spacing={3}>
                  <HStack spacing={2} justify="center" flexWrap="wrap">
                    <Text fontSize="sm" color="gray.400" fontWeight="medium">
                      Voting Weight Configuration
                    </Text>
                    {classConfig?.some(c => c.strategy === 'ERC20_BAL' && c.quadratic) && (
                      <Badge colorScheme="blue" variant="subtle" fontSize="2xs">
                        Quadratic
                      </Badge>
                    )}
                  </HStack>
                  <HStack spacing={4} justify="center" flexWrap="wrap">
                    <HStack spacing={2}>
                      <Box w="14px" h="14px" borderRadius="full" bg="purple.400" />
                      <VStack spacing={0} align="start">
                        <Text fontSize="lg" fontWeight="bold" color="purple.300">
                          {classWeights.democracy}%
                        </Text>
                        <Text fontSize="xs" color="gray.400">Membership</Text>
                      </VStack>
                    </HStack>
                    <Text color="gray.600" fontSize="lg">+</Text>
                    <HStack spacing={2}>
                      <Box w="14px" h="14px" borderRadius="full" bg="blue.400" />
                      <VStack spacing={0} align="start">
                        <Text fontSize="lg" fontWeight="bold" color="blue.300">
                          {classWeights.contribution}%
                        </Text>
                        <Text fontSize="xs" color="gray.400">Work</Text>
                      </VStack>
                    </HStack>
                  </HStack>
                </VStack>
              </Box>
            )}

            {/* Two Voices visualization bar - shows user's personal power */}
            <TwoVoicesBar
              membershipPower={membershipPower}
              contributionPower={contributionPower}
              classWeights={classWeights}
              classConfig={classConfig}
              isLoading={isLoading}
              status={status}
              message={message}
              hasMemberRole={hasMemberRole}
            />

            {/* Voting Power Stats Grid */}
            {hasVotingPower && !isLoading && (
              <VotingPowerStats
                membershipPower={membershipPower}
                contributionPower={contributionPower}
                classWeights={classWeights}
                ptBalance={ptBalance}
                poMembers={poMembers}
                orgStats={orgStats}
              />
            )}

            {/* Status badge */}
            {hasVotingPower && message && (
              <Badge
                colorScheme="green"
                variant="subtle"
                px={4}
                py={1}
                borderRadius="full"
                fontSize="xs"
              >
                {message}
              </Badge>
            )}

            {/* Learn more dropdown - always show for hybrid voting */}
            <LearnMoreDropdown classWeights={classWeights} classConfig={classConfig} />
          </>
        )}

        {/* Participation Voting (non-hybrid) Education */}
        {showParticipationEducation && (
          <VStack spacing={3}>
            <Box
              p={4}
              bg="whiteAlpha.50"
              borderRadius="lg"
              border="1px solid"
              borderColor="rgba(237, 137, 54, 0.15)"
              maxW="500px"
            >
              <VStack spacing={2}>
                <Text fontSize="sm" color="gray.300" textAlign="center">
                  Binding governance weighted by your participation tokens.
                  Complete tasks and contribute to earn more influence.
                </Text>
                {userData?.participationTokenBalance && (
                  <HStack spacing={2}>
                    <Text fontSize="xs" color="gray.400">Your tokens:</Text>
                    <Badge colorScheme="orange" variant="subtle">
                      {ptBalance}
                    </Badge>
                  </HStack>
                )}
              </VStack>
            </Box>
          </VStack>
        )}

        {/* Simple message for Democracy voting - no Total members, just clean explanation */}
        {selectedTab === 1 && (
          <Text
            fontSize="sm"
            color="gray.400"
            textAlign="center"
            maxW="400px"
          >
            One person, one vote. Results are non-binding.
          </Text>
        )}
      </VStack>
    </Flex>
  );
};

export default VotingEducationHeader;
