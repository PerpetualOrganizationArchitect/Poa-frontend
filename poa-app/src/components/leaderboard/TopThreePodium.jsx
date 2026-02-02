import React from 'react';
import { Box, Text, VStack } from '@chakra-ui/react';
import LeaderboardCard from './LeaderboardCard';

function TopThreePodium({ users, onUserClick, hasMoreUsers = false }) {
  if (!users || users.length === 0) return null;

  const [first, second, third] = users;

  // Show top 3 stacked vertically
  return (
    <Box w="100%" maxW="800px">
      <VStack spacing={3} w="100%">
        {first && (
          <Box w="100%">
            <LeaderboardCard
              user={first}
              rank={1}
              onClick={onUserClick}
              isTopThree
            />
          </Box>
        )}
        {second && (
          <Box w="100%">
            <LeaderboardCard
              user={second}
              rank={2}
              onClick={onUserClick}
              isTopThree
            />
          </Box>
        )}
        {third && (
          <Box w="100%">
            <LeaderboardCard
              user={third}
              rank={3}
              onClick={onUserClick}
              isTopThree
            />
          </Box>
        )}
      </VStack>

      {/* Section divider - only show if there are more users */}
      {hasMoreUsers && (
        <Box mt={6} mb={2}>
          <Text
            fontSize="xs"
            color="gray.500"
            textTransform="uppercase"
            letterSpacing="wide"
            textAlign="center"
          >
            Other Contributors
          </Text>
        </Box>
      )}
    </Box>
  );
}

export default TopThreePodium;
