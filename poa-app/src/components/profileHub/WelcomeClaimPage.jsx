/**
 * WelcomeClaimPage - Onboarding welcome experience for new org members
 * This is the first thing users see after deploying their org
 */

import React, { useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
  Button,
  Icon,
  Spinner,
  Flex,
  Circle,
  Badge,
} from '@chakra-ui/react';
import { FiUsers, FiArrowRight, FiCheck, FiStar } from 'react-icons/fi';
import { useRouter } from 'next/router';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import { useClaimRole } from '@/hooks';
import { useRefreshSubscription } from '@/context/RefreshContext';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backdropFilter: 'blur(20px)',
  backgroundColor: 'rgba(0, 0, 0, .73)',
};

/**
 * WelcomeClaimPage - Onboarding flow after org deployment
 */
export function WelcomeClaimPage({
  orgName,
  orgMetadata,
  claimableRoles,
  eligibilityModuleAddress,
}) {
  const router = useRouter();
  const { subscribe } = useRefreshSubscription();

  const {
    claimRole,
    isClaimingHat,
    isReady,
  } = useClaimRole(eligibilityModuleAddress);

  // Subscribe to role:claimed event to refresh page after successful claim
  useEffect(() => {
    const unsubscribe = subscribe('role:claimed', () => {
      // Small delay to allow subgraph to index, then refresh
      setTimeout(() => {
        router.replace(router.asPath);
      }, 2000);
    });

    return unsubscribe;
  }, [subscribe, router]);

  const handleClaimRole = async (hatId) => {
    await claimRole(hatId);
  };

  // Find the "Member" role or first role as recommended
  const recommendedRole = claimableRoles.find(r =>
    r.name.toLowerCase().includes('member')
  ) || claimableRoles[0];

  return (
    <>
      <Navbar />
      <Box
        mt={{ base: 16, md: 0 }}
        minH="calc(100vh - 80px)"
        display="flex"
        alignItems="center"
        justifyContent="center"
        p={4}
      >
        <Box
          maxW="600px"
          w="100%"
          borderRadius="2xl"
          bg="transparent"
          boxShadow="2xl"
          position="relative"
          zIndex={2}
          overflow="hidden"
        >
          <div style={glassLayerStyle} />

          {/* Header with step indicator */}
          <HStack
            px={6}
            py={3}
            borderBottom="1px solid"
            borderColor="whiteAlpha.100"
            position="relative"
          >
            <div style={glassLayerStyle} />
            <Circle size="24px" bg="purple.500" color="white" fontSize="xs" fontWeight="bold">
              1
            </Circle>
            <Text color="gray.300" fontSize="sm" fontWeight="medium">
              Getting Started
            </Text>
          </HStack>

          {/* Main Content */}
          <VStack spacing={6} p={{ base: 6, md: 8 }} align="center">

            {/* Org Logo */}
            <Box
              borderRadius="2xl"
              overflow="hidden"
              bg="whiteAlpha.100"
              p={4}
            >
              {orgMetadata?.logo ? (
                <Image
                  src={orgMetadata.logo}
                  alt={`${orgName} logo`}
                  maxH="100px"
                  maxW="100px"
                  objectFit="contain"
                />
              ) : (
                <Image
                  src="/images/high_res_poa.png"
                  alt="Organization"
                  maxH="100px"
                  maxW="100px"
                  objectFit="contain"
                />
              )}
            </Box>

            {/* Welcome Text */}
            <VStack spacing={2} textAlign="center">
              <Text
                fontSize={{ base: "2xl", md: "3xl" }}
                fontWeight="bold"
                color="white"
              >
                Welcome to {orgName}!
              </Text>
              {orgMetadata?.description && (
                <Text
                  fontSize="md"
                  color="gray.400"
                  maxW="400px"
                  noOfLines={2}
                >
                  {orgMetadata.description}
                </Text>
              )}
            </VStack>

            {/* Divider */}
            <Box w="60px" h="2px" bg="purple.500" borderRadius="full" />

            {/* Instruction */}
            <Text
              fontSize="lg"
              color="white"
              fontWeight="medium"
              textAlign="center"
            >
              Choose a role to get started
            </Text>

            {/* Roles List */}
            <VStack w="100%" spacing={3}>
              {!isReady ? (
                <VStack py={6}>
                  <Spinner size="lg" color="purple.400" />
                  <Text color="gray.400" fontSize="sm">Loading roles...</Text>
                </VStack>
              ) : (
                claimableRoles.map((role) => {
                  const isRecommended = role.hatId === recommendedRole?.hatId;
                  const isClaiming = isClaimingHat(role.hatId);

                  return (
                    <Box
                      key={role.hatId}
                      w="100%"
                      p={4}
                      borderRadius="xl"
                      bg={isRecommended ? "purple.900" : "whiteAlpha.50"}
                      border="1px solid"
                      borderColor={isRecommended ? "purple.500" : "whiteAlpha.100"}
                      position="relative"
                      _hover={{
                        borderColor: "purple.400",
                        bg: isRecommended ? "purple.800" : "whiteAlpha.100",
                      }}
                      transition="all 0.2s"
                    >
                      {isRecommended && (
                        <Badge
                          position="absolute"
                          top={-2}
                          right={4}
                          colorScheme="purple"
                          fontSize="xs"
                          px={2}
                          py={0.5}
                          borderRadius="full"
                        >
                          <HStack spacing={1}>
                            <Icon as={FiStar} boxSize={3} />
                            <Text>Recommended</Text>
                          </HStack>
                        </Badge>
                      )}

                      <Flex
                        justify="space-between"
                        align="center"
                        direction={{ base: "column", sm: "row" }}
                        gap={3}
                      >
                        <VStack align={{ base: "center", sm: "start" }} spacing={1}>
                          <Text
                            fontSize="lg"
                            fontWeight="semibold"
                            color="white"
                          >
                            {role.name}
                          </Text>
                          <HStack spacing={1} color="gray.400" fontSize="sm">
                            <Icon as={FiUsers} />
                            <Text>
                              {role.memberCount} {role.memberCount === 1 ? 'member' : 'members'}
                            </Text>
                          </HStack>
                        </VStack>

                        <Button
                          colorScheme="purple"
                          size="md"
                          px={6}
                          rightIcon={isClaiming ? undefined : <Icon as={FiArrowRight} />}
                          isLoading={isClaiming}
                          loadingText="Claiming..."
                          onClick={() => handleClaimRole(role.hatId)}
                          _hover={{
                            transform: "translateX(2px)",
                          }}
                          transition="all 0.2s"
                        >
                          {isClaiming ? "Claiming..." : "Join"}
                        </Button>
                      </Flex>
                    </Box>
                  );
                })
              )}
            </VStack>

            {/* Footer hint */}
            <HStack spacing={2} color="gray.500" fontSize="sm" pt={2}>
              <Icon as={FiCheck} />
              <Text>You can change roles later in org settings</Text>
            </HStack>

          </VStack>
        </Box>
      </Box>
    </>
  );
}

export default WelcomeClaimPage;
