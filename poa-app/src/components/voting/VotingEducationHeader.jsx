/**
 * VotingEducationHeader
 * Educational header for the voting page. Explains "Blended voting" (HybridVoting
 * on-chain) with an N-class weight bar + the member's own VotePowerReceipt.
 *
 * Product direction (Hudson):
 *  - "Blended voting" everywhere a member can see it (never "Hybrid").
 *  - Honest power: the weight bar reflects the real N voting classes and the
 *    receipt shows the member's own share — no fabricated 50/50 default.
 *  - Collapse-after-first-visit: the full header shows on a member's first
 *    visit to an org's voting page; after that a one-line GovernanceStrip that
 *    expands back to the full header on click.
 *
 * Exports (API consumed by VotingTabs / VotingPage — keep stable):
 *  - default VotingEducationHeader({ selectedTab, PTVoteType })  → desktop card / headerSlot
 *  - VotingEducationContent({ selectedTab, PTVoteType })          → shared inner content (drawer + card)
 *  - VotingMobileHeader({ selectedTab, PTVoteType, onInfoClick }) → slim mobile page header
 */

import React, { useEffect, useState } from "react";
import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Collapse,
  Button,
  IconButton,
  useBreakpointValue,
  Badge,
  Tooltip,
  keyframes,
} from "@chakra-ui/react";
import { InfoOutlineIcon, ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import { PiUsers, PiChartBar, PiSquareHalfFill } from "react-icons/pi";
import { useVotingPower } from "@/hooks";
import { useUserContext } from "@/context/UserContext";
import { usePOContext } from "@/context/POContext";
import { useVotingContext } from "@/context/VotingContext";
import { useTour } from "@/features/tour";
import { VotePowerReceipt } from "@/components/voting/VotePowerReceipt";
import {
  displayName,
  taglineFor,
  BLENDED_EXPLAINER,
} from "@/config/votingVocabulary";

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

/**
 * Per-class strategy visual meta for the weight bar.
 */
function classVisual(cls) {
  if (cls.strategy === "DIRECT") {
    return { color: "#9F7AEA", icon: PiUsers, kind: "members" };
  }
  return cls.quadratic
    ? { color: "#63B3ED", icon: PiSquareHalfFill, kind: "shares √" }
    : { color: "#63B3ED", icon: PiChartBar, kind: "shares" };
}

/**
 * N-class weight bar — one segment per voting class by slicePct. Reuses the
 * visual idea of the deployer's MultiClassWeightBar, adapted to the voting
 * page's dark glass surface + amethyst accents.
 */
const ClassWeightBar = ({ votingClasses }) => {
  const labelMinPct = useBreakpointValue({ base: 30, md: 18 }) ?? 30;
  const classes = (votingClasses || []).filter((c) => Number(c.slicePct) > 0);

  if (classes.length === 0) return null;

  return (
    <VStack spacing={2} w="100%" maxW="560px">
      <Text fontSize="xs" color="gray.300">
        How votes are weighted
      </Text>
      <Box w="100%">
        <Flex
          w="100%"
          h="36px"
          borderRadius="full"
          overflow="hidden"
          bg="gray.700"
          boxShadow="inner"
        >
          {classes.map((cls, idx) => {
            const v = classVisual(cls);
            const slice = Math.round(Number(cls.slicePct));
            return (
              <Flex
                key={cls.classIndex ?? idx}
                w={`${slice}%`}
                h="100%"
                bg={v.color}
                align="center"
                justify="center"
                borderRight={idx < classes.length - 1 ? "1px solid rgba(0,0,0,0.3)" : "none"}
              >
                <HStack spacing={1}>
                  <Text fontSize="sm" fontWeight="bold" color="white">
                    {slice}%
                  </Text>
                  {slice >= labelMinPct && (
                    <Text fontSize="2xs" color="whiteAlpha.900" noOfLines={1}>
                      {v.kind}
                    </Text>
                  )}
                </HStack>
              </Flex>
            );
          })}
        </Flex>

        {/* Legend */}
        <HStack spacing={3} justify="center" mt={1.5} flexWrap="wrap">
          {classes.map((cls, idx) => {
            const v = classVisual(cls);
            return (
              <HStack key={cls.classIndex ?? idx} spacing={1}>
                <Box w="8px" h="8px" borderRadius="full" bg={v.color} />
                <Text fontSize="2xs" color="gray.300" noOfLines={1}>
                  {v.kind}
                </Text>
              </HStack>
            );
          })}
        </HStack>
      </Box>
    </VStack>
  );
};

/**
 * Expandable "How Blended voting works" footer, kept for members who want the
 * plain-language explanation beyond their personal receipt.
 */
const HowBlendedWorks = ({ votingClasses }) => {
  const { currentStepDef, isActive: isTourActive } = useTour();
  const tourWantsExpanded = isTourActive && currentStepDef?.id === "voting-hybrid-detail";
  const [isExpanded, setIsExpanded] = useState(false);
  const showExpanded = isExpanded || tourWantsExpanded;

  const direct = (votingClasses || []).find((c) => c.strategy === "DIRECT");
  const token = (votingClasses || []).find((c) => c.strategy === "ERC20_BAL");

  return (
    <Box w="100%" display="flex" flexDirection="column" alignItems="center">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded((prev) => !prev)}
        color="gray.300"
        _hover={{ color: "white", bg: "whiteAlpha.100" }}
        rightIcon={showExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
        fontWeight="normal"
      >
        How Blended voting works
      </Button>

      <Collapse in={showExpanded} animateOpacity>
        <Box
          data-tour="voting-hybrid-detail"
          mt={4}
          p={{ base: 4, md: 5 }}
          bg="whiteAlpha.50"
          borderRadius="xl"
          border="1px solid"
          borderColor="whiteAlpha.100"
          maxW="560px"
        >
          <VStack spacing={3} align="stretch">
            <Text fontSize="sm" color="gray.200" lineHeight="1.6">
              {BLENDED_EXPLAINER}
            </Text>
            {(direct || token) && (
              <VStack align="start" spacing={1} pl={1}>
                {direct && (
                  <Text fontSize="xs" color="#C6B4F5">
                    Members class: {Math.round(Number(direct.slicePct))}% of every decision,
                    split equally among eligible members.
                  </Text>
                )}
                {token && (
                  <Text fontSize="xs" color="#9ECBF0">
                    Contributors class: {Math.round(Number(token.slicePct))}% of every decision,
                    split by shares earned{token.quadratic ? " (square-root weighted so no one dominates)" : ""}.
                  </Text>
                )}
              </VStack>
            )}
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
};

/**
 * Slim mobile-only page header. Sits between the (fixed) navbar clearance
 * and the tabs. Two-line layout: page title + the member's voting share.
 */
export const VotingMobileHeader = ({ selectedTab, PTVoteType, onInfoClick }) => {
  const { hasMemberRole } = useUserContext();
  const { totalSharePct, orgStats, hasVotingPower } = useVotingPower();
  const sharePct = totalSharePct != null ? totalSharePct : orgStats?.percentOfTotal ?? 0;

  const title = (() => {
    if (selectedTab === 1) return "Temperature Check";
    if (PTVoteType === "Hybrid") return displayName("Hybrid");
    return "Participation Voting";
  })();

  const subtitle = (() => {
    if (selectedTab === 1) return "One person, one vote · non-binding";
    if (!hasMemberRole) return "Members only — join to vote";
    if (hasVotingPower || sharePct > 0) return `Your voice: ${sharePct.toFixed(1)}%`;
    return "You don't hold voting power yet";
  })();

  const isOfficial = selectedTab === 0;

  return (
    <Flex
      display={{ base: "flex", md: "none" }}
      align="center"
      justify="space-between"
      px={4}
      py={3}
      mb={3}
      borderRadius="2xl"
      boxShadow="lg"
      position="relative"
      zIndex={0}
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
      <VStack align="start" spacing={0.5} flex={1} minW={0}>
        <HStack spacing={2}>
          <Box
            w="8px"
            h="8px"
            borderRadius="full"
            bg={isOfficial
              ? "linear-gradient(135deg, #F6AD55 0%, #ED8936 100%)"
              : "blue.400"
            }
            boxShadow={isOfficial
              ? "0 0 8px rgba(237, 137, 54, 0.6)"
              : "0 0 8px rgba(66, 153, 225, 0.5)"
            }
            flexShrink={0}
          />
          <Heading
            as="h1"
            fontSize="md"
            fontWeight="bold"
            bgGradient={isOfficial
              ? "linear(to-r, orange.300, purple.400)"
              : "linear(to-r, blue.300, blue.400)"
            }
            bgClip="text"
            noOfLines={1}
          >
            {title}
          </Heading>
        </HStack>
        <Text fontSize="xs" color="gray.300" pl={4} noOfLines={1}>
          {subtitle}
        </Text>
      </VStack>
      <IconButton
        aria-label="How voting works"
        icon={<InfoOutlineIcon boxSize="18px" />}
        variant="ghost"
        size="sm"
        color="gray.300"
        onClick={onInfoClick}
        _hover={{ color: "white", bg: "whiteAlpha.100" }}
        flexShrink={0}
        ml={2}
      />
    </Flex>
  );
};

/**
 * Governance strip shown after the member's first visit to this org's voting
 * page. Type-honest voice numbers (the panel's #1 finding): a poll share AND a
 * binding share, each labeled — never one ambiguous percentage. A mini weight
 * bar replaces the "80/20 split" text. On mobile it becomes a two-row tappable
 * card; the whole strip expands the full explainer.
 */
const GovernanceStrip = ({ votingClasses, totalSharePct, poMembers, onExpand }) => {
  const classes = (votingClasses || []).filter((c) => Number(c.slicePct) > 0);
  const blendedText = totalSharePct != null ? `${totalSharePct.toFixed(1)}%` : null;
  const pollText = poMembers > 0 ? `${(100 / poMembers).toFixed(1)}%` : null;

  const voiceNumbers = (
    <HStack spacing={2} flexWrap="wrap" rowGap={0.5}>
      <Text fontSize="sm" color="gray.200" fontWeight="600">
        Your voice:
      </Text>
      {pollText && (
        <Tooltip
          label={`Polls count every member equally — you're 1 of ${poMembers}.`}
          placement="bottom"
          hasArrow
          bg="gray.700"
        >
          <HStack spacing={1} cursor="help">
            <Text fontSize="sm" color="white" fontWeight="800">{pollText}</Text>
            <Text fontSize="xs" color="gray.300">on polls</Text>
          </HStack>
        </Tooltip>
      )}
      {pollText && blendedText && <Text color="gray.500">·</Text>}
      {blendedText && (
        <Tooltip
          label="Binding votes use your group's blended weights (membership + shares)."
          placement="bottom"
          hasArrow
          bg="gray.700"
        >
          <HStack spacing={1} cursor="help">
            <Text fontSize="sm" color="#C6B4F5" fontWeight="800">{blendedText}</Text>
            <Text fontSize="xs" color="gray.300">on binding votes</Text>
          </HStack>
        </Tooltip>
      )}
    </HStack>
  );

  const weightBar = classes.length > 0 && (
    <Tooltip label={taglineFor("Hybrid")} placement="bottom" hasArrow bg="gray.700">
      <HStack spacing={1.5} cursor="help">
        <Flex w="72px" h="10px" borderRadius="full" overflow="hidden" bg="gray.700" flexShrink={0}>
          {classes.map((cls, i) => (
            <Box
              key={cls.classIndex ?? i}
              w={`${Math.round(Number(cls.slicePct))}%`}
              h="100%"
              bg={cls.strategy === "DIRECT" ? "#9F7AEA" : "#63B3ED"}
            />
          ))}
        </Flex>
        <Text fontSize="xs" color="gray.300">
          {classes.map((c) => Math.round(Number(c.slicePct))).join("/")}
        </Text>
      </HStack>
    </Tooltip>
  );

  return (
    <Box w="100%" maxW="1440px" mx="auto" mb={6}>
      <Flex
        align="center"
        justify={{ base: "space-between", md: "center" }}
        direction={{ base: "column", md: "row" }}
        gap={{ base: 1.5, md: 4 }}
        px={{ base: 4, md: 6 }}
        py={{ base: 3, md: 3 }}
        borderRadius="2xl"
        position="relative"
        zIndex={1}
        border="1px solid rgba(148, 115, 220, 0.35)"
        boxShadow="0 0 24px rgba(148, 115, 220, 0.14), 0 4px 16px rgba(0,0,0,0.3)"
        cursor="pointer"
        role="button"
        tabIndex={0}
        aria-label="Show how Blended voting works"
        onClick={onExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onExpand();
          }
        }}
        transition="border-color 0.2s ease, box-shadow 0.2s ease"
        _hover={{
          borderColor: "rgba(148, 115, 220, 0.6)",
          ".gov-strip-cta": { color: "white" },
        }}
        _focusVisible={{ outline: "2px solid #9473DC", outlineOffset: "2px" }}
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

        {/* Row 1 (mobile) / left cluster (desktop): system name + weight bar */}
        <HStack spacing={3} w={{ base: "100%", md: "auto" }} justify={{ base: "space-between", md: "flex-start" }}>
          <HStack spacing={1.5}>
            <Box w="8px" h="8px" borderRadius="full" bg={AMETHYST} />
            <Text fontSize="sm" color="white" fontWeight="700">
              {displayName("Hybrid")}
            </Text>
          </HStack>
          {weightBar}
          {/* Mobile: chevron sits at the row edge as the tap affordance */}
          <HStack spacing={1} className="gov-strip-cta" color="#C6B4F5" display={{ base: "flex", md: "none" }}>
            <ChevronDownIcon boxSize={5} />
          </HStack>
        </HStack>

        {/* Row 2 (mobile) / middle cluster (desktop): the voice numbers */}
        {voiceNumbers}

        {/* Desktop-only CTA */}
        <HStack spacing={1} className="gov-strip-cta" color="#C6B4F5" display={{ base: "none", md: "flex" }}>
          <Text fontSize="sm" fontWeight="600">How it works</Text>
          <ChevronDownIcon />
        </HStack>
      </Flex>
    </Box>
  );
};

