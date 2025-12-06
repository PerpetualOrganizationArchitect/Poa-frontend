/**
 * VotingClassForm - Form for creating/editing a voting class
 */

import React, { useState } from 'react';
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
  Checkbox,
  CheckboxGroup,
  Stack,
  Divider,
  Alert,
  AlertIcon,
  Tooltip,
  Icon,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
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

    if (formData.strategy === VOTING_STRATEGY.DIRECT && (!formData.hatIds || formData.hatIds.length === 0)) {
      newErrors.hatIds = 'Select at least one role for direct voting';
    }

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
            onChange={(e) =>
              updateField('strategy', parseInt(e.target.value, 10))
            }
          >
            <option value={VOTING_STRATEGY.DIRECT}>
              Direct (Role-based) - One vote per member with eligible role
            </option>
            <option value={VOTING_STRATEGY.ERC20_BAL}>
              Participation Token - Voting power based on token balance
            </option>
          </Select>
          <FormHelperText>
            {formData.strategy === VOTING_STRATEGY.DIRECT
              ? 'Each member with an eligible role gets one vote'
              : 'Voting power is proportional to participation token balance'}
          </FormHelperText>
        </FormControl>

        {/* Voting Weight (Slice) */}
        <FormControl isInvalid={!!errors.slicePct}>
          <FormLabel>
            <HStack>
              <Text>Voting Weight</Text>
              <Tooltip label="Percentage of total voting power this class controls">
                <Icon as={InfoIcon} color="gray.400" />
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

        {/* Quadratic Voting */}
        <FormControl display="flex" alignItems="center">
          <FormLabel mb={0}>
            <HStack>
              <Text>Quadratic Voting</Text>
              <Tooltip label="Reduces the influence of large holders by taking the square root of voting power">
                <Icon as={InfoIcon} color="gray.400" />
              </Tooltip>
            </HStack>
          </FormLabel>
          <Switch
            isChecked={formData.quadratic}
            onChange={(e) => updateField('quadratic', e.target.checked)}
            colorScheme="green"
          />
        </FormControl>

        <Divider />

        {/* Strategy-specific fields */}
        {formData.strategy === VOTING_STRATEGY.DIRECT ? (
          <>
            {/* Role selection for direct voting */}
            <FormControl isInvalid={!!errors.hatIds}>
              <FormLabel>Eligible Roles</FormLabel>
              {votingRoles.length === 0 ? (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  <Text fontSize="sm">
                    No roles have voting enabled. Go back to the Roles step and enable "Can Vote" for at least one role.
                  </Text>
                </Alert>
              ) : (
                <CheckboxGroup
                  value={formData.hatIds?.map(String) || []}
                  onChange={(values) =>
                    updateField('hatIds', values.map((v) => parseInt(v, 10)))
                  }
                >
                  <Stack spacing={2}>
                    {votingRoles.map((role) => (
                      <Checkbox key={role.index} value={String(role.index)}>
                        {role.name}
                      </Checkbox>
                    ))}
                  </Stack>
                </CheckboxGroup>
              )}
              <FormHelperText>
                Select which roles can vote in this class
              </FormHelperText>
              <FormErrorMessage>{errors.hatIds}</FormErrorMessage>
            </FormControl>
          </>
        ) : (
          <>
            {/* Participation token info */}
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <Box>
                <Text fontWeight="medium" fontSize="sm">Participation Token Voting</Text>
                <Text fontSize="sm">
                  Voting power is based on each member's participation token balance.
                  The token will be deployed automatically with your organization.
                </Text>
              </Box>
            </Alert>

            {/* Minimum balance */}
            <FormControl>
              <FormLabel>Minimum Token Balance Required</FormLabel>
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
                Minimum participation tokens required to vote (0 = no minimum)
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
