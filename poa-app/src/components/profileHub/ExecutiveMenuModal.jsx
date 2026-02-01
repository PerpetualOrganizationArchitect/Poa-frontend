/**
 * ExecutiveMenuModal - Administrative actions for executive role holders
 * Includes token request approvals and executive role management
 */

import React, { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Button,
  VStack,
  HStack,
  Text,
  Box,
  Divider,
  Icon,
  Badge,
  Collapse,
  useToast,
} from '@chakra-ui/react';
import { FiShield, FiUsers, FiCheck, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { PendingRequestsPanel } from '@/components/tokenRequest';
import { glassLayerDarkStyle } from '@/components/shared/glassStyles';

/**
 * Menu section with collapsible content
 */
function MenuSection({ icon, title, badge, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Box
      bg="whiteAlpha.50"
      borderRadius="xl"
      overflow="hidden"
    >
      <HStack
        p={4}
        cursor="pointer"
        onClick={() => setIsOpen(!isOpen)}
        _hover={{ bg: 'whiteAlpha.100' }}
        transition="background 0.2s"
        justify="space-between"
      >
        <HStack spacing={3}>
          <Icon as={icon} color="purple.300" boxSize={5} />
          <Text fontWeight="semibold" color="white">
            {title}
          </Text>
          {badge && (
            <Badge colorScheme="purple" fontSize="xs">
              {badge}
            </Badge>
          )}
        </HStack>
        <Icon
          as={isOpen ? FiChevronUp : FiChevronDown}
          color="gray.400"
          boxSize={5}
        />
      </HStack>
      <Collapse in={isOpen}>
        <Box p={4} pt={0}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * ExecutiveMenuModal component
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {() => void} props.onClose - Close handler
 * @param {boolean} props.hasApproverRole - Whether user can approve token requests
 */
const ExecutiveMenuModal = ({ isOpen, onClose, hasApproverRole = false }) => {
  const toast = useToast();

  const handleGrantRole = () => {
    toast({
      title: "Coming Soon",
      description: "Role management through governance proposals will be available in a future update",
      status: "info",
      duration: 4000,
      isClosable: true,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(8px)" />
      <ModalContent
        bg="transparent"
        boxShadow="2xl"
        borderRadius="2xl"
        mx={4}
        position="relative"
        overflow="hidden"
      >
        <div style={glassLayerDarkStyle} />

        {/* Header */}
        <ModalHeader
          color="white"
          fontSize="2xl"
          fontWeight="bold"
          pb={2}
          position="relative"
        >
          <HStack spacing={3}>
            <Icon as={FiShield} color="teal.300" />
            <Text>Executive Menu</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody pb={6} position="relative">
          <VStack spacing={4} align="stretch">
            {/* Description */}
            <Text fontSize="sm" color="gray.400">
              Manage organization settings and approve requests
            </Text>

            <Divider borderColor="whiteAlpha.200" />

            {/* Token Request Approvals - only show if user has approver role */}
            {hasApproverRole && (
              <MenuSection
                icon={FiCheck}
                title="Token Request Approvals"
                defaultOpen={true}
              >
                <Box mt={2}>
                  <PendingRequestsPanel />
                </Box>
              </MenuSection>
            )}

            {/* Role Management */}
            <MenuSection
              icon={FiUsers}
              title="Role Management"
            >
              <VStack spacing={3} align="stretch" mt={2}>
                <Text fontSize="sm" color="gray.400">
                  Roles are managed via Hats Protocol. Some roles can be claimed directly,
                  while others require vouches from existing members.
                </Text>
                <Button
                  size="sm"
                  colorScheme="purple"
                  variant="outline"
                  onClick={handleGrantRole}
                  leftIcon={<FiUsers />}
                >
                  Create Role Proposal
                </Button>
              </VStack>
            </MenuSection>

            {/* Quick Stats */}
            <Box
              bg="whiteAlpha.50"
              borderRadius="xl"
              p={4}
            >
              <Text fontSize="xs" color="gray.500" textTransform="uppercase" mb={2}>
                Executive Actions Available
              </Text>
              <HStack spacing={4} flexWrap="wrap">
                {hasApproverRole && (
                  <Badge colorScheme="green" px={2} py={1}>
                    Token Approvals
                  </Badge>
                )}
                <Badge colorScheme="purple" px={2} py={1}>
                  Role Proposals
                </Badge>
                <Badge colorScheme="blue" px={2} py={1}>
                  Org Settings
                </Badge>
              </HStack>
            </Box>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ExecutiveMenuModal;
