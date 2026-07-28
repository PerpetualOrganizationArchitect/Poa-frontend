/**
 * PollDetail — ONE lifecycle-aware detail surface.
 *
 * Replaces pollModal.jsx AND CompletedPollModal.jsx. A single modal/bottom-sheet
 * that adapts its body to the poll lifecycle (live+eligible ballot → optimistic
 * celebration → results; awaiting-count finalize; completed outcome).
 *
 * Product direction (Hudson):
 *   - Casting a vote NEVER blocks on a spinner. On "Cast vote" we fire the
 *     optimistic vote + onVote in the background and immediately swap the body
 *     to VoteCelebration; the corner toast carries tx status. If onVote resolves
 *     { success:false } we roll the optimistic vote back and show the calm error.
 *   - Per-option tallies are hidden until the viewer has voted or the poll
 *     closed. Turnout (TurnoutMeter) is always visible; SupportMeter is
 *     post-vote/closed only.
 *   - "Blended voting" never "Hybrid" — copy comes from votingVocabulary.
 *
 * Layout: desktop modal maxW 640px; mobile (base) full-screen bottom-sheet
 * (slideInBottom, drag-handle, safe-area padding, 48px primary button).
 *
 * Props:
 *   poll               transformed proposal (from VotingContext)
 *   isOpen             bool
 *   onClose            () => void — caller strips ?poll via router.replace
 *   onVote             (contractAddress, proposalId, optionIndexes, weights) =>
 *                      Promise<{ success:boolean } | void> — matches
 *                      handleDDVote/handleHybridVote; a falsy/void resolve is
 *                      treated as success (celebration stays).
 *   onFinalize         (contractAddress, proposalId, isHybrid) => Promise
 *   contractAddress    string — voting contract for this poll's type
 *   votingTypeSelected 'Hybrid' | 'Direct Democracy'
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Badge,
  Button,
  IconButton,
  Radio,
  RadioGroup,
  Collapse,
  Icon,
  Tooltip,
  Switch,
  FormControl,
  FormLabel,
  useBreakpointValue,
  useClipboard,
  useDisclosure,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
} from '@chakra-ui/react';
import { LinkIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon } from '@chakra-ui/icons';
import { PiLockKey } from 'react-icons/pi';
import GlassBack from './GlassBack';
import { useAuth } from '@/context/AuthContext';
import { useUserContext } from '@/context/UserContext';
import { useVotingContext } from '@/context/VotingContext';
import { useVotingPower } from '@/hooks/useVotingPower';
import { useRoleNames } from '@/hooks/useRoleNames';
import { usePOContext } from '@/context/POContext';
import {
  displayName,
  BINDING_BADGE,
  POLL_BADGE,
  ELIGIBILITY_LABEL,
  COMPLETED_ELIGIBILITY_LABEL,
  FINALIZE_VERB,
  FINALIZE_EXPLAINER,
  FINALIZE_CONFIRM_TITLE,
  FINALIZE_CONFIRM_BODY,
  YOU_VOTED_CHIP,
  BALLOT_PUBLIC_NOTE,
  TYPE_EXPLAINER,
  RESTRICTION_PROVENANCE,
  FINALIZE_SUBQUORUM,
  earlyResultCaption,
  executionStatus,
  outcomeHeadline,
} from '@/config/votingVocabulary';
import { VotePowerReceipt } from './VotePowerReceipt';
import { TurnoutMeter } from './meters/TurnoutMeter';
import { SupportMeter } from './meters/SupportMeter';
import { ResultBars } from './ResultBars';
import { WeightedBallot, weightedPairs } from './WeightedBallot';
import { VoteCelebration } from './VoteCelebration';
import { VoterRoster } from './VoterRoster';
import {
  lifecycleVariant,
  turnoutInputs,
  leadingOption,
  relativeTime,
  shortDate,
  isEligibleToVote,
  computeVoterRoster,
  VOTE_PALETTE,
} from './votingDisplay';

const { amethyst, amethystBright, leaderText } = VOTE_PALETTE;

/** Copy-deep-link button — clipboards the current URL. */
function CopyLinkButton() {
  const [href, setHref] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') setHref(window.location.href);
  }, []);
  const { onCopy, hasCopied } = useClipboard(href);
  return (
    <Tooltip label={hasCopied ? 'Link copied' : 'Copy link'} placement="top" hasArrow bg="gray.700">
      <IconButton
        aria-label="Copy link to this poll"
        icon={hasCopied ? <CheckIcon /> : <LinkIcon />}
        size="sm"
        variant="ghost"
        color={hasCopied ? 'green.300' : 'gray.300'}
        _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
        onClick={onCopy}
      />
    </Tooltip>
  );
}

