import {
  Box,
  Flex,
  HStack,
  IconButton,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { FaProjectDiagram } from 'react-icons/fa';
import { useProjectContext } from '@/context/ProjectContext';
import ViewSwitcher from '../ViewSwitcher';
import ListView from './list/ListView';
import GanttView from './gantt/GanttView';
import { useViewMode } from './useViewMode';
import { useAllProjectsFlatTasks } from './useFlatTasks';
import { TaskFilterProvider } from './useTaskFilters';
import TaskFilterBar from './TaskFilterBar';

// "All Tasks" view — a cross-project surface that aggregates every task
// from every project into a single List or Gantt. Mounts in place of
// TaskBoardProvider when the URL is `?projectId=__all__`, so it never
// depends on a single-project context. Board view is suppressed (the
// kanban shape doesn't compose across projects); clicking a row or bar
// transitions the user into that task's home project via the task's own
// projectId in the URL (the existing TaskRow / TaskBar openTask logic).
const AllTasksView = ({ isDesktop = true, sidebarVisible, toggleSidebar }) => {
  const isMobile = !isDesktop;
  const tasks = useAllProjectsFlatTasks();
  const { projectsData } = useProjectContext();
  const { viewMode } = useViewMode({ allowGantt: !isMobile, allowBoard: false });

  const projectCount = Array.isArray(projectsData) ? projectsData.length : 0;
  const subtitle = `${tasks.length} task${tasks.length === 1 ? '' : 's'} across ${projectCount} project${projectCount === 1 ? '' : 's'}`;

  const renderView = () => {
    if (viewMode === 'gantt' && !isMobile) {
      return <GanttView projectName="All Tasks" tasks={tasks} />;
    }
    return <ListView projectName="All Tasks" tasks={tasks} showProject />;
  };

  return (
    <TaskFilterProvider>
      <VStack w="100%" align="stretch" h="100%" spacing={0}>
        {/* Desktop header — mirrors ProjectHeader's purple bar so it slots
            into the same visual rhythm, but with the all-tasks framing. */}
        {isDesktop && (
          <Box bg="purple.300" w="100%" p={2} height="auto">
            <Flex align="center" justify="space-between" h="100%">
              <Flex align="center" h="100%">
                {!sidebarVisible && (
                  <Tooltip label="Show projects sidebar" placement="right" hasArrow>
                    <IconButton
                      aria-label="Show projects sidebar"
                      icon={<FaProjectDiagram size="16px" />}
                      size="sm"
                      variant="ghost"
                      colorScheme="blackAlpha"
                      mr={2}
                      onClick={toggleSidebar}
                      _hover={{ bg: 'blackAlpha.200', transform: 'scale(1.1)' }}
                      transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                    />
                  </Tooltip>
                )}
                <HStack spacing={3} align="baseline">
                  <Text fontSize="2xl" fontWeight="bold" color="black" lineHeight="normal">
                    All Tasks
                  </Text>
                  <Text fontSize="sm" color="blackAlpha.700" fontWeight="500">
                    {subtitle}
                  </Text>
                </HStack>
              </Flex>
              <ViewSwitcher isMobile={false} allowBoard={false} />
            </Flex>
          </Box>
        )}

        {/* Mobile All Tasks label + view switcher both live in the
            MainLayout-mounted MobileTopBar (variant="allTasks"). */}

        {/* Shared search + quick-filter bar — feeds List and Gantt here. */}
        <TaskFilterBar tasks={tasks} />

        <Box
          flex="1"
          minH={0}
          width="100%"
          height={{ base: '100%', md: 'calc(100vh - 120px)' }}
          overflow="hidden"
          mb={0}
        >
          {renderView()}
        </Box>
      </VStack>
    </TaskFilterProvider>
  );
};

export default AllTasksView;
