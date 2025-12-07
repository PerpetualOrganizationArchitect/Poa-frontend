/**
 * DeployerWizard - Main wizard component that orchestrates all deployment steps
 *
 * Supports two modes:
 * - Simple: Template → Identity → Team → Governance → Launch
 * - Advanced: Template → Organization → Roles → Permissions → Voting → Review
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Container,
  VStack,
  HStack,
  Heading,
  Text,
  Progress,
  Icon,
  useColorModeValue,
  Stepper,
  Step,
  StepIndicator,
  StepStatus,
  StepIcon,
  StepNumber,
  StepTitle,
  StepDescription,
  StepSeparator,
  useSteps,
  useToast,
  Flex,
} from '@chakra-ui/react';
import {
  CheckCircleIcon,
  WarningIcon,
} from '@chakra-ui/icons';
import { useQuery } from '@apollo/client';
import { useDeployer, STEPS, STEP_NAMES, UI_MODES } from '../context/DeployerContext';
import { mapStateToDeploymentParams, createDeploymentConfig } from '../utils/deploymentMapper';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '../../../util/queries';

// New step components
import TemplateStep from '../steps/TemplateStep';
import IdentityStep from '../steps/IdentityStep';
import TeamStep from '../steps/TeamStep';
import GovernanceStep from '../steps/GovernanceStep';

// Legacy step components (for Advanced mode)
import OrganizationStep from '../steps/OrganizationStep';
import RolesStep from '../steps/RolesStep';
import PermissionsStep from '../steps/PermissionsStep';
import VotingStep from '../steps/VotingStep';
import ReviewStep from '../steps/ReviewStep';

// Layout components
import { ModeToggle } from './layout';

// Simple mode step configurations
const SIMPLE_STEP_CONFIG = [
  {
    key: STEPS.TEMPLATE,
    title: 'Template',
    description: 'Choose type',
    component: TemplateStep,
  },
  {
    key: STEPS.IDENTITY,
    title: 'Identity',
    description: 'Name & info',
    component: IdentityStep,
  },
  {
    key: STEPS.TEAM,
    title: 'Team',
    description: 'Roles',
    component: TeamStep,
  },
  {
    key: STEPS.GOVERNANCE,
    title: 'Governance',
    description: 'How you decide',
    component: GovernanceStep,
  },
  {
    key: STEPS.LAUNCH,
    title: 'Launch',
    description: 'Deploy',
    component: ReviewStep,
  },
];

// Advanced mode step configurations (legacy)
const ADVANCED_STEP_CONFIG = [
  {
    key: STEPS.TEMPLATE,
    title: 'Template',
    description: 'Choose type',
    component: TemplateStep,
  },
  {
    key: STEPS.ORGANIZATION,
    title: 'Organization',
    description: 'Basic info',
    component: OrganizationStep,
  },
  {
    key: STEPS.ROLES,
    title: 'Roles',
    description: 'Define roles',
    component: RolesStep,
  },
  {
    key: STEPS.PERMISSIONS,
    title: 'Permissions',
    description: 'Assign access',
    component: PermissionsStep,
  },
  {
    key: STEPS.REVIEW,
    title: 'Review',
    description: 'Deploy',
    component: ReviewStep,
  },
];

export function DeployerWizard({
  onDeployStart,
  onDeploySuccess,
  onDeployError,
  deployerAddress,
}) {
  const { state, actions, selectors } = useDeployer();
  const [isDeploying, setIsDeploying] = useState(false);
  const toast = useToast();

  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');

  // Fetch infrastructure addresses from subgraph
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    fetchPolicy: 'network-only',
  });

  // Extract infrastructure addresses from subgraph data
  const infrastructureAddresses = useMemo(() => {
    const poaManager = infraData?.poaManagerContracts?.[0];

    // Infrastructure PROXY addresses (from PoaManager - these are what you actually call)
    const orgDeployerAddress = poaManager?.orgDeployerProxy || null;
    const orgRegistryProxy = poaManager?.orgRegistryProxy || null;
    const paymasterHubProxy = poaManager?.paymasterHubProxy || null;
    const globalAccountRegistryProxy = poaManager?.globalAccountRegistryProxy || null;

    // Use globalAccountRegistryProxy as registryAddress (this is the UniversalAccountRegistry)
    const registryAddress = globalAccountRegistryProxy;
    const poaManagerAddress = poaManager?.id || null;
    const orgRegistryAddress = orgRegistryProxy;

    // Helper to find beacon by type name (beacons are for org-level contract implementations)
    const findBeacon = (typeName) => {
      const beacon = infraData?.beacons?.find(b => b.typeName === typeName);
      return beacon?.beaconAddress || null;
    };

    // Extract beacon addresses (for reference - not typically called directly)
    const taskManagerBeacon = findBeacon('TaskManager');
    const hybridVotingBeacon = findBeacon('HybridVoting');
    const directDemocracyVotingBeacon = findBeacon('DirectDemocracyVoting');
    const educationHubBeacon = findBeacon('EducationHub');
    const participationTokenBeacon = findBeacon('ParticipationToken');
    const quickJoinBeacon = findBeacon('QuickJoin');
    const executorBeacon = findBeacon('Executor');
    const paymentManagerBeacon = findBeacon('PaymentManager');
    const eligibilityModuleBeacon = findBeacon('EligibilityModule');
    const toggleModuleBeacon = findBeacon('ToggleModule');

    return {
      // Core contracts
      registryAddress,
      poaManagerAddress,
      orgRegistryAddress,
      // Infrastructure proxies (the actual contracts to interact with)
      orgDeployerAddress,
      orgRegistryProxy,
      paymasterHubProxy,
      globalAccountRegistryProxy,
      // Beacons (for reference)
      taskManagerBeacon,
      hybridVotingBeacon,
      directDemocracyVotingBeacon,
      educationHubBeacon,
      participationTokenBeacon,
      quickJoinBeacon,
      executorBeacon,
      paymentManagerBeacon,
      eligibilityModuleBeacon,
      toggleModuleBeacon,
    };
  }, [infraData]);

  // Get step config based on mode
  const isSimpleMode = state.ui.mode === UI_MODES.SIMPLE;
  const STEP_CONFIG = isSimpleMode ? SIMPLE_STEP_CONFIG : ADVANCED_STEP_CONFIG;

  // Current step component
  const CurrentStepComponent = useMemo(() => {
    return STEP_CONFIG[state.currentStep]?.component || TemplateStep;
  }, [state.currentStep, STEP_CONFIG]);

  // Handle deployment
  const handleDeploy = async () => {
    if (!deployerAddress) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your wallet to deploy',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    setIsDeploying(true);

    try {
      // Create deployment config with fetched infrastructure addresses
      const config = createDeploymentConfig(state, deployerAddress, infrastructureAddresses);

      // Log for debugging
      console.log('Deployment Config:', config);

      // Notify parent component
      if (onDeployStart) {
        onDeployStart(config);
      }

      // The actual deployment would be handled by the parent component
      // which has access to the contract and wallet

      toast({
        title: 'Deployment initiated',
        description: 'Check your wallet to confirm the transaction',
        status: 'info',
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Deployment error:', error);
      toast({
        title: 'Deployment failed',
        description: error.message || 'An error occurred during deployment',
        status: 'error',
        duration: 10000,
        isClosable: true,
      });

      if (onDeployError) {
        onDeployError(error);
      }
    } finally {
      setIsDeploying(false);
    }
  };

  // Handle successful deployment (called by parent)
  const handleDeploySuccess = (result) => {
    setIsDeploying(false);
    toast({
      title: 'Deployment successful!',
      description: 'Your organization has been created on the blockchain',
      status: 'success',
      duration: 10000,
      isClosable: true,
    });

    if (onDeploySuccess) {
      onDeploySuccess(result);
    }
  };

  // Get template for display
  const selectedTemplate = selectors.getSelectedTemplate ? selectors.getSelectedTemplate() : null;

  return (
    <Box minH="100vh" bg={bgColor} py={8}>
      <Container maxW="container.lg">
        <VStack spacing={8} align="stretch">
          {/* Header */}
          <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
            <Box>
              <Heading size="lg" mb={1}>
                {state.currentStep === STEPS.TEMPLATE
                  ? 'Create Your Organization'
                  : selectedTemplate
                  ? `Create ${selectedTemplate.name}`
                  : 'Create Your Organization'}
              </Heading>
              <Text color="gray.600">
                {state.currentStep === STEPS.TEMPLATE
                  ? 'Choose a template to get started'
                  : 'Building your decentralized organization'}
              </Text>
            </Box>
            {state.currentStep > STEPS.TEMPLATE && <ModeToggle />}
          </Flex>

          {/* Step Progress */}
          <Box
            bg={cardBg}
            borderRadius="lg"
            p={4}
            boxShadow="sm"
            overflowX="auto"
          >
            <Stepper index={state.currentStep} colorScheme="blue" size="sm">
              {STEP_CONFIG.map((step, index) => (
                <Step key={step.key}>
                  <StepIndicator>
                    <StepStatus
                      complete={<StepIcon />}
                      incomplete={<StepNumber />}
                      active={<StepNumber />}
                    />
                  </StepIndicator>

                  <Box flexShrink="0">
                    <StepTitle>{step.title}</StepTitle>
                    <StepDescription>{step.description}</StepDescription>
                  </Box>

                  <StepSeparator />
                </Step>
              ))}
            </Stepper>
          </Box>

          {/* Progress bar */}
          <Box>
            <HStack justify="space-between" mb={2}>
              <Text fontSize="sm" color="gray.500">
                Step {state.currentStep + 1} of {STEP_CONFIG.length}
              </Text>
              <Text fontSize="sm" color="gray.500">
                {Math.round(((state.currentStep + 1) / STEP_CONFIG.length) * 100)}% complete
              </Text>
            </HStack>
            <Progress
              value={((state.currentStep + 1) / STEP_CONFIG.length) * 100}
              size="sm"
              colorScheme="blue"
              borderRadius="full"
            />
          </Box>

          {/* Current Step Content */}
          <Box
            bg={cardBg}
            borderRadius="lg"
            p={6}
            boxShadow="sm"
            minH="400px"
          >
            {state.currentStep === STEPS.LAUNCH || state.currentStep === STEPS.REVIEW ? (
              <ReviewStep
                onDeploy={handleDeploy}
                isDeploying={isDeploying}
                isWalletConnected={!!deployerAddress}
              />
            ) : (
              <CurrentStepComponent />
            )}
          </Box>

          {/* Debug info (dev only) */}
          {process.env.NODE_ENV === 'development' && (
            <Box
              bg="gray.100"
              p={4}
              borderRadius="md"
              fontSize="xs"
              fontFamily="mono"
            >
              <Text fontWeight="bold" mb={2}>
                Debug: Current State
              </Text>
              <Text>Step: {STEP_CONFIG[state.currentStep]?.title || 'Unknown'}</Text>
              <Text>Mode: {state.ui.mode}</Text>
              <Text>Template: {state.ui.selectedTemplate || 'None'}</Text>
              <Text>Roles: {state.roles.length}</Text>
              <Text>Voting Classes: {state.voting.classes.length}</Text>
            </Box>
          )}
        </VStack>
      </Container>
    </Box>
  );
}

export default DeployerWizard;
