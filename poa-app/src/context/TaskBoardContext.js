import React, { createContext, useContext, useState, useEffect } from 'react';
import { useDataBaseContext } from './dataBaseContext';
import { useWeb3Context } from './web3Context';
import { usePOContext } from './POContext';
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
  const { getUsernameByAddress, selectedProject } = useDataBaseContext();
  const {
    claimTask,
    updateTask,
    ipfsAddTask,
    completeTask,
    editTaskWeb3,
    submitTask,
    deleteTaskWeb3,
  } = useWeb3Context();
  const { taskManagerContractAddress } = usePOContext();

  useEffect(() => {
    setTaskColumns(initialColumns);
  }, [initialColumns]);

  const moveTask = async (
    draggedTask,
    sourceColumnId,
    destColumnId,
    newIndex,
    submissionData,
    claimedBy
  ) => {
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
        await claimTask(taskManagerContractAddress, draggedTask.id);
      } else if (destColumnId === 'inReview') {
        if (!submissionData) {
          throw new Error('Please enter a submission.');
        }
        const ipfsHash = await ipfsAddTask(
          draggedTask.name,
          draggedTask.description,
          'In Review',
          draggedTask.difficulty,
          draggedTask.estHours,
          submissionData
        );
        const ipfsHashString = ipfsHash.path;
        await submitTask(taskManagerContractAddress, draggedTask.id, ipfsHashString);
      } else if (destColumnId === 'completed') {
        await completeTask(taskManagerContractAddress, draggedTask.id);
      }

      // Call the onUpdateColumns prop when the columns are updated
      if (onUpdateColumns) {
        onUpdateColumns(newTaskColumns);
      }


    } catch (error) {
      // Revert the UI changes if there is an error
      console.error('Error moving task:', error);
      setTaskColumns(previousTaskColumns);


    }
  };

  const addTask = async (task, destColumnId) => {
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
      // Perform Web3 operation asynchronously
      await ipfsAddTask(
        taskManagerContractAddress,
        kubixPayout,
        task.description,
        selectedProject.name,
        task.estHours,
        task.difficulty,
        'Open',
        task.name
      );

      // Call the onUpdateColumns prop when the columns are updated
      if (onUpdateColumns) {
        onUpdateColumns(newTaskColumns);
      }


    } catch (error) {
      // Revert the UI changes if there is an error
      setTaskColumns(previousTaskColumns);

    }
  };

  const editTask = async (updatedTask, destColumnId, destTaskIndex, projectName) => {
    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Optimistically update the UI
    const newTaskColumns = [...taskColumns];
    const destColumn = newTaskColumns.find((column) => column.id === destColumnId);

    const Payout = calculatePayout(updatedTask.difficulty, updatedTask.estHours);

    const newTask = {
      ...updatedTask,
      Payout: Payout,
    };

    if (destColumn && destColumn.tasks[destTaskIndex]) {
      destColumn.tasks.splice(destTaskIndex, 1, newTask);
    }

    setTaskColumns(newTaskColumns);

    try {
      // Perform Web3 operation asynchronously
      await editTaskWeb3(
        taskManagerContractAddress,
        Payout,
        updatedTask.description,
        projectName,
        updatedTask.estHours,
        updatedTask.difficulty,
        'Open',
        updatedTask.name,
        updatedTask.id
      );

      if (onUpdateColumns) {
        onUpdateColumns(newTaskColumns);
      }


    } catch (error) {
      // Revert the UI changes if there is an error
      setTaskColumns(previousTaskColumns);

    }
  };

  const deleteTask = async (taskId, columnId) => {
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
      await deleteTaskWeb3(taskManagerContractAddress, taskId);

      if (onUpdateColumns) {
        onUpdateColumns(newTaskColumns);
      }


    } catch (error) {
      // Revert the UI changes if there is an error
      setTaskColumns(previousTaskColumns);

    }
  };

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
