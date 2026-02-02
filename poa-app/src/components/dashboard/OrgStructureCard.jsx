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
import { FiArrowRight, FiUsers, FiActivity } from 'react-icons/fi';
import Link from 'next/link';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backdropFilter: 'blur(20px)',
  backgroundColor: 'rgba(0, 0, 0, 0.73)',
  border: '1px solid rgba(148, 115, 220, 0.15)',
  transition: 'all 0.3s ease',
};

export function OrgStructureCard({
  roles = [],
  totalMembers = 0,
  governance,
  userDAO,
  sectionHeadingSize = '2xl',
}) {
  return (
    <Link href={`/org-structure?userDAO=${userDAO}`} passHref legacyBehavior>
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
        transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        sx={{
          '& .glass-layer': {
            transition: 'all 0.3s ease',
          },
          '& .arrow-icon': {
            transition: 'all 0.3s ease',
          },
        }}
        _hover={{
          transform: 'translateY(-4px) scale(1.02)',
          boxShadow: '0 12px 28px rgba(148, 115, 220, 0.25)',
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

        {/* Header */}
        <HStack
          justify="space-between"
          align="center"
          px={{ base: 3, md: 6 }}
          pt={3}
          pb={2}
        >
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

        {/* Stats Row */}
        <HStack spacing={{ base: 4, md: 6 }} px={{ base: 3, md: 6 }} py={2}>
          <HStack spacing={2}>
            <Icon as={FiUsers} color="purple.400" boxSize={4} />
            <Text fontSize="sm" color="gray.300">
              <Text as="span" fontWeight="bold" color="white">
                {roles.length}
              </Text>{' '}
              Roles
            </Text>
          </HStack>
          <HStack spacing={2}>
            <Icon as={FiActivity} color="purple.400" boxSize={4} />
            <Text fontSize="sm" color="gray.300">
              <Text as="span" fontWeight="bold" color="white">
                {totalMembers}
              </Text>{' '}
              Members
            </Text>
          </HStack>
        </HStack>

        {/* Role Badges */}
        {roles.length > 0 && (
          <Wrap spacing={2} px={{ base: 3, md: 6 }} py={2}>
            {roles.slice(0, 3).map((role) => (
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
                  {role.name?.length > 12
                    ? `${role.name.slice(0, 12)}...`
                    : role.name || 'Role'}
                </Badge>
              </WrapItem>
            ))}
            {roles.length > 3 && (
              <WrapItem>
                <Badge
                  px={3}
                  py={1}
                  borderRadius="full"
                  bg="purple.900"
                  color="purple.200"
                  fontSize="xs"
                >
                  +{roles.length - 3} more
                </Badge>
              </WrapItem>
            )}
          </Wrap>
        )}

        {/* Governance Section */}
        <Box px={{ base: 3, md: 6 }} pb={4} pt={2}>
          <Text
            fontSize="xs"
            color="gray.500"
            mb={2}
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Governance
          </Text>
          <HStack spacing={4} flexWrap="wrap">
            {governance?.hybridVoting && (
              <HStack spacing={2}>
                <Box w={2} h={2} borderRadius="full" bg="purple.400" />
                <Text fontSize="sm" color="gray.300">
                  Hybrid{' '}
                  <Text as="span" fontWeight="semibold" color="white">
                    {governance.hybridVoting.quorum}%
                  </Text>
                </Text>
              </HStack>
            )}
            {governance?.directDemocracyVoting && (
              <HStack spacing={2}>
                <Box w={2} h={2} borderRadius="full" bg="blue.400" />
                <Text fontSize="sm" color="gray.300">
                  Direct{' '}
                  <Text as="span" fontWeight="semibold" color="white">
                    {governance.directDemocracyVoting.quorumPercentage}%
                  </Text>
                </Text>
              </HStack>
            )}
            {!governance?.hybridVoting && !governance?.directDemocracyVoting && (
              <Text fontSize="sm" color="gray.500" fontStyle="italic">
                No governance configured
              </Text>
            )}
          </HStack>
        </Box>
      </Box>
    </Link>
  );
}

export default OrgStructureCard;
