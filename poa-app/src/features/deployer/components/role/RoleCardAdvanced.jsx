/**
 * RoleCardAdvanced - Full-featured inline role editing card
 * Has the same look and feel as RoleCardSimple but with all advanced options
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Switch,
  Button,
  ButtonGroup,
  Icon,
  Tooltip,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Select,
  Collapse,
  useDisclosure,
  Divider,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import {
  PiInfo,
  PiCaretDown,
  PiCaretUp,
  PiImage,
  PiGear,
  PiSliders,
} from 'react-icons/pi';
import { GranularPermissionsModal } from './GranularPermissionsModal';
import { AdditionalMembersInput } from './AdditionalMembersInput';
import { setAdditionalMembers } from '../../utils/additionalMembers';
import { RoleCardContainer, RoleCardFields } from './RoleCardShared';

/**
 * JoinMethodSelector - Visual button group for open/vouching with advanced options
 */
function JoinMethodSelector({ value, onChange, roles, role, roleIndex, onVouchingChange }) {
  const isVouching = value === 'vouching';

  return (
    <Box>
      <Text fontSize="xs" color="warmGray.500" fontWeight="600" mb={2}>
        How do new members join?
      </Text>
      <ButtonGroup size="sm" isAttached variant="outline" w="100%">
        <Button
          flex={1}
          bg={value === 'open' ? 'warmGray.900' : 'white'}
          color={value === 'open' ? 'white' : 'warmGray.600'}
          borderColor={value === 'open' ? 'warmGray.900' : 'warmGray.300'}
          _hover={{
            bg: value === 'open' ? 'warmGray.800' : 'warmGray.50',
          }}
          onClick={() => onChange('open')}
        >
          Anyone can join
        </Button>
        <Button
          flex={1}
          bg={value === 'vouching' ? 'warmGray.900' : 'white'}
          color={value === 'vouching' ? 'white' : 'warmGray.600'}
          borderColor={value === 'vouching' ? 'warmGray.900' : 'warmGray.300'}
          _hover={{
            bg: value === 'vouching' ? 'warmGray.800' : 'warmGray.50',
          }}
          onClick={() => onChange('vouching')}
        >
          Needs vouches
        </Button>
      </ButtonGroup>

      {/* Inline vouching config when selected */}
      <Collapse in={isVouching} animateOpacity>
        <VStack mt={3} spacing={3} align="stretch">
          <HStack spacing={2} flexWrap="wrap">
            <NumberInput
              size="sm"
              min={1}
              max={10}
              w="70px"
              value={role.vouching?.quorum || 1}
              onChange={(_, val) => onVouchingChange('quorum', val || 1)}
            >
              <NumberInputField />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
            <Text fontSize="sm" color="warmGray.600">
              vouch{(role.vouching?.quorum || 1) !== 1 ? 'es' : ''} from
            </Text>
            <Select
              size="sm"
              flex={1}
              minW="120px"
              value={role.vouching?.voucherRoleIndex ?? roleIndex}
              onChange={(e) => onVouchingChange('voucherRoleIndex', parseInt(e.target.value))}
            >
              {roles.map((r, i) => (
                <option key={r.id || i} value={i} disabled={i === roleIndex}>
                  {r.name}{i === roleIndex ? ' (cannot self-vouch)' : ''}
                </option>
              ))}
            </Select>
          </HStack>

          {/* Warning for circular vouching dependency */}
          {role.vouching?.voucherRoleIndex !== roleIndex &&
           roles[role.vouching?.voucherRoleIndex]?.vouching?.enabled &&
           !roles[role.vouching?.voucherRoleIndex]?.distribution?.mintToDeployer && (
            <Alert status="warning" borderRadius="md" py={2} px={3}>
              <AlertIcon boxSize={4} />
              <Text fontSize="xs">
                "{roles[role.vouching?.voucherRoleIndex]?.name}" also requires vouching.
                Ensure it has initial members assigned at deployment.
              </Text>
            </Alert>
          )}

          {/* Combine with Hierarchy toggle */}
          <HStack
            p={2}
            bg="warmGray.50"
            borderRadius="md"
            justify="space-between"
          >
            <HStack spacing={2}>
              <Text fontSize="xs" color="warmGray.600">
                Hierarchy admins can also vouch
              </Text>
              <Tooltip
                label="If enabled, parent role admins count toward the vouch quorum"
                hasArrow
                placement="top"
                fontSize="xs"
              >
                <Box as="span" cursor="help">
                  <Icon as={PiInfo} boxSize={3} color="warmGray.400" />
                </Box>
              </Tooltip>
            </HStack>
            <Switch
              size="sm"
              isChecked={role.vouching?.combineWithHierarchy || false}
              onChange={(e) => onVouchingChange('combineWithHierarchy', e.target.checked)}
              colorScheme="purple"
            />
          </HStack>
        </VStack>
      </Collapse>
    </Box>
  );
}

/**
 * AdvancedSettings - Collapsible section with all advanced options
 */
