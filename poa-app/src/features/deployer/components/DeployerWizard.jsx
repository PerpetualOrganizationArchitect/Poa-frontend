/**
 * DeployerWizard - Main wizard component that orchestrates all deployment steps
 *
 * Uses a unified flow for both Simple and Advanced modes:
 * Template → Identity → Team → Governance → Launch
 *
 * Advanced mode controls what's shown WITHIN each step (e.g., RoleCardAdvanced
 * instead of RoleCardSimple, granular permissions in GovernanceStep)
 */

import React, { useState, useMemo, useCallback, useEffect, startTransition } from 'react';
import {
  Box,
  Button,
  Container,
  VStack,
  HStack,
  Heading,
  Text,
  Icon,
  useColorModeValue,
  useDisclosure,
  useToast,
  Flex,
  keyframes,
} from '@chakra-ui/react';
import { PiCheck, PiWarningCircle, PiUserCircle } from 'react-icons/pi';
import SignInModal from '../../../components/passkey/SignInModal';
import PasskeyOnboardingModal from '../../../components/passkey/PasskeyOnboardingModal';
import { useQuery } from '@apollo/client';
import { getClient } from '@/util/apolloClient';
import { useDeployer, STEPS, STEP_NAMES } from '../context/DeployerContext';
import { mapStateToDeploymentParams, createDeploymentConfig } from '../utils/deploymentMapper';
import { getRichTemplateById } from '../templates';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '../../../util/queries';
import { DEFAULT_DEPLOY_CHAIN_ID, getSubgraphUrl } from '../../../config/networks';

// New step components
import TemplateStep from '../steps/TemplateStep';
import IdentityStep from '../steps/IdentityStep';
import TeamStep from '../steps/TeamStep';
import GovernanceStep from '../steps/GovernanceStep';
import SettingsStep from '../steps/SettingsStep';

// Review step (used by all modes)
import ReviewStep from '../steps/ReviewStep';

// Layout components
import { ModeToggle } from './layout';

// Subtle pulse animation for active step
const pulseAnimation = keyframes`
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.9; }
`;

