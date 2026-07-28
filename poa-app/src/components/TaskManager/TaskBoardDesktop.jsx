/**
 * TaskBoardDesktop
 * Desktop view for TaskBoard with grid layout
 */

import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Box, SimpleGrid } from '@chakra-ui/react';
import TaskColumn from './TaskColumn';
import { glassLayerStyle } from './styles/taskBoardStyles';
import { isClaimExpired } from '@/util/deadlineUtils';
import { useNow } from '@/hooks/useNow';
import { useTaskFilters } from './views/useTaskFilters';
import { FilteredEmptyState } from './views/TaskFilterBar';

const TaskBoardDesktop = forwardRef(({
  taskColumns,
  projectName,
}, ref) => {
  const taskColumnsRef = useRef([]);

  // Expired claims also surface in the Open column as claimable "reclaim" cards
  // (v6 takeover) — people hunting for work browse Open, not In Progress.
  const now = useNow(30000);
  const takeoverTasks = useMemo(() => {
    const inProgress = (taskColumns || []).find((c) => c.id === 'inProgress');
    return (inProgress?.tasks || []).filter((t) => isClaimExpired(t, now));
  }, [taskColumns, now]);

  // Expose column refs to parent
  useImperativeHandle(ref, () => ({
    getColumnRef: (index) => taskColumnsRef.current[index],
    getAllColumnRefs: () => taskColumnsRef.current,
  }), []);

  // When a filter/search is active and nothing across the whole board matches,
  // show one board-level empty state (with Clear filters) instead of four
  // per-column "no match" states.
  const { predicate, isFiltering, clearAll } = useTaskFilters();
  const noMatches = useMemo(() => {
    if (!isFiltering) return false;
    for (const c of taskColumns || []) {
      for (const t of c.tasks || []) if (predicate(t, c.id)) return false;
    }
    return true;
  }, [taskColumns, predicate, isFiltering]);

  if (noMatches) {
    return (
      <Box width="100%" height="100%" pt={3} display="flex" alignItems="center" justifyContent="center">
        <FilteredEmptyState onClear={clearAll} />
      </Box>
    );
  }

  return (
    <Box
      width="100%"
      height="100%"
      pt={3}
      pb={0}
      mt={0}
      overflow="hidden"
    >
      <SimpleGrid
        data-tour="task-board"
        columns={{ base: 1, md: 2, lg: 4 }}
        spacing={2}
        width="100%"
        height="100%"
        mb={0}
      >
        {taskColumns &&
          taskColumns.map((column, index) => (
            <Box
              key={column.id}
              height={{ base: "auto", md: "78vh" }}
              minH="400px"
              borderRadius="xl"
              position="relative"
              sx={glassLayerStyle}
              display="flex"
              flexDirection="column"
              alignItems="center"
              p={2}
              mb={0}
              overflow="hidden"
            >
              <TaskColumn
                ref={el => taskColumnsRef.current[index] = el}
                title={column.title}
                tasks={column.tasks || []}
                columnId={column.id}
                projectName={projectName}
                zIndex={1}
                isMobile={false}
                isEmpty={column.tasks?.length === 0}
                takeoverTasks={column.id === 'open' ? takeoverTasks : []}
              />
            </Box>
          ))}
      </SimpleGrid>
    </Box>
  );
});

TaskBoardDesktop.displayName = 'TaskBoardDesktop';

export default TaskBoardDesktop;
