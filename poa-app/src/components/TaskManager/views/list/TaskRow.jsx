import { Box, Flex, HStack, Text, Badge, Tooltip, Image } from '@chakra-ui/react';
import { TimeIcon, StarIcon, CheckIcon, WarningIcon, InfoIcon, CalendarIcon } from '@chakra-ui/icons';
import {
  dueDateSec,
  effectiveDeadlineSec,
  isClaimExpired,
  isOverdueSoft,
  formatRemaining,
  formatDeadlineDate,
  formatWindow,
  toSec,
  deadlineSeverity,
  SEVERITY_SCHEME,
} from '@/util/deadlineUtils';
import { useNow } from '@/hooks/useNow';
import { useTaskIndicators } from '@/hooks/useTaskIndicators';
import { useRouter } from 'next/router';
import UserIdentity from '@/components/common/UserIdentity';
import { usePOContext } from '@/context/POContext';
import { useOrgName } from '@/hooks/useOrgName';
import { hasBounty as checkHasBounty, getTokenByAddress } from '@/util/tokens';
import {
  getDifficultyColor,
  DIFFICULTY_DOTS,
  COLUMN_COLORS,
  COLUMN_TITLES,
  formatEstTime,
} from '@/util/taskUtils';
import { darkCardStyle } from '@/components/shared/glassStyles';

const STATUS_BADGE_SCHEME = {
  open: 'green',
  inProgress: 'purple',
  inReview: 'yellow',
  completed: 'gray',
};

