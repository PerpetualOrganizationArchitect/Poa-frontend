/**
 * ReviewStep - Step 5: Review configuration and deploy
 */

import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Divider,
  Badge,
  Alert,
  AlertIcon,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Icon,
  useToast,
  Spinner,
  Code,
} from '@chakra-ui/react';
import {
  CheckCircleIcon,
  WarningIcon,
  InfoIcon,
  EditIcon,
} from '@chakra-ui/icons';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useDeployer, PERMISSION_KEYS, PERMISSION_DESCRIPTIONS, VOTING_STRATEGY } from '../context/DeployerContext';
import { validateDeployerState } from '../validation/schemas';
import { createDeploymentConfig, validateDeploymentConfig } from '../utils/deploymentMapper';
import StepHeader from '../components/common/StepHeader';
import NavigationButtons from '../components/common/NavigationButtons';

export function ReviewStep({ onDeploy, isDeploying = false, isWalletConnected = false }) {
  const { state, actions } = useDeployer();
  const toast = useToast();

  // Validate entire state
  const zodValidation = validateDeployerState(state);
  const configValidation = validateDeploymentConfig(state);
  const isValid = zodValidation.isValid && configValidation.isValid;

  // All validation errors combined
  const zodErrorMessages = zodValidation.isValid
    ? []
    : Object.values(zodValidation.errors).flat();
  const allErrors = [
    ...zodErrorMessages,
    ...configValidation.errors,
  ];

  // Handle step navigation for editing
  const goToStep = (stepIndex) => {
    actions.setStep(stepIndex);
  };

  const handleDeploy = () => {
    if (!isValid) {
      toast({
        title: 'Validation Error',
        description: 'Please fix all errors before deploying',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    if (onDeploy) {
      onDeploy();
    }
  };

  // Section card component
  const SectionCard = ({ title, stepIndex, children, status = 'valid' }) => (
    <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
      <HStack
        p={3}
        bg={status === 'valid' ? 'green.50' : 'orange.50'}
        justify="space-between"
      >
        <HStack>
          <Icon
            as={status === 'valid' ? CheckCircleIcon : WarningIcon}
            color={status === 'valid' ? 'green.500' : 'orange.500'}
          />
          <Heading size="sm">{title}</Heading>
        </HStack>
        <Button
          size="xs"
          leftIcon={<EditIcon />}
          variant="ghost"
          onClick={() => goToStep(stepIndex)}
        >
          Edit
        </Button>
      </HStack>
      <Box p={4}>{children}</Box>
    </Box>
  );

  return (
    <Box>
      <StepHeader
        title="Review & Deploy"
        description="Review your organization configuration before deploying to the blockchain."
      />

      <VStack spacing={6} align="stretch">
        {/* Validation Status */}
        {!isValid ? (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <Box>
              <Text fontWeight="medium">Configuration has issues</Text>
              <VStack align="start" mt={2} spacing={1}>
                {allErrors.map((error, idx) => (
                  <Text key={idx} fontSize="sm">
                    • {error}
                  </Text>
                ))}
              </VStack>
            </Box>
          </Alert>
        ) : (
          <Alert status="success" borderRadius="md">
            <AlertIcon />
            <Text>Configuration is valid and ready to deploy</Text>
          </Alert>
        )}

        {/* Organization Section */}
        <SectionCard title="Organization" stepIndex={0}>
          <VStack align="start" spacing={2}>
            <HStack>
              <Text fontWeight="medium" w="120px">Name:</Text>
              <Text>{state.organization.name || 'Not set'}</Text>
            </HStack>
            <HStack align="start">
              <Text fontWeight="medium" w="120px">Description:</Text>
              <Text noOfLines={3}>{state.organization.description || 'Not set'}</Text>
            </HStack>
            <HStack>
              <Text fontWeight="medium" w="120px">Auto Upgrade:</Text>
              <Badge colorScheme={state.organization.autoUpgrade ? 'green' : 'gray'}>
                {state.organization.autoUpgrade ? 'Enabled' : 'Disabled'}
              </Badge>
            </HStack>
          </VStack>
        </SectionCard>

        {/* Roles Section */}
        <SectionCard
          title={`Roles (${state.roles.length})`}
          stepIndex={1}
          status={state.roles.length > 0 ? 'valid' : 'warning'}
        >
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th>Role</Th>
                <Th>Parent</Th>
                <Th>Voting</Th>
                <Th>Vouching</Th>
              </Tr>
            </Thead>
            <Tbody>
              {state.roles.map((role, idx) => {
                const parentRole =
                  role.hierarchy.adminRoleIndex !== null
                    ? state.roles[role.hierarchy.adminRoleIndex]
                    : null;
                return (
                  <Tr key={idx}>
                    <Td fontWeight="medium">{role.name}</Td>
                    <Td>
                      {parentRole ? (
                        parentRole.name
                      ) : (
                        <Badge colorScheme="purple" fontSize="xs">
                          Top Level
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <Badge colorScheme={role.canVote ? 'green' : 'gray'} fontSize="xs">
                        {role.canVote ? 'Yes' : 'No'}
                      </Badge>
                    </Td>
                    <Td>
                      {role.vouching.enabled ? (
                        <Text fontSize="sm">
                          {role.vouching.quorum} from{' '}
                          {state.roles[role.vouching.voucherRoleIndex]?.name}
                        </Text>
                      ) : (
                        <Badge colorScheme="gray" fontSize="xs">
                          Disabled
                        </Badge>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </SectionCard>

        {/* Permissions Section */}
        <SectionCard title="Permissions" stepIndex={2}>
          <Accordion allowToggle>
            {PERMISSION_KEYS.map((key) => {
              const desc = PERMISSION_DESCRIPTIONS[key];
              const assignedRoles = state.permissions[key] || [];
              const roleNames = assignedRoles.map(
                (idx) => state.roles[idx]?.name || `Role ${idx}`
              );

              return (
                <AccordionItem key={key} border="none">
                  <AccordionButton px={0}>
                    <HStack flex="1" textAlign="left">
                      <Text fontSize="sm" fontWeight="medium">
                        {desc.label}
                      </Text>
                      <Badge colorScheme={assignedRoles.length > 0 ? 'blue' : 'gray'}>
                        {assignedRoles.length} role{assignedRoles.length !== 1 ? 's' : ''}
                      </Badge>
                    </HStack>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={2} pl={4}>
                    {assignedRoles.length > 0 ? (
                      <Text fontSize="sm" color="gray.600">
                        {roleNames.join(', ')}
                      </Text>
                    ) : (
                      <Text fontSize="sm" color="gray.500" fontStyle="italic">
                        No roles assigned
                      </Text>
                    )}
                  </AccordionPanel>
                </AccordionItem>
              );
            })}
          </Accordion>
        </SectionCard>

        {/* Voting Section */}
        <SectionCard title="Voting Configuration" stepIndex={3}>
          <VStack align="start" spacing={4}>
            <HStack spacing={8}>
              <Box>
                <Text fontSize="xs" color="gray.500">
                  Hybrid Quorum
                </Text>
                <Text fontWeight="bold" fontSize="lg">
                  {state.voting.hybridQuorum}%
                </Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">
                  DD Quorum
                </Text>
                <Text fontWeight="bold" fontSize="lg">
                  {state.voting.ddQuorum}%
                </Text>
              </Box>
            </HStack>

            <Divider />

            <Box w="100%">
              <Text fontWeight="medium" mb={2}>
                Voting Classes ({state.voting.classes.length})
              </Text>
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th>Class</Th>
                    <Th>Strategy</Th>
                    <Th>Weight</Th>
                    <Th>Quadratic</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {state.voting.classes.map((cls, idx) => (
                    <Tr key={idx}>
                      <Td>Class {idx + 1}</Td>
                      <Td>
                        <Badge
                          colorScheme={
                            cls.strategy === VOTING_STRATEGY.DIRECT ? 'blue' : 'purple'
                          }
                          fontSize="xs"
                        >
                          {cls.strategy === VOTING_STRATEGY.DIRECT
                            ? 'Direct'
                            : 'Token'}
                        </Badge>
                      </Td>
                      <Td>{cls.slicePct}%</Td>
                      <Td>
                        <Badge
                          colorScheme={cls.quadratic ? 'green' : 'gray'}
                          fontSize="xs"
                        >
                          {cls.quadratic ? 'Yes' : 'No'}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </VStack>
        </SectionCard>

        {/* Features Section */}
        <SectionCard title="Optional Features" stepIndex={0}>
          <HStack spacing={4}>
            <Badge colorScheme={state.features.educationHubEnabled ? 'green' : 'gray'} p={2}>
              Education Hub: {state.features.educationHubEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
            <Badge colorScheme={state.features.electionHubEnabled ? 'green' : 'gray'} p={2}>
              Election Hub: {state.features.electionHubEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </HStack>
        </SectionCard>

        <Divider />

        {/* Deploy Button */}
        <VStack spacing={4}>
          <NavigationButtons
            onBack={() => actions.prevStep()}
            showNext={false}
          />

          {!isWalletConnected ? (
            <Box w="100%">
              <Alert status="warning" borderRadius="md" mb={4}>
                <AlertIcon />
                <HStack flex={1} justify="space-between" flexWrap="wrap" gap={2}>
                  <Text>Please connect your wallet to deploy</Text>
                  <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
                </HStack>
              </Alert>
              <Button
                colorScheme="green"
                size="lg"
                w="100%"
                isDisabled={true}
              >
                Deploy Organization
              </Button>
            </Box>
          ) : (
            <Button
              colorScheme="green"
              size="lg"
              w="100%"
              onClick={handleDeploy}
              isDisabled={!isValid || isDeploying}
              isLoading={isDeploying}
              loadingText="Deploying..."
            >
              Deploy Organization
            </Button>
          )}

          {isDeploying && (
            <Alert status="info" borderRadius="md">
              <Spinner size="sm" mr={3} />
              <Text>
                Deploying your organization to the blockchain. This may take a few minutes...
              </Text>
            </Alert>
          )}
        </VStack>
      </VStack>
    </Box>
  );
}

export default ReviewStep;