function AdvancedSettings({ role, roleIndex, roles, onUpdate }) {
  const { isOpen, onToggle } = useDisclosure();

  const updateField = (path, value) => {
    const keys = path.split('.');
    let newRole = { ...role };
    let current = newRole;

    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = { ...current[keys[i]] };
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;

    onUpdate(roleIndex, newRole);
  };

  return (
    <Box>
      {/* Toggle header */}
      <HStack
        justify="space-between"
        cursor="pointer"
        onClick={onToggle}
        py={2}
        px={3}
        bg="warmGray.50"
        borderRadius="lg"
        _hover={{ bg: 'warmGray.100' }}
        transition="background 0.2s"
      >
        <HStack spacing={2}>
          <Icon as={PiGear} boxSize={4} color="warmGray.500" />
          <Text fontSize="sm" fontWeight="500" color="warmGray.600">
            Advanced Settings
          </Text>
        </HStack>
        <Icon
          as={isOpen ? PiCaretUp : PiCaretDown}
          boxSize={4}
          color="warmGray.400"
        />
      </HStack>

      <Collapse in={isOpen} animateOpacity>
        <VStack
          mt={3}
          spacing={4}
          align="stretch"
          pl={4}
          borderLeft="2px solid"
          borderColor="warmGray.200"
        >
          {/* Role Image */}
          <Box>
            <HStack spacing={1} mb={2}>
              <Icon as={PiImage} boxSize={3.5} color="warmGray.400" />
              <Text fontSize="xs" color="warmGray.500" fontWeight="600">
                Role Image URL
              </Text>
            </HStack>
            <Input
              size="sm"
              value={role.image || ''}
              onChange={(e) => onUpdate(roleIndex, { ...role, image: e.target.value })}
              placeholder="https://..."
              bg="white"
            />
          </Box>

          {/* Can Vote toggle */}
          <HStack justify="space-between" py={2}>
            <HStack spacing={2}>
              <Text fontSize="sm" color="warmGray.700">
                Can participate in governance votes
              </Text>
              {/* Only gates weighted PROPOSAL voting: GovernanceFactory backfills the
                  hybrid voting classes with canVote roles. Poll (direct-democracy)
                  eligibility comes from a separate role bitmap, which the deploy
                  currently grants to every role — so don't promise it here. */}
              <Tooltip
                label="Members with this role count in proposal votes. Turn it off for bot or service roles that shouldn't carry voting weight."
                hasArrow
                placement="top"
                fontSize="xs"
              >
                <Box as="span" cursor="help">
                  <Icon as={PiInfo} boxSize={3} color="warmGray.400" />
                </Box>
              </Tooltip>
            </HStack>
            <Switch
              isChecked={role.canVote || false}
              onChange={(e) => onUpdate(roleIndex, { ...role, canVote: e.target.checked })}
              colorScheme="green"
              size="sm"
            />
          </HStack>

          <Divider borderColor="warmGray.200" />

          {/* Member Defaults */}
          <Box>
            <Text fontSize="xs" color="warmGray.500" fontWeight="600" mb={3}>
              Member Defaults
            </Text>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between" align="start">
                <Box>
                  <Text fontSize="sm" color="warmGray.600">
                    Eligible by default
                  </Text>
                  {role.vouching?.enabled && (
                    <Text fontSize="xs" color="warmGray.500" maxW="240px">
                      Off because this role requires vouches — an open role can&apos;t also be gated.
                    </Text>
                  )}
                </Box>
                <Switch
                  size="sm"
                  isChecked={role.vouching?.enabled ? false : (role.defaults?.eligible ?? true)}
                  isDisabled={role.vouching?.enabled}
                  onChange={(e) => updateField('defaults.eligible', e.target.checked)}
                />
              </HStack>
              <HStack justify="space-between">
                <Text fontSize="sm" color="warmGray.600">
                  Good standing by default
                </Text>
                <Switch
                  size="sm"
                  isChecked={role.defaults?.standing ?? true}
                  onChange={(e) => updateField('defaults.standing', e.target.checked)}
                />
              </HStack>
            </VStack>
          </Box>

          <Divider borderColor="warmGray.200" />

          {/* Hat Configuration */}
          <Box>
            <Text fontSize="xs" color="warmGray.500" fontWeight="600" mb={3}>
              Hat Configuration
            </Text>
            <VStack spacing={3} align="stretch">
              <HStack justify="space-between" align="center">
                <Text fontSize="sm" color="warmGray.600">
                  Max members
                </Text>
                <NumberInput
                  size="sm"
                  w="100px"
                  min={1}
                  max={10000}
                  value={role.hatConfig?.maxSupply || 100}
                  onChange={(_, val) => updateField('hatConfig.maxSupply', val || 100)}
                >
                  <NumberInputField bg="white" />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </HStack>
              <HStack justify="space-between">
                <HStack spacing={2}>
                  <Text fontSize="sm" color="warmGray.600">
                    Mutable (can change settings later)
                  </Text>
                  <Tooltip
                    label="If enabled, role settings can be modified after the org is deployed"
                    hasArrow
                    placement="top"
                    fontSize="xs"
                  >
                    <Box as="span" cursor="help">
                      <Icon as={PiInfo} boxSize={3} color="warmGray.400" />
                    </Box>
                  </Tooltip>
                </HStack>
                <Switch
                  size="sm"
                  isChecked={role.hatConfig?.mutableHat ?? true}
                  onChange={(e) => updateField('hatConfig.mutableHat', e.target.checked)}
                />
              </HStack>
            </VStack>
          </Box>

          <Divider borderColor="warmGray.200" />

          {/* Distribution */}
          <Box>
            <Text fontSize="xs" color="warmGray.500" fontWeight="600" mb={3}>
              Initial Distribution
            </Text>
            <VStack spacing={3} align="stretch">
              <AdditionalMembersInput
                role={role}
                onChange={(members) => onUpdate(roleIndex, setAdditionalMembers(role, members))}
              />
            </VStack>
          </Box>
        </VStack>
      </Collapse>
    </Box>
  );
}

