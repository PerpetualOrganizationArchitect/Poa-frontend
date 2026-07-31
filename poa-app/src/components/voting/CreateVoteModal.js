import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useTour } from "@/features/tour";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Button,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
  Select,
  Textarea,
  Text,
  Box,
  Alert,
  AlertIcon,
  Tooltip,
  Switch,
  Checkbox,
  Wrap,
  WrapItem,
  IconButton,
  Tag,
  TagLabel,
  Link,
} from "@chakra-ui/react";
import { InfoOutlineIcon, AddIcon, CloseIcon } from "@chakra-ui/icons";
import { useRoleNames } from "@/hooks";
import { usePOContext } from "@/context/POContext";
import { useProjectContext } from "@/context/ProjectContext";
import { getNetworkByChainId } from "../../config/networks";
import SetterActionSelector from "./SetterActionSelector";
import ElectionConfigurator from "./ElectionConfigurator";
import RoleConfigurator, { parseAutoTitle as parseRoleAutoTitle } from "./RoleConfigurator";
import { inputStyles } from '@/components/shared/glassStyles';
import IntentGallery, { INTENT_OPTIONS } from "./create/IntentGallery";
import DurationField from "./create/DurationField";
import BallotReview, { BINDING_REVIEW_BADGE } from "./create/BallotReview";
import useVoteDraft from "@/hooks/useVoteDraft";
import {
  STEP_INTENT,
  STEP_CONFIG,
  STEP_DETAILS,
  STEP_REVIEW,
  CONFIG_TYPES,
  stepsForType,
  resolveEntryStep,
  STEP_ERROR_KEYS,
} from "./create/wizardSteps";
import { configError as computeConfigError, isComplete } from "@/lib/voting/proposalChecks";
import { applyAutoCopy, backfillProvenance } from "./create/autoCopy";

const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backgroundColor: "rgba(15, 10, 25, 0.97)",
  boxShadow: "inset 0 0 15px rgba(148, 115, 220, 0.15)",
  border: "1px solid rgba(148, 115, 220, 0.3)",
};

// Fields the confirm step + who-can-vote helpers rely on. Types that route
// through official Blended-voting governance.
const BINDING_TYPES = new Set(["election", "createRole", "setter"]);

// Per-step heading shown under "Create a vote". The config step's title depends
// on the intent, since "Choose the rule change" and "Set up the election" are
// very different screens.
const CONFIG_STEP_TITLES = {
  setter: "Choose the rule change",
  election: "Set up the election",
  createRole: "Configure the role",
  transferFunds: "Choose the payment",
};

function stepTitle(step, type) {
  if (step === STEP_CONFIG) return CONFIG_STEP_TITLES[type] || "Configure";
  if (step === STEP_DETAILS) return "Vote details";
  if (step === STEP_REVIEW) return "Review your ballot";
  return "";
}

