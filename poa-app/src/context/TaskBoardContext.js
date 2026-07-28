/**
 * TaskBoardContext
 * Manages task board state with optimistic updates and web3 operations.
 * Uses the new service layer for blockchain interactions.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDataBaseContext } from './dataBaseContext';
import { useProjectContext } from './ProjectContext';
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

/**
 * Merge server columns with optimistic columns, preserving task metadata
 * that the subgraph may not have re-indexed yet after a status change.
 *
 * When a task is claimed/submitted/completed, The Graph updates the entity
 * but may temporarily return null metadata while re-resolving the IPFS link.
 * This manifests as description='', difficulty='medium', estHours=1 (the
 * defaults in ProjectContext). We detect this pattern and keep the richer
 * optimistic data for those fields until the server catches up.
 */
function mergeColumnsPreservingMetadata(serverColumns, optimisticColumns) {
  // Build a lookup of task data from the optimistic (current) state
  const optimisticTaskMap = new Map();
  for (const col of optimisticColumns) {
    for (const task of col.tasks) {
      optimisticTaskMap.set(task.id, task);
    }
  }

  return serverColumns.map(col => ({
    ...col,
    tasks: col.tasks.map(task => {
      const optimistic = optimisticTaskMap.get(task.id);
      if (!optimistic) return task;

      // Server has all-default metadata but optimistic has real data →
      // the subgraph hasn't re-indexed the IPFS metadata yet.
      const serverHasDefaults =
        task.description === '' &&
        task.difficulty === 'medium' &&
        task.estHours === 1;
      const optimisticHasReal =
        optimistic.description !== '' ||
        optimistic.difficulty !== 'medium' ||
        optimistic.estHours !== 1;

      if (serverHasDefaults && optimisticHasReal) {
        return {
          ...task,
          description: optimistic.description,
          difficulty: optimistic.difficulty,
          estHours: optimistic.estHours,
          name: optimistic.name || task.name,
          title: optimistic.title || task.title,
          // metadata-borne due date lags re-indexing the same way
          dueDate: optimistic.dueDate ?? task.dueDate,
        };
      }

      return task;
    }),
  }));
}

