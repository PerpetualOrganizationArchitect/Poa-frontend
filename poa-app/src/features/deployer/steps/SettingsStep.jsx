/**
 * SettingsStep - Optional features and services configuration
 *
 * This step configures optional org settings:
 * - Feature toggles (Education Hub, Election Hub)
 * - Gas sponsorship (PaymasterConfigSection)
 * - Future: pre-create projects, other settings
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Switch,
  Select,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { PiGraduationCap, PiHandshake, PiGlobe, PiIdentificationCard, PiVault, PiTarget, PiListChecks, PiEnvelopeSimple } from 'react-icons/pi';
import { NETWORKS, DEFAULT_DEPLOY_CHAIN_ID } from '../../../config/networks';
import { useDeployer } from '../context/DeployerContext';
import { StepHeader, NavigationButtons } from '../components/common';
import { AddressListInput } from '../components/common/AddressListInput';
import { PaymasterConfigSection } from '../components/paymaster/PaymasterConfigSection';
import { BootstrapSection } from '../components/bootstrap/BootstrapSection';

/**
 * FeatureToggle - A single feature toggle row
 */
function FeatureToggle({ icon, name, description, isEnabled, onChange }) {
  const helperColor = useColorModeValue('warmGray.500', 'warmGray.400');

  return (
    <HStack justify="space-between" py={3}>
      <HStack spacing={3}>
        <Icon as={icon} boxSize={5} color="amethyst.500" />
        <Box>
          <Text fontWeight="600" fontSize="sm">
            {name}
          </Text>
          <Text fontSize="xs" color={helperColor}>
            {description}
          </Text>
        </Box>
      </HStack>
      <Switch
        isChecked={isEnabled}
        onChange={(e) => onChange(e.target.checked)}
        colorScheme="purple"
        size="md"
      />
    </HStack>
  );
}

