import React from 'react';
import {
  Box, Button, Container, Flex, Grid, Heading, HStack, Icon, Image, Text,
  VStack,
} from '@chakra-ui/react';
import useOnboardingColors from '@/components/shared/useOnboardingColors';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FiArrowRight, FiCheck, FiChevronDown, FiUsers, FiMessageCircle, FiArrowUpRight, FiMail } from 'react-icons/fi';
import { FaFingerprint, FaWallet } from 'react-icons/fa';

export function JoinLayout({ orgName, orgLogoSrc, isVouching, isAuthenticated, children, invite, account, cardLabel }) {
  const colors = useOnboardingColors();
  const { page: bg, ink, muted, line, surface, soft: accent } = colors;
  const benefits = [
    { icon: FiUsers, title: 'Find your people', body: 'Meet the people building this community and find ways to work together.' },
    { icon: FiMessageCircle, title: 'Have a say', body: 'Take part in decisions and help shape what comes next.' },
    { icon: FiArrowUpRight, title: 'Turn ideas into action', body: 'Find projects, complete tasks, and earn rewards for your contributions.' },
  ];

  return (
    <Box as="main" minH="calc(100vh - 80px)" bg={bg} color={ink} textAlign="left" pb={{ base: 10, lg: 16 }}>
      <Container maxW="1160px" px={{ base: 5, md: 8 }} pt={{ base: 7, lg: 12 }}>
        <Flex align="center" justify="space-between" gap={4} mb={{ base: 7, lg: 12 }}>
          <HStack spacing={3} minW={0}>
            <Flex flexShrink={0} w="44px" h="44px" p={1} align="center" justify="center" bg={orgLogoSrc ? surface : accent} borderRadius="lg" overflow="hidden">
              <Image
                src={orgLogoSrc || undefined}
                alt={`${orgName} logo`}
                w="100%" h="100%" objectFit="contain"
                fallback={<Icon as={FiUsers} boxSize={5} aria-hidden="true" />}
              />
            </Flex>
            <Text fontSize="sm" fontWeight="600" overflowWrap="anywhere">{orgName}</Text>
            <Text color={muted} aria-hidden="true">/</Text>
            <Text fontSize="sm" color={muted}>{isVouching ? 'Vouch' : 'Membership'}</Text>
          </HStack>
          {account}
        </Flex>

        <Grid data-tour="join-content" templateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 480px)' }} columnGap={{ lg: 16, xl: 20 }} rowGap={8} alignItems="start">
          <Box pt={{ lg: 7 }}>
            <Text fontSize="11px" fontWeight="700" letterSpacing="0.18em" color={muted} mb={{ base: 3, lg: 5 }}>
              {isVouching ? 'A COMMUNITY BUILT ON TRUST' : 'JOIN THE COMMUNITY'}
            </Text>
            <Heading as="h1" fontSize={{ base: '32px', md: '40px', lg: '48px' }} fontWeight="600" lineHeight="1.15" letterSpacing="-0.035em" maxW="500px">
              {isVouching ? <>Good people.<br />Stronger together.</> : <>Your community.<br />Your place in it.</>}
            </Heading>
            <Text mt={{ base: 4, lg: 6 }} color={muted} fontSize={{ base: 'sm', md: 'md' }} lineHeight="1.8" maxW="390px">
              {isVouching
                ? 'Your vouch helps someone join. It tells the community you trust them to contribute.'
                : 'Share your skills, take part in decisions, and help your community move forward.'}
            </Text>
            <VStack display={{ base: 'none', lg: 'flex' }} align="stretch" spacing={6} mt={10}>
              {isVouching ? (
                <Box borderTop="1px solid" borderColor={line} pt={6}>
                  <Text fontWeight="600" mb={2}>How your vouch helps</Text>
                  <Text fontSize="sm" color={muted} lineHeight="1.8">Each role needs a set number of member vouches. Once the applicant has enough, they can finish joining.</Text>
                </Box>
              ) : benefits.map(({ icon, title, body }) => (
                <Flex key={title} gap={4} align="start">
                  <Flex flexShrink={0} w="36px" h="36px" align="center" justify="center" border="1px solid" borderColor={line} borderRadius="full">
                    <Icon as={icon} boxSize={4} />
                  </Flex>
                  <Box>
                    <Text fontWeight="600" fontSize="sm" mb={1}>{title}</Text>
                    <Text color={muted} fontSize="sm" lineHeight="1.7" maxW="340px">{body}</Text>
                  </Box>
                </Flex>
              ))}
            </VStack>
          </Box>

          <Box minW={0}>
            {!isVouching && invite && <Box mb={4}>{invite}</Box>}
            <Box
              bg={surface} border="1px solid" borderColor={line} borderRadius="2xl"
              boxShadow="0 4px 24px rgba(0, 0, 0, 0.05)" p={{ base: 6, md: 9 }}
              sx={{
                '.chakra-button': { whiteSpace: 'normal' },
                '.chakra-heading': { overflowWrap: 'anywhere' },
                '.chakra-form__label': { color: ink },
                '.chakra-input': { color: ink, _placeholder: { color: muted } },
                '.chakra-select, .chakra-textarea': {
                  bg: surface, color: ink, borderColor: line,
                  _placeholder: { color: muted },
                  _focus: { borderColor: colors.accent, boxShadow: colors.inputFocusRing },
                },
              }}
            >
              <HStack spacing={2} mb={6} color={muted} fontSize="xs" fontWeight="500">
                <Box w="6px" h="6px" bg="coral.500" borderRadius="full" aria-hidden="true" />
                <Text>{isVouching ? 'Member vouch' : cardLabel || (isAuthenticated ? 'Your membership' : 'Get started')}</Text>
              </HStack>
              {children}
            </Box>
          </Box>

          {!isVouching && (
            <Box display={{ base: 'block', lg: 'none' }} borderTop="1px solid" borderColor={line} pt={7}>
              <Text fontSize="xs" fontWeight="700" letterSpacing="0.1em" color={muted} mb={5}>WHAT YOU CAN DO HERE</Text>
              <VStack align="stretch" spacing={5}>
                {benefits.map(({ icon, title, body }) => (
                  <Flex key={title} gap={3}>
                    <Icon as={icon} mt={1} boxSize={4} flexShrink={0} />
                    <Box><Text fontSize="sm" fontWeight="600">{title}</Text><Text fontSize="sm" color={muted} mt={1} lineHeight="1.7">{body}</Text></Box>
                  </Flex>
                ))}
              </VStack>
            </Box>
          )}
        </Grid>
      </Container>
    </Box>
  );
}

