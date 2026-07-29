import SEOHead from "@/components/common/SEOHead";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  VStack,
  Image,
  HStack,
  Icon,
  SimpleGrid,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { FaExternalLinkAlt } from "react-icons/fa";
import { FiUsers, FiActivity, FiCheckCircle, FiGrid, FiCheckSquare, FiBarChart2, FiUser } from "react-icons/fi";
import Link from "next/link";
import { usePOContext } from "@/context/POContext";
import { useOrgTheme } from "@/hooks";
import { useOrgName } from "@/hooks/useOrgName";
import { useIPFScontext } from "@/context/ipfsContext";
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { useAuth } from "@/context/AuthContext";
import { useOrgGate } from "@/components/shared/OrgDeadEnd";

// Same gradient generator as the explore/browser page
const getOrgGradient = (name) => {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = (hash * 16777619) | 0;
  }
  const colors = [
    ["#9055E8", "#E85D85"],
    ["#E85D85", "#F06543"],
    ["#6366F1", "#06B6D4"],
    ["#F06543", "#FACC15"],
    ["#7C3AED", "#3B82F6"],
    ["#EC4899", "#F06543"],
    ["#06B6D4", "#9055E8"],
    ["#3B82F6", "#6366F1"],
  ];
  const angles = [135, 150, 120, 160, 140, 125, 155, 130];
  const idx = Math.abs(hash) % colors.length;
  const angle = angles[Math.abs(hash >> 4) % angles.length];
  return `linear-gradient(${angle}deg, ${colors[idx][0]} 0%, ${colors[idx][1]} 100%)`;
};

const AVATAR_SIZE = { base: "140px", md: "180px" };

const cardStyle = {
  bg: "rgba(255, 255, 255, 0.8)",
  border: "1px solid",
  borderColor: "rgba(255, 255, 255, 0.18)",
  boxShadow: "0 4px 30px rgba(0, 0, 0, 0.05)",
  borderRadius: "2xl",
};

const darkCardStyle = {
  bg: "rgba(0, 0, 0, 0.73)",
  border: "1px solid",
  borderColor: "rgba(148, 115, 220, 0.15)",
  boxShadow: "0 4px 30px rgba(0, 0, 0, 0.15)",
  borderRadius: "2xl",
};

const GradientAvatar = ({ name, orgGradient }) => (
  <Flex
    w={AVATAR_SIZE}
    h={AVATAR_SIZE}
    borderRadius="2xl"
    background={orgGradient}
    align="center"
    justify="center"
    boxShadow="0 8px 32px rgba(0, 0, 0, 0.1)"
  >
    <Text
      fontSize={{ base: "5xl", md: "6xl" }}
      fontWeight="700"
      color="white"
      textTransform="uppercase"
      userSelect="none"
    >
      {name ? name.charAt(0) : ""}
    </Text>
  </Flex>
);

