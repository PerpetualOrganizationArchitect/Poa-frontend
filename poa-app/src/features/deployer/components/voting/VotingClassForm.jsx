/**
 * VotingClassForm - Form for creating/editing a voting class
 *
 * Features:
 * - Quadratic voting toggle ONLY shown for ERC20_BAL (token) strategy
 * - Auto-disables quadratic when switching to DIRECT strategy
 * - Educational content about quadratic voting benefits
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  FormHelperText,
  FormErrorMessage,
  Input,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Switch,
  Button,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Text,
  Stack,
  Divider,
  Alert,
  AlertIcon,
  Tooltip,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import { PiLightning, PiInfo } from 'react-icons/pi';
import { useDeployer, VOTING_STRATEGY } from '../../context/DeployerContext';

export function VotingClassForm({
  votingClass,
  classIndex,
  onSave,
  onCancel,
  isNew = false,
  otherClassesTotal = 0,
}) {
  const { state } = useDeployer();
  const [formData, setFormData] = useState({ ...votingClass });
  const [errors, setErrors] = useState({});

  // Max slice is 100 minus other classes' total (minimum of 1 for UI slider to work)
  const maxSlice = Math.max(1, 100 - otherClassesTotal);

  // Get roles that can vote
  const votingRoles = state.roles
    .map((role, idx) => ({ ...role, index: idx }))
    .filter((role) => role.canVote);

  // Update form field
  const updateField = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[key];
      return newErrors;
    });
  };

  // Handle strategy change - auto-disable quadratic when switching to DIRECT
  const handleStrategyChange = (newStrategy) => {
    const strategyValue = parseInt(newStrategy, 10);
    updateField('strategy', strategyValue);

    // Auto-disable quadratic when switching to DIRECT (it only applies to token voting)
    if (strategyValue === VOTING_STRATEGY.DIRECT && formData.quadratic) {
      updateField('quadratic', false);
    }
  };

  // Validate form
  const validate = () => {
    const newErrors = {};

    if (formData.slicePct <= 0) {
      newErrors.slicePct = 'Weight must be greater than 0';
    }

    if (formData.slicePct > maxSlice) {
      newErrors.slicePct = `Weight cannot exceed ${maxSlice}% (other classes use ${otherClassesTotal}%)`;
    }

    // ERC20_BAL strategy uses the organization's participation token automatically
    // No validation needed for asset field

    // No per-class role requirement: a deploy can't restrict a class to specific
    // roles, because the org's hat IDs don't exist until mid-deploy (see the note
    // on the Eligible Roles field below). Every voting role votes in every class at
    // launch; narrowing happens post-deploy via governance.

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle save
  const handleSave = () => {
    if (validate()) {
      onSave(formData);
    }
  };

  return (
    <Box>
      <VStack spacing={5} align="stretch">
        {/* Strategy Selection */}
        <FormControl>
          <FormLabel>Voting Strategy</FormLabel>
          <Select
            value={formData.strategy}
            onChange={(e) => handleStrategyChange(e.target.value)}
          >
            <option value={VOTING_STRATEGY.DIRECT}>
              Direct (Role-based) - One vote per member with eligible role
            </option>
            <option value={VOTING_STRATEGY.ERC20_BAL}>
              Shares-Based - Voting power based on share balance
            </option>
          </Select>
          <FormHelperText>
            {formData.strategy === VOTING_STRATEGY.DIRECT
              ? 'Each member with an eligible role gets one vote'
              : 'Voting power is proportional to share balance'}
          </FormHelperText>
        </FormControl>

        {/* Voting Weight (Slice) */}
        <FormControl isInvalid={!!errors.slicePct}>
          <FormLabel>
            <HStack>
              <Text>Voting Weight</Text>
              <Tooltip label="Percentage of total voting power this class controls">
                <Icon as={InfoIcon} color="warmGray.400" />
              </Tooltip>
            </HStack>
          </FormLabel>
          <HStack spacing={4}>
            <Slider
              value={formData.slicePct}
              onChange={(val) => updateField('slicePct', val)}
              min={1}
              max={maxSlice}
              flex={1}
              focusThumbOnChange={false}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb boxSize={6}>
                <Text fontSize="xs" fontWeight="bold">
                  {formData.slicePct}
                </Text>
              </SliderThumb>
            </Slider>
            <NumberInput
              value={formData.slicePct}
              onChange={(_, val) => {
                if (!isNaN(val)) updateField('slicePct', val);
              }}
              min={1}
              max={maxSlice}
              w="100px"
            >
              <NumberInputField />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
            <Text>%</Text>
          </HStack>
          {otherClassesTotal > 0 && (
            <FormHelperText>
              Other classes: {otherClassesTotal}% | Available: {maxSlice}%
            </FormHelperText>
          )}
          <FormErrorMessage>{errors.slicePct}</FormErrorMessage>
        </FormControl>

        <Divider />

        {/* Strategy-specific fields */}
        {formData.strategy === VOTING_STRATEGY.DIRECT ? (
          <>
            {/* Who votes in this class.
                At deploy time this is NOT configurable: the contract wants
                Hats-Protocol hat IDs, and the org's hats don't exist until
                mid-deployment, so every role with voting enabled is enrolled in
                every class. Restricting a class to specific roles is a post-deploy
                governance action (`setClasses`), once real hat IDs exist. Showing
                a picker here would be a lie — the value can't be sent. */}
            <FormControl>
              <FormLabel>Eligible Roles</FormLabel>
              {votingRoles.length === 0 ? (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  <Text fontSize="sm">
                    No roles have voting enabled. Go back to the Roles step and enable "Can Vote" for at least one role.
                  </Text>
                </Alert>
              ) : (
                <Stack spacing={1}>
                  {votingRoles.map((role) => (
                    <Text key={role.index} fontSize="sm" color="warmGray.700">
                      {role.name}
                    </Text>
                  ))}
                </Stack>
              )}
              <FormHelperText>
                Every role with voting enabled votes in this class. You can narrow a
                class to specific roles after launch, with a governance vote.
              </FormHelperText>
            </FormControl>
          </>
        ) : (
          <>
            {/* Participation token info */}
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <Box>
                <Text fontWeight="medium" fontSize="sm">Share-Based Voting</Text>
                <Text fontSize="sm">
                  Voting power is based on each member's share balance.
                  Shares will be deployed automatically with your organization.
                </Text>
              </Box>
            </Alert>

            {/* Quadratic Voting - Only for ERC20_BAL */}
            <Box
              p={4}
              bg={formData.quadratic ? 'orange.50' : 'warmGray.50'}
              borderRadius="lg"
              borderWidth="1px"
              borderColor={formData.quadratic ? 'orange.200' : 'warmGray.200'}
              transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
            >
              <FormControl display="flex" alignItems="center" mb={3}>
                <HStack flex={1}>
                  <Icon
                    as={PiLightning}
                    color={formData.quadratic ? 'orange.500' : 'warmGray.400'}
                    boxSize={5}
                  />
                  <FormLabel mb={0} fontWeight="semibold">
                    Quadratic Voting
                  </FormLabel>
                </HStack>
                <Switch
                  isChecked={formData.quadratic}
                  onChange={(e) => updateField('quadratic', e.target.checked)}
                  colorScheme="orange"
                  size="lg"
                />
              </FormControl>

              <Text fontSize="sm" color="warmGray.600" mb={3}>
                Reduces outsized influence by using the square root of share balance as voting power.
              </Text>

              {/* Quadratic voting explanation */}
              <Box
                p={3}
                bg={formData.quadratic ? 'white' : 'warmGray.100'}
                borderRadius="md"
                fontSize="xs"
              >
                <Text fontWeight="semibold" color={formData.quadratic ? 'orange.700' : 'warmGray.600'} mb={2}>
                  How it works:
                </Text>
                <VStack align="stretch" spacing={1} color="warmGray.600">
                  <HStack justify="space-between">
                    <Text>100 shares</Text>
                    <Text fontWeight="bold">→ {formData.quadratic ? '10 votes' : '100 votes'}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text>400 shares</Text>
                    <Text fontWeight="bold">→ {formData.quadratic ? '20 votes' : '400 votes'}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text>10,000 shares</Text>
                    <Text fontWeight="bold">→ {formData.quadratic ? '100 votes' : '10,000 votes'}</Text>
                  </HStack>
                </VStack>
                {formData.quadratic && (
                  <Text mt={2} fontSize="xs" color="orange.600" fontStyle="italic">
                    With quadratic voting, a 100x share difference only gives 10x more voting power
                  </Text>
                )}
              </Box>
            </Box>

            {/* Minimum balance */}
            <FormControl>
              <FormLabel>Minimum Share Balance Required</FormLabel>
              <NumberInput
                value={formData.minBalance || 0}
                onChange={(_, val) => {
                  if (!isNaN(val)) updateField('minBalance', val);
                }}
                min={0}
              >
                <NumberInputField />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
              <FormHelperText>
                Minimum shares required to vote (0 = no minimum)
              </FormHelperText>
            </FormControl>
          </>
        )}

        {/* Action Buttons */}
        <HStack justify="flex-end" spacing={3} pt={4}>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button colorScheme="blue" onClick={handleSave}>
            {isNew ? 'Add Voting Class' : 'Save Changes'}
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}

export default VotingClassForm;
