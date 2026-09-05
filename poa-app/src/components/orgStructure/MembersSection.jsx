/**
 * MembersSection - Expandable accordion sections showing members per role
 */

import React, { useState, useCallback } from 'react';
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
  GridItem,
} from '@chakra-ui/react';
import {
  FiChevronDown,
  FiChevronRight,
  FiUsers,
  FiActivity,
  FiCalendar,
  FiCheckSquare,
  FiThumbsUp,
} from 'react-icons/fi';
import PulseLoader from "@/components/shared/PulseLoader";
import { usePOContext } from '@/context/POContext';
import UserIdentity from '@/components/common/UserIdentity';

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(parseInt(timestamp, 10) * 1000);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Single member card — identity first, everything else quiet.
 *
 * `roleBadges` (access-v2 spotlight): the member's role names as a muted line UNDER the name —
 * board titles run long ("Director of Research and Development"), so they must never share a
 * row with the username. Without `roleBadges` (legacy orgs) a small status dot takes that slot.
 */
export function MemberCard({ member, roleBadges }) {
  const { tokenLabel = 'Shares' } = usePOContext() || {};
  const {
    username,
    address,
    participationTokenBalance,
    totalTasksCompleted,
    totalVotes,
    firstSeenAt,
    membershipStatus,
  } = member;

  const isActive = membershipStatus === 'Active';
  const roles = (roleBadges || []).filter(Boolean);
  const extraRoles = roles.length - 2;

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="warmGray.100"
      borderRadius="xl"
      p={4}
      transition="border-color 0.15s, box-shadow 0.15s"
      _hover={{ borderColor: 'coral.200', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)' }}
    >
      <VStack align="stretch" spacing={1.5}>
        <UserIdentity
          address={address}
          usernameHint={username}
          size="sm"
          nameColor="warmGray.900"
          nameFontWeight="semibold"
          isTruncated
        />

        {roles.length > 0 ? (
          <Text fontSize="xs" lineHeight="short">
            <Text as="span" color="coral.600" fontWeight="medium">{roles[0]}</Text>
            {roles[1] && <Text as="span" color="warmGray.500">{' · '}{roles[1]}</Text>}
            {extraRoles > 0 && <Text as="span" color="warmGray.400">{' · +'}{extraRoles}</Text>}
          </Text>
        ) : (
          <HStack spacing={1.5}>
            <Box boxSize={1.5} borderRadius="full" bg={isActive ? 'green.400' : 'warmGray.300'} />
            <Text fontSize="xs" color="warmGray.500">{isActive ? 'Active' : 'Inactive'}</Text>
          </HStack>
        )}

        <Text fontSize="xs" color="warmGray.500" pt={1.5}>
          {participationTokenBalance} {tokenLabel.toLowerCase()} · {totalTasksCompleted} task
          {totalTasksCompleted === 1 ? '' : 's'} · {totalVotes} vote{totalVotes === 1 ? '' : 's'}
          <Text as="span" color="warmGray.400"> · joined {formatDate(firstSeenAt)}</Text>
        </Text>
      </VStack>
    </Box>
  );
}

/**
 * Expandable role accordion item
 */
function RoleAccordionItem({ role, members = [], defaultExpanded = false }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = useCallback(() => {
    if (!isExpanded && members.length > 0) {
      // Simulate loading for lazy-load effect
      setIsLoading(true);
      setTimeout(() => setIsLoading(false), 300);
    }
    setIsExpanded(!isExpanded);
  }, [isExpanded, members.length]);

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="warmGray.100"
      borderRadius="xl"
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
          bg: 'warmGray.50',
        }}
        transition="background-color 0.2s"
      >
        <HStack justify="space-between">
          <HStack spacing={3}>
            <Icon
              as={isExpanded ? FiChevronDown : FiChevronRight}
              color="coral.500"
              transition="transform 0.2s"
            />
            <Text fontWeight="semibold" color="warmGray.900">
              {role.name}
            </Text>
            <Badge
              bg="amethyst.100"
              color="amethyst.700"
              borderRadius="full"
              px={2}
              display="flex"
              alignItems="center"
              gap={1}
            >
              <Icon as={FiUsers} boxSize={3} />
              {members.length}
            </Badge>
          </HStack>
        </HStack>
      </Box>

      {/* Expandable content */}
      <Collapse in={isExpanded} animateOpacity>
        <Box px={4} pb={4}>
          {isLoading ? (
            <HStack justify="center" py={4}>
              <PulseLoader size="sm" color="coral.400" />
              <Text color="warmGray.500" fontSize="sm">Loading members...</Text>
            </HStack>
          ) : members.length === 0 ? (
            <Text color="warmGray.500" fontSize="sm" textAlign="center" py={4}>
              No members with this role
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
              {members.map((member) => (
                <MemberCard key={member.id || member.address} member={member} />
              ))}
            </Grid>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export function MembersSection({
  roles = [],
  membersByRole = {},
  loading = false,
}) {
  if (loading) {
    return (
      <Box
        bg="rgba(255, 255, 255, 0.8)"
        border="1px solid"
        borderColor="warmGray.200"
        borderRadius="2xl"
        p={{ base: 4, md: 6 }}
        boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
      >
        <VStack spacing={3} align="stretch">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height="60px" borderRadius="xl" />
          ))}
        </VStack>
      </Box>
    );
  }

  if (roles.length === 0) {
    return (
      <Box
        bg="rgba(255, 255, 255, 0.8)"
        border="1px solid"
        borderColor="warmGray.200"
        borderRadius="2xl"
        p={{ base: 4, md: 6 }}
        boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
        textAlign="center"
      >
        <Text color="warmGray.500">No roles defined</Text>
      </Box>
    );
  }

  return (
    <Box
      bg="rgba(255, 255, 255, 0.8)"
      border="1px solid"
      borderColor="warmGray.200"
      borderRadius="2xl"
      p={{ base: 4, md: 6 }}
      boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
    >
      <VStack spacing={0} align="stretch">
        {roles.map((role, index) => (
          <RoleAccordionItem
            key={role.id || role.hatId}
            role={role}
            members={membersByRole[role.hatId] || []}
            defaultExpanded={index === 0}
          />
        ))}
      </VStack>
    </Box>
  );
}

export default MembersSection;