const CreateVoteModal = ({
  isOpen,
  deepLinkedOpen = false,
  onClose,
  proposal,
  handleInputChange,
  handleOptionChange,
  addOption,
  removeOption,
  handleProposalTypeChange,
  handleTransferAddressChange,
  handleTransferAmountChange,
  handleRestrictedToggle,
  toggleRestrictedRole,
  handleSetterChange,
  handlePollCreated,
  loadingSubmit,
  // Optional overrides — CreateVoteModal derives projects from ProjectContext
  // when these aren't provided (ProjectProvider sits above the voting page in
  // _app.js). Kept as props so callers can still inject test data.
  allProjects: allProjectsProp,
  roleNames = {},
  projectNames: projectNamesProp,
  votingClasses = [],
  currentValues = null,
  leaderboardData = [],
  ongoingProposals = [],
}) => {
  const { allRoles } = useRoleNames();
  const { orgChainId } = usePOContext();
  const { projectsData } = useProjectContext() || {};
  const orgNetwork = getNetworkByChainId(orgChainId);
  const nativeCurrencySymbol = orgNetwork?.nativeCurrency?.symbol || 'ETH';

  // Assets a treasury payout can move. Native only for now — see the Asset
  // field below for why. Adding ERC20s here is the whole change once
  // PaymentManager.withdraw works for tokens.
  const transferAssetOptions = useMemo(() => ([
    { symbol: nativeCurrencySymbol, label: `${nativeCurrencySymbol} — the group's native currency` },
  ]), [nativeCurrencySymbol]);
  const { currentStepDef, isActive: isTourActive } = useTour();
  const isTourStep = isTourActive && currentStepDef?.id === 'create-vote-preview';

  // Derive project data from ProjectContext, with props as overrides. This
  // un-bricks RoleConfigurator's "Add project" and the "Set Project Role
  // Permissions" setter template without any VotingPage change.
  const allProjects = useMemo(() => {
    if (allProjectsProp && allProjectsProp.length > 0) return allProjectsProp;
    return projectsData || [];
  }, [allProjectsProp, projectsData]);

  const projectNames = useMemo(() => {
    if (projectNamesProp && Object.keys(projectNamesProp).length > 0) return projectNamesProp;
    const map = {};
    for (const p of (projectsData || [])) {
      if (p?.id) map[p.id] = p.name || p.title || p.id;
    }
    return map;
  }, [projectNamesProp, projectsData]);

  // ---- Draft autosave ----
  const draft = useVoteDraft({ isOpen, proposal });

  // ---- Touched gating for inline errors ----
  // A pristine form must not open covered in red: error styling appears only
  // after the member has interacted with (blurred/changed) that field. The
  // Create button still gates on the FULL error set + names the first missing
  // thing in its tooltip.
  const [touched, setTouched] = useState({});
  useEffect(() => {
    if (isOpen) setTouched({});
  }, [isOpen]);
  const markTouched = useCallback((key) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  // ---- Wizard step machine ----
  // The gallery renders off `step`, NOT off `!proposal.type`. That is what makes
  // a fresh open always land on "what do you want to do?" even though
  // defaultProposal.type is still "normal" — and it keeps `type: ''` unreachable,
  // so useProposalForm's empty-type branches (buildProposalData's trailing else,
  // the validator switchboard, VotingPage's DD-vs-hybrid routing) stay dead.
  const [step, setStep] = useState(STEP_INTENT);

  const steps = useMemo(() => stepsForType(proposal.type), [proposal.type]);
  const stepIndex = steps.indexOf(step);
  const nextStep = steps[stepIndex + 1] || null;
  const prevStep = stepIndex > 0 ? steps[stepIndex - 1] : null;

  // Re-derive the entry step on every open. One walk covers all of it: a
  // pristine form stops at the gallery, a deep-linked setter payload
  // (VotingPage.handleProposeRuleChange batches restoreProposal + open in the
  // same tick) stops at details, a restored draft stops where it left off.
  useEffect(() => {
    if (!isOpen) return;
    // A deep link arrives with its config already satisfied and should land on
    // the step that payload reaches. Every other open starts at the gallery —
    // including reopening after abandoning a half-built vote, where resolving
    // to "first incomplete step" would drop the member back into the middle of
    // a flow they just left. Draft restore does its own resolve, on click.
    setStep(deepLinkedOpen ? resolveEntryStep(proposal, { isComplete }) : STEP_INTENT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, deepLinkedOpen]);

  // Clamp if the type changes out from under the current step.
  useEffect(() => {
    setStep((s) => (stepsForType(proposal.type).includes(s) ? s : STEP_INTENT));
  }, [proposal.type]);

  // ---- transferFunds prefill ----
  // The payout IS the decision, so once recipient + amount are valid the title
  // and description write themselves. The other four types are prefilled by
  // their own configurators; this one has no configurator to own it.
  // applyAutoCopy returns {} once the copy matches what we last wrote (or the
  // member has edited it), so this settles after one pass instead of looping.
  useEffect(() => {
    if (proposal.type !== 'transferFunds') return;
    const address = proposal.transferAddress || '';
    const amount = parseFloat(proposal.transferAmount);
    if (!/^0x[a-fA-F0-9]{40}$/.test(address) || isNaN(amount) || amount <= 0) return;
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    // Unlike the configurators, this effect refires on every keystroke — so an
    // empty field here means the member is deleting our suggestion, not that
    // there is nothing yet. Refilling it would make the box impossible to clear.
    const clearedTitle = !proposal.name && Boolean(proposal.autoTitle);
    const clearedDescription = !proposal.description && Boolean(proposal.autoDescription);
    const patch = applyAutoCopy(proposal, {
      title: clearedTitle ? null : `Send ${amount} ${nativeCurrencySymbol} to ${short}`,
      description: clearedDescription
        ? null
        : `If this vote passes: send ${amount} ${nativeCurrencySymbol} from the treasury to ${short}.`,
    });
    if (Object.keys(patch).length > 0) handleSetterChange(patch);
  }, [
    proposal.type, proposal.transferAddress, proposal.transferAmount,
    proposal.name, proposal.description, proposal.autoTitle, proposal.autoDescription,
    nativeCurrencySymbol, handleSetterChange, proposal,
  ]);

  const isBinding = BINDING_TYPES.has(proposal.type);

  // The ballot as voters will actually see it. The binding types don't keep
  // their choices in `proposal.options` — those are synthesized at submit time
  // — so without this the review screen reads "(no options yet)" for a vote
  // that is really Apply Changes / Reject. Mirrors the optionNames built in
  // useProposalForm.buildProposalData for each type.
  const reviewOptions = useMemo(() => {
    if (proposal.type === 'setter') return ['Apply Changes', 'Reject'];
    if (proposal.type === 'createRole') return ['Create role', 'Reject'];
    if (proposal.type === 'election') {
      const names = (proposal.electionCandidates || []).map(c => c.name).filter(Boolean);
      return proposal.electionIncludeNoOneOption ? [...names, 'No One'] : names;
    }
    // normal + transferFunds already derive correctly inside BallotReview.
    return undefined;
  }, [
    proposal.type,
    proposal.electionCandidates,
    proposal.electionIncludeNoOneOption,
  ]);
  const selectedIntent = useMemo(
    () => INTENT_OPTIONS.find(o => o.type === proposal.type),
    [proposal.type],
  );

  // Build a list of currently-active createRole proposals, keyed by parent
  // hatId. We parse the auto-title sentinel "Create role: <name> (under <parent>)"
  // and resolve the parent NAME back to its hatId via allRoles. This is what
  // gates concurrent role creation under the same parent (which would race
  // on Hats.getNextId — see useProposalForm createRole branch).
  const activeCreateRoleProposals = useMemo(() => {
    const out = [];
    for (const p of (ongoingProposals || [])) {
      const parsed = parseRoleAutoTitle(p.title);
      if (!parsed) continue;
      const parentRole = allRoles.find(r => r.name === parsed.parentName);
      if (!parentRole) continue;
      out.push({
        proposalId: p.proposalId ?? p.id,
        name: parsed.name,
        parentName: parsed.parentName,
        parentHatId: String(parentRole.hatId),
        title: p.title,
      });
    }
    return out;
  }, [ongoingProposals, allRoles]);

  // ---- Inline validation (mirrors useProposalForm.fieldErrors; kept local so
  // this component stays compatible with the current VotingPage prop set) ----
  const fieldErrors = useMemo(() => {
    const errors = {};
    const setterProvidesTitle =
      proposal.type === 'setter' && proposal.setterMode === 'template' && proposal.setterTemplate;
    if (!setterProvidesTitle && (!proposal.name || proposal.name.trim() === '')) {
      errors.name = 'Give your vote a title.';
    }
    const durationHours = Number(proposal.time);
    if (isNaN(durationHours) || durationHours < 1) {
      errors.time = 'Voting must run for at least 1 hour.';
    }
    if (proposal.type === 'normal') {
      const nonEmpty = (proposal.options || []).filter(o => o.trim() !== '');
      if (nonEmpty.length < 2) errors.options = 'Add at least 2 options.';
    }
    if (proposal.type === 'transferFunds') {
      if (!proposal.transferAddress || !/^0x[a-fA-F0-9]{40}$/.test(proposal.transferAddress)) {
        errors.transferAddress = 'Enter a valid recipient address (0x…).';
      }
      const amt = parseFloat(proposal.transferAmount);
      if (isNaN(amt) || amt <= 0) errors.transferAmount = 'Enter an amount greater than 0.';
    }
    if (proposal.isRestricted && (proposal.restrictedHatIds?.length ?? 0) === 0) {
      errors.restrictedHatIds = 'Pick at least one role, or turn restriction off.';
    }
    return errors;
  }, [proposal]);

  // Errors shown in the UI — only for fields the member has touched.
  const visibleErrors = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(fieldErrors)) {
      if (touched[k]) out[k] = v;
    }
    return out;
  }, [fieldErrors, touched]);

  // The config screen's gate is a predicate, not a field-key list — it is the
  // same expression the submit-time validators use (lifted into
  // lib/voting/proposalChecks so there is exactly one copy of each message).
  const configError = useMemo(() => computeConfigError(proposal), [proposal]);

  // Only complain about something the member can actually see. A blank title on
  // the details step must not disable Next on the config step, and the
  // disabled-button tooltip can never name a field two screens away.
  //
  // `review` is the last gate, so it ORs in configError too: pressing "Create
  // vote" can never toast about a config problem the user would have to
  // navigate back to.
  const firstError = useMemo(() => {
    if (step === STEP_CONFIG) return configError;
    for (const k of (STEP_ERROR_KEYS[step] || [])) {
      if (fieldErrors[k]) return fieldErrors[k];
    }
    if (step === STEP_REVIEW) return configError;
    return null;
  }, [step, configError, fieldErrors]);

  // Gates leaving the current step (and, on the last step, submitting).
  const canSubmit = !firstError && !isTourStep;

  const whoCanVoteLabel = useMemo(() => {
    if (isBinding) return 'All members (Blended voting)';
    if (!proposal.isRestricted) return 'All members';
    const names = (allRoles || [])
      .filter(r => proposal.restrictedHatIds?.includes(r.hatId))
      .map(r => r.name);
    return names.length ? names.join(', ') : 'All members';
  }, [isBinding, proposal.isRestricted, proposal.restrictedHatIds, allRoles]);

  // ---- Type selection via the intent gallery / change-chip ----
  const handleSelectIntent = useCallback((type) => {
    // Re-picking the card you already chose must not wipe your work —
    // handleProposalTypeChange clears options / election fields / roleConfig.
    if (type !== proposal.type) handleProposalTypeChange({ target: { value: type } });
    setStep(CONFIG_TYPES.has(type) ? STEP_CONFIG : STEP_DETAILS);
  }, [proposal.type, handleProposalTypeChange]);

  // Back to the gallery is now pure navigation. It used to synthesize an empty
  // select, which ran the full clear branch in handleProposalTypeChange and
  // destroyed everything the member had entered just for looking.
  const handleChangeType = useCallback(() => setStep(STEP_INTENT), []);

  const goBack = useCallback(() => {
    if (prevStep) setStep(prevStep);
  }, [prevStep]);

  // ---- Restore draft on open ----
  const handleRestoreDraft = useCallback(() => {
    if (!draft.pendingDraft) return;
    // handleSetterChange is the form's general-purpose merge setter — safe to
    // restore any subset of fields (options, setterValues, roleConfig, election
    // arrays, restrictions, etc.) in one shot.
    //
    // backfillProvenance teaches a draft saved before autoTitle/autoDescription
    // existed which of its copy we generated, so restoring one keeps its
    // regenerate-on-change behaviour instead of freezing as "user typed this".
    const restored = backfillProvenance(draft.pendingDraft);
    draft.markRestored();
    handleSetterChange({ ...restored });
    setStep(resolveEntryStep(restored, { isComplete }));
  }, [draft, handleSetterChange]);

  const handleStartFresh = useCallback(() => {
    draft.startFresh();
    handleProposalTypeChange({ target: { value: 'normal' } });
    handleSetterChange({
      name: '', description: '', autoTitle: '', autoDescription: '',
      time: 72, options: ['', ''],
      transferAddress: '', transferAmount: '', isRestricted: false, restrictedHatIds: [],
      // The setter block was never cleared here, so "Start fresh" used to leave
      // the previous rule change armed behind a blank-looking form.
      setterMode: 'template', setterTemplate: '', setterCategory: '',
      setterContract: '', setterFunction: '', setterValues: {}, setterParams: [],
    });
    setStep(STEP_INTENT);
  }, [draft, handleProposalTypeChange, handleSetterChange]);

  // ---- Submit ----
  const doSubmit = useCallback(async () => {
    const result = await handlePollCreated();
    if (result === true) {
      draft.clear();
      // Leave a clean gallery behind rather than a review screen over a form
      // that useProposalForm has already reset.
      setStep(STEP_INTENT);
    }
  }, [handlePollCreated, draft]);

  const handleFooterPrimary = useCallback(() => {
    if (isTourStep) return;
    if (nextStep) {
      setStep(nextStep);
      return;
    }
    doSubmit();
  }, [isTourStep, nextStep, doSubmit]);

  const primaryLabel = isTourStep
    ? 'Demo only'
    : nextStep === STEP_REVIEW
      ? 'Review ballot'
      : nextStep
        ? 'Next'
        : 'Create vote';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={{ base: 'full', md: 'xl' }}
      isCentered
      scrollBehavior="inside"
      {...(isTourStep && { zIndex: 10001 })}
    >
      <ModalOverlay bg={isTourStep ? "transparent" : "blackAlpha.800"} />
      <ModalContent
        bg="transparent"
        borderRadius={{ base: 'none', md: 'xl' }}
        position="relative"
        boxShadow="dark-lg"
        mx={{ base: 0, md: 4 }}
        maxH="min(85dvh, 900px)"
      >
        <Box style={glassLayerStyle} />

        <ModalHeader color="white" fontSize="xl" fontWeight="bold" pb={2}>
          Create a vote
          {step !== STEP_INTENT && (
            <Text fontSize="xs" fontWeight="medium" color="gray.400" mt={0.5} noOfLines={1}>
              Step {stepIndex + 1} of {steps.length} · {stepTitle(step, proposal.type)}
            </Text>
          )}
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody pb={6}>
          <VStack spacing={6} align="stretch">
            {/* Restore-draft prompt */}
            {draft.pendingDraft && (
              <Alert status="info" borderRadius="md" bg="rgba(148, 115, 220, 0.15)" fontSize="sm">
                <AlertIcon color="purple.300" />
                <HStack justify="space-between" w="100%" flexWrap="wrap" spacing={2}>
                  <Text color="gray.200">Restored your unsaved draft.</Text>
                  <HStack spacing={3}>
                    <Link color="purple.200" fontWeight="medium" onClick={handleRestoreDraft}>
                      Restore
                    </Link>
                    <Link color="gray.400" onClick={handleStartFresh}>
                      Start fresh?
                    </Link>
                  </HStack>
                </HStack>
              </Alert>
            )}

            {step === STEP_INTENT ? (
              /* ---- Step 1: intent gallery ---- */
              <Box>
                <Text
                  fontSize="xs"
                  fontWeight="bold"
                  color="purple.300"
                  mb={3}
                  textTransform="uppercase"
                  letterSpacing="wide"
                >
                  What do you want to do?
                </Text>
                <IntentGallery onSelect={handleSelectIntent} />
              </Box>
            ) : (
              <>
                {/* Selected-type chip + change. Hidden on review, which carries
                    its own BINDING/POLL badge. */}
                {step !== STEP_REVIEW && (
                  <HStack justify="space-between" flexWrap="wrap" spacing={2}>
                    <Tag size="md" colorScheme="purple" variant="subtle" borderRadius="full">
                      <TagLabel>{selectedIntent?.title || proposal.type}</TagLabel>
                    </Tag>
                    <Link fontSize="sm" color="purple.200" onClick={handleChangeType}>
                      change
                    </Link>
                  </HStack>
                )}

                {/* Binding-governance banner */}
                {isBinding && step !== STEP_REVIEW && (
                  <Alert status="info" borderRadius="md" bg="rgba(66, 153, 225, 0.15)" fontSize="sm">
                    <AlertIcon color="blue.300" />
                    <Text color="gray.200">
                      This creates a binding vote — it runs through your group's official
                      Blended-voting governance.
                    </Text>
                  </Alert>
                )}

                {/* ---- Review your ballot (final step, every type) ---- */}
                {step === STEP_REVIEW && (
                  <BallotReview
                    proposal={proposal}
                    whoCanVoteLabel={whoCanVoteLabel}
                    nativeCurrencySymbol={nativeCurrencySymbol}
                    {...(isBinding ? { badge: BINDING_REVIEW_BADGE } : {})}
                    {...(reviewOptions ? { options: reviewOptions } : {})}
                  />
                )}

                {/* Vote Details Section */}
                {step === STEP_DETAILS && (
                <Box>
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    color="purple.300"
                    mb={3}
                    textTransform="uppercase"
                    letterSpacing="wide"
                  >
                    Vote Details
                  </Text>
                  <VStack spacing={4} align="stretch">
                    <FormControl isInvalid={Boolean(visibleErrors.name)}>
                      <FormLabel color="gray.200" fontSize="sm">
                        Vote Title
                      </FormLabel>
                      <Input
                        placeholder="Enter title"
                        name="name"
                        value={proposal.name}
                        onChange={handleInputChange}
                        onBlur={() => markTouched('name')}
                        {...inputStyles}
                      />
                      {visibleErrors.name && <FormErrorMessage>{visibleErrors.name}</FormErrorMessage>}
                    </FormControl>

                    <FormControl>
                      <FormLabel color="gray.200" fontSize="sm">
                        Description
                      </FormLabel>
                      <Textarea
                        placeholder="Enter description"
                        name="description"
                        value={proposal.description}
                        onChange={handleInputChange}
                        h="120px"
                        {...inputStyles}
                      />
                    </FormControl>

                    <DurationField
                      value={proposal.time}
                      onChange={(hours) => {
                        markTouched('time');
                        handleInputChange({ target: { name: 'time', value: hours } });
                      }}
                      isInvalid={Boolean(visibleErrors.time)}
                      errorMessage={visibleErrors.time}
                    />

                    {/* A basic poll's options are its only decision, so they
                        stay here beside the title rather than earning a screen
                        of their own. */}
                    {proposal.type === "normal" && (
                      <FormControl isInvalid={Boolean(visibleErrors.options)}>
                        <FormLabel color="gray.200" fontSize="sm">
                          Voting Options
                        </FormLabel>
                        <VStack spacing={2} align="stretch">
                          {proposal.options.map((option, index) => (
                            <HStack key={index} spacing={2}>
                              <Input
                                placeholder={`Option ${index + 1}`}
                                value={option}
                                onChange={(e) => handleOptionChange(index, e.target.value)}
                                onBlur={() => markTouched('options')}
                                {...inputStyles}
                              />
                              <IconButton
                                aria-label="Remove option"
                                icon={<CloseIcon boxSize={2.5} />}
                                size="sm"
                                variant="ghost"
                                color="gray.400"
                                _hover={{ color: "red.300", bg: "whiteAlpha.100" }}
                                onClick={() => removeOption(index)}
                                isDisabled={proposal.options.length <= 2}
                              />
                            </HStack>
                          ))}
                          <Button
                            leftIcon={<AddIcon boxSize={3} />}
                            size="sm"
                            variant="ghost"
                            color="purple.300"
                            _hover={{ bg: "whiteAlpha.100" }}
                            onClick={addOption}
                            alignSelf="flex-start"
                          >
                            Add Option
                          </Button>
                          {visibleErrors.options && (
                            <FormErrorMessage>{visibleErrors.options}</FormErrorMessage>
                          )}
                        </VStack>
                      </FormControl>
                    )}
                  </VStack>
                </Box>
                )}

                {/* Vote Configuration Section — the type-specific decisions.
                    On its own screen, before the details, so the title and
                    description can arrive pre-filled from these answers. */}
                {step === STEP_CONFIG && (
                <Box>
                  <VStack spacing={4} align="stretch">
                    {proposal.type === "election" && (
                      <ElectionConfigurator
                        proposal={proposal}
                        onChange={handleSetterChange}
                        allRoles={allRoles}
                        leaderboardData={leaderboardData}
                      />
                    )}

                    {proposal.type === "createRole" && (
                      <RoleConfigurator
                        proposal={proposal}
                        onChange={handleSetterChange}
                        allRoles={allRoles}
                        allProjects={allProjects}
                        leaderboardData={leaderboardData}
                        activeCreateRoleProposals={activeCreateRoleProposals}
                      />
                    )}

                    {proposal.type === "transferFunds" && (
                      <>
                        {/* Asset. Only the chain's native currency is offered
                            today: proposal batches execute as the Executor, and
                            an ERC20 payout has to route through
                            PaymentManager.withdraw, which reverts
                            InsufficientFunds on the deployed contract (verified
                            on a Gnosis fork). Driven off a list so adding tokens
                            is a data change once contracts support it. */}
                        <FormControl>
                          <FormLabel color="gray.200" fontSize="sm">
                            Asset
                          </FormLabel>
                          <Select
                            value={nativeCurrencySymbol}
                            isDisabled={transferAssetOptions.length <= 1}
                            onChange={() => {}}
                            {...inputStyles}
                          >
                            {transferAssetOptions.map((asset) => (
                              <option key={asset.symbol} value={asset.symbol} style={{ background: '#1a1a2e' }}>
                                {asset.label}
                              </option>
                            ))}
                          </Select>
                        </FormControl>

                        <FormControl isInvalid={Boolean(visibleErrors.transferAddress)}>
                          <FormLabel color="gray.200" fontSize="sm">
                            Recipient Address
                          </FormLabel>
                          <Input
                            placeholder="0x..."
                            value={proposal.transferAddress}
                            onChange={handleTransferAddressChange}
                            onBlur={() => markTouched('transferAddress')}
                            {...inputStyles}
                          />
                          {visibleErrors.transferAddress && (
                            <FormErrorMessage>{visibleErrors.transferAddress}</FormErrorMessage>
                          )}
                        </FormControl>

                        <FormControl isInvalid={Boolean(visibleErrors.transferAmount)}>
                          <FormLabel color="gray.200" fontSize="sm">
                            Amount ({nativeCurrencySymbol})
                          </FormLabel>
                          <Input
                            placeholder={`Amount in ${nativeCurrencySymbol}`}
                            value={proposal.transferAmount}
                            onChange={handleTransferAmountChange}
                            onBlur={() => markTouched('transferAmount')}
                            type="number"
                            step="0.001"
                            min="0"
                            {...inputStyles}
                          />
                          {visibleErrors.transferAmount && (
                            <FormErrorMessage>{visibleErrors.transferAmount}</FormErrorMessage>
                          )}
                        </FormControl>

                        <Box
                          bg="whiteAlpha.50"
                          borderRadius="md"
                          p={3}
                          border="1px solid rgba(148, 115, 220, 0.3)"
                        >
                          <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={2}>
                            Voting Options:
                          </Text>
                          <VStack align="start" spacing={1} pl={2}>
                            <Text fontSize="sm" color="green.300">✓ Yes - Execute transfer</Text>
                            <Text fontSize="sm" color="red.300">✗ No - Reject transfer</Text>
                          </VStack>
                        </Box>

                        <Alert status="info" borderRadius="md" bg="rgba(66, 153, 225, 0.15)">
                          <AlertIcon color="blue.300" />
                          <Text fontSize="sm" color="gray.300">
                            This creates a Yes/No vote. If "Yes" wins, the transfer executes automatically from the organization's treasury.
                          </Text>
                        </Alert>
                      </>
                    )}

                    {proposal.type === "setter" && (
                      <SetterActionSelector
                        proposal={proposal}
                        onChange={handleSetterChange}
                        allRoles={allRoles}
                        allProjects={allProjects}
                        roleNames={roleNames}
                        votingClasses={votingClasses}
                        currentValues={currentValues}
                        projectNames={projectNames}
                      />
                    )}
                  </VStack>
                </Box>
                )}

                {/* Voting Restrictions — only for direct-democracy types */}
                {step === STEP_DETAILS && proposal.type !== "election" && proposal.type !== "setter" && proposal.type !== "createRole" && (
                  <Box>
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      color="purple.300"
                      mb={3}
                      textTransform="uppercase"
                      letterSpacing="wide"
                    >
                      Voting Restrictions
                    </Text>
                    <VStack spacing={4} align="stretch">
                      <FormControl display="flex" alignItems="center">
                        <HStack flex="1">
                          <FormLabel htmlFor="restricted-voting" mb="0" color="gray.200" fontSize="sm">
                            Restrict who can vote
                          </FormLabel>
                          <Tooltip
                            label="Limit voting to specific roles instead of all members"
                            placement="top"
                            hasArrow
                            bg="gray.700"
                          >
                            <InfoOutlineIcon boxSize={3} color="gray.400" cursor="help" />
                          </Tooltip>
                        </HStack>
                        <Switch
                          id="restricted-voting"
                          isChecked={proposal.isRestricted}
                          onChange={(e) => { markTouched('restrictedHatIds'); handleRestrictedToggle(e.target.checked); }}
                          colorScheme="purple"
                        />
                      </FormControl>

                      {proposal.isRestricted && (
                        <FormControl isInvalid={Boolean(visibleErrors.restrictedHatIds)}>
                          <Box
                            p={4}
                            bg="whiteAlpha.50"
                            borderRadius="md"
                            border="1px solid rgba(148, 115, 220, 0.3)"
                          >
                            <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={3}>
                              Select which roles can vote:
                            </Text>
                            <Wrap spacing={2}>
                              {allRoles?.map((role) => (
                                <WrapItem key={role.hatId}>
                                  <Checkbox
                                    isChecked={proposal.restrictedHatIds?.includes(role.hatId)}
                                    onChange={() => toggleRestrictedRole(role.hatId)}
                                    colorScheme="purple"
                                    size="md"
                                  >
                                    <Text fontSize="sm" color="white">{role.name}</Text>
                                  </Checkbox>
                                </WrapItem>
                              ))}
                            </Wrap>
                            {visibleErrors.restrictedHatIds && (
                              <FormErrorMessage>{visibleErrors.restrictedHatIds}</FormErrorMessage>
                            )}
                          </Box>
                        </FormControl>
                      )}
                    </VStack>
                  </Box>
                )}
              </>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
          <HStack spacing={3} w="100%" justify="flex-end">
            {prevStep ? (
              <Button
                variant="ghost"
                onClick={goBack}
                color="gray.400"
                _hover={{ bg: "whiteAlpha.100", color: "white" }}
              >
                Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={onClose}
                color="gray.400"
                _hover={{ bg: "whiteAlpha.100", color: "white" }}
              >
                Cancel
              </Button>
            )}
            {/* No primary while the intent gallery is open — a grayed CTA next
                to "what do you want to do?" reads broken, not disabled. The
                tour is the exception: its disabled "Demo only" button is the
                affordance the create-vote-preview step points at. */}
            {(step !== STEP_INTENT || isTourStep) && (
              <Tooltip
                label={isTourStep
                  ? "Demo only — finish the tour to create a real proposal"
                  : firstError || ''}
                isDisabled={!isTourStep && !firstError}
                hasArrow
                placement="top"
              >
                {/* span wrapper so the tooltip still shows on a disabled button */}
                <Box>
                  <Button
                    colorScheme="purple"
                    onClick={handleFooterPrimary}
                    isLoading={loadingSubmit}
                    loadingText="Creating..."
                    isDisabled={!canSubmit}
                  >
                    {primaryLabel}
                  </Button>
                </Box>
              </Tooltip>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateVoteModal;
