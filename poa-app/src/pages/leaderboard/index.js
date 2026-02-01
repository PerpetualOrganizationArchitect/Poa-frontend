import React, { useEffect, useState } from 'react';
import {
  Box,
  Heading,
  VStack,
  Text,
  useDisclosure,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';

import { usePOContext } from '@/context/POContext';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import LeaderboardCard from '@/components/leaderboard/LeaderboardCard';
import LeaderboardUserModal from '@/components/leaderboard/LeaderboardUserModal';
import TopThreePodium from '@/components/leaderboard/TopThreePodium';

const Leaderboard = () => {
  const router = useRouter();
  const { userDAO } = router.query;

  const { leaderboardDisplayData, roleNames } = usePOContext();
  const [data, setData] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRank, setSelectedRank] = useState(null);

  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    if (leaderboardDisplayData) {
      setData(leaderboardDisplayData);
    }
  }, [leaderboardDisplayData]);

  const handleUserClick = (user, rank) => {
    setSelectedUser(user);
    setSelectedRank(rank);
    onOpen();
  };

  const handleModalClose = () => {
    onClose();
    setSelectedUser(null);
    setSelectedRank(null);
  };

  const topThree = data.slice(0, 3);
  const remaining = data.slice(3);

  return (
    <>
      <Navbar />
      <Box
        position="relative"
        w="100%"
        minH="100vh"
        p={{ base: 4, md: 6 }}
      >
        <VStack spacing={6} align="center">
          <Heading as="h1" size="lg" color="white">
            Leaderboard
          </Heading>

          {data.length === 0 ? (
            <Box
              position="relative"
              borderRadius="2xl"
              p={8}
              overflow="hidden"
              textAlign="center"
            >
              <Box style={glassLayerStyle} />
              <Text color="gray.400">No contributors yet</Text>
            </Box>
          ) : (
            <>
              {/* Top 3 Podium */}
              <TopThreePodium
                users={topThree}
                onUserClick={handleUserClick}
                hasMoreUsers={remaining.length > 0}
              />

              {/* Remaining users */}
              {remaining.length > 0 && (
                <Box
                  w="100%"
                  maxW="800px"
                  position="relative"
                  borderRadius="2xl"
                  overflow="hidden"
                >
                  <Box style={glassLayerStyle} />
                  <VStack spacing={2} p={{ base: 3, md: 4 }}>
                    {remaining.map((user, idx) => (
                      <Box key={user.id} w="100%">
                        <LeaderboardCard
                          user={user}
                          rank={idx + 4}
                          onClick={handleUserClick}
                        />
                      </Box>
                    ))}
                  </VStack>
                </Box>
              )}
            </>
          )}
        </VStack>

        {/* User Detail Modal */}
        <LeaderboardUserModal
          isOpen={isOpen}
          onClose={handleModalClose}
          user={selectedUser}
          rank={selectedRank}
          roleNames={roleNames}
        />
      </Box>
    </>
  );
};

export default Leaderboard;
