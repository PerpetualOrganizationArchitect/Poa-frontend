import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  VStack,
  Grid,
  GridItem,
  Text,
  HStack,
  Icon,
  Badge,
  Link,
  Image,
  Button,
  Spinner,
  Center,
  useBreakpointValue,
  Flex,
  Wrap,
  WrapItem,
  Stat,
  StatLabel,
  StatNumber,
  SimpleGrid,
  Collapse,
} from '@chakra-ui/react';
import { useVotingContext } from '@/context/VotingContext';
import { usePOContext } from '@/context/POContext';
import { useProjectContext } from '@/context/ProjectContext';
import { useUserContext } from '@/context/UserContext';
import Link2 from 'next/link';
import OngoingPolls from '@/components/userPage/OngoingPolls';
import { useRouter } from 'next/router';
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { FaLink } from 'react-icons/fa';
import { FiUsers, FiAward, FiActivity, FiCheckCircle, FiChevronDown, FiChevronRight, FiUserPlus } from 'react-icons/fi';
import { useIPFScontext } from "@/context/ipfsContext";
import { useOrgStructure } from '@/hooks/useOrgStructure';
import { VouchingSection } from '@/components/orgStructure/VouchingSection';
import { OrgStructureCard } from '@/components/dashboard/OrgStructureCard';

