/** UserRolesCard — the user's roles and a quiet summary of their access. */

import React, { useMemo } from 'react';
import { Box, VStack, HStack, Text, Icon, Button } from '@chakra-ui/react';
import { FiShield, FiArrowRight } from 'react-icons/fi';
import Link from 'next/link';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { normalizeHatId, getPermissionBadges } from '@/utils/profileUtils';

function RoleCard({ role }) {
  const permissionBadges = getPermissionBadges(role.permissions);

  return (
    <HStack spacing={3} py={2.5} align="start">
      <Icon as={FiShield} color="purple.300" boxSize={4} mt={1} flexShrink={0} />
      <VStack align="start" spacing={1} flex={1} minW={0}>
        <Text fontWeight="medium" color="white" fontSize="sm" overflowWrap="anywhere">
          {role.name || 'Unnamed role'}
        </Text>
        {permissionBadges.length > 0 && (
          <Text fontSize="xs" color="gray.400" lineHeight="tall">
            {permissionBadges.map((badge) => badge.label).join(' · ')}
          </Text>
        )}
      </VStack>
    </HStack>
  );
}

export function UserRolesCard({ userHatIds = [], roles = [], userDAO }) {
  const userRoles = useMemo(() => {
    if (!userHatIds.length || !roles.length) return [];

    const normalizedUserHatIds = userHatIds.map((id) => normalizeHatId(id));

    return roles.filter((role) => {
      const normalizedRoleHatId = normalizeHatId(role.hatId);
      return normalizedUserHatIds.includes(normalizedRoleHatId);
    });
  }, [userHatIds, roles]);

  return (
    <Box
      as="section"
      aria-label="Your roles"
      w="100%"
      borderRadius="2xl"
      border="1px solid"
      borderColor="whiteAlpha.100"
      position="relative"
      zIndex={2}
    >
      <div style={glassLayerStyle} />
      <VStack spacing={4} align="stretch" p={{ base: 5, md: 6 }}>
        <Text as="h2" fontWeight="semibold" fontSize="lg" color="white" letterSpacing="-0.02em">
          Your roles
        </Text>

        {userRoles.length === 0 ? (
          <Text color="gray.400" fontSize="sm" lineHeight="tall">
            Join a role to find your place in the team.
          </Text>
        ) : (
          <VStack
            spacing={0}
            align="stretch"
            sx={{ '& > * + *': { borderTop: '1px solid', borderColor: 'whiteAlpha.100' } }}
          >
            {userRoles.slice(0, 4).map((role) => (
              <RoleCard key={role.hatId || role.id} role={role} />
            ))}
            {userRoles.length > 4 && (
              <Text fontSize="xs" color="gray.400" pt={3}>
                And {userRoles.length - 4} more {userRoles.length - 4 === 1 ? 'role' : 'roles'}
              </Text>
            )}
          </VStack>
        )}

        <Button
          as={Link}
          href={`/team?org=${encodeURIComponent(userDAO)}`}
          size="sm"
          variant="link"
          color="purple.200"
          rightIcon={<FiArrowRight />}
          alignSelf="flex-start"
          fontWeight="medium"
          whiteSpace="normal"
        >
          {userRoles.length === 0 ? 'Explore roles' : 'View team & roles'}
        </Button>
      </VStack>
    </Box>
  );
}

export default UserRolesCard;
