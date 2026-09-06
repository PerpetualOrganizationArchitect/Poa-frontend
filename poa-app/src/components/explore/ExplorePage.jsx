import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  Box, Button, Container, Flex, Heading, HStack, Icon, IconButton, Image,
  Input, InputGroup, InputLeftElement, InputRightElement, LinkBox, LinkOverlay,
  Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader,
  ModalOverlay, SimpleGrid, Skeleton, Text, VisuallyHidden, useDisclosure,
} from "@chakra-ui/react";
import { FiArrowRight, FiArrowUpRight, FiMap, FiSearch, FiUsers, FiX } from "react-icons/fi";
import SEOHead from "@/components/common/SEOHead";
import Navbar from "@/components/landing/Navbar";
import SignInModal from "@/components/passkey/SignInModal";
import { getVisitUrlForOrg } from "@/config/hostDefaultOrg";
import { useAuth } from "@/context/AuthContext";
import { useIPFScontext } from "@/context/ipfsContext";
import { useProfileHubContext } from "@/context/profileHubContext";
import { useTour } from "@/features/tour";
import { useGlobalAccount } from "@/hooks/useGlobalAccount";
import { isHiddenOrg } from "@/util/hiddenOrgs";

const AVATAR_COLORS = [
  ["#F5E6DB", "#8C492E"],
  ["#E6EBDF", "#516141"],
  ["#E8E3EF", "#66527E"],
  ["#E0E9ED", "#436675"],
  ["#F2E3E6", "#8D5361"],
];

function OrgAvatar({ org }) {
  const { safeFetchFromIpfs, safeFetchImageFromIpfs } = useIPFScontext();
  const [imageUrl, setImageUrl] = useState(null);
  const [imageError, setImageError] = useState(false);
  const { id: name, logoHash, logoCid } = org;
  const colorIndex = Array.from(name).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
  const [background, color] = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    setImageError(false);

    async function loadLogo() {
      try {
        const cid = logoCid || (logoHash && (await safeFetchFromIpfs(logoHash))?.logo);
        if (cancelled || !cid) return;
        const url = await safeFetchImageFromIpfs(cid);
        if (!cancelled && url) setImageUrl(url);
      } catch {
        // The initial remains visible when an organization's logo is unavailable.
      }
    }

    loadLogo();
    return () => { cancelled = true; };
  }, [logoHash, logoCid, safeFetchFromIpfs, safeFetchImageFromIpfs]);

  return (
    <Flex
      w="48px" h="48px" flexShrink={0} borderRadius="12px" overflow="hidden"
      align="center" justify="center" bg={imageUrl && !imageError ? "white" : background}
      color={color} aria-hidden="true"
    >
      {imageUrl && !imageError ? (
        <Image src={imageUrl} alt="" w="100%" h="100%" objectFit="contain" onError={() => setImageError(true)} />
      ) : (
        <Text fontSize="22px" fontWeight="600" textTransform="uppercase">{name.charAt(0)}</Text>
      )}
    </Flex>
  );
}

function MemberCount({ count }) {
  const members = Number(count) || 0;
  return (
    <HStack spacing={1.5} color="warmGray.600">
      <Icon as={FiUsers} boxSize="14px" aria-hidden="true" />
      <Text fontSize="13px">{members.toLocaleString("en-US")} {members === 1 ? "member" : "members"}</Text>
    </HStack>
  );
}

function TaskCounts({ counts }) {
  return (
    <Flex gap={5} mb={4} aria-label="Task counts" aria-busy={counts === undefined}>
      {[['open', 'Open tasks'], ['total', 'Total tasks']].map(([key, label]) => (
        <Box key={key}>
          <Skeleton isLoaded={counts !== undefined} minW="42px" borderRadius="4px" mb={1}>
            <Text
              fontSize="22px" lineHeight="1.2" fontWeight="600" letterSpacing="-0.03em"
              color={key === 'open' && counts?.open > 0 ? 'coral.700' : 'warmGray.900'}
            >
              {counts == null ? (
                <>
                  <Box as="span" aria-hidden="true">—</Box>
                  <VisuallyHidden>{counts === undefined ? 'Loading' : 'Unavailable'}</VisuallyHidden>
                </>
              ) : counts[key].toLocaleString('en-US')}
            </Text>
          </Skeleton>
          <Text fontSize="12px" color="warmGray.600">{label}</Text>
        </Box>
      ))}
    </Flex>
  );
}

