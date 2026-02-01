/**
 * RoleProgressionCard - Shows roles user is working toward via vouching
 * Displays vouch progress bars and available roles to claim
 */

import React, { useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Icon,
  Badge,
} from '@chakra-ui/react';
import { FiArrowRight, FiStar, FiUsers } from 'react-icons/fi';
import Link from 'next/link';
import { VouchProgressBar } from '@/components/orgStructure/VouchProgressBar';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { normalizeHatId } from '@/utils/profileUtils';

/**
 * Single role progression item
 */
function ProgressionItem({ roleName, current, quorum, isComplete }) {
  return (
    <Box
      w="100%"
      bg="whiteAlpha.50"
      p={3}
      borderRadius="lg"
      _hover={{ bg: 'whiteAlpha.100' }}
      transition="background 0.2s"
    >
      <HStack justify="space-between" mb={2}>
        <HStack spacing={2}>
          <Icon as={FiStar} color="yellow.400" boxSize={4} />
          <Text fontWeight="medium" color="white" fontSize="sm">
            {roleName}
          </Text>
        </HStack>
        {isComplete ? (
          <Badge colorScheme="green" fontSize="xs">
            Ready to Claim!
          </Badge>
        ) : (
          <Text fontSize="xs" color="gray.400">
            {current}/{quorum} vouches
          </Text>
        )}
      </HStack>
      <VouchProgressBar current={current} quorum={quorum} size="sm" showLabel={false} />
    </Box>
  );
}

/**
 * Claimable role item (not requiring vouches)
 */
function ClaimableRoleItem({ role, userDAO }) {
  return (
    <HStack
      bg="whiteAlpha.50"
      p={3}
      borderRadius="lg"
      spacing={3}
      _hover={{ bg: 'whiteAlpha.100' }}
      transition="background 0.2s"
    >
      <Icon as={FiStar} color="purple.300" boxSize={4} />
      <VStack align="start" spacing={0} flex={1}>
        <Text fontWeight="medium" color="white" fontSize="sm">
          {role.name}
        </Text>
        <Text fontSize="xs" color="gray.400">
          Self-claimable
        </Text>
      </VStack>
      <Link href={`/org-structure?userDAO=${userDAO}`} passHref>
        <Button size="xs" colorScheme="purple" variant="outline">
          Claim
        </Button>
      </Link>
    </HStack>
  );
}

/**
 * RoleProgressionCard component
 * @param {Object} props
 * @param {string} props.userAddress - Current user's address
 * @param {string[]} props.userHatIds - User's current hat IDs
 * @param {Object[]} props.roles - All roles from org structure
 * @param {Function} props.getVouchProgress - Function to get vouch progress
 * @param {Object[]} props.pendingVouchRequests - Pending vouch requests
 * @param {string} props.userDAO - DAO identifier for links
 */
export function RoleProgressionCard({
  userAddress,
  userHatIds = [],
  roles = [],
  getVouchProgress,
  pendingVouchRequests = [],
  userDAO,
}) {
  // Find roles user is progressing toward (has vouches but not claimed)
  const vouchProgressData = useMemo(() => {
    if (!userAddress || !roles.length || !getVouchProgress) return [];

    const normalizedUserHatIds = userHatIds.map((id) => normalizeHatId(id));

    // Get roles that require vouching and user doesn't already have
    const rolesWithVouching = roles.filter(
      (role) =>
        role.vouchingEnabled &&
        !normalizedUserHatIds.includes(normalizeHatId(role.hatId))
    );

    // Get vouch progress for each role
    return rolesWithVouching
      .map((role) => {
        const progress = getVouchProgress(userAddress, role.hatId);
        return {
          role,
          current: progress?.current || 0,
          quorum: progress?.quorum || role.vouchingQuorum || 0,
          isComplete: progress?.isComplete || false,
        };
      })
      .filter((item) => item.current > 0) // Only show roles with some progress
      .sort((a, b) => b.current - a.current); // Sort by most progress first
  }, [userAddress, userHatIds, roles, getVouchProgress]);

  // Find self-claimable roles user doesn't have yet
  const claimableRoles = useMemo(() => {
    if (!roles.length) return [];

    const normalizedUserHatIds = userHatIds.map((id) => normalizeHatId(id));

    return roles
      .filter(
        (role) =>
          role.defaultEligible &&
          !role.vouchingEnabled &&
          !normalizedUserHatIds.includes(normalizeHatId(role.hatId))
      )
      .slice(0, 2); // Show max 2 claimable roles
  }, [roles, userHatIds]);

  const hasNoProgress = vouchProgressData.length === 0;
  const hasNoClaimable = claimableRoles.length === 0;
  const showEmptyState = hasNoProgress && hasNoClaimable;

  return (
    <Box
      w="100%"
      borderRadius="2xl"
      bg="transparent"
      boxShadow="lg"
      position="relative"
      zIndex={2}
      p={{ base: 4, md: 5 }}
    >
      <div style={glassLayerStyle} />

      <VStack spacing={4} align="stretch">
        <Text fontSize="xl" fontWeight="bold" color="white">
          Role Progression
        </Text>

        {showEmptyState ? (
          <VStack py={4} spacing={3}>
            <Icon as={FiUsers} color="gray.500" boxSize={8} />
            <Text color="gray.400" textAlign="center" fontSize="sm">
              No roles in progress
            </Text>
            <Link href={`/org-structure?userDAO=${userDAO}`} passHref>
              <Button
                size="sm"
                variant="outline"
                colorScheme="purple"
                rightIcon={<FiArrowRight />}
              >
                Explore Roles
              </Button>
            </Link>
          </VStack>
        ) : (
          <>
            {/* Vouch Progress Section */}
            {vouchProgressData.length > 0 && (
              <VStack spacing={2} align="stretch">
                {vouchProgressData.slice(0, 3).map((item) => (
                  <ProgressionItem
                    key={item.role.hatId}
                    roleName={item.role.name || 'Unknown Role'}
                    current={item.current}
                    quorum={item.quorum}
                    isComplete={item.isComplete}
                  />
                ))}
              </VStack>
            )}

            {/* Claimable Roles Section */}
            {claimableRoles.length > 0 && (
              <>
                {vouchProgressData.length > 0 && (
                  <Text fontSize="sm" color="gray.400" mt={2}>
                    Available to claim:
                  </Text>
                )}
                <VStack spacing={2} align="stretch">
                  {claimableRoles.map((role) => (
                    <ClaimableRoleItem key={role.hatId} role={role} userDAO={userDAO} />
                  ))}
                </VStack>
              </>
            )}

            <Link href={`/org-structure?userDAO=${userDAO}`} passHref>
              <Button
                size="sm"
                variant="ghost"
                colorScheme="purple"
                rightIcon={<FiArrowRight />}
                alignSelf="flex-start"
              >
                View All Roles
              </Button>
            </Link>
          </>
        )}
      </VStack>
    </Box>
  );
}

export default RoleProgressionCard;
