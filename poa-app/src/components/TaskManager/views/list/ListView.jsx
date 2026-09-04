import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Center,
  Checkbox,
  Flex,
  Grid,
  Heading,
  Text,
  useBreakpointValue,
} from '@chakra-ui/react';
import PulseLoader from '@/components/shared/PulseLoader';
import EmptyState from '@/components/voting/EmptyState';
import { COLUMN_TITLES } from '@/util/taskUtils';
import { dueDateSec, effectiveDeadlineSec } from '@/util/deadlineUtils';
import { useFlatTasks } from '../useFlatTasks';
import { useTaskFilters } from '../useTaskFilters';
import { FilteredEmptyState } from '../TaskFilterBar';
import TaskRow, { TASK_ROW_COLUMNS } from './TaskRow';
import ListControls from './ListControls';
import {
  TaskCreationProvider,
  NewTaskButton,
  EmptyStateCreateButton,
} from './ListTaskCreation';

// The list is one continuous surface. Rows use separators instead of nested
// cards so titles and metadata form stable columns that are easy to scan.
const listSurfaceStyle = {
  backgroundColor: 'rgba(10, 13, 18, 0.9)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.24)',
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
    if (key === 'veryhard') return 'Very hard';
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
        sx={listSurfaceStyle}
        borderRadius="lg"
        overflow="hidden"
        minH="200px"
      >
        {/* Keep controls readable at phone widths: two equal selects, then one
            plain summary/action row. Desktop collapses both onto one line. */}
        <Flex
          align={{ base: 'stretch', lg: 'center' }}
          justify="space-between"
          direction={{ base: 'column', lg: 'row' }}
          gap={3}
          px={{ base: 3, md: 4 }}
          py={3}
          borderBottom="1px solid"
          borderColor="whiteAlpha.200"
        >
          <ListControls
            sortId={sortId}
            onSortChange={setSortId}
            groupId={groupId}
            onGroupChange={setGroupId}
          />
          <Flex
            align="center"
            justify={{ base: 'space-between', lg: 'flex-end' }}
            gap={{ base: 3, md: 4 }}
            flexShrink={0}
            w={{ base: '100%', lg: 'auto' }}
          >
            <Text fontSize="sm" color="whiteAlpha.700" whiteSpace="nowrap">
              {sortedTasks.length} task{sortedTasks.length !== 1 ? 's' : ''}
              {hideCompleted && tasks.length !== sortedTasks.length && (
                <Text as="span" color="whiteAlpha.500">
                  {' '}· {tasks.length - sortedTasks.length} hidden
                </Text>
              )}
            </Text>
            <Checkbox
              size="sm"
              isChecked={hideCompleted}
              onChange={(event) => persistHideCompleted(event.target.checked)}
              colorScheme="purple"
              color="whiteAlpha.800"
              whiteSpace="nowrap"
            >
              <Text as="span" fontSize="sm">
                {isMobile ? 'Hide done' : 'Hide completed'}
              </Text>
            </Checkbox>
            {/* Primary create action — renders only inside a TaskCreationProvider
                (project-scoped list); null on the cross-project All Tasks list. */}
            <NewTaskButton isMobile={!!isMobile} />
          </Flex>
        </Flex>

        {!isLoading && sortedTasks.length > 0 && (
          <Grid
            display={{ base: 'none', md: 'grid' }}
            gridTemplateColumns={TASK_ROW_COLUMNS}
            alignItems="center"
            columnGap={3}
            px={4}
            py={2}
            bg="rgba(255, 255, 255, 0.035)"
            borderBottom="1px solid"
            borderColor="whiteAlpha.100"
          >
            <Text fontSize="0.65rem" fontWeight="700" color="whiteAlpha.500" letterSpacing="0.08em">
              TASK
            </Text>
            <Text fontSize="0.65rem" fontWeight="700" color="whiteAlpha.500" letterSpacing="0.08em">
              STATUS
            </Text>
            <Text
              display={{ base: 'none', xl: 'block' }}
              fontSize="0.65rem"
              fontWeight="700"
              color="whiteAlpha.500"
              letterSpacing="0.08em"
            >
              EFFORT
            </Text>
            <Text
              display={{ base: 'none', xl: 'block' }}
              fontSize="0.65rem"
              fontWeight="700"
              color="whiteAlpha.500"
              letterSpacing="0.08em"
            >
              TIMING
            </Text>
            <Text fontSize="0.65rem" fontWeight="700" color="whiteAlpha.500" letterSpacing="0.08em">
              REWARD
            </Text>
            <Text
              fontSize="0.65rem"
              fontWeight="700"
              color="whiteAlpha.500"
              letterSpacing="0.08em"
              textAlign="center"
            >
              OWNER
            </Text>
          </Grid>
        )}

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
              <Box key={g.key}>
                <Flex
                  align="baseline"
                  gap={2}
                  px={4}
                  py={2.5}
                  bg="rgba(255, 255, 255, 0.055)"
                  borderBottom="1px solid"
                  borderColor="whiteAlpha.100"
                >
                  <Heading
                    as="h3"
                    fontSize="xs"
                    color="whiteAlpha.900"
                    fontWeight="700"
                    letterSpacing="0.04em"
                  >
                    {g.label}
                  </Heading>
                  <Text fontSize="xs" color="whiteAlpha.500" fontWeight="500">
                    {g.tasks.length}
                  </Text>
                </Flex>
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} showProject={showProject} />
                ))}
              </Box>
            ))}
          </Box>
        ) : (
          <Box>
            {sortedTasks.map((t) => (
              <TaskRow key={t.id} task={t} showProject={showProject} />
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
