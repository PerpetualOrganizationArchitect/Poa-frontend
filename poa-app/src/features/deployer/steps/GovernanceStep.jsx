/**
 * GovernanceStep - Philosophy and Powers configuration
 *
 * This step replaces the separate Permissions and Voting steps in Simple mode.
 * It uses a philosophy slider to set voting behavior and power bundles to
 * simplify permission assignment.
 */

import React, { useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  SimpleGrid,
  Divider,
  Switch,
  FormControl,
  FormLabel,
  Badge,
  Button,
  Collapse,
  useColorModeValue,
  useDisclosure,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { useDeployer, UI_MODES } from '../context/DeployerContext';
import { StepHeader, NavigationButtons } from '../components/common';
import { PhilosophySlider, PowerBundleCard } from '../components/governance';
import { sliderToVotingConfig, describeVotingSetup } from '../utils/philosophyMapper';
import { powerBundlesToPermissions, POWER_BUNDLE_LIST } from '../utils/powerBundles';

export function GovernanceStep() {
  const { state, actions, selectors } = useDeployer();
  const { isOpen: isAdvancedOpen, onToggle: toggleAdvanced } = useDisclosure();

  const isSimpleMode = selectors.isSimpleMode();
  const selectedTemplate = selectors.getSelectedTemplate();

  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const sectionBg = useColorModeValue('gray.50', 'gray.900');
  const helperColor = useColorModeValue('gray.600', 'gray.400');

  const { philosophy, roles, features, voting } = state;

  // Handle philosophy slider change
  const handleSliderChange = (value) => {
    actions.setPhilosophySlider(value);
  };

  // Handle power bundle toggle
  const handleTogglePowerBundle = (bundleKey, roleIndex) => {
    actions.togglePowerBundle(bundleKey, roleIndex);
  };

  // Handle feature toggles
  const handleToggleFeature = (feature) => {
    actions.toggleFeature(feature);
  };

  // Apply philosophy and bundles when advancing
  const handleNext = () => {
    // Convert philosophy slider to voting config
    const votingConfig = sliderToVotingConfig(philosophy.slider);

    // Convert power bundles to permissions
    const permissions = powerBundlesToPermissions(philosophy.powerBundles, state.permissions);

    // Apply to state
    actions.applyPhilosophy(votingConfig, permissions);

    // Move to next step
    actions.nextStep();
  };

  const handleBack = () => {
    actions.prevStep();
  };

  // Get guidance text from template
  const guidanceText = selectedTemplate?.ui?.guidanceText?.governance;

  return (
    <>
      <StepHeader
        title="How Will You Decide Together?"
        description={guidanceText || 'Configure how decisions are made in your organization.'}
      />

      <VStack spacing={6} align="stretch">
        {/* Philosophy Section */}
        <Box
          bg={cardBg}
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={borderColor}
        >
          <VStack spacing={6} align="stretch">
            <Box>
              <Heading size="sm" mb={2}>
                Governance Philosophy
              </Heading>
              <Text fontSize="sm" color={helperColor}>
                Choose how voting power is distributed between direct democracy and contribution-based voting.
              </Text>
            </Box>

            <PhilosophySlider
              value={philosophy.slider}
              onChange={handleSliderChange}
            />

            {/* Voting Summary */}
            <Alert status="info" borderRadius="md" variant="subtle">
              <AlertIcon />
              <Text fontSize="sm">
                {describeVotingSetup(sliderToVotingConfig(philosophy.slider))}
              </Text>
            </Alert>
          </VStack>
        </Box>

        {/* Power Bundles Section */}
        <Box
          bg={cardBg}
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={borderColor}
        >
          <VStack spacing={4} align="stretch">
            <Box>
              <Heading size="sm" mb={2}>
                Role Powers
              </Heading>
              <Text fontSize="sm" color={helperColor}>
                Assign capabilities to each role. These determine what members can do in your organization.
              </Text>
            </Box>

            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              {POWER_BUNDLE_LIST.map((bundle) => (
                <PowerBundleCard
                  key={bundle.id}
                  bundleKey={bundle.id}
                  roles={roles}
                  selectedRoleIndices={philosophy.powerBundles[bundle.id] || []}
                  onToggleRole={handleTogglePowerBundle}
                />
              ))}
            </SimpleGrid>
          </VStack>
        </Box>

        {/* Features Section */}
        <Box
          bg={cardBg}
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={borderColor}
        >
          <VStack spacing={4} align="stretch">
            <Heading size="sm">Optional Features</Heading>

            <HStack justify="space-between" py={2}>
              <Box>
                <Text fontWeight="medium">Education Hub</Text>
                <Text fontSize="sm" color={helperColor}>
                  Create learning modules and certifications for members
                </Text>
              </Box>
              <Switch
                colorScheme="purple"
                size="lg"
                isChecked={features.educationHubEnabled}
                onChange={() => handleToggleFeature('educationHubEnabled')}
              />
            </HStack>

            <Divider />

            <HStack justify="space-between" py={2}>
              <Box>
                <Text fontWeight="medium">Election Hub</Text>
                <Text fontSize="sm" color={helperColor}>
                  Enable democratic elections for leadership roles
                </Text>
              </Box>
              <Switch
                colorScheme="blue"
                size="lg"
                isChecked={features.electionHubEnabled}
                onChange={() => handleToggleFeature('electionHubEnabled')}
              />
            </HStack>
          </VStack>
        </Box>

        {/* Advanced Options (if Simple mode) */}
        {isSimpleMode && (
          <Box>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={isAdvancedOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              onClick={toggleAdvanced}
              color={helperColor}
            >
              {isAdvancedOpen ? 'Hide' : 'Show'} advanced voting options
            </Button>

            <Collapse in={isAdvancedOpen} animateOpacity>
              <Box
                mt={4}
                p={5}
                bg={sectionBg}
                borderRadius="lg"
                borderWidth="1px"
                borderColor={borderColor}
              >
                <VStack spacing={4} align="stretch">
                  <Text fontSize="sm" color={helperColor}>
                    Advanced voting configuration is available in Advanced Mode.
                    Switch modes to access voting classes, quorum settings, and more.
                  </Text>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => actions.setUIMode(UI_MODES.ADVANCED)}
                  >
                    Switch to Advanced Mode
                  </Button>
                </VStack>
              </Box>
            </Collapse>
          </Box>
        )}

        {/* Current Configuration Summary */}
        <Box bg={sectionBg} p={4} borderRadius="md">
          <HStack justify="space-between" flexWrap="wrap" gap={2}>
            <HStack spacing={2}>
              <Text fontSize="sm" color={helperColor}>
                Philosophy:
              </Text>
              <Badge
                colorScheme={
                  selectors.getPhilosophyType() === 'democratic'
                    ? 'green'
                    : selectors.getPhilosophyType() === 'hybrid'
                    ? 'blue'
                    : 'orange'
                }
              >
                {selectors.getPhilosophyType() === 'democratic'
                  ? 'Community-Led'
                  : selectors.getPhilosophyType() === 'hybrid'
                  ? 'Balanced'
                  : 'Leader-Led'}
              </Badge>
            </HStack>

            <HStack spacing={2}>
              <Text fontSize="sm" color={helperColor}>
                Features:
              </Text>
              {features.educationHubEnabled && (
                <Badge colorScheme="purple">Education</Badge>
              )}
              {features.electionHubEnabled && (
                <Badge colorScheme="blue">Elections</Badge>
              )}
              {!features.educationHubEnabled && !features.electionHubEnabled && (
                <Text fontSize="sm" color={helperColor}>
                  None selected
                </Text>
              )}
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
