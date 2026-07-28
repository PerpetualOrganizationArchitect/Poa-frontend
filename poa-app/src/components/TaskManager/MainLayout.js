import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Flex, Box, Heading, useMediaQuery, Text, Button, VStack, HStack, IconButton, useDisclosure, Badge } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import ProjectSidebar from './ProjectSidebar';
import TaskBoard from './TaskBoard';
import CreateProjectModal from './CreateProjectModal';
import FolderTreeEditor from '../folders/FolderTreeEditor';
import MobileTopBar from './MobileTopBar';
import ProjectSwitcherDrawer from './ProjectSwitcherDrawer';
import { useFolderDoc } from '../folders/useFolderDoc';
import { TaskBoardProvider } from '../../context/TaskBoardContext';
import AllTasksView from './views/AllTasksView';
import MyWorkView from './views/MyWorkView';
import { ALL_TASKS_ID, MY_WORK_ID } from './taskViewIds';
import { useDataBaseContext} from '../../context/dataBaseContext';
import { useIPFScontext } from '../../context/ipfsContext';
import { useUserContext } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { useWeb3, useOrgTheme, useTaskManagerV4State } from '../../hooks';
import { usePOContext } from '@/context/POContext';
import { useOrgName } from '@/hooks/useOrgName';
import { useRouter } from 'next/router';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { SimpleGrid, Avatar } from '@chakra-ui/react';
import { StarIcon, TimeIcon } from '@chakra-ui/icons';
import { Modal, ModalOverlay, ModalContent, ModalCloseButton, ModalBody, ModalFooter, Spacer } from '@chakra-ui/react';
import { useTour } from '@/features/tour';
import { glassLayerStyle as boardGlassStyle } from './styles/taskBoardStyles';

// Re-export the URL sentinels (defined in the dependency-free ./taskViewIds leaf)
// so existing consumers keep importing them from MainLayout.
export { ALL_TASKS_ID, MY_WORK_ID } from './taskViewIds';

// --- Example task board shown during tour when no real projects exist ---

const DIFF_COLORS = { easy: '#68D391', medium: '#F6E05E', hard: '#F6AD55' };
const DIFF_DOTS = { easy: 1, medium: 2, hard: 3 };

const EXAMPLE_COLUMNS = [
  { id: 'open', title: 'Open', tasks: [
    { title: 'Design the org logo', desc: 'Create a logo that represents the organization', difficulty: 'easy', payout: '10', hours: 2 },
    { title: 'Write a welcome post', desc: 'Draft a welcome message for new members joining', difficulty: 'medium', payout: '25', hours: 3 },
  ]},
  { id: 'inProgress', title: 'In Progress', tasks: [
    { title: 'Set up social accounts', desc: 'Create Twitter and Discord for the org', difficulty: 'medium', payout: '15', hours: 2, assignee: 'alice' },
  ]},
  { id: 'inReview', title: 'In Review', tasks: [
    { title: 'Draft governance rules', desc: 'Write the initial proposal and voting rules', difficulty: 'hard', payout: '40', hours: 5, assignee: 'bob' },
  ]},
  { id: 'completed', title: 'Completed', tasks: [
    { title: 'Deploy the organization', desc: 'Set up the on-chain org contracts', difficulty: 'hard', payout: '50', hours: 1, assignee: 'you' },
  ]},
];

