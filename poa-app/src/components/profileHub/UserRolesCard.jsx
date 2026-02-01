/**
 * UserRolesCard - Display user's current Hats Protocol roles
 * Shows role names, icons, and permission badges
 */

import React, { useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  Button,
  Tooltip,
} from '@chakra-ui/react';
import { FiShield, FiUsers, FiArrowRight } from 'react-icons/fi';
import Link from 'next/link';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { normalizeHatId, getPermissionBadges } from '@/utils/profileUtils';

/**
 * Single role display card
 */
function RoleCard({ role }) {
  const permissionBadges = getPermissionBadges(role.permissions);

  return (
    <HStack
      bg="whiteAlpha.50"
      p={3}
      borderRadius="lg"
      spacing={3}
      _hover={{ bg: 'whiteAlpha.100' }}
      transition="background 0.2s"
    >
      <Icon as={FiShield} color="purple.300" boxSize={5} />
      <VStack align="start" spacing={1} flex={1}>
        <Text fontWeight="medium" color="white" fontSize="sm">
          {role.name || 'Unnamed Role'}
        </Text>
        {permissionBadges.length > 0 && (
          <HStack spacing={1} flexWrap="wrap">
            {permissionBadges.slice(0, 3).map((badge) => (
              <Badge
                key={badge.label}
                colorScheme={badge.colorScheme}
                fontSize="xs"
                px={1.5}
                py={0}
              >
                {badge.label}
              </Badge>
            ))}
          </HStack>
        )}
      </VStack>
      {role.memberCount !== undefined && (
        <Tooltip label={`${role.memberCount} members with this role`}>
          <HStack spacing={1} color="gray.400">
            <Icon as={FiUsers} boxSize={3} />
            <Text fontSize="xs">{role.memberCount}</Text>
          </HStack>
        </Tooltip>
      )}
    </HStack>
  );
}

/**
 * UserRolesCard component
 * @param {Object} props
 * @param {string[]} props.userHatIds - User's current hat IDs
 * @param {Object[]} props.roles - All roles from org structure
 * @param {Object} props.permissionsMatrix - Permissions matrix from org structure
 * @param {string} props.userDAO - DAO identifier for links
 */
export function UserRolesCard({ userHatIds = [], roles = [], permissionsMatrix, userDAO }) {

  // Filter roles to get only the ones the user has
  const userRoles = useMemo(() => {
    if (!userHatIds.length || !roles.length) return [];

    const normalizedUserHatIds = userHatIds.map((id) => normalizeHatId(id));

    return roles.filter((role) => {
      const normalizedRoleHatId = normalizeHatId(role.hatId);
      return normalizedUserHatIds.includes(normalizedRoleHatId);
    });
  }, [userHatIds, roles]);

  const hasNoRoles = userRoles.length === 0;

  return (
    <Box
      w="100%"
      borderRadius="2xl"
      bg="transparent"
      boxShadow="lg"
      position="relative"
      zIndex={2}
    >
      <div style={glassLayerStyle} />

      {/* Darker header section */}
      <VStack pb={2} align="flex-start" position="relative" borderTopRadius="2xl">
        <div style={glassLayerStyle} />
        <Text pl={6} pt={2} fontWeight="bold" fontSize={{ base: 'xl', md: '2xl' }} color="white">
          Your Roles
        </Text>
      </VStack>

      {/* Content */}
      <VStack spacing={4} align="stretch" p={4} pt={2}>
        {hasNoRoles ? (
          <VStack py={4} spacing={3}>
            <Text color="gray.400" textAlign="center">
              You haven't claimed any roles yet
            </Text>
            <Link href={`/org-structure?userDAO=${userDAO}`} passHref>
              <Button
                size="sm"
                variant="outline"
                colorScheme="purple"
                rightIcon={<FiArrowRight />}
              >
                Claim Your First Role
              </Button>
            </Link>
          </VStack>
        ) : (
          <>
            <VStack spacing={2} align="stretch">
              {userRoles.slice(0, 4).map((role) => (
                <RoleCard key={role.hatId || role.id} role={role} />
              ))}
            </VStack>

            {userRoles.length > 4 && (
              <Text fontSize="xs" color="gray.400" textAlign="center">
                + {userRoles.length - 4} more roles
              </Text>
            )}

            <Link href={`/org-structure?userDAO=${userDAO}`} passHref>
              <Button
                size="sm"
                variant="ghost"
                colorScheme="purple"
                rightIcon={<FiArrowRight />}
                alignSelf="flex-start"
              >
                Browse All Roles
              </Button>
            </Link>
          </>
        )}
      </VStack>
    </Box>
  );
}

export default UserRolesCard;
