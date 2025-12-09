/**
 * PhilosophySlider - Visual governance philosophy chooser
 *
 * A slider that lets users choose between:
 * - Delegated (0-30): Leaders make most decisions
 * - Hybrid (31-70): Leaders propose, members decide
 * - Democratic (71-100): Everyone has equal voice
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
  Tooltip,
  Badge,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { PiUserFocus, PiScales, PiCheckSquare } from 'react-icons/pi';
import { getPhilosophyInfo } from '../../utils/philosophyMapper';

export function PhilosophySlider({ value, onChange, isDisabled = false }) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  const philosophyInfo = getPhilosophyInfo(value);

  const trackBg = useColorModeValue('gray.200', 'gray.600');
  const labelColor = useColorModeValue('gray.600', 'gray.400');
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Dynamic color based on philosophy type
  const getTrackColor = () => {
    switch (philosophyInfo.type) {
      case 'delegated':
        return 'orange.400';
      case 'hybrid':
        return 'blue.400';
      case 'democratic':
        return 'green.400';
      default:
        return 'blue.400';
    }
  };

  return (
    <Box w="100%">
      {/* Labels - More neutral, mechanism-focused */}
      <HStack justify="space-between" mb={2} px={2}>
        <Text fontSize="sm" color={labelColor}>
          More weight to contributors
        </Text>
        <Text fontSize="sm" color={labelColor}>
          Equal balance
        </Text>
        <Text fontSize="sm" color={labelColor}>
          One person, one vote
        </Text>
      </HStack>

      {/* Slider */}
      <Box px={2} py={4}>
        <Slider
          value={value}
          onChange={onChange}
          min={0}
          max={100}
          step={5}
          isDisabled={isDisabled}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {/* Marks at key positions - using icons instead of emojis */}
          <SliderMark value={15} mt={4} ml={-2}>
            <Icon as={PiUserFocus} color="warmGray.400" boxSize={4} />
          </SliderMark>
          <SliderMark value={50} mt={4} ml={-2}>
            <Icon as={PiScales} color="warmGray.400" boxSize={4} />
          </SliderMark>
          <SliderMark value={85} mt={4} ml={-2}>
            <Icon as={PiCheckSquare} color="warmGray.400" boxSize={4} />
          </SliderMark>

          <SliderTrack bg={trackBg} h={3} borderRadius="full">
            <SliderFilledTrack bg={getTrackColor()} />
          </SliderTrack>

          <Tooltip
            hasArrow
            bg={getTrackColor()}
            color="white"
            placement="top"
            isOpen={showTooltip}
            label={`${value}%`}
          >
            <SliderThumb boxSize={6} />
          </Tooltip>
        </Slider>
      </Box>

      {/* Current Philosophy Description */}
      <Box
        mt={6}
        p={4}
        bg={cardBg}
        borderRadius="lg"
        borderWidth="1px"
        borderColor={borderColor}
        textAlign="center"
      >
        <VStack spacing={2}>
          <HStack>
            <Text fontSize="2xl">{philosophyInfo.icon}</Text>
            <Text fontWeight="bold" fontSize="lg">
              {philosophyInfo.name}
            </Text>
            <Badge
              colorScheme={
                philosophyInfo.type === 'democratic'
                  ? 'green'
                  : philosophyInfo.type === 'hybrid'
                  ? 'blue'
                  : 'orange'
              }
            >
              {philosophyInfo.shortDescription}
            </Badge>
          </HStack>
          <Text fontSize="sm" color={labelColor} maxW="400px">
            {philosophyInfo.description}
          </Text>
        </VStack>
      </Box>

      {/* Visual Representation */}
      <HStack justify="center" spacing={4} mt={4}>
        <VStack spacing={1}>
          <Box
            w={8}
            h={8}
            borderRadius="full"
            bg={philosophyInfo.type === 'democratic' ? 'green.400' : 'gray.300'}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="xs">👤</Text>
          </Box>
          <Text fontSize="xs" color={labelColor}>
            Member
          </Text>
        </VStack>

        <Text color={labelColor}>=</Text>

        <VStack spacing={1}>
          <Box
            w={philosophyInfo.type === 'democratic' ? 8 : philosophyInfo.type === 'hybrid' ? 6 : 4}
            h={philosophyInfo.type === 'democratic' ? 8 : philosophyInfo.type === 'hybrid' ? 6 : 4}
            borderRadius="full"
            bg={
              philosophyInfo.type === 'democratic'
                ? 'green.400'
                : philosophyInfo.type === 'hybrid'
                ? 'blue.400'
                : 'orange.300'
            }
          />
          <Text fontSize="xs" color={labelColor}>
            Voting Power
          </Text>
        </VStack>

        <Text color={labelColor}>vs</Text>

        <VStack spacing={1}>
          <Box
            w={philosophyInfo.type === 'delegated' ? 10 : philosophyInfo.type === 'hybrid' ? 6 : 4}
            h={philosophyInfo.type === 'delegated' ? 10 : philosophyInfo.type === 'hybrid' ? 6 : 4}
            borderRadius="full"
            bg={
              philosophyInfo.type === 'delegated'
                ? 'orange.400'
                : philosophyInfo.type === 'hybrid'
                ? 'blue.400'
                : 'green.300'
            }
          />
          <Text fontSize="xs" color={labelColor}>
            Contribution
          </Text>
        </VStack>
      </HStack>
    </Box>
  );
}

export default PhilosophySlider;