/**
 * Main RoleCardAdvanced component
 */
export function RoleCardAdvanced({
  role,
  roleIndex,
  roles,
  permissions,
  onUpdate,
  onDelete,
  onTogglePower,
  onTogglePermission,
  canDelete = true,
}) {
  const { isOpen: isPermissionsOpen, onOpen: openPermissions, onClose: closePermissions } = useDisclosure();

  // Determine current join method
  const getJoinMethod = () => {
    if (role.vouching?.enabled) return 'vouching';
    return 'open';
  };

  const handleJoinMethodChange = (method) => {
    let voucherRoleIndex = role.vouching?.voucherRoleIndex ?? 0;

    // When enabling vouching, set a smart default for voucherRoleIndex
    if (method === 'vouching') {
      // Check if current voucherRoleIndex would be self-referential
      if (voucherRoleIndex === roleIndex || voucherRoleIndex === undefined) {
        // Try to find a better default:
        // 1. Use the parent/admin role if available and not self
        const parentIdx = role.hierarchy?.adminRoleIndex;
        if (parentIdx !== null && parentIdx !== undefined && parentIdx !== roleIndex) {
          voucherRoleIndex = parentIdx;
        } else {
          // 2. Find first role with mintToDeployer that isn't this one
          const eligibleIdx = roles.findIndex((r, i) =>
            i !== roleIndex && r.distribution?.mintToDeployer
          );
          if (eligibleIdx >= 0) {
            voucherRoleIndex = eligibleIdx;
          } else {
            // 3. Find any role that isn't this one
            const anyOtherIdx = roles.findIndex((_, i) => i !== roleIndex);
            if (anyOtherIdx >= 0) {
              voucherRoleIndex = anyOtherIdx;
            }
          }
        }
      }
    }

    const enabling = method === 'vouching';
    onUpdate(roleIndex, {
      ...role,
      vouching: {
        ...role.vouching,
        enabled: enabling,
        quorum: enabling ? (role.vouching?.quorum || 1) : 0,
        voucherRoleIndex,
      },
      // A vouched role must not be eligible by default — that would make the vouch
      // quorum a no-op, and the contracts now reject the combination outright
      // (EligibilityModule M-03 at deploy, QuickJoin H-03 at claim). Switching
      // vouching back off restores the open default, which is what "Anyone can
      // join" means.
      defaults: { ...role.defaults, eligible: !enabling },
    });
  };

  const handleVouchingChange = (field, value) => {
    onUpdate(roleIndex, {
      ...role,
      vouching: {
        ...role.vouching,
        [field]: value,
      },
    });
  };

  return (
    <RoleCardContainer>
      <RoleCardFields
        role={role}
        roleIndex={roleIndex}
        roles={roles}
        permissions={permissions}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onTogglePower={onTogglePower}
        canDelete={canDelete}
        joinMethod={(
          <JoinMethodSelector
            value={getJoinMethod()}
            onChange={handleJoinMethodChange}
            roles={roles}
            role={role}
            roleIndex={roleIndex}
            onVouchingChange={handleVouchingChange}
          />
        )}
      >
        {onTogglePermission && (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Icon as={PiSliders} />}
            onClick={openPermissions}
            borderColor="warmGray.300"
            color="warmGray.600"
            _hover={{ bg: 'amethyst.50', borderColor: 'amethyst.300', color: 'amethyst.600' }}
            alignSelf="flex-start"
          >
            Fine-tune permissions
          </Button>
        )}

        <AdvancedSettings
          role={role}
          roleIndex={roleIndex}
          roles={roles}
          onUpdate={onUpdate}
        />
      </RoleCardFields>

      {onTogglePermission && (
        <GranularPermissionsModal
          isOpen={isPermissionsOpen}
          onClose={closePermissions}
          role={role}
          roleIndex={roleIndex}
          permissions={permissions}
          onTogglePermission={onTogglePermission}
        />
      )}
    </RoleCardContainer>
  );
}

export default RoleCardAdvanced;
