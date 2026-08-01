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
} from '@chakra-ui/react';
import { CheckIcon, WarningIcon, ExternalLinkIcon, InfoOutlineIcon, CloseIcon, TimeIcon } from '@chakra-ui/icons';
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
} from '@/util/deadlineUtils';
import { useNow } from '@/hooks/useNow';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { useUserContext } from '@/context/UserContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { useRouter } from 'next/router';
import { useProjectContext } from '@/context/ProjectContext';
import { UserSearchInput } from '@/components/common';
import UserIdentity from '@/components/common/UserIdentity';
import {
  userCanReviewTask,
  userCanAssignTask,
  userCanEditTaskFull,
  userCanEditTaskMetadata,
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

const TaskCardModal = ({ task, columnId, onEditTask, onEditTaskMetadata }) => {
  const [submission, setSubmission] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const { moveTask, deleteTask, applyForTask, approveApplication, assignTask, takeOverTask, rejectTask } = useTaskBoard();
  const { hasExecRole, hasMemberRole, address: account, fetchUserDetails, userData } = useUserContext();
  const { projectsData } = useProjectContext();
  const { getUsernameByAddress, setSelectedProject, projects } = useDataBaseContext();
  const { safeFetchFromIpfs } = useIPFScontext();
  const router = useRouter();
  const userDAO = useOrgName();
  const { tokenLabel, taskPayoutHoursOnly } = usePOContext();
  const toast = useToast();
  const { isOpen, onOpen, onClose} = useDisclosure();
  const { isOpen: isApplicationModalOpen, onOpen: onOpenApplicationModal, onClose: onCloseApplicationModal } = useDisclosure();
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

  // Application IPFS content state
  const [applicationContents, setApplicationContents] = useState({});
  const [applicationsLoading, setApplicationsLoading] = useState(false);

  // Project-level review permission (matches TaskColumn.js pattern)
  const userHatIds = userData?.hatIds || [];
  const currentProject = useMemo(() => {
    return projectsData?.find(p => p.id === task?.projectId);
  }, [projectsData, task?.projectId]);
  const projectRolePermissions = currentProject?.rolePermissions || [];
  // Org-wide ROLE_PERM grants — mirrors the contract's _permMask global fallback so hats
  // granted EDIT_FULL via setConfig(ROLE_PERM, ...) (e.g. Test6 governance proposal) are
  // visible to the frontend even when no per-project mask exists.
  const globalRolePermissions = currentProject?.globalRolePermissions || [];

  const canReviewTask = useMemo(() => {
    const hasPermission = userCanReviewTask(userHatIds, projectRolePermissions, globalRolePermissions);
    if (hasPermission) return true;
    if (!projectRolePermissions?.length && hasExecRole) return true;
    return false;
  }, [userHatIds, projectRolePermissions, globalRolePermissions, hasExecRole]);

  // Project-level assign permission (for approving applications)
  // Contract's approveApplication requires ASSIGN permission or project manager
  const canAssign = useMemo(() => {
    const hasPermission = userCanAssignTask(userHatIds, projectRolePermissions, globalRolePermissions);
    if (hasPermission) return true;
    if (!projectRolePermissions?.length && hasExecRole) return true;
    return false;
  }, [userHatIds, projectRolePermissions, globalRolePermissions, hasExecRole]);

  // TaskManager v5: post-claim editing.
  // - EDIT_FULL allows editing payout + bounty + metadata on CLAIMED / SUBMITTED tasks
  // - EDIT_META allows editing only title + metadata (routes through updateTaskMetadata)
  // Terminal states (COMPLETED / CANCELLED) stay locked. PM/executive bypass via hasExecRole
  // mirrors the contract's `_isPM` bypass.
  const canEditTaskFull = useMemo(() => {
    const hasPermission = userCanEditTaskFull(userHatIds, projectRolePermissions, globalRolePermissions);
    if (hasPermission) return true;
    if (!projectRolePermissions?.length && hasExecRole) return true;
    return false;
  }, [userHatIds, projectRolePermissions, globalRolePermissions, hasExecRole]);

  // True if the user has EDIT_META or EDIT_FULL (EDIT_FULL is a strict superset).
  const canEditTaskMetadata = useMemo(() => {
    const hasPermission = userCanEditTaskMetadata(userHatIds, projectRolePermissions, globalRolePermissions);
    if (hasPermission) return true;
    if (!projectRolePermissions?.length && hasExecRole) return true;
    return false;
  }, [userHatIds, projectRolePermissions, globalRolePermissions, hasExecRole]);

  // True if the user has EDIT_META but NOT EDIT_FULL — used to route the modal through
  // updateTaskMetadata (which only takes title + metadataHash) instead of the full updateTask.
  const isMetadataOnlyEditor = canEditTaskMetadata && !canEditTaskFull && !hasExecRole;

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

    const { projectId, view } = router.query;
    const safeProjectId = projectId ? encodeURIComponent(decodeURIComponent(projectId)) : '';

    // Wait for URL to update before returning - this prevents new modal instances from opening
    await router.push(
      {
        pathname: `/tasks/`,
        query: { projectId: safeProjectId, org: userDAO, ...(view ? { view } : {}) },
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
    if (!hasExecRole) {
      toast({
        title: 'Permission Required',
        description: 'You must be an executive to assign tasks.',
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
      if (!canReviewTask) {
        toast({
          title: 'Permission Required',
          description: 'You must have review permissions to complete the review.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
    }

    if (columnId === 'completed') {
      if (!hasExecRole) {
        toast({
          title: 'Permission Required',
          description: 'You must be an executive to delete a task.',
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

    if (columnId === 'completed') {
      // Delete task
      deleteTask(task.id, columnId).catch(error => {
        console.error("Error deleting task:", error);
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
      case 'completed':
        return <CheckIcon />;
      default:
        return '';
    }
  };

  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);

  // Edit gating:
  // - Pre-claim (`open` column): existing hasExecRole bypass (CREATE-perm hats already pass).
  // - Post-claim (`inProgress` / `inReview`): EDIT_META or EDIT_FULL grants edit access.
  //   EDIT_META-only callers go through updateTaskMetadata (no payout/bounty changes).
  // - Terminal (`completed`): never editable.
  const isPostClaimColumn = columnId === 'inProgress' || columnId === 'inReview';
  const canShowEditButton = (
    columnId === 'open' && hasExecRole
  ) || (
    isPostClaimColumn && (hasExecRole || canEditTaskMetadata)
  );

  const handleOpenEditTaskModal = () => {
    if (canShowEditButton) {
      setIsEditTaskModalOpen(true);
    } else {
      toast({
        title: 'Permission Required',
        description: isPostClaimColumn
          ? 'You need EDIT_META or EDIT_FULL permission (or executive role) to edit a task after it has been claimed.'
          : 'You must be an executive to edit a task.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
    }
  };

  const handleCloseEditTaskModal = () => {
    setIsEditTaskModalOpen(false);
    const { projectId, view } = router.query;
    const safeProjectId = projectId ? encodeURIComponent(decodeURIComponent(projectId)) : '';
    router.push(
      {
        pathname: `/tasks/`,
        query: { projectId: safeProjectId, org: userDAO, ...(view ? { view } : {}) },
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
                      <Text fontSize="sm" lineHeight="6" color="gray.200" style={{ whiteSpace: 'pre-wrap' }}>
                        {metadataLoading ? 'Loading task details...' : (task.description ?? taskMetadata?.description ?? 'No description available')}
                      </Text>
                    </Box>
                    <HStack mt={3} spacing={3}>
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
                        <Text fontSize="sm" color="gray.400">
                          Claimed by{' '}
                          <UsernameLink
                            username={task.claimerUsername}
                            hasUsername={!!task.claimerUsername}
                            color="white"
                            fontWeight="medium"
                            fontSize="sm"
                          />
                        </Text>
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
                        <Text fontSize="sm" color="gray.200" style={{ whiteSpace: 'pre-wrap' }}>
                          {metadataLoading ? 'Loading submission...' : (task.submission ?? submissionMetadata?.submission ?? 'No submission available')}
                        </Text>
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
                  {columnId === 'open' && hasExecRole && showAssignSection && (
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
                {!task.isIndexing && columnId === 'open' && hasExecRole && (
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
          allowDelete={columnId === 'open'}
        />
      )}

      {/* Task Application Modal */}
      <TaskApplicationModal
        isOpen={isApplicationModalOpen}
        onClose={onCloseApplicationModal}
        onApply={handleApply}
        task={task}
      />
    </>
  ) : null;
};

export default TaskCardModal;
