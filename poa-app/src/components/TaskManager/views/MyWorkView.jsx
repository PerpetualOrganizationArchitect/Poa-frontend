import { useMemo } from 'react';
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  IconButton,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { FaProjectDiagram } from 'react-icons/fa';
import { FiBriefcase } from 'react-icons/fi';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import { useOrgName } from '@/hooks/useOrgName';
import { useAllProjectsFlatTasks } from './useFlatTasks';
import { ALL_TASKS_ID } from '../taskViewIds';
import TaskRow from './list/TaskRow';
import {
  isTaskMine,
  taskNeedsReview,
  userCanReviewAnywhere,
  hasPendingApplication,
} from '@/util/taskIndicators';
import { effectiveDeadlineSec, dueDateSec } from '@/util/deadlineUtils';

// "My Work" — a personal, cross-project surface. Groups every task that is on
// the current user's plate into List-style sections (reusing TaskRow). Mounts in
// place of the per-project board when the URL is `?projectId=__mine__`, so it
// never depends on a single-project context — it reads ProjectContext directly.

const glassContainerStyle = { backgroundColor: 'rgba(0, 0, 0, 0.82)' };

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Effective deadline for urgency sort: enforced claim deadline, else soft due
// date, else "no deadline" → sorts last.
const deadlineKey = (t) => {
  const enforced = effectiveDeadlineSec(t);
  if (enforced !== null) return enforced;
  const due = dueDateSec(t);
  return due !== null ? due : Infinity;
};

const MyWorkView = ({ isDesktop = true, sidebarVisible, toggleSidebar }) => {
  const router = useRouter();
  const org = useOrgName();
  const tasks = useAllProjectsFlatTasks();
  const { projectsData } = useProjectContext();
  const { accountAddress } = useAuth() || {};
  const {
    address: ctxAddress,
    graphUsername,
    userData,
    hasExecRole,
  } = useUserContext() || {};

  const address = accountAddress || ctxAddress || '';
  const userHatIds = userData?.hatIds || [];

  const projectById = useMemo(() => {
    const m = new Map();
    (projectsData || []).forEach((p) => {
      if (p) m.set(p.id, p);
    });
    return m;
  }, [projectsData]);

  const canReviewAnywhere = useMemo(
    () => userCanReviewAnywhere(projectsData, userHatIds, hasExecRole),
    [projectsData, userHatIds, hasExecRole],
  );

  const { sections, activeCount, needsYouCount } = useMemo(() => {
    const mine = (t) => isTaskMine(t, address, graphUsername);

    const inProgress = tasks
      .filter((t) => t.columnId === 'inProgress' && mine(t))
      .sort((a, b) => deadlineKey(a) - deadlineKey(b));

    const waitingReview = tasks.filter((t) => t.columnId === 'inReview' && mine(t));

    // Only computed (and only rendered) when the user can review somewhere.
    // Excludes tasks the user submitted themselves.
    const needsReview = canReviewAnywhere
      ? tasks.filter(
          (t) =>
            t.columnId === 'inReview' &&
            !mine(t) &&
            taskNeedsReview(t.columnId, projectById.get(t.projectId), userHatIds, hasExecRole),
        )
      : [];

    const myApplications = tasks.filter(
      (t) => t.columnId === 'open' && hasPendingApplication(t, address, graphUsername),
    );

    const recentlyCompleted = tasks
      .filter((t) => t.columnId === 'completed' && mine(t))
      .sort((a, b) => toNum(b.completedAt || b.createdAt) - toNum(a.completedAt || a.createdAt))
      .slice(0, 5);

    const list = [
      { key: 'inProgress', title: 'In progress', tasks: inProgress },
      { key: 'waiting', title: 'Waiting on review', tasks: waitingReview },
      { key: 'needsReview', title: 'Needs your review', tasks: needsReview },
      { key: 'applications', title: 'My applications', tasks: myApplications },
      { key: 'completed', title: 'Recently completed', tasks: recentlyCompleted },
    ].filter((s) => s.tasks.length > 0);

    return { sections: list, activeCount: inProgress.length, needsYouCount: needsReview.length };
  }, [tasks, address, graphUsername, canReviewAnywhere, projectById, userHatIds, hasExecRole]);

  const subtitleParts = [`${activeCount} active`];
  if (needsYouCount > 0) subtitleParts.push(`${needsYouCount} needs you`);
  const subtitle = subtitleParts.join(' · ');

  const browseOpenHref = `/tasks?projectId=${ALL_TASKS_ID}&org=${encodeURIComponent(org)}&view=list&filters=open`;

  return (
    <VStack w="100%" align="stretch" h="100%" spacing={0}>
      {/* Desktop header — mirrors AllTasksView's purple bar. The view is
          List-only, so there's no view switcher. On mobile the label lives in
          the MainLayout-mounted MobileTopBar (variant="myWork"). */}
      {isDesktop && (
        <Box bg="purple.300" w="100%" p={2} height="auto">
          <Flex align="center" justify="space-between" h="100%">
            <Flex align="center" h="100%">
              {!sidebarVisible && (
                <Tooltip label="Show projects sidebar" placement="right" hasArrow>
                  <IconButton
                    aria-label="Show projects sidebar"
                    icon={<FaProjectDiagram size="16px" />}
                    size="sm"
                    variant="ghost"
                    colorScheme="blackAlpha"
                    mr={2}
                    onClick={toggleSidebar}
                    _hover={{ bg: 'blackAlpha.200', transform: 'scale(1.1)' }}
                    transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                  />
                </Tooltip>
              )}
              <HStack spacing={3} align="baseline">
                <Text fontSize="2xl" fontWeight="bold" color="black" lineHeight="normal">
                  My Work
                </Text>
                <Text fontSize="sm" color="blackAlpha.700" fontWeight="500">
                  {subtitle}
                </Text>
              </HStack>
            </Flex>
          </Flex>
        </Box>
      )}

      <Box
        flex="1"
        minH={0}
        width="100%"
        height={{ base: '100%', md: 'calc(100vh - 120px)' }}
        overflow="auto"
        px={{ base: 2, md: 3 }}
        pt={{ base: 1, md: 2 }}
        pb={3}
        sx={{
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255,255,255,0.18)',
            borderRadius: '3px',
          },
        }}
      >
        <Box sx={glassContainerStyle} borderRadius="xl" boxShadow="lg" p={{ base: 3, md: 4 }} minH="200px">
          {sections.length === 0 ? (
            <Flex direction="column" align="center" justify="center" textAlign="center" gap={4} py={12} px={4}>
              <FiBriefcase size={28} color="rgba(255,255,255,0.4)" />
              <Text color="whiteAlpha.800" fontWeight="600">
                Nothing on your plate. Browse open tasks to pick something up
              </Text>
              <Button
                colorScheme="purple"
                size="sm"
                onClick={() => router.push(browseOpenHref)}
              >
                Browse open tasks
              </Button>
            </Flex>
          ) : (
            sections.map((section) => (
              <Box key={section.key} mb={5}>
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
                  {section.title}
                  <Text as="span" fontSize="xs" color="whiteAlpha.500" fontWeight="400">
                    {section.tasks.length}
                  </Text>
                </Heading>
                {section.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} showProject />
                ))}
              </Box>
            ))
          )}
        </Box>
      </Box>
    </VStack>
  );
};

export default MyWorkView;
