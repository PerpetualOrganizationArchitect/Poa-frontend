import {
  Box,
  Flex,
  Grid,
  HStack,
  Image,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { CalendarIcon, InfoIcon, StarIcon, TimeIcon, WarningIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/router';
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
import { getProjectNavigationQuery } from '../../taskViewIds';
import UserIdentity from '@/components/common/UserIdentity';
import { usePOContext } from '@/context/POContext';
import { useOrgName } from '@/hooks/useOrgName';
import { hasBounty as checkHasBounty, getTokenByAddress } from '@/util/tokens';
import {
  getDifficultyColor,
  COLUMN_COLORS,
  COLUMN_TITLES,
  formatEstTime,
} from '@/util/taskUtils';

// Shared by the desktop header in ListView. At medium widths the lower-value
// effort and timing columns disappear; the task, status, reward, and owner
// columns stay aligned and readable.
export const TASK_ROW_COLUMNS = {
  md: 'minmax(180px, 1fr) 100px 96px 48px',
  xl: 'minmax(250px, 1fr) 118px 148px 158px 118px 64px',
};

const TIMING_COLORS = {
  red: 'red.300',
  orange: 'orange.300',
  yellow: 'yellow.200',
  green: 'green.300',
  gray: 'whiteAlpha.700',
};

const humanizeDifficulty = (difficulty) => {
  if (!difficulty) return '';
  const key = String(difficulty).toLowerCase().replace(/\s/g, '');
  if (key === 'veryhard') return 'Very hard';
  return key.charAt(0).toUpperCase() + key.slice(1);
};

const TaskRow = ({ task, showProject = false }) => {
  const router = useRouter();
  const userDAO = useOrgName();
  const poContext = usePOContext();
  const tokenLabel = poContext?.tokenLabel || 'Shares';
  const { isMine, needsMyReview } = useTaskIndicators(task);

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
          ...getProjectNavigationQuery(router.query),
          org: userDAO,
          task: id,
          ...(safeProjectId ? { projectId: safeProjectId } : {}),
        },
      },
      undefined,
      { shallow: true },
    );
  };

  const difficultyLabel = humanizeDifficulty(difficulty);
  const difficultyColor = getDifficultyColor(difficulty);
  const statusLabel = needsMyReview
    ? 'Needs review'
    : COLUMN_TITLES[columnId] || columnTitle || 'Unknown';
  const statusColor = needsMyReview ? '#F6AD55' : COLUMN_COLORS[columnId] || '#A0AEC0';
  const hasEstimate = estHours !== null && estHours !== undefined && estHours !== '';
  const hoursOnly = poContext?.taskPayoutHoursOnly;
  const estLabel = hasEstimate
    ? hoursOnly
      ? formatEstTime(estHours)
      : `${estHours}h`
    : '';
  const hasTokenBounty = checkHasBounty(bountyToken, bountyPayoutRaw);
  const tokenInfo = hasTokenBounty ? getTokenByAddress(bountyToken) : null;
  const hasSharesReward = Payout !== null && Payout !== undefined && Payout !== '';
  const hasReward = hasSharesReward || (hasTokenBounty && tokenInfo);

  // One timing signal per task: an expired claim, an active countdown, a soft
  // due date, or the commitment window shown before a task is claimed.
  const now = useNow(30000);
  const claimExpired = columnId === 'inProgress' && isClaimExpired(task, now);
  const enforcedDeadline = columnId === 'inProgress' ? effectiveDeadlineSec(task) : null;
  const due = dueDateSec(task);
  const softOverdue = isOverdueSoft(task, now);
  const completionWindow =
    columnId === 'open' && toSec(task.completionWindow) !== null
      ? `${formatWindow(task.completionWindow)} limit`
      : null;
  const deadline = claimExpired
    ? {
        label: 'Open to takeover',
        scheme: 'orange',
        tip: 'The claim window expired — anyone can take this task over.',
      }
    : enforcedDeadline !== null
    ? {
        label: formatRemaining(enforcedDeadline, now),
        scheme: SEVERITY_SCHEME[deadlineSeverity(enforcedDeadline, now)] || 'gray',
        tip: `Submit by ${formatDeadlineDate(enforcedDeadline)}`,
      }
    : due !== null && columnId !== 'completed'
    ? {
        label: `Due ${formatDeadlineDate(due)}`,
        scheme: softOverdue ? 'red' : 'gray',
        tip: softOverdue ? 'Past its due date' : 'Due date',
      }
    : null;

  const attentionColor = needsMyReview ? 'orange.300' : isMine ? 'teal.300' : 'transparent';

  const reward = hasReward ? (
    <VStack align="start" spacing={0.5} minW={0}>
      {hasSharesReward && (
        <HStack spacing={1.5} minW={0}>
          <StarIcon boxSize={3} color="purple.300" flexShrink={0} />
          <Text color="purple.100" fontSize="xs" fontWeight="700" whiteSpace="nowrap">
            {Payout} {tokenLabel}
          </Text>
        </HStack>
      )}
      {hasTokenBounty && tokenInfo && (
        <Tooltip label={`Token bounty: ${tokenInfo.name}`} placement="top">
          <HStack spacing={1.5} minW={0}>
            {tokenInfo.logo && (
              <Image
                src={tokenInfo.logo}
                alt=""
                boxSize="12px"
                borderRadius="full"
                flexShrink={0}
                fallback={<></>}
              />
            )}
            <Text color="green.200" fontSize="0.7rem" fontWeight="600" whiteSpace="nowrap">
              +{bountyPayout} {tokenInfo.symbol}
            </Text>
          </HStack>
        </Tooltip>
      )}
    </VStack>
  ) : (
    <Text color="whiteAlpha.300" fontSize="sm">
      —
    </Text>
  );

  const timing = deadline ? (
    <Tooltip label={deadline.tip} placement="top">
      <HStack spacing={1.5} color={TIMING_COLORS[deadline.scheme] || 'whiteAlpha.700'}>
        <CalendarIcon boxSize={3} flexShrink={0} />
        <Text fontSize="xs" fontWeight={deadline.scheme === 'gray' ? '500' : '700'} noOfLines={1}>
          {deadline.label}
        </Text>
      </HStack>
    </Tooltip>
  ) : completionWindow ? (
    <Tooltip
      label="Once claimed, submit within this time or the task opens for takeover"
      placement="top"
    >
      <HStack spacing={1.5} color="whiteAlpha.600">
        <TimeIcon boxSize={3} flexShrink={0} />
        <Text fontSize="xs" fontWeight="500" noOfLines={1}>
          {completionWindow}
        </Text>
      </HStack>
    </Tooltip>
  ) : (
    <Text color="whiteAlpha.300" fontSize="sm">
      —
    </Text>
  );

  return (
    <Box
      data-tour="task-row"
      role="button"
      tabIndex={0}
      aria-label={`Open task ${name || id}`}
      cursor="pointer"
      borderBottom="1px solid"
      borderBottomColor="whiteAlpha.100"
      borderLeft="3px solid"
      borderLeftColor={attentionColor}
      transition="background 0.15s ease, border-color 0.15s ease"
      _hover={{ bg: 'rgba(255, 255, 255, 0.055)' }}
      _focusVisible={{
        outline: 'none',
        bg: 'whiteAlpha.100',
        boxShadow: 'inset 0 0 0 2px rgba(159,122,234,0.8)',
      }}
      onClick={openTask}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openTask();
        }
      }}
    >
      <Grid
        display={{ base: 'none', md: 'grid' }}
        gridTemplateColumns={TASK_ROW_COLUMNS}
        alignItems="center"
        columnGap={3}
        minH="68px"
        px={4}
        py={2.5}
      >
        <Box minW={0}>
          <Flex align="baseline" gap={2} minW={0}>
            <Text
              color="whiteAlpha.900"
              fontSize="sm"
              fontWeight="700"
              lineHeight="short"
              noOfLines={1}
            >
              {name || id}
            </Text>
            {showProject && projectName && (
              <Text
                color="purple.200"
                fontSize="0.7rem"
                fontWeight="600"
                noOfLines={1}
                flexShrink={0}
                title={projectName}
              >
                {projectName}
              </Text>
            )}
          </Flex>
          <HStack spacing={2} mt={1} minW={0}>
            {description && (
              <Text color="whiteAlpha.600" fontSize="xs" noOfLines={1} minW={0}>
                {description}
              </Text>
            )}
            {rejectionCount > 0 && columnId !== 'completed' && (
              <Tooltip label={`Rejected ${rejectionCount} time${rejectionCount > 1 ? 's' : ''}`} placement="top">
                <HStack spacing={1} color="red.300" flexShrink={0}>
                  <WarningIcon boxSize={2.5} />
                  <Text fontSize="0.65rem" fontWeight="600">
                    Rejected
                  </Text>
                </HStack>
              </Tooltip>
            )}
            {requiresApplication && columnId === 'open' && applicants?.length > 0 && (
              <Tooltip label={`${applicants.length} applicant${applicants.length > 1 ? 's' : ''}`} placement="top">
                <HStack spacing={1} color="purple.200" flexShrink={0}>
                  <InfoIcon boxSize={2.5} />
                  <Text fontSize="0.65rem" fontWeight="600">
                    {applicants.length}
                  </Text>
                </HStack>
              </Tooltip>
            )}
          </HStack>
        </Box>

        <HStack spacing={2} minW={0}>
          <Box w={2} h={2} borderRadius="full" bg={statusColor} flexShrink={0} />
          <Text color="whiteAlpha.800" fontSize="xs" fontWeight="600" noOfLines={1}>
            {statusLabel}
          </Text>
        </HStack>

        <HStack spacing={1.5} minW={0} display={{ base: 'none', xl: 'flex' }}>
          {difficultyLabel && (
            <>
              <Box w={1.5} h={1.5} borderRadius="full" bg={difficultyColor} flexShrink={0} />
              <Text color="whiteAlpha.700" fontSize="xs" whiteSpace="nowrap">
                {difficultyLabel}
              </Text>
            </>
          )}
          {difficultyLabel && estLabel && (
            <Text color="whiteAlpha.300" fontSize="xs">
              ·
            </Text>
          )}
          {estLabel && (
            <Text color="whiteAlpha.600" fontSize="xs" whiteSpace="nowrap">
              {estLabel}
            </Text>
          )}
          {!difficultyLabel && !estLabel && (
            <Text color="whiteAlpha.300" fontSize="sm">
              —
            </Text>
          )}
        </HStack>

        <Box minW={0} display={{ base: 'none', xl: 'block' }}>
          {timing}
        </Box>

        <Box minW={0}>{reward}</Box>

        <Flex justify="center" minW={0}>
          {claimedBy || claimerUsername ? (
            <UserIdentity
              address={claimedBy}
              usernameHint={claimerUsername}
              size="xs"
              showName={false}
            />
          ) : (
            <Text color="whiteAlpha.300" fontSize="sm">
              —
            </Text>
          )}
        </Flex>
      </Grid>

      <Flex display={{ base: 'flex', md: 'none' }} direction="column" gap={2} px={3.5} py={3}>
        <Flex justify="space-between" align="flex-start" gap={3}>
          <Box minW={0} flex="1">
            <Text
              color="whiteAlpha.900"
              fontSize="0.95rem"
              fontWeight="700"
              lineHeight="short"
              noOfLines={2}
            >
              {name || id}
            </Text>
            {showProject && projectName && (
              <Text color="purple.200" fontSize="0.7rem" fontWeight="600" noOfLines={1} mt={0.5}>
                {projectName}
              </Text>
            )}
          </Box>
          <HStack spacing={1.5} flexShrink={0} pt={0.5}>
            <Box w={2} h={2} borderRadius="full" bg={statusColor} />
            <Text color="whiteAlpha.800" fontSize="0.7rem" fontWeight="600">
              {statusLabel}
            </Text>
          </HStack>
        </Flex>

        {description && (
          <Text color="whiteAlpha.600" fontSize="xs" lineHeight="short" noOfLines={1}>
            {description}
          </Text>
        )}

        <Flex justify="space-between" align="center" gap={3} wrap="wrap">
          <HStack spacing={3} minW={0} wrap="wrap">
            {(difficultyLabel || estLabel) && (
              <HStack spacing={1.5}>
                {difficultyLabel && (
                  <Box w={1.5} h={1.5} borderRadius="full" bg={difficultyColor} flexShrink={0} />
                )}
                <Text color="whiteAlpha.600" fontSize="xs" whiteSpace="nowrap">
                  {[difficultyLabel, estLabel].filter(Boolean).join(' · ')}
                </Text>
              </HStack>
            )}
            {(deadline || completionWindow) && <Box minW={0}>{timing}</Box>}
            {rejectionCount > 0 && columnId !== 'completed' && (
              <HStack spacing={1} color="red.300">
                <WarningIcon boxSize={2.5} />
                <Text fontSize="0.65rem" fontWeight="600">
                  Rejected
                </Text>
              </HStack>
            )}
            {requiresApplication && columnId === 'open' && applicants?.length > 0 && (
              <HStack spacing={1} color="purple.200">
                <InfoIcon boxSize={2.5} />
                <Text fontSize="0.65rem" fontWeight="600">
                  {applicants.length} applicant{applicants.length > 1 ? 's' : ''}
                </Text>
              </HStack>
            )}
          </HStack>

          <HStack spacing={2.5} ml="auto">
            {hasReward && reward}
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
    </Box>
  );
};

export default TaskRow;
