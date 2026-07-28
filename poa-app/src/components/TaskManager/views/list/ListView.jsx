import { useState, useEffect, useMemo } from 'react';
import { Box, Flex, Center, Checkbox, Heading, IconButton, Text, Tooltip, useBreakpointValue } from '@chakra-ui/react';
import { CheckIcon } from '@chakra-ui/icons';
import PulseLoader from '@/components/shared/PulseLoader';
import EmptyState from '@/components/voting/EmptyState';
import { COLUMN_TITLES } from '@/util/taskUtils';
import { dueDateSec, effectiveDeadlineSec } from '@/util/deadlineUtils';
import { useFlatTasks } from '../useFlatTasks';
import { useTaskFilters } from '../useTaskFilters';
import { FilteredEmptyState } from '../TaskFilterBar';
import TaskRow from './TaskRow';
import ListControls from './ListControls';
import {
  TaskCreationProvider,
  NewTaskButton,
  EmptyStateCreateButton,
} from './ListTaskCreation';

// Apply the dark glass directly to the container (matching the Board's
// `taskBoardStyles.glassLayerStyle` pattern). The older inner-layer
// `position:absolute; zIndex:-1` approach lets the page background bleed
// through the corners when the parent has no own background.
const glassContainerStyle = {
  backgroundColor: 'rgba(0, 0, 0, 0.82)',
};

const HIDE_COMPLETED_KEY = 'poa.tasks.list.hideCompleted';
const SORT_KEY = 'poa.tasks.list.sort';
const GROUP_KEY = 'poa.tasks.list.group';

const COLUMN_ORDER = { open: 0, inProgress: 1, inReview: 2, completed: 3 };
const DIFF_ORDER = { veryhard: 0, hard: 1, medium: 2, easy: 3, '': 4 };
const DIFF_KEY = (d) => (d ? String(d).toLowerCase().replace(' ', '') : '');

const toNumber = (v, fallback = 0) => {
  if (v == null || v === '') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

// Deadline ordering key: the sooner of soft due date / enforced claim deadline;
// undated tasks sort last.
const deadlineKey = (t) => {
  const due = dueDateSec(t);
  const enforced = effectiveDeadlineSec(t);
  if (due === null && enforced === null) return Infinity;
  if (due === null) return enforced;
  if (enforced === null) return due;
  return Math.min(due, enforced);
};

const SORTERS = {
  created_desc: (a, b) => toNumber(b.createdAt) - toNumber(a.createdAt),
  created_asc: (a, b) => toNumber(a.createdAt) - toNumber(b.createdAt),
  difficulty_desc: (a, b) =>
    (DIFF_ORDER[DIFF_KEY(a.difficulty)] ?? 4) - (DIFF_ORDER[DIFF_KEY(b.difficulty)] ?? 4),
  payout_desc: (a, b) => toNumber(b.Payout) - toNumber(a.Payout),
  hours_desc: (a, b) => toNumber(b.estHours) - toNumber(a.estHours),
  due_asc: (a, b) => deadlineKey(a) - deadlineKey(b),
  status: (a, b) =>
    (COLUMN_ORDER[a.columnId] ?? 99) - (COLUMN_ORDER[b.columnId] ?? 99),
};

const groupKeyFor = (groupId, task) => {
  if (groupId === 'status') return task.columnId || 'other';
  if (groupId === 'difficulty') return DIFF_KEY(task.difficulty) || 'unspecified';
  if (groupId === 'assignee')
    return task.claimerUsername || task.claimedBy || 'Unassigned';
  if (groupId === 'project')
    return task.projectName || task.projectId || 'No project';
  return null;
};

const groupLabelFor = (groupId, key) => {
  if (groupId === 'status') return COLUMN_TITLES[key] || key;
  if (groupId === 'difficulty') {
    if (key === 'unspecified') return 'No difficulty';
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
  if (groupId === 'assignee') return key;
  if (groupId === 'project') return key;
  return key;
};

const groupOrder = (groupId) => {
  if (groupId === 'status') return COLUMN_ORDER;
  if (groupId === 'difficulty') return DIFF_ORDER;
  return null;
};

const useLocalState = (key, defaultValue) => {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(raw);
    } catch {}
  }, [key]);
  const setAndStore = (next) => {
    setValue(next);
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, next);
    } catch {}
  };
  return [value, setAndStore];
};

