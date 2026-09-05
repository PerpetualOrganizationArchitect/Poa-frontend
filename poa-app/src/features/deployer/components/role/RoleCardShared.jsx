import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Textarea,
  Switch,
  Button,
  IconButton,
  Icon,
  Tooltip,
  Select,
} from '@chakra-ui/react';
import {
  PiUser,
  PiTrash,
  PiShieldCheck,
  PiUsers,
  PiPencilSimple,
  PiArrowBendUpLeft,
  PiCrown,
  PiInfo,
} from 'react-icons/pi';
import { roleHasBundle } from '../../utils/powerBundles';

const POWER_BADGES = [
  {
    key: 'admin',
    label: 'Configure the role',
    icon: PiShieldCheck,
    color: 'purple',
    desc: 'Can approve rewards for work, create tasks and bounties, set up learning content, and run polls',
  },
  {
    key: 'member',
    label: 'Vote and join',
    icon: PiUsers,
    color: 'blue',
    desc: 'Can join easily, earn and hold shares, access learning materials, and vote in polls',
  },
  {
    key: 'creator',
    label: 'Create tasks and proposals',
    icon: PiPencilSimple,
    color: 'green',
    desc: 'Can propose new ideas for the community to vote on',
  },
];

function AssignToMeToggle({ isChecked, onChange, roleName }) {
  return (
    <Box
      p={3}
      borderRadius="lg"
      bg={isChecked ? 'green.50' : 'warmGray.50'}
      border="1px solid"
      borderColor={isChecked ? 'green.200' : 'warmGray.200'}
      transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
    >
      <HStack justify="space-between">
        <VStack align="start" spacing={0}>
          <HStack spacing={2}>
            <Icon
              as={PiUser}
              boxSize={4}
              color={isChecked ? 'green.600' : 'warmGray.500'}
            />
            <Text fontWeight="500" fontSize="sm" color={isChecked ? 'green.700' : 'warmGray.700'}>
              {isChecked ? "You'll have this role" : 'Assign to me'}
            </Text>
          </HStack>
          <Text fontSize="xs" color="warmGray.500" ml={6}>
            {isChecked
              ? `You'll be a ${roleName} when your organization launches`
              : 'Toggle on to receive this role at launch'}
          </Text>
        </VStack>
        <Switch
          isChecked={isChecked}
          onChange={onChange}
          colorScheme="green"
          size="md"
        />
      </HStack>
    </Box>
  );
}

function getDescendantRoleIndices(roles, roleIndex, visited = new Set()) {
  if (visited.has(roleIndex)) return visited;
  visited.add(roleIndex);

  roles.forEach((role, index) => {
    if (role.hierarchy?.adminRoleIndex === roleIndex) {
      getDescendantRoleIndices(roles, index, visited);
    }
  });

  return visited;
}

function HierarchySelector({ role, roleIndex, roles, onChange }) {
  const currentParent = role.hierarchy?.adminRoleIndex;
  const isTopLevel = currentParent === null || currentParent === undefined;
  const invalidParents = getDescendantRoleIndices(roles, roleIndex);
  const validParents = roles
    .map((candidate, index) => ({ role: candidate, index }))
    .filter(({ index }) => !invalidParents.has(index));
  const parentRole = currentParent !== null && currentParent !== undefined
    ? roles[currentParent]
    : null;

  const handleChange = (event) => {
    const value = event.target.value;
    onChange({
      ...role,
      hierarchy: {
        ...role.hierarchy,
        adminRoleIndex: value === '' ? null : parseInt(value),
      },
    });
  };

  const hierarchyTooltip = 'Defines the org structure. Parent roles can create sub-roles — but joining happens through Open (anyone) or Vouching (peer approval), not hierarchy.';

  return (
    <Box>
      <HStack spacing={1} mb={2}>
        <Text fontSize="xs" color="warmGray.500" fontWeight="600">
          Reports to
        </Text>
        <Tooltip
          label={hierarchyTooltip}
          hasArrow
          placement="top"
          maxW="320px"
          fontSize="xs"
          bg="warmGray.800"
          color="white"
          p={3}
          borderRadius="md"
        >
          <Box as="span" cursor="help">
            <Icon as={PiInfo} boxSize={3.5} color="warmGray.400" />
          </Box>
        </Tooltip>
      </HStack>
      <HStack spacing={2}>
        <Icon
          as={isTopLevel ? PiCrown : PiArrowBendUpLeft}
          boxSize={4}
          color={isTopLevel ? 'amethyst.500' : 'warmGray.400'}
        />
        <Select
          value={currentParent ?? ''}
          onChange={handleChange}
          size="sm"
          flex={1}
          bg={isTopLevel ? 'amethyst.50' : 'warmGray.50'}
          borderColor={isTopLevel ? 'amethyst.200' : 'warmGray.200'}
          _focus={{
            borderColor: 'amethyst.400',
            boxShadow: '0 0 0 1px var(--chakra-colors-amethyst-400)',
          }}
        >
          <option value="">No one — top of the structure</option>
          {validParents.map(({ role: candidate, index }) => (
            <option key={candidate.id || index} value={index}>
              {candidate.name}
            </option>
          ))}
        </Select>
      </HStack>
      {isTopLevel && (
        <Text fontSize="xs" color="amethyst.600" mt={1.5} ml={6}>
          Root of the org structure — can create and configure roles below
        </Text>
      )}
      {parentRole && (
        <Text fontSize="xs" color="warmGray.500" mt={1.5} ml={6}>
          Part of the structure under {parentRole.name}
        </Text>
      )}
    </Box>
  );
}