const TaskRow = ({ task, isMobile = false, showProject = false }) => {
  const router = useRouter();
  const userDAO = useOrgName();
  const poContext = usePOContext();
  const tokenLabel = poContext?.tokenLabel || 'Shares';
  // "Mine" / "needs my review" accents (same logic as the card + chips).
  const { isMine, needsMyReview } = useTaskIndicators(task);
  // needs-review amber ring takes precedence over the teal mine ring.
  const ringColor = needsMyReview ? 'orange.300' : isMine ? 'teal.300' : null;

  const {
    id,
    name,
    description,
    difficulty,
    estHours,
    claimedBy,
    claimerUsername,
    projectId,
    Payout,
    bountyToken,
    bountyPayout,
    bountyPayoutRaw,
    rejectionCount,
    requiresApplication,
    applicants,
    columnId,
    columnTitle,
    projectName,
  } = task;

  const openTask = () => {
    const safeProjectId = projectId
      ? encodeURIComponent(decodeURIComponent(projectId))
      : undefined;
    router.push(
      {
        pathname: '/tasks/',
        query: {
          ...router.query,
          org: userDAO,
          task: id,
          ...(safeProjectId ? { projectId: safeProjectId } : {}),
        },
      },
      undefined,
      { shallow: true },
    );
  };

  const diffKey = difficulty ? String(difficulty).toLowerCase().replace(' ', '') : null;
  const diffColor = getDifficultyColor(difficulty);
  const dots = (diffKey && DIFFICULTY_DOTS[diffKey]) || 1;
  const statusLabel = COLUMN_TITLES[columnId] || columnTitle || '';
  const statusScheme = STATUS_BADGE_SCHEME[columnId] || 'gray';
  const hasTokenBounty = checkHasBounty(bountyToken, bountyPayoutRaw);
  const tokenInfo = hasTokenBounty ? getTokenByAddress(bountyToken) : null;
  // Hours-only orgs track time in 15-min steps → show "1h 30m" rather than
  // decimal "1.5 hrs" / "1.5h".
  const hoursOnly = poContext?.taskPayoutHoursOnly;
  const estLabel = hoursOnly ? formatEstTime(estHours) : `${estHours} hr${Number(estHours) !== 1 ? 's' : ''}`;
  const estLabelShort = hoursOnly ? formatEstTime(estHours) : `${estHours}h`;

  // Deadlines (v6): one chip — takeover > countdown (claimed) > due date.
  const now = useNow(30000);
  const claimExpired = task.columnId === 'inProgress' && isClaimExpired(task, now);
  const enforcedDeadline = task.columnId === 'inProgress' ? effectiveDeadlineSec(task) : null;
  const due = dueDateSec(task);
  const softOverdue = isOverdueSoft(task, now);
  // Pre-claim commitment info: the time limit is visible before anyone claims.
  const windowChip =
    task.columnId === 'open' && toSec(task.completionWindow) !== null
      ? `${formatWindow(task.completionWindow)} limit`
      : null;
  const deadlineChip = claimExpired
    ? { label: 'Open to takeover', scheme: 'orange', tip: 'The claim window expired — anyone can take this task over.' }
    : enforcedDeadline !== null
    ? {
        label: formatRemaining(enforcedDeadline, now),
        scheme: SEVERITY_SCHEME[deadlineSeverity(enforcedDeadline, now)] || 'gray',
        tip: `Submit by ${formatDeadlineDate(enforcedDeadline)}`,
      }
    : due !== null && task.columnId !== 'completed'
    ? {
        label: `Due ${formatDeadlineDate(due)}`,
        scheme: softOverdue ? 'red' : 'gray',
        tip: softOverdue ? 'Past its due date' : 'Due date',
      }
    : null;

  // Mobile renders the row as a card-ish stack to preserve density on
  // narrow widths. Desktop fits the metadata into one horizontal flex row.
  const containerSx = isMobile
    ? {
        ...darkCardStyle,
        p: '12px 14px',
        mb: '10px',
      }
    : {
        bg: 'ghostwhite',
        borderRadius: 'md',
        boxShadow: 'sm',
        p: '8px 12px',
        mb: '8px',
        cursor: 'pointer',
      };

  return (
    <Box
      data-tour="task-row"
      role="button"
      tabIndex={0}
      aria-label={`Open task ${name || id}`}
      onClick={openTask}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openTask();
        }
      }}
      sx={{
        ...containerSx,
        // Ring first, difficulty stripe after — border-left keeps the stripe on
        // the left edge while the ring paints the other three sides.
        ...(ringColor ? { border: '1.5px solid', borderColor: ringColor } : {}),
        borderLeft: `3px solid ${diffColor}`,
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
        _hover: { boxShadow: 'md' },
        _focusVisible: {
          outline: 'none',
          boxShadow: '0 0 0 2px rgba(159,122,234,0.7)',
        },
      }}
    >
      {isMobile ? (
        <Flex direction="column" gap={1.5}>
          <Flex justify="space-between" align="center" gap={2}>
            <Text
              fontWeight="700"
              fontSize="0.95rem"
              color="whiteAlpha.900"
              noOfLines={2}
              lineHeight="tight"
              flex="1"
            >
              {name || id}
            </Text>
            {needsMyReview && (
              <Badge colorScheme="orange" fontSize="0.65rem" textTransform="none" borderRadius="full" px={2}>
                Review
              </Badge>
            )}
            <Badge
              colorScheme={statusScheme}
              fontSize="0.65rem"
              textTransform="none"
              borderRadius="full"
              px={2}
            >
              {statusLabel}
            </Badge>
          </Flex>
          {showProject && projectName && (
            <Text fontSize="0.7rem" color="purple.300" fontWeight="600" noOfLines={1}>
              {projectName}
            </Text>
          )}
          {description && (
            <Text fontSize="0.75rem" color="whiteAlpha.700" noOfLines={1} lineHeight="1.4">
              {description}
            </Text>
          )}
          <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
            <HStack spacing={3}>
              {difficulty && (
                <HStack spacing={1}>
                  {Array.from({ length: dots }).map((_, i) => (
                    <Box key={i} w={1.5} h={1.5} borderRadius="full" bg={diffColor} />
                  ))}
                  <Text fontSize="xs" color="whiteAlpha.700" fontWeight="medium" textTransform="capitalize">
                    {difficulty}
                  </Text>
                </HStack>
              )}
              <HStack spacing={1}>
                <TimeIcon boxSize={3} color="whiteAlpha.600" />
                <Text fontSize="xs" color="whiteAlpha.700" fontWeight="medium">
                  {estLabel}
                </Text>
              </HStack>
              {windowChip && (
                <Tooltip label="Once claimed, submit within this time or the task opens up for takeover" placement="top">
                  <Badge colorScheme="purple" fontSize="0.65rem" textTransform="none" borderRadius="full" px={2}>
                    <TimeIcon mr={1} boxSize={2.5} />
                    {windowChip}
                  </Badge>
                </Tooltip>
              )}
              {deadlineChip && (
                <Tooltip label={deadlineChip.tip} placement="top">
                  <Badge colorScheme={deadlineChip.scheme} fontSize="0.65rem" textTransform="none" borderRadius="full" px={2}>
                    <CalendarIcon mr={1} boxSize={2.5} />
                    {deadlineChip.label}
                  </Badge>
                </Tooltip>
              )}
            </HStack>
            <HStack spacing={2}>
              {Payout && (
                <Flex
                  align="center"
                  bg="purple.900"
                  px={2}
                  py={0.5}
                  borderRadius="full"
                  border="1px solid rgba(159, 122, 234, 0.35)"
                >
                  <StarIcon boxSize={3} mr={1} color="purple.300" />
                  <Text fontWeight="bold" color="purple.200" fontSize="xs">
                    {Payout} {tokenLabel}
                  </Text>
                </Flex>
              )}
              {(claimedBy || claimerUsername) && (
                <UserIdentity
                  address={claimedBy}
                  usernameHint={claimerUsername}
                  size="xs"
                  showName={false}
                />
              )}
            </HStack>
          </Flex>
        </Flex>
      ) : (
        <Flex align="center" gap={3}>
          {/* Title + optional excerpt */}
          <Box flex="1" minW={0}>
            <Flex align="baseline" gap={2}>
              <Text
                fontWeight="700"
                fontSize="0.9rem"
                color="#2D3748"
                noOfLines={1}
                lineHeight="tight"
              >
                {name || id}
              </Text>
              {showProject && projectName && (
                <Text
                  fontSize="0.65rem"
                  color="purple.600"
                  fontWeight="600"
                  noOfLines={1}
                  flexShrink={0}
                  title={projectName}
                >
                  · {projectName}
                </Text>
              )}
            </Flex>
            {description && (
              <Text fontSize="0.7rem" color="#4A5568" noOfLines={1} mt={0.5}>
                {description}
              </Text>
            )}
          </Box>

          {/* Status badge */}
          <Badge
            colorScheme={statusScheme}
            fontSize="0.65rem"
            textTransform="none"
            borderRadius="full"
            px={2}
            flexShrink={0}
            display={{ base: 'none', md: 'inline-flex' }}
          >
            {statusLabel}
          </Badge>

          {/* Needs-my-review accent chip */}
          {needsMyReview && (
            <Badge
              colorScheme="orange"
              fontSize="0.65rem"
              textTransform="none"
              borderRadius="full"
              px={2}
              flexShrink={0}
              display={{ base: 'none', md: 'inline-flex' }}
            >
              Review
            </Badge>
          )}

          {/* Difficulty pill */}
          {difficulty && (
            <HStack spacing={1} flexShrink={0} minW="80px" display={{ base: 'none', lg: 'flex' }}>
              <HStack spacing={1}>
                {Array.from({ length: dots }).map((_, i) => (
                  <Box key={i} w={1.5} h={1.5} borderRadius="full" bg={diffColor} />
                ))}
              </HStack>
              <Text fontSize="xs" color="gray.500" fontWeight="medium" textTransform="capitalize">
                {difficulty}
              </Text>
            </HStack>
          )}

          {/* Hours */}
          <HStack spacing={1} flexShrink={0} minW="60px" display={{ base: 'none', md: 'flex' }}>
            <TimeIcon boxSize={3} color="gray.400" />
            <Text fontSize="xs" color="gray.500" fontWeight="medium">
              {estLabelShort}
            </Text>
          </HStack>

          {/* Time-limit chip (open rows): commitment info before claiming */}
          {windowChip && (
            <Tooltip label="Once claimed, submit within this time or the task opens up for takeover" placement="top">
              <Badge
                colorScheme="purple"
                fontSize="0.65rem"
                textTransform="none"
                borderRadius="full"
                px={2}
                flexShrink={0}
                display={{ base: 'none', md: 'inline-flex' }}
                alignItems="center"
              >
                <TimeIcon mr={1} boxSize={2.5} />
                {windowChip}
              </Badge>
            </Tooltip>
          )}

          {/* Deadline chip (v6) */}
          {deadlineChip && (
            <Tooltip label={deadlineChip.tip} placement="top">
              <Badge
                colorScheme={deadlineChip.scheme}
                fontSize="0.65rem"
                textTransform="none"
                borderRadius="full"
                px={2}
                flexShrink={0}
                display={{ base: 'none', md: 'inline-flex' }}
                alignItems="center"
              >
                <CalendarIcon mr={1} boxSize={2.5} />
                {deadlineChip.label}
              </Badge>
            </Tooltip>
          )}

          {/* Payout pill */}
          {Payout && (
            <Flex
              align="center"
              bg="purple.50"
              px={2}
              py={0.5}
              borderRadius="full"
              flexShrink={0}
            >
              <StarIcon boxSize={3} mr={1} color="purple.500" />
              <Text fontWeight="bold" color="purple.700" fontSize="xs" whiteSpace="nowrap">
                {Payout} {tokenLabel}
              </Text>
            </Flex>
          )}

          {/* Bounty pill */}
          {hasTokenBounty && tokenInfo && (
            <Tooltip label={`Token bounty: ${tokenInfo.name}`} placement="top">
              <Flex align="center" bg="green.50" px={2} py={0.5} borderRadius="full" flexShrink={0}>
                {tokenInfo.logo && (
                  <Image
                    src={tokenInfo.logo}
                    alt={tokenInfo.symbol}
                    boxSize="14px"
                    borderRadius="full"
                    mr={1}
                    fallback={<></>}
                  />
                )}
                <Text fontWeight="bold" color="green.700" fontSize="xs" whiteSpace="nowrap">
                  +{bountyPayout} {tokenInfo.symbol}
                </Text>
              </Flex>
            </Tooltip>
          )}

          {/* Rejection / application flags */}
          {rejectionCount > 0 && columnId !== 'completed' && (
            <Tooltip label={`Rejected ${rejectionCount} time${rejectionCount > 1 ? 's' : ''}`} placement="top">
              <Badge colorScheme="red" fontSize="0.6rem" borderRadius="full" px={2} flexShrink={0}>
                <WarningIcon mr={1} boxSize={2} />
                Rejected
              </Badge>
            </Tooltip>
          )}
          {requiresApplication && columnId === 'open' && applicants?.length > 0 && (
            <Tooltip label={`${applicants.length} applicant${applicants.length > 1 ? 's' : ''}`} placement="top">
              <Badge colorScheme="purple" fontSize="0.6rem" borderRadius="full" px={2} flexShrink={0}>
                <InfoIcon mr={1} boxSize={2} />
                {applicants.length}
              </Badge>
            </Tooltip>
          )}

          {/* Assignee avatar */}
          <Box flexShrink={0} minW="24px">
            {(claimedBy || claimerUsername) ? (
              <UserIdentity
                address={claimedBy}
                usernameHint={claimerUsername}
                size="xs"
                showName={false}
              />
            ) : (
              <Box w="24px" />
            )}
          </Box>
        </Flex>
      )}
    </Box>
  );
};

export default TaskRow;
