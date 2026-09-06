import React from 'react';
import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  VStack,
  Text,
  Switch,
  Checkbox,
  Input,
  Select,
  Button,
  Tooltip,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import { DAY_S, HOUR_S, secToLocalDateStr } from '@/util/deadlineUtils';

// Preset completion windows ("time limit once claimed"). 0 = none.
const WINDOW_PRESETS = [
  { label: 'None', sec: 0 },
  { label: '1d', sec: DAY_S },
  { label: '3d', sec: 3 * DAY_S },
  { label: '7d', sec: 7 * DAY_S },
  { label: '14d', sec: 14 * DAY_S },
  { label: '30d', sec: 30 * DAY_S },
];

const inputStyles = {
  bg: 'whiteAlpha.100',
  border: '1px solid',
  borderColor: 'whiteAlpha.200',
  color: 'white',
  _hover: { borderColor: 'whiteAlpha.300' },
  _focus: { borderColor: 'purple.400', boxShadow: '0 0 0 1px rgba(159, 122, 234, 0.6)' },
};

/**
 * Shared "Deadlines" form section (AddTaskModal + EditTaskModal).
 *
 * One progressive-disclosure section instead of three raw knobs:
 *  - "Due date"             -> soft metadata dueDate (display-only) …
 *  - "Enforce on-chain"     -> … unless enforced, which also writes absoluteDeadline
 *  - "Time limit once claimed" -> on-chain completionWindow (per-claim takeover window)
 *
 * Controlled by the parent via:
 *   hasDeadlines / setHasDeadlines       section toggle
 *   dueDateStr / setDueDateStr           'YYYY-MM-DD' (local; end-of-day semantics)
 *   enforceOnChain / setEnforceOnChain   absoluteDeadline checkbox
 *   completionWindowSec / setCompletionWindowSec  seconds (0 = none)
 *
 * metadataOnly: EDIT_META callers can change only the soft due date — the
 * on-chain knobs are hidden (they require EDIT_FULL via updateTask).
 */
