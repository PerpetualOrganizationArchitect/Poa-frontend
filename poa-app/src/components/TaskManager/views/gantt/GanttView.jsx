import { useMemo, useRef, useEffect, useState } from 'react';
import { Box, Flex, Text, useBreakpointValue, IconButton, HStack } from '@chakra-ui/react';
import PulseLoader from '@/components/shared/PulseLoader';
import EmptyState from '@/components/voting/EmptyState';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { useFlatTasks } from '../useFlatTasks';
import { useTaskFilters } from '../useTaskFilters';
import { FilteredEmptyState } from '../TaskFilterBar';
import {
  toMs,
  startOfDayMs,
  addDays,
  daysBetween,
  isWeekend,
  startOfMonthMs,
  pxPerDay,
  dateToPx,
  eachDay,
  getDayRange,
} from './timeAxis';
import TaskBar from './TaskBar';
import GanttControls from './GanttControls';
import { useNow } from '@/hooks/useNow';
import { ChevronRightIcon, ChevronDownIcon } from '@chakra-ui/icons';

// Apply the dark glass directly to the container (matching the Board's
// `taskBoardStyles.glassLayerStyle` pattern). The older inner-layer
// `position:absolute; zIndex:-1` approach lets the page background bleed
// through the corners when the parent has no own background.
const glassContainerStyle = {
  backgroundColor: 'rgba(0, 0, 0, 0.82)',
};

