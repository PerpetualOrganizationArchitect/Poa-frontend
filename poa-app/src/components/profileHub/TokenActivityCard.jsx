/**
 * TokenActivityCard - Combined token balance and activity stats display
 * Shows shares (prominent), voting power, treasury share, and activity metrics
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { keyframes } from '@emotion/react';
import {
  Box,
  HStack,
  VStack,
  Text,
  // Image, // TIER FEATURE - kept for future use
  // Progress, // TIER FEATURE - kept for future use
  // Badge, // TIER FEATURE - kept for future use
  Icon,
  Divider,
  Tooltip,
  usePrefersReducedMotion,
  chakra,
} from '@chakra-ui/react';
import { InfoOutlineIcon } from '@chakra-ui/icons';
import { FiCheckCircle, FiThumbsUp, FiCalendar } from 'react-icons/fi';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { useVotingPower } from '@/hooks/useVotingPower';
import { useTreasuryShare } from '@/hooks/useTreasuryShare';
import { usePOContext } from '@/context/POContext';

// TIER FEATURE - imports kept for future use
// import { getTierColorScheme, getTierIcon } from '@/utils/profileUtils';

function useAnimatedCounter(target, duration, onComplete) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (duration <= 0) {
      setValue(target);
      onComplete?.();
      return;
    }
    startRef.current = performance.now();
    const animate = (now) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setValue(Math.round(progress * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, onComplete]);

  return value;
}

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
 * @param {number} props.tasksCompleted - Number of completed tasks
 * @param {number} props.totalVotes - Number of votes cast
 * @param {string} props.dateJoined - Formatted join date string
 */
export function TokenActivityCard({
  ptBalance = 0,
  tasksCompleted = 0,
  totalVotes = 0,
  dateJoined = 'Unknown',
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [countFinished, setCountFinished] = useState(false);
  const hasAnimatedRef = useRef(false);

  const { percentOfTotal, classWeights, classConfig, isHybrid, isLoading: votingLoading } = useVotingPower();
  const isQuadratic = classConfig?.some(c => c.strategy === 'ERC20_BAL' && c.quadratic) ?? false;
  const { treasuryShare, isLoading: treasuryLoading, isHidden: treasuryHidden } = useTreasuryShare();
  const { tokenLabel } = usePOContext();

  const duration = hasAnimatedRef.current ? 500 : 1700;
  const animatedValue = useAnimatedCounter(ptBalance, duration, useCallback(() => {
    setCountFinished(true);
    hasAnimatedRef.current = true;
  }, []));

  const animationProps = prefersReducedMotion
    ? {}
    : {
        animation: countFinished ? `${glowAnimation} alternate 2.1s ease-in-out` : undefined,
      };

  // TIER FEATURE - commented out per redesign, kept for future use
  // const tierColorScheme = getTierColorScheme(tier);
  // const tierIcon = getTierIcon(tier);
  // const tokensToNext = nextTierThreshold ? nextTierThreshold - ptBalance : 0;
  // const isMaxTier = progress >= 100;

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
          {tokenLabel} & Activity
        </Text>
      </VStack>

      {/* Content */}
      <VStack spacing={4} align="stretch" p={4} pt={2}>
        {/* Metrics Section */}
        <VStack align="start" spacing={2}>
          {/* Shares - prominent display */}
          <HStack spacing={2} align="baseline">
            <Text
              fontSize={{ base: '4xl', md: '5xl' }}
              fontWeight="bold"
              color="white"
              lineHeight="1.1"
            >
              {countFinished ? (
                <chakra.span {...animationProps}>{ptBalance}</chakra.span>
              ) : (
                <span>{animatedValue}</span>
              )}
            </Text>
            <Text fontSize="lg" color="gray.400">
              {tokenLabel}
            </Text>
            <Tooltip
              label={`${tokenLabel} represent your contribution to this organization. You earn them by completing tasks, education modules, and other activities.`}
              placement="top"
              hasArrow
              bg="gray.700"
              p={3}
              maxW="280px"
            >
              <Box as="span" display="inline-flex" cursor="help" ml={1}>
                <InfoOutlineIcon color="gray.500" boxSize="14px" />
              </Box>
            </Tooltip>
          </HStack>

          {/* Voting Power */}
          <HStack spacing={2} align="baseline">
            <Text fontSize={{ base: 'lg', md: 'xl' }} fontWeight="semibold" color="purple.300">
              {votingLoading ? '...' : `${percentOfTotal.toFixed(1)}%`}
            </Text>
            <Text fontSize="sm" color="gray.400">
              voting power
            </Text>
            <Tooltip
              label={
                isHybrid
                  ? `Your voting power combines membership (${classWeights.democracy}% weight) and contribution (${classWeights.contribution}% weight${isQuadratic ? ', √ weighted' : ''}) to determine your share of organizational decisions.`
                  : 'In direct democracy, every member has an equal vote.'
              }
              placement="top"
              hasArrow
              bg="gray.700"
              p={3}
              maxW="300px"
            >
              <Box as="span" display="inline-flex" cursor="help">
                <InfoOutlineIcon color="gray.500" boxSize="12px" />
              </Box>
            </Tooltip>
          </HStack>

          {/* Treasury Share - hidden when org has treasury hidden */}
          {!treasuryHidden && (
            <HStack spacing={2} align="baseline">
              <Text fontSize={{ base: 'lg', md: 'xl' }} fontWeight="semibold" color="green.300">
                {treasuryLoading || treasuryShare === null ? '...' : `~$${treasuryShare.toFixed(2)}`}
              </Text>
              <Text fontSize="sm" color="gray.400">
                treasury share
              </Text>
            </HStack>
          )}
        </VStack>

        {/* TIER FEATURE - tier icon, badge, and progress bar commented out per redesign */}
        {/*
        <HStack spacing={4}>
          <Image
            src={tierIcon}
            alt={`${tier} Tier`}
            boxSize={{ base: '50px', md: '60px' }}
            objectFit="contain"
          />
          <VStack align="start" spacing={0} flex={1}>
            <HStack spacing={2} align="baseline">
              <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold" color="white">
                {ptBalance}
              </Text>
              <Text fontSize="md" color="gray.400">shares</Text>
            </HStack>
            <Badge colorScheme={tierColorScheme} fontSize="sm" px={2}>
              {tier} Tier
            </Badge>
          </VStack>
        </HStack>
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
        */}

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
