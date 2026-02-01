import React from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Icon,
  Avatar,
} from '@chakra-ui/react';
import {
  FiCheckSquare,
  FiThumbsUp,
} from 'react-icons/fi';
import { PiCoinVerticalBold } from 'react-icons/pi';

const getMedalColor = (rank) => {
  switch (rank) {
    case 1:
      return 'gold';
    case 2:
      return 'silver';
    case 3:
      return '#cd7f32';
    default:
      return null;
  }
};

const getMedalGlow = (rank) => {
  const glows = {
    1: '0 0 20px rgba(255, 215, 0, 0.4)',
    2: '0 0 20px rgba(192, 192, 192, 0.4)',
    3: '0 0 20px rgba(205, 127, 50, 0.4)',
  };
  return glows[rank] || 'none';
};

function LeaderboardCard({ user, rank, onClick, isTopThree = false }) {
  const medalColor = getMedalColor(rank);

  return (
    <Box
      position="relative"
      borderRadius="lg"
      p={4}
      overflow="hidden"
      cursor="pointer"
      onClick={() => onClick(user, rank)}
      transition="all 0.2s"
      _hover={{
        transform: 'translateY(-2px)',
        '& > div:first-of-type': {
          borderColor: 'rgba(148, 115, 220, 0.5)',
          boxShadow: isTopThree ? getMedalGlow(rank) : 'none',
        },
      }}
    >
      <Box
        position="absolute"
        inset={0}
        borderRadius="inherit"
        bg={isTopThree ? 'rgba(40, 40, 50, 0.7)' : 'rgba(40, 40, 50, 0.5)'}
        border={`1px solid ${medalColor ? `${medalColor}40` : 'rgba(148, 115, 220, 0.15)'}`}
        boxShadow={isTopThree ? getMedalGlow(rank) : 'none'}
        transition="all 0.2s"
        zIndex={-1}
      />

      <HStack spacing={4} align="center">
        {/* Rank badge */}
        <Box
          minW="36px"
          h="36px"
          borderRadius="full"
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg={medalColor ? `${medalColor}20` : 'rgba(148, 115, 220, 0.1)'}
          border={`2px solid ${medalColor || 'rgba(148, 115, 220, 0.3)'}`}
        >
          <Text
            fontSize={isTopThree ? 'lg' : 'md'}
            fontWeight="bold"
            color={medalColor || 'purple.300'}
          >
            {rank}
          </Text>
        </Box>

        {/* Avatar */}
        <Avatar
          size={isTopThree ? 'md' : 'sm'}
          name={user.name}
          bg="purple.500"
        />

        {/* User info */}
        <VStack align="start" spacing={1} flex={1} minW={0}>
          <Text
            fontWeight={isTopThree ? 'bold' : 'medium'}
            color="white"
            fontSize={isTopThree ? 'md' : 'sm'}
            isTruncated
            maxW="100%"
          >
            {user.name}
          </Text>

          {/* Stats */}
          <HStack spacing={4} flexWrap="wrap">
            <HStack spacing={1} color="gray.400" fontSize="xs">
              <Icon as={PiCoinVerticalBold} color={medalColor || 'yellow.400'} />
              <Text>{user.token} tokens</Text>
            </HStack>
            <HStack spacing={1} color="gray.400" fontSize="xs">
              <Icon as={FiCheckSquare} color="green.300" />
              <Text>{user.totalTasksCompleted} tasks</Text>
            </HStack>
            <HStack spacing={1} color="gray.400" fontSize="xs" display={{ base: 'none', md: 'flex' }}>
              <Icon as={FiThumbsUp} color="blue.300" />
              <Text>{user.totalVotes} votes</Text>
            </HStack>
          </HStack>
        </VStack>
      </HStack>
    </Box>
  );
}

export default LeaderboardCard;
