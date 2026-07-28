import React from 'react';
import { Box, Text, HStack, Badge, Flex, Spacer, Tooltip, Icon, Image } from '@chakra-ui/react';
import UserIdentity from '@/components/common/UserIdentity';
import { useDrag } from 'react-dnd';
import TaskCardModal from './TaskCardModal';
import { useRouter } from 'next/router';
import { TimeIcon, StarIcon, CheckIcon, InfoIcon, WarningIcon } from '@chakra-ui/icons';
import { hasBounty as checkHasBounty, getTokenByAddress } from '../../util/tokens';
import { usePOContext } from '../../context/POContext';
import { useOrgName } from '../../hooks/useOrgName';
import { getDifficultyColor, formatEstTime } from '../../util/taskUtils';
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
import { darkCardStyle } from '@/components/shared/glassStyles';

// `isTakeoverGhost`: render-only mirror of an expired-claimed task shown in the
// Open column. Not draggable and mounts NO modal of its own — clicking routes to
// the task URL, which opens the real In Progress card's modal (mounting a second
// modal for the same task id would double-open, since modals watch router.query).
const TaskCard = ({ task, columnId, onEditTask, onEditTaskMetadata, isMobile, isTakeoverGhost = false }) => {
  const poContext = usePOContext();
  const tokenLabel = poContext?.tokenLabel || 'Shares';
  const { id, name, description, difficulty, estHours, claimedBy, claimerUsername, projectId, Payout, bountyToken, bountyPayout, bountyPayoutRaw, rejectionCount, requiresApplication, applicants } = task;
  // Orgs that pay by hours only enter/track time in 15-min steps, so show a
  // "1h 30m" duration instead of decimal "1.5 hrs".
  const estLabel = poContext?.taskPayoutHoursOnly
    ? formatEstTime(estHours)
    : `${estHours} hr${Number(estHours) !== 1 ? 's' : ''}`;

  // Deadlines (v6): one chip max per card — priority takeover > countdown > due date.
  const now = useNow(30000);
  const claimExpired = columnId === 'inProgress' && isClaimExpired(task, now);
  const claimDeadlineSec = columnId === 'inProgress' ? effectiveDeadlineSec(task) : null;
  const due = dueDateSec(task);
  const softOverdue = isOverdueSoft(task, now);

  // "Mine" / "needs my review" accents — same resolution the filter chips and
  // My Work view use. The takeover ghost's dashed border wins over the teal ring.
  const { isMine, needsMyReview } = useTaskIndicators(task, columnId);

  const router = useRouter();
  const userDAO = useOrgName();
  // Use the stable isMobile prop from parent (passed through TaskColumn)
  // This prevents flash when components remount during project switches
  // isMobile prop should always be provided from TaskColumn
  const isCardMobile = isMobile ?? false;

  const openTask = () => {
    const safeProjectId = encodeURIComponent(decodeURIComponent(projectId));
    router.push({
      pathname: `/tasks/`,
      query: { org: userDAO, task: id, projectId: safeProjectId },
    }, undefined, { shallow: true });
  };

  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'task',
    item: { id, columnId, name, description, difficulty, estHours, claimedBy, claimerUsername, Payout, submission: task.submission, projectId, dueDate: task.dueDate, absoluteDeadline: task.absoluteDeadline, completionWindow: task.completionWindow, claimDeadline: task.claimDeadline, assignedAt: task.assignedAt },
    canDrag: () => !task.isIndexing && !isTakeoverGhost,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const truncateDescription = (desc, maxLength) => {
    if (!desc) return '';
    if (desc.length > maxLength) {
      return desc.substring(0, maxLength) + '...';
    }
    return desc;
  };

  // Define the color for the difficulty badge
  const difficultyColorScheme = {
    easy: 'green',
    medium: 'yellow',
    hard: 'orange',
    veryhard: 'red'
  };

  // Difficulty scores for better visualization
  const difficultyScore = {
    easy: 1,
    medium: 2,
    hard: 3,
    veryhard: 4
  };

  // Dark surface for mobile — sits on top of the dark glass column without
  // the visual whiplash of the previous opaque white card. Uses the shared
  // darkCardStyle token from glassStyles.js so future surfaces inherit
  // the same look.
  const mobileCardStyle = {
    ...darkCardStyle,
    boxShadow: isDragging
      ? '0 10px 25px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(159, 122, 234, 0.55)'
      : darkCardStyle.boxShadow,
    padding: '14px',
    marginBottom: '12px',
    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
    transform: isDragging ? 'scale(0.98) rotate(-1deg)' : 'scale(1) rotate(0)',
    opacity: isDragging ? 0.9 : 1,
    borderLeft: difficulty ? `4px solid ${getDifficultyColor(difficulty)}` : undefined,
  };

  // Desktop card style (with subtle improvements)
  const desktopCardStyle = {
    background: 'ghostwhite',
    borderRadius: 'md',
    boxShadow: 'sm',
    padding: '8px',
    marginBottom: '16px',
    cursor: 'grab',
    opacity: isDragging ? 0.7 : 1,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    transform: isDragging ? 'rotate(-1deg)' : 'rotate(0)',
    _hover: {
      boxShadow: 'md',
    },
    borderLeft: difficulty ? `3px solid ${getDifficultyColor(difficulty)}` : undefined,
  };

  // Badge styles with consistent design
  const badgeStyle = {
    fontSize: isCardMobile ? '0.65rem' : '0.6rem',
    fontWeight: 'medium',
    px: isCardMobile ? 2 : 1.5,
    py: isCardMobile ? 1 : 0.5,
    borderRadius: 'full',
    textTransform: 'capitalize'
  };

  // Enhanced card for better readability
  return (
    <>
      <Box
        data-tour="task-card"
        ref={drag}
        sx={isCardMobile ? mobileCardStyle : desktopCardStyle}
        onClick={openTask}
        role="group"
        border={isTakeoverGhost ? '1.5px dashed' : (isMine ? '1.5px solid' : undefined)}
        borderColor={isTakeoverGhost ? 'orange.300' : (isMine ? 'teal.300' : undefined)}
      >
        {/* Task title with better typography */}
        <Text
          fontWeight="700"
          fontSize={isCardMobile ? "0.95rem" : "0.85rem"}
          color={isCardMobile ? "whiteAlpha.900" : "#2D3748"}
          mb={isCardMobile ? 1.5 : 1.5}
          noOfLines={2}
          lineHeight="tight"
          letterSpacing="tight"
          _groupHover={{ color: isCardMobile ? "purple.200" : "purple.700" }}
        >
          {name}
        </Text>

        {/* Description: 1 line on mobile to save vertical real estate */}
        {description && (
          <Text
            fontSize={isCardMobile ? "0.8rem" : "0.75rem"}
            color={isCardMobile ? "whiteAlpha.700" : "#4A5568"}
            mb={isCardMobile ? 2.5 : 2}
            noOfLines={isCardMobile ? 1 : 2}
            lineHeight="1.4"
          >
            {truncateDescription(description, isCardMobile ? 60 : 50)}
          </Text>
        )}

        {/* Info and tags with better layout */}
        <Flex direction="column" gap={isCardMobile ? 1.5 : 2}>
          {/* Difficulty and time indicators */}
          <Flex align="center" justify="space-between">
            {difficulty && (
              <Flex align="center">
                <HStack spacing={1}>
                  {[...Array(difficultyScore[difficulty.toLowerCase().replace(" ", "")] || 1)].map((_, i) => (
                    <Box
                      key={i}
                      w={1.5}
                      h={1.5}
                      borderRadius="full"
                      bg={getDifficultyColor(difficulty)}
                    />
                  ))}
                </HStack>
                <Text
                  fontSize="xs"
                  color={isCardMobile ? "whiteAlpha.700" : "gray.500"}
                  ml={1.5}
                  fontWeight="medium"
                  textTransform="capitalize"
                >
                  {difficulty}
                </Text>
              </Flex>
            )}

            <HStack spacing={1} align="center">
              <TimeIcon boxSize={3} color={isCardMobile ? "whiteAlpha.600" : "gray.400"} />
              <Text fontSize="xs" color={isCardMobile ? "whiteAlpha.700" : "gray.500"} fontWeight="medium">
                {estLabel}
              </Text>
            </HStack>
          </Flex>

          {/* Reward and assigned user */}
          <Flex justify="space-between" align="center" gap={2} mt={isCardMobile ? 0 : 1}>
            <HStack spacing={1.5} flexWrap="wrap">
              {Payout && (
                <Flex
                  align="center"
                  bg={isCardMobile ? "purple.900" : "purple.50"}
                  px={2}
                  py={0.5}
                  borderRadius="full"
                  border={isCardMobile ? "1px solid rgba(159, 122, 234, 0.35)" : undefined}
                >
                  <StarIcon boxSize={3} mr={1} color={isCardMobile ? "purple.300" : "purple.500"} />
                  <Text
                    fontWeight="bold"
                    color={isCardMobile ? "purple.200" : "purple.700"}
                    fontSize="xs"
                  >
                    {Payout} {tokenLabel}
                  </Text>
                </Flex>
              )}
              {checkHasBounty(bountyToken, bountyPayoutRaw) && (() => {
                const tokenInfo = getTokenByAddress(bountyToken);
                return (
                  <Tooltip label={`Token bounty: ${tokenInfo.name}`} placement="top">
                    <Flex
                      align="center"
                      bg={isCardMobile ? "green.900" : "green.50"}
                      px={2}
                      py={0.5}
                      borderRadius="full"
                      border={isCardMobile ? "1px solid rgba(72, 187, 120, 0.35)" : undefined}
                    >
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
                      <Text
                        fontWeight="bold"
                        color={isCardMobile ? "green.200" : "green.700"}
                        fontSize="xs"
                      >
                        +{bountyPayout} {tokenInfo.symbol}
                      </Text>
                    </Flex>
                  </Tooltip>
                );
              })()}
            </HStack>

            <HStack spacing={1.5}>
              {/* Needs-my-review accent — only when this In Review task sits in a
                  project the current user can review (gated inside useTaskIndicators). */}
              {needsMyReview && (
                <Badge colorScheme="orange" {...badgeStyle}>
                  Review
                </Badge>
              )}

              {columnId === 'completed' && (
                <Badge colorScheme="green" {...badgeStyle}>
                  <CheckIcon mr={1} boxSize={2} />
                  Completed
                </Badge>
              )}

              {rejectionCount > 0 && columnId !== 'completed' && (
                <Tooltip label={`Rejected ${rejectionCount} time${rejectionCount > 1 ? 's' : ''}`} placement="top">
                  <Badge colorScheme="red" {...badgeStyle}>
                    <WarningIcon mr={1} boxSize={2} />
                    Rejected
                  </Badge>
                </Tooltip>
              )}

              {requiresApplication && columnId === 'open' && applicants?.length > 0 && (
                <Tooltip label={`${applicants.length} applicant${applicants.length > 1 ? 's' : ''}`} placement="top">
                  <Badge colorScheme="purple" {...badgeStyle}>
                    <InfoIcon mr={1} boxSize={2} />
                    {applicants.length} Applied
                  </Badge>
                </Tooltip>
              )}

              {/* Time-limit chip: surfaced BEFORE claiming so people can judge the
                  commitment (the countdown takes over once it's claimed). */}
              {columnId === 'open' && toSec(task.completionWindow) !== null && (
                <Tooltip
                  label="Once claimed, you must submit within this time or the task opens up for takeover"
                  placement="top"
                >
                  <Badge colorScheme="purple" {...badgeStyle}>
                    <TimeIcon mr={1} boxSize={2} />
                    {formatWindow(task.completionWindow)} limit
                  </Badge>
                </Tooltip>
              )}

              {/* Deadline chip (v6) — one max: takeover > countdown > due date */}
              {claimExpired ? (
                <Tooltip
                  label="The claim window expired. Still in progress, but anyone can take this task over."
                  placement="top"
                >
                  <Badge colorScheme="orange" {...badgeStyle}>
                    <TimeIcon mr={1} boxSize={2} />
                    Open to takeover
                  </Badge>
                </Tooltip>
              ) : claimDeadlineSec !== null && columnId === 'inProgress' ? (
                <Tooltip label={`Submit by ${formatDeadlineDate(claimDeadlineSec)}`} placement="top">
                  <Badge
                    colorScheme={SEVERITY_SCHEME[deadlineSeverity(claimDeadlineSec, now)] || 'gray'}
                    {...badgeStyle}
                  >
                    <TimeIcon mr={1} boxSize={2} />
                    {formatRemaining(claimDeadlineSec, now)}
                  </Badge>
                </Tooltip>
              ) : due !== null && columnId !== 'completed' ? (
                <Tooltip
                  label={softOverdue ? 'Past its due date' : 'Due date (display-only unless enforced)'}
                  placement="top"
                >
                  <Badge colorScheme={softOverdue ? 'red' : 'gray'} {...badgeStyle}>
                    Due {formatDeadlineDate(due)}
                  </Badge>
                </Tooltip>
              ) : null}

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

      {!isTakeoverGhost && (
        <TaskCardModal
          task={task}
          columnId={columnId}
          onEditTask={onEditTask}
          onEditTaskMetadata={onEditTaskMetadata}
        />
      )}
    </>
  );
};

export default TaskCard;
