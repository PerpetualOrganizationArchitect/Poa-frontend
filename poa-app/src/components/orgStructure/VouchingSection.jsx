/**
 * VouchingSection - Main container for vouching UI
 * Groups pending vouch requests by role with accordion pattern
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  Collapse,
  Skeleton,
  Grid,
  Alert,
  AlertIcon,
  Divider,
} from '@chakra-ui/react';
import {
  FiChevronDown,
  FiChevronRight,
  FiUserPlus,
  FiUsers,
  FiInfo,
} from 'react-icons/fi';
import { useVouches } from '@/hooks/useVouches';
import { useClaimRole } from '@/hooks/useClaimRole';
import { lightSectionStyle, lightCardStyle } from '@/components/shared/glassStyles';
import { VouchRequestCard } from './VouchRequestCard';
import { VouchForNewMember } from './VouchForNewMember';

/**
 * Role accordion item for vouch requests
 */
function RoleVouchAccordion({
  roleData,
  userHatIds = [],
  userAddress,
  hasUserVouched,
  canUserVouchForRole,
  onVouch,
  onRevokeVouch,
  isVouchingFor,
  isRevokingFor,
  isConnected,
  defaultExpanded = false,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const { hatId, roleName, quorum, requests = [] } = roleData;

  // Find the membership hat required to vouch for this role
  const membershipHatId = requests[0]?.membershipHatId;
  const canVouch = canUserVouchForRole(membershipHatId, userHatIds);

  const handleToggle = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  return (
    <Box
      {...lightCardStyle}
      overflow="hidden"
      mb={3}
    >
      {/* Header - clickable */}
      <Box
        as="button"
        width="100%"
        onClick={handleToggle}
        p={4}
        textAlign="left"
        _hover={{
          bg: 'rose.50',
        }}
        transition="background-color 0.2s"
      >
        <HStack justify="space-between">
          <HStack spacing={3}>
            <Icon
              as={isExpanded ? FiChevronDown : FiChevronRight}
              color="rose.500"
              transition="transform 0.2s"
            />
            <Text fontWeight="semibold" color="warmGray.900">
              {roleName}
            </Text>
            <Badge
              colorScheme="yellow"
              borderRadius="full"
              px={2}
              display="flex"
              alignItems="center"
              gap={1}
            >
              <Icon as={FiUserPlus} boxSize={3} />
              {requests.length} pending
            </Badge>
            <Badge
              bg="amethyst.100"
              color="amethyst.700"
              borderRadius="full"
              px={2}
              fontSize="xs"
            >
              {quorum} vouches needed
            </Badge>
          </HStack>
        </HStack>
      </Box>

      {/* Expandable content */}
      <Collapse in={isExpanded} animateOpacity>
        <Box px={4} pb={4}>
          {requests.length === 0 ? (
            <Text color="warmGray.500" fontSize="sm" textAlign="center" py={4}>
              No pending vouch requests for this role
            </Text>
          ) : (
            <Grid
              templateColumns={{
                base: '1fr',
                md: 'repeat(2, 1fr)',
                lg: 'repeat(3, 1fr)',
              }}
              gap={3}
            >
              {requests.map((request) => (
                <VouchRequestCard
                  key={`${request.hatId}-${request.wearer}`}
                  request={request}
                  hasUserVouched={hasUserVouched(request.wearer, request.hatId)}
                  canVouch={canVouch}
                  isVouching={isVouchingFor(request.wearer, request.hatId)}
                  isRevoking={isRevokingFor(request.wearer, request.hatId)}
                  isConnected={isConnected}
                  onVouch={onVouch}
                  onRevokeVouch={onRevokeVouch}
                />
              ))}
            </Grid>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * Your vouches section showing vouches the user has given
 */
function YourVouchesSection({ userGivenVouches = [], onRevokeVouch, isRevokingFor }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (userGivenVouches.length === 0) {
    return null;
  }

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="green.200"
      borderRadius="xl"
      overflow="hidden"
      mb={3}
    >
      {/* Header */}
      <Box
        as="button"
        width="100%"
        onClick={() => setIsExpanded(!isExpanded)}
        p={4}
        textAlign="left"
        _hover={{
          bg: 'green.50',
        }}
        transition="background-color 0.2s"
      >
        <HStack justify="space-between">
          <HStack spacing={3}>
            <Icon
              as={isExpanded ? FiChevronDown : FiChevronRight}
              color="green.500"
              transition="transform 0.2s"
            />
            <Text fontWeight="semibold" color="warmGray.900">
              Your Vouches
            </Text>
            <Badge
              colorScheme="green"
              borderRadius="full"
              px={2}
              display="flex"
              alignItems="center"
              gap={1}
            >
              <Icon as={FiUsers} boxSize={3} />
              {userGivenVouches.length}
            </Badge>
          </HStack>
        </HStack>
      </Box>

      {/* Expandable content */}
      <Collapse in={isExpanded} animateOpacity>
        <Box px={4} pb={4}>
          <VStack spacing={2} align="stretch">
            {userGivenVouches.map((vouch) => {
              const isRevoking = isRevokingFor(vouch.wearer, vouch.hatId);
              return (
                <HStack
                  key={`${vouch.hatId}-${vouch.wearer}`}
                  justify="space-between"
                  bg="warmGray.50"
                  p={3}
                  borderRadius="md"
                >
                  <VStack align="start" spacing={0}>
                    <Text color="warmGray.900" fontSize="sm">
                      {vouch.wearerUsername || `${vouch.wearer.slice(0, 8)}...`}
                    </Text>
                    <Text color="warmGray.500" fontSize="xs">
                      for {vouch.roleName}
                    </Text>
                  </VStack>
                  <Badge
                    as="button"
                    colorScheme="red"
                    variant="outline"
                    cursor={isRevoking ? 'wait' : 'pointer'}
                    onClick={() => !isRevoking && onRevokeVouch?.(vouch.wearer, vouch.hatId)}
                    _hover={{ bg: isRevoking ? undefined : 'red.50' }}
                    opacity={isRevoking ? 0.6 : 1}
                  >
                    {isRevoking ? 'Revoking...' : 'Revoke'}
                  </Badge>
                </HStack>
              );
            })}
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * VouchingSection component
 * @param {Object} props
 * @param {Array} props.roles - All roles with their vouch config
 * @param {string} props.eligibilityModuleAddress - EligibilityModule contract address
 * @param {Array} props.userHatIds - Current user's hat IDs
 * @param {string} props.userAddress - Current user's address
 * @param {boolean} props.isConnected - Whether wallet is connected
 * @param {boolean} props.embedded - When true, disables glass layer and reduces padding for nesting
 */
export function VouchingSection({
  roles = [],
  eligibilityModuleAddress,
  userHatIds = [],
  userAddress,
  isConnected = true,
  embedded = false,
}) {
  // Filter to roles with vouching enabled — memoized to keep a stable reference
  const rolesWithVouching = useMemo(
    () => roles.filter(role => role.vouchingEnabled),
    [roles]
  );

  // Use vouches hook
  const {
    pendingRequestsByRole,
    userGivenVouches,
    hasUserVouched,
    canUserVouchForRole,
    loading,
    error,
  } = useVouches(eligibilityModuleAddress, rolesWithVouching);

  // Use claim role hook for vouch actions
  const {
    vouchFor,
    revokeVouch,
    isVouchingFor,
    isRevokingFor,
    isVouching,
  } = useClaimRole(eligibilityModuleAddress);

  // Handle vouch action
  const handleVouch = useCallback(async (wearerAddress, hatId) => {
    await vouchFor(wearerAddress, hatId);
  }, [vouchFor]);

  // Handle revoke action
  const handleRevokeVouch = useCallback(async (wearerAddress, hatId) => {
    await revokeVouch(wearerAddress, hatId);
  }, [revokeVouch]);

  // No vouching enabled for this org
  if (rolesWithVouching.length === 0) {
    return null;
  }

  const sectionStyle = embedded ? {} : lightSectionStyle;

  // Loading state
  if (loading) {
    return (
      <Box
        {...sectionStyle}
        borderRadius={embedded ? 'xl' : '2xl'}
        p={embedded ? { base: 2, md: 3 } : { base: 4, md: 6 }}
      >
        <VStack spacing={3} align="stretch">
          {[1, 2].map((i) => (
            <Skeleton key={i} height="80px" borderRadius="xl" />
          ))}
        </VStack>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box
        {...sectionStyle}
        borderRadius={embedded ? 'xl' : '2xl'}
        p={embedded ? { base: 2, md: 3 } : { base: 4, md: 6 }}
      >
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          Failed to load vouching data
        </Alert>
      </Box>
    );
  }

  // Check if there are any pending requests
  const hasPendingRequests = pendingRequestsByRole.some(r => r.requests.length > 0);

  return (
    <Box
      {...sectionStyle}
      borderRadius={embedded ? 'xl' : '2xl'}
      p={embedded ? { base: 2, md: 3 } : { base: 4, md: 6 }}
    >
      <VStack spacing={embedded ? 3 : 4} align="stretch">
        {/* Info banner */}
        <HStack
          spacing={2}
          bg="amethyst.50"
          p={3}
          borderRadius="md"
          color="warmGray.600"
        >
          <Icon as={FiInfo} />
          <Text fontSize="sm">
            Members with the required role can vouch for users seeking to join.
            Once a user reaches the required number of vouches, they can claim the role.
          </Text>
        </HStack>

        {/* Vouch for new member form */}
        <VouchForNewMember
          rolesWithVouching={rolesWithVouching}
          userHatIds={userHatIds}
          onVouch={handleVouch}
          isVouching={isVouching}
          isConnected={isConnected}
          canUserVouchForRole={canUserVouchForRole}
        />

        {/* Your vouches section (if user has given any) */}
        {userGivenVouches.length > 0 && (
          <>
            <YourVouchesSection
              userGivenVouches={userGivenVouches}
              onRevokeVouch={handleRevokeVouch}
              isRevokingFor={isRevokingFor}
            />
            <Divider borderColor="warmGray.200" />
          </>
        )}

        {/* Pending requests by role */}
        {!hasPendingRequests ? (
          <Box textAlign="center" py={6}>
            <Icon as={FiUserPlus} boxSize={8} color="warmGray.400" mb={2} />
            <Text color="warmGray.500">
              No pending vouch requests
            </Text>
            <Text color="warmGray.400" fontSize="sm">
              Users who apply to join a role will appear here, ready to be vouched for
            </Text>
          </Box>
        ) : (
          <VStack spacing={0} align="stretch">
            {pendingRequestsByRole.map((roleData, index) => (
              roleData.requests.length > 0 && (
                <RoleVouchAccordion
                  key={roleData.hatId}
                  roleData={roleData}
                  userHatIds={userHatIds}
                  userAddress={userAddress}
                  hasUserVouched={hasUserVouched}
                  canUserVouchForRole={canUserVouchForRole}
                  onVouch={handleVouch}
                  onRevokeVouch={handleRevokeVouch}
                  isVouchingFor={isVouchingFor}
                  isRevokingFor={isRevokingFor}
                  isConnected={isConnected}
                  defaultExpanded={index === 0}
                />
              )
            ))}
          </VStack>
        )}
      </VStack>
    </Box>
  );
}

export default VouchingSection;
