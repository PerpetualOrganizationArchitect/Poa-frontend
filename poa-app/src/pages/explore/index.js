import React, { useEffect, useState } from "react";
import { FiMap } from "react-icons/fi";
import { useTour } from "@/features/tour";
import SEOHead from "@/components/common/SEOHead";
import { useIPFScontext } from "@/context/ipfsContext";
import { getVisitUrlForOrg } from "@/config/hostDefaultOrg";
import { useProfileHubContext } from "@/context/profileHubContext";
import { useAuth } from "@/context/AuthContext";
import { useGlobalAccount } from "@/hooks/useGlobalAccount";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  Flex,
  Box,
  Text,
  Heading,
  Grid,
  GridItem,
  Container,
  Button,
  Icon,
  Badge,
  InputGroup,
  Input,
  InputRightElement,
  HStack,
  Skeleton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Image,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { FaSearch, FaUsers, FaArrowRight, FaGlobe, FaInfoCircle, FaBuilding, FaUserFriends, FaShieldAlt } from "react-icons/fa";
import Navbar from "@/components/landing/Navbar";
import SignInModal from "@/components/passkey/SignInModal";
import { isHiddenOrg } from "@/util/hiddenOrgs";

const MotionBox = motion.create(Box);

// Generates a consistent, visually distinct gradient from an org name
const getOrgGradient = (name) => {
  // FNV-1a hash for better distribution
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = (hash * 16777619) | 0;
  }
  const colors = [
    ["#9055E8", "#E85D85"],  // amethyst → rose
    ["#E85D85", "#F06543"],  // rose → coral
    ["#6366F1", "#06B6D4"],  // indigo → cyan
    ["#F06543", "#FACC15"],  // coral → amber
    ["#7C3AED", "#3B82F6"],  // purple → blue
    ["#EC4899", "#F06543"],  // pink → coral
    ["#06B6D4", "#9055E8"],  // cyan → amethyst
    ["#3B82F6", "#6366F1"],  // blue → indigo
  ];
  const angles = [135, 150, 120, 160, 140, 125, 155, 130];
  const idx = Math.abs(hash) % colors.length;
  const angle = angles[Math.abs(hash >> 4) % angles.length];
  return `linear-gradient(${angle}deg, ${colors[idx][0]} 0%, ${colors[idx][1]} 100%)`;
};

const OrgAvatar = ({ name, size = "110px" }) => (
  <Flex
    w={size}
    h={size}
    borderRadius="xl"
    background={getOrgGradient(name)}
    align="center"
    justify="center"
    flexShrink={0}
  >
    <Text
      fontSize={parseInt(size) > 80 ? "3xl" : "2xl"}
      fontWeight="700"
      color="white"
      textTransform="uppercase"
      userSelect="none"
    >
      {name.charAt(0)}
    </Text>
  </Flex>
);

const OrgBanner = ({ name, logoHash, logoCid }) => {
  const { safeFetchFromIpfs, safeFetchImageFromIpfs } = useIPFScontext();
  const [imageUrl, setImageUrl] = useState(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadLogo() {
      try {
        let cid = logoCid;
        // If subgraph didn't provide the logo CID, fall back to IPFS metadata fetch
        if (!cid && logoHash) {
          const metadata = await safeFetchFromIpfs(logoHash);
          if (cancelled || !metadata?.logo) return;
          cid = metadata.logo;
        }
        if (!cid) return;
        const blobUrl = await safeFetchImageFromIpfs(cid);
        if (!cancelled && blobUrl) setImageUrl(blobUrl);
      } catch (e) {
        // fall back to gradient
      }
    }
    loadLogo();
    return () => { cancelled = true; };
  }, [logoHash, logoCid]);

  const showImage = imageUrl && !imgError;

  return (
    <Flex
      w="100%"
      h={["120px", "140px"]}
      background={showImage ? "white" : getOrgGradient(name)}
      align="center"
      justify="center"
      position="relative"
      overflow="hidden"
    >
      {showImage ? (
        <Image
          src={imageUrl}
          alt={`${name} logo`}
          objectFit="contain"
          maxW="85%"
          maxH="85%"
          onError={() => setImgError(true)}
        />
      ) : (
        <Text
          fontSize={["4xl", "5xl"]}
          fontWeight="800"
          color="rgba(255, 255, 255, 0.9)"
          textTransform="uppercase"
          userSelect="none"
          letterSpacing="0.05em"
        >
          {name.charAt(0)}
        </Text>
      )}
      {/* Subtle pattern overlay */}
      {!showImage && (
        <Box
          position="absolute"
          inset={0}
          opacity={0.18}
          background="radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)"
          backgroundSize="40px 40px"
          pointerEvents="none"
        />
      )}
    </Flex>
  );
};

