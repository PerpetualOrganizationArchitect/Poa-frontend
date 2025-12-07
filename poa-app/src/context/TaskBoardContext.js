/**
 * TaskBoardContext
 * Manages task board state with optimistic updates and web3 operations.
 * Uses the new service layer for blockchain interactions.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useDataBaseContext } from './dataBaseContext';
import { usePOContext } from './POContext';
import { useIPFScontext } from './ipfsContext';
import { useRefreshEmit, RefreshEvent } from './RefreshContext';
import { useNotification } from './NotificationContext';
import { useWeb3Services } from '../hooks/useWeb3Services';
import { calculatePayout } from '../util/taskUtils';

const TaskBoardContext = createContext();

export const useTaskBoard = () => {
  return useContext(TaskBoardContext);
};

export const TaskBoardProvider = ({
  children,
  initialColumns,
  onColumnChange,
  onUpdateColumns,
  account,
}) => {
  const [taskColumns, setTaskColumns] = useState(initialColumns);
  const { selectedProject } = useDataBaseContext();
  const { taskManagerContractAddress } = usePOContext();
  const { addToIpfs } = useIPFScontext();
  const { emit } = useRefreshEmit();
  const { addNotification } = useNotification();

  // Get services from the new hook
  const { task: taskService, isReady } = useWeb3Services({
    ipfsService: { addToIpfs },
  });

  useEffect(() => {
    setTaskColumns(initialColumns);
  }, [initialColumns]);

  /**
   * Helper to create task IPFS metadata
   */
  const createTaskMetadata = useCallback(async (taskName, taskDescription, location, difficulty, estHours, submission) => {
    const data = {
      name: taskName,
      description: taskDescription,
      location: location,
      difficulty: difficulty,
      estHours: estHours,
      submission: submission,
    };
    const result = await addToIpfs(JSON.stringify(data));
    return result;
  }, [addToIpfs]);

  /**
   * Move a task between columns (claim, submit, complete)
   */
  const moveTask = useCallback(async (
    draggedTask,
    sourceColumnId,
    destColumnId,
    newIndex,
    submissionData,
    claimedBy
  ) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return;
    }

    // Save previous state to revert in case of error
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Optimistically update the UI
    const newTaskColumns = [...taskColumns];
    const sourceColumn = newTaskColumns.find(
      (column) => column.id === sourceColumnId
    );
    const destColumn = newTaskColumns.find((column) => column.id === destColumnId);

    // Remove the task from the source column
    if (sourceColumn) {
      const sourceTaskIndex = sourceColumn.tasks.findIndex(
        (task) => task.id === draggedTask.id
      );
      if (sourceTaskIndex > -1) {
        sourceColumn.tasks.splice(sourceTaskIndex, 1);
      }
    }

    // Prepare the updated task
    const updatedTask = {
      ...draggedTask,
      submission:
        destColumnId === 'inReview' ? submissionData : draggedTask.submission,
      claimedBy:
        destColumnId === 'inProgress'
          ? claimedBy
          : destColumnId === 'open'
          ? ''
          : draggedTask.claimedBy,
    };

    // Add the task to the destination column
    if (destColumn) {
      destColumn.tasks.splice(newIndex, 0, updatedTask);
    }

    // Update the state optimistically
    setTaskColumns(newTaskColumns);

    // Perform the Web3 operations asynchronously
    try {
      if (destColumnId === 'inProgress') {
        addNotification('Claiming task...', 'loading');
        const result = await taskService.claimTask(taskManagerContractAddress, draggedTask.id);
        if (result.success) {
          addNotification('Task claimed successfully!', 'success');
          emit(RefreshEvent.TASK_CLAIMED, { taskId: draggedTask.id });
        } else {
          throw new Error(result.error?.userMessage || 'Failed to claim task');
        }
      } else if (destColumnId === 'inReview') {
        if (!submissionData) {
          throw new Error('Please enter a submission.');
        }
        addNotification('Submitting task...', 'loading');
        const ipfsHash = await createTaskMetadata(
          draggedTask.name,
          draggedTask.description,
          'In Review',
          draggedTask.difficulty,
          draggedTask.estHours,
          submissionData
        );
        const result = await taskService.submitTask(
          taskManagerContractAddress,
          draggedTask.id,
          ipfsHash.path
        );
        if (result.success) {
          addNotification('Task submitted successfully!', 'success');
          emit(RefreshEvent.TASK_SUBMITTED, { taskId: draggedTask.id });
        } else {
          throw new Error(result.error?.userMessage || 'Failed to submit task');
        }
      } else if (destColumnId === 'completed') {
        addNotification('Completing task...', 'loading');
        const result = await taskService.completeTask(taskManagerContractAddress, draggedTask.id);
        if (result.success) {
          addNotification('Task completed successfully!', 'success');
          emit(RefreshEvent.TASK_COMPLETED, { taskId: draggedTask.id });
        } else {
          throw new Error(result.error?.userMessage || 'Failed to complete task');
        }
      }

      // Call the onUpdateColumns prop when the columns are updated
      if (onUpdateColumns) {
        onUpdateColumns(newTaskColumns);
      }
    } catch (error) {
      // Revert the UI changes if there is an error
      console.error('Error moving task:', error);
      addNotification(error.message || 'Error moving task', 'error');
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskColumns,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    emit,
    createTaskMetadata,
    onUpdateColumns,
  ]);

  /**
   * Add a new task
   */
  const addTask = useCallback(async (task, destColumnId) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return;
    }

    const kubixPayout = calculatePayout(task.difficulty, task.estHours);

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Optimistically update the UI
    const newTaskColumns = [...taskColumns];
    const destColumn = newTaskColumns.find((column) => column.id === destColumnId);

    const newTask = {
      ...task,
      projectId: selectedProject.id,
      kubixPayout: kubixPayout,
    };

    if (destColumn) {
      destColumn.tasks.push(newTask);
    }

    setTaskColumns(newTaskColumns);

    try {
      addNotification('Creating task...', 'loading');

      const result = await taskService.createTask(taskManagerContractAddress, {
        payout: kubixPayout,
        name: task.name,
        description: task.description,
        projectId: selectedProject.id,
        location: 'Open',
        difficulty: task.difficulty,
        estHours: task.estHours,
      });

      if (result.success) {
        addNotification('Task created successfully!', 'success');
        emit(RefreshEvent.TASK_CREATED, { task: newTask });

        if (onUpdateColumns) {
          onUpdateColumns(newTaskColumns);
        }
      } else {
        throw new Error(result.error?.userMessage || 'Failed to create task');
      }
    } catch (error) {
      console.error('Error adding task:', error);
      addNotification(error.message || 'Error creating task', 'error');
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskColumns,
    taskService,
    taskManagerContractAddress,
    selectedProject,
    isReady,
    addNotification,
    emit,
    onUpdateColumns,
  ]);

  /**
   * Edit an existing task
   */
  const editTask = useCallback(async (updatedTask, destColumnId, destTaskIndex, projectName) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return;
    }

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Optimistically update the UI
    const newTaskColumns = [...taskColumns];
    const destColumn = newTaskColumns.find((column) => column.id === destColumnId);

    const payout = calculatePayout(updatedTask.difficulty, updatedTask.estHours);

    const newTask = {
      ...updatedTask,
      Payout: payout,
    };

    if (destColumn && destColumn.tasks[destTaskIndex]) {
      destColumn.tasks.splice(destTaskIndex, 1, newTask);
    }

    setTaskColumns(newTaskColumns);

    try {
      addNotification('Updating task...', 'loading');

      const result = await taskService.editTask(taskManagerContractAddress, updatedTask.id, {
        payout,
        name: updatedTask.name,
        description: updatedTask.description,
        location: 'Open',
        difficulty: updatedTask.difficulty,
        estHours: updatedTask.estHours,
      });

      if (result.success) {
        addNotification('Task updated successfully!', 'success');
        emit(RefreshEvent.TASK_UPDATED, { taskId: updatedTask.id });

        if (onUpdateColumns) {
          onUpdateColumns(newTaskColumns);
        }
      } else {
        throw new Error(result.error?.userMessage || 'Failed to update task');
      }
    } catch (error) {
      console.error('Error editing task:', error);
      addNotification(error.message || 'Error updating task', 'error');
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskColumns,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    emit,
    onUpdateColumns,
  ]);

  /**
   * Delete a task
   */
  const deleteTask = useCallback(async (taskId, columnId) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return;
    }

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Optimistically update the UI
    const newTaskColumns = [...taskColumns];
    const column = newTaskColumns.find((col) => col.id === columnId);
    if (column) {
      const taskIndex = column.tasks.findIndex((task) => task.id === taskId);
      if (taskIndex > -1) {
        column.tasks.splice(taskIndex, 1);
      }
    }

    setTaskColumns(newTaskColumns);

    try {
      addNotification('Deleting task...', 'loading');

      const result = await taskService.cancelTask(taskManagerContractAddress, taskId);

      if (result.success) {
        addNotification('Task deleted successfully!', 'success');
        emit(RefreshEvent.TASK_CANCELLED, { taskId });

        if (onUpdateColumns) {
          onUpdateColumns(newTaskColumns);
        }
      } else {
        throw new Error(result.error?.userMessage || 'Failed to delete task');
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      addNotification(error.message || 'Error deleting task', 'error');
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskColumns,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    emit,
    onUpdateColumns,
  ]);

  const value = {
    taskColumns,
    moveTask,
    addTask,
    editTask,
    setTaskColumns,
    deleteTask,
  };

  return (
    <TaskBoardContext.Provider value={value}>
      {children}
    </TaskBoardContext.Provider>
  );
};