const ListView = ({ projectName, tasks: tasksOverride, showProject = false, allowCreate = false }) => {
  const ownTasks = useFlatTasks();
  const allTasks = tasksOverride ?? ownTasks;
  // Shared search + quick-filter predicate — applied before sort/group.
  const { predicate, isFiltering, clearAll } = useTaskFilters();
  // Pass columnId explicitly (flat tasks carry it) so column-dependent chips
  // match the Board callers' predicate(task, columnId) signature.
  const tasks = useMemo(
    () => (isFiltering ? allTasks.filter((t) => predicate(t, t.columnId)) : allTasks),
    [allTasks, predicate, isFiltering],
  );
  const isMobile = useBreakpointValue({ base: true, md: false });
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sortId, setSortId] = useLocalState(SORT_KEY, 'created_desc');
  const [groupId, setGroupId] = useLocalState(GROUP_KEY, 'none');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(HIDE_COMPLETED_KEY);
      if (raw === 'true' || raw === 'false') setHideCompleted(raw === 'true');
    } catch {}
  }, []);

  const persistHideCompleted = (next) => {
    setHideCompleted(next);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(HIDE_COMPLETED_KEY, String(next));
      }
    } catch {}
  };

  const visibleTasks = useMemo(
    () => (hideCompleted ? tasks.filter((t) => t.columnId !== 'completed') : tasks),
    [tasks, hideCompleted],
  );

  const sortedTasks = useMemo(() => {
    const sorter = SORTERS[sortId] || SORTERS.created_desc;
    return [...visibleTasks].sort(sorter);
  }, [visibleTasks, sortId]);

  const groupedView = useMemo(() => {
    if (groupId === 'none') return null;
    const buckets = new Map();
    for (const t of sortedTasks) {
      const k = groupKeyFor(groupId, t);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(t);
    }
    const order = groupOrder(groupId);
    const keys = [...buckets.keys()].sort((a, b) => {
      if (order) {
        const ai = order[a] ?? 99;
        const bi = order[b] ?? 99;
        if (ai !== bi) return ai - bi;
      }
      return String(a).localeCompare(String(b));
    });
    return keys.map((k) => ({ key: k, label: groupLabelFor(groupId, k), tasks: buckets.get(k) }));
  }, [groupId, sortedTasks]);

  const isLoading = allTasks.length === 0 && projectName == null;

  const content = (
    <Box
      w="100%"
      h="100%"
      px={{ base: 2, md: 3 }}
      pt={{ base: 1, md: 2 }}
      pb={{ base: 3, md: 3 }}
      overflow="auto"
      sx={{
        '&::-webkit-scrollbar': { width: '6px' },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(255,255,255,0.18)',
          borderRadius: '3px',
        },
      }}
    >
      <Box
        sx={glassContainerStyle}
        borderRadius="xl"
        boxShadow="lg"
        p={{ base: 3, md: 4 }}
        minH="200px"
      >
        {/* Toolbar — single row on mobile to reclaim vertical space.
            Desktop keeps the two-section layout with a separator. */}
        <Flex
          align="center"
          justify="space-between"
          direction="row"
          mb={{ base: 2.5, md: 4 }}
          gap={{ base: 2, md: 3 }}
          pb={{ base: 2, md: 3 }}
          borderBottom="1px solid"
          borderColor="whiteAlpha.150"
          wrap={{ base: 'nowrap', md: 'wrap' }}
        >
          <ListControls
            sortId={sortId}
            onSortChange={setSortId}
            groupId={groupId}
            onGroupChange={setGroupId}
            isMobile={!!isMobile}
          />
          <Flex align="center" gap={{ base: 2, md: 3 }} flexShrink={0}>
            {isMobile ? (
              <Tooltip
                label={hideCompleted ? 'Show completed tasks' : 'Hide completed tasks'}
                placement="top"
              >
                <IconButton
                  size="xs"
                  variant={hideCompleted ? 'solid' : 'outline'}
                  colorScheme="purple"
                  aria-label={hideCompleted ? 'Show completed tasks' : 'Hide completed tasks'}
                  aria-pressed={hideCompleted}
                  icon={<CheckIcon boxSize={3} />}
                  onClick={() => persistHideCompleted(!hideCompleted)}
                  borderColor="whiteAlpha.300"
                  color={hideCompleted ? 'white' : 'whiteAlpha.700'}
                  flexShrink={0}
                />
              </Tooltip>
            ) : (
              <Flex align="center" gap={3} px={1}>
                <Text fontSize="sm" color="whiteAlpha.700">
                  {sortedTasks.length} task{sortedTasks.length !== 1 ? 's' : ''}
                  {hideCompleted && tasks.length !== sortedTasks.length
                    ? ` (${tasks.length - sortedTasks.length} hidden)`
                    : ''}
                </Text>
                <Checkbox
                  size="sm"
                  isChecked={hideCompleted}
                  onChange={(e) => persistHideCompleted(e.target.checked)}
                  colorScheme="purple"
                  color="whiteAlpha.800"
                >
                  Hide completed
                </Checkbox>
              </Flex>
            )}
            {/* Primary create action — renders only inside a TaskCreationProvider
                (project-scoped list); null on the cross-project All Tasks list. */}
            <NewTaskButton isMobile={!!isMobile} />
          </Flex>
        </Flex>

        {isLoading ? (
          <Center py={10}>
            <PulseLoader size="lg" color="purple.300" />
          </Center>
        ) : sortedTasks.length === 0 ? (
          // Only the "no match" state when the filter itself produced nothing.
          // If it matched tasks but "Hide completed" then masked them all,
          // fall through to the normal completed-tasks empty state instead.
          isFiltering && tasks.length === 0 ? (
            <FilteredEmptyState onClear={clearAll} />
          ) : (
            <Box maxW="540px" mx="auto" my={6}>
              <EmptyState
                text={
                  allTasks.length === 0
                    ? 'No tasks yet — create your first task to get started.'
                    : 'All tasks are completed. Toggle off "Hide completed" to see them.'
                }
              />
              {allTasks.length === 0 && <EmptyStateCreateButton />}
            </Box>
          )
        ) : groupedView ? (
          <Box>
            {groupedView.map((g) => (
              <Box key={g.key} mb={4}>
                <Heading
                  size="sm"
                  color="white"
                  mb={2}
                  pb={1}
                  borderBottom="1px solid"
                  borderColor="whiteAlpha.200"
                  display="flex"
                  alignItems="baseline"
                  gap={2}
                >
                  {g.label}
                  <Text as="span" fontSize="xs" color="whiteAlpha.500" fontWeight="400">
                    {g.tasks.length}
                  </Text>
                </Heading>
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} isMobile={!!isMobile} showProject={showProject} />
                ))}
              </Box>
            ))}
          </Box>
        ) : (
          <Box>
            {sortedTasks.map((t) => (
              <TaskRow key={t.id} task={t} isMobile={!!isMobile} showProject={showProject} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );

  // Task creation depends on TaskBoardContext, which only exists for a
  // project-scoped list. The cross-project All Tasks list passes
  // allowCreate=false, so it renders the same list with no provider — and the
  // New Task / Create Task buttons (which read the context) render nothing.
  if (!allowCreate) return content;

  return <TaskCreationProvider projectName={projectName}>{content}</TaskCreationProvider>;
};

export default ListView;