function OrgCard({ org, onAbout }) {
  return (
    <LinkBox
      as="article" p={6} bg="white" border="1px solid" borderColor="warmGray.200"
      borderRadius="16px" display="flex" flexDirection="column" minW={0} role="group"
      transition="border-color 160ms ease, box-shadow 160ms ease"
      _hover={{ borderColor: "warmGray.300", boxShadow: "0 5px 18px rgba(31, 29, 26, 0.04)" }}
      _focusWithin={{ borderColor: "coral.500", boxShadow: "0 0 0 2px #F0654320" }}
    >
      <Flex align="center" justify="space-between" mb={5}>
        <OrgAvatar org={org} />
        <Flex
          w="32px" h="32px" align="center" justify="center" borderRadius="full"
          color="warmGray.500" _groupHover={{ color: "warmGray.900", bg: "warmGray.100" }}
          transition="background 160ms ease, color 160ms ease" aria-hidden="true"
        >
          <Icon as={FiArrowUpRight} boxSize={5} />
        </Flex>
      </Flex>
      <Heading as="h3" fontSize="21px" fontWeight="600" letterSpacing="-0.025em" lineHeight="1.3" mb={2}>
        <LinkOverlay as={Link} href={getVisitUrlForOrg(org.id)} overflowWrap="anywhere">
          {org.id}
        </LinkOverlay>
      </Heading>
      <Text fontSize="14px" lineHeight="1.6" color="warmGray.600" noOfLines={2} minH="45px" mb={5}>
        {org.aboutInfo?.description}
      </Text>
      <Box mt="auto">
        <TaskCounts counts={org.taskCounts} />
      </Box>
      <Flex pt={3} borderTop="1px solid" borderColor="warmGray.100" align="center" justify="space-between" gap={2}>
        <MemberCount count={org.totalMembers} />
        <Button
          size="sm" variant="ghost" color="warmGray.600" fontSize="13px" minH="36px" px={2}
          mr={-2} position="relative" zIndex={1} aria-label={`About ${org.id}`} onClick={() => onAbout(org)}
          _hover={{ bg: "warmGray.100", color: "warmGray.900" }}
        >
          About
        </Button>
      </Flex>
    </LinkBox>
  );
}

function OrgSkeleton() {
  return (
    <Box p={6} bg="white" border="1px solid" borderColor="warmGray.200" borderRadius="16px" aria-hidden="true">
      <Skeleton w="48px" h="48px" borderRadius="12px" mb={5} />
      <Skeleton h="25px" w="65%" mb={3} />
      <Skeleton h="13px" mb={2} />
      <Skeleton h="13px" w="80%" mb={7} />
      <HStack spacing={5} mb={4}>
        {[0, 1].map(index => (
          <Box key={index}>
            <Skeleton h="26px" w="42px" mb={1} />
            <Skeleton h="18px" w="60px" />
          </Box>
        ))}
      </HStack>
      <Flex borderTop="1px solid" borderColor="warmGray.100" pt={5} justify="space-between">
        <Skeleton h="14px" w="85px" />
        <Skeleton h="14px" w="35px" />
      </Flex>
    </Box>
  );
}

