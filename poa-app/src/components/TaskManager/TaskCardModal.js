import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Button,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Box,
  VStack,
  Flex,
  Spacer,
  useToast,
  Textarea,
  useDisclosure,
  Text,
  Badge,
  HStack,
  Image,
  Link,
  Tooltip,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
} from '@chakra-ui/react';
import {
  CheckIcon,
  WarningIcon,
  ExternalLinkIcon,
  InfoOutlineIcon,
  CloseIcon,
  TimeIcon,
  RepeatIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@chakra-ui/icons';
import { hasBounty as checkHasBounty, getTokenByAddress } from '../../util/tokens';
import EditTaskModal from './EditTaskModal';
import TaskApplicationModal from './TaskApplicationModal';
import { useTaskBoard } from '../../context/TaskBoardContext';
import {
  dueDateSec,
  effectiveDeadlineSec,
  isClaimExpired,
  formatRemaining,
  formatDeadlineDate,
  formatWindow,
  deadlineSeverity,
  SEVERITY_SCHEME,
  toSec,
  nowMs,
} from '@/util/deadlineUtils';
import { canReleaseTask, releaseActionLabel, releaseConfirmCopy, ReleaseReason } from '@/util/releaseGate';
import { useNow } from '@/hooks/useNow';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { useUserContext } from '@/context/UserContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { useRouter } from 'next/router';
import { useProjectContext } from '@/context/ProjectContext';
import { UserSearchInput } from '@/components/common';
import UserIdentity from '@/components/common/UserIdentity';
import {
  projectTaskPermissions,
  taskEditRights,
  PERMISSION_MESSAGES,
} from '../../util/permissions';
import { useOrgName } from '@/hooks/useOrgName';
import UsernameLink from '@/components/common/UsernameLink';
import { usePOContext } from '@/context/POContext';
import { formatEstTime } from '@/util/taskUtils';


const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(25, 25, 30, 0.97)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
};

const inputStyles = {
  bg: 'whiteAlpha.100',
  border: '1px solid',
  borderColor: 'whiteAlpha.200',
  color: 'white',
  _placeholder: { color: 'gray.500' },
  _hover: { borderColor: 'whiteAlpha.300' },
  _focus: {
    borderColor: 'gray.400',
    boxShadow: '0 0 0 1px var(--chakra-colors-gray-400)',
  },
};

const SectionHeader = ({ children }) => (
  <Text
    fontSize="xs"
    fontWeight="bold"
    color="gray.400"
    textTransform="uppercase"
    letterSpacing="wide"
    mb={2}
  >
    {children}
  </Text>
);

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

const LinkedSubmissionText = ({ text }) => (
  <>
    {String(text).split(URL_PATTERN).map((part, index) => (
      part.startsWith('http://') || part.startsWith('https://') ? (
        <Link
          key={`${part}-${index}`}
          href={part}
          isExternal
          color="teal.200"
          textDecoration="underline"
          textUnderlineOffset="2px"
          overflowWrap="anywhere"
          onClick={(event) => event.stopPropagation()}
        >
          {part}
        </Link>
      ) : (
        <React.Fragment key={index}>{part}</React.Fragment>
      )
    ))}
  </>
);

/** Keep long text visible enough to scan without letting it take over the modal. */
const ExpandableText = ({
  text,
  color = 'gray.200',
  collapsedLines = 3,
  expandLabel = 'Show more',
  collapseLabel = 'Show less',
  linkify = false,
}) => {
  const textRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return undefined;

    const measure = () => {
      if (!expanded) {
        setIsClamped(element.scrollHeight > element.clientHeight + 1);
      }
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <Box>
      <Text
        ref={textRef}
        fontSize="sm"
        lineHeight="6"
        color={color}
        whiteSpace="pre-wrap"
        overflowWrap="anywhere"
        noOfLines={expanded ? undefined : collapsedLines}
      >
        {linkify ? <LinkedSubmissionText text={text} /> : text}
      </Text>
      {(isClamped || expanded) && (
        <Button
          variant="link"
          size="xs"
          mt={1.5}
          color="teal.200"
          rightIcon={expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? collapseLabel : expandLabel}
        </Button>
      )}
    </Box>
  );
};

