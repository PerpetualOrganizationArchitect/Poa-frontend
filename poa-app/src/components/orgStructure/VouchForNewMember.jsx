/**
 * VouchForNewMember - Form to vouch for a user who has 0 vouches
 * Solves the chicken-and-egg problem where users need at least 1 vouch to appear in the UI
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Select,
  Icon,
  IconButton,
  Avatar,
} from '@chakra-ui/react';
import { FiUserPlus, FiX } from 'react-icons/fi';
import { UserSearchInput } from '@/components/common';

/**
 * Truncate an Ethereum address for display
 */
function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * VouchForNewMember component
 * @param {Object} props
 * @param {Array} props.rolesWithVouching - Roles that have vouching enabled
 * @param {Array} props.userHatIds - Current user's hat IDs (to check vouch permission)
 * @param {Function} props.onVouch - Callback: (address, hatId) => Promise
 * @param {boolean} props.isVouching - Whether a vouch is in progress
 * @param {boolean} props.isConnected - Whether wallet is connected
 * @param {Function} props.canUserVouchForRole - Check if user can vouch for a role: (membershipHatId, userHatIds) => boolean
 */
export function VouchForNewMember({
  rolesWithVouching = [],
  userHatIds = [],
  onVouch,
  isVouching = false,
  isConnected = true,
  canUserVouchForRole,
}) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRoleHatId, setSelectedRoleHatId] = useState('');

  // Filter to roles the user can vouch for
  const vouchableRoles = rolesWithVouching.filter(role =>
    canUserVouchForRole?.(role.vouchingMembershipHatId, userHatIds)
  );

  // Auto-select if only one role available
  useEffect(() => {
    if (vouchableRoles.length === 1 && !selectedRoleHatId) {
      setSelectedRoleHatId(vouchableRoles[0].hatId);
    }
  }, [vouchableRoles, selectedRoleHatId]);

  const handleVouch = async () => {
    if (!selectedUser || !selectedRoleHatId || !onVouch) return;

    await onVouch(selectedUser.address, selectedRoleHatId);

    // Reset form after vouch
    setSelectedUser(null);
    // Keep role selected if only one option
    if (vouchableRoles.length !== 1) {
      setSelectedRoleHatId('');
    }
  };

  const canSubmit = selectedUser && selectedRoleHatId && !isVouching && isConnected;

  // Don't render if user can't vouch for any roles
  if (vouchableRoles.length === 0) {
    return null;
  }

  // Find selected role name for button text
  const selectedRole = vouchableRoles.find(r => r.hatId === selectedRoleHatId);

  return (
    <Box
      p={4}
      borderRadius="xl"
      bg="whiteAlpha.50"
      border="1px solid"
      borderColor="whiteAlpha.200"
    >
      <VStack spacing={3} align="stretch">
        {/* Header */}
        <HStack>
          <Icon as={FiUserPlus} color="purple.400" />
          <Text fontWeight="medium" color="white">
            Vouch for a new member
          </Text>
        </HStack>

        {/* User search */}
        <UserSearchInput
          onSelect={setSelectedUser}
          placeholder="Search by username or 0x address..."
          disabled={isVouching}
        />

        {/* Selected user display */}
        {selectedUser && (
          <HStack
            p={2}
            bg="purple.900"
            borderRadius="md"
            justify="space-between"
          >
            <HStack>
              <Avatar
                size="xs"
                name={selectedUser.username || selectedUser.address}
                bg="purple.500"
              />
              <Text color="white" fontSize="sm">
                {selectedUser.username || truncateAddress(selectedUser.address)}
              </Text>
            </HStack>
            <IconButton
              icon={<FiX />}
              size="xs"
              variant="ghost"
              colorScheme="whiteAlpha"
              onClick={() => setSelectedUser(null)}
              aria-label="Clear selection"
              _hover={{ bg: 'whiteAlpha.200' }}
            />
          </HStack>
        )}

        {/* Role selector (only shown if multiple roles available) */}
        {vouchableRoles.length > 1 && (
          <Select
            placeholder="Select role to vouch for..."
            value={selectedRoleHatId}
            onChange={(e) => setSelectedRoleHatId(e.target.value)}
            disabled={isVouching}
            bg="whiteAlpha.50"
            borderColor="whiteAlpha.200"
            color="white"
            _hover={{ borderColor: 'whiteAlpha.300' }}
            sx={{
              '& option': {
                bg: 'gray.800',
                color: 'white',
              },
            }}
          >
            {vouchableRoles.map(role => (
              <option key={role.hatId} value={role.hatId}>
                {role.name} ({role.vouchingQuorum} vouches needed)
              </option>
            ))}
          </Select>
        )}

        {/* Single role indicator */}
        {vouchableRoles.length === 1 && (
          <Text color="gray.400" fontSize="sm">
            Vouching for: <Text as="span" color="white">{vouchableRoles[0].name}</Text>
          </Text>
        )}

        {/* Vouch button */}
        <Button
          colorScheme="purple"
          leftIcon={isVouching ? undefined : <Icon as={FiUserPlus} />}
          isLoading={isVouching}
          loadingText="Vouching..."
          isDisabled={!canSubmit}
          onClick={handleVouch}
        >
          {selectedUser
            ? `Vouch for ${selectedUser.username || truncateAddress(selectedUser.address)}`
            : 'Vouch'}
        </Button>

        {/* Connection warning */}
        {!isConnected && (
          <Text color="gray.500" fontSize="xs" textAlign="center">
            Connect wallet to vouch
          </Text>
        )}
      </VStack>
    </Box>
  );
}

export default VouchForNewMember;
