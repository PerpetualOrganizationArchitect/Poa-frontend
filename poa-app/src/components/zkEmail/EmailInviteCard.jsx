/**
 * EmailInviteCard — join-page surface for ZK Email invites.
 *
 * Self-gating: renders ONLY when the org's allowlist is claimable ('active') or provably live but
 * temporarily unreadable ('degraded'). For 'absent' / 'loading' / 'dormant' it renders nothing —
 * a dormant allowlist would revert every claim, so advertising it on the join page would be a trap.
 *
 * Verified details only: the domain/role lines come from the IPFS file ONLY after it hash-matches
 * the on-chain merkle root (useZkEmailInviteSummary). In 'degraded' we show a generic CTA with no
 * entry details rather than unverified data.
 */

import { Badge, Box, Button, Flex, HStack, Icon, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { FaEnvelopeOpenText, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import useOnboardingColors from '@/components/shared/useOnboardingColors';
import { useZkEmailInviteSummary } from '@/hooks/useZkEmailInviteSummary';
import { useOrgName } from '@/hooks/useOrgName';
import { orgUrl } from '@/util/orgUrl';

const MAX_DOMAINS_SHOWN = 4;

export default function EmailInviteCard({ bg, textColor, subtextColor, accentColor, summary, variant }) {
  const router = useRouter();
  const org = useOrgName();
  const ownSummary = useZkEmailInviteSummary(); // unconditional (rules of hooks); prop wins when provided
  const colors = useOnboardingColors();
  const { status, domains, emailCount, roleNames } = summary || ownSummary;

  if (status !== 'active' && status !== 'degraded') return null;

  // Compact one-line banner (mobile: the full card lives below the fold under the join form).
  if (variant === 'banner') {
    return (
      <Button
        width="100%"
        size="sm"
        colorScheme="teal"
        variant="solid"
        rightIcon={<FaChevronRight />}
        leftIcon={<Icon as={FaEnvelopeOpenText} />}
        onClick={() => router.push(orgUrl(org, 'claim'))}
        isDisabled={!org}
        whiteSpace="normal"
        py={5}
      >
        Invited by email? Claim your role instantly
      </Button>
    );
  }

  const shown = domains.slice(0, MAX_DOMAINS_SHOWN);
  const moreDomains = domains.length - shown.length;
  const grantsLine = roleNames.length
    ? `Grants the ${roleNames.join(', ')} role${roleNames.length > 1 ? 's' : ''} — no vote or approval needed.`
    : 'Grants a role instantly — no vote or approval needed.';

  if (variant === 'join' || variant === 'join-details') {
    const eligibilityDetails = (
      <Box
        as="details"
        width="100%"
        color={colors.muted}
        sx={{ '&[open] .email-eligibility-chevron': { transform: 'rotate(180deg)' } }}
      >
        <Box
          as="summary"
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={3}
          minH="44px"
          fontSize="xs"
          cursor="pointer"
          borderRadius="lg"
          _hover={{ color: colors.ink }}
          _focusVisible={{ boxShadow: colors.focusRing }}
          sx={{ listStyle: 'none', '&::-webkit-details-marker': { display: 'none' } }}
        >
          <Text as="span">Who can join by email?</Text>
          <Icon as={FaChevronDown} className="email-eligibility-chevron" boxSize={3} flexShrink={0} aria-hidden="true" />
        </Box>
        <VStack align="stretch" spacing={3} pt={1} pb={2} fontSize="xs" lineHeight="1.7">
          {status === 'active' ? (
            <>
              {domains.length > 0 && (
                <>
                  <Text>People with an email address at these domains can join:</Text>
                  <VStack as="ul" align="stretch" spacing={2} listStyleType="none" m={0} p={0}>
                    {domains.map(({ domain, roleNames: domainRoles }) => (
                      <Box as="li" key={domain} px={3} py={2} bg={colors.soft} borderRadius="lg" overflowWrap="anywhere">
                        <Text color={colors.ink} fontWeight="600">@{domain}</Text>
                        {domainRoles.length > 0 && (
                          <Text>Join as {domainRoles.join(', ')}</Text>
                        )}
                      </Box>
                    ))}
                  </VStack>
                </>
              )}
              {emailCount > 0 && (
                <Text>
                  Personal email invitations also work. Use the email address on your invitation,
                  even if its domain isn’t listed here.
                </Text>
              )}
              <Text>
                {roleNames.length > 0
                  ? `Available roles: ${roleNames.join(', ')}. No member vouches or approval are needed.`
                  : 'Use an invited email address to join. No member vouches or approval are needed.'}
              </Text>
            </>
          ) : (
            <Text>
              This community accepts email invitations. We couldn’t load the eligible email details.
              If you have an invitation, continue with the email address it was sent to.
            </Text>
          )}
        </VStack>
      </Box>
    );

    if (variant === 'join-details') return eligibilityDetails;

    return (
      <Box width="100%" px={4} py={3} bg={colors.surface} color={colors.ink} border="1px solid" borderColor={colors.line} borderRadius="2xl">
        <HStack spacing={3} align="start">
          <Icon as={FaEnvelopeOpenText} color={colors.accent} boxSize={4} mt={0.5} flexShrink={0} aria-hidden="true" />
          <Text fontSize="sm" fontWeight="600">Have an email invitation?</Text>
        </HStack>
        <Button
          variant="link"
          minH="44px"
          fontSize="sm"
          fontWeight="500"
          color={colors.link}
          rightIcon={<FaChevronRight />}
          onClick={() => router.push(orgUrl(org, 'claim'))}
          isDisabled={!org}
          whiteSpace="normal"
          borderRadius="lg"
          _focusVisible={{ boxShadow: colors.focusRing }}
        >
          Continue with email
        </Button>
        <Box borderTop="1px solid" borderColor={colors.line}>
          {eligibilityDetails}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      width="100%"
      p={{ base: 3, md: 4 }}
      borderRadius="md"
      bg={bg}
      boxShadow="md"
      borderWidth="1px"
      borderColor="whiteAlpha.300"
    >
      <Flex align="flex-start">
        <Icon as={FaEnvelopeOpenText} color={accentColor || 'teal.300'} boxSize={6} mt={1} />
        <VStack ml={4} align="stretch" spacing={2} flex="1">
          <Text fontWeight="bold" fontSize={{ base: 'md', md: 'lg' }} color={textColor}>
            Invited by email? Join instantly
          </Text>

          {status === 'active' ? (
            <>
              <Text color={subtextColor} fontSize="sm">
                Prove you control an invited email — entirely in your browser — and your role is granted
                on the spot.
              </Text>
              {(shown.length > 0 || emailCount > 0) && (
                <Wrap spacing={2}>
                  {shown.map(({ domain, roleNames: rn }) => (
                    <WrapItem key={domain}>
                      <Badge px={2} py={1} borderRadius="md" colorScheme="teal" textTransform="none">
                        @{domain}
                        {rn.length > 0 ? ` → ${rn.join(', ')}` : ''}
                      </Badge>
                    </WrapItem>
                  ))}
                  {moreDomains > 0 && (
                    <WrapItem>
                      <Badge px={2} py={1} borderRadius="md" textTransform="none">
                        +{moreDomains} more domain{moreDomains > 1 ? 's' : ''}
                      </Badge>
                    </WrapItem>
                  )}
                </Wrap>
              )}
              {emailCount > 0 && (
                <Text color={subtextColor} fontSize="xs">
                  Some people are invited by their personal email address too — if you received an
                  invite, you can claim even if your domain isn’t listed.
                </Text>
              )}
              <Text color={subtextColor} fontSize="xs">
                {grantsLine}
              </Text>
            </>
          ) : (
            <Text color={subtextColor} fontSize="sm">
              This organization accepts email-verified joins. If you were invited by email, you can claim
              your role directly.
            </Text>
          )}

          <HStack>
            <Button
              size="sm"
              colorScheme="teal"
              rightIcon={<FaChevronRight />}
              onClick={() => router.push(orgUrl(org, 'claim'))}
              isDisabled={!org}
            >
              Claim with your email
            </Button>
          </HStack>
        </VStack>
      </Flex>
    </Box>
  );
}
