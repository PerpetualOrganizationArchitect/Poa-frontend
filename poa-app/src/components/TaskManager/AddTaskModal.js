import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import DeadlineFields from './DeadlineFields';
import { localDateStrToEndOfDaySec, secToLocalDateStr } from '@/util/deadlineUtils';
import {
  Button,
  ButtonGroup,
  Checkbox,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  ModalFooter,
  VStack,
  HStack,
  Select,
  Spacer,
  Textarea,
  useToast,
  InputGroup,
  InputRightAddon,
  Switch,
  Text,
  Box,
  Tooltip,
  IconButton,
  SimpleGrid,
  Image,
  Link,
} from '@chakra-ui/react';
import { InfoIcon, CloseIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { getBountyTokenOptions, BOUNTY_TOKENS } from '../../util/tokens';
import { usePOContext } from '../../context/POContext';
import { UserSearchInput } from '@/components/common';
import UserIdentity from '@/components/common/UserIdentity';
import { calculatePayout, DIFFICULTY_CONFIG, normalizeHourlyRate, formatEstTime } from '@/util/taskUtils';
import { inputStyles } from '@/components/shared/glassStyles';
import DraftRow from './DraftRow';
import EstTimePicker from './EstTimePicker';
import { useKeepFieldsPref } from '@/hooks/useTaskDrafts';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(15, 10, 25, 0.97)',
  boxShadow: 'inset 0 0 15px rgba(148, 115, 220, 0.15)',
  border: '1px solid rgba(148, 115, 220, 0.3)',
};

const selectStyles = {
  ...inputStyles,
  sx: {
    '& option': {
      bg: 'gray.800',
      color: 'white',
    },
  },
};

const ModeToggle = ({ mode, onChange }) => (
  <ButtonGroup size="sm" isAttached variant="outline" alignSelf="center">
    <Button
      colorScheme="purple"
      variant={mode === 'quick' ? 'solid' : 'outline'}
      color={mode === 'quick' ? 'white' : 'purple.200'}
      onClick={() => onChange('quick')}
    >
      Add immediately
    </Button>
    <Button
      colorScheme="purple"
      variant={mode === 'draft' ? 'solid' : 'outline'}
      color={mode === 'draft' ? 'white' : 'purple.200'}
      onClick={() => onChange('draft')}
    >
      Save as draft
    </Button>
  </ButtonGroup>
);

const DraftsPanel = ({
  drafts,
  editingDraftId,
  onEditDraft,
  onDeleteDraft,
  onSubmitDrafts,
  isSubmittingDrafts,
  tokenLabel,
}) => {
  const { taskPayoutHoursOnly, taskPayoutHourlyRate } = usePOContext();
  const totalPayout = useMemo(
    () => drafts.reduce(
      (sum, d) => sum + calculatePayout(d.difficulty, d.estHours, { hoursOnly: taskPayoutHoursOnly, hourlyRate: taskPayoutHourlyRate }),
      0
    ),
    [drafts, taskPayoutHoursOnly, taskPayoutHourlyRate]
  );

  return (
    <VStack
      align="stretch"
      spacing={3}
      h="100%"
      p={4}
      borderRadius="lg"
      bg="whiteAlpha.50"
      border="1px solid"
      borderColor="whiteAlpha.100"
    >
      <HStack justify="space-between" align="baseline">
        <Text color="white" fontSize="sm" fontWeight="bold">
          Drafts ({drafts.length})
        </Text>
        {drafts.length > 0 && (
          <Text color="purple.200" fontSize="xs">
            {totalPayout} {tokenLabel} total
          </Text>
        )}
      </HStack>

      <Box flex="1" overflowY="auto" maxH="60vh" minH="120px">
        {drafts.length === 0 ? (
          <Text color="gray.500" fontSize="xs" textAlign="center" mt={6} px={2}>
            Drafts will appear here. Submit them all in one transaction when you&apos;re ready.
          </Text>
        ) : (
          <VStack align="stretch" spacing={2}>
            {drafts.map((d) => (
              <DraftRow
                key={d.draftId}
                draft={d}
                onEdit={onEditDraft}
                onDelete={onDeleteDraft}
                isActive={d.draftId === editingDraftId}
                compact
              />
            ))}
          </VStack>
        )}
      </Box>

      <Button
        colorScheme="purple"
        onClick={onSubmitDrafts}
        isDisabled={drafts.length === 0 || isSubmittingDrafts}
        isLoading={isSubmittingDrafts}
        loadingText="Submitting..."
      >
        Submit {drafts.length} draft{drafts.length === 1 ? '' : 's'}
      </Button>
    </VStack>
  );
};

