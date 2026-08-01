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
import BallotReview from "./create/BallotReview";
import useVoteDraft from "@/hooks/useVoteDraft";

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
// Types that get the "Review your ballot" confirm step (the others already
// render live previews inside their configurators).
const REVIEW_TYPES = new Set(["normal", "transferFunds"]);

const CreateVoteModal = ({
  isOpen,
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
  // Org contract addresses keyed by CONTRACT_MAP contextKey. Used to hide
  // rule-change actions targeting contracts this org never deployed.
  contractAddresses = null,
}) => {
  const { allRoles } = useRoleNames();
  const { orgChainId } = usePOContext();
  const { projectsData } = useProjectContext() || {};
  const orgNetwork = getNetworkByChainId(orgChainId);
  const nativeCurrencySymbol = orgNetwork?.nativeCurrency?.symbol || 'ETH';
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

  // ---- Confirm step (normal + transferFunds only) ----
  const [reviewing, setReviewing] = useState(false);
  // Reset review state whenever the modal closes or the type changes away from
  // a reviewable type.
  useEffect(() => {
    if (!isOpen) setReviewing(false);
  }, [isOpen]);
  useEffect(() => {
    if (!REVIEW_TYPES.has(proposal.type)) setReviewing(false);
  }, [proposal.type]);

  const isBinding = BINDING_TYPES.has(proposal.type);
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

  const firstError = useMemo(() => {
    const order = ['name', 'time', 'options', 'transferAddress', 'transferAmount', 'restrictedHatIds'];
    for (const k of order) if (fieldErrors[k]) return fieldErrors[k];
    return null;
  }, [fieldErrors]);

  // Setter/election/createRole have their own deeper validation at submit time;
  // for the disabled-button gate we only block on the basic inline errors that
  // apply to the currently-selected type.
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
    handleProposalTypeChange({ target: { value: type } });
  }, [handleProposalTypeChange]);

  const handleChangeType = useCallback(() => {
    // Return to the gallery by clearing the type (synthesize the empty select).
    handleProposalTypeChange({ target: { value: '' } });
    setReviewing(false);
  }, [handleProposalTypeChange]);

  // ---- Restore draft on open ----
  const handleRestoreDraft = useCallback(() => {
    if (!draft.pendingDraft) return;
    // handleSetterChange is the form's general-purpose merge setter — safe to
    // restore any subset of fields (options, setterValues, roleConfig, election
    // arrays, restrictions, etc.) in one shot.
    draft.markRestored();
    handleSetterChange({ ...draft.pendingDraft });
  }, [draft, handleSetterChange]);

  const handleStartFresh = useCallback(() => {
    draft.startFresh();
    // Reset back to the intent gallery so "start fresh" is a clean slate.
    handleProposalTypeChange({ target: { value: 'normal' } });
    handleSetterChange({
      name: '', description: '', time: 72, options: ['', ''],
      transferAddress: '', transferAmount: '', isRestricted: false, restrictedHatIds: [],
    });
    setReviewing(false);
  }, [draft, handleProposalTypeChange, handleSetterChange]);

  // ---- Submit ----
  const doSubmit = useCallback(async () => {
    const result = await handlePollCreated();
    if (result === true) {
      draft.clear();
      setReviewing(false);
    }
  }, [handlePollCreated, draft]);

  const handleFooterPrimary = useCallback(() => {
    if (isTourStep) return;
    // For reviewable types, first press goes to the review step.
    if (REVIEW_TYPES.has(proposal.type) && !reviewing) {
      setReviewing(true);
      return;
    }
    doSubmit();
  }, [isTourStep, proposal.type, reviewing, doSubmit]);

  const hasChosenType = Boolean(proposal.type);
  const primaryLabel = isTourStep
    ? 'Demo only'
    : reviewing
      ? 'Create vote'
      : REVIEW_TYPES.has(proposal.type)
        ? 'Review ballot'
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

            {reviewing ? (
              /* ---- Review your ballot (normal + transferFunds) ---- */
              <BallotReview
                proposal={proposal}
                whoCanVoteLabel={whoCanVoteLabel}
                nativeCurrencySymbol={nativeCurrencySymbol}
              />
            ) : !hasChosenType ? (
              /* ---- Intent gallery ---- */
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
                {/* Selected-type chip + change */}
                <HStack justify="space-between" flexWrap="wrap" spacing={2}>
                  <Tag size="md" colorScheme="purple" variant="subtle" borderRadius="full">
                    <TagLabel>{selectedIntent?.title || proposal.type}</TagLabel>
                  </Tag>
                  <Link fontSize="sm" color="purple.200" onClick={handleChangeType}>
                    change
                  </Link>
                </HStack>

                {/* Binding-governance banner */}
                {isBinding && (
                  <Alert status="info" borderRadius="md" bg="rgba(66, 153, 225, 0.15)" fontSize="sm">
                    <AlertIcon color="blue.300" />
                    <Text color="gray.200">
                      This creates a binding vote — it runs through your group's official
                      Blended-voting governance.
                    </Text>
                  </Alert>
                )}

                {/* Vote Details Section */}
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
                  </VStack>
                </Box>

                {/* Vote Configuration Section */}
                <Box>
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    color="purple.300"
                    mb={3}
                    textTransform="uppercase"
                    letterSpacing="wide"
                  >
                    Vote Configuration
                  </Text>
                  <VStack spacing={4} align="stretch">
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
                        contractAddresses={contractAddresses}
                      />
                    )}
                  </VStack>
                </Box>

                {/* Voting Restrictions — only for direct-democracy types */}
                {proposal.type !== "election" && proposal.type !== "setter" && proposal.type !== "createRole" && (
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
            {reviewing ? (
              <Button
                variant="ghost"
                onClick={() => setReviewing(false)}
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
                to "what do you want to do?" reads broken, not disabled. */}
            {hasChosenType && (
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
