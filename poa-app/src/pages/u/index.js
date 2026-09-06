/**
 * Public User Profile Page
 * Shareable link: /u?username=hudsonhrh
 * No authentication required to view.
 */

import SEOHead from '@/components/common/SEOHead';
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Heading,
  Avatar,
  Card,
  CardBody,
  Grid,
  Badge,
  IconButton,
  Tooltip,
  Skeleton,
  Icon,
  useToast,
  useColorModeValue,
} from '@chakra-ui/react';
import { CopyIcon, CheckIcon } from '@chakra-ui/icons';
import { FiGithub, FiTwitter, FiGlobe } from 'react-icons/fi';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import { findUserProfileByUsername, findUserOrgsAcrossChains } from '@/util/crossChainUsername';
import { filterUserOrgsForViewedProfile } from '@/util/profileOrgFilter';
import UserOrgCard from '@/components/profile/UserOrgCard';
import useIpfsImage from '@/hooks/useIpfsImage';

const PublicProfilePage = () => {
  const router = useRouter();
  const toast = useToast();

  const [profile, setProfile] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const bgGradient = useColorModeValue(
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
  );
  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.95)', 'rgba(0, 0, 0, 0.73)');
  const textColor = useColorModeValue('gray.800', 'white');
  const subtextColor = useColorModeValue('gray.600', 'gray.400');

  const username = router.query.username;

  useEffect(() => {
    if (!router.isReady) return;
    if (!username) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setNotFound(false);

      const result = await findUserProfileByUsername(username);
      if (cancelled) return;

      if (!result.address) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile(result);

      // Fetch org memberships
      const orgs = await findUserOrgsAcrossChains(result.address);
      if (!cancelled) {
        setOrganizations(orgs);
        setLoading(false);
      }
    }

    loadProfile();
    return () => { cancelled = true; };
  }, [router.isReady, username]);

  const visibleOrganizations = filterUserOrgsForViewedProfile(organizations, username);

  const handleCopyAddress = () => {
    if (profile?.address) {
      navigator.clipboard.writeText(profile.address);
      setCopiedAddress(true);
      toast({ title: 'Address copied!', status: 'success', duration: 2000 });
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const meta = profile?.metadata;
  const displayName = profile?.username || username;
  const avatarSrc = useIpfsImage(meta?.avatar);

  const seoHead = (
    <SEOHead
      title={`${displayName || 'Profile'} | Poa`}
      description={meta?.bio || `View ${displayName}'s profile on Poa`}
      path="/u"
    />
  );

  return (
    <>
      {seoHead}
      <Box minH="100vh" bgGradient={bgGradient}>
        <Navbar />

        <Container maxW="container.lg" pt={{ base: "80px", md: "100px" }} pb={8}>
          {loading ? (
            <VStack spacing={6}>
              <Skeleton height="250px" width="100%" borderRadius="2xl" />
              <Skeleton height="200px" width="100%" borderRadius="2xl" />
            </VStack>
          ) : notFound ? (
            <Card borderRadius="2xl" boxShadow="2xl" bg={cardBg}>
              <CardBody p={8}>
                <VStack spacing={4} align="center" py={8}>
                  <Heading size="lg" color={textColor}>User not found</Heading>
                  <Text color={subtextColor}>
                    {username
                      ? `No account registered with the username "${username}".`
                      : 'No username specified.'}
                  </Text>
                  <Link href="/explore" passHref legacyBehavior>
                    <Text as="a" color="purple.400" fontWeight="medium" _hover={{ textDecoration: 'underline' }}>
                      Browse organizations
                    </Text>
                  </Link>
                </VStack>
              </CardBody>
            </Card>
          ) : (
            <VStack spacing={6} align="stretch">
              {/* Profile Header Card */}
              <Card borderRadius="2xl" boxShadow="2xl" bg={cardBg}>
                <CardBody p={[4, 6, 8]}>
                  <VStack spacing={5} align="center">
                    <Avatar
                      size="2xl"
                      name={displayName}
                      src={avatarSrc || undefined}
                      bg="purple.500"
                    />

                    <Heading size="xl" color={textColor}>
                      {displayName}
                    </Heading>

                    {/* Address */}
                    <HStack>
                      <Text color={subtextColor} fontFamily="mono" fontSize="sm">
                        {formatAddress(profile?.address)}
                      </Text>
                      <Tooltip label={copiedAddress ? 'Copied!' : 'Copy address'}>
                        <IconButton
                          icon={copiedAddress ? <CheckIcon /> : <CopyIcon />}
                          aria-label="Copy address"
                          size="xs"
                          variant="ghost"
                          onClick={handleCopyAddress}
                          colorScheme={copiedAddress ? 'green' : 'gray'}
                        />
                      </Tooltip>
                    </HStack>

                    {/* Bio */}
                    {meta?.bio && (
                      <Text color={subtextColor} textAlign="center" maxW="500px" fontSize="md">
                        {meta.bio}
                      </Text>
                    )}

                    {/* Social Links */}
                    {(meta?.github || meta?.twitter || meta?.website) && (
                      <HStack spacing={4}>
                        {meta.github && (
                          <Tooltip label={`GitHub: ${meta.github}`}>
                            <IconButton
                              as="a"
                              href={`https://github.com/${meta.github.replace(/^@/, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              icon={<Icon as={FiGithub} />}
                              aria-label="GitHub"
                              variant="ghost"
                              colorScheme="gray"
                              size="lg"
                            />
                          </Tooltip>
                        )}
                        {meta.twitter && (
                          <Tooltip label={`Twitter: ${meta.twitter}`}>
                            <IconButton
                              as="a"
                              href={`https://x.com/${meta.twitter.replace(/^@/, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              icon={<Icon as={FiTwitter} />}
                              aria-label="Twitter"
                              variant="ghost"
                              colorScheme="gray"
                              size="lg"
                            />
                          </Tooltip>
                        )}
                        {meta.website && (
                          <Tooltip label={meta.website}>
                            <IconButton
                              as="a"
                              href={meta.website.startsWith('http') ? meta.website : `https://${meta.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              icon={<Icon as={FiGlobe} />}
                              aria-label="Website"
                              variant="ghost"
                              colorScheme="gray"
                              size="lg"
                            />
                          </Tooltip>
                        )}
                      </HStack>
                    )}
                  </VStack>
                </CardBody>
              </Card>

              {/* Organizations Card */}
              <Card borderRadius="2xl" boxShadow="2xl" bg={cardBg}>
                <CardBody p={[4, 6, 8]}>
                  <VStack spacing={6} align="stretch">
                    <HStack justify="space-between">
                      <Heading size="md" color={textColor}>
                        Organizations
                      </Heading>
                      <Badge colorScheme="purple" fontSize="md" px={3} py={1} borderRadius="full">
                        {visibleOrganizations.length}
                      </Badge>
                    </HStack>

                    {visibleOrganizations.length === 0 ? (
                      <Text color={subtextColor} textAlign="center" py={4}>
                        Not a member of any organizations yet.
                      </Text>
                    ) : (
                      <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
                        {visibleOrganizations.map((userOrg) => (
                          <Link
                            key={userOrg.id}
                            href={`/home?org=${encodeURIComponent(userOrg.organization?.name || '')}`}
                            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                          >
                            <UserOrgCard userOrg={userOrg} />
                          </Link>
                        ))}
                      </Grid>
                    )}
                  </VStack>
                </CardBody>
              </Card>
            </VStack>
          )}
        </Container>
      </Box>
    </>
  );
};

export default PublicProfilePage;
