import { useMemo } from 'react';
import { useToast } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTaskBoard } from '@/context/TaskBoardContext';
import { useDataBaseContext } from '@/context/dataBaseContext';
import TaskCardModal from '@/components/TaskManager/TaskCardModal';
import { selectTaskModal } from '@/components/TaskManager/views/taskModalSelection';

// One modal for every project view, including mobile columns and filtered
// boards. Removing the task query (including browser Back) unmounts it.
const TaskModalMount = () => {
  const router = useRouter();
  const { taskColumns, editTask, editTaskMetadata } = useTaskBoard();
  const { selectedProject } = useDataBaseContext();
  const toast = useToast();
  const taskParam = router.query.task;
  const requestedProjectId = router.query.projectId;
  const selectedProjectId = selectedProject?.id;

  const match = useMemo(() => selectTaskModal({
    taskColumns,
    taskId: taskParam,
    selectedProjectId,
    requestedProjectId,
  }), [taskParam, taskColumns, selectedProjectId, requestedProjectId]);

  if (!match) return null;

  const handleEditTask = async (updatedTask) => {
    const enriched = {
      ...updatedTask,
      difficulty: updatedTask.difficulty,
      estHours: updatedTask.estHours,
    };
    await editTask(enriched, match.columnId, match.index);
    toast({
      title: 'Task edited.',
      description: 'Your task was successfully edited.',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  const handleEditTaskMetadata = async (updatedTask) => {
    await editTaskMetadata(
      { ...updatedTask, difficulty: updatedTask.difficulty, estHours: updatedTask.estHours },
      match.columnId,
      match.index,
    );
    toast({
      title: 'Task metadata updated.',
      description: 'Title and description were updated; payout and bounty are unchanged.',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  return (
    <TaskCardModal
      key={match.task.id}
      task={match.task}
      columnId={match.columnId}
      onEditTask={handleEditTask}
      onEditTaskMetadata={handleEditTaskMetadata}
    />
  );
};

export default TaskModalMount;
