/**
 * TaskBoard
 * Main component for displaying and managing project tasks
 * Renders mobile or desktop view based on screen size
 */

import { useRef } from 'react';
import { VStack, Box } from '@chakra-ui/react';
import { useTaskBoard } from '../../context/TaskBoardContext';
import TaskBoardMobile from './TaskBoardMobile';
import TaskBoardDesktop from './TaskBoardDesktop';
import ProjectHeader from './ProjectHeader';
import { useViewMode } from './views/useViewMode';
import ListView from './views/list/ListView';
import GanttView from './views/gantt/GanttView';
import TaskModalMount from './views/TaskModalMount';
import { TaskFilterProvider } from './views/useTaskFilters';
import TaskFilterBar from './views/TaskFilterBar';
import { useFlatTasks } from './views/useFlatTasks';

const TaskBoard = ({
  projectName,
  hideTitleBar,
  sidebarVisible,
  toggleSidebar,
  isDesktop = true, // Default to desktop to prevent flash
}) => {
  const { taskColumns } = useTaskBoard();
  // Use the stable isDesktop prop from MainLayout instead of our own breakpoint detection
  // This prevents flash when component remounts during project switches
  const isMobile = !isDesktop;
  const { viewMode } = useViewMode({ allowGantt: !isMobile });
  // Flat task list feeds the filter bar's live "N of M" count. The Board / List /
  // Gantt read the shared predicate from TaskFilterProvider themselves.
  const flatTasks = useFlatTasks();
  const mobileRef = useRef(null);
  const desktopRef = useRef(null);

  const renderBoard = () =>
    isMobile ? (
      <TaskBoardMobile
        ref={mobileRef}
        taskColumns={taskColumns}
        projectName={projectName}
      />
    ) : (
      <TaskBoardDesktop
        ref={desktopRef}
        taskColumns={taskColumns}
        projectName={projectName}
      />
    );

  const renderView = () => {
    if (viewMode === 'list') return <ListView projectName={projectName} allowCreate />;
    if (viewMode === 'gantt' && !isMobile) return <GanttView projectName={projectName} />;
    return renderBoard();
  };

  return (
    <TaskFilterProvider>
      <VStack w="100%" align="stretch" h="100%" spacing={0}>
        {/* Project header - only show in desktop view */}
        {isDesktop && (
          <ProjectHeader
            projectName={projectName}
            sidebarVisible={sidebarVisible}
            toggleSidebar={toggleSidebar}
          />
        )}

        {/* Mobile view switcher now lives in MobileTopBar (mounted by MainLayout). */}

        {/* Shared search + quick-filter bar — feeds Board, List, and Gantt. */}
        <TaskFilterBar tasks={flatTasks} />

        {/* Task board content. On mobile we own a fixed height with hidden
            overflow so TaskBoardMobile's fixed ColumnTabBar sits flush at the
            viewport bottom while the inner TaskColumn handles card scroll. */}
        <Box
          flex="1"
          minH={0}
          width="100%"
          height={{ base: "100%", md: "calc(100vh - 120px)" }}
          overflow="hidden"
          mb={0}
        >
          {renderView()}
        </Box>

        {/* List/Gantt don't render TaskCard, so the modal needs its own mount */}
        {viewMode !== 'board' && <TaskModalMount />}
      </VStack>
    </TaskFilterProvider>
  );
};

export default TaskBoard;