export function PollDetail({
  poll,
  isOpen,
  onClose,
  onVote,
  onFinalize,
  contractAddress,
  votingTypeSelected,
}) {
  const { accountAddress } = useAuth();
  const { userData, graphUsername } = useUserContext();
  const { addOptimisticVote, removeOptimisticVote } = useVotingContext();
  const { classBreakdown, totalSharePct } = useVotingPower();
  const { getRoleNamesString } = useRoleNames();
  const { poMembers, leaderboardData } = usePOContext();

  const isMobile = useBreakpointValue({ base: true, md: false });

  // ── Ballot / celebration local state ────────────────────────────────────────
  const [selectedOption, setSelectedOption] = useState('');
  const [isWeighted, setIsWeighted] = useState(false);
  const [weights, setWeights] = useState({}); // { index: weight }
  const [descOpen, setDescOpen] = useState(false);
  // { userVote, status } while the celebration takeover is showing; null otherwise.
  const [celebration, setCelebration] = useState(null);

  const finalizeConfirm = useDisclosure();
  const [finalizing, setFinalizing] = useState(false);
  const cancelRef = React.useRef();

  // Reset transient state whenever the modal opens onto a (new) poll.
  useEffect(() => {
    if (isOpen) {
      setSelectedOption('');
      setIsWeighted(false);
      setWeights({});
      setDescOpen(false);
      setCelebration(null);
    }
  }, [isOpen, poll?.id]);

  const variant = useMemo(() => lifecycleVariant(poll), [poll]);
  const roster = useMemo(() => computeVoterRoster(poll, leaderboardData), [poll, leaderboardData]);
  // Roster gives an EXACT eligible denominator (restricted polls narrow to the
  // actual hat holders) — prefer it over the poMembers approximation.
  const turnout = useMemo(() => {
    const base = turnoutInputs(poll, poMembers);
    if (!roster.exact) return base;
    return { ...base, eligible: roster.eligibleCount, approximate: false };
  }, [poll, poMembers, roster]);
  const leader = useMemo(() => leadingOption(poll), [poll]);

  const eligible = useMemo(
    () => isEligibleToVote(poll, userData?.hatIds || []),
    [poll, userData]
  );

  // NOTE: no early return before this point — every hook above and below must
  // run on EVERY render (React hooks-order rule). All poll derivations here are
  // null-tolerant; the single `if (!poll) return null` lives after the last hook.
  const isBinding = poll?.type === 'Hybrid';
  const isBlended = poll?.type === 'Hybrid';
  const closed = !!poll && !poll.isOngoing;
  const awaitingCount = variant === 'awaiting-finalize';
  const hasVoted = !!poll?.userHasVoted;
  // "Voting ended" counts as closed for visibility: no bandwagon risk remains,
  // and hiding standings on an ended-but-uncounted vote reads as broken.
  const showResults = hasVoted || closed || !!poll?.isExpired;
  const canVote = !!poll?.isOngoing && !poll?.isExpired && eligible && !hasVoted;

  const restrictedRolesText =
    poll?.isHatRestricted && (poll?.restrictedHatIds || []).length > 0
      ? getRoleNamesString(poll.restrictedHatIds)
      : 'All members';

  const descLong = (poll?.description || '').length > 280;

  // ── Vote validity ───────────────────────────────────────────────────────────
  const weightedUsed = Object.values(weights).reduce((s, w) => s + (Number(w) || 0), 0);
  const voteValid = isWeighted ? weightedUsed === 100 : selectedOption !== '';

  // ── Cast: optimistic celebration, no spinner ────────────────────────────────
  const handleCast = useCallback(async () => {
    if (!voteValid || !poll) return;

    let optionIndexes;
    let optionWeights;
    if (isWeighted) {
      const pairs = weightedPairs(weights);
      optionIndexes = pairs.optionIndexes;
      optionWeights = pairs.optionWeights;
    } else {
      optionIndexes = [parseInt(selectedOption, 10)];
      optionWeights = [100];
    }

    const userVote = { optionIndexes, optionWeights };

    // classRawPowers — makes Blended optimistic bars weight-accurate. Derived
    // from the truthful classBreakdown (userRawPower per class, ordered by
    // classIndex) when available; omitted otherwise (voter counts still move).
    // MUST be plain decimal strings: large share balances stringify through
    // Number as "1e+21", and computeHybridOptionScores feeds these to BigInt(),
    // which throws on exponent notation — crashing right after casting.
    const toDecimalString = (n) => {
      if (!Number.isFinite(n) || n <= 0) return '0';
      return Math.round(n).toLocaleString('fullwide', { useGrouping: false });
    };
    const classRawPowers = Array.isArray(classBreakdown)
      ? classBreakdown.map((c) => (c.eligible ? toDecimalString(c.userRawPower || 0) : '0'))
      : undefined;

    // Fire optimistic vote immediately so bars + userHasVoted reflect it.
    addOptimisticVote(poll.id, {
      voter: accountAddress,
      voterUsername: graphUsername || '',
      optionIndexes,
      optionWeights,
      ...(classRawPowers ? { classRawPowers } : {}),
    });

    // Show celebration instantly — do NOT await onVote first.
    setCelebration({ userVote, status: 'pending' });

    // Resolve the proposalId the contract expects (numeric part of composite id).
    const proposalId = poll.proposalId || String(poll.id).split('-')[1];

    // Run the real cast in the background. onVote drives its own toast.
    Promise.resolve()
      .then(() => onVote?.(contractAddress, proposalId, optionIndexes, optionWeights))
      .then((result) => {
        if (result && result.success === false) {
          removeOptimisticVote(poll.id);
          setCelebration({ userVote, status: 'failed' });
        } else {
          setCelebration((prev) => (prev ? { ...prev, status: 'confirmed' } : prev));
        }
      })
      .catch(() => {
        removeOptimisticVote(poll.id);
        setCelebration({ userVote, status: 'failed' });
      });
  }, [
    voteValid,
    isWeighted,
    weights,
    selectedOption,
    classBreakdown,
    addOptimisticVote,
    removeOptimisticVote,
    poll,
    accountAddress,
    graphUsername,
    onVote,
    contractAddress,
  ]);

  const handleCelebrationRetry = useCallback(() => {
    // Restore the ballot; optimistic vote was already rolled back on failure.
    setCelebration(null);
  }, []);

  // ── Finalize (count the votes) ──────────────────────────────────────────────
  const handleFinalize = useCallback(async () => {
    if (!onFinalize || !poll) return;
    const proposalId = poll.proposalId || String(poll.id).split('-')[1];
    setFinalizing(true);
    try {
      await onFinalize(contractAddress, proposalId, isBinding);
      finalizeConfirm.onClose();
    } finally {
      setFinalizing(false);
    }
  }, [onFinalize, poll, contractAddress, isBinding, finalizeConfirm]);

  // ── userVote indexes/weights for result markers ─────────────────────────────
  const userIndexes = poll?.userVote?.optionIndexes || [];
  const userWeights = poll?.userVote?.optionWeights || [];

  // All hooks have run — NOW it's safe to bail when no poll is selected.
  if (!poll) return null;

  const contentSx = isMobile
    ? {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        top: 'auto',
        margin: 0,
        maxWidth: '100%',
        width: '100%',
        borderRadius: '24px 24px 0 0',
        maxHeight: '92vh',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }
    : { maxWidth: '640px', borderRadius: '24px' };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered={!isMobile}
      motionPreset={isMobile ? 'slideInBottom' : 'scale'}
      scrollBehavior="inside"
      size={isMobile ? 'full' : 'xl'}
    >
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="transparent" position="relative" sx={contentSx} overflow="hidden" color="white" zIndex={1}>
        <GlassBack solid />
        {isMobile && (
          // Drag-handle affordance for the bottom sheet.
          <Box w="40px" h="4px" borderRadius="full" bg="whiteAlpha.400" mx="auto" mt={3} mb={1} />
        )}
        {!isMobile && <ModalCloseButton color="gray.300" />}

        <ModalBody px={{ base: 5, md: 6 }} py={{ base: 4, md: 6 }}>
          {celebration ? (
            <VoteCelebration
              poll={poll}
              userVote={celebration.userVote}
              // Blended polls: the truthful class-weighted share. Direct-democracy
              // polls: 1-person-1-vote, so the honest number is 1/members — the
              // blended share would overstate/understate an equal vote.
              totalSharePct={
                poll.type === 'Hybrid'
                  ? totalSharePct
                  : (poMembers > 0 ? 100 / poMembers : null)
              }
              status={celebration.status}
              poMembers={poMembers}
              onDone={onClose}
              onRetry={handleCelebrationRetry}
            />
          ) : (
            <VStack align="stretch" spacing={5}>
              {/* a. Header */}
              <VStack align="stretch" spacing={2}>
                <Flex justify="space-between" align="flex-start" gap={3}>
                  <HStack spacing={2} flexWrap="wrap">
                    <Badge
                      px={2}
                      py={0.5}
                      borderRadius="md"
                      textTransform="none"
                      fontSize="2xs"
                      fontWeight="700"
                      bg={isBinding ? VOTE_PALETTE.amethystSoft : 'rgba(66, 153, 225, 0.16)'}
                      color={isBinding ? leaderText : '#90CDF4'}
                      border="1px solid"
                      borderColor={isBinding ? VOTE_PALETTE.amethystBorder : 'rgba(66, 153, 225, 0.3)'}
                    >
                      {isBinding ? BINDING_BADGE : POLL_BADGE}
                    </Badge>
                    <Badge
                      px={2}
                      py={0.5}
                      borderRadius="md"
                      textTransform="none"
                      fontSize="2xs"
                      fontWeight="600"
                      bg="whiteAlpha.100"
                      color="gray.200"
                    >
                      {displayName(poll.type)}
                    </Badge>
                    {hasVoted && (
                      <Badge
                        px={2}
                        py={0.5}
                        borderRadius="md"
                        textTransform="none"
                        fontSize="2xs"
                        fontWeight="700"
                        bg="rgba(72, 187, 120, 0.16)"
                        color="green.200"
                        border="1px solid rgba(72, 187, 120, 0.3)"
                      >
                        {YOU_VOTED_CHIP}
                      </Badge>
                    )}
                  </HStack>
                  <HStack spacing={0}>
                    <CopyLinkButton />
                  </HStack>
                </Flex>

                <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="800" color="white" lineHeight="1.2">
                  {poll.title}
                </Text>

                <Text fontSize="2xs" color="gray.400">
                  {TYPE_EXPLAINER}
                </Text>
                <Text fontSize="xs" color="gray.300">
                  {poll.proposerUsername && (
                    <Text as="span" color="#C6B4F5" fontWeight="600">by {poll.proposerUsername} · </Text>
                  )}
                  opened {shortDate(poll.startTimestamp)} · closes {shortDate(poll.endTimestamp)}
                  {poll.isOngoing && !poll.isExpired && (
                    <Text as="span" color={leaderText}> ({relativeTime(poll.endTimestamp)})</Text>
                  )}
                </Text>
              </VStack>

              {/* b. Description (collapsible) */}
              {poll.description && (
                <Box>
                  <Collapse startingHeight={descLong ? 108 : 'auto'} in={descOpen || !descLong}>
                    <Text fontSize="sm" color="gray.100" lineHeight="1.6" whiteSpace="pre-wrap">
                      {poll.description}
                    </Text>
                  </Collapse>
                  {descLong && (
                    <Button
                      variant="ghost"
                      size="xs"
                      color={leaderText}
                      _hover={{ bg: 'whiteAlpha.100' }}
                      rightIcon={descOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                      onClick={() => setDescOpen((v) => !v)}
                      mt={1}
                    >
                      {descOpen ? 'Show less' : 'Show more'}
                    </Button>
                  )}
                </Box>
              )}

              {/* What this proposal enacts, in plain language (from metadata). */}
              {(poll.actionSummaries?.length || 0) > 0 && (
                <Box borderRadius="xl" p={4} position="relative" overflow="hidden" zIndex={1}>
                  <GlassBack light />
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    color="purple.300"
                    mb={2}
                    textTransform="uppercase"
                    letterSpacing="wide"
                  >
                    What this enacts
                  </Text>
                  <VStack align="stretch" spacing={1.5}>
                    {poll.actionSummaries.map((line, i) => (
                      <HStack key={i} align="flex-start" spacing={2}>
                        <Box w="5px" h="5px" borderRadius="full" bg={amethyst} mt="7px" flexShrink={0} />
                        <Text fontSize="sm" color="gray.100" lineHeight="1.55">
                          {line}
                        </Text>
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              )}

              {/* c. TurnoutMeter (always) + SupportMeter (post-vote/closed only) */}
              <Box borderRadius="xl" p={4} position="relative" overflow="hidden" zIndex={1}>
                <GlassBack light />
                <VStack align="stretch" spacing={4}>
                  <TurnoutMeter
                    voted={turnout.voted}
                    eligible={turnout.eligible}
                    quorum={turnout.quorum}
                    approximate={turnout.approximate}
                    variant="full"
                  />
                  {showResults && leader && poll.thresholdPct > 0 && (
                    <SupportMeter
                      supportPct={leader.percentage}
                      thresholdPct={poll.thresholdPct}
                      leaderName={leader.option?.name}
                      votedCount={turnout.voted}
                    />
                  )}
                  <VoterRoster
                    roster={roster}
                    live={!!poll.isOngoing && !poll.isExpired}
                  />
                </VStack>
              </Box>

              {/* d. Eligibility verdict (BEFORE the ballot) */}
              {!closed && (
                <HStack spacing={2} align="flex-start">
                  <Icon as={PiLockKey} boxSize={4} color={amethyst} mt="2px" />
                  <VStack align="start" spacing={0.5}>
                    <Text fontSize="sm" color="gray.200">
                      {closed ? COMPLETED_ELIGIBILITY_LABEL : ELIGIBILITY_LABEL}{' '}
                      <Text as="span" color={leaderText} fontWeight="600">
                        {restrictedRolesText}
                        {poll.isHatRestricted && (
                          <Text as="span" color="gray.500" fontWeight="400"> · {RESTRICTION_PROVENANCE}</Text>
                        )}
                      </Text>
                    </Text>
                    {!hasVoted && (
                      <Text fontSize="xs" color={eligible ? 'green.300' : '#F6C177'} fontWeight="600">
                        {eligible
                          ? "You're eligible ✓"
                          : `Only ${restrictedRolesText} can vote on this one`}
                      </Text>
                    )}
                  </VStack>
                </HStack>
              )}

              {/* e. VotePowerReceipt (compact) — only when the viewer can still vote */}
              {canVote && (
                <VotePowerReceipt variant="compact" restrictedHatIds={poll.restrictedHatIds} />
              )}

              {/* f. Ballot zone (live + eligible + !voted) — NO results here */}
              {canVote && (
                <VStack align="stretch" spacing={4}>
                  {(poll.options || []).length >= 2 && (
                    <FormControl display="flex" alignItems="center">
                      <FormLabel htmlFor="weighted-mode" mb={0} fontSize="sm" color="gray.200">
                        Split my vote across options
                      </FormLabel>
                      <Switch
                        id="weighted-mode"
                        isChecked={isWeighted}
                        colorScheme="purple"
                        onChange={(e) => {
                          const on = e.target.checked;
                          setIsWeighted(on);
                          // Preserve a single pick as 100% at that index when
                          // switching INTO weighted mode; clear when leaving.
                          if (on && selectedOption !== '') {
                            setWeights({ [parseInt(selectedOption, 10)]: 100 });
                          } else if (!on) {
                            const only = Object.entries(weights).find(([, w]) => Number(w) === 100);
                            setSelectedOption(only ? only[0] : '');
                            setWeights({});
                          }
                        }}
                      />
                    </FormControl>
                  )}

                  {isWeighted ? (
                    <WeightedBallot options={poll.options} value={weights} onChange={setWeights} />
                  ) : (
                    <RadioGroup value={selectedOption} onChange={setSelectedOption}>
                      <VStack align="stretch" spacing={2}>
                        {poll.options?.map((option, index) => (
                          <Box
                            key={option.id || index}
                            as="label"
                            htmlFor={`opt-${index}`}
                            cursor="pointer"
                            borderRadius="lg"
                            border="1px solid"
                            borderColor={selectedOption === String(index) ? VOTE_PALETTE.amethystBorder : 'whiteAlpha.200'}
                            bg={selectedOption === String(index) ? VOTE_PALETTE.amethystSoft : 'whiteAlpha.50'}
                            px={4}
                            minH="52px"
                            display="flex"
                            alignItems="center"
                            transition="border-color 0.15s, background 0.15s"
                            _hover={{ borderColor: VOTE_PALETTE.amethystBorder }}
                          >
                            <Radio id={`opt-${index}`} value={String(index)} colorScheme="purple" size="lg">
                              <Text fontSize="sm" color="white" ml={1}>
                                {option.name}
                              </Text>
                            </Radio>
                          </Box>
                        ))}
                      </VStack>
                    </RadioGroup>
                  )}

                                    <Text fontSize="2xs" color="gray.400" textAlign="center">
                    {BALLOT_PUBLIC_NOTE}
                  </Text>
<Button
                    onClick={handleCast}
                    isDisabled={!voteValid}
                    minH="48px"
                    bg={amethyst}
                    color="white"
                    _hover={{ bg: amethystBright }}
                    _disabled={{ bg: 'rgba(148,115,220,0.28)', color: 'whiteAlpha.800', cursor: 'not-allowed', opacity: 1 }}
                    fontWeight="700"
                  >
                    {isWeighted && weightedUsed < 100
                      ? `Allocate ${100 - weightedUsed} more points to vote`
                      : 'Cast vote'}
                  </Button>
                  {!voteValid && !isWeighted && (
                    <Text fontSize="xs" color="gray.400" textAlign="center" mt={-1}>
                      Choose an option to cast your vote
                    </Text>
                  )}
                </VStack>
              )}

              {/* g. Results zone (voted || closed) */}
              {showResults && (
                <VStack align="stretch" spacing={3}>
                  <Text fontSize="sm" fontWeight="700" color="gray.200">
                    {awaitingCount ? 'Provisional results' : 'Results'}
                  </Text>
                  <ResultBars
                    earlyCaption={
                      poll.isOngoing && turnout.voted > 0 && turnout.voted < 3
                        ? earlyResultCaption(turnout.voted, turnout.eligible)
                        : null
                    }
                    options={poll.options}
                    winningIndex={closed ? poll.winningOption : leader?.index}
                    userIndexes={userIndexes}
                    userWeights={userWeights}
                    size="md"
                  />
                </VStack>
              )}

              {/* h. Outcome banner (closed) */}
              {closed && !awaitingCount && (
                <OutcomeBanner poll={poll} />
              )}

              {/* i. Finalize zone (awaiting-count) */}
              {awaitingCount && onFinalize && (
                <Box borderRadius="xl" p={4} position="relative" overflow="hidden" zIndex={1}>
                  <GlassBack light />
                  <VStack align="stretch" spacing={3}>
                    <Text fontSize="sm" color="gray.100" lineHeight="1.6">
                      {FINALIZE_EXPLAINER}
                    </Text>
                    <Button
                      onClick={finalizeConfirm.onOpen}
                      minH="48px"
                      variant="outline"
                      borderColor="rgba(242, 131, 107, 0.5)"
                      color="#F6B3A0"
                      _hover={{ bg: VOTE_PALETTE.coralSoft }}
                      fontWeight="700"
                    >
                      {FINALIZE_VERB}
                    </Button>
                  </VStack>
                </Box>
              )}
            </VStack>
          )}
        </ModalBody>
      </ModalContent>

      {/* Finalize confirm dialog */}
      <AlertDialog
        isOpen={finalizeConfirm.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={finalizeConfirm.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent bg="gray.800" color="white" borderRadius="2xl">
            <AlertDialogHeader fontSize="lg" fontWeight="800">
              {FINALIZE_CONFIRM_TITLE}
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color="gray.200">
              {FINALIZE_CONFIRM_BODY}
              {turnout.voted < (poll.quorum || 0) && (
                <Text mt={2} color="#F6C177">{FINALIZE_SUBQUORUM}</Text>
              )}
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={finalizeConfirm.onClose} variant="outline" color="gray.200" borderColor="whiteAlpha.400" _hover={{ bg: 'whiteAlpha.100' }} isDisabled={finalizing}>
                Cancel
              </Button>
              <Button
                onClick={handleFinalize}
                ml={3}
                bg={amethyst}
                color="white"
                _hover={{ bg: amethystBright }}
                isLoading={finalizing}
                loadingText="Counting…"
              >
                {FINALIZE_VERB}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Modal>
  );
}

/** h. Outcome banner — pass/fail headline + execution-status explanation. */
function OutcomeBanner({ poll }) {
  const status = executionStatus(poll);
  const headline = outcomeHeadline(poll);
  return (
    <Box borderRadius="xl" p={4} position="relative" overflow="hidden" zIndex={1}>
      <GlassBack light />
      <VStack align="stretch" spacing={2}>
        <Text fontSize="sm" fontWeight="700" color={leaderText}>
          {headline}
        </Text>
        <HStack spacing={2} align="center">
          <Badge
            colorScheme={status.colorScheme}
            variant="subtle"
            px={2}
            py={0.5}
            borderRadius="md"
            textTransform="none"
            fontSize="2xs"
            fontWeight="700"
          >
            {status.label}
          </Badge>
          {status.canRetry && (
            <Text fontSize="2xs" color="gray.400">
              can be retried
            </Text>
          )}
        </HStack>
        <Text fontSize="xs" color="gray.200" lineHeight="1.5">
          {status.explain}
        </Text>
      </VStack>
    </Box>
  );
}

export default PollDetail;
