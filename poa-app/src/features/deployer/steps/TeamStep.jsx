/**
 * TeamStep - Simplified roles configuration
 *
 * Displays roles from the selected template with simplified editing.
 * Advanced configuration (hierarchy, vouching, hat config) is hidden in Simple mode.
 */

import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  SimpleGrid,
  Card,
  CardBody,
  Badge,
  Button,
  IconButton,
  Input,
  FormControl,
  FormLabel,
  Select,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Collapse,
  useDisclosure,
  useColorModeValue,
  useToast,
  Tooltip,
} from '@chakra-ui/react';
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@chakra-ui/icons';
import { useDeployer, UI_MODES } from '../context/DeployerContext';
import { StepHeader, NavigationButtons } from '../components/common';
import { describePowers } from '../utils/powerBundles';

// Join method options
const JOIN_METHODS = {
  OPEN: 'open',
  INVITATION: 'invitation',
  VOUCHING: 'vouching',
};

function RoleCard({ role, index, roles, onEdit, onDelete, permissions, isSimpleMode }) {
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const helperColor = useColorModeValue('gray.500', 'gray.400');

  const isTopLevel = role.hierarchy.adminRoleIndex === null;
  const parentRole = !isTopLevel && roles[role.hierarchy.adminRoleIndex];
  const powersDescription = describePowers(permissions, index);

  // Determine join method
  const getJoinMethod = () => {
    if (role.vouching.enabled) return 'Vouching';
    if (permissions.quickJoinRoles?.includes(index)) return 'Open';
    return 'Invitation';
  };

  return (
    <Card
      bg={cardBg}
      borderWidth="1px"
      borderColor={borderColor}
      position="relative"
    >
      <CardBody>
        <VStack align="stretch" spacing={3}>
          {/* Header */}
          <HStack justify="space-between">
            <HStack spacing={2}>
              <Text fontWeight="bold" fontSize="lg">
                {role.name}
              </Text>
              {isTopLevel && (
                <Badge colorScheme="purple" fontSize="xs">
                  Leader
                </Badge>
              )}
            </HStack>
            <HStack>
              <IconButton
                icon={<EditIcon />}
                size="sm"
                variant="ghost"
                onClick={() => onEdit(index)}
                aria-label="Edit role"
              />
              {roles.length > 2 && (
                <IconButton
                  icon={<DeleteIcon />}
                  size="sm"
                  variant="ghost"
                  colorScheme="red"
                  onClick={() => onDelete(index)}
                  aria-label="Delete role"
                />
              )}
            </HStack>
          </HStack>

          {/* Powers */}
          <Box>
            <Text fontSize="xs" color={helperColor}>
              Powers
            </Text>
            <Text fontSize="sm">{powersDescription}</Text>
          </Box>

          {/* Join Method */}
          <Box>
            <Text fontSize="xs" color={helperColor}>
              How members join
            </Text>
            <Badge
              colorScheme={
                getJoinMethod() === 'Open'
                  ? 'green'
                  : getJoinMethod() === 'Vouching'
                  ? 'orange'
                  : 'blue'
              }
            >
              {getJoinMethod()}
            </Badge>
          </Box>

          {/* Managed By (if not top-level) */}
          {!isTopLevel && parentRole && (
            <Box>
              <Text fontSize="xs" color={helperColor}>
                Managed by
              </Text>
              <Text fontSize="sm">{parentRole.name}</Text>
            </Box>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
}

function EditRoleModal({
  isOpen,
  onClose,
  role,
  roleIndex,
  roles,
  onSave,
  permissions,
  isSimpleMode,
}) {
  const [editedRole, setEditedRole] = useState(role);
  const [joinMethod, setJoinMethod] = useState(
    role.vouching.enabled
      ? JOIN_METHODS.VOUCHING
      : permissions.quickJoinRoles?.includes(roleIndex)
      ? JOIN_METHODS.OPEN
      : JOIN_METHODS.INVITATION
  );

  const { isOpen: isAdvancedOpen, onToggle: toggleAdvanced } = useDisclosure();

  const helperColor = useColorModeValue('gray.500', 'gray.400');

  const handleSave = () => {
    // Build updated role based on join method
    const updatedRole = {
      ...editedRole,
      vouching: {
        ...editedRole.vouching,
        enabled: joinMethod === JOIN_METHODS.VOUCHING,
        quorum: joinMethod === JOIN_METHODS.VOUCHING ? (editedRole.vouching.quorum || 1) : 0,
      },
    };

    onSave(roleIndex, updatedRole, joinMethod);
    onClose();
  };

  const otherRoles = roles.filter((_, i) => i !== roleIndex);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Edit Role: {role.name}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Role Name */}
            <FormControl>
              <FormLabel>Role Name</FormLabel>
              <Input
                value={editedRole.name}
                onChange={(e) =>
                  setEditedRole({ ...editedRole, name: e.target.value })
                }
                placeholder="Enter role name"
              />
            </FormControl>

            {/* Join Method */}
            <FormControl>
              <FormLabel>How do new members join?</FormLabel>
              <Select
                value={joinMethod}
                onChange={(e) => setJoinMethod(e.target.value)}
              >
                <option value={JOIN_METHODS.OPEN}>
                  Open - Anyone can join instantly
                </option>
                <option value={JOIN_METHODS.INVITATION}>
                  Invitation - Requires approval from leaders
                </option>
                <option value={JOIN_METHODS.VOUCHING}>
                  Vouching - Requires vouches from existing members
                </option>
              </Select>
            </FormControl>

            {/* Vouching Options */}
            {joinMethod === JOIN_METHODS.VOUCHING && (
              <Box pl={4} borderLeftWidth="2px" borderColor="orange.300">
                <VStack spacing={3} align="stretch">
                  <FormControl>
                    <FormLabel fontSize="sm">How many vouches needed?</FormLabel>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={editedRole.vouching.quorum || 1}
                      onChange={(e) =>
                        setEditedRole({
                          ...editedRole,
                          vouching: {
                            ...editedRole.vouching,
                            quorum: parseInt(e.target.value) || 1,
                          },
                        })
                      }
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="sm">Who can vouch?</FormLabel>
                    <Select
                      value={editedRole.vouching.voucherRoleIndex}
                      onChange={(e) =>
                        setEditedRole({
                          ...editedRole,
                          vouching: {
                            ...editedRole.vouching,
                            voucherRoleIndex: parseInt(e.target.value),
                          },
                        })
                      }
                    >
                      {roles.map((r, i) => (
                        <option key={r.id || i} value={i}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </VStack>
              </Box>
            )}

            {/* Managed By */}
            <FormControl>
              <FormLabel>Managed by (optional)</FormLabel>
              <Select
                value={
                  editedRole.hierarchy.adminRoleIndex === null
                    ? ''
                    : editedRole.hierarchy.adminRoleIndex
                }
                onChange={(e) =>
                  setEditedRole({
                    ...editedRole,
                    hierarchy: {
                      ...editedRole.hierarchy,
                      adminRoleIndex:
                        e.target.value === '' ? null : parseInt(e.target.value),
                    },
                  })
                }
              >
                <option value="">No one (top-level leader)</option>
                {otherRoles.map((r, i) => {
                  const actualIndex = roles.findIndex((role) => role.id === r.id);
                  return (
                    <option key={r.id || i} value={actualIndex}>
                      {r.name}
                    </option>
                  );
                })}
              </Select>
            </FormControl>

            {/* Advanced Options (collapsed in Simple mode) */}
            {isSimpleMode && (
              <Box>
                <Button
                  variant="ghost"
                  size="sm"
                  rightIcon={
                    isAdvancedOpen ? <ChevronUpIcon /> : <ChevronDownIcon />
                  }
                  onClick={toggleAdvanced}
                  color={helperColor}
                >
                  {isAdvancedOpen ? 'Hide' : 'Show'} advanced options
                </Button>

                <Collapse in={isAdvancedOpen} animateOpacity>
                  <Box mt={4} p={4} bg="gray.50" borderRadius="md">
                    <VStack spacing={3} align="stretch">
                      <FormControl>
                        <FormLabel fontSize="sm">Max members</FormLabel>
                        <Input
                          type="number"
                          min={1}
                          value={editedRole.hatConfig.maxSupply}
                          onChange={(e) =>
                            setEditedRole({
                              ...editedRole,
                              hatConfig: {
                                ...editedRole.hatConfig,
                                maxSupply: parseInt(e.target.value) || 1000,
                              },
                            })
                          }
                        />
                      </FormControl>
                    </VStack>
                  </Box>
                </Collapse>
              </Box>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button colorScheme="blue" onClick={handleSave}>
            Save Changes
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function TeamStep() {
  const { state, actions, selectors } = useDeployer();
  const toast = useToast();

  const [editingRoleIndex, setEditingRoleIndex] = useState(null);
  const { isOpen: isEditModalOpen, onOpen: openEditModal, onClose: closeEditModal } = useDisclosure();

  const isSimpleMode = selectors.isSimpleMode();
  const selectedTemplate = selectors.getSelectedTemplate();

  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const helperColor = useColorModeValue('gray.600', 'gray.400');

  const { roles, permissions } = state;

  const handleEditRole = (index) => {
    setEditingRoleIndex(index);
    openEditModal();
  };

  const handleDeleteRole = (index) => {
    if (roles.length <= 2) {
      toast({
        title: 'Cannot delete',
        description: 'You need at least 2 roles.',
        status: 'warning',
        duration: 3000,
      });
      return;
    }
    actions.removeRole(index);
  };

  const handleSaveRole = (index, updatedRole, joinMethod) => {
    actions.updateRole(index, updatedRole);

    // Update quick join permission based on join method
    if (joinMethod === JOIN_METHODS.OPEN) {
      if (!permissions.quickJoinRoles.includes(index)) {
        actions.setPermissionRoles('quickJoinRoles', [
          ...permissions.quickJoinRoles,
          index,
        ]);
      }
    } else {
      actions.setPermissionRoles(
        'quickJoinRoles',
        permissions.quickJoinRoles.filter((i) => i !== index)
      );
    }
  };

  const handleAddRole = () => {
    actions.addRole('New Role');
    toast({
      title: 'Role added',
      description: 'Click to edit the new role.',
      status: 'success',
      duration: 2000,
    });
  };

  const handleNext = () => {
    // Validate roles
    if (roles.length === 0) {
      toast({
        title: 'Add at least one role',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    // Check for at least one top-level role
    const hasTopLevel = roles.some((r) => r.hierarchy.adminRoleIndex === null);
    if (!hasTopLevel) {
      toast({
        title: 'Need a leader role',
        description: 'At least one role must have no manager (top-level).',
        status: 'warning',
        duration: 4000,
      });
      return;
    }

    actions.nextStep();
  };

  const handleBack = () => {
    actions.prevStep();
  };

  const guidanceText = selectedTemplate?.ui?.guidanceText?.team;

  return (
    <>
      <StepHeader
        title="Build Your Team"
        description={
          guidanceText ||
          'Define the roles in your organization. Each role can have different powers and join requirements.'
        }
      />

      <VStack spacing={6} align="stretch">
        {/* Role Cards */}
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {roles.map((role, index) => (
            <RoleCard
              key={role.id || index}
              role={role}
              index={index}
              roles={roles}
              permissions={permissions}
              onEdit={handleEditRole}
              onDelete={handleDeleteRole}
              isSimpleMode={isSimpleMode}
            />
          ))}

          {/* Add Role Card */}
          <Card
            bg="transparent"
            borderWidth="2px"
            borderStyle="dashed"
            borderColor={borderColor}
            cursor="pointer"
            onClick={handleAddRole}
            _hover={{ borderColor: 'blue.300', bg: 'blue.50' }}
            transition="all 0.2s"
          >
            <CardBody
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              minH="150px"
            >
              <AddIcon boxSize={6} color="gray.400" mb={2} />
              <Text color={helperColor}>Add Role</Text>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* Summary */}
        <Box bg="gray.50" p={4} borderRadius="md">
          <HStack spacing={4}>
            <Text fontSize="sm" color={helperColor}>
              {roles.length} role{roles.length !== 1 ? 's' : ''} configured
            </Text>
            <Badge colorScheme="green">
              {roles.filter((r) => r.hierarchy.adminRoleIndex === null).length} leader
              {roles.filter((r) => r.hierarchy.adminRoleIndex === null).length !== 1
                ? 's'
                : ''}
            </Badge>
          </HStack>
        </Box>

        {/* Navigation */}
        <NavigationButtons
          onBack={handleBack}
          onNext={handleNext}
          nextLabel="Continue"
        />
      </VStack>

      {/* Edit Modal */}
      {editingRoleIndex !== null && (
        <EditRoleModal
          isOpen={isEditModalOpen}
          onClose={() => {
            closeEditModal();
            setEditingRoleIndex(null);
          }}
          role={roles[editingRoleIndex]}
          roleIndex={editingRoleIndex}
          roles={roles}
          permissions={permissions}
          onSave={handleSaveRole}
          isSimpleMode={isSimpleMode}
        />
      )}
    </>
  );
}

export default TeamStep;
