// Mobile Task Board: one column at a time, navigated by the fixed
// ColumnTabBar (primary) or horizontal swipe (shortcut). The board
// itself reserves space for the bar so the column never paints behind
// it; the FAB clears the bar + iOS home indicator on top of that.

import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Box, VStack, IconButton } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import TaskColumn from './TaskColumn';
import ColumnTabBar from './ColumnTabBar';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import { mobileGlassStyle, TAB_BAR_HEIGHT_PX } from './styles/taskBoardStyles';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import { usePOContext } from '@/context/POContext';
import { userCanCreateTask, ROLE_INDICES } from '@/util/permissions';
import { isClaimExpired } from '@/util/deadlineUtils';
import { useNow } from '@/hooks/useNow';
import { useTaskFilters } from './views/useTaskFilters';
import { FilteredEmptyState } from './views/TaskFilterBar';

const normalizeHatId = (id) => String(id).trim();

const SAFE_INSET = 'env(safe-area-inset-bottom, 0px)';
const TAB_BAR_RESERVE = `calc(${TAB_BAR_HEIGHT_PX}px + ${SAFE_INSET})`;
const FAB_BOTTOM = `calc(${TAB_BAR_RESERVE} + 16px)`;

const TaskBoardMobile = forwardRef(({
  taskColumns,
  projectName,
}, ref) => {
  const taskColumnsRef = useRef([]);

  const {
    activeIndex,
    setActiveIndex,
    touchHandlers,
    containerRef,
  } = useSwipeNavigation({
    itemCount: taskColumns?.length || 0,
    initialIndex: 0,
  });

  const { userData } = useUserContext();
  const { projectsData } = useProjectContext();
  const { roleHatIds } = usePOContext();

  const userHatIds = userData?.hatIds || [];

  const currentProject = useMemo(() => {
    return projectsData?.find(p => p.name === projectName || p.title === projectName);
  }, [projectsData, projectName]);

  const projectRolePermissions = currentProject?.rolePermissions || [];
  // Org-wide ROLE_PERM grants — fallback when a hat has no per-project mask (mirrors _permMask).
  const globalRolePermissions = currentProject?.globalRolePermissions || [];

  const hasNonMemberRole = useMemo(() => {
    if (!userHatIds.length || !roleHatIds?.length) return false;
    const normalizedUserHats = userHatIds.map(normalizeHatId);
    if (roleHatIds.length > 1) {
      const nonMemberRoles = roleHatIds.slice(ROLE_INDICES.EXECUTIVE);
      return nonMemberRoles.some(roleId =>
        normalizedUserHats.includes(normalizeHatId(roleId))
      );
    }
    return false;
  }, [userHatIds, roleHatIds]);

  const canCreateTask = useMemo(() => {
    if (userCanCreateTask(userHatIds, projectRolePermissions, globalRolePermissions)) return true;
    if (!projectRolePermissions?.length && !globalRolePermissions?.length && hasNonMemberRole) return true;
    return false;
  }, [userHatIds, projectRolePermissions, globalRolePermissions, hasNonMemberRole]);

  useImperativeHandle(ref, () => ({
    getActiveIndex: () => activeIndex,
    getColumnRef: (index) => taskColumnsRef.current[index],
  }), [activeIndex]);

  const currentColumn = taskColumns && taskColumns[activeIndex];
  const columnTitle = currentColumn?.title || '';
  const columnId = currentColumn?.id || '';

  // Expired claims also surface in the Open tab as claimable "reclaim" cards (v6).
  const now = useNow(30000);
  const takeoverTasks = useMemo(() => {
    if (columnId !== 'open') return [];
    const inProgress = (taskColumns || []).find((c) => c.id === 'inProgress');
    return (inProgress?.tasks || []).filter((t) => isClaimExpired(t, now));
  }, [taskColumns, columnId, now]);

  const handleAddTask = () => {
    taskColumnsRef.current[activeIndex]?.handleOpenAddTaskModal?.();
  };

  const showFab = columnTitle === 'Open' && canCreateTask;

  // Board-level 0-match state (with Clear filters) when a filter/search hides
  // every task across all columns.
  const { predicate, isFiltering, clearAll } = useTaskFilters();
  const noMatches = useMemo(() => {
    if (!isFiltering) return false;
    for (const c of taskColumns || []) {
      for (const t of c.tasks || []) if (predicate(t, c.id)) return false;
    }
    return true;
  }, [taskColumns, predicate, isFiltering]);

  return (
    <Box
      w="100%"
      h={`calc(100% - ${TAB_BAR_RESERVE})`}
      position="relative"
      ref={containerRef}
      {...touchHandlers}
      style={{ touchAction: 'pan-y' }}
    >
      <VStack
        spacing={0}
        align="stretch"
        w="100%"
        h="100%"
      >
        {/* Title moved into ColumnTabBar; outermost Box's height is
            capped above the bar so this column never paints behind it. */}
        <Box
          px={2}
          pt={1}
          position="relative"
          flex="1"
          minH={0}
          display="flex"
          flexDirection="column"
        >
          <Box
            position="relative"
            zIndex={1}
            borderRadius="md"
            display="flex"
            flexDirection="column"
            flex="1"
            minH={0}
            sx={mobileGlassStyle}
            p={2}
          >
            {noMatches ? (
              <FilteredEmptyState onClear={clearAll} />
            ) : (
              <TaskColumn
                ref={el => taskColumnsRef.current[activeIndex] = el}
                title={columnTitle}
                tasks={currentColumn?.tasks || []}
                columnId={columnId}
                takeoverTasks={takeoverTasks}
                projectName={projectName}
                zIndex={1}
                isMobile={true}
                hideTitleInMobile={true}
              />
            )}
          </Box>
        </Box>
      </VStack>

      {showFab && (
        <IconButton
          icon={<AddIcon color="white" boxSize="1.25em" />}
          aria-label="Add task"
          onClick={handleAddTask}
          position="fixed"
          bottom={FAB_BOTTOM}
          right={4}
          boxSize="56px"
          borderRadius="full"
          bg="purple.500"
          _hover={{ bg: 'purple.600' }}
          _active={{ bg: 'purple.700' }}
          boxShadow="0 6px 16px rgba(0,0,0,0.4)"
          zIndex={21}
        />
      )}

      <ColumnTabBar
        taskColumns={taskColumns}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
      />
    </Box>
  );
});

TaskBoardMobile.displayName = 'TaskBoardMobile';

export default TaskBoardMobile;
