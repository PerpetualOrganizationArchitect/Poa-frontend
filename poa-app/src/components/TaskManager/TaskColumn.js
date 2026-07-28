import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { AddIcon } from '@chakra-ui/icons';
import { Box, Heading, IconButton, Toast, Flex, Text } from '@chakra-ui/react';
import { useDrop } from 'react-dnd';
import TaskCard from './TaskCard';
import { useTaskBoard } from '../../context/TaskBoardContext';
import AddTaskModal from './AddTaskModal';
import { useAuth } from '../../context/AuthContext';
import {usePOContext} from '@/context/POContext';
import { useToast } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useProjectContext } from '@/context/ProjectContext';
import { useUserContext } from '@/context/UserContext';
import { useOrgName } from '@/hooks/useOrgName';
import { useTaskDrafts } from '@/hooks/useTaskDrafts';
import { calculatePayout } from '../../util/taskUtils';
import { userCanCreateTask, userCanReviewTask, PERMISSION_MESSAGES, ROLE_INDICES } from '../../util/permissions';
import { useTaskFilters } from './views/useTaskFilters';
import { FilteredEmptyState } from './views/TaskFilterBar';


const glassLayerStyle = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(0, 0, 0, .3)',
};




const TaskColumn = forwardRef(({ title, tasks, columnId, projectName, isMobile = false, isEmpty = false, hideTitleInMobile = false, takeoverTasks = [] }, ref) => {
  const router = useRouter();
  const userDAO = useOrgName();
  const { moveTask, addTask, addTaskBatch, editTask, editTaskMetadata } = useTaskBoard();
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('quick');
  const [isSubmittingDrafts, setIsSubmittingDrafts] = useState(false);
  const { draftsForProject, addDraft, replaceDraft, removeDraft, clearProjectDrafts } = useTaskDrafts();
  const { accountAddress: account } = useAuth();
  const { taskManagerContractAddress, roleHatIds } = usePOContext();
  const { taskCount, projectsData } = useProjectContext();
  const toast = useToast();
  const { graphUsername, hasMemberRole: userHasMemberRole, userData } = useUserContext();
  // Shared filter predicate (search + quick-filter chips). Applied per-card at
  // render so the original task index stays correct for edit-by-index.
  const { predicate, isFiltering } = useTaskFilters();

  // Get user's current hat IDs for permission checking
  const userHatIds = userData?.hatIds || [];

  // Normalize hat IDs for comparison
  const normalizeHatId = (id) => String(id).trim();

  // Find the current project's role permissions
  const currentProject = useMemo(() => {
    return projectsData?.find(p => p.name === projectName || p.title === projectName);
  }, [projectsData, projectName]);

  const projectRolePermissions = currentProject?.rolePermissions || [];
  // Org-wide ROLE_PERM grants — the fallback when a hat has no per-project mask, mirroring the
  // contract's _permMask (project mask wins if non-zero, else global). Without this, hats granted
  // CREATE only via setConfig(ROLE_PERM, ...) are invisible to the frontend.
  const globalRolePermissions = currentProject?.globalRolePermissions || [];
  const currentProjectId = currentProject?.id;
  const projectDrafts = useMemo(
    () => (currentProjectId ? draftsForProject(currentProjectId) : []),
    [currentProjectId, draftsForProject]
  );

  // Check if user has a non-member role (executive+)
  const hasNonMemberRole = useMemo(() => {
    if (!userHatIds.length || !roleHatIds?.length) return false;
    const normalizedUserHats = userHatIds.map(normalizeHatId);
    // roleHatIds[0] = member, roleHatIds[1] = executive, etc.
    if (roleHatIds.length > 1) {
      const nonMemberRoles = roleHatIds.slice(ROLE_INDICES.EXECUTIVE);
      return nonMemberRoles.some(roleId =>
        normalizedUserHats.includes(normalizeHatId(roleId))
      );
    }
    return false;
  }, [userHatIds, roleHatIds]);

  // Check if user can create tasks in this project
  // Falls back to executive+ role ONLY when NEITHER project nor global permissions are configured
  const canCreateTask = useMemo(() => {
    if (userCanCreateTask(userHatIds, projectRolePermissions, globalRolePermissions)) return true;
    if (!projectRolePermissions?.length && !globalRolePermissions?.length && hasNonMemberRole) return true;
    return false;
  }, [userHatIds, projectRolePermissions, globalRolePermissions, hasNonMemberRole]);

  // Check if user can review tasks in this project
  // Falls back to executive+ role ONLY when NEITHER project nor global permissions are configured
  const canReviewTask = useMemo(() => {
    if (userCanReviewTask(userHatIds, projectRolePermissions, globalRolePermissions)) return true;
    if (!projectRolePermissions?.length && !globalRolePermissions?.length && hasNonMemberRole) return true;
    return false;
  }, [userHatIds, projectRolePermissions, globalRolePermissions, hasNonMemberRole]);

  // Empty state icons and messages, moved from TaskBoard for consistency
  const emptyStateIcons = {
    'Open': '🚀',
    'In Progress': '⚙️',
    'Review': '🔍',
    'Completed': '🏆'
  };

  const emptyStateMessages = {
    'Open': 'Looks like a blank canvas! Create a task and start building something amazing.',
    'In Progress': 'No tasks in the works yet. Claim one from "Open" to show your skills!',
    'Review': 'Nothing to review at the moment. Good work happens before great feedback!',
    'Completed': 'The finish line is waiting for your first completed task. Keep pushing!'
  };

  let hasMemberRole = userHasMemberRole;
  const hasMemberRoleRef = useRef(hasMemberRole);
  const canReviewTaskRef = useRef(canReviewTask);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    handleOpenAddTaskModal: () => {
      if (title === 'Open') {
        if (canCreateTask) {
          setIsAddTaskModalOpen(true);
        } else {
          toast({
            title: 'Permission Required',
            description: PERMISSION_MESSAGES.REQUIRE_CREATE,
            status: 'warning',
            duration: 4000,
            isClosable: true,
            position: 'top',
          });
        }
      }
    }
  }), [title, canCreateTask, toast]);

  useEffect(() => {
    hasMemberRoleRef.current = hasMemberRole;
  }, [hasMemberRole]);

  useEffect(() => {
    canReviewTaskRef.current = canReviewTask;
  }, [canReviewTask]);

  // Auto-open the AddTaskModal in draft mode when navigated here with
  // ?openDrafts=1 (set by NavBar's "Open <project> drafts" button). Only the
  // matching project's Open column responds; the flag is then stripped from
  // the URL so refreshes don't re-trigger.
  useEffect(() => {
    if (title !== 'Open') return;
    if (router.query.openDrafts !== '1') return;
    if (!currentProjectId || !canCreateTask) return;
    const queryProjectId = router.query.projectId
      ? decodeURIComponent(router.query.projectId)
      : null;
    if (queryProjectId && queryProjectId !== currentProjectId) return;

    setModalMode('draft');
    setIsAddTaskModalOpen(true);

    const { openDrafts: _drop, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
  }, [router, title, currentProjectId, canCreateTask]);

  
  const handleCloseAddTaskModal = () => {
    setIsAddTaskModalOpen(false);
  };
  
  const handleAddTask = (updatedTask) => {
    if (title === 'Open') {
      // Close modal immediately for optimistic UX
      handleCloseAddTaskModal();

      // addTask from TaskBoardContext handles:
      // - Payout calculation
      // - Optimistic UI update
      // - Blockchain transaction via TaskService
      // - Notifications and error handling
      // Fire and forget - don't await, let it run in background
      addTask(updatedTask, 'open').catch(error => {
        console.error("Error adding task:", error);
      });
    }
  };

  const handleSaveDraft = (taskData, editingDraftId) => {
    if (!currentProjectId) return;
    if (editingDraftId) {
      replaceDraft(editingDraftId, taskData);
    } else {
      addDraft(taskData, currentProjectId);
    }
  };

  const handleSubmitDrafts = async () => {
    if (!currentProjectId || projectDrafts.length === 0) return;
    setIsSubmittingDrafts(true);
    try {
      const result = await addTaskBatch(projectDrafts, currentProjectId, columnId);
      if (result?.success) {
        clearProjectDrafts(currentProjectId);
        setIsAddTaskModalOpen(false);
        setModalMode('quick');
      }
    } finally {
      setIsSubmittingDrafts(false);
    }
  };
  
  

  const handleEditTask = async (updatedTask, taskIndex) => {
    updatedTask = {
      ...updatedTask,
      difficulty: updatedTask.difficulty,
      estHours: updatedTask.estHours,
    };

    await editTask(updatedTask, columnId, taskIndex, projectName);

    toast ({
      title: "Task edited.",
      description: "Your task was successfully edited.",
      status: "success",
      duration: 3000,
      isClosable: true,
    });
  };

  // Metadata-only edit path (TaskManager v5 `updateTaskMetadata`). Used when the editor
  // has TaskPerm.EDIT_META but not EDIT_FULL — payout / bounty are left untouched.
  const handleEditTaskMetadata = async (updatedTask, taskIndex) => {
    await editTaskMetadata(
      { ...updatedTask, difficulty: updatedTask.difficulty, estHours: updatedTask.estHours },
      columnId,
      taskIndex,
      projectName,
    );

    toast({
      title: 'Task metadata updated.',
      description: 'Title and description were updated; payout and bounty are unchanged.',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });

  };

  // Enhanced drop behavior with debugging for tracing issues
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'task',
    canDrop: () => true, // Always allow dropping
    drop: async(item) => {
      if (!hasMemberRoleRef.current && title !== 'Completed') {
        toast({
          title: 'Membership Required',
          description: 'You must be a member to move tasks. Go to user page to join.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
      else if (!canReviewTaskRef.current && title === 'Completed') {
        toast({
          title: 'Permission Required',
          description: PERMISSION_MESSAGES.REQUIRE_REVIEW,
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
      // Note: Token minting is now handled automatically by the contract on task completion

      // Only allow valid forward transitions:
      // open → inProgress (claim), inProgress → inReview (submit), inReview → completed (complete)
      const validTransitions = {
        'open': 'inProgress',
        'inProgress': 'inReview',
        'inReview': 'completed',
      };

      if (validTransitions[item.columnId] !== columnId) {
        toast({
          title: 'Action Not Allowed',
          description: item.columnId === 'completed'
            ? 'You cannot move tasks from the Completed column.'
            : 'Tasks can only move forward: Open → In Progress → In Review → Completed.',
          status: 'info',
          duration: 3000,
          isClosable: true,
          position: 'top',
        });
        return;
      }

      if (item.columnId !== columnId) {
        const newIndex = tasks?.length || 0;
        
        const claimedByValue = title === 'In Progress' ? account : item.claimedBy;
        const claimerUserValue = title === 'In Progress' ? graphUsername : item.claimerUsername;
        
        const draggedTask = {
          ...item,
          id: item.id,
          name: item.name,
          description: item.description,
          difficulty: item.difficulty,
          estHours: item.estHours,
          claimedBy: claimedByValue,
          claimerUsername: claimerUserValue,
        };
        
        // Use the task's actual projectId (from subgraph), not constructed from projectName
        const safeProjectId = item.projectId ? encodeURIComponent(decodeURIComponent(item.projectId)) : '';

        // Use the resolved userDAO to maintain consistency
        router.push({
          pathname: `/tasks/`,
          query: {
            org: userDAO,
            projectId: safeProjectId,
            task: draggedTask.id
          }
        }, undefined, { shallow: true });
        
        try {
          await moveTask(draggedTask, item.columnId, columnId, newIndex, item.submission, claimedByValue);
          toast({
            title: "Task moved.",
            description: "Your task was successfully moved.",
            status: "success",
            duration: 3000,
            isClosable: true,
          });
        } catch (error) {
          console.error("Error moving task:", error);
          toast({
            title: "Error moving task.",
            description: "There was an issue moving the task. Please try again.",
            status: "error",
            duration: 3000,
            isClosable: true,
          });
        }
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  // Apply visual feedback for drop zones
  const columnStyle = isOver ? { 
    backgroundColor: 'rgba(123, 104, 238, 0.15)',
    transition: 'background-color 0.3s ease',
    boxShadow: 'inset 0 0 10px rgba(123, 104, 238, 0.3)'
  } : {};

  // Mobile-specific column header style
  const mobileHeaderStyle = {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    color: 'white',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  // Enhanced empty state style with drop zone highlighting
  const emptyStateStyle = {
    width: '100%',
    height: '100%',
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    textAlign: 'center',
    backgroundColor: isOver ? 'rgba(123, 104, 238, 0.15)' : 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    border: isOver ? '1px dashed rgba(123, 104, 238, 0.5)' : '1px dashed rgba(255, 255, 255, 0.2)',
    margin: '0 auto 16px auto',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
  };

  const handleOpenAddTaskModal = () => {
    if (title === 'Open') {
      if (canCreateTask) {
        setIsAddTaskModalOpen(true);
      } else {
        toast({
          title: 'Permission Required',
          description: PERMISSION_MESSAGES.REQUIRE_CREATE,
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
      }
    }
  };

  // Render the empty state content
  const renderEmptyState = () => (
    <Box style={emptyStateStyle}>
      <Text fontSize="3xl" mb={2}>
        {emptyStateIcons[title] || '✨'}
      </Text>
      <Text color="white" fontWeight="medium" fontSize="sm" mb={2}>
        {title}
      </Text>
      <Text color="whiteAlpha.700" fontSize="xs">
        {emptyStateMessages[title] || 'Drag tasks here to populate this column.'}
      </Text>
    </Box>
  );

  // Filtered visibility. Keep the source arrays intact (map with the real index)
  // and only decide what to paint — the header count + empty state read these.
  // Takeover ghosts are expired In Progress tasks mirrored into Open, so they
  // are matched against their real 'inProgress' column, not this column's id.
  const matchTask = (task) => !isFiltering || predicate(task, columnId);
  const matchTakeover = (task) => !isFiltering || predicate(task, 'inProgress');
  const visibleTaskCount = (tasks || []).filter(matchTask).length;
  const visibleTakeoverCount = (takeoverTasks || []).filter(matchTakeover).length;
  const hasVisible = visibleTaskCount > 0 || visibleTakeoverCount > 0;

  return (
    <Box
      ref={drop}
      w="100%"
      h="100%"
      minH={isMobile ? "500px" : "auto"}
      bg="transparent" 
      borderRadius="xl"
      boxShadow={isMobile ? "none" : "lg"}
      style={{ ...columnStyle, position: 'relative' }}
      zIndex={1}
      display="flex"
      flexDirection="column"
      data-column-id={columnId}
      data-column-title={title}
    >
      <div className="glass" style={glassLayerStyle} />
      
      {(!isMobile || (isMobile && !hideTitleInMobile)) && (
        <Heading size="md" mb={3} mt={0} ml={3} alignItems="center" color='white'>
          {title}
          {isFiltering && (
            <Text as="span" fontSize="sm" fontWeight="400" color="whiteAlpha.600" ml={2}>
              {visibleTaskCount + visibleTakeoverCount}
            </Text>
          )}
          {title === 'Open' && (
            <IconButton
              data-tour="add-task-btn"
              ml={8}
              icon={<AddIcon color="white" />}
              aria-label="Add task"
              onClick={handleOpenAddTaskModal}
              h="1.75rem"
              w="1.75rem"
              minW={0}
              bg="purple.500"
              _hover={{ bg: "purple.600" }}
              _active={{ bg: "purple.700" }}
              boxShadow="md"
              borderRadius="md"
            />
          )}
        </Heading>
      )}
      
      <Box
        h={isMobile ? "calc(100% - 3rem)" : "calc(100% - 3rem)"}
        borderRadius="md"
        bg="transparent"
        p={isMobile ? 1 : 2}
        style={columnStyle}
        overflowY={(tasks && tasks.length > 0) || takeoverTasks.length > 0 ? "auto" : "hidden"}
        flex="1"
        width="100%"
        css={{
          '&::-webkit-scrollbar': {
            width: '4px',
          },
          '&::-webkit-scrollbar-track': {
            width: '6px',
            background: 'rgba(0,0,0,0.1)',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '24px',
          },
        }}
      >
        {hasVisible ? (
          <>
            {(tasks || []).map((task, index) =>
              matchTask(task) ? (
                <TaskCard
                  key={task.id}
                  task={task}
                  columnId={columnId}
                  onEditTask={(updatedTask) => handleEditTask(updatedTask, index)}
                  onEditTaskMetadata={(updatedTask) => handleEditTaskMetadata(updatedTask, index)}
                  isMobile={isMobile}
                />
              ) : null,
            )}
            {/* Expired claims surfaced as claimable from Open (v6 takeover): render-only
                mirrors — the task also remains in In Progress for its current holder.
                columnId is the task's REAL column so the chip/modal logic stays truthful. */}
            {takeoverTasks.map((task) =>
              matchTakeover(task) ? (
                <TaskCard
                  key={`takeover-${task.id}`}
                  task={task}
                  columnId="inProgress"
                  isTakeoverGhost
                  onEditTask={() => {}}
                  onEditTaskMetadata={() => {}}
                  isMobile={isMobile}
                />
              ) : null,
            )}
          </>
        ) : isFiltering ? (
          // Filtered to empty — show the neutral "no match" state, never the
          // emoji motivational one. (The whole-board 0-match state with a Clear
          // button lives in TaskBoardDesktop / TaskBoardMobile.)
          <Flex justify="center" align="center" height="100%" width="100%">
            <FilteredEmptyState compact />
          </Flex>
        ) : (
          <Flex
            justify="center"
            align="center"
            height="100%"
            width="100%"
          >
            {renderEmptyState()}
          </Flex>
        )}
      </Box>

      {title === 'Open' && (
        <AddTaskModal
          isOpen={isAddTaskModalOpen}
          onClose={handleCloseAddTaskModal}
          onAddTask={handleAddTask}
          mode={modalMode}
          onModeChange={setModalMode}
          drafts={projectDrafts}
          onSaveDraft={currentProjectId ? handleSaveDraft : undefined}
          onDeleteDraft={removeDraft}
          onSubmitDrafts={handleSubmitDrafts}
          isSubmittingDrafts={isSubmittingDrafts}
        />
      )}
    </Box>
  );
});

export default TaskColumn;
  
 