export const TaskBoardProvider = ({
  children,
  initialColumns,
  onUpdateColumns,
}) => {
  const [taskColumns, setTaskColumns] = useState(initialColumns);
  const { selectedProject } = useDataBaseContext();
  const { nextTaskId } = useProjectContext();
  const { taskManagerContractAddress, taskPayoutHoursOnly, taskPayoutHourlyRate } = usePOContext();
  const { addToIpfs } = useIPFScontext();
  const { emit } = useRefreshEmit();
  const { addNotification, updateNotification } = useNotification();

  // Org-level payout config handed to calculatePayout(). Memoized on the raw
  // primitives so its identity is stable across unrelated re-renders (keeps the
  // tx callbacks below from being recreated needlessly).
  const payoutConfig = useMemo(
    () => ({ hoursOnly: taskPayoutHoursOnly, hourlyRate: taskPayoutHourlyRate }),
    [taskPayoutHoursOnly, taskPayoutHourlyRate]
  );

  // Get services from the new hook — do NOT pass { ipfsService: { addToIpfs } } here,
  // useWeb3Services already gets it from useIPFScontext(). Passing an inline object
  // creates a new reference every render, causing all services to be recreated.
  const { task: taskService, isReady, getNotReadyMessage } = useWeb3Services();

  // Ref to access current taskColumns inside callbacks without adding taskColumns
  // to their dependency arrays (which would recreate every callback on each column change).
  const taskColumnsRef = useRef(taskColumns);
  taskColumnsRef.current = taskColumns;

  // Latest-ref for getNotReadyMessage. The action callbacks below key their deps on
  // `isReady` (a boolean), which stays false across the signed-out → initializing
  // transition even though getNotReadyMessage's identity changes with readyState.
  // Reading it through a stable ref avoids capturing a stale (e.g. "signed out")
  // message and keeps the callbacks from being recreated on every readiness change.
  const getNotReadyMessageRef = useRef(getNotReadyMessage);
  getNotReadyMessageRef.current = getNotReadyMessage;

  // Optimistic lock: prevents poll-interval from overwriting local optimistic state.
  // After an optimistic update, server data is suppressed until it catches up or
  // the grace period expires (safety valve).
  const optimisticLockRef = useRef(null);
  const OPTIMISTIC_GRACE_PERIOD = 65000; // 65s — covers 2+ poll-interval cycles (30s each)
  const lockClearTimerRef = useRef(null);
  const latestInitialColumnsRef = useRef(initialColumns);

  // Keep ref in sync so scheduleLockClear can apply the latest server data
  latestInitialColumnsRef.current = initialColumns;

  // Local prediction for the next task ID. The subgraph-derived `nextTaskId`
  // lags behind chain state (and is actively suppressed during the 65s
  // optimistic lock), so back-to-back submissions would all predict the same
  // ID and collide. We bump locally on each consume and forward-sync from the
  // subgraph when it eventually catches up.
  const nextTaskIdRef = useRef(null);
  useEffect(() => {
    if (nextTaskId == null) return;
    const incoming = Number(nextTaskId);
    if (Number.isNaN(incoming)) return;
    const current = Number(nextTaskIdRef.current ?? -1);
    if (incoming > current) {
      nextTaskIdRef.current = String(incoming);
    }
  }, [nextTaskId]);

  const consumeNextTaskIds = useCallback(
    (count = 1) => {
      const fallback = Number(nextTaskId ?? 0) || 0;
      const base = Number(nextTaskIdRef.current ?? fallback) || fallback;
      nextTaskIdRef.current = String(base + count);
      return base;
    },
    [nextTaskId]
  );

  // Clear optimistic lock after a delay, giving the subgraph refetch time to arrive.
  // Timestamp-guarded: if a newer operation sets a fresh lock, this timer won't clobber it.
  const scheduleLockClear = useCallback(() => {
    if (lockClearTimerRef.current) {
      clearTimeout(lockClearTimerRef.current);
    }
    const lockTimestamp = optimisticLockRef.current;
    lockClearTimerRef.current = setTimeout(() => {
      if (optimisticLockRef.current === lockTimestamp) {
        optimisticLockRef.current = null;
        // Apply the latest server data, but merge with optimistic state to
        // preserve task metadata that the subgraph may not have re-indexed yet.
        setTaskColumns(prev =>
          mergeColumnsPreservingMetadata(latestInitialColumnsRef.current, prev)
        );
      }
      lockClearTimerRef.current = null;
    }, 11000);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (lockClearTimerRef.current) {
        clearTimeout(lockClearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (optimisticLockRef.current) {
      const elapsed = Date.now() - optimisticLockRef.current;
      if (elapsed < OPTIMISTIC_GRACE_PERIOD) {
        // Lock is active — keep optimistic state, ignore server data.
        // scheduleLockClear will apply latest server data when the lock expires.
        return;
      }
      // Grace period expired — merge to preserve any metadata the subgraph
      // still hasn't re-indexed (same protection as scheduleLockClear).
      optimisticLockRef.current = null;
      setTaskColumns(prev => mergeColumnsPreservingMetadata(initialColumns, prev));
      return;
    }
    setTaskColumns(initialColumns);
  }, [initialColumns]);

  /**
   * Helper to create task IPFS metadata
   */
  const createTaskMetadata = useCallback(async (taskName, taskDescription, location, difficulty, estHours, submission, dueDate = null) => {
    const data = {
      name: taskName,
      description: taskDescription,
      location: location,
      difficulty: difficulty,
      estHours: estHours,
      submission: submission,
      // The subgraph re-points task.metadata at the submission JSON on submit —
      // every upload must carry the soft due date or it vanishes after submission.
      ...(dueDate ? { dueDate: Math.floor(Number(dueDate)) } : {}),
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
      addNotification(getNotReadyMessageRef.current(), 'error');
      return;
    }

    // Validate transition: only allow forward moves
    const validDest = { open: 'inProgress', inProgress: 'inReview', inReview: 'completed' };
    if (validDest[sourceColumnId] !== destColumnId) {
      addNotification('Invalid task transition.', 'error');
      return;
    }

    // Save previous state to revert in case of error
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

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

    // Optimistically update the UI — immutable update (no mutation of existing state)
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id === sourceColumnId) {
        return { ...col, tasks: col.tasks.filter(t => t.id !== draggedTask.id) };
      }
      if (col.id === destColumnId) {
        const tasks = [...col.tasks];
        tasks.splice(newIndex, 0, updatedTask);
        return { ...col, tasks };
      }
      return col;
    });

    setTaskColumns(newTaskColumns);

    let notifId = null;

    // Perform the Web3 operations asynchronously
    try {
      if (destColumnId === 'inProgress') {
        notifId = addNotification('Claiming task...', 'loading');
        const result = await taskService.claimTask(taskManagerContractAddress, draggedTask.id);
        if (result.success) {
          updateNotification(notifId, 'Task claimed successfully!', 'success');
          emit(RefreshEvent.TASK_CLAIMED, { taskId: draggedTask.id });
        } else {
          throw new Error(result.error?.userMessage || 'Failed to claim task');
        }
      } else if (destColumnId === 'inReview') {
        if (!submissionData) {
          throw new Error('Please enter a submission.');
        }
        notifId = addNotification('Submitting task...', 'loading');

        const ipfsHash = await createTaskMetadata(
          draggedTask.name,
          draggedTask.description,
          'In Review',
          draggedTask.difficulty,
          draggedTask.estHours,
          submissionData,
          draggedTask.dueDate
        );

        const result = await taskService.submitTask(
          taskManagerContractAddress,
          draggedTask.id,
          ipfsHash.path
        );
        if (result.success) {
          updateNotification(notifId, 'Task submitted successfully!', 'success');
          emit(RefreshEvent.TASK_SUBMITTED, { taskId: draggedTask.id });
        } else {
          throw new Error(result.error?.userMessage || 'Failed to submit task');
        }
      } else if (destColumnId === 'completed') {
        notifId = addNotification('Completing task...', 'loading');
        const result = await taskService.completeTask(taskManagerContractAddress, draggedTask.id);
        if (result.success) {
          updateNotification(notifId, 'Task completed successfully!', 'success');
          emit(RefreshEvent.TASK_COMPLETED, { taskId: draggedTask.id });
        } else {
          throw new Error(result.error?.userMessage || 'Failed to complete task');
        }
      }

      // Use functional updater to get the latest state (consistent with addTask).
      // This avoids stale closure over newTaskColumns from before the await.
      let confirmedColumns;
      setTaskColumns(prev => {
        confirmedColumns = prev;
        return prev;
      });

      if (onUpdateColumns && confirmedColumns) {
        onUpdateColumns(confirmedColumns, selectedProject?.id);
      }
      scheduleLockClear();
    } catch (error) {
      // Revert the UI changes if there is an error
      console.error('Error moving task:', error);
      if (notifId) {
        updateNotification(notifId, error.message || 'Error moving task', 'error');
      } else {
        addNotification(error.message || 'Error moving task', 'error');
      }
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    createTaskMetadata,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  /**
   * Add a new task
   */
  const addTask = useCallback(async (task, destColumnId) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return;
    }

    const kubixPayout = calculatePayout(task.difficulty, task.estHours, payoutConfig);

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    const predictedTaskId = String(consumeNextTaskIds(1));
    const predictedId = `${taskManagerContractAddress}-${predictedTaskId}`.toLowerCase();
    const newTask = {
      ...task,
      id: task.id || predictedId,
      taskId: predictedTaskId,
      projectId: selectedProject.id,
      kubixPayout: kubixPayout,
      isIndexing: true,
    };

    // Optimistically update the UI — immutable
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id !== destColumnId) return col;
      return { ...col, tasks: [...col.tasks, newTask] };
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Creating task...', 'loading');

    try {
      const taskData = {
        payout: kubixPayout,
        name: task.name,
        description: task.description,
        projectId: selectedProject.id,
        location: 'Open',
        difficulty: task.difficulty,
        estHours: task.estHours,
        bountyToken: task.bountyToken,
        bountyPayout: task.bountyAmount,
        requiresApplication: task.requiresApplication || false,
        dueDate: task.dueDate ?? null,
        absoluteDeadline: task.absoluteDeadline || 0,
        completionWindow: task.completionWindow || 0,
      };

      let result;
      if (task.assignTo) {
        // Create and assign task in one transaction
        result = await taskService.createAndAssignTask(
          taskManagerContractAddress,
          taskData,
          task.assignTo
        );
      } else {
        // Create task normally
        result = await taskService.createTask(taskManagerContractAddress, taskData);
      }

      if (result.success) {
        updateNotification(notifId, task.assignTo ? 'Task created and assigned!' : 'Task created successfully!', 'success');

        // Task is now on-chain — mark it as no longer indexing so action buttons enable.
        // Use functional updater to avoid stale closure over taskColumns.
        let confirmedColumns;
        setTaskColumns(prev => {
          confirmedColumns = prev.map(col => ({
            ...col,
            tasks: col.tasks.map(t => t.id === newTask.id ? { ...t, isIndexing: false } : t),
          }));
          return confirmedColumns;
        });

        emit(RefreshEvent.TASK_CREATED, { task: newTask });

        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();
      } else {
        throw new Error(result.error?.userMessage || 'Failed to create task');
      }
    } catch (error) {
      console.error('Error adding task:', error);
      updateNotification(notifId, error.message || 'Error creating task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskService,
    taskManagerContractAddress,
    payoutConfig,
    selectedProject,
    consumeNextTaskIds,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  /**
   * Submit many drafted tasks in a single createTasksBatch transaction.
   * `drafts` are the same shape AddTaskModal emits (name, description, difficulty,
   * estHours, bountyToken, bountyAmount, requiresApplication). All drafts must
   * target the same `projectId`.
   */
  const addTaskBatch = useCallback(async (drafts, projectId, destColumnId) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }
    if (!Array.isArray(drafts) || drafts.length === 0) {
      addNotification('No drafts to submit.', 'error');
      return { success: false };
    }

    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));
    optimisticLockRef.current = Date.now();

    const baseTaskId = consumeNextTaskIds(drafts.length);

    const optimisticTasks = drafts.map((d, i) => {
      const kubixPayout = calculatePayout(d.difficulty, d.estHours, payoutConfig);
      const predictedTaskId = String(baseTaskId + i);
      const predictedId = `${taskManagerContractAddress}-${predictedTaskId}`.toLowerCase();
      return {
        id: predictedId,
        taskId: predictedTaskId,
        projectId,
        name: d.name,
        description: d.description,
        difficulty: d.difficulty,
        estHours: d.estHours,
        bountyToken: d.bountyToken,
        bountyAmount: d.bountyAmount,
        requiresApplication: !!d.requiresApplication,
        dueDate: d.dueDate ?? null,
        absoluteDeadline: d.absoluteDeadline || 0,
        completionWindow: d.completionWindow || 0,
        kubixPayout,
        isIndexing: true,
      };
    });

    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id !== destColumnId) return col;
      return { ...col, tasks: [...col.tasks, ...optimisticTasks] };
    });
    setTaskColumns(newTaskColumns);

    const notifId = addNotification(`Creating ${drafts.length} tasks...`, 'loading');

    try {
      // NOTE: assignTo is intentionally omitted. createTasksBatch has no
      // per-item assignee parameter (tracked in poa-box/POP#152). The modal
      // also clears selectedUser when entering draft mode, so drafts should
      // never carry one — but we don't forward it even if a future code path
      // does, to keep the behaviour explicit at the boundary.
      const taskData = drafts.map(d => ({
        payout: calculatePayout(d.difficulty, d.estHours, payoutConfig),
        name: d.name,
        description: d.description,
        location: 'Open',
        difficulty: d.difficulty,
        estHours: d.estHours,
        bountyToken: d.bountyToken,
        bountyPayout: d.bountyAmount,
        requiresApplication: !!d.requiresApplication,
        dueDate: d.dueDate ?? null,
        absoluteDeadline: d.absoluteDeadline || 0,
        completionWindow: d.completionWindow || 0,
      }));

      const result = await taskService.createTasksBatch(
        taskManagerContractAddress,
        projectId,
        taskData
      );

      if (result.success) {
        updateNotification(notifId, `${drafts.length} tasks created!`, 'success');

        const optimisticIds = new Set(optimisticTasks.map(t => t.id));
        let confirmedColumns;
        setTaskColumns(prev => {
          confirmedColumns = prev.map(col => ({
            ...col,
            tasks: col.tasks.map(t =>
              optimisticIds.has(t.id) ? { ...t, isIndexing: false } : t
            ),
          }));
          return confirmedColumns;
        });

        optimisticTasks.forEach(t => emit(RefreshEvent.TASK_CREATED, { task: t }));

        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, projectId);
        }
        scheduleLockClear();
        return { success: true };
      }
      throw new Error(result.error?.userMessage || 'Failed to create tasks');
    } catch (error) {
      console.error('Error creating task batch:', error);
      updateNotification(notifId, error.message || 'Error creating tasks', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [
    taskService,
    taskManagerContractAddress,
    payoutConfig,
    consumeNextTaskIds,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  /**
   * Edit an existing task
   */
  const editTask = useCallback(async (updatedTask, destColumnId, destTaskIndex, projectName) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return;
    }

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    const payout = calculatePayout(updatedTask.difficulty, updatedTask.estHours, payoutConfig);

    const newTask = {
      ...updatedTask,
      Payout: payout,
    };

    // Optimistically update the UI — immutable
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id !== destColumnId) return col;
      return {
        ...col,
        tasks: col.tasks.map((t, i) => i === destTaskIndex ? newTask : t),
      };
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Updating task...', 'loading');

    try {
      const result = await taskService.editTask(taskManagerContractAddress, updatedTask.id, {
        payout,
        name: updatedTask.name,
        description: updatedTask.description,
        location: 'Open',
        difficulty: updatedTask.difficulty,
        estHours: updatedTask.estHours,
        bountyToken: updatedTask.bountyToken,
        bountyPayout: updatedTask.bountyAmount,
        dueDate: updatedTask.dueDate ?? null,
        absoluteDeadline: updatedTask.absoluteDeadline || 0,
        completionWindow: updatedTask.completionWindow || 0,
      });

      if (result.success) {
        updateNotification(notifId, 'Task updated successfully!', 'success');
        emit(RefreshEvent.TASK_UPDATED, { taskId: updatedTask.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();
      } else {
        throw new Error(result.error?.userMessage || 'Failed to update task');
      }
    } catch (error) {
      console.error('Error editing task:', error);
      updateNotification(notifId, error.message || 'Error updating task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskService,
    taskManagerContractAddress,
    payoutConfig,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  /**
   * Edit only a task's metadata (title + description + difficulty + estHours) via the
   * TaskManager v5 `updateTaskMetadata(uint256,bytes,bytes32)` selector. Used when the
   * caller has TaskPerm.EDIT_META but not EDIT_FULL — payout and bounty are preserved
   * on-chain regardless of what the modal sends.
   */
  const editTaskMetadata = useCallback(async (updatedTask, destColumnId, destTaskIndex, projectName) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return;
    }

    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));
    optimisticLockRef.current = Date.now();

    // Optimistic update — only metadata changes locally; payout/bounty are not part of this path.
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id !== destColumnId) return col;
      return {
        ...col,
        tasks: col.tasks.map((t, i) => i === destTaskIndex ? { ...t, ...updatedTask } : t),
      };
    });
    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Updating task metadata...', 'loading');

    try {
      const result = await taskService.editTaskMetadata(taskManagerContractAddress, updatedTask.id, {
        name: updatedTask.name,
        description: updatedTask.description,
        location: 'Open',
        difficulty: updatedTask.difficulty,
        estHours: updatedTask.estHours,
        dueDate: updatedTask.dueDate ?? null,
      });

      if (result.success) {
        updateNotification(notifId, 'Task metadata updated successfully!', 'success');
        emit(RefreshEvent.TASK_UPDATED, { taskId: updatedTask.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();
      } else {
        throw new Error(result.error?.userMessage || 'Failed to update task metadata');
      }
    } catch (error) {
      console.error('Error editing task metadata:', error);
      updateNotification(notifId, error.message || 'Error updating task metadata', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
    selectedProject?.id,
  ]);

  /**
   * Delete a task
   */
  const deleteTask = useCallback(async (taskId, columnId) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return;
    }

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically update the UI — immutable
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id !== columnId) return col;
      return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Deleting task...', 'loading');

    try {
      const result = await taskService.cancelTask(taskManagerContractAddress, taskId);

      if (result.success) {
        updateNotification(notifId, 'Task deleted successfully!', 'success');
        emit(RefreshEvent.TASK_CANCELLED, { taskId });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();
      } else {
        throw new Error(result.error?.userMessage || 'Failed to delete task');
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      updateNotification(notifId, error.message || 'Error deleting task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  /**
   * Apply for a task that requires application
   */
  const applyForTask = useCallback(async (taskId, applicationData, applicantAddress) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Optimistically add applicant to the task so UI reflects immediately
    let newTaskColumns;
    if (applicantAddress) {
      newTaskColumns = taskColumnsRef.current.map(col => ({
        ...col,
        tasks: col.tasks.map(t =>
          t.id === taskId
            ? {
                ...t,
                applicants: [
                  ...(t.applicants || []),
                  { address: applicantAddress, username: '', appliedAt: Math.floor(Date.now() / 1000), approved: false },
                ],
              }
            : t
        ),
      }));
      optimisticLockRef.current = Date.now();
      setTaskColumns(newTaskColumns);
    }

    const notifId = addNotification('Submitting application...', 'loading');

    try {
      const result = await taskService.applyForTask(
        taskManagerContractAddress,
        taskId,
        applicationData
      );

      if (result.success) {
        updateNotification(notifId, 'Application submitted successfully!', 'success');
        emit(RefreshEvent.TASK_APPLICATION_SUBMITTED, { taskId });
        if (applicantAddress) {
          if (onUpdateColumns) onUpdateColumns(newTaskColumns, selectedProject?.id);
          scheduleLockClear();
        }
        return { success: true };
      } else {
        throw new Error(result.error?.userMessage || 'Failed to submit application');
      }
    } catch (error) {
      console.error('Error applying for task:', error);
      updateNotification(notifId, error.message || 'Error submitting application', 'error');
      if (applicantAddress) {
        optimisticLockRef.current = null;
        setTaskColumns(previousTaskColumns);
      }
      return { success: false, error };
    }
  }, [taskService, taskManagerContractAddress, selectedProject, isReady, addNotification, updateNotification, emit, onUpdateColumns, scheduleLockClear]);

  /**
   * Approve an application for a task
   */
  const approveApplication = useCallback(async (taskId, applicantAddress, applicantUsername) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically move task from open to inProgress — immutable
    let movedTask = null;
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id === 'open') {
        const task = col.tasks.find(t => t.id === taskId);
        if (task) {
          movedTask = {
            ...task,
            claimedBy: applicantAddress,
            claimerUsername: applicantUsername || '',
            status: 'Assigned',
          };
        }
        return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
      }
      if (col.id === 'inProgress' && movedTask) {
        return { ...col, tasks: [...col.tasks, movedTask] };
      }
      return col;
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Approving application...', 'loading');

    try {
      const result = await taskService.approveApplication(
        taskManagerContractAddress,
        taskId,
        applicantAddress
      );

      if (result.success) {
        updateNotification(notifId, 'Application approved successfully!', 'success');
        emit(RefreshEvent.TASK_APPLICATION_APPROVED, { taskId, applicantAddress });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();

        return { success: true };
      } else {
        throw new Error(result.error?.userMessage || 'Failed to approve application');
      }
    } catch (error) {
      console.error('Error approving application:', error);
      updateNotification(notifId, error.message || 'Error approving application', 'error');
      // Rollback optimistic update on failure
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [taskService, taskManagerContractAddress, isReady, addNotification, updateNotification, emit, onUpdateColumns, scheduleLockClear]);

  /**
   * Assign a task to a specific user
   */
  const assignTask = useCallback(async (taskId, assigneeAddress, assigneeUsername) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically move task from open to inProgress — immutable. A v6 takeover
    // reassignment finds the task already IN inProgress: replace the assignee in
    // place (never splice, so the card can't duplicate) and restart the local window.
    const nowSec = Math.floor(Date.now() / 1000);
    let movedTask = null;
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id === 'open') {
        const task = col.tasks.find(t => t.id === taskId);
        if (task) {
          movedTask = {
            ...task,
            claimedBy: assigneeAddress,
            claimerUsername: assigneeUsername || '',
            status: 'Assigned',
          };
        }
        return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
      }
      if (col.id === 'inProgress') {
        const existing = col.tasks.some(t => t.id === taskId);
        if (existing) {
          return {
            ...col,
            tasks: col.tasks.map(t => t.id !== taskId ? t : ({
              ...t,
              claimedBy: assigneeAddress,
              claimerUsername: assigneeUsername || '',
              assignedAt: String(nowSec),
              claimDeadline: Number(t.completionWindow) > 0
                ? String(nowSec + Number(t.completionWindow))
                : null,
            })),
          };
        }
        if (movedTask) {
          return { ...col, tasks: [...col.tasks, movedTask] };
        }
      }
      return col;
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Assigning task...', 'loading');

    try {
      const result = await taskService.assignTask(
        taskManagerContractAddress,
        taskId,
        assigneeAddress
      );

      if (result.success) {
        updateNotification(notifId, 'Task assigned successfully!', 'success');
        emit(RefreshEvent.TASK_ASSIGNED, { taskId, assigneeAddress });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();

        return { success: true };
      } else {
        throw new Error(result.error?.userMessage || 'Failed to assign task');
      }
    } catch (error) {
      console.error('Error assigning task:', error);
      updateNotification(notifId, error.message || 'Error assigning task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [taskService, taskManagerContractAddress, isReady, addNotification, updateNotification, emit, onUpdateColumns, scheduleLockClear]);


  /**
   * Take over an expired claim (TaskManager v6). The contract handles the takeover
   * inside claimTask itself — same call as a normal claim. Optimistically the
   * assignee is REPLACED in place in the inProgress column (never spliced, so the
   * card cannot duplicate) and the local claim window restarts; the subgraph
   * refetch then flips the assignee server-side, which removes the task from the
   * previous claimer's "in progress" everywhere.
   */
  const takeOverTask = useCallback(async (task, newAssigneeAddress, newAssigneeUsername) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));
    optimisticLockRef.current = Date.now();

    const nowSec = Math.floor(Date.now() / 1000);
    setTaskColumns(cols => cols.map(col => col.id !== 'inProgress' ? col : ({
      ...col,
      tasks: col.tasks.map(t => t.id !== task.id ? t : ({
        ...t,
        claimedBy: newAssigneeAddress,
        claimerUsername: newAssigneeUsername || '',
        assignedAt: String(nowSec), // restart the countdown locally
        claimDeadline: Number(t.completionWindow) > 0
          ? String(nowSec + Number(t.completionWindow))
          : null,
      })),
    })));

    const notifId = addNotification('Taking over task...', 'loading');

    try {
      const result = await taskService.claimTask(taskManagerContractAddress, task.id);
      if (result.success) {
        updateNotification(notifId, "Task taken over — it's yours now!", 'success');
        emit(RefreshEvent.TASK_CLAIMED, { taskId: task.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();
        return { success: true };
      }
      throw new Error(result.error?.userMessage || 'Failed to take over task');
    } catch (error) {
      console.error('Error taking over task:', error);
      updateNotification(notifId, error.message || 'Error taking over task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [taskService, taskManagerContractAddress, isReady, addNotification, updateNotification, emit, onUpdateColumns, scheduleLockClear, selectedProject?.id]);

  /**
   * Reject a submitted task, moving it back to inProgress
   */
  const rejectTask = useCallback(async (task, rejectionReason) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    if (!rejectionReason || rejectionReason.trim() === '') {
      addNotification('Please provide a rejection reason.', 'error');
      return { success: false };
    }

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically move task from inReview to inProgress — immutable
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id === 'inReview') {
        return { ...col, tasks: col.tasks.filter(t => t.id !== task.id) };
      }
      if (col.id === 'inProgress') {
        return { ...col, tasks: [...col.tasks, { ...task }] };
      }
      return col;
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Rejecting task...', 'loading');

    try {
      // Upload rejection reason to IPFS
      const rejectionMetadata = JSON.stringify({ rejection: rejectionReason.trim() });
      const ipfsResult = await addToIpfs(rejectionMetadata);

      const result = await taskService.rejectTask(
        taskManagerContractAddress,
        task.id,
        ipfsResult.path
      );

      if (result.success) {
        updateNotification(notifId, 'Task rejected successfully!', 'success');
        emit(RefreshEvent.TASK_REJECTED, { taskId: task.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();

        return { success: true };
      } else {
        throw new Error(result.error?.userMessage || 'Failed to reject task');
      }
    } catch (error) {
      console.error('Error rejecting task:', error);
      updateNotification(notifId, error.message || 'Error rejecting task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    addToIpfs,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  const value = useMemo(() => ({
    taskColumns,
    moveTask,
    addTask,
    addTaskBatch,
    editTask,
    editTaskMetadata,
    deleteTask,
    applyForTask,
    approveApplication,
    assignTask,
    takeOverTask,
    rejectTask,
  }), [taskColumns, moveTask, addTask, addTaskBatch, editTask, editTaskMetadata, deleteTask, applyForTask, approveApplication, assignTask, takeOverTask, rejectTask]);

  return (
    <TaskBoardContext.Provider value={value}>
      {children}
    </TaskBoardContext.Provider>
  );
};
