/**
 * SetterParamInputs
 * Dynamic form input component for setter function parameters
 * Renders appropriate input types based on parameter definitions
 */

import React from 'react';
import {
  VStack,
  FormControl,
  FormLabel,
  FormHelperText,
  Input,
  Select,
  Switch,
  Checkbox,
  CheckboxGroup,
  Stack,
  Box,
  Text,
  HStack,
  Badge,
} from '@chakra-ui/react';
import VotingClassWeightsInput from './VotingClassWeightsInput';
import EmailInviteListField from './EmailInviteListField';
import { inputStyles } from '@/components/shared/glassStyles';

/**
 * Render a single parameter input based on its type
 */
const ParameterInput = ({ param, value, onChange, onChangeMany, allRoles, allProjects, values = {} }) => {
  const handleChange = (newValue) => {
    onChange(param.name, newValue);
  };

  switch (param.type) {
    // Reads the saved invite list and shows the people it would let in, instead of
    // asking anyone to read the hash that commits to it.
    case 'emailInviteList':
      return (
        <EmailInviteListField
          cid={value}
          root={values[param.rootField || 'root']}
          // All three land in ONE update: sequential onChange calls each spread the
          // same stale `values`, so later writes silently erase earlier ones.
          onReport={({ readable, summary, details }) => onChangeMany({
            [param.readableField || 'listReadable']: readable ? 'yes' : '',
            [param.summaryField || 'summary']: summary,
            [param.detailsField || 'details']: details,
          })}
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={param.placeholder || `Enter ${param.label}`}
          min={param.min}
          max={param.max}
          {...inputStyles}
        />
      );

    case 'roleSelect':
      return (
        <Select
          placeholder="Select role"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          {...inputStyles}
        >
          {allRoles?.map((role) => (
            <option key={role.hatId} value={role.hatId} style={{ background: '#1a1a2e' }}>
              {role.name}
            </option>
          ))}
        </Select>
      );

    case 'projectSelect':
      return (
        <Select
          placeholder="Select project"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          {...inputStyles}
        >
          {allProjects?.map((project) => (
            <option key={project.id} value={project.id} style={{ background: '#1a1a2e' }}>
              {project.name}
            </option>
          ))}
        </Select>
      );

    case 'toggle':
      return (
        <HStack spacing={4}>
          {param.options?.map((option) => (
            <Box
              key={option}
              px={4}
              py={2}
              borderRadius="md"
              cursor="pointer"
              bg={value === option ? 'purple.600' : 'whiteAlpha.100'}
              border="1px solid"
              borderColor={value === option ? 'purple.400' : 'rgba(148, 115, 220, 0.3)'}
              color="white"
              onClick={() => handleChange(option)}
              _hover={{ borderColor: 'purple.400' }}
              transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
            >
              <Text fontSize="sm" fontWeight={value === option ? 'bold' : 'normal'}>
                {option}
              </Text>
            </Box>
          ))}
        </HStack>
      );

    case 'select':
      return (
        <Select
          placeholder="Select option"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          {...inputStyles}
        >
          {param.options?.map((option) => (
            <option key={option.value} value={option.value} style={{ background: '#1a1a2e' }}>
              {option.label}
            </option>
          ))}
        </Select>
      );

    case 'permissionMask':
      return (
        <CheckboxGroup
          value={value || []}
          onChange={(newValue) => handleChange(newValue)}
        >
          <Stack spacing={2}>
            {param.options?.map((option) => (
              <Checkbox
                key={option.value}
                value={String(option.value)}
                colorScheme="purple"
              >
                <Text fontSize="sm" color="white">{option.label}</Text>
              </Checkbox>
            ))}
          </Stack>
        </CheckboxGroup>
      );

    case 'votingClassWeights':
      return (
        <VotingClassWeightsInput
          currentClasses={param.currentClasses || []}
          value={value}
          onChange={(newClasses) => handleChange(newClasses)}
        />
      );

    case 'bool':
      return (
        <HStack>
          <Switch
            isChecked={value === true || value === 'true'}
            onChange={(e) => handleChange(e.target.checked)}
            colorScheme="purple"
          />
          <Text fontSize="sm" color="gray.300">
            {value ? 'Yes' : 'No'}
          </Text>
        </HStack>
      );

    case 'address':
      return (
        <Input
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="0x..."
          {...inputStyles}
        />
      );

    case 'bytes':
    case 'bytes32':
      // size="sm" matches the deployer's pasted-hex inputs — a 66-char bytes32
      // overflows the default size inside the create-vote modal.
      return (
        <Input
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={param.placeholder || '0x...'}
          fontFamily="mono"
          size="sm"
          {...inputStyles}
        />
      );

    case 'uint8':
    case 'uint256':
      return (
        <Input
          type="number"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={`Enter ${param.label || param.name}`}
          min={0}
          {...inputStyles}
        />
      );

    default:
      return (
        <Input
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={param.placeholder || `Enter ${param.label || param.name}`}
          {...inputStyles}
        />
      );
  }
};

/**
 * Main component that renders all parameter inputs for a setter function
 */
const SetterParamInputs = ({
  inputs,
  values = {},
  onChange,
  allRoles = [],
  allProjects = [],
}) => {
  if (!inputs || inputs.length === 0) {
    return (
      <Box
        p={4}
        bg="whiteAlpha.50"
        borderRadius="md"
        border="1px solid rgba(148, 115, 220, 0.3)"
      >
        <Text fontSize="sm" color="gray.400">
          This action requires no additional configuration.
        </Text>
      </Box>
    );
  }

  const handleParamChange = (name, value) => {
    onChange({ ...values, [name]: value });
  };

  // Set several params in one update. Needed by fields that derive more than one
  // value at once — chaining single-key writes loses all but the last.
  const handleParamsChange = (partial) => {
    onChange({ ...values, ...partial });
  };

  return (
    <VStack spacing={4} align="stretch">
      {inputs.map((param) => {
        // Values the form carries but nobody should see or type. Used for hashes that
        // are derived from a saved document rather than entered by a person.
        if (param.type === 'hidden') return null;

        // A rich field renders its own heading and help — wrapping it in a FormLabel
        // would put a second, redundant title above it.
        if (param.type === 'emailInviteList') {
          return (
            <Box key={param.name}>
              <ParameterInput
                param={param}
                value={values[param.name]}
                onChange={handleParamChange}
                onChangeMany={handleParamsChange}
                allRoles={allRoles}
                allProjects={allProjects}
                values={values}
              />
            </Box>
          );
        }

        return (
          <FormControl key={param.name}>
            <FormLabel color="gray.200" fontSize="sm">
              {param.label || param.name}
              {param.type === 'permissionMask' && (
                <Badge ml={2} colorScheme="purple" fontSize="xs">
                  Multi-select
                </Badge>
              )}
            </FormLabel>
            <ParameterInput
              param={param}
              value={values[param.name]}
              onChange={handleParamChange}
              onChangeMany={handleParamsChange}
              allRoles={allRoles}
              allProjects={allProjects}
              values={values}
            />
            {param.helpText && (
              <FormHelperText color="gray.400" fontSize="xs">
                {param.helpText}
              </FormHelperText>
            )}
          </FormControl>
        );
      })}
    </VStack>
  );
};

export default SetterParamInputs;