const PerpetualOrgDashboard = () => {
  const { ongoingPolls } = useVotingContext();
  console.log("ongoingPolls", ongoingPolls);
  const { poContextLoading, poDescription, poLinks, logoHash, activeTaskAmount, completedTaskAmount, ptTokenBalance, poMembers, rules, educationModules, roleHatIds, educationHubEnabled } = usePOContext();

  const router = useRouter();
  const { userDAO } = router.query;
  const [imageURL, setImageURL] = useState({});
  const [imageFetched, setImageFetched] = useState(false);
  const [isVouchingExpanded, setIsVouchingExpanded] = useState(false);
  const { fetchImageFromIpfs } = useIPFScontext();

  // Responsive design breakpoints
  const isMobile = useBreakpointValue({ base: true, sm: true, md: false });
  const logoWidth = useBreakpointValue({ base: "160px", sm: "180px", md: "220px" });
  const headingSize = useBreakpointValue({ base: "2xl", sm: "3xl", md: "4xl" });
  const sectionHeadingSize = useBreakpointValue({ base: "xl", md: "2xl" });
  const textSize = useBreakpointValue({ base: "sm", md: "md" });
  const statsTextSize = useBreakpointValue({ base: "md", md: "lg" });
  const leaderboardTitle = useBreakpointValue({
    base: "Members & Leaderboard",
    md: "Browse Members and Leaderboard"
  });

  useEffect(() => {
    const fetchImage = async () => {
      if (logoHash && !imageFetched) {
        const imageUrlFetch = await fetchImageFromIpfs(logoHash);
        setImageURL(imageUrlFetch);
        setImageFetched(true);
      }
    };
    fetchImage();
  }, [logoHash]);

  const { leaderboardDisplayData } = usePOContext();
  const { recommendedTasks } = useProjectContext();
  const { userData } = useUserContext();
  const { roles, totalMembers, governance, eligibilityModuleAddress } = useOrgStructure();

  // Vouching section logic - only show if user can vouch for any role
  const userHatIds = userData?.hatIds || [];
  const rolesWithVouching = useMemo(() => {
    return roles?.filter(role => role.vouchingEnabled) || [];
  }, [roles]);

  const showVouchingSection = useMemo(() => {
    if (!rolesWithVouching.length || !userHatIds.length) return false;
    return rolesWithVouching.some(role => {
      const membershipHatId = role.vouchingMembershipHatId;
      if (!membershipHatId) return false;
      const normalizedMembership = String(membershipHatId).toLowerCase();
      return userHatIds.some(id => String(id).toLowerCase() === normalizedMembership);
    });
  }, [rolesWithVouching, userHatIds]);

  const getMedalColor = (rank) => {
    switch (rank) {
      case 0:
        return 'gold';
      case 1:
        return 'silver';
      case 2:
        return '#cd7f32';
      default:
        return null;
    }
  };

  const glassLayerStyle = {
    position: 'absolute',
    height: '100%',
    width: '100%',
    zIndex: -1,
    borderRadius: 'inherit',
    backdropFilter: 'blur(70px)',
    backgroundColor: 'rgba(0, 0, 0, .79)',
  };

  const difficultyColorScheme = {
    easy: 'green',
    medium: 'yellow',
    hard: 'orange',
    veryhard: 'red'
  };

  return (
    <>
      <Navbar />
      {poContextLoading ? (
        <Center height="100vh">
          <Spinner size="xl" />
        </Center>
      ) : (
        <Box p={{ base: 2, md: 4 }} mt={{ base: 16, md: 0 }}>
            <Grid
              color="whitesmoke"
              templateAreas={{
                base: educationHubEnabled ? `
                  'orgInfo'
                  'orgStats'
                  'tasks'
                  'polls'
                  'leaderboard'
                  'orgStructure'
                  ${showVouchingSection ? "'vouching'" : ''}
                  'learnAndEarn'
                ` : `
                  'orgInfo'
                  'orgStats'
                  'tasks'
                  'polls'
                  'leaderboard'
                  'orgStructure'
                  ${showVouchingSection ? "'vouching'" : ''}
                `,
                md: educationHubEnabled ? `
                  'orgInfo orgStats'
                  'tasks polls'
                  'leaderboard orgStructure'
                  ${showVouchingSection ? "'vouching .'" : ''}
                  'learnAndEarn learnAndEarn'
                ` : `
                  'orgInfo orgStats'
                  'tasks polls'
                  'leaderboard orgStructure'
                  ${showVouchingSection ? "'vouching .'" : ''}
                `,
              }}
              templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}
              gap={{ base: 3, md: 4 }}
            >
            <GridItem area={'orgInfo'}>
              <Box
                w={{ base: "100%", md: "125%" }}
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} position="relative" borderTopRadius="2xl" align="flex-start">
                  <div style={glassLayerStyle} />
                  <HStack spacing={4}>
                    <Text pl={{ base: 3, md: 6 }} letterSpacing="-1%" fontSize={headingSize} fontWeight="bold">
                      {userDAO}'s Dashboard
                    </Text>
                  </HStack>
                </VStack>
                <Flex 
                  direction={{ base: "column", sm: "row" }} 
                  spacing={4} 
                  justify="space-between" 
                  w="100%" 
                  p={{ base: 3, md: 4 }}
                >
                  <Box pl={{ base: "0", md: "12px" }} mb={{ base: 3, sm: 0 }} alignSelf={{ base: "center", sm: "flex-start" }}>
                    <Image mb="0" src={imageURL} alt="Organization Logo" width={logoWidth} />
                  </Box>
                  <VStack ml={{ base: 0, sm: 2 }} align="flex-start" pr={{ base: 2, md: "10px" }} spacing={2} w="100%">
                    <Box>
                      <Text fontWeight={"bold"} fontSize={{ base: "lg", md: "xl" }} mt={0}>
                        Description:
                      </Text>
                      <Text mt="-1" fontSize={textSize} ml="2">
                        {poDescription}
                      </Text>
                    </Box>
                    <Box>
                      <HStack spacing={2} align="center">
                        <Icon as={FaLink} boxSize={4} />
                        <Text fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
                          Links
                        </Text>
                      </HStack>
                      <Wrap ml="4" mt="1" spacing={2} align="center">
                        {poLinks && poLinks.length > 0 ? (
                          poLinks.map((link, index) => (
                            <WrapItem key={index}>
                              <Text mt="-2" fontSize={textSize}>
                                <Link fontSize={{ base: "md", md: "xl" }} fontWeight={"bold"} href={link.url} isExternal color="blue.400">
                                  {link.name}
                                </Link>
                              </Text>
                            </WrapItem>
                          ))
                        ) : (
                          <Text fontSize={{ base: "md", md: "lg" }} mt={2}>No links available</Text>
                        )}
                      </Wrap>
                    </Box>
                  </VStack>
                </Flex>
              </Box>
            </GridItem>

            <GridItem area={'orgStats'}>
              <Box
                h="100%"
                ml={{ base: 0, md: "25%" }}
                w={{ base: "100%", md: "75%" }}
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Organization Stats
                  </Text>
                </VStack>
                <Box p={{ base: 2, md: 3 }}>
                  <SimpleGrid columns={2} spacing={{ base: 2, md: 3 }}>
                    <Box bg="whiteAlpha.50" p={{ base: 2, md: 3 }} borderRadius="lg">
                      <Stat textAlign="center">
                        <HStack justify="center" spacing={2}>
                          <Icon as={FiUsers} color="purple.300" boxSize={{ base: 4, md: 5 }} />
                          <StatNumber fontSize={{ base: "lg", md: "xl" }} color="purple.300">{poMembers}</StatNumber>
                        </HStack>
                        <StatLabel fontSize="xs" color="gray.400">Members</StatLabel>
                      </Stat>
                    </Box>
                    <Box bg="whiteAlpha.50" p={{ base: 2, md: 3 }} borderRadius="lg">
                      <Stat textAlign="center">
                        <HStack justify="center" spacing={2}>
                          <Icon as={FiAward} color="yellow.300" boxSize={{ base: 4, md: 5 }} />
                          <StatNumber fontSize={{ base: "lg", md: "xl" }} color="yellow.300">{ptTokenBalance}</StatNumber>
                        </HStack>
                        <StatLabel fontSize="xs" color="gray.400">Total Participation</StatLabel>
                      </Stat>
                    </Box>
                    <Box bg="whiteAlpha.50" p={{ base: 2, md: 3 }} borderRadius="lg">
                      <Stat textAlign="center">
                        <HStack justify="center" spacing={2}>
                          <Icon as={FiActivity} color="blue.300" boxSize={{ base: 4, md: 5 }} />
                          <StatNumber fontSize={{ base: "lg", md: "xl" }} color="blue.300">{activeTaskAmount}</StatNumber>
                        </HStack>
                        <StatLabel fontSize="xs" color="gray.400">Active Tasks</StatLabel>
                      </Stat>
                    </Box>
                    <Box bg="whiteAlpha.50" p={{ base: 2, md: 3 }} borderRadius="lg">
                      <Stat textAlign="center">
                        <HStack justify="center" spacing={2}>
                          <Icon as={FiCheckCircle} color="green.300" boxSize={{ base: 4, md: 5 }} />
                          <StatNumber fontSize={{ base: "lg", md: "xl" }} color="green.300">{completedTaskAmount}</StatNumber>
                        </HStack>
                        <StatLabel fontSize="xs" color="gray.400">Completed Tasks</StatLabel>
                      </Stat>
                    </Box>
                  </SimpleGrid>
                </Box>
              </Box>
            </GridItem>

            <GridItem area={'tasks'}>
              <Box
                h="100%"
                w="100%"
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Recommended Tasks
                  </Text>
                </VStack>
                <Flex 
                  direction={{ base: "column", md: "row" }}
                  wrap={{ base: "nowrap", md: "wrap" }}
                  justify="space-between" 
                  gap={3}
                  pb={2} 
                  px={{ base: 3, md: 4 }} 
                  pt={2}
                >
                  {recommendedTasks?.slice(0, 3).map((task) => (
                    <Box
                      key={task.id}
                      w={{ base: "100%", md: "31%" }}
                      mb={{ base: 2, md: 0 }}
                      _hover={{ transform: "translateY(-2px)", boxShadow: "0 8px 25px rgba(0,0,0,0.3)" }}
                      transition="all 0.2s"
                      p={4}
                      borderRadius="2xl"
                      overflow="hidden"
                      bg="black"
                    >
                      <Link2 href={`/tasks/?task=${task.id}&projectId=${encodeURIComponent(decodeURIComponent(task.projectId))}&userDAO=${userDAO}`}>
                        <VStack textColor="white" align="stretch" spacing={3}>
                          <Text mt="-2" fontSize={textSize} lineHeight="99%" fontWeight="extrabold">
                            {task.isIndexing ? 'Indexing...' : task.title}
                          </Text>
                          <HStack justify="space-between">
                            <Badge colorScheme="purple">{task.status}</Badge>
                            <Text fontWeight="bold">{task.payout} Tokens</Text>
                          </HStack>
                        </VStack>
                      </Link2>
                    </Box>
                  ))}
                </Flex>
              </Box>
            </GridItem>

            <GridItem area={'polls'}>
              <Box
               h="100%"
                w="100%"
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Ongoing Polls
                  </Text>
                </VStack>
                
                <Box w="100%" p={{ base: 2, md: 4 }}>
                  <OngoingPolls OngoingPolls={ongoingPolls} />
                </Box>
              </Box>
            </GridItem>

            <GridItem area={'leaderboard'}>
              <Link2 href={`/leaderboard?userDAO=${userDAO}`}>
                <Box
                  h="100%"
                  w="100%"
                  borderRadius="2xl"
                  bg="transparent"
                  boxShadow="lg"
                  position="relative"
                  zIndex={2}
                  _hover={{ transform: "translateY(-2px)", boxShadow: "0 8px 25px rgba(0,0,0,0.3)" }}
                  transition="all 0.2s"
                >
                  <div style={glassLayerStyle} />
                  <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                    <div style={glassLayerStyle} />
                    <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                      {leaderboardTitle}
                    </Text>
                  </VStack>
                  <Box p={{ base: 2, md: 4 }}>
                    {Array.isArray(leaderboardDisplayData) && leaderboardDisplayData.length > 0 ? (
                      leaderboardDisplayData.slice(0, 5).map((entry, index) => {
                        const medalColor = getMedalColor(index);
                        return (
                          <HStack 
                            ml={{ base: 2, md: 6 }} 
                            key={entry.id} 
                            spacing={{ base: 2, md: 4 }} 
                            alignItems="center"
                          >
                            <Text fontSize={{ base: "lg", md: "xl" }} fontWeight={medalColor ? 'extrabold' : null} color={medalColor}>
                              {index + 1}
                            </Text>
                            <Text fontWeight={medalColor ? 'extrabold' : null} fontSize={{ base: "lg", md: "2xl" }}>{entry.name}</Text>
                            <Badge ml="2" fontSize={{ base: "sm", md: "md" }} colorScheme="blue">{entry.token} Tokens</Badge>
                          </HStack>
                        );
                      })
                    ) : (
                      <Text pl={{ base: 3, md: 6 }} fontSize={textSize} mt={2}>No leaderboard data available</Text>
                    )}
                  </Box>
                </Box>
              </Link2>
            </GridItem>

            <GridItem area={'orgStructure'}>
              <OrgStructureCard
                roles={roles}
                totalMembers={totalMembers}
                governance={governance}
                userDAO={userDAO}
                sectionHeadingSize={sectionHeadingSize}
              />
            </GridItem>
            {showVouchingSection && (
              <GridItem area={'vouching'}>
                <Box
                  w="100%"
                  borderRadius="2xl"
                  bg="transparent"
                  boxShadow="lg"
                  position="relative"
                  zIndex={2}
                >
                  <div style={glassLayerStyle} />
                  <Box
                    as="button"
                    width="100%"
                    onClick={() => setIsVouchingExpanded(!isVouchingExpanded)}
                    position="relative"
                    borderTopRadius="2xl"
                    _hover={{ bg: 'rgba(148, 115, 220, 0.05)' }}
                    transition="background-color 0.2s"
                  >
                    <div style={glassLayerStyle} />
                    <HStack justify="space-between" px={{ base: 3, md: 6 }} py={2}>
                      <HStack spacing={2}>
                        <Icon as={FiUserPlus} color="purple.300" />
                        <Text fontWeight="bold" fontSize={sectionHeadingSize}>
                          Member Vouching
                        </Text>
                      </HStack>
                      <Icon
                        as={isVouchingExpanded ? FiChevronDown : FiChevronRight}
                        color="purple.300"
                        boxSize={5}
                        transition="transform 0.2s"
                      />
                    </HStack>
                  </Box>
                  <Collapse in={isVouchingExpanded} animateOpacity>
                    <Box p={{ base: 2, md: 4 }}>
                      <VouchingSection
                        roles={rolesWithVouching}
                        eligibilityModuleAddress={eligibilityModuleAddress}
                        userHatIds={userHatIds}
                        userAddress={userData?.id}
                        isConnected={true}
                        embedded={true}
                      />
                    </Box>
                  </Collapse>
                </Box>
              </GridItem>
            )}
            {educationHubEnabled && (
              <GridItem area={'learnAndEarn'}>
                <Box
                  h="100%"
                  w="100%"
                  borderRadius="2xl"
                  bg="transparent"
                  boxShadow="lg"
                  position="relative"
                  zIndex={2}
                >
                  <div style={glassLayerStyle} />
                  <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                    <div style={glassLayerStyle} />
                    <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                      Learn and Earn
                    </Text>
                  </VStack>
                  <Box p={{ base: 2, md: 4 }}>
                    {educationModules && educationModules.length > 0 ? (
                      <Flex
                        direction={{ base: "column", md: "row" }}
                        spacing={4}
                        gap={3}
                        align="flex-start"
                      >
                        {educationModules.slice(0,3).map((module) => (
                          <Box
                            key={module.id}
                            w={{ base: "100%", md: "33%" }}
                            h="auto"
                            p={4}
                            borderRadius="xl"
                            onClick={() => router.push(`/edu-Hub`)}
                            bg="black"
                            _hover={{ transform: "translateY(-2px)", boxShadow: "0 8px 25px rgba(0,0,0,0.3)" }}
                            transition="all 0.2s"
                            cursor="pointer"
                            mb={{ base: 2, md: 0 }}
                          >

                              <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="bold">
                                {module.isIndexing ? 'Indexing...' : module.name}
                              </Text>
                              <HStack mt={6} justifyContent="space-between">
                            {/* <Text mt={2}>{module.description}</Text> */}
                            <Link2 href={`/edu-Hub`}>

                              <Button colorScheme="teal" size={{ base: "xs", md: "sm" }}>
                                {module.isIndexing ? 'Coming Soon' : 'Start Module'}
                              </Button>

                            </Link2>
                            <Badge fontSize={{ base: "md", md: "lg" }} colorScheme="teal">{module.payout} Tokens</Badge>
                            </HStack>
                          </Box>
                        ))}
                      </Flex>
                    ) : (
                      <Text pl={{ base: 3, md: 6 }} fontSize={textSize} mt={2}>
                        No modules available at this time.
                      </Text>
                    )}
                  </Box>
                </Box>
              </GridItem>
            )}
          </Grid>
        </Box>
      )}
    </>
  );
};

export default PerpetualOrgDashboard;
