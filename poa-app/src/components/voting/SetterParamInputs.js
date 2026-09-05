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
import PermissionPicker from '@/components/accessV2/PermissionPicker';
import { inputStyles } from '@/components/shared/glassStyles';
import { permsFromSubject } from '@/config/setterDefinitions';
import { classLabel, contractClassIndex } from '@/lib/voting/votingClasses';

/**
 * Render a single parameter input based on its type
 */
const ParameterInput = ({
  param,
  value,
  onChange,
  onChangeMany,
  allRoles,
  allProjects,
  authoritySubjects = [],
  values = {},
}) => {
  const handleChange = (newValue) => {
    onChange(param.name, newValue);
  };

  switch (param.type) {
    // ── ACCESS V2 ────────────────────────────────────────────────────────────
    // Roles AND groups, from the MembershipAuthority. `roleSelect` cannot stand in: it renders
    // `allRoles`, which is a ROLE picker by design (lib/voting/roleOptions excludes groups), and a
    // group is exactly the thing you park a shared permission on.
    case 'authoritySubjectSelect': {
      const roles = authoritySubjects.filter((s) => !s.isGroup);
      const groups = authoritySubjects.filter((s) => s.isGroup);
      return (
        <Select
          placeholder={authoritySubjects.length ? 'Select a role or group' : 'Loading roles…'}
          value={value || ''}
          onChange={(e) => {
            const subject = authoritySubjects.find((s) => String(s.subjectId) === e.target.value);
            // The choice, the name for the ballot, and the seed for the permission editor land in
            // ONE update: sequential onChange calls each spread the same stale `values`, so later
            // writes silently erase earlier ones (the same trap EmailInviteListField documents).
            const seeded = permsFromSubject(subject);
            onChangeMany({
              [param.name]: e.target.value,
              [param.nameField || 'subjectName']: subject?.name || '',
              [param.permsField || 'perms']: seeded,
              // Snapshot of what the role can do TODAY. The diff a member reads on the review
              // screen, and the "nothing has changed yet" gate, are both computed against this —
              // the config screen has no authority data of its own to compare with.
              [param.currentField || 'permsCurrent']: seeded,
            });
          }}
          {...inputStyles}
        >
          {roles.map((s) => (
            <option key={s.subjectId} value={s.subjectId} style={{ background: '#1a1a2e' }}>
              {s.name || `Role ${s.subjectId}`}
            </option>
          ))}
          {groups.map((s) => (
            <option key={s.subjectId} value={s.subjectId} style={{ background: '#1a1a2e' }}>
              {s.name || `Group ${s.subjectId}`} (group)
            </option>
          ))}
        </Select>
      );
    }

    // The permission checkboxes, seeded from the chosen role's CURRENT permissions so the member
    // edits a real picture rather than an empty one. Same component (and therefore the same
    // selection shape) the create-role wizard uses, so `buildPermRows` consumes it unchanged.
    case 'authorityPermissions': {
      const subjectId = values[param.subjectField || 'subjectId'];
      if (!subjectId) {
        return (
          <Box p={4} bg="whiteAlpha.50" borderRadius="md" border="1px solid rgba(148, 115, 220, 0.3)">
            <Text fontSize="sm" color="gray.400">
              Choose a role or group first.
            </Text>
          </Box>
        );
      }
      // Fall back to the live subject rather than to `{}`. An empty picker on a role that HAS
      // permissions is not a blank slate — it is a proposal to strip every one of them, and the
      // member would never see that they had asked for it.
      const seeded = permsFromSubject(
        authoritySubjects.find((s) => String(s.subjectId) === String(subjectId))
      );
      const current = values[param.currentField || 'permsCurrent'] || seeded;
      return (
        <Box
          p={4}
          bg="whiteAlpha.50"
          borderRadius="md"
          border="1px solid rgba(148, 115, 220, 0.3)"
        >
          <PermissionPicker
            value={typeof value === 'object' && value !== null ? value : current}
            onChange={(next) => handleChange(next)}
            variant="dark"
          />
        </Box>
      );
    }
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

    case 'roleSelect': {
      // `allRoles` is a ROLE picker by design (lib/voting/roleOptions excludes groups). A template
      // whose target can be a group too (`includeGroups`) — a class electorate takes either, and a
      // group voted INTO a class must be nameable to be voted out — gets the authority's groups
      // appended, marked so the two kinds don't read alike.
      const groupOptions = param.includeGroups
        ? authoritySubjects
          .filter((s) => s.isGroup)
          .map((g) => ({ hatId: String(g.subjectId), name: `${g.name} (group)` }))
        : [];
      const roleOptions = [...(allRoles || []), ...groupOptions];
      return (
        <Select
          placeholder={groupOptions.length > 0 ? 'Select a role or group' : 'Select role'}
          value={value || ''}
          onChange={(e) => {
            // OPT-IN, and only for a template that asked: also record the role's NAME. The
            // `roleNames` map the preview and the ballot summary fall back to comes from
            // POContext, which is the LEGACY hat list — frozen at the access-v2 cutover, so a role
            // created since has no entry and the sentence a member votes on degrades to "this
            // role". `allRoles` here is already the folded v2 list (useRoleNames), so the name is
            // on hand at the moment of choosing. Both keys land in ONE update; without `nameField`
            // this is exactly the single-key write it has always been.
            if (param.nameField) {
              const role = roleOptions.find((r) => String(r.hatId) === e.target.value);
              onChangeMany({ [param.name]: e.target.value, [param.nameField]: role?.name || '' });
              return;
            }
            handleChange(e.target.value);
          }}
          {...inputStyles}
        >
          {roleOptions.map((role) => (
            <option key={role.hatId} value={role.hatId} style={{ background: '#1a1a2e' }}>
              {role.name}
            </option>
          ))}
        </Select>
      );
    }

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

    // WHICH part of a binding vote to change the voters of. Value is the POSITIONAL class index
    // the contract takes (`addHatToClass(uint8 classIdx, …)`), labelled in the same words the
    // rule diff and the vote receipt use (`classLabel`) — nobody should be picking "class 0".
    case 'votingClassSelect': {
      const classes = param.currentClasses || [];
      // Empty means the org's blended voting hasn't loaded (or was never configured). An enabled
      // picker with nothing in it reads as "this group has no voters"; say which it is instead.
      if (classes.length === 0) {
        return (
          <>
            <Select placeholder="Not loaded yet" isDisabled {...inputStyles} />
            <Text fontSize="xs" color="gray.400" mt={2}>
              This group’s binding votes haven’t loaded their voters yet. Give it a moment, or pick
              a different action.
            </Text>
          </>
        );
      }
      return (
        <Select
          placeholder="Select who this applies to"
          value={value === 0 || value ? String(value) : ''}
          onChange={(e) => {
            // The index AND the list it indexes into, in ONE update. The list is what
            // `validate`/`buildBatch` read (they only ever see setterValues), and writing it here
            // rather than only at selection time is what makes a `?propose=` deep link — whose
            // seeding knows nothing about this field — able to validate itself at all.
            // Sequential onChange calls would each spread the same stale `values`.
            onChangeMany({
              [param.name]: e.target.value,
              [param.classesField || 'votingClasses']: classes,
            });
          }}
          {...inputStyles}
        >
          {/* The value is the CONTRACT index (`classIndex`), the uint8 `addHatToClass` stores —
              not the array position, which a filtered or re-versioned class list shifts. */}
          {classes.map((cls, idx) => (
            <option key={cls?.classIndex ?? idx} value={String(contractClassIndex(classes, idx))} style={{ background: '#1a1a2e' }}>
              {classLabel(cls, idx)}
            </option>
          ))}
        </Select>
      );
    }

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
  // Access-v2 roles AND groups (`useAuthoritySubjects().subjects`). Empty on a legacy org, which
  // is why nothing here changes for one: no template that reads it is offered.
  authoritySubjects = [],
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
                authoritySubjects={authoritySubjects}
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
              authoritySubjects={authoritySubjects}
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