// Minimal Progress Indicator Component
// Memoized so wizard re-renders (state changes from heavy step components)
// don't redraw the indicator and re-run validation selectors.
const StepProgressIndicator = React.memo(function StepProgressIndicator({ steps, currentStep, maxStepReached, onStepClick, selectors }) {
  const activeBg = useColorModeValue('amethyst.500', 'amethyst.400');
  const completedValidBg = useColorModeValue('green.500', 'green.400');
  const completedInvalidBg = useColorModeValue('orange.500', 'orange.400');
  const inactiveBg = useColorModeValue('warmGray.200', 'warmGray.600');
  const lineColor = useColorModeValue('warmGray.200', 'warmGray.600');
  const activeLineColor = useColorModeValue('amethyst.300', 'amethyst.600');
  const labelColor = useColorModeValue('warmGray.600', 'warmGray.400');
  const activeLabelColor = useColorModeValue('warmGray.900', 'white');

  return (
    <Box position="relative" w="100%" py={2}>
      {/* Connection line (background) */}
      <Box
        position="absolute"
        top="50%"
        left="18px"
        right="18px"
        h="2px"
        bg={lineColor}
        transform="translateY(-50%)"
        zIndex={0}
      />
      {/* Active connection line (progress) */}
      <Box
        position="absolute"
        top="50%"
        left="18px"
        w={`calc(${(currentStep / (steps.length - 1)) * 100}% - 18px)`}
        h="2px"
        bg={activeLineColor}
        transform="translateY(-50%)"
        zIndex={1}
        transition="width 0.3s ease"
      />

      {/* Step indicators */}
      <HStack justify="space-between" position="relative" zIndex={2}>
        {steps.map((step, index) => {
          // A step is "completed" if it sits before the furthest point the user
          // has reached. Using maxStepReached (rather than currentStep) keeps the
          // checkmark visible after the user navigates backward, so progress
          // earned remains visible.
          const reached = typeof maxStepReached === 'number' ? maxStepReached : currentStep;
          const isCompleted = index < currentStep || (index <= reached && index !== currentStep);
          const isActive = index === currentStep;

          // Check validation status for visited steps
          const validation = selectors?.getStepValidationStatus(index) || { isValid: true };
          const isVisitedButIncomplete = isCompleted && !validation.isValid;

          // Only allow clicking on steps the user has already reached. Future
          // unvisited steps render with a default cursor so the affordance
          // matches reality (no link styling on something inert).
          const isClickable = !isActive && index <= reached;

          const handleClick = () => {
            if (isClickable && onStepClick) {
              onStepClick(index);
            }
          };

          // Determine background color based on state
          const getBgColor = () => {
            if (isActive) return activeBg;
            if (isCompleted) {
              return isVisitedButIncomplete ? completedInvalidBg : completedValidBg;
            }
            return 'white';
          };

          // Determine hover glow color based on state
          const getHoverGlow = () => {
            if (isVisitedButIncomplete) {
              return '0 0 0 3px rgba(237, 137, 54, 0.25)'; // orange glow for incomplete
            }
            if (isCompleted) {
              return '0 0 0 3px rgba(72, 187, 120, 0.25)'; // green glow for valid completed
            }
            return '0 0 0 3px rgba(160, 160, 160, 0.25)'; // gray glow for future steps
          };

          return (
            <VStack key={step.key} spacing={1} flex={1} maxW="120px">
              {/* Step dot */}
              <Box
                w={isActive ? "28px" : "22px"}
                h={isActive ? "28px" : "22px"}
                borderRadius="full"
                bg={getBgColor()}
                border="2px solid"
                borderColor={isCompleted || isActive ? 'transparent' : inactiveBg}
                display="flex"
                alignItems="center"
                justifyContent="center"
                transition="transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease"
                animation={isActive ? `${pulseAnimation} 2s ease-in-out infinite` : undefined}
                boxShadow={isActive ? '0 0 0 3px rgba(144, 85, 232, 0.15)' : undefined}
                cursor={isClickable ? 'pointer' : 'default'}
                onClick={handleClick}
                _hover={isClickable ? {
                  transform: 'scale(1.1)',
                  boxShadow: getHoverGlow()
                } : undefined}
              >
                {isCompleted ? (
                  isVisitedButIncomplete ? (
                    <Icon as={PiWarningCircle} color="white" boxSize={3} />
                  ) : (
                    <Icon as={PiCheck} color="white" boxSize={3} />
                  )
                ) : (
                  <Text
                    fontSize="2xs"
                    fontWeight="600"
                    color={isActive ? 'white' : 'warmGray.400'}
                  >
                    {index + 1}
                  </Text>
                )}
              </Box>

              {/* Step label */}
              <Text
                fontSize="xs"
                fontWeight={isActive ? '600' : '500'}
                color={isActive ? activeLabelColor : labelColor}
                textAlign="center"
                transition="transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease"
                cursor={isClickable ? 'pointer' : 'default'}
                onClick={handleClick}
                _hover={isClickable ? { color: activeLabelColor } : undefined}
              >
                {step.title}
              </Text>
            </VStack>
          );
        })}
      </HStack>
    </Box>
  );
});

// Unified step configuration (used for both Simple and Advanced modes)
// Advanced mode only changes what's shown WITHIN each step, not the steps themselves
const STEP_CONFIG = [
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
    key: STEPS.SETTINGS,
    title: 'Settings',
    description: 'Configure',
    component: SettingsStep,
  },
  {
    key: STEPS.LAUNCH,
    title: 'Launch',
    description: 'Deploy',
    component: ReviewStep,
  },
];