export default function DeadlineFields({
  hasDeadlines,
  setHasDeadlines,
  dueDateStr,
  setDueDateStr,
  enforceOnChain,
  setEnforceOnChain,
  completionWindowSec,
  setCompletionWindowSec,
  metadataOnly = false,
  assigneeSelected = false,
}) {
  const todayStr = secToLocalDateStr(Math.floor(Date.now() / 1000));
  const presetMatch = WINDOW_PRESETS.some((p) => p.sec === completionWindowSec);
  const [customMode, setCustomMode] = React.useState(!presetMatch);
  const [customAmount, setCustomAmount] = React.useState(
    presetMatch ? '' : String(Math.max(1, Math.round(completionWindowSec / HOUR_S)))
  );
  const [customUnit, setCustomUnit] = React.useState(
    !presetMatch && completionWindowSec % DAY_S === 0 ? 'days' : 'hours'
  );

  const applyCustom = (amountStr, unit) => {
    const n = Math.max(0, Math.floor(Number(amountStr) || 0));
    setCompletionWindowSec(n * (unit === 'days' ? DAY_S : HOUR_S));
  };

  return (
    <Box>
      <FormControl>
        <HStack justify="space-between" mb={hasDeadlines ? 3 : 0}>
          <HStack>
            <Text
              fontSize="xs"
              fontWeight="bold"
              color="purple.300"
              textTransform="uppercase"
              letterSpacing="wide"
            >
              Deadlines
            </Text>
            <Text fontSize="xs" color="gray.500">
              (Optional)
            </Text>
          </HStack>
          <Switch
            isChecked={hasDeadlines}
            onChange={(e) => {
              const on = e.target.checked;
              setHasDeadlines(on);
              if (!on) {
                setDueDateStr('');
                setEnforceOnChain(false);
                setCompletionWindowSec(0);
              }
            }}
            colorScheme="purple"
          />
        </HStack>
      </FormControl>

      {hasDeadlines && (
        <Box
          p={4}
          bg="whiteAlpha.50"
          borderRadius="lg"
          border="1px solid rgba(148, 115, 220, 0.2)"
        >
          <VStack spacing={4} align="stretch">
            <FormControl id="task-due-date">
              <FormLabel color="gray.400" fontSize="xs">
                Due date
              </FormLabel>
              <Input
                type="date"
                size="sm"
                min={metadataOnly ? undefined : todayStr}
                value={dueDateStr}
                onChange={(e) => {
                  setDueDateStr(e.target.value);
                  if (!e.target.value) setEnforceOnChain(false);
                }}
                {...inputStyles}
                sx={{
                  colorScheme: 'dark',
                  '::-webkit-calendar-picker-indicator': { filter: 'invert(1)' },
                }}
              />
              <Text fontSize="xs" color="gray.500" mt={1}>
                Shown on cards and the timeline. It won&apos;t affect claims unless the option below is selected.
              </Text>
            </FormControl>

            {!metadataOnly && (
              <FormControl pl={1}>
                <HStack spacing={2}>
                  <Checkbox
                    isChecked={enforceOnChain}
                    onChange={(e) => setEnforceOnChain(e.target.checked)}
                    colorScheme="purple"
                    size="sm"
                  >
                    <Text fontSize="sm" color="gray.300">
                      Allow the task to be claimed again after the due date
                    </Text>
                  </Checkbox>
                  <Tooltip
                    label="Once the due date passes, anyone can claim the task again."
                    placement="top"
                    bg="gray.800"
                    color="white"
                    borderRadius="md"
                  >
                    <InfoIcon color="gray.500" boxSize={3} />
                  </Tooltip>
                </HStack>
              </FormControl>
            )}

            {!metadataOnly && (
              <FormControl id="task-completion-window">
                <FormLabel color="gray.400" fontSize="xs" mb={2}>
                  Time limit once claimed
                </FormLabel>
                <HStack spacing={2} flexWrap="wrap">
                  {WINDOW_PRESETS.map((p) => (
                    <Button
                      key={p.label}
                      size="xs"
                      variant={!customMode && completionWindowSec === p.sec ? 'solid' : 'outline'}
                      colorScheme={!customMode && completionWindowSec === p.sec ? 'purple' : 'gray'}
                      color={!customMode && completionWindowSec === p.sec ? 'white' : 'gray.400'}
                      onClick={() => {
                        setCustomMode(false);
                        setCompletionWindowSec(p.sec);
                      }}
                    >
                      {p.label}
                    </Button>
                  ))}
                  <Button
                    size="xs"
                    variant={customMode ? 'solid' : 'outline'}
                    colorScheme={customMode ? 'purple' : 'gray'}
                    color={customMode ? 'white' : 'gray.400'}
                    onClick={() => {
                      setCustomMode(true);
                      applyCustom(customAmount || '1', customUnit);
                    }}
                  >
                    Custom
                  </Button>
                </HStack>
                {customMode && (
                  <HStack spacing={2} mt={2} maxW="240px">
                    <Input
                      type="number"
                      size="sm"
                      min="1"
                      value={customAmount}
                      placeholder="e.g. 36"
                      onChange={(e) => {
                        setCustomAmount(e.target.value);
                        applyCustom(e.target.value, customUnit);
                      }}
                      {...inputStyles}
                    />
                    <Select
                      size="sm"
                      value={customUnit}
                      onChange={(e) => {
                        setCustomUnit(e.target.value);
                        applyCustom(customAmount, e.target.value);
                      }}
                      bg="whiteAlpha.100"
                      borderColor="whiteAlpha.200"
                      color="white"
                      maxW="100px"
                    >
                      <option style={{ color: 'black' }} value="hours">hours</option>
                      <option style={{ color: 'black' }} value="days">days</option>
                    </Select>
                  </HStack>
                )}
                <Text fontSize="xs" color="gray.500" mt={2}>
                  {assigneeSelected
                    ? 'The time limit starts when the task is assigned. '
                    : ''}
                  Each claimer must submit within this time of claiming, or the task
                  opens up for takeover.
                </Text>
              </FormControl>
            )}
          </VStack>
        </Box>
      )}
    </Box>
  );
}
