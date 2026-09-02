import { Box, Tooltip, Text } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useOrgName } from '@/hooks/useOrgName';
import { getProjectNavigationQuery } from '../../taskViewIds';
import { COLUMN_COLORS } from '@/util/taskUtils';
import { toMs, startOfDayMs, dateToPx } from './timeAxis';
import {
  dueDateSec,
  effectiveDeadlineSec,
  isClaimExpired,
  toSec,
  formatRemaining,
  formatWindow,
} from '@/util/deadlineUtils';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = (ms) => {
  const d = new Date(ms);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

// Deadline marker palette: rose for the hard on-chain deadline (distinct from the
// red.400 today-line), kanban orange/red for at-risk/overdue states.
const HARD_DEADLINE_COLOR = '#FF8FA8';
const EXPIRED_COLOR = '#F6AD55';
const OVERDUE_COLOR = '#FC8181';

const TaskBar = ({ task, anchorMs, perDayPx, rowHeight, rangeEndMs, nowMsValue }) => {
  const router = useRouter();
  const userDAO = useOrgName();

  const createdMs = toMs(task.createdAt);
  if (!Number.isFinite(createdMs)) return null;

  const now = nowMsValue ?? Date.now();

  const endMs =
    toMs(task.completedAt) ||
    toMs(task.submittedAt) ||
    toMs(task.assignedAt) ||
    startOfDayMs(now);

  const startMs = startOfDayMs(createdMs);
  const finishMs = Math.max(startOfDayMs(endMs), startMs + 86_400_000 * 0.4);

  const x = dateToPx(startMs, anchorMs, perDayPx);
  const w = dateToPx(finishMs, anchorMs, perDayPx) - x;
  const safeW = Math.max(w, perDayPx * 0.4);
  const barEndX = x + safeW;

  const isDone = task.columnId === 'completed';
  const color = COLUMN_COLORS[task.columnId] || '#A0AEC0';
  const opacity = isDone ? 0.45 : 0.85;
  const barH = rowHeight - 16;
  const barY = (rowHeight - barH) / 2;

  // ---- Deadlines (v6) ----
  // Markers render only inside the visible range — dateToPx clamps negatives to 0,
  // which would otherwise pile out-of-range markers on the left edge.
  const inRange = (ms) =>
    Number.isFinite(ms) && ms >= anchorMs && (!rangeEndMs || ms <= rangeEndMs);

  const dueSec = dueDateSec(task);
  const dueMs = dueSec !== null ? dueSec * 1000 : null;
  const softOverdue = dueMs !== null && !isDone && now > dueMs;
  const showDue = dueMs !== null && inRange(dueMs);
  const dueX = showDue ? dateToPx(dueMs, anchorMs, perDayPx) : 0;

  const absSec = toSec(task.absoluteDeadline);
  const absMs = absSec !== null ? absSec * 1000 : null;
  const showAbs = absMs !== null && inRange(absMs);
  const absX = showAbs ? dateToPx(absMs, anchorMs, perDayPx) : 0;

  const claimed = task.columnId === 'inProgress';
  const enforcedSec = claimed ? effectiveDeadlineSec(task) : null;
  const enforcedMs = enforcedSec !== null ? enforcedSec * 1000 : null;
  const expired = claimed && isClaimExpired(task, now);
  // "Time remaining at risk": hatched run from the bar end to the claim deadline
  // (or, when expired, from the deadline to today).
  let hatchStartX = null;
  let hatchEndX = null;
  if (claimed && enforcedMs !== null) {
    const segStart = expired ? enforcedMs : Math.max(finishMs, now ? startOfDayMs(now) : finishMs);
    const segEnd = expired ? startOfDayMs(now) + 86_400_000 * 0.4 : enforcedMs;
    if (segEnd > segStart && inRange(Math.min(segEnd, rangeEndMs || segEnd))) {
      hatchStartX = dateToPx(Math.max(segStart, anchorMs), anchorMs, perDayPx);
      hatchEndX = dateToPx(rangeEndMs ? Math.min(segEnd, rangeEndMs) : segEnd, anchorMs, perDayPx);
    }
  }

  // Ghost run-up for OPEN tasks with a future due date: bar end -> due date.
  const showGhost =
    task.columnId === 'open' && showDue && dueMs > finishMs && dueX > barEndX + 2;

  const open = () => {
    const safeProjectId = task.projectId
      ? encodeURIComponent(decodeURIComponent(task.projectId))
      : undefined;
    router.push(
      {
        pathname: '/tasks/',
        query: {
          ...getProjectNavigationQuery(router.query),
          org: userDAO,
          task: task.id,
          ...(safeProjectId ? { projectId: safeProjectId } : {}),
        },
      },
      undefined,
      { shallow: true },
    );
  };

  const tooltipLabel = (
    <Box>
      <Text fontWeight="600" fontSize="xs">
        {task.name || task.id}
      </Text>
      <Text fontSize="xs" color="whiteAlpha.700">
        {task.columnTitle || task.columnId} · {fmtDate(startMs)} → {fmtDate(finishMs)}
      </Text>
      {dueMs !== null && (
        <Text fontSize="xs" color={softOverdue ? 'red.300' : 'whiteAlpha.700'}>
          Due {fmtDate(dueMs)}{softOverdue ? ' — overdue' : ''}
        </Text>
      )}
      {absMs !== null && (
        <Text fontSize="xs" color="pink.300">
          Hard deadline {fmtDate(absMs)} (enforced)
        </Text>
      )}
      {claimed && toSec(task.completionWindow) !== null && (
        <Text fontSize="xs" color={expired ? 'orange.300' : 'whiteAlpha.700'}>
          {expired
            ? `Claim window ended ${enforcedMs !== null ? fmtDate(enforcedMs) : ''} — open to takeover`
            : `Claim window: ${formatWindow(task.completionWindow)} — ${formatRemaining(enforcedSec, now)}`}
        </Text>
      )}
    </Box>
  );

  return (
    <>
      <Tooltip label={tooltipLabel} placement="top" hasArrow openDelay={200}>
        <Box
          role="button"
          tabIndex={0}
          aria-label={`Open task ${task.name || task.id}`}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open();
            }
          }}
          position="absolute"
          left={`${x}px`}
          top={`${barY}px`}
          w={`${safeW}px`}
          h={`${barH}px`}
          bg={color}
          opacity={opacity}
          borderRadius="sm"
          cursor="pointer"
          transition="opacity 0.15s ease, transform 0.15s ease"
          _hover={{ opacity: 1, transform: 'translateY(-1px)' }}
          _focusVisible={{
            outline: 'none',
            boxShadow: '0 0 0 2px rgba(159,122,234,0.8)',
          }}
          overflow="hidden"
          border={expired ? `1px solid ${EXPIRED_COLOR}` : undefined}
        >
          {safeW > 60 && (
            <Text
              fontSize="2xs"
              color="rgba(0,0,0,0.7)"
              fontWeight="600"
              px={1.5}
              lineHeight={`${barH}px`}
              noOfLines={1}
              pointerEvents="none"
            >
              {task.name || task.id}
            </Text>
          )}
        </Box>
      </Tooltip>

      {/* Ghost run-up: open task heading toward its due date */}
      {showGhost && (
        <Box
          position="absolute"
          left={`${barEndX}px`}
          top={`${barY}px`}
          w={`${Math.max(dueX - barEndX, 2)}px`}
          h={`${barH}px`}
          border="1px dashed"
          borderColor={softOverdue ? OVERDUE_COLOR : 'whiteAlpha.400'}
          borderLeft="none"
          borderRadius="0 2px 2px 0"
          pointerEvents="none"
        />
      )}

      {/* Claim-window hatch: remaining (status color) or elapsed-past-deadline (orange) */}
      {hatchStartX !== null && hatchEndX !== null && hatchEndX > hatchStartX && (
        <Box
          position="absolute"
          left={`${hatchStartX}px`}
          top={`${barY + 2}px`}
          w={`${hatchEndX - hatchStartX}px`}
          h={`${barH - 4}px`}
          opacity={0.35}
          pointerEvents="none"
          borderRadius="sm"
          bg={`repeating-linear-gradient(45deg, ${expired ? EXPIRED_COLOR : color} 0 4px, transparent 4px 8px)`}
        />
      )}

      {/* Hard deadline: rose flag-tick */}
      {showAbs && (
        <Box position="absolute" left={`${absX - 1}px`} top="5px" pointerEvents="none">
          <Box w="2px" h={`${rowHeight - 10}px`} bg={HARD_DEADLINE_COLOR} opacity={0.9} />
          <Box
            position="absolute"
            top="0"
            left="2px"
            w="0"
            h="0"
            borderTop={`5px solid ${HARD_DEADLINE_COLOR}`}
            borderRight="5px solid transparent"
          />
        </Box>
      )}

      {/* Soft due date: diamond */}
      {showDue && (
        <Box
          position="absolute"
          left={`${dueX - 4}px`}
          top={`${barY + barH / 2 - 4}px`}
          w="8px"
          h="8px"
          transform="rotate(45deg)"
          bg={softOverdue ? OVERDUE_COLOR : 'whiteAlpha.800'}
          border="1px solid rgba(0,0,0,0.35)"
          borderRadius="1px"
          pointerEvents="none"
        />
      )}
    </>
  );
};

export default TaskBar;