export function SettingsStep() {
  const { state, actions, selectors } = useDeployer();

  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.8)', 'rgba(51, 48, 44, 0.8)');
  const borderColor = useColorModeValue('warmGray.200', 'warmGray.600');
  const dividerColor = useColorModeValue('warmGray.100', 'warmGray.700');

  const handleNext = () => {
    actions.nextStep();
  };

  const handleBack = () => {
    actions.prevStep();
  };

  return (
    <>
      <StepHeader
        title="Settings"
        description="Configure optional features and services for your organization."
      />

      <VStack spacing={6} align="stretch">
        {/* Feature Toggles */}
        <Box
          bg={cardBg}
          p={6}
          borderRadius="2xl"
          border="1px solid"
          borderColor={borderColor}
          backdropFilter="blur(16px)"
          boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
        >
          <Text fontWeight="600" fontSize="md" mb={1}>
            Features
          </Text>
          <Text fontSize="xs" color="warmGray.500" mb={4}>
            Enable optional modules for your organization
          </Text>

          <VStack spacing={0} align="stretch" divider={<Box borderBottomWidth="1px" borderColor={dividerColor} />}>
            <FeatureToggle
              icon={PiGraduationCap}
              name="Education Hub"
              description="Create learning modules and onboarding resources for your community"
              isEnabled={state.features.educationHubEnabled}
              onChange={(value) => actions.toggleFeature('educationHubEnabled', value)}
            />
            <FeatureToggle
              icon={PiHandshake}
              name="Election Hub"
              description="Run elections for leadership positions within your organization"
              isEnabled={state.features.electionHubEnabled}
              onChange={(value) => actions.toggleFeature('electionHubEnabled', value)}
            />
            <FeatureToggle
              icon={PiEnvelopeSimple}
              name="Email Invites"
              description="Let people join roles by proving control of their email — whole domains or specific addresses. Curate the allowlist in Settings after deploy."
              isEnabled={state.features.zkEmailInvitesEnabled}
              onChange={(value) => actions.toggleFeature('zkEmailInvitesEnabled', value)}
            />
            <FeatureToggle
              icon={PiVault}
              name="Hide Treasury"
              description="Hide the treasury page from your organization's navigation"
              isEnabled={state.features.hideTreasury}
              onChange={(value) => actions.toggleFeature('hideTreasury', value)}
            />
          </VStack>
        </Box>

        {/* Metadata Admin */}
        <Box
          bg={cardBg}
          p={6}
          borderRadius="2xl"
          border="1px solid"
          borderColor={borderColor}
          backdropFilter="blur(16px)"
          boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
        >
          <HStack spacing={3} mb={4}>
            <Icon as={PiIdentificationCard} boxSize={5} color="amethyst.500" />
            <Box>
              <Text fontWeight="600" fontSize="md">
                Metadata Admin
              </Text>
              <Text fontSize="xs" color="warmGray.500">
                Who can update the org's name, logo, and description without a vote
              </Text>
            </Box>
          </HStack>
          <Select
            value={state.metadataAdminRoleIndex === null ? '' : state.metadataAdminRoleIndex}
            onChange={(e) => {
              const val = e.target.value;
              actions.setMetadataAdminRole(val === '' ? null : Number(val));
            }}
            borderColor={borderColor}
            borderRadius="lg"
          >
            <option value="">Governance Only (requires a vote)</option>
            {state.roles.map((role, idx) => (
              <option key={role.id} value={idx}>
                {role.name}
              </option>
            ))}
          </Select>
          <Text fontSize="xs" color="warmGray.500" mt={2}>
            {state.metadataAdminRoleIndex === null
              ? 'Metadata changes will require a governance proposal to pass.'
              : `Any ${state.roles[state.metadataAdminRoleIndex]?.name || 'selected role'} holder can update the org profile directly.`
            }
          </Text>
        </Box>

        {/* Bootstrap: initial projects & tasks */}
        <BootstrapSection />

        {/* Direct Democracy execution targets */}
        <Box
          bg={cardBg}
          p={6}
          borderRadius="2xl"
          border="1px solid"
          borderColor={borderColor}
          backdropFilter="blur(16px)"
          boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
        >
          <HStack spacing={3} mb={4}>
            <Icon as={PiTarget} boxSize={5} color="amethyst.500" />
            <Box>
              <Text fontWeight="600" fontSize="md">
                Direct Democracy Targets
              </Text>
              <Text fontSize="xs" color="warmGray.500">
                Contracts that Direct Democracy proposals are allowed to call. Optional — leave empty for none.
              </Text>
            </Box>
          </HStack>
          <AddressListInput
            value={state.ddInitialTargets}
            onChange={(targets) => actions.setDDInitialTargets(targets)}
            addLabel="Add target contract"
            placeholder="0x… contract address"
            emptyHint="No execution targets yet. You can also add these later through governance."
          />
        </Box>

        {/* Deployment Network (advanced mode only) */}
        {selectors.isAdvancedMode() && (
          <Box
            bg={cardBg}
            p={6}
            borderRadius="2xl"
            border="1px solid"
            borderColor={borderColor}
            backdropFilter="blur(16px)"
            boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
          >
            <HStack spacing={3} mb={4}>
              <Icon as={PiGlobe} boxSize={5} color="amethyst.500" />
              <Box>
                <Text fontWeight="600" fontSize="md">
                  Deployment Network
                </Text>
                <Text fontSize="xs" color="warmGray.500">
                  Choose which blockchain to deploy your organization on
                </Text>
              </Box>
            </HStack>
            <Select
              value={state.selectedChainId || DEFAULT_DEPLOY_CHAIN_ID}
              onChange={(e) => actions.setSelectedChainId(Number(e.target.value))}
              bg="white"
              borderColor={borderColor}
              borderRadius="lg"
            >
              {Object.entries(NETWORKS).map(([key, network]) => (
                <option key={network.chainId} value={network.chainId}>
                  {network.name}
                </option>
              ))}
            </Select>
          </Box>
        )}

        {/* Gas Sponsorship */}
        <PaymasterConfigSection />

        {/* Navigation */}
        <NavigationButtons
          onBack={handleBack}
          onNext={handleNext}
          nextLabel="Continue"
        />
      </VStack>
    </>
  );
}

export default SettingsStep;
