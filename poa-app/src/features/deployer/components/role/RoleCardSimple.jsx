/**
 * RoleCardSimple - Inline role editing card with all fields visible
 * Shows name, description, assign to me, join method, and powers in a zen layout
 */

import React from 'react';
import {
  Box,
  HStack,
  Text,
  Button,
  ButtonGroup,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Select,
  Collapse,
} from '@chakra-ui/react';
import { RoleCardContainer, RoleCardFields } from './RoleCardShared';

/**
 * JoinMethodSelector - Visual button group for open/vouching
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
        <HStack mt={3} spacing={2} flexWrap="wrap">
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
              <option key={r.id || i} value={i}>
                {r.name}
              </option>
            ))}
          </Select>
        </HStack>
      </Collapse>
    </Box>
  );
}

/**
 * Main RoleCardSimple component
 */
export function RoleCardSimple({
  role,
  roleIndex,
  roles,
  permissions,
  onUpdate,
  onDelete,
  onTogglePower,
  canDelete = true,
}) {
  // Determine current join method
  const getJoinMethod = () => {
    if (role.vouching?.enabled) return 'vouching';
    return 'open';
  };

  const handleJoinMethodChange = (method) => {
    const enabling = method === 'vouching';
    onUpdate(roleIndex, {
      ...role,
      vouching: {
        ...role.vouching,
        enabled: enabling,
        quorum: enabling ? (role.vouching?.quorum || 1) : 0,
      },
      // This selector IS the open-vs-gated decision, so it owns default
      // eligibility. "Needs vouches" must not be default-eligible — that makes
      // the quorum a no-op and the contracts reject the pair (EligibilityModule
      // M-03 at deploy, QuickJoin H-03 at claim). Simple mode has no separate
      // eligibility switch, so switching back to "Anyone can join" has to reopen
      // the role here or it would be stranded closed with no control to fix it.
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
      />
    </RoleCardContainer>
  );
}

export default RoleCardSimple;
