// Bottom-sheet project picker for mobile. Mirrors the existing Drawer
// pattern at voting/VotingTabs.js (placement=bottom, dark glass bg).

import { useMemo, useState } from 'react';
import {
  Box,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Button,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  Badge,
  Icon,
} from '@chakra-ui/react';
import { AddIcon, SearchIcon } from '@chakra-ui/icons';
import { FiLayers, FiBriefcase } from 'react-icons/fi';

const countProjectTasks = (project) => {
  if (!project?.columns) return 0;
  return project.columns.reduce((sum, col) => sum + (col.tasks?.length || 0), 0);
};

const SEARCH_THRESHOLD = 8;

const ProjectSwitcherDrawer = ({
  isOpen,
  onClose,
  projects,
  selectedProjectId,
  allTasksMode,
  myWorkMode,
  onSelectProject,
  onSelectAllTasks,
  onSelectMyWork,
  onCreateProject,
}) => {
  const [query, setQuery] = useState('');

  const filteredProjects = useMemo(() => {
    if (!query.trim()) return projects;
    const lower = query.toLowerCase();
    return projects.filter((p) =>
      (p.name || p.title || '').toLowerCase().includes(lower),
    );
  }, [projects, query]);

  const showSearch = projects.length > SEARCH_THRESHOLD;

  const handleSelectProject = (projectId) => {
    onSelectProject(projectId);
    onClose();
  };

  const handleSelectAllTasks = () => {
    onSelectAllTasks();
    onClose();
  };

  const handleSelectMyWork = () => {
    onSelectMyWork();
    onClose();
  };

  const handleCreateProject = () => {
    onCreateProject();
    onClose();
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="bottom" autoFocus={false}>
      <DrawerOverlay bg="blackAlpha.700" />
      <DrawerContent
        bg="rgba(15, 15, 20, 0.98)"
        borderTopRadius="2xl"
        maxH="85vh"
        color="white"
        boxShadow="0 -4px 24px rgba(148, 115, 220, 0.2)"
        borderTop="1px solid rgba(255, 255, 255, 0.1)"
      >
        {/* Drag-handle affordance */}
        <Flex justify="center" pt={2} pb={1}>
          <Box w="36px" h="4px" borderRadius="full" bg="whiteAlpha.300" />
        </Flex>

        <DrawerHeader
          fontSize="sm"
          fontWeight="600"
          color="whiteAlpha.700"
          textTransform="uppercase"
          letterSpacing="wide"
          pt={2}
          pb={3}
          px={4}
        >
          Switch project
        </DrawerHeader>
        <DrawerCloseButton color="whiteAlpha.700" top={3} right={3} />

        <DrawerBody px={4} pt={0} pb={2}>
          {showSearch && (
            <InputGroup size="sm" mb={3}>
              <InputLeftElement>
                <SearchIcon color="whiteAlpha.500" boxSize={3} />
              </InputLeftElement>
              <Input
                placeholder="Search projects"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                bg="whiteAlpha.100"
                border="1px solid rgba(255,255,255,0.12)"
                color="white"
                _placeholder={{ color: 'whiteAlpha.500' }}
                _focus={{
                  borderColor: 'purple.400',
                  boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)',
                }}
                borderRadius="md"
              />
            </InputGroup>
          )}

          {/* My Work shortcut */}
          {onSelectMyWork && (
            <Box
              as="button"
              type="button"
              onClick={handleSelectMyWork}
              w="100%"
              p={3}
              mb={3}
              textAlign="left"
              borderRadius="lg"
              cursor="pointer"
              border="1px solid"
              borderColor={myWorkMode ? 'teal.300' : 'rgba(56,178,172,0.35)'}
              bgGradient={
                myWorkMode
                  ? 'linear(135deg, rgba(56,178,172,0.45) 0%, rgba(159,122,234,0.28) 100%)'
                  : 'linear(135deg, rgba(56,178,172,0.20) 0%, rgba(159,122,234,0.12) 100%)'
              }
              _hover={{
                borderColor: 'teal.300',
                bgGradient: 'linear(135deg, rgba(56,178,172,0.33) 0%, rgba(159,122,234,0.20) 100%)',
              }}
              transition="background 0.15s ease, border-color 0.15s ease"
            >
              <HStack spacing={2} mb={0.5}>
                <Icon as={FiBriefcase} color="whiteAlpha.900" boxSize="14px" />
                <Text fontWeight="700" fontSize="sm" color="white">
                  My Work
                </Text>
              </HStack>
              <Text fontSize="xs" color="whiteAlpha.700" pl="22px">
                Everything on your plate
              </Text>
            </Box>
          )}

          {/* All Tasks shortcut */}
          <Box
            as="button"
            type="button"
            onClick={handleSelectAllTasks}
            w="100%"
            p={3}
            mb={3}
            textAlign="left"
            borderRadius="lg"
            cursor="pointer"
            border="1px solid"
            borderColor={allTasksMode ? 'purple.300' : 'rgba(159,122,234,0.35)'}
            bgGradient={
              allTasksMode
                ? 'linear(135deg, rgba(159,122,234,0.45) 0%, rgba(66,153,225,0.30) 100%)'
                : 'linear(135deg, rgba(159,122,234,0.22) 0%, rgba(66,153,225,0.14) 100%)'
            }
            _hover={{
              borderColor: 'purple.300',
              bgGradient: 'linear(135deg, rgba(159,122,234,0.35) 0%, rgba(66,153,225,0.22) 100%)',
            }}
            transition="background 0.15s ease, border-color 0.15s ease"
          >
            <HStack spacing={2} mb={0.5}>
              <Icon as={FiLayers} color="whiteAlpha.900" boxSize="14px" />
              <Text fontWeight="700" fontSize="sm" color="white">
                All Tasks
              </Text>
            </HStack>
            <Text fontSize="xs" color="whiteAlpha.700" pl="22px">
              Every project, one view
            </Text>
          </Box>

          {projects.length > 0 && (
            <Flex align="center" gap={2} mb={2} px={1}>
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

          {filteredProjects.length === 0 && projects.length > 0 && (
            <Text fontSize="sm" color="whiteAlpha.600" textAlign="center" py={4}>
              No projects match &ldquo;{query}&rdquo;.
            </Text>
          )}

          <Box>
            {filteredProjects.map((project) => {
              const count = countProjectTasks(project);
              const isSelected = !allTasksMode && project.id === selectedProjectId;
              return (
                <Box
                  key={project.id}
                  as="button"
                  type="button"
                  onClick={() => handleSelectProject(project.id)}
                  w="100%"
                  p={2.5}
                  mb={1.5}
                  textAlign="left"
                  borderRadius="md"
                  cursor="pointer"
                  bg={isSelected ? 'rgba(128, 90, 213, 0.25)' : 'whiteAlpha.100'}
                  borderLeft={isSelected ? '3px solid' : '1px solid'}
                  borderLeftColor={isSelected ? 'purple.300' : 'transparent'}
                  _hover={{ bg: isSelected ? 'rgba(128, 90, 213, 0.30)' : 'whiteAlpha.200' }}
                  transition="background 0.12s ease"
                >
                  <Flex align="center" justify="space-between" gap={2}>
                    <Text
                      fontSize="sm"
                      color="white"
                      fontWeight={isSelected ? '700' : '500'}
                      noOfLines={1}
                      flex="1"
                    >
                      {project.name || project.title}
                    </Text>
                    {count > 0 && (
                      <Badge
                        colorScheme="purple"
                        fontSize="0.65rem"
                        borderRadius="full"
                        px={2}
                      >
                        {count}
                      </Badge>
                    )}
                  </Flex>
                </Box>
              );
            })}
          </Box>
        </DrawerBody>

        <DrawerFooter
          borderTop="1px solid rgba(255, 255, 255, 0.08)"
          px={4}
          py={3}
        >
          <Button
            leftIcon={<AddIcon boxSize={3} />}
            colorScheme="purple"
            size="sm"
            w="100%"
            onClick={handleCreateProject}
          >
            Create new project
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default ProjectSwitcherDrawer;