const BrowserPage = () => {
  const router = useRouter();
  const { perpetualOrganizations, isLoading: isOrgsLoading } = useProfileHubContext();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { hasAccount, isLoading: isAccountLoading } = useGlobalAccount();
  const { isPasskeyUser, isAuthenticated, hasStoredPasskey } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [networkFilter, setNetworkFilter] = useState("all");
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [mounted, setMounted] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isSignInOpen, onOpen: onSignInOpen, onClose: onSignInClose } = useDisclosure();
  const { startTour } = useTour();

  useEffect(() => { setMounted(true); }, []);

  const getAccountMenuItem = () => {
    if (mounted && isPasskeyUser) {
      return { text: "My Account", onClick: () => router.push("/account") };
    }
    if (!isConnected) {
      return { text: "Connect Wallet", onClick: openConnectModal };
    }
    if (isAccountLoading) {
      return { text: "Loading...", onClick: () => {} };
    }
    if (hasAccount) {
      return { text: "My Account", onClick: () => router.push("/account") };
    }
    return { text: "Sign Up", onClick: () => {} };
  };

  const accountMenuItem = getAccountMenuItem();

  const openDescriptionModal = (org, e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedOrg(org);
    onOpen();
  };

  const listedOrganizations = perpetualOrganizations.filter(po => !isHiddenOrg(po.id));
  const filteredOrganizations = listedOrganizations.filter(po => {
    const matchesSearch = po.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (po.aboutInfo?.description && po.aboutInfo.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesNetwork = networkFilter === "all" || po.networkName === networkFilter;
    return matchesSearch && matchesNetwork;
  });

  // Get unique network names for filter chips
  const availableNetworks = [...new Set(listedOrganizations.map(po => po.networkName).filter(Boolean))];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  return (
    <>
    <SEOHead
      title="Browse Community-Owned DAOs on Poa"
      description="A live directory of every community-owned organization on poa.box. Student clubs, worker cooperatives, and open-source projects with transparent self-governance."
      path="/explore"
      keywords={[
        "community-owned organizations",
        "DAO directory",
        "browse DAOs",
        "worker cooperative DAO",
        "student organization DAO",
        "open-source DAO",
        "no-code DAO",
        "poa.box",
      ]}
    />
    <Box minH="100vh" overflowX="hidden">
      <Navbar
        mounted={mounted}
        isPasskeyUser={isPasskeyUser}
        isConnected={isConnected}
        isAuthenticated={isAuthenticated}
        accountMenuItem={accountMenuItem}
        onSignInOpen={onSignInOpen}
      />
      <SignInModal isOpen={isSignInOpen} onClose={onSignInClose} />

      {/* Description Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size={{ base: "full", md: "lg" }} isCentered>
        <ModalOverlay
          bg="blackAlpha.300"
          backdropFilter="blur(4px)"
        />
        <ModalContent
          margin={{ base: 0, md: "auto" }}
          borderRadius={{ base: 0, md: "xl" }}
          border={{ base: "none", md: "1px solid" }}
          borderColor="warmGray.100"
          boxShadow="0 8px 40px rgba(0, 0, 0, 0.08)"
        >
          <ModalHeader>
            <Flex
              align="center"
              gap={3}
              direction={{ base: "column", sm: "row" }}
              textAlign={{ base: "center", sm: "left" }}
            >
              <Box
                width={{ base: "80px", sm: "90px" }}
                height={{ base: "80px", sm: "90px" }}
                borderRadius="lg"
                overflow="hidden"
                display="flex"
                alignItems="center"
                justifyContent="center"
                mr={{ base: 0, sm: 2 }}
                mb={{ base: 2, sm: 0 }}
                alignSelf={{ base: "center", sm: "flex-start" }}
              >
                {selectedOrg ? (
                  <OrgAvatar name={selectedOrg.id} size="84px" />
                ) : null}
              </Box>
              <Heading as="h3" size="md" fontWeight="700" color="warmGray.900">
                {selectedOrg?.id}
                <Badge
                  bg="amethyst.50"
                  color="amethyst.600"
                  borderRadius="full"
                  px={2.5}
                  py={0.5}
                  fontSize="xs"
                  fontWeight="600"
                  ml={2}
                  verticalAlign="middle"
                >
                  Org
                </Badge>
              </Heading>
            </Flex>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {selectedOrg?.aboutInfo?.description && (
              <Text fontSize="md" lineHeight="1.7" color="warmGray.700" fontWeight="500">
                {selectedOrg.aboutInfo.description}
              </Text>
            )}
            {selectedOrg?.totalMembers && (
              <Flex align="center" mt={4} bg="warmGray.50" p={3} borderRadius="lg">
                <Icon as={FaUsers} color="amethyst.500" mr={2} boxSize="18px" />
                <Text fontWeight="500" color="warmGray.700">{selectedOrg.totalMembers} Members</Text>
              </Flex>
            )}
          </ModalBody>
          <ModalFooter flexDirection="column" gap={2}>
            <HStack w="100%" spacing={2}>
              <Button
                variant="outline"
                borderColor="amethyst.200"
                color="amethyst.600"
                borderRadius="full"
                fontWeight="600"
                _hover={{ bg: "amethyst.50", borderColor: "amethyst.300" }}
                leftIcon={<FiMap />}
                flex={1}
                onClick={() => {
                  if (!selectedOrg?.id) return;
                  onClose();
                  startTour(selectedOrg.id);
                }}
              >
                Tour Org
              </Button>
              <Link href={getVisitUrlForOrg(selectedOrg?.id)} passHref style={{ flex: 1 }}>
                <Button
                  bg="warmGray.900"
                  color="white"
                  borderRadius="full"
                  fontWeight="600"
                  _hover={{ bg: "warmGray.800" }}
                  _active={{ bg: "warmGray.700" }}
                  rightIcon={<FaArrowRight />}
                  w="100%"
                >
                  Visit Organization
                </Button>
              </Link>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Box width="100%" position="relative">
        {/* Hero Section */}
        <Box
          as="section"
          pt={["24", "28", "32"]}
          pb={["16", "20", "24"]}
          px={[4, 6, 8]}
          position="relative"
        >
          {/* Ambient orb - left */}
          <Box
            position="absolute"
            top="-10%"
            left="-8%"
            w={["200px", "300px", "400px"]}
            h={["200px", "300px", "400px"]}
            bg="#9055E8"
            opacity={0.12}
            filter="blur(80px)"
            pointerEvents="none"
            borderRadius="50%"
          />
          {/* Ambient orb - right */}
          <Box
            position="absolute"
            top="0%"
            right="-5%"
            w={["180px", "260px", "350px"]}
            h={["180px", "260px", "350px"]}
            bg="#E85D85"
            opacity={0.1}
            filter="blur(80px)"
            pointerEvents="none"
            borderRadius="50%"
          />

          <Container maxW="container.xl">
            <Flex
              as={motion.div}
              direction="column"
              align="center"
              textAlign="center"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Heading
                as="h1"
                fontSize={["3xl", "4xl", "5xl"]}
                fontWeight="700"
                lineHeight="1.15"
                letterSpacing="-0.02em"
                color="warmGray.900"
                mb={[4, 6, 8]}
              >
                Browse community-owned organizations on poa.box
              </Heading>
              <Text
                fontSize={["lg", "xl"]}
                color="warmGray.600"
                maxW="640px"
                mx="auto"
                mb={[6, 8]}
                lineHeight="1.7"
                fontWeight="500"
              >
                Every organization on poa.box is community-owned. The members govern themselves. They write the rules together. They vote on the rules together. They hold the shared treasury together. Below is a live directory of every organization built with Poa. Student clubs. Worker cooperatives. Open-source collectives. Click any one of them to see how its members chose to govern, how many of them there are, and what they&apos;re voting on right now.
              </Text>
              <Text
                fontSize={["sm", "md"]}
                color="warmGray.500"
                maxW="540px"
                mx="auto"
                mb={[8, 10]}
                lineHeight="1.7"
                fontWeight="500"
              >
                Looking to start your own? You don&apos;t need any crypto knowledge or wallet to join an existing one. A passkey is enough.
              </Text>

              {/* Search Bar */}
              <InputGroup
                size="lg"
                maxW="520px"
                mx="auto"
                mb={[8, 10]}
                borderRadius="full"
                width={{ base: "95%", md: "auto" }}
              >
                <Input
                  placeholder="Search organizations..."
                  borderRadius="full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  bg="white"
                  border="1px solid"
                  borderColor="warmGray.200"
                  fontSize="md"
                  h="52px"
                  pl={6}
                  color="warmGray.900"
                  _placeholder={{ color: "warmGray.400" }}
                  _focus={{
                    borderColor: "amethyst.300",
                    boxShadow: "0 0 0 3px rgba(144, 85, 232, 0.1)",
                  }}
                  transition="border-color 0.2s, box-shadow 0.2s"
                />
                <InputRightElement h="52px" w="52px" pr={1}>
                  <Button
                    h="38px"
                    w="38px"
                    borderRadius="full"
                    bg="warmGray.900"
                    color="white"
                    _hover={{ bg: "warmGray.800" }}
                    _active={{ bg: "warmGray.700" }}
                    minW="unset"
                  >
                    <Icon as={FaSearch} boxSize={3.5} />
                  </Button>
                </InputRightElement>
              </InputGroup>

              {/* Network Filter Chips */}
              {availableNetworks.length > 1 && (
                <HStack spacing={2} mb={[4, 6]} flexWrap="wrap" justifyContent="center">
                  <Badge
                    px={3} py={1.5} borderRadius="full" cursor="pointer" fontSize="sm" fontWeight="600"
                    bg={networkFilter === "all" ? "warmGray.900" : "white"}
                    color={networkFilter === "all" ? "white" : "warmGray.600"}
                    border="1px solid"
                    borderColor={networkFilter === "all" ? "warmGray.900" : "warmGray.200"}
                    onClick={() => setNetworkFilter("all")}
                    _hover={{ borderColor: "warmGray.400" }}
                    transition="all 0.2s"
                  >
                    All Networks
                  </Badge>
                  {availableNetworks.map(name => (
                    <Badge
                      key={name} px={3} py={1.5} borderRadius="full" cursor="pointer" fontSize="sm" fontWeight="600"
                      bg={networkFilter === name ? "warmGray.900" : "white"}
                      color={networkFilter === name ? "white" : "warmGray.600"}
                      border="1px solid"
                      borderColor={networkFilter === name ? "warmGray.900" : "warmGray.200"}
                      onClick={() => setNetworkFilter(name)}
                      _hover={{ borderColor: "warmGray.400" }}
                      transition="all 0.2s"
                    >
                      {name}
                    </Badge>
                  ))}
                </HStack>
              )}

              {/* Stats */}
              <HStack
                spacing={[4, 8]}
                mt={4}
                justifyContent="center"
                flexWrap="wrap"
              >
                {[
                  { value: listedOrganizations.length, label: "Organizations", icon: FaBuilding, color: "amethyst.500" },
                  { value: listedOrganizations.reduce((acc, po) => acc + (parseInt(po.totalMembers) || 0), 0), label: "Members", icon: FaUserFriends, color: "rose.500" },
                  { value: "100%", label: "Community-owned", icon: FaShieldAlt, color: "coral.500" },
                ].map((stat, i) => (
                  <Flex key={i} direction="column" align="center" px={[3, 5]}>
                    <Icon as={stat.icon} color={stat.color} boxSize={4} mb={1.5} />
                    <Text fontWeight="700" fontSize={["lg", "xl"]} color="warmGray.900">
                      {stat.value}
                    </Text>
                    <Text fontSize="sm" color="warmGray.400" fontWeight="500">
                      {stat.label}
                    </Text>
                  </Flex>
                ))}
              </HStack>
            </Flex>
          </Container>
        </Box>

        {/* Organizations Grid */}
        <Container maxW="container.xl" px={[4, 6, 8]} mb={[16, 20, 24]}>
          <MotionBox
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {isOrgsLoading ? (
              <Grid
                templateColumns={{
                  base: "repeat(1, 1fr)",
                  sm: "repeat(2, 1fr)",
                  lg: "repeat(3, 1fr)"
                }}
                gap={[5, 6, 8]}
              >
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <GridItem key={i}>
                    <Box
                      borderRadius="xl"
                      overflow="hidden"
                      border="1px solid"
                      borderColor="warmGray.100"
                      bg="white"
                      height="100%"
                    >
                      <Skeleton height="140px" startColor="amethyst.50" endColor="amethyst.100" />
                      <Box p={5}>
                        <Skeleton height="24px" mb={3} startColor="warmGray.50" endColor="warmGray.100" />
                        <Skeleton height="60px" mb={3} startColor="warmGray.50" endColor="warmGray.100" />
                        <Skeleton height="20px" width="120px" startColor="warmGray.50" endColor="warmGray.100" />
                      </Box>
                    </Box>
                  </GridItem>
                ))}
              </Grid>
            ) : filteredOrganizations.length === 0 ? (
              <Flex direction="column" align="center" justify="center" py={["12", "16", "20"]}>
                <Icon as={FaGlobe} boxSize={[8, 10]} color="warmGray.300" mb={4} />
                <Heading size="md" mb={2} textAlign="center" color="warmGray.900" fontWeight="700">
                  No organizations found
                </Heading>
                <Text textAlign="center" maxW="440px" mb={6} color="warmGray.500" fontWeight="500" lineHeight="1.7">
                  {searchTerm ?
                    `No organizations matching "${searchTerm}" were found. Try a different search.` :
                    "There are no organizations available at the moment. Check back later."}
                </Text>
                {searchTerm && (
                  <Button
                    variant="outline"
                    borderColor="warmGray.200"
                    color="warmGray.700"
                    borderRadius="full"
                    fontWeight="600"
                    _hover={{ bg: "warmGray.50", borderColor: "warmGray.300" }}
                    onClick={() => setSearchTerm("")}
                  >
                    Clear Search
                  </Button>
                )}
              </Flex>
            ) : (
              <Grid
                templateColumns={{
                  base: "repeat(1, 1fr)",
                  sm: "repeat(2, 1fr)",
                  lg: "repeat(3, 1fr)"
                }}
                gap={[5, 6, 8]}
              >
                {filteredOrganizations.map((po) => (
                  <GridItem key={po.id}>
                    <MotionBox
                      variants={itemVariants}
                      height="100%"
                    >
                      <Box
                        borderRadius="xl"
                        overflow="hidden"
                        border="1px solid"
                        borderColor="warmGray.100"
                        bg="white"
                        boxShadow="0 1px 3px rgba(0, 0, 0, 0.04)"
                        transition="transform 0.3s, box-shadow 0.3s, border-color 0.3s"
                        height="100%"
                        role="group"
                        _hover={{
                          transform: { base: "none", md: "translateY(-3px)" },
                          boxShadow: "0 8px 30px rgba(144, 85, 232, 0.12)",
                          borderColor: "amethyst.200",
                        }}
                      >
                        <Link href={getVisitUrlForOrg(po.id)} passHref>
                          <Box as="a">
                            <OrgBanner name={po.id} logoHash={po.logoHash} logoCid={po.logoCid} />
                          </Box>
                        </Link>

                        <Box p={[4, 5]}>
                          <Flex justify="space-between" align="center" mb={3}>
                            <Link href={getVisitUrlForOrg(po.id)} passHref>
                              <Heading
                                as="a"
                                fontSize={["lg", "xl"]}
                                fontWeight="700"
                                color="warmGray.900"
                                noOfLines={1}
                              >
                                {po.id}
                              </Heading>
                            </Link>
                            <Badge
                              bg={po.networkName === 'Sepolia' ? 'blue.50' : po.networkName === 'Base Sepolia' ? 'green.50' : 'amethyst.50'}
                              color={po.networkName === 'Sepolia' ? 'blue.600' : po.networkName === 'Base Sepolia' ? 'green.600' : 'amethyst.600'}
                              borderRadius="full"
                              px={2.5}
                              py={0.5}
                              fontSize="xs"
                              fontWeight="600"
                            >
                              {po.networkName || 'Org'}
                            </Badge>
                          </Flex>

                          {po.aboutInfo?.description && (
                            <Box
                              mb={3}
                              position="relative"
                              minH={["60px", "80px"]}
                              display="flex"
                              flexDirection="column"
                              justifyContent="center"
                            >
                              <Text
                                fontSize="md"
                                lineHeight="1.7"
                                fontWeight="500"
                                color="warmGray.600"
                                noOfLines={3}
                                pr="5px"
                              >
                                {po.aboutInfo.description}
                              </Text>
                              <Button
                                aria-label="Read full description"
                                position="absolute"
                                right="0"
                                bottom="0"
                                size="sm"
                                variant="ghost"
                                color="warmGray.400"
                                _hover={{ color: "amethyst.500" }}
                                width="24px"
                                height="24px"
                                minWidth="0"
                                p="0"
                                onClick={(e) => openDescriptionModal(po, e)}
                              >
                                <Icon as={FaInfoCircle} fontSize="16px" />
                              </Button>
                            </Box>
                          )}

                          <Box h="1px" bg="warmGray.100" my={3} />

                          <Flex
                            justify="space-between"
                            align="center"
                            flexDirection={{ base: "column", sm: "row" }}
                            gap={{ base: 2, sm: 0 }}
                          >
                            <HStack>
                              <Icon
                                as={FaUsers}
                                color="warmGray.400"
                                _groupHover={{ color: "amethyst.500" }}
                                transition="color 0.3s"
                              />
                              <Text fontSize="sm" fontWeight="500" color="warmGray.500">
                                {po.totalMembers || "0"} Members
                              </Text>
                            </HStack>
                            <Link href={getVisitUrlForOrg(po.id)} passHref>
                              <Button
                                as="a"
                                size="sm"
                                bg="warmGray.900"
                                color="white"
                                borderRadius="full"
                                fontWeight="600"
                                _hover={{ bg: "warmGray.800" }}
                                _active={{ bg: "warmGray.700" }}
                                rightIcon={<FaArrowRight size={12} />}
                                width={{ base: "100%", sm: "auto" }}
                              >
                                Visit
                              </Button>
                            </Link>
                          </Flex>
                        </Box>
                      </Box>
                    </MotionBox>
                  </GridItem>
                ))}
              </Grid>
            )}
          </MotionBox>
        </Container>
      </Box>
    </Box>
    </>
  );
};

export default BrowserPage;
