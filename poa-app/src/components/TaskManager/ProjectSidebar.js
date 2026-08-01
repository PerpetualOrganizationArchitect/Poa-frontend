import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  VStack,
  Heading,
  Button,
  Input,
  Flex,
  Text,
  Divider,
  InputGroup,
  InputRightElement,
  Tooltip,
  IconButton,
  useToast,
} from '@chakra-ui/react';
import { useWeb3 } from '../../hooks';
import { useDataBaseContext } from '@/context/dataBaseContext';
import DraggableProject from './DraggableProject';
import FolderedProjectList from './FolderedProjectList';
import PulseLoader from '@/components/shared/PulseLoader';
import TrashBin from './TrashBin';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import { useAuth } from '@/context/AuthContext';
import { AddIcon, SearchIcon, ChevronLeftIcon, EditIcon } from '@chakra-ui/icons';
import { FiLayers, FiBriefcase } from 'react-icons/fi';
import { PERMISSION_MESSAGES, ROLE_INDICES } from '../../util/permissions';
import { isTaskMine, taskNeedsReview } from '@/util/taskIndicators';

const glassLayerStyle = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(0, 0, 0, .85)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
};

const ProjectSidebar = ({
  projects,
  selectedProject,
  onSelectProject,
  onOpenCreateModal,
  onToggleSidebar,
  folders = [],
  foldersReady = true,
  userIsOrganizer = false,
  onEditFolders,
  onSelectAllTasks,
  allTasksSelected = false,
  onSelectMyWork,
  myWorkSelected = false,
}) => {
  // Aggregate count is cheap — sidebar already imports ProjectContext.
  // Used to surface a "N tasks" hint on the All Tasks card so it doesn't
  // feel hollow next to project entries that show their own counts.
  const aggregatedTaskCount = useMemo(() => {
    let n = 0;
    for (const p of projects || []) {
      if (!p || !Array.isArray(p.columns)) continue;
      for (const c of p.columns) n += (c.tasks?.length || 0);
    }
    return n;
  }, [projects]);

  const [searchTerm, setSearchTerm] = useState('');
  const { userData, graphUsername, hasExecRole } = useUserContext();
  const { projectsData } = useProjectContext();
  const { accountAddress } = useAuth() || {};
  const { task: taskService, executeWithNotification } = useWeb3();
  const toast = useToast();

  const { taskManagerContractAddress, roleHatIds, creatorHatIds } = usePOContext();

  // Get user's current hat IDs for permission checking
  const userHatIds = userData?.hatIds || [];

  // "My Work" hint counts: tasks assigned to me (in progress) + In Review tasks
  // I can review. Cheap — projectsData already carries columns + tasks.
  const { myWorkActive, myWorkNeedsYou } = useMemo(() => {
    const address = accountAddress || userData?.address || '';
    let active = 0;
    let needsYou = 0;
    for (const p of projectsData || []) {
      for (const c of p.columns || []) {
        for (const t of c.tasks || []) {
          if (c.id === 'inProgress' && isTaskMine(t, address, graphUsername)) {
            active += 1;
          } else if (
            c.id === 'inReview' &&
            !isTaskMine(t, address, graphUsername) &&
            taskNeedsReview(c.id, p, userHatIds, hasExecRole)
          ) {
            needsYou += 1;
          }
        }
      }
    }
    return { myWorkActive: active, myWorkNeedsYou: needsYou };
  }, [projectsData, accountAddress, userData, graphUsername, userHatIds, hasExecRole]);

  const myWorkSubtitle =
    myWorkActive > 0 || myWorkNeedsYou > 0
      ? [`${myWorkActive} active`, myWorkNeedsYou > 0 ? `${myWorkNeedsYou} needs you` : null]
          .filter(Boolean)
          .join(' · ')
      : 'Nothing assigned yet';

  // Normalize hat IDs for comparison
  const normalizeHatId = (id) => String(id).trim();

  // Check if user can create projects
  // Project creation requires one of the creatorHatIds from the TaskManager
  const canManageProjects = useMemo(() => {
    if (!userHatIds.length) return false;

    const normalizedUserHats = userHatIds.map(normalizeHatId);

    // Check if user has one of the creatorHatIds from TaskManager
    if (creatorHatIds && creatorHatIds.length > 0) {
      const hasCreatorHat = creatorHatIds.some(creatorHatId =>
        normalizedUserHats.includes(normalizeHatId(creatorHatId))
      );
      if (hasCreatorHat) return true;
    }

    // Fallback: Check if user has a non-member role (executive or higher)
    if (roleHatIds && roleHatIds.length > 1 && (!creatorHatIds || creatorHatIds.length === 0)) {
      const nonMemberRoles = roleHatIds.slice(ROLE_INDICES.EXECUTIVE);
      if (nonMemberRoles.some(roleId => normalizedUserHats.includes(normalizeHatId(roleId)))) {
        return true;
      }
    }

    // If no creatorHatIds configured and no projects exist, allow members to create first project
    if ((!creatorHatIds || creatorHatIds.length === 0) && !projectsData?.length && userHatIds.length > 0) {
      return true;
    }

    return false;
  }, [userHatIds, projectsData, roleHatIds, creatorHatIds]);

  const handleCreateProject = () => {
    if (canManageProjects) {
      onOpenCreateModal();
    } else {
      toast({
        title: 'Permission Required',
        description: PERMISSION_MESSAGES.PROJECT_MANAGE_EXEC,
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
    }
  };

  // Delete project using the new service
  const onDeleteProject = useCallback(async (projectId) => {
    if (!canManageProjects) {
      toast({
        title: 'Permission Required',
        description: PERMISSION_MESSAGES.REQUIRE_CREATE,
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    if (!taskService) return;

    await executeWithNotification(
      () => taskService.deleteProject(taskManagerContractAddress, projectId),
      {
        pendingMessage: 'Deleting project...',
        successMessage: 'Project deleted successfully!',
        refreshEvent: 'project:deleted',
      }
    );
  }, [canManageProjects, taskService, executeWithNotification, taskManagerContractAddress, toast]);

  // Filter projects based on search term. Memoized so the array reference
  // stays stable between unrelated re-renders — without this, the child
  // FolderedProjectList sees a new `filteredProjects` prop on every parent
  // render and re-runs its visible-set memo unnecessarily.
  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projects;
    const lower = searchTerm.toLowerCase();
    return projects.filter((project) => project.name.toLowerCase().includes(lower));
  }, [projects, searchTerm]);

  return (
    <Box
      w="220px"
      marginRight={0}
      display="flex"
      flexDirection="column"
      bg="transparent"
      position="relative"
      zIndex={1}
      h="calc(100vh - 80px)"
      overflowY="auto"
      overflowX="hidden"
      borderRight="1px solid rgba(255, 255, 255, 0.08)"
      css={{
        '&::-webkit-scrollbar': {
          width: '4px',
        },
        '&::-webkit-scrollbar-track': {
          width: '6px',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(255, 255, 255, 0.3)',
          borderRadius: '24px',
        },
      }}
      transition="width 0.3s ease, transform 0.3s ease"
    >
      <div className="glass" style={glassLayerStyle} />
      
      {/* Header with gradient effect */}
      <Flex 
        direction="column" 
        align="center" 
        pt={5} 
        pb={3} 
        background="linear-gradient(180deg, rgba(41, 65, 171, 0.4) 0%, rgba(0, 0, 0, 0) 100%)"
      >
        <Flex 
          width="95%" 
          align="center" 
          justify="space-between"
          mb={2}
        >
          <Heading
            textAlign="left"
            fontSize="22px"
            color="white"
            letterSpacing="wider"
            fontWeight="bold"
            textTransform="uppercase"
            textShadow="0 0 10px rgba(100, 149, 237, 0.5)"
            ml="10"
          >
            Projects
          </Heading>

          <Flex align="center" gap={1}>
            {userIsOrganizer && onEditFolders && (
              <Tooltip
                label={folders.length > 0 ? 'Edit folders' : 'Create folders to organize projects'}
                placement="bottom"
                hasArrow
              >
                <IconButton
                  aria-label="Edit folders"
                  icon={<EditIcon />}
                  size="sm"
                  variant="ghost"
                  colorScheme="purple"
                  onClick={onEditFolders}
                />
              </Tooltip>
            )}

            {/* Collapse sidebar button */}
            <IconButton
              aria-label="Collapse sidebar"
              icon={<ChevronLeftIcon />}
              size="sm"
              variant="ghost"
              colorScheme="blue"
              onClick={onToggleSidebar}
              title="Collapse sidebar"
            />
          </Flex>
        </Flex>
        
        {/* Search input */}
        <InputGroup size="sm" width="95%" mt={1}>
          <Input
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            bg="whiteAlpha.100"
            border="1px solid rgba(255, 255, 255, 0.15)"
            borderRadius="md"
            color="white"
            _placeholder={{ color: "whiteAlpha.500" }}
            _hover={{ borderColor: "blue.300" }}
            _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px rgba(66, 153, 225, 0.6)" }}
          />
          <InputRightElement pointerEvents="none">
            <SearchIcon color="whiteAlpha.500" />
          </InputRightElement>
        </InputGroup>
      </Flex>
      
      <Divider borderColor="whiteAlpha.200" />

      {/* "My Work" personal shortcut. Sits directly above All Tasks with the
          same system-view treatment. Clicking it pushes ?projectId=__mine__
          which MainLayout reads to swap in <MyWorkView />. */}
      {onSelectMyWork && (
        <Box px={3} pt={3} pb={0}>
          <Flex
            role="button"
            tabIndex={0}
            aria-pressed={myWorkSelected}
            onClick={onSelectMyWork}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectMyWork();
              }
            }}
            align="center"
            gap={3}
            p={2.5}
            borderRadius="md"
            cursor="pointer"
            bg={
              myWorkSelected
                ? 'linear-gradient(135deg, rgba(56,178,172,0.35) 0%, rgba(159,122,234,0.22) 100%)'
                : 'linear-gradient(135deg, rgba(56,178,172,0.12) 0%, rgba(159,122,234,0.06) 100%)'
            }
            border="1px solid"
            borderColor={myWorkSelected ? 'teal.300' : 'whiteAlpha.200'}
            boxShadow={myWorkSelected ? '0 0 0 1px rgba(56,178,172,0.5)' : 'none'}
            transition="background 0.15s ease, border-color 0.15s ease, transform 0.15s ease"
            _hover={{ borderColor: 'teal.300', transform: 'translateY(-1px)' }}
            _focusVisible={{ outline: 'none', boxShadow: '0 0 0 2px rgba(56,178,172,0.7)' }}
          >
            <Flex
              w="32px"
              h="32px"
              align="center"
              justify="center"
              borderRadius="md"
              bg="rgba(56,178,172,0.22)"
              color="teal.100"
              flexShrink={0}
            >
              <FiBriefcase size={16} />
            </Flex>
            <Box minW={0} flex="1">
              <Text fontSize="sm" fontWeight="700" color="white" noOfLines={1}>
                My Work
              </Text>
              <Text fontSize="2xs" color="whiteAlpha.700" noOfLines={1}>
                {myWorkSubtitle}
              </Text>
            </Box>
          </Flex>
        </Box>
      )}

      {/* "All Tasks" cross-project shortcut. Sits above the per-project
          list with its own visual treatment so it reads as a system view,
          not just another project. Clicking it pushes ?projectId=__all__
          which MainLayout reads to swap in <AllTasksView /> in place of
          the per-project TaskBoardProvider. */}
      {onSelectAllTasks && (
        <Box px={3} pt={3} pb={1}>
          <Flex
            role="button"
            tabIndex={0}
            aria-pressed={allTasksSelected}
            onClick={onSelectAllTasks}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectAllTasks();
              }
            }}
            align="center"
            gap={3}
            p={2.5}
            borderRadius="md"
            cursor="pointer"
            bg={
              allTasksSelected
                ? 'linear-gradient(135deg, rgba(159,122,234,0.35) 0%, rgba(66,153,225,0.25) 100%)'
                : 'linear-gradient(135deg, rgba(159,122,234,0.12) 0%, rgba(66,153,225,0.08) 100%)'
            }
            border="1px solid"
            borderColor={allTasksSelected ? 'purple.300' : 'whiteAlpha.200'}
            boxShadow={allTasksSelected ? '0 0 0 1px rgba(159,122,234,0.5)' : 'none'}
            transition="background 0.15s ease, border-color 0.15s ease, transform 0.15s ease"
            _hover={{
              borderColor: 'purple.300',
              transform: 'translateY(-1px)',
            }}
            _focusVisible={{
              outline: 'none',
              boxShadow: '0 0 0 2px rgba(159,122,234,0.7)',
            }}
          >
            <Flex
              w="32px"
              h="32px"
              align="center"
              justify="center"
              borderRadius="md"
              bg="rgba(159,122,234,0.25)"
              color="purple.100"
              flexShrink={0}
            >
              <FiLayers size={16} />
            </Flex>
            <Box minW={0} flex="1">
              <Text fontSize="sm" fontWeight="700" color="white" noOfLines={1}>
                All Tasks
              </Text>
              <Text fontSize="2xs" color="whiteAlpha.700" noOfLines={1}>
                {aggregatedTaskCount} task{aggregatedTaskCount === 1 ? '' : 's'} · every project
              </Text>
            </Box>
          </Flex>
        </Box>
      )}

      {/* Section divider — labels the per-project list so the All Tasks
          card above reads as a distinct surface, not the first project. */}
      {onSelectAllTasks && (
        <Flex align="center" gap={2} px={4} pt={2} pb={1}>
          <Text
            fontSize="2xs"
            color="whiteAlpha.500"
            fontWeight="700"
            letterSpacing="widest"
            textTransform="uppercase"
          >
            Projects
          </Text>
          <Box flex="1" h="1px" bg="whiteAlpha.100" />
        </Flex>
      )}

      {/* Projects list.
          - Until `foldersReady`, hold the layout with a small loader so we
            don't render the flat-list fallback and then snap into the
            folded view once the IPFS doc arrives.
          - No folders configured → flat list (matches pre-v4 sidebar).
          - Folders present → grouped via FolderedProjectList (existing
            DraggableProject component reused unchanged). */}
      <Box flexGrow={1} overflowY="auto" p={3}>
        {!foldersReady ? (
          <VStack spacing={3} width="100%" align="center" pt={6}>
            <PulseLoader size="sm" color="purple.400" />
          </VStack>
        ) : filteredProjects.length === 0 ? (
          <VStack spacing={3} width="100%" align="center">
            <Text color="whiteAlpha.600" fontSize="sm" pt={4}>
              {searchTerm ? 'No projects match your search' : 'No projects available'}
            </Text>
          </VStack>
        ) : folders.length > 0 ? (
          <FolderedProjectList
            folders={folders}
            projects={projects}
            filteredProjects={filteredProjects}
            selectedProject={selectedProject}
            onSelectProject={onSelectProject}
            onDeleteProject={onDeleteProject}
            searchTerm={searchTerm}
          />
        ) : (
          <VStack spacing={3} width="100%" align="center">
            {filteredProjects.map((project) => {
              const isSelected = selectedProject && project.id === selectedProject.id;
              return (
                <DraggableProject
                  key={project.id}
                  project={project}
                  isSelected={isSelected}
                  onSelectProject={onSelectProject}
                  onDeleteProject={onDeleteProject}
                />
              );
            })}
          </VStack>
        )}
      </Box>
      
      <Divider borderColor="whiteAlpha.200" mt={2} />
      
      {/* Trash bin section */}
      <Box mt={2} mb={2}>
        <TrashBin onDeleteProject={onDeleteProject} />
      </Box>
      
      {/* Create project section */}
      <Flex direction="column" p={3} bg="whiteAlpha.050">
        <Button
          data-tour="create-project-btn"
          onClick={handleCreateProject}
          width="100%"
          size="md"
          colorScheme="blue"
          variant="solid"
          _hover={{
            transform: "translateY(-2px)",
            boxShadow: "0 4px 12px rgba(45, 134, 255, 0.4)"
          }}
          leftIcon={<AddIcon />}
          transition="transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease"
        >
          Create Project
        </Button>
      </Flex>
    </Box>
  );
};

export default ProjectSidebar;
