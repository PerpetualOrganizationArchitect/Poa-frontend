import SEOHead from "@/components/common/SEOHead";
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
  Center,
  useBreakpointValue,
  useClipboard,
  Flex,
  Wrap,
  WrapItem,
  Stat,
  StatLabel,
  StatNumber,
  SimpleGrid,
  Collapse,
  Tooltip,
} from '@chakra-ui/react';
import PostDeployLoadingScreen from '@/components/shared/PostDeployLoadingScreen';
import PulseLoader from "@/components/shared/PulseLoader";
import { useVotingContext } from '@/context/VotingContext';
import { usePOContext } from '@/context/POContext';
import { useProjectContext } from '@/context/ProjectContext';
import { useUserContext } from '@/context/UserContext';
import Link2 from 'next/link';
import OngoingPolls from '@/components/userPage/OngoingPolls';
import { useRouter } from 'next/router';
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { FiUsers, FiAward, FiActivity, FiCheckCircle, FiChevronDown, FiChevronRight, FiUserPlus, FiCopy, FiCheck, FiExternalLink, FiInbox, FiBarChart2, FiBookOpen, FiArrowRight, FiMap } from 'react-icons/fi';
import { useTour } from '@/features/tour';
import { useIPFScontext } from "@/context/ipfsContext";
import { useOrgStructure, useOrgTheme } from '@/hooks';
import { useOrgName } from '@/hooks/useOrgName';
import { VouchingSection } from '@/components/orgStructure/VouchingSection';
import { OrgStructureCard } from '@/components/dashboard/OrgStructureCard';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { useOrgGate } from "@/components/shared/OrgDeadEnd";

