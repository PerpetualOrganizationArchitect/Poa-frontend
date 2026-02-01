/**
 * ActivitySummaryCard - Compact display of user activity stats
 * Shows tasks completed, votes cast, and membership date
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Icon,
} from '@chakra-ui/react';
import { FiCheckCircle, FiThumbsUp, FiCalendar } from 'react-icons/fi';
import { glassLayerStyle } from '@/components/shared/glassStyles';

/**
 * Single stat item
 */
function StatItem({ icon, label, value, color = 'purple.300' }) {
  return (
    <HStack spacing={3} bg="whiteAlpha.50" p={3} borderRadius="lg">
      <Icon as={icon} color={color} boxSize={5} />
      <VStack align="start" spacing={0}>
        <Text fontSize="xs" color="gray.400" textTransform="uppercase">
          {label}
        </Text>
        <Text fontWeight="bold" color="white" fontSize="lg">
          {value}
        </Text>
      </VStack>
    </HStack>
  );
}

/**
 * ActivitySummaryCard component
 * @param {Object} props
 * @param {number} props.tasksCompleted - Number of completed tasks
 * @param {number} props.totalVotes - Number of votes cast
 * @param {string} props.dateJoined - Formatted join date string
 */
export function ActivitySummaryCard({
  tasksCompleted = 0,
  totalVotes = 0,
  dateJoined = 'Unknown',
}) {
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
          Activity
        </Text>
      </VStack>

      {/* Content */}
      <VStack spacing={2} align="stretch" p={4} pt={2}>
          <StatItem
            icon={FiCheckCircle}
            label="Tasks Completed"
            value={tasksCompleted}
            color="green.300"
          />
          <StatItem
            icon={FiThumbsUp}
            label="Votes Cast"
            value={totalVotes}
            color="blue.300"
          />
          <StatItem
            icon={FiCalendar}
            label="Member Since"
            value={dateJoined}
            color="purple.300"
          />
      </VStack>
    </Box>
  );
}

export default ActivitySummaryCard;
