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
import { FaEnvelopeOpenText, FaChevronRight } from 'react-icons/fa';
import { useZkEmailInviteSummary } from '@/hooks/useZkEmailInviteSummary';
import { useOrgName } from '@/hooks/useOrgName';
import { orgUrl } from '@/util/orgUrl';

const MAX_DOMAINS_SHOWN = 4;

export default function EmailInviteCard({ bg, textColor, subtextColor, accentColor, summary, variant }) {
  const router = useRouter();
  const org = useOrgName();
  const ownSummary = useZkEmailInviteSummary(); // unconditional (rules of hooks); prop wins when provided
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