const PerpetualOrgDashboard = () => {
  const { ongoingPolls } = useVotingContext();
  const { poContextLoading, poDescription, poLinks, logoUrl, activeTaskAmount, completedTaskAmount, ptTokenBalance, poMembers, rules, educationModules, roleHatIds, educationHubEnabled, tokenLabel = 'Shares' } = usePOContext();
  const { pageBackground } = useOrgTheme();
  const { startTour, isActive: isTourActive } = useTour();
  const router = useRouter();
  const userDAO = useOrgName();
  const orgGate = useOrgGate();
  // null until the IPFS fetch resolves — anything else (notably {}) renders
  // an `<img src="[object Object]">` that the browser resolves as a relative
  // path and 404s before the real src lands.
  const [imageURL, setImageURL] = useState(null);
  const [imageFetched, setImageFetched] = useState(false);
  const [isVouchingExpanded, setIsVouchingExpanded] = useState(false);
  const { fetchImageFromIpfs } = useIPFScontext();

  const inviteLink = typeof window !== 'undefined' && userDAO
    ? `${window.location.origin}/join?org=${encodeURIComponent(userDAO)}`
    : '';
  const { hasCopied, onCopy } = useClipboard(inviteLink);

  // Responsive design breakpoints — single call to reduce matchMedia listeners
  const bp = useBreakpointValue({
    base: { isMobile: true, logoWidth: "160px", headingSize: "2xl", sectionHeadingSize: "xl", textSize: "sm", statsTextSize: "md" },
    sm: { isMobile: true, logoWidth: "180px", headingSize: "3xl", sectionHeadingSize: "xl", textSize: "sm", statsTextSize: "md" },
    md: { isMobile: false, logoWidth: "220px", headingSize: "4xl", sectionHeadingSize: "2xl", textSize: "md", statsTextSize: "lg" },
  }) || {};
  const { isMobile, logoWidth, headingSize, sectionHeadingSize, textSize, statsTextSize } = bp;

  useEffect(() => {
    const fetchImage = async () => {
      if (logoUrl && !imageFetched) {
        const imageUrlFetch = await fetchImageFromIpfs(logoUrl);
        setImageURL(imageUrlFetch);
        setImageFetched(true);
      }
    };
    fetchImage();
  }, [logoUrl]);

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

  const difficultyColorScheme = {
    easy: 'green',
    medium: 'yellow',
    hard: 'orange',
    veryhard: 'red'
  };

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;
  return (
    <>
      <SEOHead
        title="Dashboard"
        description="Your organization dashboard."
        path="/dashboard"
        noIndex
      />
      <Navbar />
      {poContextLoading ? (
        router.query.newOrg === 'true' ? (
          <PostDeployLoadingScreen orgName={userDAO} />
        ) : (
          <Center height="100vh" background={pageBackground()}>
            <PulseLoader size="xl" />
          </Center>
        )
      ) : (
        <Box p={{ base: 2, md: 4 }} minH="100vh" background={pageBackground()}>
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
                  'learnAndEarn'
                  ${showVouchingSection ? "'vouching'" : ''}
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
                  'learnAndEarn learnAndEarn'
                  ${showVouchingSection ? "'vouching .'" : ''}
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
                data-tour="org-info"
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
                    {imageURL && (
                      <Image mb="0" src={imageURL} alt="Organization Logo" width={logoWidth} />
                    )}
                  </Box>
                  <VStack ml={{ base: 0, sm: 2 }} align="flex-start" pr={{ base: 2, md: "10px" }} spacing={2} w="100%">
                    <Box>
                      <Text fontWeight={"bold"} fontSize={{ base: "lg", md: "xl" }} mt={0}>
                        Description:
                      </Text>
                      <Text mt={1} mb={1} fontSize={textSize} ml="2" lineHeight="tall">
                        {poDescription}
                      </Text>
                    </Box>
                    {poLinks && poLinks.length > 0 && (
                      <Wrap spacing={2} align="center">
                        {poLinks.map((link, index) => (
                          <WrapItem key={index}>
                            <Link href={link.url} isExternal _hover={{ textDecoration: 'none' }}>
                              <HStack
                                spacing={1.5}
                                px={3}
                                py={1}
                                borderRadius="full"
                                bg="whiteAlpha.100"
                                border="1px solid"
                                borderColor="whiteAlpha.200"
                                _hover={{
                                  bg: 'whiteAlpha.200',
                                  borderColor: 'purple.400',
                                  transform: 'translateY(-1px)',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                }}
                                transition="all 0.2s"
                              >
                                <Icon as={FiExternalLink} boxSize={3} color="purple.300" />
                                <Text fontSize={textSize} fontWeight="medium" color="whiteAlpha.900">
                                  {link.name}
                                </Text>
                              </HStack>
                            </Link>
                          </WrapItem>
                        ))}
                      </Wrap>
                    )}
                  </VStack>
                </Flex>
                <HStack display="flex" justifyContent="flex-end" px={{ base: 3, md: 4 }} pb={{ base: 3, md: 4 }} spacing={2}>
                  {!isTourActive && (
                    <Tooltip label="Take a guided tour of your organization" hasArrow>
                      <Button
                        onClick={() => startTour(userDAO)}
                        size="sm"
                        variant="outline"
                        leftIcon={<Icon as={FiMap} />}
                        borderColor="amethyst.400"
                        color="amethyst.300"
                        _hover={{ bg: 'purple.900' }}
                        transition="all 0.2s"
                      >
                        Tour Org
                      </Button>
                    </Tooltip>
                  )}
                  <Tooltip label={hasCopied ? 'Copied!' : 'Copy invite link to clipboard'} closeOnClick={false} hasArrow>
                    <Button
                      onClick={onCopy}
                      size="sm"
                      variant="outline"
                      colorScheme={hasCopied ? 'green' : 'purple'}
                      leftIcon={<Icon as={hasCopied ? FiCheck : FiCopy} />}
                      borderColor={hasCopied ? 'green.400' : 'purple.400'}
                      color={hasCopied ? 'green.300' : 'purple.300'}
                      _hover={{ bg: hasCopied ? 'green.900' : 'purple.900' }}
                      transition="all 0.2s"
                    >
                      {hasCopied ? 'Copied!' : 'Copy Invite Link'}
                    </Button>
                  </Tooltip>
                </HStack>
              </Box>
            </GridItem>

            <GridItem area={'orgStats'}>
              <Box
                data-tour="org-stats"
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
                {recommendedTasks?.length > 0 ? (
                  <Flex
                    direction={{ base: "column", md: "row" }}
                    wrap={{ base: "nowrap", md: "wrap" }}
                    justify="space-between"
                    gap={3}
                    pb={2}
                    px={{ base: 3, md: 4 }}
                    pt={2}
                  >
                    {recommendedTasks.slice(0, 3).map((task) => (
                      <Box
                        key={task.id}
                        w={{ base: "100%", md: "31%" }}
                        mb={{ base: 2, md: 0 }}
                        _hover={{ transform: "translateY(-2px)", boxShadow: "0 8px 25px rgba(0,0,0,0.3)" }}
                        transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                        p={4}
                        borderRadius="2xl"
                        overflow="hidden"
                        bg="black"
                      >
                        <Link2 href={`/tasks/?task=${task.id}&projectId=${encodeURIComponent(decodeURIComponent(task.projectId))}&org=${encodeURIComponent(userDAO)}`}>
                          <VStack textColor="white" align="stretch" spacing={3}>
                            <Text mt="-2" fontSize={textSize} lineHeight="99%" fontWeight="extrabold">
                              {task.isIndexing ? 'Indexing...' : task.title}
                            </Text>
                            <HStack justify="space-between">
                              <Badge colorScheme="purple">{task.status}</Badge>
                              <Text fontWeight="bold">{task.payout} {tokenLabel}</Text>
                            </HStack>
                          </VStack>
                        </Link2>
                      </Box>
                    ))}
                  </Flex>
                ) : (
                  <Center py={8} flexDirection="column">
                    <Icon as={FiInbox} boxSize={8} color="whiteAlpha.300" mb={3} />
                    <Text fontSize={textSize} color="whiteAlpha.500" fontWeight="medium">
                      No recommended tasks yet
                    </Text>
                    <Text fontSize="xs" color="whiteAlpha.300" mt={1}>
                      Tasks will appear here as they become available
                    </Text>
                  </Center>
                )}
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
              <Link2 href={`/leaderboard?org=${encodeURIComponent(userDAO)}`}>
                <Box
                  h="100%"
                  w="100%"
                  borderRadius="2xl"
                  bg="transparent"
                  boxShadow="lg"
                  position="relative"
                  zIndex={2}
                  sx={{
                    '& .arrow-icon': {
                      transition: 'transform 0.2s ease',
                    },
                  }}
                  _hover={{
                    transform: "translateY(-2px)",
                    boxShadow: "0 8px 25px rgba(0,0,0,0.3)",
                    '& .arrow-icon': {
                      transform: 'translateX(4px)',
                      color: 'purple.300',
                    },
                  }}
                  transition="transform 0.2s, box-shadow 0.2s"
                >
                  <div style={glassLayerStyle} />
                  <HStack pb={1} justify="space-between" align="center" position="relative" borderTopRadius="2xl" pr={{ base: 3, md: 6 }}>
                    <div style={glassLayerStyle} />
                    <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                      Members
                    </Text>
                    <Icon as={FiArrowRight} className="arrow-icon" color="gray.500" boxSize={5} />
                  </HStack>
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
                            <Badge ml="2" fontSize={{ base: "sm", md: "md" }} colorScheme="blue">{entry.token} {tokenLabel}</Badge>
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
                  cursor="pointer"
                  onClick={() => setIsVouchingExpanded(!isVouchingExpanded)}
                  _hover={{ transform: "translateY(-1px)", boxShadow: "0 8px 25px rgba(0,0,0,0.3)" }}
                  transition="transform 0.2s, box-shadow 0.2s"
                >
                  <div style={glassLayerStyle} />
                  <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                    <div style={glassLayerStyle} />
                    <HStack justify="space-between" w="100%" px={{ base: 3, md: 6 }}>
                      <HStack spacing={2}>
                        <Icon as={FiUserPlus} color="purple.300" />
                        <Text fontWeight="bold" fontSize={sectionHeadingSize}>
                          Member Vouching
                        </Text>
                      </HStack>
                      <HStack spacing={3}>
                        <Badge colorScheme="purple" fontSize="xs" borderRadius="full" px={2}>
                          {rolesWithVouching.length} {rolesWithVouching.length === 1 ? 'role' : 'roles'}
                        </Badge>
                        <Icon
                          as={isVouchingExpanded ? FiChevronDown : FiChevronRight}
                          color="purple.300"
                          boxSize={5}
                          transition="transform 0.2s"
                        />
                      </HStack>
                    </HStack>
                  </VStack>
                  <Box px={{ base: 3, md: 6 }} py={{ base: 3, md: 4 }}>
                    <Collapse in={isVouchingExpanded} animateOpacity>
                      <Box onClick={(e) => e.stopPropagation()} cursor="default" pb={2}>
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
                    {!isVouchingExpanded && (
                      <Text fontSize={textSize} color="gray.400">
                        Review and vouch for pending membership requests
                      </Text>
                    )}
                  </Box>
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
                            onClick={() => router.push(`/learn/?org=${encodeURIComponent(userDAO)}`)}
                            bg="black"
                            _hover={{ transform: "translateY(-2px)", boxShadow: "0 8px 25px rgba(0,0,0,0.3)" }}
                            transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                            cursor="pointer"
                            mb={{ base: 2, md: 0 }}
                          >

                              <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="bold">
                                {module.isIndexing ? 'Indexing...' : module.name}
                              </Text>
                              <HStack mt={6} justifyContent="space-between">
                            {/* <Text mt={2}>{module.description}</Text> */}
                            <Link2 href={`/learn/?org=${encodeURIComponent(userDAO)}`}>

                              <Button colorScheme="teal" size={{ base: "xs", md: "sm" }}>
                                {module.isIndexing ? 'Coming Soon' : 'Start Module'}
                              </Button>

                            </Link2>
                            <Badge fontSize={{ base: "md", md: "lg" }} colorScheme="teal">{module.payout} {tokenLabel}</Badge>
                            </HStack>
                          </Box>
                        ))}
                      </Flex>
                    ) : (
                      <Center py={8} flexDirection="column">
                        <Icon as={FiBookOpen} boxSize={8} color="whiteAlpha.300" mb={3} />
                        <Text fontSize={textSize} color="whiteAlpha.500" fontWeight="medium">
                          No modules available yet
                        </Text>
                        <Text fontSize="xs" color="whiteAlpha.300" mt={1}>
                          Learning modules will be listed here once published
                        </Text>
                      </Center>
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
