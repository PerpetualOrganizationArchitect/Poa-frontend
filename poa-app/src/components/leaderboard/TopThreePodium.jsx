import React from 'react';
import { Box, Grid, GridItem, Text, VStack } from '@chakra-ui/react';
import LeaderboardCard from './LeaderboardCard';

function TopThreePodium({ users, onUserClick }) {
  if (!users || users.length === 0) return null;

  const [first, second, third] = users;

  // For mobile, show in order 1, 2, 3
  // For desktop, show in podium order: 2, 1, 3
  return (
    <Box w="100%" maxW="900px">
      {/* Desktop podium layout */}
      <Grid
        templateColumns="repeat(3, 1fr)"
        gap={4}
        display={{ base: 'none', md: 'grid' }}
        alignItems="end"
      >
        {/* 2nd place - left, slightly shorter */}
        <GridItem>
          {second && (
            <Box transform="translateY(20px)">
              <LeaderboardCard
                user={second}
                rank={2}
                onClick={onUserClick}
                isTopThree
              />
            </Box>
          )}
        </GridItem>

        {/* 1st place - center, tallest */}
        <GridItem>
          {first && (
            <Box transform="scale(1.05)" transformOrigin="bottom center">
              <LeaderboardCard
                user={first}
                rank={1}
                onClick={onUserClick}
                isTopThree
              />
            </Box>
          )}
        </GridItem>

        {/* 3rd place - right, shortest */}
        <GridItem>
          {third && (
            <Box transform="translateY(30px)">
              <LeaderboardCard
                user={third}
                rank={3}
                onClick={onUserClick}
                isTopThree
              />
            </Box>
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

      {/* Section divider */}
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
    </Box>
  );
}

export default TopThreePodium;