function ExampleTaskCard({ title, desc, difficulty, payout, hours, assignee }) {
  const color = DIFF_COLORS[difficulty] || '#CBD5E0';
  const dots = DIFF_DOTS[difficulty] || 1;

  return (
    <Box
      data-tour="example-task-card"
      bg="ghostwhite"
      borderRadius="md"
      boxShadow="sm"
      p="8px"
      mb="16px"
      borderLeft={`3px solid ${color}`}
      cursor="default"
      _hover={{ boxShadow: 'md' }}
      transition="box-shadow 0.2s ease"
      position="relative"
    >
      <Badge
        position="absolute"
        top="6px"
        right="6px"
        colorScheme="purple"
        variant="subtle"
        fontSize="0.6rem"
        px={1.5}
        py={0}
        borderRadius="sm"
      >
        Example
      </Badge>
      <Text fontWeight="700" fontSize="0.85rem" color="#2D3748" mb={1.5} pr={12} noOfLines={2} lineHeight="tight" letterSpacing="tight">
        {title}
      </Text>
      <Text fontSize="0.75rem" color="#4A5568" mb={2} noOfLines={2} lineHeight="1.4">
        {desc}
      </Text>
      <Flex direction="column" gap={1.5}>
        <Flex justify="space-between" align="center">
          <HStack spacing={1}>
            {Array.from({ length: dots }).map((_, i) => (
              <Box key={i} w="6px" h="6px" borderRadius="full" bg={color} />
            ))}
            <Text fontSize="xs" color="gray.500" ml={1} fontWeight="medium">{difficulty}</Text>
          </HStack>
          <HStack spacing={1}>
            <TimeIcon boxSize={3} color="gray.400" />
            <Text fontSize="xs" color="gray.500" fontWeight="medium">{hours} hr{hours !== 1 ? 's' : ''}</Text>
          </HStack>
        </Flex>
        <Flex justify="space-between" align="center">
          <HStack spacing={1}>
            <Box bg="purple.50" px={2} py={0.5} borderRadius="full" display="flex" alignItems="center" gap="4px">
              <StarIcon boxSize={3} color="purple.500" />
              <Text fontWeight="bold" color="purple.700" fontSize="xs">{payout} PT</Text>
            </Box>
          </HStack>
          {assignee && (
            <Avatar size="xs" name={assignee} bg="purple.500" color="white" />
          )}
        </Flex>
      </Flex>
    </Box>
  );
}

