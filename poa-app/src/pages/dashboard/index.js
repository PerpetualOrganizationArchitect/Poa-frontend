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
import { useAuthoritySubjects } from '@/hooks/accessV2';
import { useOrgName } from '@/hooks/useOrgName';
import RolesGroupsPanel from '@/components/accessV2/RolesGroupsPanel';
import UserIdentity from '@/components/common/UserIdentity';
import { OrgStructureCard } from '@/components/dashboard/OrgStructureCard';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { useOrgGate } from "@/components/shared/OrgDeadEnd";

const PerpetualOrgDashboard = () => {
  const { ongoingPolls, votingClasses } = useVotingContext();
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
    base: { logoSize: "96px", headingSize: "2xl", sectionHeadingSize: "xl", textSize: "sm" },
    sm: { logoSize: "104px", headingSize: "3xl", sectionHeadingSize: "xl", textSize: "sm" },
    md: { logoSize: "132px", headingSize: "4xl", sectionHeadingSize: "2xl", textSize: "md" },
  }) || {};
  const { logoSize, headingSize, sectionHeadingSize, textSize } = bp;

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

  // On a live-authority org the structure card previews the fold mirror's roles, not the retired
  // hat entities (which render raw subject ids and miss every role created after migration).
  const v2 = useAuthoritySubjects();
  const cardRoles = useMemo(() => {
    if (!v2.enabled) return [];
    return (v2.roles || []).map((r) => ({ id: r.subjectId, hatId: r.hatId, name: r.name, memberCount: r.memberCount }));
  }, [v2.enabled, v2.roles]);

  const rolesWithVouching = v2.roles.filter(role => role.vouchConfig?.enabled);
  const showVouchingSection = rolesWithVouching.length > 0;

  const getMedalColor = (rank) => {
    switch (rank) {
      case 0:
        return '#FFD700';
      // CSS 'silver' reads as plain white on the dark glass — use a cooler,
      // clearly-metallic tone so the 1-2-3 medal set actually looks finished.
      case 1:
        return '#C7CCD6';
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

  // POContext substitutes placeholder sentences when org metadata has no
  // description; without the old "Description:" field label those would read
  // as the org's own prose, so they render muted instead.
  const isPlaceholderDescription = /^(No description provided|Organization description loading)/.test(poDescription || '');

  // "Total Participation" is really the participation token's total supply, so
  // the label follows the org's token mode: the on-chain symbol (e.g. KUBIX)
  // when `useTokenSymbol` is set, the "Shares" default otherwise.
  const roleCount = cardRoles?.length || 0;
  const orgStats = [
    { icon: FiUsers, color: 'purple.300', value: poMembers, label: 'Members', caption: roleCount ? `across ${roleCount} role${roleCount === 1 ? '' : 's'}` : 'in the org' },
    { icon: FiAward, color: 'yellow.300', value: ptTokenBalance, label: `Total ${tokenLabel}`, caption: 'earned by members' },
    { icon: FiActivity, color: 'blue.300', value: activeTaskAmount, label: 'Active Tasks', caption: 'open or underway' },
    { icon: FiCheckCircle, color: 'green.300', value: completedTaskAmount, label: 'Completed Tasks', caption: 'finished & paid out' },
  ];

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
                  'learnAndEarn ${showVouchingSection ? 'vouching' : '.'}'
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
                h="100%"
                display="flex"
                flexDirection="column"
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
                      {userDAO}
                    </Text>
                  </HStack>
                </VStack>
                {/* Identity row: logo, then description with the org links
                    right beneath it — top-aligned so nothing floats. */}
                <Flex
                  direction={{ base: "column", sm: "row" }}
                  align={{ base: "center", sm: "flex-start" }}
                  gap={{ base: 3, sm: 6, md: 8 }}
                  w="100%"
                  px={{ base: 4, md: 6 }}
                  pt={{ base: 4, md: 5 }}
                  pb={{ base: 2, md: 3 }}
                >
                  {imageURL && (
                    <Flex
                      boxSize={logoSize}
                      flexShrink={0}
                      align="center"
                      justify="center"
                      borderRadius="2xl"
                      overflow="hidden"
                      bg="whiteAlpha.100"
                      border="1px solid"
                      borderColor="whiteAlpha.200"
                      boxShadow="0 8px 24px rgba(0, 0, 0, 0.35)"
                    >
                      <Image src={imageURL} alt={`${userDAO} logo`} w="100%" h="100%" objectFit="contain" />
                    </Flex>
                  )}
                  <VStack align={{ base: "center", sm: "flex-start" }} spacing={3} flex="1" minW={0}>
                    {poDescription && (
                      <Text
                        fontSize={{ base: "md", md: "lg" }}
                        lineHeight="tall"
                        maxW="70ch"
                        color={isPlaceholderDescription ? "whiteAlpha.500" : "whiteAlpha.900"}
                        fontStyle={isPlaceholderDescription ? "italic" : "normal"}
                        textAlign={{ base: "center", sm: "left" }}
                      >
                        {poDescription}
                      </Text>
                    )}
                    {poLinks && poLinks.length > 0 && (
                      <Wrap spacing={2} align="center" justify={{ base: "center", sm: "flex-start" }}>
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
                {/* Actions pinned to the card's bottom corners. */}
                <Flex
                  mt="auto"
                  align="center"
                  justify="space-between"
                  gap={2}
                  px={{ base: 4, md: 6 }}
                  py={{ base: 3, md: 3.5 }}
                >
                  <Box>
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
                  </Box>
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
                </Flex>
              </Box>
            </GridItem>

            <GridItem area={'orgStats'}>
              {/* The whole card is a link (arrow + hover lift signal it) so it
                  can point at a dedicated org-stats page once one exists;
                  /leaderboard is the interim destination. */}
              <Link2 href={`/leaderboard?org=${encodeURIComponent(userDAO)}`}>
                <Box
                  data-tour="org-stats"
                  h="100%"
                  display="flex"
                  flexDirection="column"
                  ml={{ base: 0, md: "25%" }}
                  w={{ base: "100%", md: "75%" }}
                  borderRadius="2xl"
                  bg="transparent"
                  boxShadow="lg"
                  position="relative"
                  zIndex={2}
                  cursor="pointer"
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
                      Stats
                    </Text>
                    <Icon as={FiArrowRight} className="arrow-icon" color="gray.500" boxSize={5} />
                  </HStack>
                  <Grid
                    templateColumns="1fr 1fr"
                    templateRows="1fr 1fr"
                    gap={{ base: 2, md: 3 }}
                    flexGrow={1}
                    p={{ base: 2, md: 3 }}
                  >
                    {orgStats.map(({ icon, color, value, label, caption }) => (
                      <Flex
                        key={label}
                        direction="column"
                        align="center"
                        justify="center"
                        bg="whiteAlpha.50"
                        border="1px solid"
                        borderColor="whiteAlpha.100"
                        px={{ base: 3, md: 4 }}
                        py={{ base: 3, md: 4 }}
                        borderRadius="xl"
                      >
                        <HStack spacing={2}>
                          <Icon as={icon} color={color} boxSize={{ base: 4, md: 5 }} />
                          <Text
                            fontSize={{ base: "xl", md: "2xl" }}
                            fontWeight="bold"
                            lineHeight="1.1"
                            letterSpacing="-0.02em"
                            sx={{ fontVariantNumeric: 'tabular-nums' }}
                            color={color}
                          >
                            {value}
                          </Text>
                        </HStack>
                        <Text
                          mt={1.5}
                          fontSize="0.68rem"
                          fontWeight="semibold"
                          letterSpacing="0.12em"
                          textTransform="uppercase"
                          color="whiteAlpha.600"
                        >
                          {label}
                        </Text>
                        <Text mt={0.5} fontSize="xs" color="whiteAlpha.400">
                          {caption}
                        </Text>
                      </Flex>
                    ))}
                  </Grid>
                </Box>
              </Link2>
            </GridItem>

            <GridItem area={'tasks'}>
              <Box
                h="100%"
                w="100%"
                display="flex"
                flexDirection="column"
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
                    align="stretch"
                    flexGrow={1}
                    gap={{ base: 3, md: 4 }}
                    pb={{ base: 3, md: 4 }}
                    px={{ base: 3, md: 4 }}
                    pt={3}
                  >
                    {recommendedTasks.slice(0, 3).map((task) => (
                      <Box
                        key={task.id}
                        w={{ base: "100%", md: "31%" }}
                        minH={{ md: "150px" }}
                        display="flex"
                        flexDirection="column"
                        sx={{
                          '& .task-arrow': {
                            transition: 'transform 0.2s ease',
                          },
                          // The next/link anchor must stretch so the payout
                          // row can pin to the tile's bottom edge.
                          '& > a': {
                            display: 'flex',
                            flexDirection: 'column',
                            flexGrow: 1,
                          },
                        }}
                        _hover={{
                          transform: "translateY(-2px)",
                          boxShadow: "0 8px 25px rgba(0,0,0,0.3)",
                          '& .task-arrow': {
                            transform: 'translateX(3px)',
                          },
                        }}
                        transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                        p={5}
                        borderRadius="xl"
                        overflow="hidden"
                        bg="black"
                        border="1px solid"
                        borderColor="whiteAlpha.100"
                      >
                        <Link2 href={`/tasks/?task=${task.id}&projectId=${encodeURIComponent(decodeURIComponent(task.projectId))}&org=${encodeURIComponent(userDAO)}`}>
                          <VStack textColor="white" align="stretch" spacing={4} flexGrow={1}>
                            <Box>
                              <Text fontSize={{ base: "md", md: "md" }} lineHeight="short" fontWeight="extrabold">
                                {task.isIndexing ? 'Indexing...' : task.title}
                              </Text>
                              <HStack mt={2.5} spacing={2}>
                                {task.difficulty && (
                                  <Badge
                                    colorScheme={difficultyColorScheme[String(task.difficulty).toLowerCase()] || 'gray'}
                                    fontSize="xs"
                                    textTransform="capitalize"
                                  >
                                    {String(task.difficulty).toLowerCase() === 'veryhard' ? 'Very Hard' : task.difficulty}
                                  </Badge>
                                )}
                                {task.estHours != null && (
                                  <Text fontSize="xs" color="whiteAlpha.500">
                                    ~{task.estHours} hr{Number(task.estHours) !== 1 ? 's' : ''}
                                  </Text>
                                )}
                              </HStack>
                            </Box>
                            <HStack justify="space-between" align="center" mt="auto">
                              <Text fontWeight="bold" fontSize={{ base: "sm", md: "md" }}>{task.payout} {tokenLabel}</Text>
                              <Icon as={FiArrowRight} className="task-arrow" color="whiteAlpha.300" boxSize={4} />
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
                  <Box py={{ base: 2, md: 3 }}>
                    {Array.isArray(leaderboardDisplayData) && leaderboardDisplayData.length > 0 ? (
                      leaderboardDisplayData.slice(0, 5).map((entry, index) => {
                        const medalColor = getMedalColor(index);
                        return (
                          <HStack
                            key={entry.id}
                            align="center"
                            spacing={{ base: 2, md: 3 }}
                            px={{ base: 3, md: 6 }}
                            py={2}
                          >
                            <Text
                              w="1.25rem"
                              textAlign="center"
                              fontSize={{ base: "md", md: "lg" }}
                              fontWeight={medalColor ? 'extrabold' : 'medium'}
                              color={medalColor || 'whiteAlpha.500'}
                              sx={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {index + 1}
                            </Text>
                            <UserIdentity
                              address={entry.address}
                              usernameHint={entry.name}
                              avatarCidHint={entry.avatarCid}
                              showName={false}
                              link={false}
                              size="sm"
                            />
                            <Text
                              fontWeight={medalColor ? 'bold' : 'medium'}
                              fontSize={{ base: "md", md: "lg" }}
                              isTruncated
                            >
                              {entry.name}
                            </Text>
                            <HStack
                              spacing={1.5}
                              flexShrink={0}
                              px={2.5}
                              py={0.5}
                              borderRadius="md"
                              bg="whiteAlpha.100"
                            >
                              <Text fontWeight="bold" fontSize={{ base: "sm", md: "md" }} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                {entry.token}
                              </Text>
                              <Text fontSize="xs" color="whiteAlpha.500" fontWeight="semibold">
                                {tokenLabel}
                              </Text>
                            </HStack>
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
                roles={cardRoles}
                totalMembers={totalMembers}
                governance={governance}
                votingClasses={votingClasses}
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
                        <RolesGroupsPanel />
                      </Box>
                    </Collapse>
                    {!isVouchingExpanded && (
                      <Text fontSize={textSize} color="gray.400">
                        Open a role to review its members and vouches
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
                    <HStack pl={{ base: 3, md: 6 }} pr={{ base: 3, md: 6 }} spacing={3} align="baseline" flexWrap="wrap">
                      <Text fontWeight="bold" fontSize={sectionHeadingSize}>
                        Learn & Earn
                      </Text>
                      <Text fontSize="sm" color="whiteAlpha.500">
                        Take a quiz, earn {tokenLabel}.
                      </Text>
                    </HStack>
                  </VStack>
                  <Box px={{ base: 3, md: 4 }} pt={3} pb={{ base: 3, md: 4 }}>
                    {educationModules && educationModules.length > 0 ? (
                      <Flex direction="column" gap={3}>
                        {educationModules.slice(0,3).map((module) => (
                          <Flex
                            key={module.id}
                            direction={{ base: "column", sm: "row" }}
                            justify="space-between"
                            align={{ base: "flex-start", sm: "center" }}
                            gap={3}
                            p={4}
                            borderRadius="xl"
                            onClick={() => router.push(`/learn/?org=${encodeURIComponent(userDAO)}`)}
                            bg="black"
                            border="1px solid"
                            borderColor="whiteAlpha.100"
                            _hover={{ transform: "translateY(-2px)", boxShadow: "0 8px 25px rgba(0,0,0,0.3)", borderColor: "whiteAlpha.200" }}
                            transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                            cursor="pointer"
                          >
                            <HStack spacing={3} minW={0}>
                              <Center boxSize="36px" flexShrink={0} borderRadius="lg" bg="whiteAlpha.100">
                                <Icon as={FiBookOpen} color="teal.200" boxSize={4} />
                              </Center>
                              <Text fontSize={{ base: "md", md: "md" }} fontWeight="bold">
                                {module.isIndexing ? 'Indexing...' : module.name}
                              </Text>
                            </HStack>
                            <HStack spacing={3} flexShrink={0}>
                              <Text fontWeight="bold" fontSize={{ base: "sm", md: "md" }} color="teal.200">
                                +{module.payout} {tokenLabel}
                              </Text>
                              <Link2 href={`/learn/?org=${encodeURIComponent(userDAO)}`}>
                                <Button colorScheme="teal" size="sm">
                                  {module.isIndexing ? 'Coming Soon' : 'Start'}
                                </Button>
                              </Link2>
                            </HStack>
                          </Flex>
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