export default function ExplorePage() {
  const router = useRouter();
  const { perpetualOrganizations, isLoading: isOrgsLoading } = useProfileHubContext();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { hasAccount, isLoading: isAccountLoading } = useGlobalAccount();
  const { isPasskeyUser, isAuthenticated } = useAuth();
  const { startTour } = useTour();
  const [searchTerm, setSearchTerm] = useState("");
  const searchRef = useRef(null);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [mounted, setMounted] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isSignInOpen, onOpen: onSignInOpen, onClose: onSignInClose } = useDisclosure();

  useEffect(() => { setMounted(true); }, []);

  const getAccountMenuItem = () => {
    if (mounted && isPasskeyUser) return { text: "My Account", onClick: () => router.push("/account") };
    if (!isConnected) return { text: "Connect Wallet", onClick: openConnectModal };
    if (isAccountLoading) return { text: "Loading...", onClick: () => {} };
    if (hasAccount) return { text: "My Account", onClick: () => router.push("/account") };
    return { text: "Sign Up", onClick: () => {} };
  };

  const query = searchTerm.trim().toLowerCase();
  const organizations = perpetualOrganizations.filter((org) => !isHiddenOrg(org.id));
  const filteredOrganizations = organizations.filter((org) =>
    org.id.toLowerCase().includes(query) || org.aboutInfo?.description?.toLowerCase().includes(query)
  );

  const openAbout = (org) => {
    setSelectedOrg(org);
    onOpen();
  };

  const clearSearch = () => {
    setSearchTerm("");
    searchRef.current?.focus();
  };

  return (
    <>
      <SEOHead
        title="Explore community-owned organizations | Poa"
        description="Find your people. Explore community-owned organizations on Poa."
        path="/explore"
      />
      <Box minH="100vh" bg="#FAF9F6" color="warmGray.900">
        <Navbar
          mounted={mounted} isPasskeyUser={isPasskeyUser} isConnected={isConnected}
          isAuthenticated={isAuthenticated} accountMenuItem={getAccountMenuItem()} onSignInOpen={onSignInOpen}
        />
        <SignInModal isOpen={isSignInOpen} onClose={onSignInClose} />

        <Container as="main" maxW="1160px" px={{ base: 5, md: 8 }} pt={{ base: "116px", md: "152px" }} pb={{ base: 12, md: 20 }}>
          <Box as="header" mb={{ base: 9, md: 12 }}>
            <HStack spacing={2.5} mb={4}>
              <Box w="7px" h="7px" borderRadius="full" bg="coral.500" aria-hidden="true" />
              <Text fontFamily="mono" fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="warmGray.600">
                Explore
              </Text>
            </HStack>
            <Heading
              as="h1" fontFamily="'Archivo', sans-serif" fontSize={{ base: "40px", sm: "52px", md: "64px" }}
              fontWeight="550" lineHeight="1.08" letterSpacing="-0.045em" mb={4}
            >
              Find your people.
            </Heading>
            <Text fontSize={{ base: "15px", md: "17px" }} color="warmGray.600" lineHeight="1.6">
              Community-owned. Built together.
            </Text>
          </Box>

          <Box as="section" aria-labelledby="organizations-heading" aria-busy={isOrgsLoading}>
            <Flex
              direction={{ base: "column-reverse", md: "row" }} align={{ base: "stretch", md: "center" }}
              justify="space-between" gap={5} pb={5} mb={6} borderBottom="1px solid" borderColor="warmGray.200"
            >
              <HStack spacing={2.5}>
                <Heading as="h2" id="organizations-heading" fontSize="15px" fontWeight="600">Organizations</Heading>
                <Text role="status" fontFamily="mono" fontSize="12px" color="warmGray.600">
                  {isOrgsLoading ? "Loading…" : query ? `${filteredOrganizations.length} of ${organizations.length}` : organizations.length}
                </Text>
              </HStack>
              <InputGroup w={{ base: "100%", md: "320px" }}>
                <InputLeftElement h="44px" pointerEvents="none" color="warmGray.500">
                  <Icon as={FiSearch} boxSize="17px" />
                </InputLeftElement>
                <Input
                  ref={searchRef} type="search" aria-label="Search organizations" placeholder="Search organizations"
                  value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)}
                  h="44px" fontSize={{ base: "16px", md: "14px" }} bg="white" borderColor="warmGray.200" borderRadius="10px" pr={10}
                  _placeholder={{ color: "warmGray.600" }}
                  _hover={{ borderColor: "warmGray.300" }}
                  _focusVisible={{ borderColor: "coral.500", boxShadow: "0 0 0 1px #F06543" }}
                  sx={{ "&::-webkit-search-cancel-button": { display: "none" } }}
                />
                {searchTerm && (
                  <InputRightElement h="44px">
                    <IconButton
                      aria-label="Clear search" icon={<FiX />} size="sm" variant="ghost" color="warmGray.600"
                      onClick={clearSearch}
                    />
                  </InputRightElement>
                )}
              </InputGroup>
            </Flex>

            {isOrgsLoading ? (
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                {Array.from({ length: 6 }, (_, index) => <OrgSkeleton key={index} />)}
              </SimpleGrid>
            ) : filteredOrganizations.length ? (
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                {filteredOrganizations.map((org) => (
                  <OrgCard key={`${org.chainId}:${org.orgId || org.id}`} org={org} onAbout={openAbout} />
                ))}
              </SimpleGrid>
            ) : (
              <Flex direction="column" align="center" textAlign="center" py={{ base: 14, md: 20 }} px={4}>
                <Flex w="48px" h="48px" align="center" justify="center" bg="warmGray.100" borderRadius="full" mb={5} color="warmGray.600">
                  <Icon as={FiSearch} boxSize={5} aria-hidden="true" />
                </Flex>
                <Heading as="h3" fontSize="20px" fontWeight="600" mb={2}>
                  {query ? "No matches yet" : "No organizations yet"}
                </Heading>
                <Text fontSize="14px" color="warmGray.600" mb={5}>
                  {query ? "Try another name or keyword." : "Check back soon."}
                </Text>
                {query && <Button variant="outline" size="sm" onClick={clearSearch}>Clear search</Button>}
              </Flex>
            )}
          </Box>
        </Container>
      </Box>

      <Modal isOpen={isOpen} onClose={onClose} size={{ base: "full", md: "lg" }} isCentered scrollBehavior="inside">
        <ModalOverlay bg="blackAlpha.400" />
        <ModalContent borderRadius={{ base: 0, md: "20px" }} mx={{ base: 0, md: 5 }}>
          <ModalHeader pt={8} px={8} pb={4}>
            {selectedOrg && <OrgAvatar org={selectedOrg} />}
            <Text mt={5} fontSize="26px" fontWeight="600" letterSpacing="-0.03em" pr={4} overflowWrap="anywhere">
              {selectedOrg?.id}
            </Text>
          </ModalHeader>
          <ModalCloseButton top={4} right={4} />
          <ModalBody px={8} pb={6}>
            {selectedOrg?.aboutInfo?.description && (
              <Text fontSize="15px" lineHeight="1.75" color="warmGray.600" mb={6} whiteSpace="pre-wrap" overflowWrap="anywhere">
                {selectedOrg.aboutInfo.description}
              </Text>
            )}
            <TaskCounts counts={selectedOrg && organizations.find(org =>
              org.orgId === selectedOrg.orgId && org.chainId === selectedOrg.chainId
            )?.taskCounts} />
            <MemberCount count={selectedOrg?.totalMembers} />
          </ModalBody>
          <ModalFooter p={8} pt={3} gap={3} flexWrap="wrap">
            <Button
              variant="outline" borderColor="warmGray.200" leftIcon={<FiMap />} flex={1}
              onClick={() => {
                if (!selectedOrg?.id) return;
                onClose();
                startTour(selectedOrg.id);
              }}
            >
              Take a tour
            </Button>
            {selectedOrg && (
              <Button
                as={Link} href={getVisitUrlForOrg(selectedOrg.id)} flex={1} bg="warmGray.900" color="white"
                rightIcon={<FiArrowRight />} _hover={{ bg: "warmGray.800" }}
              >
                Visit
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
