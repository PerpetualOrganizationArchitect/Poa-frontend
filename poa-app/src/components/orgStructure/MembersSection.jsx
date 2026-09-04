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
 * Single member card.
 * `roleBadges` (access-v2 spotlight): the member's role names replace the Active/Inactive
 * status — on that surface "who is this person in the org" beats a liveness flag.
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

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="warmGray.100"
      borderLeft="3px solid"
      borderLeftColor="coral.400"
      borderRadius="lg"
      p={4}
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{
        transform: 'translateY(-2px)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        borderColor: 'coral.300',
      }}
    >
      <VStack align="stretch" spacing={3}>
        {/* Identity and status */}
        <HStack justify="space-between" minW={0}>
          <UserIdentity
            address={address}
            usernameHint={username}
            size="sm"
            nameColor="warmGray.900"
            nameFontWeight="medium"
            isTruncated
          />
          {roleBadges?.length ? (
            <HStack spacing={1} flexShrink={0}>
              {roleBadges.slice(0, 2).map((name) => (
                <Badge key={name} colorScheme="coral" variant="subtle" size="sm" borderRadius="full" px={2}>
                  {name}
                </Badge>
              ))}
              {roleBadges.length > 2 && (
                <Badge colorScheme="gray" variant="subtle" size="sm" borderRadius="full" px={2}>
                  +{roleBadges.length - 2}
                </Badge>
              )}
            </HStack>
          ) : (
            <Badge
              colorScheme={isActive ? 'green' : 'gray'}
              size="sm"
              borderRadius="full"
              px={2}
            >
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          )}
        </HStack>

        {/* Stats grid */}
        <Grid templateColumns="repeat(2, 1fr)" gap={2}>
          <GridItem>
            <HStack spacing={1} color="warmGray.500" fontSize="xs">
              <Icon as={FiActivity} />
              <Text>{participationTokenBalance} {tokenLabel.toLowerCase()}</Text>
            </HStack>
          </GridItem>
          <GridItem>
            <HStack spacing={1} color="warmGray.500" fontSize="xs">
              <Icon as={FiCheckSquare} />
              <Text>{totalTasksCompleted} tasks</Text>
            </HStack>
          </GridItem>
          <GridItem>
            <HStack spacing={1} color="warmGray.500" fontSize="xs">
              <Icon as={FiThumbsUp} />
              <Text>{totalVotes} votes</Text>
            </HStack>
          </GridItem>
          <GridItem>
            <HStack spacing={1} color="warmGray.500" fontSize="xs">
              <Icon as={FiCalendar} />
              <Text>Joined {formatDate(firstSeenAt)}</Text>
            </HStack>
          </GridItem>
        </Grid>
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