/**
 * Inner content of the educational header. Used by both the desktop card
 * (rendered inline above the tabs) and the mobile bottom-sheet drawer.
 */
export const VotingEducationContent = ({ selectedTab, PTVoteType }) => {
  const { userData, hasMemberRole } = useUserContext();
  const { votingClasses } = useVotingContext();

  const { hasVotingPower, isLoading } = useVotingPower();

  const headingSize = useBreakpointValue({ base: "lg", md: "xl" });
  // Tab 0 = Blended/Participation Voting, Tab 1 = Direct Democracy
  const showHybridEducation = selectedTab === 0 && PTVoteType === "Hybrid";
  const showParticipationEducation = selectedTab === 0 && PTVoteType === "Participation";

  const getTitle = () => {
    if (selectedTab === 1) {
      return "Quick Temperature Check";
    } else if (PTVoteType === "Hybrid") {
      return displayName("Hybrid");
    } else {
      return "Participation Voting";
    }
  };

  const getTagline = () => {
    if (selectedTab === 1) {
      return "One person, one vote — gauge sentiment without commitment";
    } else if (PTVoteType === "Hybrid") {
      return taglineFor("Hybrid");
    } else {
      return "Official governance based on your contributions";
    }
  };

  const ptBalance = userData?.participationTokenBalance || "0";

  return (
    <VStack spacing={5} w="100%">
      {/* Type indicator badge + Title */}
      <VStack spacing={3}>
        {/* Tab 0 = Blended/Participation (Official), Tab 1 = Democracy (Informal) */}
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
              color="gray.300"
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

      {/* Blended Voting Education Section */}
      {showHybridEducation && (
        <>
          {/* N-class weight bar — how the decision is split across classes */}
          <ClassWeightBar votingClasses={votingClasses} />

          {/* The member's own truthful power receipt */}
          {hasMemberRole && (
            <Box w="100%" maxW="560px">
              <VotePowerReceipt variant="full" hideExplainer />
            </Box>
          )}

          {/* Plain-language explainer */}
          <HowBlendedWorks votingClasses={votingClasses} />
        </>
      )}

      {/* Participation Voting (non-blended) Education */}
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
              <Text fontSize="sm" color="gray.200" textAlign="center">
                Binding governance weighted by your shares.
                Complete tasks and contribute to earn more influence.
              </Text>
              {userData?.participationTokenBalance && (
                <HStack spacing={2}>
                  <Text fontSize="xs" color="gray.300">Your shares:</Text>
                  <Badge colorScheme="orange" variant="subtle">
                    {ptBalance}
                  </Badge>
                </HStack>
              )}
            </VStack>
          </Box>
        </VStack>
      )}

      {/* Simple message for Democracy voting */}
      {selectedTab === 1 && (
        <Text
          fontSize="sm"
          color="gray.300"
          textAlign="center"
          maxW="400px"
        >
          One person, one vote. Results are non-binding.
        </Text>
      )}
    </VStack>
  );
};

