/**
 * ProjectHeader
 * Header bar showing project name with sidebar toggle and project info
 */

import {
  Box,
  Flex,
  Text,
  IconButton,
  Tooltip,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import { FaProjectDiagram } from 'react-icons/fa';
import { useDataBaseContext } from '@/context/dataBaseContext';

const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backdropFilter: "blur(9px)",
  backgroundColor: "rgba(33, 33, 33, 0.97)",
};

const ProjectHeader = ({ projectName, sidebarVisible, toggleSidebar }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { selectedProject } = useDataBaseContext();

  // Use indexed description from subgraph (no IPFS fetching needed)
  const projectDescription = selectedProject?.description || '';
  // Cap of 0 means unlimited/no budget
  const projectBudget = selectedProject?.cap ? Number(selectedProject.cap) : 0;

  return (
    <>
      <Box
        bg="purple.300"
        w="100%"
        p={2}
        height="auto"
      >
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
                  _hover={{
                    bg: "blackAlpha.200",
                    transform: "scale(1.1)"
                  }}
                  transition="all 0.2s"
                />
              </Tooltip>
            )}
            <Text
              fontSize="2xl"
              fontWeight="bold"
              color="black"
              lineHeight="normal"
            >
              {projectName}
            </Text>
            <Tooltip label="View project info" placement="right" hasArrow>
              <IconButton
                aria-label="View project info"
                icon={<InfoIcon />}
                size="sm"
                variant="ghost"
                colorScheme="blackAlpha"
                ml={2}
                onClick={onOpen}
                _hover={{
                  bg: "blackAlpha.200",
                  transform: "scale(1.1)"
                }}
                transition="all 0.2s"
              />
            </Tooltip>
          </Flex>
        </Flex>
      </Box>

      {/* Project Info Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent bg="transparent" textColor="white">
          <div style={glassLayerStyle} />
          <ModalHeader borderTopRadius="md">{projectName}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack align="start" spacing={4}>
              <Box w="100%">
                <Text fontWeight="bold" mb={2} color="gray.300">
                  Description
                </Text>
                {projectDescription ? (
                  <Text style={{ whiteSpace: 'pre-wrap' }} lineHeight="1.6">
                    {projectDescription}
                  </Text>
                ) : (
                  <Text color="gray.400" fontStyle="italic">
                    No description available for this project.
                  </Text>
                )}
              </Box>
              <Box w="100%">
                <Text fontWeight="bold" mb={2} color="gray.300">
                  Budget
                </Text>
                {projectBudget > 0 ? (
                  <Text>
                    {projectBudget.toLocaleString()} PT
                  </Text>
                ) : (
                  <Text color="gray.400" fontStyle="italic">
                    No budget
                  </Text>
                )}
              </Box>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ProjectHeader;
