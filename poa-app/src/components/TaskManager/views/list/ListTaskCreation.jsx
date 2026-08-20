import { createContext, useContext, useMemo, useState } from 'react';
import { AddIcon } from '@chakra-ui/icons';
import { Button, Flex, IconButton, Tooltip, useToast } from '@chakra-ui/react';
import { useTaskBoard } from '@/context/TaskBoardContext';
import { useProjectContext } from '@/context/ProjectContext';
import { useUserContext } from '@/context/UserContext';
import { useTaskDrafts } from '@/hooks/useTaskDrafts';
import { projectTaskPermissions, PERMISSION_MESSAGES } from '@/util/permissions';
import AddTaskModal from '@/components/TaskManager/AddTaskModal';

// Owns the "create a task" concern for the List view. Mirrors the create/draft
// wiring on the Board's Open column (see TaskColumn.js:33-210) so the List has
// full feature parity (quick + draft modes) while reusing the same AddTaskModal
// and the same TaskBoardContext.addTask path.
//
// IMPORTANT: this depends on useTaskBoard(), so it must only be mounted inside a
// TaskBoardProvider (i.e. a project-scoped list). The cross-project "All Tasks"
// list (AllTasksView) renders ListView with no provider, so it never mounts this
// — the buttons below return null when there is no surrounding context.
const TaskCreationContext = createContext(null);

export const useTaskCreationCtx = () => useContext(TaskCreationContext);

export function TaskCreationProvider({ projectName, children }) {
  const toast = useToast();
  const { addTask, addTaskBatch } = useTaskBoard();
  const { projectsData } = useProjectContext();
  const { userData, address } = useUserContext();
  const {
    draftsForProject,
    addDraft,
    replaceDraft,
    removeDraft,
    clearProjectDrafts,
  } = useTaskDrafts();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('quick');
  const [isSubmittingDrafts, setIsSubmittingDrafts] = useState(false);

  const userHatIds = useMemo(() => userData?.hatIds || [], [userData]);

  const currentProject = useMemo(
    () => projectsData?.find((p) => p.name === projectName || p.title === projectName),
    [projectsData, projectName],
  );
  // Same resolution as TaskColumn's gate: the contract's `_checkPerm` — the
  // per-hat mask (project shadows global) OR being one of this project's managers.
  const perms = useMemo(
    () => projectTaskPermissions(currentProject, userHatIds, address),
    [currentProject, userHatIds, address],
  );
  const currentProjectId = currentProject?.id;
  const projectDrafts = useMemo(
    () => (currentProjectId ? draftsForProject(currentProjectId) : []),
    [currentProjectId, draftsForProject],
  );

  const canCreate = perms.canCreate;

  const close = () => setIsOpen(false);

  const open = () => {
    if (!canCreate) {
      toast({
        title: 'Permission Required',
        description: PERMISSION_MESSAGES.REQUIRE_CREATE,
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }
    setMode('quick');
    setIsOpen(true);
  };

  const handleAddTask = (updatedTask) => {
    // Close immediately for optimistic UX; addTask handles payout calc,
    // optimistic update, the on-chain tx and notifications. Fire-and-forget —
    // new tasks always land in the project's Open column.
    close();
    addTask(updatedTask, 'open').catch((error) => {
      console.error('Error adding task:', error);
    });
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
      const result = await addTaskBatch(projectDrafts, currentProjectId, 'open');
      if (result?.success) {
        clearProjectDrafts(currentProjectId);
        setIsOpen(false);
        setMode('quick');
      }
    } finally {
      setIsSubmittingDrafts(false);
    }
  };

  // canCreate is the only value that changes the consumers' behaviour; `open`
  // closes over stable setters + toast, so re-memoizing on canCreate is enough.
  const ctxValue = useMemo(() => ({ canCreate, open }), [canCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TaskCreationContext.Provider value={ctxValue}>
      {children}
      <AddTaskModal
        // createAndAssignTask needs CREATE **and** ASSIGN together (see TaskColumn).
        canAssign={perms.canCreateAndAssign}
        isOpen={isOpen}
        onClose={close}
        onAddTask={handleAddTask}
        mode={mode}
        onModeChange={setMode}
        drafts={projectDrafts}
        onSaveDraft={currentProjectId ? handleSaveDraft : undefined}
        onDeleteDraft={removeDraft}
        onSubmitDrafts={handleSubmitDrafts}
        isSubmittingDrafts={isSubmittingDrafts}
      />
    </TaskCreationContext.Provider>
  );
}

const purpleBtnSx = {
  bg: 'purple.500',
  color: 'white',
  _hover: { bg: 'purple.600' },
  _active: { bg: 'purple.700' },
};

// Primary "New Task" action for the List toolbar. Matches the Board's add
// behaviour: always visible, and a permission toast fires on click when the
// user can't create. Compact icon on mobile, labelled button on desktop.
export function NewTaskButton({ isMobile = false }) {
  const ctx = useTaskCreationCtx();
  if (!ctx) return null;

  if (isMobile) {
    return (
      <Tooltip label="Add task" placement="top">
        <IconButton
          size="xs"
          aria-label="Add task"
          icon={<AddIcon boxSize={3} />}
          onClick={ctx.open}
          flexShrink={0}
          boxShadow="sm"
          {...purpleBtnSx}
        />
      </Tooltip>
    );
  }

  return (
    <Button
      size="sm"
      leftIcon={<AddIcon boxSize={3} />}
      onClick={ctx.open}
      flexShrink={0}
      boxShadow="sm"
      {...purpleBtnSx}
    >
      New Task
    </Button>
  );
}

// Prominent call-to-action shown beneath the empty-list message. Only rendered
// when the user can actually create, so it never dangles into a permission toast.
export function EmptyStateCreateButton() {
  const ctx = useTaskCreationCtx();
  if (!ctx || !ctx.canCreate) return null;

  return (
    <Flex justify="center" mt={5}>
      <Button leftIcon={<AddIcon boxSize={3} />} onClick={ctx.open} {...purpleBtnSx}>
        Create Task
      </Button>
    </Flex>
  );
}
