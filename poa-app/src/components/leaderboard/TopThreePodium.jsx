import React from 'react';
import { Box, Grid, GridItem, Text, VStack } from '@chakra-ui/react';
import LeaderboardCard from './LeaderboardCard';

function TopThreePodium({ users, onUserClick, hasMoreUsers = false }) {
  if (!users || users.length === 0) return null;

  const [first, second, third] = users;

  // Show top 3 in order: 1st, 2nd, 3rd on same horizontal plane
  return (
    <Box w="100%" maxW="900px">
      {/* Desktop horizontal layout */}
      <Grid
        templateColumns="repeat(3, 1fr)"
        gap={4}
        display={{ base: 'none', md: 'grid' }}
        alignItems="stretch"
      >
        <GridItem>
          {first && (
            <LeaderboardCard
              user={first}
              rank={1}
              onClick={onUserClick}
              isTopThree
            />
          )}
        </GridItem>

        <GridItem>
          {second && (
            <LeaderboardCard
              user={second}
              rank={2}
              onClick={onUserClick}
              isTopThree
            />
          )}
        </GridItem>

        <GridItem>
          {third && (
            <LeaderboardCard
              user={third}
              rank={3}
              onClick={onUserClick}
              isTopThree
            />
          )}
        </GridItem>
      </Grid>

      {/* Mobile stacked layout */}
      <VStack
        spacing={3}
        display={{ base: 'flex', md: 'none' }}
        w="100%"
      >
        {first && (
          <LeaderboardCard
            user={first}
            rank={1}
            onClick={onUserClick}
            isTopThree
          />
        )}
        {second && (
          <LeaderboardCard
            user={second}
            rank={2}
            onClick={onUserClick}
            isTopThree
          />
        )}
        {third && (
          <LeaderboardCard
            user={third}
            rank={3}
            onClick={onUserClick}
            isTopThree
          />
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