/**
 * Desktop-only educational header card. Mobile users access the same content
 * via the "How voting works" button + bottom-sheet drawer in VotingTabs.
 *
 * Collapse-after-first-visit: on a member's first visit to this org's voting
 * page we show the full card; thereafter a one-line GovernanceStrip that
 * expands to the full card on click. The "seen" flag is per-org localStorage.
 */
const VotingEducationHeader = ({ selectedTab, PTVoteType }) => {
  const { orgId, poMembers } = usePOContext();
  const { votingClasses } = useVotingContext();
  const { totalSharePct } = useVotingPower();

  // undefined = not yet resolved, true = collapse to strip, false = show full
  const [collapsed, setCollapsed] = useState(undefined);

  const isBlendedTab = selectedTab === 0 && PTVoteType === "Hybrid";
  const storageKey = orgId ? `poa:votingEduSeen:${orgId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    let seen = false;
    try {
      seen = typeof window !== "undefined" && window.localStorage.getItem(storageKey) === "1";
    } catch {
      seen = false;
    }
    setCollapsed(seen);
    // Mark as seen for next time.
    if (!seen) {
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        /* ignore storage failures */
      }
    }
  }, [storageKey]);

  // Only the Blended tab collapses; other tabs always render the full content.
  const showStrip = isBlendedTab && collapsed === true;

  if (showStrip) {
    return (
      <GovernanceStrip
        votingClasses={votingClasses}
        totalSharePct={totalSharePct}
        poMembers={poMembers}
        onExpand={() => setCollapsed(false)}
      />
    );
  }

  return (
    <Box>
      <Flex
        align="center"
        mb={6}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        borderRadius="3xl"
        boxShadow="lg"
        p={6}
        w="100%"
        maxW="1440px"
        mx="auto"
        bg="transparent"
        position="relative"
        zIndex={0}
        transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
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
        <VotingEducationContent selectedTab={selectedTab} PTVoteType={PTVoteType} />
        {/* Re-collapse to the one-line strip without waiting for the next visit. */}
        {isBlendedTab && (
          <Button
            variant="ghost"
            size="xs"
            mt={1}
            mb={2}
            color="gray.400"
            _hover={{ color: "white", bg: "whiteAlpha.100" }}
            rightIcon={<ChevronUpIcon />}
            onClick={() => setCollapsed(true)}
          >
            Hide
          </Button>
        )}
      </Flex>
    </Box>
  );
};

export default VotingEducationHeader;
