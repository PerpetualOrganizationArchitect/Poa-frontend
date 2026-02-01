/**
 * TokenActivityCard - Combined token balance and activity stats display
 * Merges token status (tier, progress) with activity metrics (tasks, votes, member since)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Image,
  Progress,
  Badge,
  Icon,
  Divider,
  keyframes,
  usePrefersReducedMotion,
  chakra,
} from '@chakra-ui/react';
import { FiCheckCircle, FiThumbsUp, FiCalendar } from 'react-icons/fi';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { getTierColorScheme, getTierIcon } from '@/utils/profileUtils';

const glowAnimation = keyframes`
  from { text-shadow: 0 0 0px white; }
  to { text-shadow: 0 0 20px gold; }
`;

/**
 * Single stat item for activity section
 */
function StatItem({ icon, label, value, color = 'purple.300' }) {
  return (
    <HStack spacing={3}>
      <Icon as={icon} color={color} boxSize={4} />
      <Text fontSize="sm" color="gray.400">
        {label}:
      </Text>
      <Text fontWeight="bold" color="white" fontSize="sm">
        {value}
      </Text>
    </HStack>
  );
}

/**
 * TokenActivityCard component
 * @param {Object} props
 * @param {number} props.ptBalance - Participation token balance
 * @param {string} props.tier - Current tier (Basic, Bronze, Silver, Gold)
 * @param {number} props.progress - Progress percentage to next tier (0-100)
 * @param {string} props.nextTier - Name of the next tier
 * @param {number} props.nextTierThreshold - Token threshold for next tier
 * @param {number} props.tasksCompleted - Number of completed tasks
 * @param {number} props.totalVotes - Number of votes cast
 * @param {string} props.dateJoined - Formatted join date string
 */
export function TokenActivityCard({
  ptBalance = 0,
  tier = 'Basic',
  progress = 0,
  nextTier,
  nextTierThreshold,
  tasksCompleted = 0,
  totalVotes = 0,
  dateJoined = 'Unknown',
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [countFinished, setCountFinished] = useState(false);
  const hasAnimatedRef = useRef(false);

  // Framer motion value for animated count
  const count = useMotionValue(hasAnimatedRef.current ? ptBalance : 0);
  const roundedCount = useTransform(count, (value) => Math.round(value));

  // Animate to new value when ptBalance changes
  useEffect(() => {
    const duration = hasAnimatedRef.current ? 0.5 : 1.7;
    const controls = animate(count, ptBalance, {
      duration,
      ease: 'easeOut',
      onComplete: () => {
        setCountFinished(true);
        hasAnimatedRef.current = true;
      },
    });
    return controls.stop;
  }, [ptBalance, count]);

  const animationProps = prefersReducedMotion
    ? {}
    : {
        animation: countFinished ? `${glowAnimation} alternate 2.1s ease-in-out` : undefined,
      };

  const tierColorScheme = getTierColorScheme(tier);
  const tierIcon = getTierIcon(tier);
  const tokensToNext = nextTierThreshold ? nextTierThreshold - ptBalance : 0;
  const isMaxTier = progress >= 100;

  return (
    <Box
      w="100%"
      h="100%"
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
          Tokens & Activity
        </Text>
      </VStack>

      {/* Content */}
      <VStack spacing={4} align="stretch" p={4} pt={2}>
        {/* Token Section */}
        <HStack spacing={4}>
          <Image
            src={tierIcon}
            alt={`${tier} Tier`}
            boxSize={{ base: '50px', md: '60px' }}
            objectFit="contain"
          />
          <VStack align="start" spacing={0} flex={1}>
            <HStack spacing={2} align="baseline">
              <Text
                fontSize={{ base: '2xl', md: '3xl' }}
                fontWeight="bold"
                color="white"
              >
                {countFinished ? (
                  <chakra.span {...animationProps}>{ptBalance}</chakra.span>
                ) : (
                  <motion.span>{roundedCount}</motion.span>
                )}
              </Text>
              <Text fontSize="md" color="gray.400">
                tokens
              </Text>
            </HStack>
            <Badge colorScheme={tierColorScheme} fontSize="sm" px={2}>
              {tier} Tier
            </Badge>
          </VStack>
        </HStack>

        {/* Progress Bar */}
        <Box>
          <Progress
            value={progress}
            colorScheme="teal"
            size="sm"
            borderRadius="full"
            bg="whiteAlpha.200"
          />
          <Text fontSize="xs" color="gray.400" mt={1}>
            {isMaxTier
              ? 'Maximum tier reached!'
              : `${tokensToNext} more to ${nextTier}`}
          </Text>
        </Box>

        {/* Divider */}
        <Divider borderColor="whiteAlpha.200" />

        {/* Activity Section */}
        <VStack spacing={2} align="stretch">
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
      </VStack>
    </Box>
  );
}

export default TokenActivityCard;