const AddTaskModal = ({
  isOpen,
  onClose,
  onAddTask,
  mode = 'quick',
  onModeChange,
  drafts = [],
  onSaveDraft,
  onDeleteDraft,
  onSubmitDrafts,
  isSubmittingDrafts = false,
  initialEditingDraftId = null,
  // Whether to offer an assignee. Naming one routes the submit through
  // `createAndAssignTask`, which requires CREATE **and** ASSIGN together — so
  // parents pass the conjunction (`perms.canCreateAndAssign`), not just ASSIGN.
  // This component has no project in scope; both mount points resolve one.
  canAssign = false,
}) => {
  const { orgChainId, tokenLabel, taskPayoutHoursOnly, taskPayoutHourlyRate } = usePOContext();
  const isDraftMode = mode === 'draft';
  const showAssign = !isDraftMode && canAssign;

  const tokenOptions = useMemo(() => getBountyTokenOptions(orgChainId), [orgChainId]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [estHours, setEstHours] = useState(0.5);
  const [hasBounty, setHasBounty] = useState(false);
  const [bountyToken, setBountyToken] = useState('');
  const [bountyAmount, setBountyAmount] = useState('');
  const [requiresApplication, setRequiresApplication] = useState(false);
  // Deadlines (v6): soft due date + optional on-chain enforcement + claim window
  const [hasDeadlines, setHasDeadlines] = useState(false);
  const [dueDateStr, setDueDateStr] = useState('');
  const [enforceOnChain, setEnforceOnChain] = useState(false);
  const [completionWindowSec, setCompletionWindowSec] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState(initialEditingDraftId);
  const [keepFields, setKeepFields] = useKeepFieldsPref();

  const toast = useToast();

  const estimatedPayout = useMemo(
    () => calculatePayout(difficulty, estHours, { hoursOnly: taskPayoutHoursOnly, hourlyRate: taskPayoutHourlyRate }),
    [difficulty, estHours, taskPayoutHoursOnly, taskPayoutHourlyRate]
  );

  useEffect(() => {
    if (tokenOptions.length > 0 && !bountyToken) {
      setBountyToken(tokenOptions[0].address);
    }
  }, [tokenOptions, bountyToken]);

  const populateFromDraft = useCallback(
    (draft) => {
      if (!draft) return;
      setName(draft.name || '');
      setDescription(draft.description || '');
      setDifficulty(draft.difficulty || 'easy');
      setEstHours(draft.estHours ?? 0.5);
      const draftHasBounty =
        draft.bountyToken &&
        draft.bountyToken !== BOUNTY_TOKENS.NONE.address &&
        draft.bountyAmount &&
        Number(draft.bountyAmount) > 0;
      setHasBounty(!!draftHasBounty);
      if (draftHasBounty) {
        setBountyToken(draft.bountyToken);
        setBountyAmount(draft.bountyAmount);
      } else {
        // Reset to default token so a later bounty toggle doesn't surface
        // whatever token was selected for a previous draft.
        setBountyToken(tokenOptions[0]?.address || '');
        setBountyAmount('');
      }
      setRequiresApplication(!!draft.requiresApplication);
      // Old drafts predate deadlines and simply lack these keys.
      setHasDeadlines(!!(draft.dueDate || draft.completionWindow));
      setDueDateStr(draft.dueDate ? secToLocalDateStr(draft.dueDate) : '');
      setEnforceOnChain(!!draft.absoluteDeadline);
      setCompletionWindowSec(Number(draft.completionWindow) || 0);
      setSelectedUser(null);
    },
    [tokenOptions]
  );

  // When parent passes a NEW draft to edit, populate the form. Tracks the
  // last consumed initialEditingDraftId in a ref so internal clears (e.g.
  // the mode-change effect or handleCancelEdit) don't trigger re-population
  // — only a fresh value from the parent does.
  const consumedInitialEditingRef = useRef(null);
  useEffect(() => {
    if (
      initialEditingDraftId &&
      initialEditingDraftId !== consumedInitialEditingRef.current
    ) {
      const draft = drafts.find((d) => d.draftId === initialEditingDraftId);
      if (draft) {
        consumedInitialEditingRef.current = initialEditingDraftId;
        setEditingDraftId(initialEditingDraftId);
        populateFromDraft(draft);
      }
    }
  }, [initialEditingDraftId, drafts, populateFromDraft]);

  // When mode changes, drop edit context and clear any picked assignee.
  // Without this:
  //   - Switching quick → draft mid-edit hides the "Editing draft" banner but
  //     keeps editingDraftId set, so toggling back unexpectedly resurfaces it
  //     even after the user has heavily edited the form.
  //   - A user who picks an assignee in quick mode and then toggles to draft
  //     would have that assignee silently dropped at submission (createTasksBatch
  //     has no per-item assignee — see POP #152). Clearing here makes the loss
  //     explicit instead of invisible.
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    setEditingDraftId(null);
    if (mode === 'draft') {
      setSelectedUser(null);
    }
  }, [mode]);

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setDifficulty('easy');
    setEstHours(0.5);
    setHasBounty(false);
    setBountyToken(tokenOptions[0]?.address || '');
    setBountyAmount('');
    setRequiresApplication(false);
    setHasDeadlines(false);
    setDueDateStr('');
    setEnforceOnChain(false);
    setCompletionWindowSec(0);
    setSelectedUser(null);
    setEditingDraftId(null);
  }, [tokenOptions]);

  const resetNameAndDescriptionOnly = useCallback(() => {
    setName('');
    setDescription('');
    setSelectedUser(null);
    setEditingDraftId(null);
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const editingDraft = useMemo(
    () => (editingDraftId ? drafts.find((d) => d.draftId === editingDraftId) : null),
    [editingDraftId, drafts]
  );

  const buildTaskData = () => ({
    name,
    description,
    difficulty,
    estHours,
    bountyToken: hasBounty ? bountyToken : BOUNTY_TOKENS.NONE.address,
    bountyAmount: hasBounty ? bountyAmount : '0',
    requiresApplication,
    // Deadlines: a due date defaults to soft-only (metadata); enforcing also
    // writes absoluteDeadline (end-of-day local). Window = per-claim seconds.
    dueDate: hasDeadlines && dueDateStr ? localDateStrToEndOfDaySec(dueDateStr) : null,
    absoluteDeadline:
      hasDeadlines && enforceOnChain && dueDateStr
        ? localDateStrToEndOfDaySec(dueDateStr)
        : 0,
    completionWindow: hasDeadlines ? completionWindowSec : 0,
    assignTo: showAssign ? selectedUser?.address || null : null,
  });

  const handleSubmitQuick = async () => {
    setLoading(true);
    try {
      const taskData = buildTaskData();
      resetForm();
      onAddTask(taskData);
    } catch (error) {
      console.error('Error adding task:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add task',
        status: 'error',
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = () => {
    if (!onSaveDraft) return;
    try {
      const taskData = buildTaskData();
      onSaveDraft(taskData, editingDraftId);
      if (editingDraftId) {
        setEditingDraftId(null);
        resetForm();
        toast({
          title: 'Draft updated',
          status: 'success',
          duration: 1800,
          position: 'top',
        });
      } else if (keepFields) {
        resetNameAndDescriptionOnly();
      } else {
        resetForm();
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save draft',
        status: 'error',
        duration: 4000,
      });
    }
  };

  const handleEditDraft = (draft) => {
    setEditingDraftId(draft.draftId);
    populateFromDraft(draft);
  };

  const handleCancelEdit = () => {
    setEditingDraftId(null);
    resetForm();
  };

  const handleDeleteDraft = (draftId) => {
    if (onDeleteDraft) onDeleteDraft(draftId);
    if (editingDraftId === draftId) {
      setEditingDraftId(null);
      resetForm();
    }
  };

  const handleSubmitDrafts = () => {
    if (onSubmitDrafts) onSubmitDrafts();
  };

  const truncateAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formInvalid =
    !name.trim() ||
    (taskPayoutHoursOnly && !(Number(estHours) > 0)) ||
    (hasBounty && (!bountyToken || !bountyAmount || Number(bountyAmount) <= 0));

  const renderForm = () => (
    <VStack spacing={6} align="stretch">
      {isDraftMode && editingDraft && (
        <HStack
          justify="space-between"
          align="center"
          p={3}
          borderRadius="lg"
          bg="purple.900"
          border="1px solid"
          borderColor="purple.500"
        >
          <Text fontSize="sm" color="purple.100" noOfLines={1}>
            Editing draft &mdash; {editingDraft.name || 'Untitled'}
          </Text>
          <Link color="purple.200" fontSize="sm" onClick={handleCancelEdit}>
            Cancel edit
          </Link>
        </HStack>
      )}

      {/* Task Details Section */}
      <Box>
        <Text
          fontSize="xs"
          fontWeight="bold"
          color="purple.300"
          mb={3}
          textTransform="uppercase"
          letterSpacing="wide"
        >
          Task Details
        </Text>
        <VStack spacing={4} align="stretch">
          <FormControl id="task-name">
            <FormLabel color="gray.200" fontSize="sm">
              Task Name
            </FormLabel>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter task name..."
              {...inputStyles}
            />
          </FormControl>
          <FormControl id="task-description">
            <FormLabel color="gray.200" fontSize="sm">
              Description
            </FormLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task..."
              minH="100px"
              {...inputStyles}
            />
          </FormControl>
        </VStack>
      </Box>

      {/* Effort & Payout Section */}
      <Box>
        <Text
          fontSize="xs"
          fontWeight="bold"
          color="purple.300"
          mb={3}
          textTransform="uppercase"
          letterSpacing="wide"
        >
          Effort & Payout
        </Text>

        <SimpleGrid columns={2} spacing={4} mb={4}>
          <FormControl id="task-difficulty">
            <FormLabel color="gray.200" fontSize="sm">
              Difficulty
            </FormLabel>
            <Select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              {...selectStyles}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="veryHard">Very Hard</option>
            </Select>
          </FormControl>

          <FormControl id="task-estimated-hours">
            <FormLabel color="gray.200" fontSize="sm">
              {taskPayoutHoursOnly ? 'Estimated Time' : 'Estimated Hours'}
            </FormLabel>
            {taskPayoutHoursOnly ? (
              <EstTimePicker
                value={estHours}
                onChange={setEstHours}
                inputStyles={inputStyles}
                selectStyles={selectStyles}
              />
            ) : (
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={estHours}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setEstHours(isNaN(val) ? 0.5 : val);
                }}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  setEstHours(val <= 0.5 ? 0.5 : Math.round(val * 2) / 2);
                }}
                {...inputStyles}
              />
            )}
          </FormControl>
        </SimpleGrid>

        <Box
          p={4}
          bg="whiteAlpha.50"
          borderRadius="lg"
          border="1px solid rgba(148, 115, 220, 0.3)"
        >
          <HStack justify="space-between" align="center">
            <VStack align="start" spacing={0}>
              <Text fontSize="sm" color="gray.400">
                Estimated Payout
              </Text>
              <HStack spacing={2} align="baseline">
                <Text fontSize="2xl" fontWeight="bold" color="white">
                  {estimatedPayout}
                </Text>
                <Text fontSize="md" color="purple.300">
                  {tokenLabel}
                </Text>
              </HStack>
            </VStack>
            <Tooltip
              label={taskPayoutHoursOnly
                ? `${normalizeHourlyRate(taskPayoutHourlyRate)}/hr × ${formatEstTime(estHours)} (difficulty not counted)`
                : `Base: ${DIFFICULTY_CONFIG[difficulty]?.base || 0} + (${DIFFICULTY_CONFIG[difficulty]?.multiplier || 0} × ${estHours} hrs)`}
              placement="left"
              bg="gray.800"
              color="white"
              borderRadius="md"
            >
              <InfoIcon color="gray.500" boxSize={4} cursor="help" />
            </Tooltip>
          </HStack>
        </Box>
      </Box>

      {/* Token Bounty Section */}
      <Box>
        <FormControl>
          <HStack justify="space-between" mb={hasBounty ? 3 : 0}>
            <HStack>
              <Text
                fontSize="xs"
                fontWeight="bold"
                color="purple.300"
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Token Bounty
              </Text>
              <Text fontSize="xs" color="gray.500">
                {tokenOptions.length === 0 ? '(No tokens configured)' : '(Optional)'}
              </Text>
            </HStack>
            <Switch
              isChecked={hasBounty}
              onChange={(e) => setHasBounty(e.target.checked)}
              colorScheme="purple"
              isDisabled={tokenOptions.length === 0}
            />
          </HStack>
        </FormControl>

        {hasBounty && (
          <Box
            p={4}
            bg="whiteAlpha.50"
            borderRadius="lg"
            border="1px solid rgba(148, 115, 220, 0.2)"
          >
            <SimpleGrid columns={2} spacing={3}>
              <FormControl id="bounty-token">
                <FormLabel color="gray.400" fontSize="xs">
                  Token
                </FormLabel>
                <HStack spacing={2}>
                  {(() => {
                    const selected = tokenOptions.find(t => t.address === bountyToken);
                    return selected?.logo ? (
                      <Image src={selected.logo} alt={selected.symbol} boxSize="24px" borderRadius="full" fallback={<></>} />
                    ) : null;
                  })()}
                  <Select
                    value={bountyToken}
                    onChange={(e) => setBountyToken(e.target.value)}
                    size="sm"
                    {...selectStyles}
                    flex={1}
                  >
                    {tokenOptions.map((token) => (
                      <option key={token.symbol} value={token.address}>
                        {token.symbol}
                      </option>
                    ))}
                  </Select>
                </HStack>
                {(() => {
                  const selected = tokenOptions.find(t => t.address === bountyToken);
                  if (!selected?.projectUrl) return null;
                  return (
                    <Link
                      href={selected.projectUrl}
                      isExternal
                      fontSize="xs"
                      color="orange.400"
                      mt={1}
                      display="inline-flex"
                      alignItems="center"
                      gap={1}
                      _hover={{ color: 'orange.300', textDecoration: 'underline' }}
                    >
                      {new URL(selected.projectUrl).hostname}
                      <ExternalLinkIcon boxSize={3} />
                    </Link>
                  );
                })()}
              </FormControl>
              <FormControl id="bounty-amount">
                <FormLabel color="gray.400" fontSize="xs">
                  Amount
                </FormLabel>
                <InputGroup size="sm">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={bountyAmount}
                    onChange={(e) => setBountyAmount(e.target.value)}
                    {...inputStyles}
                  />
                  <InputRightAddon
                    bg="whiteAlpha.100"
                    borderColor="whiteAlpha.200"
                    color="gray.400"
                  >
                    {tokenOptions.find(
                      (t) => t.address === bountyToken
                    )?.symbol || 'TOKEN'}
                  </InputRightAddon>
                </InputGroup>
              </FormControl>
            </SimpleGrid>
            <Text fontSize="xs" color="gray.500" mt={3}>
              This bounty will be paid in addition to {tokenLabel.toLowerCase()}
            </Text>
          </Box>
        )}
      </Box>

      {/* Deadlines Section (v6) */}
      <DeadlineFields
        hasDeadlines={hasDeadlines}
        setHasDeadlines={setHasDeadlines}
        dueDateStr={dueDateStr}
        setDueDateStr={setDueDateStr}
        enforceOnChain={enforceOnChain}
        setEnforceOnChain={setEnforceOnChain}
        completionWindowSec={completionWindowSec}
        setCompletionWindowSec={setCompletionWindowSec}
        assigneeSelected={!!(showAssign && selectedUser)}
      />

      {/* Assignment Section */}
      <Box>
        <Text
          fontSize="xs"
          fontWeight="bold"
          color="purple.300"
          mb={3}
          textTransform="uppercase"
          letterSpacing="wide"
        >
          Assignment
        </Text>

        {isDraftMode && canAssign && (
          <Text fontSize="xs" color="gray.500" mb={3}>
            Per-task assignment isn&apos;t available when batching yet. Use
            &quot;Add immediately&quot; if you need to assign a specific user.
          </Text>
        )}

        <VStack spacing={4} align="stretch">
          <FormControl>
            <HStack justify="space-between">
              <HStack spacing={1}>
                <FormLabel mb={0} color="gray.300" fontSize="sm">
                  Require Application
                </FormLabel>
                <Tooltip
                  label="Members must apply and be approved before claiming this task"
                  placement="top"
                  bg="gray.800"
                  color="white"
                  borderRadius="md"
                >
                  <InfoIcon color="gray.500" boxSize={3} />
                </Tooltip>
              </HStack>
              <Switch
                isChecked={requiresApplication}
                onChange={(e) => setRequiresApplication(e.target.checked)}
                colorScheme="purple"
              />
            </HStack>
          </FormControl>

          {showAssign && (
            <FormControl id="task-assign-to">
              <HStack spacing={1} mb={2}>
                <FormLabel mb={0} color="gray.300" fontSize="sm">
                  Assign To
                </FormLabel>
                <Text fontSize="xs" color="gray.500">
                  (Optional)
                </Text>
                <Tooltip
                  label="Directly assign this task to a specific user"
                  placement="top"
                  bg="gray.800"
                  color="white"
                  borderRadius="md"
                >
                  <InfoIcon color="gray.500" boxSize={3} />
                </Tooltip>
              </HStack>

              {!selectedUser && (
                <UserSearchInput
                  onSelect={setSelectedUser}
                  placeholder="Search by username..."
                  disabled={loading}
                />
              )}

              {selectedUser && (
                <HStack
                  p={3}
                  bg="purple.900"
                  borderRadius="lg"
                  justify="space-between"
                  border="1px solid"
                  borderColor="purple.600"
                >
                  <HStack spacing={3}>
                    <UserIdentity
                      address={selectedUser.address}
                      usernameHint={selectedUser.username}
                      size="sm"
                      showName={false}
                      link={false}
                    />
                    <VStack align="start" spacing={0}>
                      <Text color="white" fontSize="sm" fontWeight="medium">
                        {selectedUser.username || 'No username'}
                      </Text>
                      <Text color="gray.400" fontSize="xs" fontFamily="mono">
                        {truncateAddress(selectedUser.address)}
                      </Text>
                    </VStack>
                  </HStack>
                  <IconButton
                    icon={<CloseIcon />}
                    size="sm"
                    variant="ghost"
                    colorScheme="whiteAlpha"
                    onClick={() => setSelectedUser(null)}
                    aria-label="Clear selection"
                    _hover={{ bg: 'whiteAlpha.200' }}
                  />
                </HStack>
              )}

              <Text fontSize="xs" color="gray.500" mt={2}>
                Leave empty for open claiming
              </Text>
            </FormControl>
          )}
        </VStack>
      </Box>
    </VStack>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size={isDraftMode ? { base: 'full', md: '5xl' } : 'xl'}
      isCentered={!isDraftMode}
      scrollBehavior="inside"
    >
      <ModalOverlay bg="blackAlpha.800" />
      <ModalContent
        bg="transparent"
        borderRadius="xl"
        position="relative"
        boxShadow="dark-lg"
        mx={isDraftMode ? { base: 0, md: 4 } : 4}
        my={isDraftMode ? { base: 0, md: 8 } : undefined}
      >
        <Box style={glassLayerStyle} />

        <ModalHeader color="white" fontSize="xl" fontWeight="bold" pb={2}>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between" align="center">
              <Text>Create Task</Text>
            </HStack>
            {onSaveDraft && (
              <ModeToggle mode={mode} onChange={onModeChange} />
            )}
          </VStack>
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody pb={6}>
          {isDraftMode && onSaveDraft ? (
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} alignItems="start">
              <Box>{renderForm()}</Box>
              <Box position={{ md: 'sticky' }} top={{ md: 0 }}>
                <DraftsPanel
                  drafts={drafts}
                  editingDraftId={editingDraftId}
                  onEditDraft={handleEditDraft}
                  onDeleteDraft={handleDeleteDraft}
                  onSubmitDrafts={handleSubmitDrafts}
                  isSubmittingDrafts={isSubmittingDrafts}
                  tokenLabel={tokenLabel}
                />
              </Box>
            </SimpleGrid>
          ) : (
            renderForm()
          )}
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
          <HStack spacing={3} w="100%">
            <Button
              variant="ghost"
              onClick={handleClose}
              color="gray.400"
              _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
            >
              Cancel
            </Button>
            <Spacer />
            {isDraftMode && onSaveDraft && !editingDraftId && (
              <Tooltip
                label="Keep difficulty, hours, bounty, and application settings filled when staging the next draft"
                placement="top"
                bg="gray.800"
                color="white"
                borderRadius="md"
              >
                <Box>
                  <Checkbox
                    isChecked={keepFields}
                    onChange={(e) => setKeepFields(e.target.checked)}
                    colorScheme="purple"
                    size="sm"
                    color="gray.300"
                  >
                    <Text fontSize="sm">Keep settings between drafts</Text>
                  </Checkbox>
                </Box>
              </Tooltip>
            )}
            {isDraftMode && onSaveDraft ? (
              <Button
                colorScheme="purple"
                onClick={handleSaveDraft}
                isDisabled={formInvalid}
              >
                {editingDraftId ? 'Update draft' : 'Save as draft'}
              </Button>
            ) : (
              <Button
                colorScheme="purple"
                onClick={handleSubmitQuick}
                isLoading={loading}
                loadingText="Creating..."
                isDisabled={formInvalid}
              >
                Create Task
              </Button>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default AddTaskModal;