function ExampleTaskBoard() {
  return (
    <Box width="100%" height="100%" pt={3} pb={0} mt={0} overflow="hidden">
      <SimpleGrid
        data-tour="task-board"
        columns={{ base: 1, md: 2, lg: 4 }}
        spacing={2}
        width="100%"
        height="100%"
        mb={0}
      >
        {EXAMPLE_COLUMNS.map(col => (
          <Box
            key={col.id}
            height={{ base: 'auto', md: '78vh' }}
            minH="400px"
            borderRadius="xl"
            position="relative"
            sx={boardGlassStyle}
            display="flex"
            flexDirection="column"
            alignItems="center"
            p={2}
            overflow="hidden"
          >
            <Box w="100%" h="100%">
              <Heading size="md" mb={3} mt={0} ml={3} color="white">
                {col.title}
              </Heading>
              <Box h="calc(100% - 3rem)" borderRadius="md" p={2} overflowY="auto"
                sx={{ '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: '24px' } }}
              >
                {col.tasks.length > 0 ? (
                  col.tasks.map((t, i) => <ExampleTaskCard key={i} {...t} />)
                ) : (
                  <Flex w="100%" minH="200px" direction="column" align="center" justify="center" p={4} textAlign="center"
                    bg="rgba(255,255,255,0.05)" borderRadius="8px" border="1px dashed rgba(255,255,255,0.2)"
                  >
                    <Text fontSize="sm" color="white" fontWeight="medium">{col.title}</Text>
                    <Text fontSize="xs" color="whiteAlpha.700">No tasks yet</Text>
                  </Flex>
                )}
              </Box>
            </Box>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}

// --- Example task detail modal shown during tour ---

const modalGlassStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(33, 33, 33, 0.97)',
};

function ExampleTaskModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered zIndex={10001}>
      <ModalOverlay bg="transparent" />
      <ModalContent bg="transparent" textColor="white" data-tour="example-task-modal">
        <div style={modalGlassStyle} />
        <ModalCloseButton zIndex={1} />
        <Box pt={4} borderTopRadius="2xl" bg="transparent" boxShadow="lg" position="relative">
          <div style={modalGlassStyle} />
          <Text ml="6" fontSize="2xl" fontWeight="bold">Design the org logo</Text>
        </Box>
        <ModalBody>
          <VStack spacing={4} align="start">
            <Box>
              <Text mb="4" mt="4" lineHeight="6" fontSize="md" fontWeight="bold" style={{ whiteSpace: 'pre-wrap' }}>
                Create a logo that represents the organization. It should be clean, modern, and work well at small sizes. Consider the org&apos;s mission and values when designing.
              </Text>
            </Box>
            <HStack width="100%">
              <Badge colorScheme="green">Easy</Badge>
              <Badge colorScheme="blue">2 hrs</Badge>
              <Spacer />
            </HStack>
          </VStack>
        </ModalBody>
        <ModalFooter borderTop="1.5px solid" borderColor="gray.200" py={2}>
          <Box flexGrow={1}>
            <VStack align="start" spacing={0}>
              <Text fontWeight="bold" fontSize="m">Reward: 10 PT</Text>
            </VStack>
          </Box>
          <Box>
            <Button textColor="white" variant="outline" mr={2} isDisabled>Share</Button>
            <Button colorScheme="teal" isDisabled>Claim Task</Button>
          </Box>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}


const MainLayout = () => {
  const {
    projects,
    selectedProject,
    setSelectedProject,
    handleUpdateColumns,
  } = useDataBaseContext();

  const { accountAddress: account } = useAuth();
  const { task: taskService, executeWithNotification } = useWeb3();
  const { taskManagerContractAddress, roleHatIds, roleNames, creatorHatIds } = usePOContext();
  const { userData } = useUserContext() || {};
  const { addToIpfs } = useIPFScontext();
  const router = useRouter();
  const userDAO = useOrgName();
  const { onBackground, onBackgroundMuted } = useOrgTheme();

  // v4 folder state — sourced via subgraph (POContext) once #177 deploys,
  // backed by a lens read against the TaskManager today. The hook handles
  // both transparently.
  const { foldersRoot, organizerHatIds, loading: v4Loading } = useTaskManagerV4State();
  const { doc: folderDoc, loading: docLoading, loadedRoot } = useFolderDoc(foldersRoot);
  const folders = folderDoc?.folders || [];

  // True once we've resolved BOTH the on-chain folders root and the
  // matching IPFS doc. Without this, a hard refresh briefly renders the
  // flat-list fallback (folders=[] during the lens+IPFS gap), then
  // snaps into FolderedProjectList once folders populate. The sidebar
  // uses this to show a transient loader instead of the wrong branch.
  const foldersReady =
    !v4Loading && !docLoading && (foldersRoot ? loadedRoot === foldersRoot : true);

  // Organizer-hat gate. Wearers of any hat in organizerHatIds (or the
  // executor) can call setFolders; we only show the inline edit affordance
  // to them. The contract is the actual security boundary.
  const userIsOrganizer = useMemo(() => {
    const userHatIds = userData?.hatIds || [];
    if (!userHatIds.length || !organizerHatIds.length) return false;
    const userSet = new Set(userHatIds.map((h) => String(h)));
    return organizerHatIds.some((id) => userSet.has(String(id)));
  }, [userData, organizerHatIds]);

  const folderEditor = useDisclosure();

  // Use useMediaQuery for more stable breakpoint detection
  // Returns [isMatch] where isMatch is false by default on SSR to prevent flash
  // Chakra's md breakpoint is 48em (768px)
  const [isMobileQuery] = useMediaQuery('(max-width: 47.99em)', { ssr: false, fallback: false });

  // Use stable state to prevent flash during re-renders
  // Only update when genuinely changing (prevents flicker from brief query glitches)
  const [isMobile, setIsMobile] = useState(false);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    // On first load, set the value
    if (!isInitializedRef.current) {
      setIsMobile(isMobileQuery);
      isInitializedRef.current = true;
    } else if (isMobile !== isMobileQuery) {
      // Only update if genuinely different (debounce rapid changes)
      const timeoutId = setTimeout(() => {
        setIsMobile(isMobileQuery);
      }, 50); // Small delay to filter out render glitches
      return () => clearTimeout(timeoutId);
    }
  }, [isMobileQuery, isMobile]);

  const projectDrawer = useDisclosure();
  const { isOpen: isProjectModalOpen, onOpen: onProjectModalOpen, onClose: onProjectModalClose } = useDisclosure();
  const [showHelp, setShowHelp] = useState(true);
  const { pendingAction, isActive: isTourActive, currentStepDef, nextStep: tourNextStep } = useTour();
  const currentStepId = currentStepDef?.id;
  const [tourDefaultProjectName, setTourDefaultProjectName] = useState('');
  const [tourDefaultProjectDesc, setTourDefaultProjectDesc] = useState('');

  // Pre-fill defaults when modal opens during tour's create-project step
  useEffect(() => {
    if (isProjectModalOpen && isTourActive && pendingAction === 'create-project') {
      setTourDefaultProjectName('My First Project');
      setTourDefaultProjectDesc('A place to organize tasks for your team.');
    }
  }, [isProjectModalOpen, isTourActive, pendingAction]);

  // State to track sidebar visibility
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const handleSelectProject = (projectId) => {
     // Decode first to handle any prior encoding, then encode properly
     const safeProjectId = encodeURIComponent(decodeURIComponent(projectId));
     // Preserve the active view= so switching projects from a list/gantt
     // view doesn't flash the user back through Board.
     const viewParam = router.query.view ? `&view=${encodeURIComponent(router.query.view)}` : '';

    router.push(`/tasks?projectId=${safeProjectId}&org=${encodeURIComponent(userDAO)}${viewParam}`);
    const selected = projects.find((project) => project.id === projectId);
    setSelectedProject(selected);
  };

  // Pushes the URL into "All Tasks" mode. The render branch below reads
  // router.query.projectId — not local state — so the URL is the single
  // source of truth and back/forward navigation works out of the box.
  // Gantt is the natural cross-project view; if the user is on Board (which
  // doesn't compose across projects), drop them to List on entry.
  const handleSelectAllTasks = () => {
    const currentView = router.query.view;
    const view = currentView === 'gantt' ? 'gantt' : 'list';
    router.push(`/tasks?projectId=${ALL_TASKS_ID}&org=${encodeURIComponent(userDAO)}&view=${view}`);
  };

  // "My Work" — personal cross-project view. Deep-linkable and back/forward
  // safe for the same reason as All Tasks: the URL is the source of truth.
  const handleSelectMyWork = () => {
    router.push(`/tasks?projectId=${MY_WORK_ID}&org=${encodeURIComponent(userDAO)}`);
  };

  const allTasksMode = router.query.projectId === ALL_TASKS_ID;
  const myWorkMode = router.query.projectId === MY_WORK_ID;

  // Create project using the new service
  const handleCreateProject = useCallback(async (projectData) => {
    if (!taskService) return;

    // Handle both simple string (for backwards compat) and full object
    const isSimpleCreate = typeof projectData === 'string';
    const projectName = isSimpleCreate ? projectData : projectData.name;

    // Upload description to IPFS if provided
    let metadataHash = '';
    if (!isSimpleCreate && projectData.description && addToIpfs) {
      try {
        const result = await addToIpfs(JSON.stringify({ description: projectData.description }));
        metadataHash = result.path;
      } catch (error) {
        console.warn('Failed to upload project metadata to IPFS:', error);
      }
    }

    // Build default permissions using creatorHatIds (roles trusted to manage tasks)
    // For the simple-create path (quick project creation without the modal)
    if (!roleHatIds || roleHatIds.length === 0) {
      console.error('Cannot create project: roleHatIds not loaded yet');
      throw new Error('Organization roles are still loading. Please wait a moment and try again.');
    }

    const creatorSet = new Set((creatorHatIds || []).map(String));
    const adminRoles = creatorSet.size > 0
      ? roleHatIds.filter(id => creatorSet.has(String(id)))
      : roleHatIds.slice(1);
    // If no admin roles resolved, give all roles full permissions
    const effectiveAdminRoles = adminRoles.length > 0 ? adminRoles : roleHatIds;

    const defaultCreateHats = effectiveAdminRoles;
    const defaultClaimHats = roleHatIds; // all roles can claim
    const defaultReviewHats = effectiveAdminRoles;
    const defaultAssignHats = effectiveAdminRoles;

    const createProjectData = {
      name: projectName,
      metadataHash,
      cap: isSimpleCreate ? 0 : (projectData.cap || 0),
      managers: isSimpleCreate ? [] : (projectData.managers || []),
      createHats: isSimpleCreate ? defaultCreateHats : (projectData.createHats?.length > 0 ? projectData.createHats : defaultCreateHats),
      claimHats: isSimpleCreate ? defaultClaimHats : (projectData.claimHats?.length > 0 ? projectData.claimHats : defaultClaimHats),
      reviewHats: isSimpleCreate ? defaultReviewHats : (projectData.reviewHats?.length > 0 ? projectData.reviewHats : defaultReviewHats),
      assignHats: isSimpleCreate ? defaultAssignHats : (projectData.assignHats?.length > 0 ? projectData.assignHats : defaultAssignHats),
      bountyTokens: isSimpleCreate ? [] : (projectData.bountyTokens || []),
      bountyCaps: isSimpleCreate ? [] : (projectData.bountyCaps || []),
    };

    await executeWithNotification(
      () => taskService.createProject(taskManagerContractAddress, createProjectData),
      {
        pendingMessage: 'Creating project...',
        successMessage: 'Project created successfully!',
        refreshEvent: 'project:created',
      }
    );
  }, [taskService, executeWithNotification, taskManagerContractAddress, addToIpfs, roleHatIds, creatorHatIds]);

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <Flex
        height={{ base: 'calc(100vh - 60px)', md: 'calc(100vh - 80px)' }}
        direction={{ base: "column", md: "row" }}
        position="relative"
        overflow="hidden"
        mb={0}
      >
        {/* Only show the sidebar on desktop and when visible */}
        {!isMobile && sidebarVisible && (
          <Box position="relative">
            <ProjectSidebar
              projects={projects}
              selectedProject={allTasksMode || myWorkMode ? null : selectedProject}
              onSelectProject={handleSelectProject}
              onOpenCreateModal={onProjectModalOpen}
              onToggleSidebar={toggleSidebar}
              folders={folders}
              foldersReady={foldersReady}
              userIsOrganizer={userIsOrganizer}
              onEditFolders={folderEditor.onOpen}
              onSelectAllTasks={handleSelectAllTasks}
              allTasksSelected={allTasksMode}
              onSelectMyWork={handleSelectMyWork}
              myWorkSelected={myWorkMode}
            />
          </Box>
        )}
        
        {/* Main content area. On mobile we keep overflow=hidden at this level
            so the fixed ColumnTabBar in TaskBoardMobile doesn't get overscrolled
            past — each inner view (board column / list view) manages its own
            scrollable region. */}
        <Box
          flex="1"
          position="relative"
          overflow="hidden"
          height={isMobile ? "100%" : "auto"}
          width="100%"
          zIndex={2}
          transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
          display="flex"
          flexDirection="column"
        >
          {/* Compact sticky mobile top bar — project name + view switcher. */}
          {isMobile && projects.length > 0 && (
            <MobileTopBar
              variant={myWorkMode ? 'myWork' : allTasksMode ? 'allTasks' : 'project'}
              projectName={allTasksMode || myWorkMode ? undefined : selectedProject?.name}
              onOpen={projectDrawer.onOpen}
              allowBoard={!allTasksMode && !myWorkMode}
            />
          )}

          {myWorkMode ? (
            <Box flex="1" minH={0} width="100%" overflow={isMobile ? 'hidden' : 'auto'}>
              <MyWorkView
                isDesktop={!isMobile}
                sidebarVisible={sidebarVisible}
                toggleSidebar={toggleSidebar}
              />
            </Box>
          ) : allTasksMode ? (
            <Box flex="1" minH={0} width="100%" overflow={isMobile ? 'hidden' : 'auto'}>
              <AllTasksView
                isDesktop={!isMobile}
                sidebarVisible={sidebarVisible}
                toggleSidebar={toggleSidebar}
              />
            </Box>
          ) : selectedProject ? (
            <Box flex="1" minH={0} width="100%" overflow={isMobile ? "hidden" : "auto"}>
              <TaskBoardProvider
                key={selectedProject.id}
                projectId={selectedProject.id}
                initialColumns={selectedProject.columns}
                onUpdateColumns={handleUpdateColumns}
                account={account}
              >
                <TaskBoard
                  projectName={selectedProject.name}
                  hideTitleBar={isMobile}
                  sidebarVisible={sidebarVisible}
                  toggleSidebar={toggleSidebar}
                  isDesktop={!isMobile}
                >
                </TaskBoard>
              </TaskBoardProvider>
            </Box>
          ) : projects.length > 0 ? (
            <Box flex="1" width="100%">
              <Flex
                flexDirection="column"
                justifyContent="center"
                alignItems="center"
                height="100%"
                px={4}
                py={8}
                textAlign="center"
              >
                <Heading size="md" mb={2} color={onBackground}>Select a Project</Heading>
                <Text fontSize="md" mb={4} color={onBackgroundMuted}>Choose a project from the dropdown above to view tasks</Text>
              </Flex>
            </Box>
          ) : isTourActive && pendingAction !== 'create-project' && pendingAction !== 'create-task' ? (
            /* Tour is active with no projects — show example board */
            <Box flex="1" width="100%">
              <ExampleTaskBoard />
              <ExampleTaskModal
                isOpen={isTourActive && pendingAction === null && currentStepId === 'task-detail'}
                onClose={tourNextStep}
              />
            </Box>
          ) : (
            <Box flex="1" width="100%">
              <Flex
                flexDirection="column"
                justifyContent="center"
                alignItems="center"
                height="100%"
                px={4}
                py={8}
                textAlign="center"
              >
                <Heading size="md" mb={2} color={onBackground}>Create Your First Project</Heading>
                <Text fontSize="md" mb={4} color={onBackgroundMuted}>Get started by creating a project</Text>
                <Button
                  data-tour="create-project-mobile-btn"
                  colorScheme="purple"
                  onClick={onProjectModalOpen}
                  leftIcon={<AddIcon />}
                >
                  Create Project
                </Button>
              </Flex>
            </Box>
          )}
        </Box>
      </Flex>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => {
          setTourDefaultProjectName('');
          setTourDefaultProjectDesc('');
          onProjectModalClose();
        }}
        onCreateProject={handleCreateProject}
        roleHatIds={roleHatIds || []}
        roleNames={roleNames || {}}
        creatorHatIds={creatorHatIds || []}
        defaultName={tourDefaultProjectName}
        defaultDescription={tourDefaultProjectDesc}
      />

      {/* Folder editor — opened from the sidebar header when the
          connected wallet wears an organizer hat. Mounted here so the
          modal survives sidebar collapse / mobile-mode swaps. */}
      <FolderTreeEditor
        isOpen={folderEditor.isOpen}
        onClose={folderEditor.onClose}
        foldersRoot={foldersRoot}
        organizerHatIds={organizerHatIds}
      />

      {/* Mobile project switcher — bottom-sheet drawer. Mounted at the
          layout root so it survives the all-tasks ↔ project render swap. */}
      {isMobile && (
        <ProjectSwitcherDrawer
          isOpen={projectDrawer.isOpen}
          onClose={projectDrawer.onClose}
          projects={projects}
          selectedProjectId={selectedProject?.id}
          allTasksMode={allTasksMode}
          myWorkMode={myWorkMode}
          onSelectProject={handleSelectProject}
          onSelectAllTasks={handleSelectAllTasks}
          onSelectMyWork={handleSelectMyWork}
          onCreateProject={onProjectModalOpen}
        />
      )}
    </DndProvider>
  );
};

export default MainLayout;

