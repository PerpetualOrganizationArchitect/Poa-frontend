/**
 * CompactTokenStatus - Condensed token balance and tier display
 * Replaces the large mascot image with compact, information-dense display
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Image,
  Progress,
  Button,
  Badge,
  keyframes,
  usePrefersReducedMotion,
  chakra,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { useSpring, animated } from 'react-spring';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { getTierColorScheme, getTierIcon } from '@/utils/profileUtils';

const glowAnimation = keyframes`
  from { text-shadow: 0 0 0px white; }
  to { text-shadow: 0 0 20px gold; }
`;

/**
 * CompactTokenStatus component
 * @param {Object} props
 * @param {number} props.ptBalance - Participation token balance
 * @param {string} props.tier - Current tier (Basic, Bronze, Silver, Gold)
 * @param {number} props.progress - Progress percentage to next tier (0-100)
 * @param {string} props.nextTier - Name of the next tier
 * @param {number} props.nextTierThreshold - Token threshold for next tier
 * @param {boolean} props.hasMemberRole - Whether user can request tokens
 * @param {() => void} props.onRequestTokens - Request tokens handler
 */
export function CompactTokenStatus({
  ptBalance = 0,
  tier = 'Basic',
  progress = 0,
  nextTier,
  nextTierThreshold,
  hasMemberRole,
  onRequestTokens,
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [countFinished, setCountFinished] = useState(false);
  const hasAnimatedRef = useRef(false);

  // Only animate from 0 on initial mount, then animate from previous value
  const animatedPT = useSpring({
    pt: ptBalance,
    from: { pt: hasAnimatedRef.current ? ptBalance : 0 },
    config: { duration: hasAnimatedRef.current ? 500 : 1700 },
    onRest: () => {
      setCountFinished(true);
      hasAnimatedRef.current = true;
    },
  });

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
      borderRadius="2xl"
      bg="transparent"
      boxShadow="lg"
      position="relative"
      zIndex={2}
    >
      <div style={glassLayerStyle} />

      {/* Content - no separate header for this card since it's compact */}
      <VStack spacing={4} align="stretch" p={4}>
        {/* Header: Icon + Token Count */}
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
                  <animated.span>
                    {animatedPT.pt.to((pt) => pt.toFixed(0))}
                  </animated.span>
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

        {/* Request Tokens Button */}
        {hasMemberRole && (
          <Button
            size="sm"
            leftIcon={<AddIcon />}
            colorScheme="purple"
            onClick={onRequestTokens}
            alignSelf="flex-start"
          >
            Request Tokens
          </Button>
        )}
      </VStack>
    </Box>
  );
}

export default CompactTokenStatus;