export function JoinWalletOption() {
  const colors = useOnboardingColors();
  const { muted } = colors;
  return (
    <ConnectButton.Custom>
      {({ mounted, account, chain, openConnectModal, openChainModal }) => (
        <Button
          variant="ghost" color={muted} size="sm" minH="44px" width="100%"
          leftIcon={<FaWallet size={13} />} fontWeight="500"
          _hover={{ bg: colors.soft, color: colors.ink }}
          _focusVisible={{ boxShadow: colors.focusRing }}
          isDisabled={!mounted}
          onClick={account && chain?.unsupported ? openChainModal : openConnectModal}
        >
          {account && chain?.unsupported ? 'Switch network' : 'Use a wallet instead'}
        </Button>
      )}
    </ConnectButton.Custom>
  );
}

export function JoinSignIn({ onSignIn }) {
  const colors = useOnboardingColors();
  const { muted } = colors;
  const { link } = colors;
  return (
    <Flex justify="center" align="center" flexWrap="wrap" gap={1} fontSize="sm" color={muted}>
      <Text>Already have an account?</Text>
      <Button variant="link" color={link} size="sm" minH="44px" onClick={onSignIn}>Sign in</Button>
    </Flex>
  );
}

export function JoinAccountStart({ orgName, roleName, onCreate, onSignIn }) {
  const colors = useOnboardingColors();
  const { ink, muted, soft: badge, primary: buttonBg, primaryText: buttonInk, hover: buttonHover } = colors;
  return (
    <VStack spacing={4} align="stretch">
      <Box>
        <Heading as="h2" fontSize={{ base: '24px', md: '28px' }} fontWeight="600" letterSpacing="-0.035em" lineHeight="1.2" color={ink} overflowWrap="anywhere">Join {orgName}</Heading>
        <Text color={muted} fontSize="sm" lineHeight="1.8" mt={3}>Create your account to get involved.</Text>
        {roleName && <HStack display="inline-flex" mt={4} px={3} py={1.5} bg={badge} borderRadius="full" fontSize="xs" color={ink}><Icon as={FiCheck} /><Text>Join as {roleName}</Text></HStack>}
      </Box>
      <Box mt={1}>
        <Button onClick={onCreate} width="100%" height="56px" colorScheme="amethyst" bg={buttonBg} color={buttonInk} _hover={{ bg: buttonHover }} _focusVisible={{ boxShadow: colors.focusRing }} borderRadius="lg" fontSize="lg" fontWeight="600" leftIcon={<FaFingerprint />} rightIcon={<FiArrowRight />} justifyContent="space-between" px={5}>Create account</Button>
        <Text fontSize="xs" color={muted} textAlign="center" mt={3} lineHeight="1.7">Use your face, fingerprint, or device PIN.</Text>
      </Box>
      <JoinSignIn onSignIn={onSignIn} />
      <JoinWalletOption />
    </VStack>
  );
}