// Account gate notice shown on configuration steps when the user has not yet
// signed in. Sets expectations early instead of springing the requirement at
// deploy time. The user can keep configuring; the banner just makes the deal
// honest from the first screen.
function AccountGateNotice({ onSignIn, onCreate }) {
  const bg = useColorModeValue('amethyst.50', 'rgba(144, 85, 232, 0.08)');
  const borderColor = useColorModeValue('amethyst.200', 'amethyst.700');
  const textColor = useColorModeValue('warmGray.800', 'warmGray.100');
  const subColor = useColorModeValue('warmGray.600', 'warmGray.400');

  return (
    <Box
      bg={bg}
      borderRadius="xl"
      p={{ base: 4, md: 5 }}
      border="1px solid"
      borderColor={borderColor}
    >
      <Flex
        direction={{ base: 'column', md: 'row' }}
        align={{ base: 'flex-start', md: 'center' }}
        gap={4}
      >
        <HStack align="flex-start" spacing={3} flex={1}>
          <Icon as={PiUserCircle} boxSize={6} color="amethyst.500" mt={1} />
          <Box>
            <Text fontWeight="600" fontSize="sm" color={textColor} mb={1}>
              You'll sign in or create an account before deploy
            </Text>
            <Text fontSize="sm" color={subColor} lineHeight="tall">
              Your organization belongs to you and your members. Setting up a free
              account on Arbitrum takes about a minute and only happens once. Keep
              configuring below; we'll prompt you when you're ready to launch.
            </Text>
          </Box>
        </HStack>
        <HStack spacing={2} flexShrink={0}>
          <Button
            size="sm"
            variant="ghost"
            color="warmGray.700"
            _hover={{ color: 'warmGray.900', bg: 'amethyst.100' }}
            onClick={onSignIn}
          >
            Sign in
          </Button>
          <Button
            size="sm"
            bg="amethyst.500"
            color="white"
            _hover={{ bg: 'amethyst.600' }}
            onClick={onCreate}
          >
            Create account
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
}

export function DeployerWizard({
  onDeployStart,
  onDeploySuccess,
  onDeployError,
  deployerAddress,
}) {
  const { state, actions, selectors } = useDeployer();
  // Deployment status: 'idle' | 'deploying' | 'success' | 'transitioning' | 'error'
  const [deploymentStatus, setDeploymentStatus] = useState('idle');
  const [deploymentResult, setDeploymentResult] = useState(null);
  const toast = useToast();

  // Auth modals lifted to the wizard so the account gate can surface upfront
  // (instead of only at the final review screen).
  const { isOpen: isSignInOpen, onOpen: onSignInOpen, onClose: onSignInClose } = useDisclosure();
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
  const isWalletConnected = !!deployerAddress;
  const showAccountGate = !isWalletConnected && state.currentStep < STEPS.LAUNCH;

  // Track the furthest step the user has reached so completion checkmarks
  // persist when they navigate backward. Without this, returning to Step 1
  // would erase the visual trail of every step the user already finished.
  const [maxStepReached, setMaxStepReached] = useState(state.currentStep);
  useEffect(() => {
    setMaxStepReached((prev) => Math.max(prev, state.currentStep));
  }, [state.currentStep]);

  // Backwards compatibility - isDeploying derived from status
  const isDeploying = deploymentStatus === 'deploying';

  // Use the new warm color palette
  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.8)', 'rgba(51, 48, 44, 0.8)');
  const headingColor = useColorModeValue('warmGray.900', 'white');
  const subtitleColor = useColorModeValue('warmGray.600', 'warmGray.400');

  // Fetch infrastructure addresses from the selected deploy chain's subgraph.
  // Per-chain client prevents cache poisoning: each endpoint has its own InMemoryCache.
  const deployChainId = state.selectedChainId || DEFAULT_DEPLOY_CHAIN_ID;
  const deploySubgraphUrl = getSubgraphUrl(deployChainId);
  const deployClient = useMemo(() => getClient(deploySubgraphUrl), [deploySubgraphUrl]);
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    client: deployClient,
    skip: !deploySubgraphUrl,
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

  // Current step component (always uses unified STEP_CONFIG)
  const CurrentStepComponent = useMemo(() => {
    return STEP_CONFIG[state.currentStep]?.component || TemplateStep;
  }, [state.currentStep]);

  // Step navigation runs as a transition so the click → paint loop completes
  // immediately. Without this, mounting heavy steps (TeamStep, GovernanceStep,
  // ReviewStep) blocks the main thread for seconds and shows up as poor INP.
  const handleStepClick = useCallback((stepIndex) => {
    startTransition(() => {
      actions.goToStep(stepIndex);
    });
  }, [actions]);

  // Handle deployment
  const handleDeploy = async (deployConfig = {}) => {
    if (!deployerAddress) {
      toast({
        title: 'Sign in needed',
        description: 'We couldn’t confirm you’re signed in. Sign in again, then create your organization.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    setDeploymentStatus('deploying');

    try {
      // Create deployment config with fetched infrastructure addresses
      const config = createDeploymentConfig(state, deployerAddress, infrastructureAddresses);

      // Merge in any config passed from ReviewStep (e.g., deployerUsername)
      const finalConfig = {
        ...config,
        ...deployConfig,
      };

      // Log for debugging
      console.log('Deployment Config:', finalConfig);

      // Call parent component's deploy handler and await result
      if (onDeployStart) {
        const result = await onDeployStart(finalConfig);

        // If deployment succeeded, transition to success state
        if (result && result.success) {
          setDeploymentResult(result);
          setDeploymentStatus('success');
          return;
        }

        // User cancelled at the preview-and-confirm modal — no tx was sent.
        // Reset to idle (clears the "deploying" overlay) and return quietly
        // without the "check your wallet" info toast.
        if (result && result.cancelled) {
          setDeploymentStatus('idle');
          return;
        }
      }

      // If no onDeployStart or no result, just show info
      toast({
        title: 'Deployment initiated',
        description: 'Check your wallet to confirm the transaction',
        status: 'info',
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Deployment error:', error);
      setDeploymentStatus('error');
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
    }
  };

  // Handle successful deployment (called by parent)
  const handleDeploySuccess = (result) => {
    setDeploymentResult(result);
    setDeploymentStatus('success');
    // Toast is now handled by the celebration overlay
  };

  // Handle continuing after celebration (called when user clicks "Go to Your Organization")
  // Keep overlay visible as 'transitioning' during navigation to avoid showing the wizard
  const handleCelebrationContinue = () => {
    setDeploymentStatus('transitioning');
    if (onDeploySuccess && deploymentResult) {
      onDeploySuccess(deploymentResult);
    }
  };

  // Get rich template for display (with icon, tagline, etc.)
  const selectedTemplateId = state.ui.selectedTemplate;
  const selectedTemplate = selectedTemplateId ? getRichTemplateById(selectedTemplateId) : null;

  return (
    <Box minH="100vh" py={{ base: 8, md: 16 }}>
      <Container maxW="container.lg" px={{ base: 4, md: 8 }}>
        <VStack spacing={{ base: 8, md: 12 }} align="stretch">
          {/* Header */}
          <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
            <Box>
              <Heading size="lg" mb={2} color={headingColor}>
                {state.currentStep === STEPS.TEMPLATE
                  ? 'Create Your Organization'
                  : selectedTemplate
                  ? `${selectedTemplate.icon} ${selectedTemplate.name}`
                  : 'Create Your Organization'}
              </Heading>
              <Text color={subtitleColor} fontSize="md">
                {state.currentStep === STEPS.TEMPLATE
                  ? 'Choose a template to get started'
                  : selectedTemplate?.tagline || 'Build something together'}
              </Text>
            </Box>
            {state.currentStep > STEPS.TEMPLATE && <ModeToggle />}
          </Flex>

          {/* Account gate notice — surfaces auth requirement upfront */}
          {showAccountGate && (
            <AccountGateNotice
              onSignIn={onSignInOpen}
              onCreate={onCreateOpen}
            />
          )}

          {/* Minimal Step Progress Indicator */}
          <Box
            bg={cardBg}
            borderRadius="xl"
            p={{ base: 3, md: 4 }}
            border="1px solid"
            borderColor="warmGray.100"
            boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
            backdropFilter="blur(16px)"
          >
            <StepProgressIndicator
              steps={STEP_CONFIG}
              currentStep={state.currentStep}
              maxStepReached={maxStepReached}
              onStepClick={handleStepClick}
              selectors={selectors}
            />
          </Box>

          {/* Current Step Content */}
          <Box
            bg={cardBg}
            borderRadius="2xl"
            p={{ base: 6, md: 8 }}
            border="1px solid"
            borderColor="warmGray.100"
            boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
            backdropFilter="blur(16px)"
            minH="400px"
          >
            {state.currentStep === STEPS.LAUNCH || state.currentStep === STEPS.REVIEW ? (
              <ReviewStep
                onDeploy={handleDeploy}
                isDeploying={isDeploying}
                isWalletConnected={isWalletConnected}
                deploymentStatus={deploymentStatus}
                onDeploySuccess={handleCelebrationContinue}
              />
            ) : (
              <CurrentStepComponent />
            )}
          </Box>        </VStack>
      </Container>

      {/* Auth modals shared between the upfront account gate and ReviewStep */}
      <PasskeyOnboardingModal
        isOpen={isCreateOpen}
        onClose={onCreateClose}
        showWalletOption
      />
      <SignInModal
        isOpen={isSignInOpen}
        onClose={onSignInClose}
        onCreateAccount={onCreateOpen}
      />
    </Box>
  );
}

export default DeployerWizard;
