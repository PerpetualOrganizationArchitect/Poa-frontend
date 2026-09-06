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
} from '@chakra-ui/react';
import { FiArrowRight, FiCheck } from 'react-icons/fi';
import Link from 'next/link';
import { VouchProgressBar } from '@/components/orgStructure/VouchProgressBar';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { normalizeHatId } from '@/utils/profileUtils';

/**
 * Helper function to check if there's any role progression content to display
 * Used by parent to conditionally render this card vs recommended tasks
 * @param {string} userAddress - User's address
 * @param {string[]} userHatIds - User's current hat IDs
 * @param {Object[]} roles - All roles from org structure
 * @param {Function} getVouchProgress - Function to get vouch progress
 * @returns {boolean} - Whether there's content to display
 */
export function hasRoleProgressionContent(userAddress, userHatIds = [], roles = [], getVouchProgress) {
  if (!userAddress || !roles?.length) return false;

  const normalizedUserHatIds = userHatIds.map((id) => normalizeHatId(id));

  // Check for vouch progress
  const hasVouchProgress = roles.some((role) => {
    if (!role.vouchingEnabled) return false;
    if (normalizedUserHatIds.includes(normalizeHatId(role.hatId))) return false;
    if (!getVouchProgress) return false;
    const progress = getVouchProgress(userAddress, role.hatId);
    return progress?.current > 0;
  });

  if (hasVouchProgress) return true;

  // Check for claimable roles
  const hasClaimable = roles.some(
    (role) =>
      role.defaultEligible &&
      !role.vouchingEnabled &&
      !normalizedUserHatIds.includes(normalizeHatId(role.hatId))
  );

  return hasClaimable;
}

/**
 * Single role progression item
 */
function ProgressionItem({ roleName, current, quorum, isComplete }) {
  return (
    <Box w="100%" py={3}>
      <VStack align="stretch" spacing={1} mb={3}>
        <Text fontWeight="medium" color="white" fontSize="sm" overflowWrap="anywhere">
          {roleName}
        </Text>
        {isComplete ? (
          <HStack spacing={1} color="green.300">
            <Icon as={FiCheck} boxSize={3} />
            <Text fontSize="xs">Ready to join</Text>
          </HStack>
        ) : (
          <Text fontSize="xs" color="gray.400">
            {current} of {quorum} endorsements
          </Text>
        )}
      </VStack>
      <VouchProgressBar current={current} quorum={quorum} size="sm" showLabel={false} />
    </Box>
  );
}

/**
 * Claimable role item (not requiring vouches)
 */
function ClaimableRoleItem({ role, userDAO }) {
  return (
    <HStack py={3} spacing={3}>
      <VStack align="start" spacing={1} flex={1} minW={0}>
        <Text fontWeight="medium" color="white" fontSize="sm" overflowWrap="anywhere">
          {role.name}
        </Text>
        <Text fontSize="xs" color="gray.400">
          {role.claimLabel || 'Available to join'}
        </Text>
      </VStack>
      <Button
        as={Link}
        href={`/team?org=${encodeURIComponent(userDAO)}`}
        size="sm"
        color="purple.200"
        variant="ghost"
        fontWeight="medium"
        flexShrink={0}
        aria-label={`View ${role.name || 'role'}`}
      >
        View
      </Button>
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
 * @param {Object[]} [props.progressionItems] - Explicit v2 fold-mirror progression rows
 * @param {Object[]} [props.claimableRoleItems] - Explicit v2 claimable role rows
 * @param {string} props.userDAO - DAO identifier for links
 */
export function RoleProgressionCard({
  userAddress,
  userHatIds = [],
  roles = [],
  getVouchProgress,
  progressionItems,
  claimableRoleItems,
  userDAO,
}) {
  // Find roles user is progressing toward (has vouches but not claimed)
  const vouchProgressData = useMemo(() => {
    if (Array.isArray(progressionItems)) return progressionItems;
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
  }, [progressionItems, userAddress, userHatIds, roles, getVouchProgress]);

  // Find self-claimable roles user doesn't have yet
  const claimableRoles = useMemo(() => {
    if (Array.isArray(claimableRoleItems)) return claimableRoleItems.slice(0, 2);
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
  }, [claimableRoleItems, roles, userHatIds]);

  const hasNoProgress = vouchProgressData.length === 0;
  const hasNoClaimable = claimableRoles.length === 0;
  const showEmptyState = hasNoProgress && hasNoClaimable;

  return (
    <Box
      as="section"
      aria-label="Role opportunities"
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
          Role opportunities
        </Text>
        {showEmptyState ? (
          <VStack align="stretch" spacing={4}>
            <Text color="gray.400" fontSize="sm" lineHeight="tall">
              Discover more ways to contribute to your team.
            </Text>
            <Button
              as={Link}
              href={`/team?org=${encodeURIComponent(userDAO)}`}
              size="sm"
              variant="link"
              color="purple.200"
              alignSelf="flex-start"
              fontWeight="medium"
              rightIcon={<FiArrowRight />}
            >
              Explore roles
            </Button>
          </VStack>
        ) : (
          <>
            {/* Vouch Progress Section */}
            {vouchProgressData.length > 0 && (
              <VStack
                spacing={0}
                align="stretch"
                sx={{ '& > * + *': { borderTop: '1px solid', borderColor: 'whiteAlpha.100' } }}
              >
                {vouchProgressData.slice(0, 3).map((item) => (
                  <ProgressionItem
                    key={item.role.hatId}
                    roleName={item.role.name || 'Unnamed role'}
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
                  <Text fontSize="xs" color="gray.400" pt={3} borderTop="1px solid" borderColor="whiteAlpha.100">
                    Available to join
                  </Text>
                )}
                <VStack
                  spacing={0}
                  align="stretch"
                  sx={{ '& > * + *': { borderTop: '1px solid', borderColor: 'whiteAlpha.100' } }}
                >
                  {claimableRoles.map((role) => (
                    <ClaimableRoleItem key={role.hatId} role={role} userDAO={userDAO} />
                  ))}
                </VStack>
              </>
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
            >
              Explore roles
            </Button>
          </>
        )}
      </VStack>
    </Box>
  );
}

export default RoleProgressionCard;
