/**
 * RoleOffersSection — pending role offers the current user can accept.
 *
 * A role offered to a not-yet-member is an offer they consent into: accepting
 * mints the identity hat + any group marker hats in one sponsored tx. Renders
 * null when there are no offers, so it is invisible for everyone else.
 */

import React from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Badge, Wrap, WrapItem } from '@chakra-ui/react';
import { useRoleOffers } from '@/hooks/useRoleOffers';

export function RoleOffersSection() {
  const { offers, acceptOffer, acceptingId } = useRoleOffers();

  if (!offers.length) return null;

  return (
    <Box as="section" data-tour="role-offers">
      <Heading size="lg" color="warmGray.900" mb={4}>
        Roles offered to you
      </Heading>
      <Text color="warmGray.600" mb={4}>
        You’ve been offered {offers.length === 1 ? 'a role' : 'these roles'}. Accepting adds you to the organization with the role and any groups it belongs to.
      </Text>
      <VStack align="stretch" spacing={3}>
        {offers.map((offer) => {
          const groups = (offer.role?.groupMemberships || [])
            .map((m) => m?.group?.name)
            .filter(Boolean);
          return (
            <Box
              key={offer.id}
              p={4}
              borderRadius="lg"
              bg="white"
              border="1px solid"
              borderColor="warmGray.200"
              boxShadow="sm"
            >
              <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
                <VStack align="start" spacing={1}>
                  <Heading size="md" color="warmGray.900">
                    {offer.role?.name || `Role ${offer.roleManagerRoleId}`}
                  </Heading>
                  {groups.length ? (
                    <Wrap spacing={1}>
                      {groups.map((g) => (
                        <WrapItem key={g}>
                          <Badge colorScheme="purple" variant="subtle" fontSize="2xs">{g}</Badge>
                        </WrapItem>
                      ))}
                    </Wrap>
                  ) : null}
                </VStack>
                <Button
                  colorScheme="purple"
                  size="sm"
                  isLoading={acceptingId === offer.id}
                  loadingText="Accepting"
                  onClick={() => acceptOffer(offer)}
                >
                  Accept role
                </Button>
              </HStack>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
}

export default RoleOffersSection;