export function JoinInvitationStart({ orgName, status, hasError, onClaim, onRetry, isAuthenticated, onSignIn, children }) {
  const colors = useOnboardingColors();
  const canClaim = status === 'active' || status === 'degraded';
  const unavailable = hasError || status === 'unknown';
  const checking = status === 'loading';

  return (
    <VStack spacing={5} align="stretch">
      <Box>
        <Heading as="h2" fontSize={{ base: '24px', md: '28px' }} fontWeight="600" letterSpacing="-0.035em" lineHeight="1.2">
          {unavailable ? 'Membership options unavailable' : canClaim ? `Join ${orgName} by email` : checking ? 'Checking invitations' : 'Membership by invitation'}
        </Heading>
        <Text color={colors.muted} fontSize="sm" lineHeight="1.8" mt={3}>
          {unavailable
            ? 'We couldn’t check how to join this community. Please try again.'
            : canClaim
              ? 'Use an invited email address to claim your role. Member vouches aren’t required.'
              : checking
                ? 'We’re checking this community’s email invitations.'
                : status === 'dormant'
                  ? 'Email invitations aren’t open right now. Ask a member how to join.'
                  : 'This community isn’t accepting direct signups. Ask a member about joining.'}
        </Text>
      </Box>
      {!unavailable && canClaim && (
        <Button onClick={onClaim} width="100%" minH="56px" colorScheme="amethyst" bg={colors.primary} color={colors.primaryText} _hover={{ bg: colors.hover }} _focusVisible={{ boxShadow: colors.focusRing }} borderRadius="lg" fontSize="lg" fontWeight="600" leftIcon={<FiMail />}>
          Continue with email
        </Button>
      )}
      {!unavailable && canClaim && children}
      {unavailable && <Button onClick={onRetry} variant="outline" colorScheme="amethyst">Try again</Button>}
      {checking && !unavailable && <Button isLoading loadingText="Checking invitations…" variant="ghost" color={colors.muted} />}
      {!isAuthenticated && <JoinSignIn onSignIn={onSignIn} />}
    </VStack>
  );
}

export function JoinRoleDisclosure({ isOpen, onToggle, children }) {
  const { line, muted } = useOnboardingColors();
  return (
    <Box borderTop="1px solid" borderColor={line} pt={5} mt={1}>
      <Button variant="unstyled" display="flex" alignItems="center" justifyContent="space-between" gap={3} width="100%" height="auto" minH="44px" textAlign="left" whiteSpace="normal" onClick={onToggle} aria-expanded={isOpen} aria-controls="join-role-application">
        <Box><Text fontSize="sm" fontWeight="600">Explore other roles</Text><Text fontSize="xs" color={muted} fontWeight="400" mt={1}>Apply for a role that needs member vouches.</Text></Box>
        <Icon as={FiChevronDown} flexShrink={0} transform={isOpen ? 'rotate(180deg)' : undefined} />
      </Button>
      <Box id="join-role-application" hidden={!isOpen} pt={5}>{isOpen && children}</Box>
    </Box>
  );
}