const Home = () => {
  const { logoUrl, poDescription, poLinks, poMembers, activeTaskAmount, completedTaskAmount } = usePOContext();
  const { pageBackground, backgroundMode, onBackground, onBackgroundMuted, onBackgroundSubtle } = useOrgTheme();
  const router = useRouter();
  const userDAO = useOrgName();
  const orgGate = useOrgGate();
  const { fetchImageFromIpfs } = useIPFScontext();

  const { isPasskeyUser, isAuthenticated } = useAuth();
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [isNavbarReady, setIsNavbarReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isSignedIn = mounted && (isPasskeyUser || isAuthenticated);

  useEffect(() => {
    if (userDAO) setIsNavbarReady(true);
  }, [userDAO]);

  useEffect(() => {
    const fetchImage = async () => {
      if (logoUrl) {
        try {
          const imageUrl = await fetchImageFromIpfs(logoUrl);
          setImage(imageUrl);
        } catch {
          setImageError(true);
        }
      }
    };
    fetchImage();
  }, [logoUrl]);

  const orgGradient = userDAO ? getOrgGradient(userDAO) : "linear-gradient(135deg, #9055E8, #E85D85)";
  const showImage = image && !imageError;
  const hasLinks = Array.isArray(poLinks) && poLinks.length > 0;

  // Adapt ghost-button colors to the org background so the link row stays
  // legible on both light and dark custom colors. 'unknown' (no org bg set)
  // uses the light-mode hover since the default body gradient is light.
  const linkButtonColor = onBackgroundMuted;
  const linkButtonHover = backgroundMode === 'dark'
    ? { color: 'white', bg: 'whiteAlpha.200' }
    : { color: 'warmGray.900', bg: 'blackAlpha.100' };

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;
  return (
    <>
      <SEOHead
        title="Organization Home"
        description="Organization overview and activity."
        path="/home"
        noIndex
      />
      {isNavbarReady && <Navbar userDAO={userDAO} />}

      <Box
        pt={{ base: 4, md: "100px" }}
        pb={{ base: 12, md: 20 }}
        position="relative"
        minH="100vh"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="flex-start"
        zIndex={1}
        background={pageBackground()}
      >
        <VStack
          spacing={{ base: 6, md: 8 }}
          w="100%"
          px={4}
          maxW="640px"
          mx="auto"
        >
          {/* Avatar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            {showImage ? (
              <Box
                w={AVATAR_SIZE}
                h={AVATAR_SIZE}
                borderRadius="2xl"
                overflow="hidden"
                bg="whiteAlpha.900"
                boxShadow="0 8px 32px rgba(0, 0, 0, 0.15)"
              >
                <Image
                  src={image}
                  alt="Organization Logo"
                  w="100%"
                  h="100%"
                  objectFit="cover"
                  onError={() => setImageError(true)}
                />
              </Box>
            ) : (
              <GradientAvatar name={userDAO} orgGradient={orgGradient} />
            )}
          </motion.div>

          {/* Org name and description */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{ width: "100%", textAlign: "center" }}
          >
            <Heading
              as="h1"
              fontSize={{ base: "3xl", md: "4xl" }}
              color={onBackground}
              fontWeight="700"
              letterSpacing="-0.02em"
              mb={3}
            >
              {userDAO || ""}
            </Heading>

            {poDescription && (
              <Text
                fontSize={{ base: "md", md: "lg" }}
                color={onBackgroundMuted}
                lineHeight="1.7"
                fontWeight="500"
                maxW="480px"
                mx="auto"
              >
                {poDescription}
              </Text>
            )}
          </motion.div>

          {/* Stats Card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            style={{ width: "100%" }}
          >
            <Box {...darkCardStyle} p={{ base: 4, md: 6 }}>
              <SimpleGrid columns={3} spacing={{ base: 2, md: 4 }}>
                {[
                  { icon: FiUsers, value: poMembers || "0", label: "Members", color: "purple.300" },
                  { icon: FiActivity, value: activeTaskAmount || "0", label: "Active Tasks", color: "blue.300" },
                  { icon: FiCheckCircle, value: completedTaskAmount || "0", label: "Completed", color: "green.300" },
                ].map((stat) => (
                  <VStack key={stat.label} spacing={1}>
                    <Icon as={stat.icon} color={stat.color} boxSize={{ base: 4, md: 5 }} />
                    <Text
                      fontSize={{ base: "xl", md: "2xl" }}
                      fontWeight="700"
                      color="white"
                    >
                      {stat.value}
                    </Text>
                    <Text
                      fontSize="xs"
                      color="whiteAlpha.500"
                      fontWeight="500"
                    >
                      {stat.label}
                    </Text>
                  </VStack>
                ))}
              </SimpleGrid>
            </Box>
          </motion.div>

          {/* CTA for unauthenticated users */}
          {!isSignedIn && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Link href={`/join/?org=${encodeURIComponent(userDAO)}`} passHref legacyBehavior>
                <Button
                  as="a"
                  size="lg"
                  bgGradient="linear(to-r, green.400, teal.400)"
                  color="white"
                  borderRadius="full"
                  fontWeight="600"
                  px={8}
                  fontSize="lg"
                  _hover={{
                    bgGradient: "linear(to-r, green.500, teal.500)",
                    transform: "translateY(-1px)",
                    boxShadow: "lg",
                  }}
                  _active={{
                    bgGradient: "linear(to-r, green.600, teal.600)",
                    transform: "translateY(0)",
                  }}
                  transition="all 0.2s ease"
                >
                  Join or Sign In
                </Button>
              </Link>
            </motion.div>
          )}

          {/* Quick links for signed-in users */}
          {isSignedIn && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              style={{ width: "100%" }}
            >
              <SimpleGrid columns={{ base: 2, md: 2 }} spacing={3} w="100%">
                {[
                  {
                    icon: FiGrid,
                    label: "Dashboard",
                    description: "View org activity and stats",
                    path: `/dashboard/?org=${encodeURIComponent(userDAO)}`,
                    color: "purple.300",
                  },
                  {
                    icon: FiCheckSquare,
                    label: "Tasks",
                    description: "Browse and claim tasks",
                    path: `/tasks/?org=${encodeURIComponent(userDAO)}`,
                    color: "blue.300",
                  },
                  {
                    icon: FiBarChart2,
                    label: "Voting",
                    description: "Vote on active proposals",
                    path: `/voting/?org=${encodeURIComponent(userDAO)}`,
                    color: "green.300",
                  },
                  {
                    icon: FiUser,
                    label: "Profile Hub",
                    description: "Manage your profile and roles",
                    path: `/profile/?org=${encodeURIComponent(userDAO)}`,
                    color: "coral.300",
                  },
                ].map((item) => (
                  <Link key={item.label} href={item.path} passHref legacyBehavior>
                    <Box
                      as="a"
                      {...darkCardStyle}
                      p={4}
                      cursor="pointer"
                      transition="all 0.3s ease"
                      _hover={{
                        transform: "translateY(-2px)",
                        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.25)",
                        borderColor: "rgba(148, 115, 220, 0.3)",
                      }}
                    >
                      <VStack spacing={2} align="start">
                        <Icon as={item.icon} color={item.color} boxSize={5} />
                        <Text fontWeight="600" fontSize="sm" color="white">
                          {item.label}
                        </Text>
                        <Text fontSize="xs" color="whiteAlpha.600" lineHeight="1.4">
                          {item.description}
                        </Text>
                      </VStack>
                    </Box>
                  </Link>
                ))}
              </SimpleGrid>
            </motion.div>
          )}

          {/* Org Links */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <HStack spacing={2} wrap="wrap" justify="center">
              {hasLinks ? (
                poLinks.map((link, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant="ghost"
                    color={linkButtonColor}
                    _hover={linkButtonHover}
                    leftIcon={<Icon as={FaExternalLinkAlt} boxSize={3} />}
                    fontWeight="500"
                    borderRadius="full"
                    onClick={() => window.open(link.url, "_blank")}
                  >
                    {link.name}
                  </Button>
                ))
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    color={linkButtonColor}
                    _hover={linkButtonHover}
                    leftIcon={<Icon as={FaExternalLinkAlt} boxSize={3} />}
                    fontWeight="500"
                    borderRadius="full"
                    onClick={() => window.open("https://poa.box", "_blank")}
                  >
                    Website
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    color={linkButtonColor}
                    _hover={linkButtonHover}
                    leftIcon={<Icon as={FaExternalLinkAlt} boxSize={3} />}
                    fontWeight="500"
                    borderRadius="full"
                    onClick={() => window.open("https://docs.poa.box", "_blank")}
                  >
                    Docs
                  </Button>
                </>
              )}
            </HStack>
          </motion.div>

          {/* Footer */}
          <Text
            fontSize="xs"
            color={onBackgroundSubtle}
            fontWeight="400"
            textAlign="center"
            mt={4}
            letterSpacing="0.03em"
          >
            Powered by Poa
          </Text>
        </VStack>
      </Box>
    </>
  );
};

export default Home;
