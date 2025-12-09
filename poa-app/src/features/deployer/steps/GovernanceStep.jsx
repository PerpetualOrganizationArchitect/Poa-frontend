/**
 * GovernanceStep - Voting configuration
 *
 * This step configures how decisions are made:
 * - Philosophy slider for voting weight distribution
 * - Voting permissions (who can vote, who can create proposals)
 *
 * Note: Role powers are configured on the Team step, not here.
 * Note: Optional features (Education Hub, Election Hub) are configured on the next step.
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Badge,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { useDeployer } from '../context/DeployerContext';
import { NavigationButtons } from '../components/common';
import { PhilosophySlider, getZoneInfo } from '../components/governance';
import { sliderToVotingConfig } from '../utils/philosophyMapper';
import { PiChatDots, PiMegaphoneSimple } from 'react-icons/pi';

export function GovernanceStep() {
  const { state, actions } = useDeployer();

  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const sectionBg = useColorModeValue('gray.50', 'gray.900');
  const helperColor = useColorModeValue('gray.600', 'gray.400');

  const { philosophy, roles, permissions } = state;

  // Handle philosophy slider change
  const handleSliderChange = (value) => {
    actions.setPhilosophySlider(value);
  };

  // Handle voting permission toggle
  const handleToggleVotingPermission = (permissionKey, roleIndex) => {
    actions.togglePermission(permissionKey, roleIndex);
  };

  // Apply philosophy when advancing
  const handleNext = () => {
    // Convert philosophy slider to voting config
    const votingConfig = sliderToVotingConfig(philosophy.slider);

    // Apply voting config
    actions.applyPhilosophy(votingConfig, state.permissions);

    // Move to next step
    actions.nextStep();
  };

  const handleBack = () => {
    actions.prevStep();
  };

  // Get zone info for summary
  const zoneInfo = getZoneInfo(philosophy.slider);

  // Helper to get role names that can vote
  const getVoterRoleNames = () => {
    return roles
      .filter((_, idx) => (permissions.ddVotingRoles || []).includes(idx))
      .map((r) => r.name);
  };

  return (
    <>
      <VStack spacing={6} align="stretch">
        {/* Philosophy Slider - renders its own explanation sections */}
        <PhilosophySlider
          value={philosophy.slider}
          onChange={handleSliderChange}
        />

        {/* Voting Permissions */}
        <Box
          bg={cardBg}
          p={6}
          borderRadius="xl"
          borderWidth="1px"
          borderColor={borderColor}
        >
          <VStack spacing={4} align="stretch">
            <Heading size="sm">Who Participates in Governance?</Heading>
            <Text fontSize="sm" color={helperColor}>
              Click a role to toggle its voting permissions.
            </Text>

            {/* Who can vote */}
            <Box
              p={4}
              bg="warmGray.50"
              borderRadius="lg"
              border="1px solid"
              borderColor="warmGray.100"
            >
              <HStack spacing={3} mb={3}>
                <Icon as={PiChatDots} color="coral.500" boxSize={5} />
                <Text fontWeight="600" fontSize="sm">
                  Who can vote in polls?
                </Text>
              </HStack>
              <HStack spacing={2} flexWrap="wrap">
                {roles.map((role, idx) => {
                  const canVote = (permissions.ddVotingRoles || []).includes(idx);
                  return (
                    <Badge
                      key={idx}
                      px={3}
                      py={1}
                      borderRadius="full"
                      cursor="pointer"
                      bg={canVote ? 'coral.100' : 'warmGray.100'}
                      color={canVote ? 'coral.700' : 'warmGray.500'}
                      border="1px solid"
                      borderColor={canVote ? 'coral.300' : 'warmGray.200'}
                      onClick={() =>
                        handleToggleVotingPermission('ddVotingRoles', idx)
                      }
                      _hover={{
                        borderColor: canVote ? 'coral.400' : 'coral.300',
                        bg: canVote ? 'coral.200' : 'coral.50',
                      }}
                      transition="all 0.15s ease"
                    >
                      {role.name}
                    </Badge>
                  );
                })}
              </HStack>
            </Box>

            {/* Who can create proposals */}
            <Box
              p={4}
              bg="warmGray.50"
              borderRadius="lg"
              border="1px solid"
              borderColor="warmGray.100"
            >
              <HStack spacing={3} mb={3}>
                <Icon as={PiMegaphoneSimple} color="amethyst.500" boxSize={5} />
                <Text fontWeight="600" fontSize="sm">
                  Who can create proposals?
                </Text>
              </HStack>
              <HStack spacing={2} flexWrap="wrap">
                {roles.map((role, idx) => {
                  const canCreate = (
                    permissions.hybridProposalCreatorRoles || []
                  ).includes(idx);
                  return (
                    <Badge
                      key={idx}
                      px={3}
                      py={1}
                      borderRadius="full"
                      cursor="pointer"
                      bg={canCreate ? 'amethyst.100' : 'warmGray.100'}
                      color={canCreate ? 'amethyst.700' : 'warmGray.500'}
                      border="1px solid"
                      borderColor={canCreate ? 'amethyst.300' : 'warmGray.200'}
                      onClick={() =>
                        handleToggleVotingPermission(
                          'hybridProposalCreatorRoles',
                          idx
                        )
                      }
                      _hover={{
                        borderColor: canCreate ? 'amethyst.400' : 'amethyst.300',
                        bg: canCreate ? 'amethyst.200' : 'amethyst.50',
                      }}
                      transition="all 0.15s ease"
                    >
                      {role.name}
                    </Badge>
                  );
                })}
              </HStack>
            </Box>
          </VStack>
        </Box>

        {/* Current Configuration Summary */}
        <Box bg={sectionBg} p={4} borderRadius="lg">
          <HStack justify="space-between" flexWrap="wrap" gap={2}>
            <HStack spacing={2}>
              <Text fontSize="sm" color={helperColor}>
                Voting approach:
              </Text>
              <Badge colorScheme={zoneInfo.color}>{zoneInfo.label}</Badge>
            </HStack>

            <HStack spacing={2}>
              <Text fontSize="sm" color={helperColor}>
                Can vote:
              </Text>
              <Text fontSize="sm" fontWeight="500">
                {getVoterRoleNames().join(', ') || 'None selected'}
              </Text>
            </HStack>
          </HStack>
        </Box>

        {/* Navigation */}
        <NavigationButtons
          onBack={handleBack}
          onNext={handleNext}
          nextLabel="Review & Launch"
        />
      </VStack>
    </>
  );
}

export default GovernanceStep;