const TaskCardModal = ({ task, columnId, onEditTask, onEditTaskMetadata }) => {
  const [submission, setSubmission] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const { moveTask, deleteTask, applyForTask, approveApplication, assignTask, takeOverTask, releaseTask, rejectTask, getPreviousSubmission } = useTaskBoard();
  const { hasMemberRole, address: account, fetchUserDetails, userData } = useUserContext();
  const { projectsData, releasesSupported } = useProjectContext();
  const { getUsernameByAddress, setSelectedProject, projects } = useDataBaseContext();
  const { safeFetchFromIpfs } = useIPFScontext();
  const router = useRouter();
  const userDAO = useOrgName();
  const { tokenLabel, taskPayoutHoursOnly } = usePOContext();
  const toast = useToast();
  const { isOpen, onOpen, onClose} = useDisclosure();
  const { isOpen: isApplicationModalOpen, onOpen: onOpenApplicationModal, onClose: onCloseApplicationModal } = useDisclosure();
  const releaseConfirm = useDisclosure();
  const releaseCancelRef = useRef();
  const [showAssignSection, setShowAssignSection] = useState(false);
  // After ~30s of the modal sitting in the indexing state, soften the copy so a
  // slow subgraph doesn't read as "stuck".
  const [indexingTimedOut, setIndexingTimedOut] = useState(false);

  // Org display name for the ownership tooltip. POContext resolves the org by
  // this name (useOrgName); fall back to a generic phrase when unset.
  const orgDisplayName = userDAO || 'this org';

  // IPFS metadata state
  const [taskMetadata, setTaskMetadata] = useState(null);
  const [submissionMetadata, setSubmissionMetadata] = useState(null);
  const [rejectionMetadata, setRejectionMetadata] = useState(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [previousSubmission, setPreviousSubmission] = useState(null);
  const [previousSubmissionLoading, setPreviousSubmissionLoading] = useState(false);
  const [previousSubmissionUnavailable, setPreviousSubmissionUnavailable] = useState(false);
  const displayedSubmission = task?.submission ?? submissionMetadata?.submission ?? null;

  // Application IPFS content state
  const [applicationContents, setApplicationContents] = useState({});
  const [applicationsLoading, setApplicationsLoading] = useState(false);

  const userHatIds = useMemo(() => userData?.hatIds || [], [userData]);
  const currentProject = useMemo(() => {
    return projectsData?.find(p => p.id === task?.projectId);
  }, [projectsData, task?.projectId]);

  // Every TaskManager gate for this project, resolved exactly as the contract does:
  // the per-hat mask (project mask shadows global, else global) OR being one of this
  // project's managers. `account` is the tx's msg.sender under both auth types —
  // the ERC-4337 smart account for passkey users, the EOA otherwise.
  const perms = useMemo(
    () => projectTaskPermissions(currentProject, userHatIds, account),
    [currentProject, userHatIds, account],
  );

  const canReviewTask = perms.canReview;
  const canAssign = perms.canAssign;

  // Status-dependent edit rights: terminal tasks are immutable; EDIT_FULL works in any
  // non-terminal status; a CREATE hat may still edit while the task is UNCLAIMED.
  const { canEditFull: canEditTaskFull, canEditMeta: canEditTaskMetadata } = useMemo(
    () => taskEditRights(perms, columnId),
    [perms, columnId],
  );

  // EDIT_META without EDIT_FULL routes the save through updateTaskMetadata
  // (title + metadataHash only) instead of the full updateTask.
  const isMetadataOnlyEditor = canEditTaskMetadata && !canEditTaskFull;

  // Check if current user has already applied for this task
  const userApplication = useMemo(() => {
    if (!account || !task?.applicants) return null;
    return task.applicants.find(
      a => a.address?.toLowerCase() === account?.toLowerCase()
    );
  }, [task?.applicants, account]);

  // Deadlines (v6)
  const now = useNow(15000);
  const isClaimer = !!account && task?.claimedBy?.toLowerCase() === account?.toLowerCase();
  const claimExpired = columnId === 'inProgress' && isClaimExpired(task, now);
  // `completeTask` additionally requires SELF_REVIEW when the reviewer is the claimer
  // (project managers are exempt, which `perms.canSelfReview` already folds in).
  // Rejecting only needs REVIEW, so it keeps using `canReviewTask`.
  const canCompleteReview = canReviewTask && (!isClaimer || perms.canSelfReview);
  // v7 claim release. The gate lives in util/releaseGate so the contract's two
  // routes (claimer always; ASSIGN holder only once expired) are decided in one
  // pure, tested place. `now` is threaded in so the button re-evaluates on the
  // same 15s tick as the countdown rather than going stale.
  // `releasesSupported` gates the action on the org's INDEXER, not the chain: an
  // endpoint without the TaskUnclaimed handler would let the tx succeed and then
  // keep rendering the task as claimed forever.
  const release = useMemo(
    () => canReleaseTask(
      { task, columnId, address: account, canAssign, releasesIndexed: releasesSupported },
      now
    ),
    [task, columnId, account, canAssign, releasesSupported, now]
  );
  const enforcedDeadline = columnId === 'inProgress' ? effectiveDeadlineSec(task) : null;
  const taskDue = dueDateSec(task);
  const taskAbs = toSec(task?.absoluteDeadline);
  const taskWindow = toSec(task?.completionWindow);
  const hasApplied = !!userApplication;

  // Swap in the "taking longer than usual" copy after 30s of indexing.
  useEffect(() => {
    if (!isOpen || !task?.isIndexing) {
      setIndexingTimedOut(false);
      return undefined;
    }
    const timer = setTimeout(() => setIndexingTimedOut(true), 30000);
    return () => clearTimeout(timer);
  }, [isOpen, task?.isIndexing]);

  // Ref to prevent re-opening modal during intentional close
  const isClosingRef = useRef(false);

  useEffect(() => {
    // Don't re-open if we're intentionally closing
    if (isClosingRef.current) return;

    const taskId = router.query.task;

    if (taskId === task.id) {
      onOpen();
    }
  }, [router.query.task, task.id, onOpen]);

  // Fetch IPFS metadata when modal opens - only as fallback when indexed data is missing.
  // task.description/submission are null when subgraph metadata isn't indexed,
  // vs a string (even empty) when indexed. Only fetch IPFS when strictly null.
  useEffect(() => {
    let cancelled = false;

    const fetchIpfsMetadata = async () => {
      if (!isOpen || !task) return;

      // null = subgraph didn't index metadata. '' or string = indexed (don't fetch).
      const needsTaskMetadata = task.description === null && task.metadataHash && !taskMetadata;
      const needsSubmissionMetadata = task.submission === null && task.submissionHash &&
        !submissionMetadata && (task.status === 'Submitted' || task.status === 'Completed');
      const needsRejectionMetadata = !task.rejectionReason && task.rejectionHash &&
        task.rejectionCount > 0 && !rejectionMetadata;

      if (!needsTaskMetadata && !needsSubmissionMetadata && !needsRejectionMetadata) return;

      if (!cancelled) setMetadataLoading(true);

      // Fetch task metadata (description, difficulty, estHours) - IPFS fallback
      if (needsTaskMetadata) {
        try {
          const metadata = await safeFetchFromIpfs(task.metadataHash);
          if (!cancelled && metadata) {
            setTaskMetadata(metadata);
          }
        } catch (err) {
          console.error('[TaskCardModal] IPFS fallback failed for task metadata:', err);
        }
      }

      // Fetch submission metadata for submitted/completed tasks - IPFS fallback
      if (needsSubmissionMetadata) {
        try {
          const metadata = await safeFetchFromIpfs(task.submissionHash);
          if (!cancelled && metadata) {
            setSubmissionMetadata(metadata);
          }
        } catch (err) {
          console.error('[TaskCardModal] IPFS fallback failed for submission metadata:', err);
        }
      }

      // Fetch rejection metadata - IPFS fallback
      if (needsRejectionMetadata) {
        try {
          const metadata = await safeFetchFromIpfs(task.rejectionHash);
          if (!cancelled && metadata) {
            setRejectionMetadata(metadata);
          }
        } catch (err) {
          console.error('[TaskCardModal] IPFS fallback failed for rejection metadata:', err);
        }
      }

      if (!cancelled) setMetadataLoading(false);
    };

    fetchIpfsMetadata();
    return () => { cancelled = true; };
  }, [isOpen, task, safeFetchFromIpfs, taskMetadata, submissionMetadata, rejectionMetadata]);

  // A rejection moves the task back to In Progress and clears its mutable
  // submissionHash. The subgraph retains an immutable TaskSubmission and links
  // the latest TaskRejection to the exact version that was reviewed.
  useEffect(() => {
    let cancelled = false;

    if (!isOpen || !task?.rejectionCount) {
      setPreviousSubmission(null);
      setPreviousSubmissionLoading(false);
      setPreviousSubmissionUnavailable(false);
      return undefined;
    }

    const loadPreviousSubmission = async () => {
      setPreviousSubmissionLoading(true);
      setPreviousSubmissionUnavailable(false);

      try {
        const value = await getPreviousSubmission(task);
        if (!cancelled) {
          setPreviousSubmission(value);
          setPreviousSubmissionUnavailable(!value);
        }
      } catch (error) {
        console.error('[TaskCardModal] Failed to load previous submission:', error);
        if (!cancelled) {
          setPreviousSubmission(null);
          setPreviousSubmissionUnavailable(true);
        }
      } finally {
        if (!cancelled) setPreviousSubmissionLoading(false);
      }
    };

    loadPreviousSubmission();
    return () => { cancelled = true; };
  }, [isOpen, task, getPreviousSubmission]);

  // Fetch application content from IPFS — only for applicants without subgraph-indexed metadata
  useEffect(() => {
    let cancelled = false;

    const fetchApplicationContents = async () => {
      if (!isOpen || !task?.applicants?.length) return;

      const hashesToFetch = task.applicants.filter(
        a => a.applicationHash && !a.metadata && !applicationContents[a.address]
      );
      if (hashesToFetch.length === 0) return;

      if (!cancelled) setApplicationsLoading(true);
      const results = {};

      await Promise.all(
        hashesToFetch.map(async (applicant) => {
          try {
            const content = await safeFetchFromIpfs(applicant.applicationHash);
            if (content) {
              results[applicant.address] = content;
            }
          } catch (err) {
            console.error('[TaskCardModal] Failed to fetch application content for', applicant.address, err);
          }
        })
      );

      if (!cancelled) {
        setApplicationContents(prev => ({ ...prev, ...results }));
        setApplicationsLoading(false);
      }
    };

    fetchApplicationContents();
    return () => { cancelled = true; };
  }, [isOpen, task?.applicants, safeFetchFromIpfs]);

  const handleCloseModal = async () => {
    // Set flag to prevent useEffect from re-opening
    isClosingRef.current = true;
    onClose();

    // Drop only `task` (that's what closing means) and carry the rest of the
    // query — `view`, `q`, `filters` — so closing returns you to the exact
    // board/list/gantt surface, search and filters intact.
    const { task: _closedTask, ...restQuery } = router.query;
    const { projectId } = restQuery;
    const safeProjectId = projectId ? encodeURIComponent(decodeURIComponent(projectId)) : '';

    // Wait for URL to update before returning - this prevents new modal instances from opening
    await router.push(
      {
        pathname: `/tasks/`,
        query: { ...restQuery, projectId: safeProjectId, org: userDAO },
      },
      undefined,
      { shallow: true }
    );

    // Reset flag after URL update completes
    isClosingRef.current = false;
  };

  // Handle applying for a task (for tasks that require application)
  const handleApply = async (applicationData) => {
    if (!hasMemberRole) {
      toast({
        title: 'Membership Required',
        description: 'You must be a member to apply for this task.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    try {
      await applyForTask(task.id, applicationData, account);
      toast({
        title: 'Application Submitted',
        description: 'Your application has been submitted for review.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onCloseApplicationModal();
    } catch (error) {
      console.error('Error applying for task:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit application.',
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
    }
  };

  // Handle approving an application (requires ASSIGN permission)
  const handleApproveApplication = async (applicantAddress, applicantUsername) => {
    if (!canAssign) {
      toast({
        title: 'Permission Required',
        description: 'You must have assign permissions to approve applications.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    // Close the modal before the transaction — optimistic UI will move the task
    await handleCloseModal();

    try {
      await approveApplication(task.id, applicantAddress, applicantUsername);
    } catch (error) {
      console.error('Error approving application:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve application.',
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
    }
  };

  // Handle assigning a task directly (for executives).
  // The assignee is chosen via UserSearchInput, which already resolved the
  // typed username/address to a concrete { address, username } object.
  const handleAssignTask = async () => {
    if (!canAssign) {
      toast({
        title: 'Permission Required',
        description: PERMISSION_MESSAGES.REQUIRE_ASSIGN,
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    if (!selectedAssignee?.address) {
      toast({
        title: 'Select a User',
        description: 'Search for and select a user to assign this task to.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsAssigning(true);

    try {
      const { address, username } = selectedAssignee;

      await assignTask(task.id, address, username || '');
      toast({
        title: 'Task Assigned',
        description: `The task has been assigned to ${username || `${address.slice(0, 6)}...${address.slice(-4)}`}.`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      setSelectedAssignee(null);
      setShowAssignSection(false);
      handleCloseModal();
    } catch (error) {
      console.error('Error assigning task:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign task.',
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRejectTask = async () => {
    if (!canReviewTask) {
      toast({
        title: 'Permission Required',
        description: 'You must have review permissions to reject a task.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    if (!rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejection.',
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
      return;
    }

    await handleCloseModal();

    rejectTask(task, rejectionReason).catch(error => {
      console.error("Error rejecting task:", error);
    });
  };

  const handleReleaseTask = async () => {
    // Re-decide against the live clock rather than the memoised `release`.
    // For a third-party release the contract's expiry check is strict, and a
    // browser running fast would otherwise fire a tx that reverts BadStatus —
    // which reads as "wrong status", not "the claim is still live".
    // nowMs(), not Date.now(): every other deadline surface honours the
    // `poa.devNowOffsetMs` time-travel offset, and a handler on the real clock
    // would refuse the very release the button just offered under the offset.
    const live = canReleaseTask(
      { task, columnId, address: account, canAssign, releasesIndexed: releasesSupported },
      nowMs()
    );
    if (!live.allowed) {
      releaseConfirm.onClose();
      toast({
        title: live.reason === ReleaseReason.CLAIM_NOT_EXPIRED ? 'Claim still active' : 'Cannot release this task',
        description: live.reason === ReleaseReason.CLAIM_NOT_EXPIRED
          ? "This claim hasn't expired yet, so only its claimer can give it back."
          : 'This task is no longer in a state that can be released.',
        status: 'info',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    releaseConfirm.onClose();
    await handleCloseModal();

    releaseTask(task).catch(error => {
      console.error("Error releasing task:", error);
    });
  };

  const handleButtonClick = async () => {
    // For tasks requiring application, open the application modal instead
    if (columnId === 'open' && task.requiresApplication) {
      if (hasApplied) {
        toast({
          title: 'Already Applied',
          description: 'You have already submitted an application for this task.',
          status: 'info',
          duration: 3000,
          isClosable: true,
        });
        return;
      }
      if (hasMemberRole) {
        onOpenApplicationModal();
      } else {
        toast({
          title: 'Membership Required',
          description: 'You must be a member to apply for this task.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
      }
      return;
    }

    // Validate permissions and inputs BEFORE closing modal
    if (columnId === 'open') {
      if (!hasMemberRole) {
        toast({
          title: 'Membership Required',
          description: 'You must be a member to claim this task. Go to user page to join.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
    }

    if (columnId === 'inProgress') {
      // Takeover path (v6): a non-claimer acting on an expired claim claims the
      // task over instead of submitting. Application-gated tasks route through
      // the application modal — approval performs the takeover on-chain.
      if (!isClaimer && claimExpired) {
        if (!hasMemberRole) {
          toast({
            title: 'Membership Required',
            description: 'You must be a member to take over this task. Go to user page to join.',
            status: 'warning',
            duration: 4000,
            isClosable: true,
            position: 'top',
          });
          return;
        }
        if (task.requiresApplication) {
          if (hasApplied) {
            toast({
              title: 'Already Applied',
              description: 'You have already applied — an assigner can approve you to take this task over.',
              status: 'info',
              duration: 4000,
              isClosable: true,
            });
            return;
          }
          onOpenApplicationModal();
          return;
        }
        await handleCloseModal();
        takeOverTask(task, account, userData?.username || '').catch(error => {
          console.error('Error taking over task:', error);
        });
        return;
      }
      if (!isClaimer) {
        toast({
          title: 'Not your task',
          description: `Only ${task.claimerUsername || 'the current claimer'} can submit this task.`,
          status: 'info',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
      if (submission === "") {
        toast({
          title: "Invalid Submission",
          description: "Please Enter a submission",
          status: "error",
          duration: 3500,
          isClosable: true
        });
        return;
      }
      if (!hasMemberRole) {
        toast({
          title: 'Membership Required',
          description: 'You must be a member to submit. Go to user page to join.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
    }

    if (columnId === 'inReview') {
      if (!canCompleteReview) {
        toast({
          title: 'Permission Required',
          description: canReviewTask
            ? PERMISSION_MESSAGES.REQUIRE_SELF_REVIEW
            : PERMISSION_MESSAGES.REQUIRE_REVIEW,
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
    }

    // All validations passed - close modal and wait for URL update
    // This ensures new TaskCardModal instances (from optimistic update) won't see the task in URL
    await handleCloseModal();

    // Now execute the transaction (runs in background, optimistic UI already shown)
    if (columnId === 'open') {
      // Claim task - moveTask handles optimistic UI and notifications
      moveTask(task, columnId, 'inProgress', 0, " ", account).catch(error => {
        console.error("Error claiming task:", error);
      });
    }

    if (columnId === 'inProgress') {
      // Submit task - moveTask handles optimistic UI and notifications
      moveTask(task, columnId, 'inReview', 0, submission).catch(error => {
        console.error("Error submitting task:", error);
      });
    }

    if (columnId === 'inReview') {
      // Complete review - moveTask handles optimistic UI and notifications
      moveTask(task, columnId, 'completed', 0).catch(error => {
        console.error("Error completing review:", error);
      });
    }

  };


  const buttonText = () => {
    switch (columnId) {
      case 'open':
        // Show "Apply" / "Applied" for tasks requiring application (unless exec who can bypass)
        if (task.requiresApplication) {
          return hasApplied ? 'Applied' : 'Apply';
        }
        return 'Claim';
      case 'inProgress':
        if (!isClaimer && claimExpired) {
          return task.requiresApplication ? (hasApplied ? 'Applied' : 'Apply to take over') : 'Take over task';
        }
        return 'Submit';
      case 'inReview':
        return 'Complete Review';
      default:
        return '';
    }
  };

  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);

  // Edit gating is entirely `taskEditRights` (which already encodes the contract's
  // status rules): terminal tasks never editable; EDIT_META / EDIT_FULL in any
  // non-terminal status; CREATE while still UNCLAIMED.
  const canShowEditButton = canEditTaskMetadata;

  const handleOpenEditTaskModal = () => {
    if (canShowEditButton) {
      setIsEditTaskModalOpen(true);
    } else {
      toast({
        title: 'Permission Required',
        description: PERMISSION_MESSAGES.REQUIRE_EDIT,
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
    }
  };

  const handleCloseEditTaskModal = () => {
    setIsEditTaskModalOpen(false);
    const { task: _closedTask, ...restQuery } = router.query;
    const { projectId } = restQuery;
    const safeProjectId = projectId ? encodeURIComponent(decodeURIComponent(projectId)) : '';
    router.push(
      {
        pathname: `/tasks/`,
        query: { ...restQuery, projectId: safeProjectId, org: userDAO },
      },
      undefined,
      { shallow: true },
    );
  };

  const copyLinkToClipboard = () => {
    const encodedProjectId = encodeURIComponent(task.projectId);
    const link = `${window.location.origin}/tasks/?task=${task.id}&projectId=${encodedProjectId}&org=${encodeURIComponent(userDAO)}`;

    navigator.clipboard.writeText(link).then(() => {
      toast({
        title: "Link copied",
        description: "Task link copied to clipboard.",
        status: "success",
        duration: 3000,
        isClosable: true
      });
    }).catch(err => {
      toast({
        title: "Failed to copy",
        description: "There was an issue copying the link.",
        status: "error",
        duration: 3000,
        isClosable: true
      });
      console.error('Failed to copy link: ', err);
    });
  };

  const difficultyColorScheme = {
    easy: 'green',
    medium: 'yellow',
    hard: 'orange',
    veryhard: 'red'
  };

  return task ? (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCloseModal}
        size={{ base: 'full', md: '2xl' }}
        isCentered
      >
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent
          bg="transparent"
          borderRadius="xl"
          position="relative"
          boxShadow="dark-lg"
          mx={4}
          color="white"
        >
          <Box style={glassLayerStyle} />
          <ModalHeader color="white" fontSize="xl" fontWeight="bold" pb={2}>
            {task.isIndexing ? 'Almost ready' : task.name}
          </ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody pb={6}>
            <VStack spacing={5} align="stretch">
              {task.isIndexing ? (
                <Box w="100%" p={4} bg="whiteAlpha.50" borderRadius="lg" border="1px solid" borderColor="whiteAlpha.100">
                  <Text color="gray.300" fontWeight="bold">
                    Almost ready
                  </Text>
                  <Text color="gray.400" fontSize="sm" mt={2}>
                    {indexingTimedOut
                      ? 'Taking longer than usual. It will show up as soon as it finishes saving.'
                      : 'This task is still saving. It will appear in a few seconds.'}
                  </Text>
                </Box>
              ) : (
                <>
                  {/* Task Details Section */}
                  <Box>
                    <SectionHeader>Task Details</SectionHeader>
                    <Box
                      p={4}
                      bg="whiteAlpha.50"
                      borderRadius="lg"
                      border="1px solid"
                      borderColor="whiteAlpha.100"
                    >
                      {metadataLoading ? (
                        <Text fontSize="sm" lineHeight="6" color="gray.200">
                          Loading task details...
                        </Text>
                      ) : (
                        <ExpandableText
                          text={task.description ?? taskMetadata?.description ?? 'No description available'}
                          collapsedLines={{ base: 4, md: 5 }}
                          expandLabel="Show full description"
                        />
                      )}
                    </Box>
                    <HStack mt={3} spacing={3} flexWrap="wrap" rowGap={2}>
                      <Badge colorScheme={difficultyColorScheme[(task.difficulty || taskMetadata?.difficulty)?.toLowerCase()?.replace(" ", "") || 'easy']}>
                        {task.difficulty || taskMetadata?.difficulty || 'Unknown'}
                      </Badge>
                      <Badge colorScheme="blue">
                        {taskPayoutHoursOnly
                          ? formatEstTime(task.estHours || taskMetadata?.estHours || 0)
                          : `${task.estHours || taskMetadata?.estHours || '0'} hrs`}
                      </Badge>
                      {taskDue !== null && (
                        <Tooltip label={taskAbs !== null ? 'Hard deadline — enforced on-chain' : 'Due date (display-only)'} placement="top">
                          <Badge colorScheme={taskAbs !== null ? 'pink' : 'gray'}>
                            {taskAbs !== null ? 'Hard due' : 'Due'} {formatDeadlineDate(taskDue)}
                          </Badge>
                        </Tooltip>
                      )}
                      {taskDue === null && taskAbs !== null && (
                        <Tooltip label="Hard deadline — enforced on-chain" placement="top">
                          <Badge colorScheme="pink">Hard due {formatDeadlineDate(taskAbs)}</Badge>
                        </Tooltip>
                      )}
                      {taskWindow !== null && (
                        <Tooltip label="Each claimer must submit within this time of claiming" placement="top">
                          <Badge colorScheme="purple">{formatWindow(taskWindow)} limit</Badge>
                        </Tooltip>
                      )}
                      {columnId === 'inProgress' && enforcedDeadline !== null && !claimExpired && (
                        <Badge colorScheme={SEVERITY_SCHEME[deadlineSeverity(enforcedDeadline, now)] || 'gray'}>
                          {formatRemaining(enforcedDeadline, now)}
                        </Badge>
                      )}
                      <Spacer />
                      {task.claimedBy && (
                        <HStack spacing={1} minW={0}>
                          <Tooltip label={task.claimedBy} hasArrow>
                            <Text as="span" fontSize="sm" color="gray.400" whiteSpace="nowrap" title={task.claimedBy}>
                              Claimed by
                            </Text>
                          </Tooltip>
                          <UserIdentity
                            address={task.claimedBy}
                            usernameHint={task.claimerUsername}
                            showAvatar={false}
                            nameColor="white"
                            nameFontSize="sm"
                            isTruncated
                            maxNameW={{ base: '120px', md: '220px' }}
                          />
                        </HStack>
                      )}
                    </HStack>
                  </Box>

                  {/* Expired-claim banners (v6) */}
                  {claimExpired && isClaimer && (
                    <Box w="100%" p={4} bg="rgba(124, 45, 18, 0.35)" borderRadius="lg" borderLeft="4px solid" borderColor="orange.400">
                      <HStack mb={1}>
                        <TimeIcon color="orange.300" />
                        <Text fontWeight="bold" color="orange.200" fontSize="md">
                          Your claim window has expired
                        </Text>
                      </HStack>
                      <Text fontSize="sm" color="gray.200">
                        You can still submit — but until you do, anyone can take this task over.
                      </Text>
                    </Box>
                  )}
                  {claimExpired && !isClaimer && (
                    <Box w="100%" p={4} bg="rgba(124, 45, 18, 0.35)" borderRadius="lg" borderLeft="4px solid" borderColor="orange.400">
                      <HStack mb={1}>
                        <TimeIcon color="orange.300" />
                        <Text fontWeight="bold" color="orange.200" fontSize="md">
                          Claim expired — open to others
                        </Text>
                      </HStack>
                      <Text fontSize="sm" color="gray.200">
                        {task.claimerUsername || 'The current claimer'} hasn't submitted within the
                        deadline. The task is still in progress, but you can take it over now —
                        you'd become the new assignee and their claim is replaced.
                        {task.requiresApplication
                          ? ' This task requires an application: apply below and an assigner can hand it over.'
                          : ''}
                      </Text>
                    </Box>
                  )}

                  {/* Submission Input (In Progress) — claimer only */}
                  {columnId === 'inProgress' && isClaimer && (
                    <Box>
                      <SectionHeader>Submission</SectionHeader>
                      <Textarea
                        height="200px"
                        placeholder="Type your submission here"
                        value={submission}
                        onChange={(e) => setSubmission(e.target.value)}
                        {...inputStyles}
                      />
                    </Box>
                  )}

                  {/* Submission Display (In Review / Completed) */}
                  {(columnId === 'inReview' || columnId === 'completed') && (
                    <Box>
                      <SectionHeader>Submission</SectionHeader>
                      <Box
                        p={4}
                        bg="whiteAlpha.50"
                        borderRadius="lg"
                        border="1px solid"
                        borderColor="whiteAlpha.100"
                      >
                        {displayedSubmission ? (
                          <ExpandableText
                            text={displayedSubmission}
                            expandLabel="Show full submission"
                            linkify
                          />
                        ) : (
                          <Text fontSize="sm" color="gray.200">
                            {metadataLoading ? 'Loading submission...' : 'No submission available'}
                          </Text>
                        )}
                      </Box>
                    </Box>
                  )}

                  {/* Rejection Alert */}
                  {task.rejectionCount > 0 && (
                    <Box w="100%" p={4} bg="rgba(127, 29, 29, 0.5)" borderRadius="lg" borderLeft="4px solid" borderColor="red.400">
                      <HStack mb={2}>
                        <WarningIcon color="red.300" />
                        <Text fontWeight="bold" color="red.200" fontSize="md">
                          Rejected{task.rejectionCount > 1 ? ` (${task.rejectionCount} times)` : ''}
                        </Text>
                      </HStack>
                      {(task.rejectionReason || rejectionMetadata?.rejection || rejectionMetadata?.rejectionReason) && (
                        <Box mb={2}>
                          <Text fontSize="sm" color="red.200" fontWeight="semibold" mb={1}>Reason:</Text>
                          <Text fontSize="sm" color="gray.200" style={{ whiteSpace: 'pre-wrap' }}>
                            {task.rejectionReason || rejectionMetadata?.rejection || rejectionMetadata?.rejectionReason}
                          </Text>
                        </Box>
                      )}
                      {task.rejections && task.rejections.length > 0 && task.rejections[0].rejectorUsername && (
                        <Text fontSize="xs" color="gray.400">
                          Rejected by{' '}
                          <UsernameLink
                            username={task.rejections[0].rejectorUsername}
                            hasUsername={!!task.rejections[0].rejectorUsername}
                            color="gray.300"
                            fontWeight="medium"
                            fontSize="xs"
                          />
                          {task.rejections[0].rejectedAt && (
                            <> on {new Date(task.rejections[0].rejectedAt * 1000).toLocaleDateString()}</>
                          )}
                        </Text>
                      )}
                      {(previousSubmissionLoading || previousSubmission || previousSubmissionUnavailable) && (
                        <Box
                          mt={3}
                          p={3}
                          bg="blackAlpha.300"
                          borderRadius="md"
                          border="1px solid"
                          borderColor="whiteAlpha.100"
                        >
                          <Text
                            fontSize="xs"
                            color="red.200"
                            fontWeight="semibold"
                            textTransform="uppercase"
                            letterSpacing="wide"
                            mb={1}
                          >
                            Previous submission
                          </Text>
                          {previousSubmissionLoading ? (
                            <Text fontSize="sm" color="gray.400">Loading submitted work...</Text>
                          ) : previousSubmission ? (
                            <ExpandableText
                              text={previousSubmission}
                              expandLabel="Show full submission"
                              linkify
                            />
                          ) : (
                            <Text fontSize="sm" color="gray.400">
                              Previous submitted work is unavailable.
                            </Text>
                          )}
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Claim-release history (TaskManager v7). `releases` is only
                      selected when the endpoint is known to serve it, so this
                      block silently stays closed on older subgraphs — never a
                      "0 releases" empty state. `selfRelease` is the on-chain
                      discriminator (caller == previousClaimer), so we can say
                      which of the two routes it was with no extra call. */}
                  {task.releaseCount > 0 && task.releases?.length > 0 && (
                    <Box w="100%" p={4} bg="rgba(124, 45, 18, 0.45)" borderRadius="lg" borderLeft="4px solid" borderColor="orange.400">
                      <HStack mb={2}>
                        <RepeatIcon color="orange.300" />
                        <Text fontWeight="bold" color="orange.200" fontSize="md">
                          Returned to Open{task.releaseCount > 1 ? ` (${task.releaseCount} times)` : ''}
                        </Text>
                      </HStack>
                      <VStack align="stretch" spacing={1}>
                        {task.releases.map((r) => (
                          <Text key={r.id || `${r.previousClaimer}-${r.releasedAt}`} fontSize="xs" color="gray.300">
                            <UsernameLink
                              username={r.previousClaimerUsername}
                              hasUsername={!!r.previousClaimerUsername}
                              color="gray.200"
                              fontWeight="medium"
                              fontSize="xs"
                            />
                            {r.selfRelease ? ' gave it back' : ' had an expired claim released'}
                            {!r.selfRelease && r.callerUsername && (
                              <>
                                {' by '}
                                <UsernameLink
                                  username={r.callerUsername}
                                  hasUsername={!!r.callerUsername}
                                  color="gray.200"
                                  fontWeight="medium"
                                  fontSize="xs"
                                />
                              </>
                            )}
                            {r.releasedAt && <> on {new Date(r.releasedAt * 1000).toLocaleDateString()}</>}
                          </Text>
                        ))}
                      </VStack>
                    </Box>
                  )}

                  {/* Rejection Reason Input (In Review) */}
                  {columnId === 'inReview' && canReviewTask && (
                    <Box>
                      <SectionHeader>Rejection Reason</SectionHeader>
                      <Textarea
                        height="100px"
                        placeholder="Explain why this submission is being rejected..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        {...inputStyles}
                      />
                      <Text fontSize="xs" color="gray.500" mt={1}>
                        Required only if you choose to reject
                      </Text>
                    </Box>
                  )}

                  {/* Application Required Info */}
                  {columnId === 'open' && task.requiresApplication && (
                    <Box
                      p={3}
                      bg="whiteAlpha.50"
                      borderRadius="lg"
                      border="1px solid"
                      borderColor="whiteAlpha.200"
                      w="100%"
                    >
                      <HStack>
                        <Badge colorScheme="teal" fontSize="xs">Application Required</Badge>
                        <Text fontSize="xs" color="gray.400">
                          Members must apply and be approved before claiming
                        </Text>
                      </HStack>
                    </Box>
                  )}

                  {/* Already Applied Status */}
                  {columnId === 'open' && task.requiresApplication && hasApplied && (
                    <Box w="100%" p={4} bg="rgba(20, 83, 45, 0.5)" borderRadius="lg" borderLeft="4px solid" borderColor="green.400">
                      <HStack>
                        <CheckIcon color="green.300" />
                        <Text fontWeight="bold" color="green.200" fontSize="sm">
                          Application Submitted
                        </Text>
                      </HStack>
                      <Text fontSize="xs" color="gray.400" mt={1}>
                        Your application is pending review.
                        {userApplication?.appliedAt && (
                          <> Applied {new Date(userApplication.appliedAt * 1000).toLocaleDateString()}</>
                        )}
                      </Text>
                    </Box>
                  )}

                  {/* Applicants Section */}
                  {columnId === 'open' && task.requiresApplication && canAssign && task.applicants && task.applicants.length > 0 && (
                    <Box w="100%" p={4} bg="whiteAlpha.50" borderRadius="lg" border="1px solid" borderColor="whiteAlpha.100">
                      <SectionHeader>Applicants ({task.applicants.length})</SectionHeader>
                      <VStack spacing={3} align="stretch">
                        {task.applicants.map((applicant, index) => {
                          const appContent = applicant.metadata || applicationContents[applicant.address];
                          return (
                            <Box
                              key={index}
                              p={3}
                              bg="whiteAlpha.100"
                              borderRadius="md"
                              border="1px solid"
                              borderColor="whiteAlpha.100"
                            >
                              <Flex justify="space-between" align="start" mb={appContent || applicationsLoading ? 2 : 0}>
                                <VStack align="start" spacing={0}>
                                  <UsernameLink
                                    username={applicant.username || `${applicant.address?.slice(0, 6)}...${applicant.address?.slice(-4)}`}
                                    hasUsername={!!applicant.username}
                                    fontSize="sm"
                                    fontWeight="bold"
                                    color="white"
                                  />
                                  <Text fontSize="xs" color="gray.500">
                                    {applicant.appliedAt
                                      ? `Applied ${new Date(applicant.appliedAt * 1000).toLocaleDateString()}`
                                      : ''}
                                  </Text>
                                </VStack>
                                <Button
                                  size="sm"
                                  colorScheme="green"
                                  variant="outline"
                                  onClick={() => handleApproveApplication(applicant.address, applicant.username)}
                                >
                                  Approve
                                </Button>
                              </Flex>

                              {applicationsLoading && !appContent ? (
                                <Text fontSize="xs" color="gray.500">Loading application details...</Text>
                              ) : appContent ? (
                                <VStack align="start" spacing={2} mt={1}>
                                  <Box>
                                    <Text fontSize="xs" color="gray.400" fontWeight="bold" mb={0.5}>
                                      Why they want this task:
                                    </Text>
                                    <Text fontSize="sm" color="gray.300" style={{ whiteSpace: 'pre-wrap' }}>
                                      {appContent.notes || 'No notes provided'}
                                    </Text>
                                  </Box>
                                  {appContent.experience && (
                                    <Box>
                                      <Text fontSize="xs" color="gray.400" fontWeight="bold" mb={0.5}>
                                        Relevant Experience:
                                      </Text>
                                      <Text fontSize="sm" color="gray.300" style={{ whiteSpace: 'pre-wrap' }}>
                                        {appContent.experience}
                                      </Text>
                                    </Box>
                                  )}
                                </VStack>
                              ) : null}
                            </Box>
                          );
                        })}
                      </VStack>
                    </Box>
                  )}

                  {/* Assign Section (Executives) */}
                  {columnId === 'open' && canAssign && showAssignSection && (
                    <Box w="100%" p={4} bg="whiteAlpha.50" borderRadius="lg" border="1px solid" borderColor="whiteAlpha.100">
                      <SectionHeader>Assign Task</SectionHeader>

                      {!selectedAssignee && (
                        <UserSearchInput
                          onSelect={setSelectedAssignee}
                          placeholder="Search by username or 0x address..."
                          disabled={isAssigning}
                          size="sm"
                        />
                      )}

                      {selectedAssignee && (
                        <HStack
                          p={3}
                          bg="whiteAlpha.100"
                          borderRadius="lg"
                          justify="space-between"
                          border="1px solid"
                          borderColor="whiteAlpha.200"
                        >
                          <HStack spacing={3} minW={0}>
                            <UserIdentity
                              address={selectedAssignee.address}
                              usernameHint={selectedAssignee.username}
                              size="sm"
                              showName={false}
                              link={false}
                            />
                            <VStack align="start" spacing={0} minW={0}>
                              <Text color="white" fontSize="sm" fontWeight="medium" noOfLines={1}>
                                {selectedAssignee.username || 'No username'}
                              </Text>
                              <Text color="gray.400" fontSize="xs" fontFamily="mono">
                                {`${selectedAssignee.address.slice(0, 6)}...${selectedAssignee.address.slice(-4)}`}
                              </Text>
                            </VStack>
                          </HStack>
                          <IconButton
                            icon={<CloseIcon boxSize={2.5} />}
                            size="xs"
                            variant="ghost"
                            colorScheme="whiteAlpha"
                            onClick={() => setSelectedAssignee(null)}
                            aria-label="Clear selected user"
                            isDisabled={isAssigning}
                          />
                        </HStack>
                      )}

                      <Button
                        mt={3}
                        w="100%"
                        size="sm"
                        colorScheme="teal"
                        onClick={handleAssignTask}
                        isLoading={isAssigning}
                        loadingText="Assigning..."
                        isDisabled={!selectedAssignee}
                      >
                        Assign Task
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
            <HStack spacing={3} w="100%" justify="space-between" align="center">
              {/* Reward Display */}
              <Box
                p={3}
                bg="whiteAlpha.50"
                borderRadius="lg"
                border="1px solid"
                borderColor="whiteAlpha.100"
              >
                <VStack align="start" spacing={0}>
                  <Text fontSize="xs" color="gray.400">Reward</Text>
                  <HStack spacing={1} align="baseline">
                    <Text fontSize="lg" fontWeight="bold" color="white">
                      {task.Payout}
                    </Text>
                    <Text fontSize="sm" color="gray.300">{tokenLabel}</Text>
                    <Tooltip
                      label={`${tokenLabel} are your credit for work in ${orgDisplayName} — counts toward your ownership here, earned not bought.`}
                      placement="top"
                      maxW="250px"
                      fontSize="xs"
                    >
                      <InfoOutlineIcon boxSize={3} ml={0.5} color="gray.400" cursor="help" />
                    </Tooltip>
                  </HStack>
                  {checkHasBounty(task.bountyToken, task.bountyPayoutRaw) && (() => {
                    const tokenInfo = getTokenByAddress(task.bountyToken);
                    return (
                      <HStack spacing={1} align="center">
                        {tokenInfo.logo && (
                          <Image
                            src={tokenInfo.logo}
                            alt={tokenInfo.symbol}
                            boxSize="16px"
                            borderRadius="full"
                            fallback={<></>}
                          />
                        )}
                        <Text fontSize="sm" color="green.400" fontWeight="bold">
                          + {task.bountyPayout} {tokenInfo.symbol}
                        </Text>
                        {tokenInfo.projectUrl && (
                          <Link href={tokenInfo.projectUrl} isExternal onClick={(e) => e.stopPropagation()}>
                            <ExternalLinkIcon boxSize={3} color="gray.500" _hover={{ color: 'gray.300' }} />
                          </Link>
                        )}
                      </HStack>
                    );
                  })()}
                </VStack>
              </Box>

              {/* Action Buttons */}
              <HStack spacing={2}>
                <Button
                  variant="ghost"
                  onClick={copyLinkToClipboard}
                  color="gray.400"
                  _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
                  size="sm"
                >
                  Share
                </Button>
                {!task.isIndexing && columnId === 'open' && canAssign && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const next = !showAssignSection;
                      setShowAssignSection(next);
                      if (!next) setSelectedAssignee(null);
                    }}
                    color={showAssignSection ? "teal.300" : "gray.400"}
                    _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
                    size="sm"
                  >
                    {showAssignSection ? 'Cancel Assign' : 'Assign'}
                  </Button>
                )}
                {!task.isIndexing && canShowEditButton && (
                  <Button
                    variant="ghost"
                    onClick={handleOpenEditTaskModal}
                    color="gray.400"
                    _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
                    size="sm"
                  >
                    Edit
                  </Button>
                )}
                {!task.isIndexing && columnId === 'inReview' && canReviewTask && (
                  <Button
                    colorScheme="red"
                    variant="outline"
                    onClick={handleRejectTask}
                    size="sm"
                  >
                    Reject
                  </Button>
                )}
                {release.allowed && (
                  <Tooltip
                    label={release.isClaimer
                      ? 'Return this task to Open. You lose the claim and anyone can pick it up.'
                      : 'Free this expired claim so the task returns to Open for anyone.'}
                    placement="top"
                  >
                    <Button
                      colorScheme={release.isClaimer ? 'orange' : 'red'}
                      variant="outline"
                      onClick={releaseConfirm.onOpen}
                      size="sm"
                    >
                      {releaseActionLabel(release.reason)}
                    </Button>
                  </Tooltip>
                )}
                {/* Completed is terminal on-chain: cancelTask is UNCLAIMED-only, so the
                    old delete button here reverted BadStatus for every caller, including
                    project managers and the executor. No primary action exists. */}
                {columnId !== 'completed' && (
                <Tooltip
                  label={`Only ${task.claimerUsername || 'the current claimer'} can submit this task.`}
                  isDisabled={!(columnId === 'inProgress' && !isClaimer && !claimExpired)}
                  placement="top"
                >
                  <Button
                    onClick={handleButtonClick}
                    colorScheme={columnId === 'inProgress' && !isClaimer && claimExpired ? 'orange' : 'teal'}
                    isDisabled={
                      task.isIndexing ||
                      (columnId === 'open' && task.requiresApplication && hasApplied) ||
                      (columnId === 'inProgress' && !isClaimer && !claimExpired) ||
                      (columnId === 'inProgress' && !isClaimer && claimExpired && task.requiresApplication && hasApplied)
                    }
                    size="sm"
                  >
                    {buttonText()}
                  </Button>
                </Tooltip>
                )}
              </HStack>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {canShowEditButton && !task.isIndexing && (
        <EditTaskModal
          isOpen={isEditTaskModalOpen}
          onClose={handleCloseEditTaskModal}
          // For EDIT_META-only editors the modal routes through onEditTaskMetadata which
          // calls TaskManager.updateTaskMetadata (title + metadataHash only); the full
          // onEditTask path is used otherwise.
          onEditTask={isMetadataOnlyEditor ? onEditTaskMetadata : onEditTask}
          metadataOnly={isMetadataOnlyEditor}
          task={task}
          onDeleteTask={(taskId) => deleteTask(taskId, columnId)}
          // cancelTask is gated on CREATE (or project manager) and reverts unless UNCLAIMED.
          allowDelete={columnId === 'open' && perms.canCreate}
        />
      )}

      {/* Task Application Modal */}
      <TaskApplicationModal
        isOpen={isApplicationModalOpen}
        onClose={onCloseApplicationModal}
        onApply={handleApply}
        task={task}
      />

      {/* Release confirmation — destructive and not undoable by the releaser:
          the claim is gone and anyone eligible can take the task next. */}
      <AlertDialog
        isOpen={releaseConfirm.isOpen}
        leastDestructiveRef={releaseCancelRef}
        onClose={releaseConfirm.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent bg="gray.800" color="white" borderRadius="2xl">
            <AlertDialogHeader fontSize="lg" fontWeight="800">
              {release.isClaimer ? 'Give this task back?' : 'Release this claim?'}
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color="gray.200">
              {releaseConfirmCopy(release.reason, task.claimerUsername)}
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button
                ref={releaseCancelRef}
                onClick={releaseConfirm.onClose}
                variant="outline"
                color="gray.200"
                borderColor="whiteAlpha.400"
                _hover={{ bg: 'whiteAlpha.100' }}
              >
                {release.isClaimer ? 'Keep it' : 'Cancel'}
              </Button>
              <Button
                onClick={handleReleaseTask}
                ml={3}
                colorScheme={release.isClaimer ? 'orange' : 'red'}
              >
                {releaseActionLabel(release.reason)}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  ) : null;
};

export default TaskCardModal;