function PowerBadges({ roleIndex, permissions, onToggle }) {
  return (
    <Box>
      <Text fontSize="xs" color="warmGray.500" fontWeight="600" mb={2}>
        Powers
      </Text>
      <HStack spacing={2} flexWrap="wrap">
        {POWER_BADGES.map((badge) => {
          const isActive = roleHasBundle(permissions, roleIndex, badge.key);
          return (
            <Tooltip key={badge.key} label={badge.desc} hasArrow placement="top">
              <Button
                size="sm"
                variant={isActive ? 'solid' : 'outline'}
                colorScheme={isActive ? badge.color : 'gray'}
                leftIcon={<Icon as={badge.icon} />}
                borderRadius="full"
                onClick={() => onToggle(badge.key)}
                fontWeight="500"
              >
                {badge.label}
              </Button>
            </Tooltip>
          );
        })}
      </HStack>
    </Box>
  );
}

export function RoleCardContainer({ children }) {
  return (
    <Box
      bg="rgba(255, 255, 255, 0.8)"
      p={{ base: 5, md: 6 }}
      borderRadius="2xl"
      border="1px solid"
      borderColor="warmGray.200"
      boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
      backdropFilter="blur(16px)"
      transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
      _hover={{
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
      }}
    >
      {children}
    </Box>
  );
}

export function RoleCardFields({
  role,
  roleIndex,
  roles,
  permissions,
  onUpdate,
  onDelete,
  onTogglePower,
  canDelete,
  joinMethod,
  children,
}) {
  const isTopLevel = role.hierarchy?.adminRoleIndex === null;

  const handleNameChange = (event) => {
    onUpdate(roleIndex, { ...role, name: event.target.value });
  };

  const handleDescriptionChange = (event) => {
    onUpdate(roleIndex, { ...role, description: event.target.value });
  };

  const handleAssignToMeChange = () => {
    onUpdate(roleIndex, {
      ...role,
      distribution: {
        ...role.distribution,
        mintToDeployer: !role.distribution?.mintToDeployer,
      },
    });
  };

  return (
    <VStack spacing={5} align="stretch">
      <HStack justify="space-between" align="start">
        <HStack spacing={2} flex={1}>
          <Icon
            as={isTopLevel ? PiCrown : PiUser}
            boxSize={5}
            color={isTopLevel ? 'amethyst.500' : 'warmGray.400'}
          />
          <Input
            value={role.name}
            onChange={handleNameChange}
            variant="unstyled"
            fontWeight="600"
            fontSize="lg"
            placeholder="Role name"
            _placeholder={{ color: 'warmGray.400' }}
          />
        </HStack>

        {canDelete && (
          <IconButton
            icon={<Icon as={PiTrash} />}
            size="sm"
            variant="ghost"
            color="warmGray.400"
            _hover={{ color: 'red.500', bg: 'red.50' }}
            onClick={() => onDelete(roleIndex)}
            aria-label="Delete role"
          />
        )}
      </HStack>

      <Box>
        <Text fontSize="xs" color="warmGray.500" fontWeight="600" mb={2}>
          What does this role do?
        </Text>
        <HStack align="flex-end">
          <Textarea
            value={role.description || ''}
            onChange={handleDescriptionChange}
            placeholder="Describe what people in this role will do..."
            size="sm"
            resize="none"
            rows={2}
            bg="warmGray.50"
            border="1px solid"
            borderColor="warmGray.200"
            _focus={{
              borderColor: 'amethyst.400',
              boxShadow: '0 0 0 1px var(--chakra-colors-amethyst-400)',
            }}
            _placeholder={{ color: 'warmGray.400' }}
          />
          <Text fontSize="xs" color="warmGray.400" minW="40px" textAlign="right">
            {(role.description || '').length}/200
          </Text>
        </HStack>
      </Box>

      <HierarchySelector
        role={role}
        roleIndex={roleIndex}
        roles={roles}
        onChange={(updatedRole) => onUpdate(roleIndex, updatedRole)}
      />

      <AssignToMeToggle
        isChecked={role.distribution?.mintToDeployer || false}
        onChange={handleAssignToMeChange}
        roleName={role.name}
      />

      {joinMethod}

      <PowerBadges
        roleIndex={roleIndex}
        permissions={permissions}
        onToggle={(bundleKey) => onTogglePower(roleIndex, bundleKey)}
      />

      {children}
    </VStack>
  );
}
