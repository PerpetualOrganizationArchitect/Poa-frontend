/**
 * OrgStructureCard - Dashboard preview card for org structure
 * Clickable card that links to full org structure page
 */
import React from 'react';
import {
  Box,
  HStack,
  Text,
  Icon,
  Badge,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { FiArrowRight, FiUsers } from 'react-icons/fi';
import Link from 'next/link';
import { displayName, taglineFor } from '@/config/votingVocabulary';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(0, 0, 0, 0.73)',
  border: '1px solid rgba(148, 115, 220, 0.15)',
  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
};

export function OrgStructureCard({
  roles = [],
  totalMembers = 0,
  governance,
  votingClasses = [],
  userDAO,
  sectionHeadingSize = '2xl',
}) {
  // Blended voting's weight split: DIRECT classes are one-person-one-vote
  // (membership); everything else weighs contributions. Only shown when the
  // class config has loaded and actually sums to a whole.
  const directPct = (votingClasses || [])
    .filter((c) => c.strategy === 'DIRECT')
    .reduce((sum, c) => sum + (Number(c.slicePct) || 0), 0);
  const totalPct = (votingClasses || [])
    .reduce((sum, c) => sum + (Number(c.slicePct) || 0), 0);
  const blendedSplit = totalPct === 100
    ? `${directPct}% membership · ${totalPct - directPct}% contributions`
    : null;
  return (
    <Link href={`/team?org=${encodeURIComponent(userDAO)}`} passHref legacyBehavior>
      <Box
        as="a"
        display="block"
        w="100%"
        h="100%"
        borderRadius="2xl"
        bg="transparent"
        boxShadow="lg"
        position="relative"
        zIndex={2}
        cursor="pointer"
        transition="transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        sx={{
          '& .glass-layer': {
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
          },
          '& .arrow-icon': {
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
          },
        }}
        _hover={{
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 25px rgba(0,0,0,0.3)',
          '& .glass-layer': {
            borderColor: 'rgba(148, 115, 220, 0.5)',
            boxShadow: 'inset 0 0 25px rgba(148, 115, 220, 0.15)',
          },
          '& .arrow-icon': {
            transform: 'translateX(4px)',
            color: 'purple.300',
          },
        }}
        _focus={{
          outline: 'none',
          boxShadow: '0 0 0 3px rgba(148, 115, 220, 0.5)',
        }}
      >
        <Box className="glass-layer" sx={glassLayerStyle} borderRadius="2xl" />

        {/* Header - darker black bar like other dashboard cards */}
        <HStack
          justify="space-between"
          align="center"
          px={{ base: 3, md: 6 }}
          py={2}
          position="relative"
          borderTopRadius="2xl"
        >
          <Box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            borderTopRadius="inherit"
            backgroundColor="rgba(0, 0, 0, 0.73)"
            zIndex={-1}
          />
          <Text fontWeight="bold" fontSize={sectionHeadingSize}>
            Org Structure
          </Text>
          <Icon
            as={FiArrowRight}
            className="arrow-icon"
            color="gray.500"
            boxSize={5}
          />
        </HStack>

        {/* Roles + members summary, then the top roles as chips, each carrying
            its member count so the row says something about the org's shape. */}
        <Box px={{ base: 3, md: 6 }} pt={3} pb={2}>
          <HStack spacing={2} mb={roles.length > 0 ? 3 : 0}>
            <Icon as={FiUsers} color="purple.400" boxSize={4} />
            <Text fontSize="sm" color="gray.300">
              <Text as="span" fontWeight="bold" color="white">
                {roles.length}
              </Text>{' '}
              {roles.length === 1 ? 'Role' : 'Roles'}
              <Text as="span" color="gray.500"> · </Text>
              <Text as="span" fontWeight="bold" color="white">
                {totalMembers}
              </Text>{' '}
              {totalMembers === 1 ? 'Member' : 'Members'}
            </Text>
          </HStack>
          {roles.length > 0 && (
            <Wrap spacing={2}>
              {roles.slice(0, 4).map((role) => {
                const name = role.name?.length > 14
                  ? `${role.name.slice(0, 14)}...`
                  : role.name || 'Role';
                const count = typeof role.memberCount === 'number' ? role.memberCount : null;
                return (
                  <WrapItem key={role.hatId || role.id}>
                    <Badge
                      px={3}
                      py={1}
                      borderRadius="full"
                      bg="whiteAlpha.100"
                      color="gray.200"
                      fontSize="xs"
                      fontWeight="medium"
                      border="1px solid"
                      borderColor="whiteAlpha.200"
                    >
                      {name}
                      {count != null && (
                        <Text as="span" color="whiteAlpha.600" fontWeight="semibold">
                          {' '}· {count}
                        </Text>
                      )}
                    </Badge>
                  </WrapItem>
                );
              })}
              {roles.length > 4 && (
                <WrapItem>
                  <Badge
                    px={3}
                    py={1}
                    borderRadius="full"
                    bg="purple.900"
                    color="purple.200"
                    fontSize="xs"
                  >
                    +{roles.length - 4} more
                  </Badge>
                </WrapItem>
              )}
            </Wrap>
          )}
        </Box>

        {/* Governance — the models the org decides with. For Blended voting
            the interesting glance-info is the WEIGHT SPLIT (how much power is
            one-person-one-vote vs contribution-weighted), not thresholds. */}
        <Box px={{ base: 3, md: 6 }} pb={4} pt={2}>
          <Text
            fontSize="xs"
            color="gray.500"
            mb={2.5}
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Governance
          </Text>
          {(governance?.hybridVoting || governance?.directDemocracyVoting) ? (
            <Box>
              {governance?.hybridVoting && (
                <HStack align="flex-start" spacing={2.5} mb={governance?.directDemocracyVoting ? 3 : 0}>
                  <Box w={2} h={2} mt="7px" flexShrink={0} borderRadius="full" bg="purple.400" />
                  <Box>
                    <Text fontSize="sm" fontWeight="semibold" color="white">
                      {displayName('Hybrid')}
                      <Text as="span" fontWeight="normal" color="gray.400"> — binding decisions</Text>
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {blendedSplit || taglineFor('Hybrid')}
                    </Text>
                  </Box>
                </HStack>
              )}
              {governance?.directDemocracyVoting && (
                <HStack align="flex-start" spacing={2.5}>
                  <Box w={2} h={2} mt="7px" flexShrink={0} borderRadius="full" bg="blue.400" />
                  <Box>
                    <Text fontSize="sm" fontWeight="semibold" color="white">
                      {displayName('Direct Democracy')}
                      <Text as="span" fontWeight="normal" color="gray.400"> — polls</Text>
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      One person, one vote
                    </Text>
                  </Box>
                </HStack>
              )}
            </Box>
          ) : (
            <Text fontSize="sm" color="gray.500" fontStyle="italic">
              No governance configured
            </Text>
          )}
        </Box>
      </Box>
    </Link>
  );
}

export default OrgStructureCard;