const ZOOM_KEY = 'poa.tasks.gantt.zoom';
const LABEL_COL_WIDTH = 200;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 48;

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const GanttView = ({ projectName, tasks: tasksOverride }) => {
  const ownTasks = useFlatTasks();
  const allTasks = tasksOverride ?? ownTasks;
  // Shared search + quick-filter predicate.
  const { predicate, isFiltering, clearAll } = useTaskFilters();
  // Flat tasks already carry columnId (useFlatTasks), but pass it explicitly so
  // column-dependent chips (open / needs-review / expired) behave identically to
  // the Board callers, which pass predicate(task, columnId).
  const tasks = useMemo(
    () => (isFiltering ? allTasks.filter((t) => predicate(t, t.columnId)) : allTasks),
    [allTasks, predicate, isFiltering],
  );
  const { selectedProject, projects } = useDataBaseContext();
  const [zoom, setZoom] = useState('30d');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const scrollerRef = useRef(null);
  const isMobile = useBreakpointValue({ base: true, md: false });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ZOOM_KEY);
      if (raw && ['7d', '30d', '90d', 'all'].includes(raw)) setZoom(raw);
    } catch {}
  }, []);

  const setZoomPersist = (z) => {
    setZoom(z);
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(ZOOM_KEY, z);
    } catch {}
  };

  // Ticking now (60s) so overdue tints / takeover hatches update without interaction.
  const now = useNow(60000);

  // Range + per-day width
  const [startMs, endMs] = useMemo(() => getDayRange(tasks, zoom), [tasks, zoom]);
  const dayCount = useMemo(() => daysBetween(startMs, endMs) + 1, [startMs, endMs]);
  // Per-day width sized so the 30d preset comfortably fills a typical chart
  // viewport. We let the chart overflow horizontally on tighter zoom-outs.
  const PER_DAY = useMemo(() => {
    if (zoom === '7d') return 56;
    if (zoom === '30d') return 28;
    if (zoom === '90d') return 14;
    // 'all' — pick a width that fits ~120-180 days into ~1400px, but never
    // go below 8 (becomes unreadable) or above 24.
    return Math.max(8, Math.min(24, Math.round(1400 / Math.max(dayCount, 1))));
  }, [zoom, dayCount]);
  const chartWidth = dayCount * PER_DAY;

  // Group tasks by project. Resolve project titles via DataBase context.
  const projectMap = useMemo(() => {
    const m = new Map();
    for (const p of projects || []) m.set(p.id, p.name || p.title || p.id);
    return m;
  }, [projects]);

  const groups = useMemo(() => {
    const buckets = new Map();
    for (const t of tasks) {
      const k = t.projectId || '_none';
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(t);
    }
    // Newest createdAt within each bucket lands first; older tasks fall under.
    for (const arr of buckets.values()) {
      arr.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
    }
    const keys = [...buckets.keys()];
    keys.sort((a, b) => {
      if (a === '_none') return 1;
      if (b === '_none') return -1;
      const an = projectMap.get(a) || a;
      const bn = projectMap.get(b) || b;
      return String(an).localeCompare(String(bn));
    });
    return keys.map((k) => ({
      id: k,
      title:
        k === '_none'
          ? 'No project'
          : projectMap.get(k) ||
            buckets.get(k).find((t) => t.projectName)?.projectName ||
            k,
      tasks: buckets.get(k),
    }));
  }, [tasks, projectMap]);

  // Auto-center on today when zoom changes. The shared scroller wraps both
  // the sticky label column and the chart, so todayX (measured from the
  // chart anchor) needs LABEL_COL_WIDTH added before subtracting half the
  // viewport — otherwise the today line lands offset by the label width.
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const todayMs = startOfDayMs(Date.now());
    const todayX = dateToPx(todayMs, startMs, PER_DAY);
    const target = Math.max(0, LABEL_COL_WIDTH + todayX - node.clientWidth * 0.4);
    node.scrollLeft = target;
  }, [zoom, startMs, PER_DAY]);

  const jumpToToday = () => {
    const node = scrollerRef.current;
    if (!node) return;
    const todayMs = startOfDayMs(Date.now());
    const todayX = dateToPx(todayMs, startMs, PER_DAY);
    node.scrollTo({
      left: Math.max(0, LABEL_COL_WIDTH + todayX - node.clientWidth / 2),
      behavior: 'smooth',
    });
  };

  // Build month + day cell descriptors once per range change.
  const { dayCells, monthSpans } = useMemo(() => {
    const cells = [];
    const months = [];
    let monthCursor = null;
    eachDay(startMs, endMs, (ms) => {
      cells.push({ ms, x: dateToPx(ms, startMs, PER_DAY), weekend: isWeekend(ms) });
      const monthKey = startOfMonthMs(ms);
      if (monthCursor !== monthKey) {
        months.push({ key: monthKey, startX: dateToPx(ms, startMs, PER_DAY) });
        monthCursor = monthKey;
      }
    });
    return { dayCells: cells, monthSpans: months };
  }, [startMs, endMs, PER_DAY]);

  const todayX = useMemo(
    () => dateToPx(startOfDayMs(Date.now()), startMs, PER_DAY),
    [startMs, PER_DAY],
  );

  if (isMobile) {
    return (
      <Box p={4}>
        <EmptyState text="Gantt view requires a larger screen." />
      </Box>
    );
  }

  const isLoading = allTasks.length === 0 && projectName == null;

  return (
    <Box
      w="100%"
      h="100%"
      px={{ base: 2, md: 3 }}
      pt={{ base: 1, md: 2 }}
      pb={{ base: 3, md: 3 }}
      overflow="hidden"
    >
      <Box
        sx={glassContainerStyle}
        borderRadius="xl"
        boxShadow="lg"
        h="100%"
        display="flex"
        flexDirection="column"
        overflow="hidden"
      >
        {/* Controls + jump-to-today */}
        <Flex
          align="center"
          justify="space-between"
          px={4}
          py={3}
          gap={3}
          wrap="wrap"
          borderBottom="1px solid"
          borderColor="whiteAlpha.150"
        >
          <GanttControls
            zoom={zoom}
            onZoomChange={setZoomPersist}
            onJumpToday={jumpToToday}
          />
          <Text fontSize="sm" color="whiteAlpha.700">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </Text>
        </Flex>

        {isLoading ? (
          <Box flex="1" display="flex" alignItems="center" justifyContent="center">
            <PulseLoader size="lg" color="purple.300" />
          </Box>
        ) : tasks.length === 0 ? (
          isFiltering ? (
            <Box flex="1" display="flex" alignItems="center" justifyContent="center">
              <FilteredEmptyState onClear={clearAll} />
            </Box>
          ) : (
            <Box maxW="540px" mx="auto" my={6}>
              <EmptyState text="No tasks yet — create one from the Board to get started." />
            </Box>
          )
        ) : (
          // Single shared scroller for both axes. The task-name column lives
          // inside this scroller too via `position: sticky; left: 0`, and the
          // date axis is `position: sticky; top: 0`. Letting one container own
          // vertical scroll for both panes is what keeps labels and bars
          // perfectly aligned — splitting them into two scrollers desyncs the
          // moment the body is taller than the viewport.
          <Box
            ref={scrollerRef}
            flex="1"
            minH="0"
            overflow="auto"
            position="relative"
            sx={{
              '&::-webkit-scrollbar': { height: '8px', width: '8px' },
              '&::-webkit-scrollbar-thumb': {
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '4px',
              },
            }}
          >
            <Box minW={`${LABEL_COL_WIDTH + chartWidth}px`} position="relative">
              {/* Header row — sticks to the top of the scroller */}
              <Flex
                position="sticky"
                top="0"
                zIndex={3}
                h={`${HEADER_HEIGHT}px`}
                bg="rgba(0,0,0,0.92)"
                borderBottom="1px solid"
                borderColor="whiteAlpha.200"
              >
                {/* Top-left corner — sticks to both top and left */}
                <Box
                  w={`${LABEL_COL_WIDTH}px`}
                  flexShrink={0}
                  position="sticky"
                  left="0"
                  zIndex={4}
                  bg="rgba(0,0,0,0.95)"
                  borderRight="1px solid"
                  borderColor="whiteAlpha.150"
                  display="flex"
                  alignItems="flex-end"
                  px={3}
                  pb={1}
                >
                  <Text fontSize="xs" color="whiteAlpha.500" fontWeight="600" letterSpacing="wide">
                    TASK
                  </Text>
                </Box>
                {/* Date axis (month label row + day cell row) */}
                <Box w={`${chartWidth}px`} flexShrink={0}>
                  <Box h="20px" position="relative">
                    {monthSpans.map((m) => {
                      const d = new Date(m.key);
                      return (
                        <Text
                          key={m.key}
                          position="absolute"
                          left={`${m.startX + 6}px`}
                          top="2px"
                          fontSize="xs"
                          color="whiteAlpha.700"
                          fontWeight="600"
                          letterSpacing="wide"
                        >
                          {MONTH_NAMES[d.getUTCMonth()]} {d.getUTCFullYear()}
                        </Text>
                      );
                    })}
                  </Box>
                  <Box
                    h={`${HEADER_HEIGHT - 20}px`}
                    position="relative"
                    borderTop="1px solid"
                    borderColor="whiteAlpha.100"
                  >
                    {dayCells.map((c) => {
                      const d = new Date(c.ms);
                      const isToday = c.ms === startOfDayMs(Date.now());
                      return (
                        <Text
                          key={c.ms}
                          position="absolute"
                          left={`${c.x}px`}
                          top="4px"
                          w={`${PER_DAY}px`}
                          textAlign="center"
                          fontSize="2xs"
                          color={isToday ? 'red.300' : 'whiteAlpha.500'}
                          fontWeight={isToday ? '700' : '400'}
                        >
                          {d.getUTCDate()}
                        </Text>
                      );
                    })}
                  </Box>
                </Box>
              </Flex>

              {/* Body */}
              <Box position="relative">
                {/* Weekend tints + today line — single absolute layer behind
                    the rows, offset by the label column width so it only
                    paints over the chart area. Sticky labels cover this when
                    the user scrolls horizontally. */}
                <Box
                  position="absolute"
                  left={`${LABEL_COL_WIDTH}px`}
                  top="0"
                  w={`${chartWidth}px`}
                  h="100%"
                  pointerEvents="none"
                  zIndex={0}
                >
                  {dayCells.map((c) => (
                    <Box
                      key={c.ms}
                      position="absolute"
                      left={`${c.x}px`}
                      top="0"
                      w={`${PER_DAY}px`}
                      h="100%"
                      bg={c.weekend ? 'rgba(255,255,255,0.025)' : 'transparent'}
                      borderRight="1px solid"
                      borderColor={
                        new Date(c.ms).getUTCDate() === 1
                          ? 'whiteAlpha.150'
                          : 'whiteAlpha.50'
                      }
                    />
                  ))}
                  <Box
                    position="absolute"
                    left={`${todayX + PER_DAY / 2 - 0.5}px`}
                    top="0"
                    w="1px"
                    h="100%"
                    bg="red.400"
                    opacity="0.6"
                  />
                </Box>

                {/* Per-group rows */}
                {groups.map((g) => {
                  const isCollapsed = collapsed.has(g.id);
                  return (
                    <Box key={g.id}>
                      {/* Group header — full-width strip with sticky label */}
                      <Flex
                        h={`${ROW_HEIGHT}px`}
                        bg="whiteAlpha.50"
                        borderBottom="1px solid"
                        borderColor="whiteAlpha.100"
                      >
                        <Box
                          w={`${LABEL_COL_WIDTH}px`}
                          flexShrink={0}
                          position="sticky"
                          left="0"
                          zIndex={2}
                          bg="rgba(20,20,20,0.97)"
                          borderRight="1px solid"
                          borderColor="whiteAlpha.150"
                          display="flex"
                          alignItems="center"
                          px={2}
                          cursor="pointer"
                          onClick={() => {
                            setCollapsed((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.id)) next.delete(g.id);
                              else next.add(g.id);
                              return next;
                            });
                          }}
                          _hover={{ bg: 'rgba(35,35,35,0.97)' }}
                        >
                          {isCollapsed ? (
                            <ChevronRightIcon color="whiteAlpha.700" mr={1} />
                          ) : (
                            <ChevronDownIcon color="whiteAlpha.700" mr={1} />
                          )}
                          <Text
                            fontSize="sm"
                            fontWeight="600"
                            color="white"
                            noOfLines={1}
                            title={g.title}
                            flex="1"
                          >
                            {g.title}
                          </Text>
                          <Text fontSize="xs" color="whiteAlpha.500" ml={2}>
                            {g.tasks.length}
                          </Text>
                        </Box>
                        <Box w={`${chartWidth}px`} flexShrink={0} />
                      </Flex>
                      {!isCollapsed &&
                        g.tasks.map((t) => (
                          <Flex
                            key={t.id}
                            h={`${ROW_HEIGHT}px`}
                            borderBottom="1px solid"
                            borderColor="whiteAlpha.100"
                          >
                            <Box
                              w={`${LABEL_COL_WIDTH}px`}
                              flexShrink={0}
                              position="sticky"
                              left="0"
                              zIndex={1}
                              bg="rgb(15,15,15)"
                              borderRight="1px solid"
                              borderColor="whiteAlpha.150"
                              display="flex"
                              alignItems="center"
                              gap={2}
                              px={3}
                            >
                              <DifficultyDot diff={t.difficulty} />
                              <Text
                                fontSize="xs"
                                color="whiteAlpha.900"
                                noOfLines={1}
                                title={t.name || t.id}
                                flex="1"
                              >
                                {t.name || t.id}
                              </Text>
                            </Box>
                            <Box
                              w={`${chartWidth}px`}
                              flexShrink={0}
                              position="relative"
                            >
                              <TaskBar
                                task={t}
                                anchorMs={startMs}
                                perDayPx={PER_DAY}
                                rowHeight={ROW_HEIGHT}
                                rangeEndMs={endMs}
                                nowMsValue={now}
                              />
                            </Box>
                          </Flex>
                        ))}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        )}

        {/* Legend */}
        {!isLoading && tasks.length > 0 && (
          <Flex
            px={4}
            py={2.5}
            borderTop="1px solid"
            borderColor="whiteAlpha.150"
            gap={4}
            wrap="wrap"
            fontSize="xs"
            color="whiteAlpha.600"
          >
            <LegendSwatch color="#68D391" label="Open" />
            <LegendSwatch color="#9F7AEA" label="In Progress" />
            <LegendSwatch color="#F6E05E" label="In Review" />
            <LegendSwatch color="#A0AEC0" label="Completed" />
            <Flex align="center" gap={1.5}>
              <Box w="7px" h="7px" transform="rotate(45deg)" bg="whiteAlpha.800" borderRadius="1px" />
              <Text>Due date</Text>
            </Flex>
            <Flex align="center" gap={1.5}>
              <Box w="2px" h="14px" bg="#FF8FA8" />
              <Text>Hard deadline</Text>
            </Flex>
            <Flex align="center" gap={1.5}>
              <Box
                w="14px"
                h="10px"
                borderRadius="2px"
                bg="repeating-linear-gradient(45deg, #9F7AEA 0 3px, transparent 3px 6px)"
                opacity={0.7}
              />
              <Text>Claim window</Text>
            </Flex>
            <Flex align="center" gap={1.5}>
              <Box
                w="14px"
                h="10px"
                borderRadius="2px"
                border="1px solid #F6AD55"
                bg="repeating-linear-gradient(45deg, #F6AD55 0 3px, transparent 3px 6px)"
                opacity={0.8}
              />
              <Text>Expired — open to takeover</Text>
            </Flex>
            <Box ml="auto" display="flex" alignItems="center" gap={1.5}>
              <Box w="2px" h="14px" bg="red.400" opacity={0.7} />
              <Text>Today</Text>
            </Box>
          </Flex>
        )}
      </Box>
    </Box>
  );
};

const LegendSwatch = ({ color, label }) => (
  <Flex align="center" gap={1.5}>
    <Box w="14px" h="10px" borderRadius="sm" bg={color} opacity={0.85} />
    <Text>{label}</Text>
  </Flex>
);

const DIFFICULTY_PALETTE = {
  easy: '#68D391',
  medium: '#F6E05E',
  hard: '#F6AD55',
  veryhard: '#FC8181',
};

const DifficultyDot = ({ diff }) => {
  const key = diff ? String(diff).toLowerCase().replace(' ', '') : '';
  const c = DIFFICULTY_PALETTE[key] || '#CBD5E0';
  return <Box w="6px" h="6px" borderRadius="full" bg={c} flexShrink={0} />;
};

export default GanttView;
