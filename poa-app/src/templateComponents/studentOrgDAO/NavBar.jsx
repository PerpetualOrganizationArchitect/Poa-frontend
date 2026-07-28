import React, { useState, useEffect, useMemo, useCallback, startTransition } from "react";
import { Badge, Box, Flex, HStack, Link, IconButton, useDisclosure, Drawer, DrawerOverlay, DrawerContent, DrawerCloseButton, DrawerHeader, DrawerBody, VStack, Text, Button, Tooltip } from "@chakra-ui/react";
import NextImage from "next/image";
import { HamburgerIcon, SettingsIcon } from '@chakra-ui/icons';
import { FaHome, FaRegFileAlt } from 'react-icons/fa';
import NextLink from "next/link";
import { useRouter } from "next/router";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";
import { usePOContext } from "@/context/POContext";
import { useIsOrgAdmin } from "@/hooks/useIsOrgAdmin";
import { useOrgName } from "@/hooks/useOrgName";
import { useVoteLanes } from "@/hooks/useVoteLanes";
import { useTaskDrafts } from "@/hooks/useTaskDrafts";
import { orgUrl } from "@/util/orgUrl";
import DraftsReviewModal from "@/components/TaskManager/DraftsReviewModal";
import MobileSectionWheel from "./MobileSectionWheel";
import { NAVBAR_MOBILE_HEIGHT } from "./navbarLayout";
const Navbar = React.memo(() => {
  const router = useRouter();
  const org = useOrgName();
  const { isOpen, onOpen, onClose } = useDisclosure();
  // Drawer mount + lazy NextLink prefetches inside it cost ~4s of main-thread
  // work on the click. Deferring the open as a transition lets the browser
  // paint the hamburger's pressed state immediately.
  const handleOpen = useCallback(() => {
    startTransition(onOpen);
  }, [onOpen]);
  const { isPasskeyUser, accountAddress, isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const { educationHubEnabled, hideTreasury, orgId } = usePOContext();
  const { drafts, count: draftCount, projectsWithDrafts, removeDraft, clearProjectDrafts } = useTaskDrafts();
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false);
  const showDraftsChip = !!orgId && draftCount > 0;
  const draftsTooltip = `${draftCount} draft${draftCount === 1 ? '' : 's'} in ${projectsWithDrafts} project${projectsWithDrafts === 1 ? '' : 's'}`;

  const handleSwitchToProject = useCallback((projectId) => {
    if (!org) return;
    const safeProjectId = projectId
      ? encodeURIComponent(decodeURIComponent(projectId))
      : null;
    router.push(orgUrl(org, 'tasks', {
      ...(safeProjectId ? { projectId: safeProjectId } : {}),
      openDrafts: '1',
    }));
  }, [org, router]);

  // Check if user is an org admin (for showing Settings link)
  // Use AuthContext's unified address so passkey users get admin check too
  const { isAdmin } = useIsOrgAdmin(orgId, accountAddress);

  // "Needs your vote" nudge on the Voting nav item — the strongest cheap
  // turnout signal a small org has. Lanes come from the same shared selector
  // the board uses, so the numbers can never disagree.
  const { lanes: voteLanes } = useVoteLanes();
  const needsVoteCount = voteLanes?.needsVote?.length || 0;

  // Navigation items - conditionally include Learn & Earn based on educationHubEnabled
  const navItems = useMemo(() => [
    { name: 'Dashboard', path: orgUrl(org, 'dashboard') },
    { name: 'Tasks', path: orgUrl(org, 'tasks') },
    { name: 'Voting', path: orgUrl(org, 'voting') },
    ...(!hideTreasury ? [{ name: 'Treasury', path: orgUrl(org, 'treasury') }] : []),
    ...(educationHubEnabled ? [{ name: 'Learn & Earn', path: orgUrl(org, 'learn') }] : []),
    ...(isAdmin ? [{ name: 'Settings', path: orgUrl(org, 'settings') }] : []),
  ], [org, hideTreasury, educationHubEnabled, isAdmin]);

  // Sections shown in the mobile swipe-wheel: the content sections only.
  // Settings stays as the gear (desktop) / drawer row — it's a config surface,
  // not a peer content section, so it's excluded from the wheel.
  const wheelSections = useMemo(
    () => navItems.filter((item) => item.name !== 'Settings'),
    [navItems]
  );

  // Function to check active route
  const isActive = useCallback((path) => {
    const basePath = '/' + (router.pathname.split('/')[1] || '');
    return basePath === '/' + (path.split('/')[1] || '');
  }, [router.pathname]);

  return (
    <>
    <Box
      bg="black"
      p={2.5}
      alignItems={"center"}
      position={{ base: "fixed", md: "relative" }}
      top="0"
      left="0"
      zIndex={100}
      width="100%"
      boxShadow={{ base: "0px 1px 5px rgba(0,0,0,0.3)", md: "none" }}
      borderBottom={{ base: "1px solid rgba(255,255,255,0.1)", md: "none" }}
    >
      <Flex
        alignItems="center"
        h={{ base: "40px", md: "60px" }}
        maxW="100%"
        justifyContent="space-between"
      >
        {/* Left side - Home icon */}
        <Flex h="100%" w="auto" mr={{ base: "2", md: "4" }} align="center">
          <Link as={NextLink} href={orgUrl(org, 'home')} passHref>
            {/* Desktop Home Icon */}
            <IconButton
              icon={<FaHome size="34px" />}
              aria-label="Home"
              variant="ghost"
              color="white"
              display={{ base: 'none', md: 'flex' }}
              _hover={{ bg: "whiteAlpha.200" }}
              size="lg"
            />
            {/* Mobile Home Icon */}
            <IconButton
              icon={<FaHome size="34px" />}
              aria-label="Home"
              variant="ghost"
              color="white"
              display={{ base: 'flex', md: 'none' }}
              _hover={{ bg: "whiteAlpha.200" }}
              size="sm"
              p={0}
              mt={1}
            />
          </Link>
        </Flex>
        
        {/* Mobile section wheel — current page centered, neighbouring sections
            peeking left/right; swipe or tap to move between them. Replaces the
            old center logo. Mobile-only; desktop uses the inline nav below. */}
        <MobileSectionWheel sections={wheelSections} />

        {/* Desktop Navigation */}
        <Flex
          data-tour="nav-links"
          justifyContent="space-between"
          flexGrow={1}
          ml={4}
          mr={4}
          alignItems="center"
          display={{ base: 'none', md: 'flex' }}
        >
          <Link as={NextLink} href={orgUrl(org, 'dashboard')} color="white" fontWeight="extrabold" fontSize="xl" mx={"2%"}>
            Dashboard
          </Link>
          <Link
            as={NextLink}
            href={orgUrl(org, 'tasks')}
            color="white"
            fontWeight="extrabold"
            fontSize="xl"
            mx={"2%"}
          >
            Tasks
          </Link>
          <Link
            as={NextLink}
            href={orgUrl(org, 'voting')}
            color="white"
            fontWeight="extrabold"
            fontSize="xl"
            mx={"2%"}
            position="relative"
          >
            Voting
            {needsVoteCount > 0 && (
              <Badge
                aria-label={`${needsVoteCount} ${needsVoteCount === 1 ? 'vote needs' : 'votes need'} you`}
                position="absolute"
                top="-6px"
                right="-16px"
                borderRadius="full"
                px={1.5}
                fontSize="2xs"
                fontWeight="800"
                bg="#F2836B"
                color="white"
              >
                {needsVoteCount}
              </Badge>
            )}
          </Link>
          {!hideTreasury && (
            <Link
              as={NextLink}
              href={orgUrl(org, 'treasury')}
              color="white"
              fontWeight="extrabold"
              fontSize="xl"
              mx={"2%"}
            >
              Treasury
            </Link>
          )}
          {educationHubEnabled && (
            <Link
              as={NextLink}
              href={orgUrl(org, 'learn')}
              color="white"
              fontWeight="extrabold"
              fontSize="xl"
              mx={"2%"}
            >
              Learn & Earn
            </Link>
          )}
          {isAdmin && (
            <Tooltip label="Settings — Edit org appearance, description, links, etc." placement="bottom" hasArrow>
              <IconButton
                as={NextLink}
                href={orgUrl(org, 'settings')}
                icon={<SettingsIcon boxSize={5} />}
                aria-label="Settings"
                variant="ghost"
                color="white"
                _hover={{ bg: "whiteAlpha.200" }}
                size="md"
                mx={"2%"}
              />
            </Tooltip>
          )}
          {showDraftsChip && (
            <Tooltip label={draftsTooltip} placement="bottom" hasArrow>
              <Button
                aria-label="Open task drafts"
                onClick={() => setIsDraftsModalOpen(true)}
                leftIcon={<FaRegFileAlt />}
                size="sm"
                variant="ghost"
                color="white"
                _hover={{ bg: "whiteAlpha.200" }}
                mx={"2%"}
                position="relative"
              >
                Drafts
                <Badge
                  ml={2}
                  colorScheme="purple"
                  bg="purple.400"
                  color="white"
                  borderRadius="full"
                  fontSize="0.7rem"
                  px={2}
                >
                  {draftCount}
                </Badge>
              </Button>
            </Tooltip>
          )}
          {mounted && (isPasskeyUser || isAuthenticated) ? (
            <LoginButton />
          ) : (
            <Button
              as={NextLink}
              href={orgUrl(org, 'join')}
              bgGradient="linear(to-r, green.400, teal.400)"
              color="white"
              borderRadius="full"
              size="md"
              px={6}
              fontWeight="600"
              fontSize="md"
              _hover={{ bgGradient: 'linear(to-r, green.500, teal.500)', transform: 'translateY(-1px)', boxShadow: 'lg' }}
              _active={{ bgGradient: 'linear(to-r, green.600, teal.600)', transform: 'translateY(0)' }}
            >
              Join or Sign In
            </Button>
          )}
        </Flex>

        {/* Mobile Hamburger Button */}
        <IconButton
          aria-label="Open menu"
          icon={<HamburgerIcon boxSize={6} />}
          size="lg"
          color="white"
          variant="ghost"
          display={{ base: 'flex', md: 'none' }}
          onClick={handleOpen}
          zIndex={20}
          position="relative"
          p={3}
          mx={1}
          _hover={{ bg: "whiteAlpha.300" }}
          _active={{ bg: "whiteAlpha.400" }}
          border="none"
          cursor="pointer"
        />
      </Flex>

      {/* Mobile Navigation Drawer */}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="xs">
        <DrawerOverlay bg="rgba(0,0,0,0.7)" />
        <DrawerContent bg="rgba(20, 20, 25, 0.95)">
          <DrawerCloseButton color="white" />
          <DrawerHeader borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.1)" color="white">
            <Flex align="center">
              <NextImage
                src="/images/poa_og.webp"
                alt="PoA Logo"
                width={30}
                height={30}
                style={{ objectFit: 'contain', marginRight: '10px' }}
              />
              {org}
            </Flex>
          </DrawerHeader>
          <DrawerBody p={0}>
            <VStack spacing={0} align="stretch" w="100%">
              {navItems.map((item) => (
                // prefetch={false}: drawer links only mount on open, so default
                // prefetching fires N HTTP requests on click — adds seconds to INP.
                // The user is one tap from picking — cheap to load on the actual click.
                <Link as={NextLink} key={item.name} href={item.path} prefetch={false} passHref>
                  <Flex
                    p={4}
                    align="center"
                    bg={isActive(item.path) ? "rgba(101, 184, 145, 0.1)" : "transparent"}
                    borderLeft={isActive(item.path) ? "4px solid #65B891" : "4px solid transparent"}
                    transition="transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease"
                    _hover={{ bg: "whiteAlpha.100" }}
                    onClick={onClose}
                  >
                    <Text color="white" fontWeight={isActive(item.path) ? "bold" : "normal"}>
                      {item.name}
                    </Text>
                  </Flex>
                </Link>
              ))}
            </VStack>
            
            {showDraftsChip && (
              <Box px={4} pt={4}>
                <Button
                  w="100%"
                  variant="outline"
                  colorScheme="purple"
                  leftIcon={<FaRegFileAlt />}
                  justifyContent="space-between"
                  onClick={() => {
                    onClose();
                    setIsDraftsModalOpen(true);
                  }}
                >
                  <Text flex="1" textAlign="left">{draftsTooltip}</Text>
                  <Badge
                    colorScheme="purple"
                    bg="purple.400"
                    color="white"
                    borderRadius="full"
                  >
                    {draftCount}
                  </Badge>
                </Button>
              </Box>
            )}
            <Box p={6} mt={4}>
              {mounted && (isPasskeyUser || isAuthenticated) ? (
                <VStack spacing={3}>
                  <LoginButton />
                </VStack>
              ) : (
                <VStack spacing={4}>
                  <Button
                    as={NextLink}
                    href={orgUrl(org, 'join')}
                    prefetch={false}
                    onClick={onClose}
                    w="100%"
                    bgGradient="linear(to-r, green.400, teal.400)"
                    color="white"
                    borderRadius="full"
                    size="lg"
                    fontWeight="600"
                    _hover={{ bgGradient: 'linear(to-r, green.500, teal.500)' }}
                    _active={{ bgGradient: 'linear(to-r, green.600, teal.600)' }}
                  >
                    Join or Sign In
                  </Button>
                </VStack>
              )}
              <Text fontSize="xs" color="whiteAlpha.600" mt={6} textAlign="center">
                Powered by PoA • {new Date().getFullYear()}
              </Text>
            </Box>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <DraftsReviewModal
        isOpen={isDraftsModalOpen}
        onClose={() => setIsDraftsModalOpen(false)}
        drafts={drafts}
        removeDraft={removeDraft}
        clearProjectDrafts={clearProjectDrafts}
        activeProjectId={null}
        destColumnId="open"
        onSwitchToProject={handleSwitchToProject}
      />

    </Box>
    <Box
      h={NAVBAR_MOBILE_HEIGHT}
      display={{ base: "block", md: "none" }}
      aria-hidden
    />
    </>
  );
});

Navbar.displayName = 'Navbar';

export default Navbar;
