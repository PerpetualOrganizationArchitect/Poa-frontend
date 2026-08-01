/**
 * VotingEducationHeader
 * Educational header for the voting page. Explains "Blended voting" (HybridVoting
 * on-chain) with an N-class weight bar + the member's own VotePowerReceipt.
 *
 * Product direction (Hudson):
 *  - "Blended voting" everywhere a member can see it (never "Hybrid").
 *  - Honest power: the weight bar reflects the real N voting classes and the
 *    receipt shows the member's own share — no fabricated 50/50 default.
 *  - Always-collapsed by default: the page opens on the one-line
 *    GovernanceStrip, which expands to the full header on click. It used to
 *    auto-expand on a member's first visit; VotingIntroNudge now points at the
 *    strip on visits 1 and 3 instead (see @/lib/voting/votingIntro).
 *
 * Exports:
 *  - default VotingEducationHeader({ selectedTab, PTVoteType, modalOpen })
 *  - VotingEducationContent({ selectedTab, PTVoteType }) → the inner card body
 */

import React, { useCallback, useState } from "react";
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
  SimpleGrid,
  keyframes,
} from "@chakra-ui/react";
import { InfoOutlineIcon, ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import { PiUsers, PiChartBar, PiSquareHalfFill } from "react-icons/pi";
import { useVotingIntro, useVotingPower } from "@/hooks";
import { useUserContext } from "@/context/UserContext";
import { usePOContext } from "@/context/POContext";
import { useVotingContext } from "@/context/VotingContext";
import { useTour } from "@/features/tour";
import { VotePowerReceipt } from "@/components/voting/VotePowerReceipt";
import { VotingIntroNudge } from "@/components/voting/VotingIntroNudge";
import {
  displayName,
  taglineFor,
  TYPE_EXPLAINER,
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
 * The full "How Blended voting works" explainer — restored from the
 * pre-overhaul header (Hudson: the old explainer taught better) and upgraded
 * with live org numbers. ALWAYS visible when the education card is open:
 * expanding "How it works" from the strip must reveal the whole explanation,
 * not a second collapsed section.
 *
 * Teaching structure (kept from the original):
 *   1. "Two factors determine your voting power" — side-by-side class cards
 *      (Membership equal-vote / Contribution shares earned by completing
 *      tasks, with the quadratic sentence when the org uses it).
 *   2. A worked example with real weights and the org's real member count.
 *   3. The principle line: everyone has a voice; contributors earn influence.
 */
const BlendedExplainerPanel = ({ votingClasses, poMembers }) => {
  const classes = votingClasses || [];
  const direct = classes.find((c) => c.strategy === "DIRECT");
  const token = classes.find((c) => c.strategy === "ERC20_BAL");
  const democracyWeight = direct ? Math.round(Number(direct.slicePct)) : 50;
  const contributionWeight = token ? Math.round(Number(token.slicePct)) : 50;
  const isQuadratic = !!token?.quadratic;
  const memberCount = poMembers > 0 ? poMembers : 6;

  const exMembership = democracyWeight / memberCount;
  const exContribution = (contributionWeight * 10) / 100;

  return (
    <Box
      data-tour="voting-hybrid-detail"
      mt={2}
      p={{ base: 4, md: 5 }}
      bg="whiteAlpha.50"
      borderRadius="xl"
      border="1px solid"
      borderColor="whiteAlpha.100"
      w="100%"
      maxW="640px"
    >
      <VStack spacing={4} align="stretch">
        <VStack align="start" spacing={2}>
          <Heading size="sm" color="white">
            How Blended voting works
          </Heading>
          <Text fontSize="sm" color="gray.300">
            Two factors determine your voting power:
          </Text>
        </VStack>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {/* Membership */}
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
                  Membership
                </Text>
                <Badge colorScheme="purple" variant="subtle" fontSize="2xs">
                  {democracyWeight}%
                </Badge>
              </HStack>
              <Text fontSize="xs" color="gray.300">
                Every member gets an equal share of this portion. With{" "}
                {memberCount} members, each gets 1/{memberCount} of the
                membership weight.
              </Text>
            </VStack>
          </Box>

          {/* Contribution */}
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
                  Contribution
                </Text>
                <Badge colorScheme="blue" variant="subtle" fontSize="2xs">
                  {contributionWeight}%
                </Badge>
              </HStack>
              <Text fontSize="xs" color="gray.300">
                Your share of this portion is based on your shares, earned by
                completing tasks. More shares = more influence.
                {isQuadratic && " Uses quadratic scaling so no single person can dominate."}
              </Text>
            </VStack>
          </Box>
        </SimpleGrid>

        {/* Worked example — live weights + the org's real member count */}
        <Box
          p={3}
          bg="whiteAlpha.50"
          borderRadius="lg"
          border="1px solid"
          borderColor="whiteAlpha.100"
        >
          <VStack align="start" spacing={2}>
            <Text fontWeight="bold" color="white" fontSize="sm">
              Example
            </Text>
            <Text fontSize="xs" color="gray.300">
              Say your org has {memberCount} members and 100 total shares, and
              one member — call her Ana — holds 10 of them.
            </Text>
            <VStack align="start" spacing={1} pl={2}>
              <Text fontSize="xs" color="purple.200">
                Membership: 1/{memberCount} of {democracyWeight}% ={" "}
                {exMembership.toFixed(1)}%
              </Text>
              <Text fontSize="xs" color="blue.200">
                Contribution: 10/100 of {contributionWeight}% ={" "}
                {exContribution.toFixed(1)}%
              </Text>
              <Text fontSize="xs" color="green.200" fontWeight="semibold">
                Ana&apos;s total voting power: {(exMembership + exContribution).toFixed(1)}%
              </Text>
              {isQuadratic && (
                <Text fontSize="xs" color="gray.400" fontStyle="italic">
                  With quadratic scaling, contribution uses √(shares) for
                  fairer distribution — actual percentages will differ from
                  this simplified example.
                </Text>
              )}
            </VStack>
          </VStack>
        </Box>

        <Text fontSize="xs" color="gray.400">
          This means every member always has a voice, while those who
          contribute the most earn greater influence over decisions.
        </Text>
        <Text fontSize="xs" color="gray.500">
          {TYPE_EXPLAINER}
        </Text>
      </VStack>
    </Box>
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
  const { poMembers } = usePOContext();
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
          <BlendedExplainerPanel votingClasses={votingClasses} poMembers={poMembers} />
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
 * The education header, at every breakpoint — the strip and the card it expands
 * into are the only path to this explainer (the old VotingTabs bottom-sheet
 * drawer went away with the tabs).
 *
 * The page ALWAYS opens on the one-line GovernanceStrip, which expands to the
 * full card on click. It used to auto-expand the whole explainer on a member's
 * first visit, which buried the board under an essay; instead VotingIntroNudge
 * points at the strip on visits 1 and 3 (see @/lib/voting/votingIntro).
 */
const VotingEducationHeader = ({ selectedTab, PTVoteType, modalOpen = false }) => {
  const { orgId, poMembers } = usePOContext();
  const { votingClasses } = useVotingContext();
  const { totalSharePct } = useVotingPower();

  // The member opened the explainer on this page view.
  const [expanded, setExpanded] = useState(false);

  const { currentStepDef, isActive: isTourActive } = useTour();
  const tourWantsDetail = isTourActive && currentStepDef?.id === "voting-hybrid-detail";

  const isBlendedTab = selectedTab === 0 && PTVoteType === "Hybrid";

  // Hold the coach-mark while something else owns the screen — the guided tour,
  // or a modal (a ?poll= deep link opens PollDetail on load). This only defers:
  // the nudge reappears when the overlay closes, so the visit isn't spent.
  const { nudge, dismiss, markLearned } = useVotingIntro(orgId, {
    suppressed: isTourActive || modalOpen,
  });

  // Opening the explainer — however you got there — retires the nudge for good.
  const expand = useCallback(() => {
    setExpanded(true);
    markLearned();
  }, [markLearned]);

  // Only the Blended tab collapses; other tabs always render the full content.
  const showStrip = isBlendedTab && !expanded && !tourWantsDetail;

  if (showStrip) {
    return (
      <VotingIntroNudge variant={nudge} onShowMe={expand} onDismiss={dismiss}>
        <GovernanceStrip
          votingClasses={votingClasses}
          totalSharePct={totalSharePct}
          poMembers={poMembers}
          onExpand={expand}
        />
      </VotingIntroNudge>
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
            onClick={() => setExpanded(false)}
          >
            Hide
          </Button>
        )}
      </Flex>
    </Box>
  );
};

export default VotingEducationHeader;
