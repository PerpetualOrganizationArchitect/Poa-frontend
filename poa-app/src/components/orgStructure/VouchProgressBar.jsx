/**
 * VouchProgressBar - Progress visualization for vouch count
 * Shows current vouches vs required quorum with color progression
 */

import React from 'react';
import {
  Box,
  Progress,
  Text,
  HStack,
  Tooltip,
} from '@chakra-ui/react';

/**
 * Get progress bar color based on completion percentage
 */
function getProgressColor(percentage) {
  if (percentage >= 100) return 'green';
  if (percentage >= 66) return 'yellow';
  if (percentage >= 33) return 'orange';
  return 'red';
}

/**
 * VouchProgressBar component
 * @param {Object} props
 * @param {number} props.current - Current vouch count
 * @param {number} props.quorum - Required vouch count
 * @param {string} props.size - Size variant: 'sm', 'md', 'lg'
 * @param {boolean} props.showLabel - Whether to show the count label
 * @param {boolean} props.compact - Compact mode for inline use
 */
export function VouchProgressBar({
  current = 0,
  quorum = 1,
  size = 'md',
  showLabel = true,
  compact = false,
}) {
  const percentage = quorum > 0 ? Math.min((current / quorum) * 100, 100) : 0;
  const isComplete = current >= quorum;
  const colorScheme = getProgressColor(percentage);

  // Size configurations
  const sizeConfig = {
    sm: { height: '6px', fontSize: 'xs', spacing: 1 },
    md: { height: '8px', fontSize: 'sm', spacing: 2 },
    lg: { height: '12px', fontSize: 'md', spacing: 3 },
  };

  const config = sizeConfig[size] || sizeConfig.md;

  if (compact) {
    return (
      <Tooltip
        label={`${current} of ${quorum} vouches ${isComplete ? '(Complete!)' : 'needed'}`}
        placement="top"
      >
        <HStack spacing={1} align="center">
          <Box flex="1" minW="60px" maxW="100px">
            <Progress
              value={percentage}
              size="xs"
              colorScheme={colorScheme}
              bg="whiteAlpha.200"
              borderRadius="full"
            />
          </Box>
          <Text fontSize="xs" color={isComplete ? 'green.300' : 'gray.400'} whiteSpace="nowrap">
            {current}/{quorum}
          </Text>
        </HStack>
      </Tooltip>
    );
  }

  return (
    <Box w="100%">
      {showLabel && (
        <HStack justify="space-between" mb={config.spacing}>
          <Text fontSize={config.fontSize} color="gray.400">
            Vouches
          </Text>
          <Text
            fontSize={config.fontSize}
            fontWeight="medium"
            color={isComplete ? 'green.300' : 'white'}
          >
            {current} / {quorum}
            {isComplete && ' (Complete!)'}
          </Text>
        </HStack>
      )}
      <Progress
        value={percentage}
        height={config.height}
        colorScheme={colorScheme}
        bg="whiteAlpha.200"
        borderRadius="full"
        hasStripe={isComplete}
        isAnimated={isComplete}
      />
    </Box>
  );
}

export default VouchProgressBar;
