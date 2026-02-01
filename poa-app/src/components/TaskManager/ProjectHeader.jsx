/**
 * ProjectHeader
 * Header bar showing project name with sidebar toggle and project info
 */

import { useState, useEffect } from 'react';
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
  Spinner,
  VStack,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import { FaProjectDiagram } from 'react-icons/fa';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { useIPFScontext } from '@/context/ipfsContext';

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
  const { safeFetchFromIpfs } = useIPFScontext();

  const [projectDescription, setProjectDescription] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch project description from IPFS when modal opens
  useEffect(() => {
    const fetchDescription = async () => {
      if (!isOpen || !selectedProject?.metadataHash) {
        setProjectDescription(null);
        return;
      }

      setIsLoading(true);
      try {
        const metadata = await safeFetchFromIpfs(selectedProject.metadataHash);
        if (metadata?.description) {
          setProjectDescription(metadata.description);
        } else {
          setProjectDescription(null);
        }
      } catch (error) {
        console.error('[ProjectHeader] Failed to fetch project metadata:', error);
        setProjectDescription(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDescription();
  }, [isOpen, selectedProject?.metadataHash, safeFetchFromIpfs]);

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
                {isLoading ? (
                  <Flex align="center" gap={2}>
                    <Spinner size="sm" />
                    <Text color="gray.400">Loading description...</Text>
                  </Flex>
                ) : projectDescription ? (
                  <Text style={{ whiteSpace: 'pre-wrap' }} lineHeight="1.6">
                    {projectDescription}
                  </Text>
                ) : (
                  <Text color="gray.400" fontStyle="italic">
                    No description available for this project.
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
