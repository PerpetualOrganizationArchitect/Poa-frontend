import React from 'react';
import { Box, Checkbox, FormControl, FormLabel, HStack, Input, Select, Switch, Text, VStack } from '@chakra-ui/react';
import { tokensFor } from '@/components/accessV2/roleForm/formTokens';

export default function ManagerSettings({ value, onChange, subjects = [], kind = 'role', variant }) {
  const t = tokensFor(variant);
  const manager = {
    enabled: false, managerSubjectId: '', canGrant: true, canRemove: false, delaySecs: 0, ...value,
  };
  const update = (changes) => onChange({ ...manager, ...changes });
  return (
    <VStack align="stretch" spacing={3}>
      <HStack justify="space-between" align="start">
        <Box pr={3}>
          <Text fontSize="sm" color={t.label} fontWeight="medium">{kind === 'group' ? 'Delegate management of the group’s roles' : 'Delegate role management'}</Text>
          <Text fontSize="xs" color={t.help} mt={1}>
            {kind === 'group'
              ? 'Let an existing role or group manage membership in this group’s roles, where those roles have no manager of their own.'
              : 'Let an existing role or group add or remove people without a new governance vote.'}
          </Text>
        </Box>
        <Switch
          aria-label="Delegate role management"
          isChecked={manager.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          colorScheme={t.accent}
          data-testid="role-form-manager-enabled"
        />
      </HStack>
      {manager.enabled && (
        <>
          <FormControl>
            <FormLabel fontSize="xs" color={t.label}>{kind === 'group' ? 'Who can manage its roles?' : 'Who can manage this role?'}</FormLabel>
            <Select
              value={manager.managerSubjectId}
              onChange={(e) => update({ managerSubjectId: e.target.value })}
              placeholder="Choose a role or group"
              size="sm"
              data-testid="role-form-manager-subject"
              {...t.input}
            >
              {subjects.map((subject) => (
                <option key={subject.subjectId} value={subject.subjectId} style={{ background: t.optionBg }}>
                  {subject.name || 'Untitled'}
                </option>
              ))}
            </Select>
          </FormControl>
          <Checkbox
            isChecked={manager.canGrant}
            onChange={(e) => update({ canGrant: e.target.checked })}
            colorScheme={t.accent}
          >
            <Text fontSize="sm" color={t.label}>Add people</Text>
          </Checkbox>
          <Checkbox
            isChecked={manager.canRemove}
            onChange={(e) => update({ canRemove: e.target.checked })}
            colorScheme={t.accent}
          >
            <Text fontSize="sm" color={t.label}>Remove people</Text>
          </Checkbox>
          <FormControl>
            <FormLabel fontSize="xs" color={t.label}>Review delay (hours)</FormLabel>
            <Input
              value={manager.delaySecs === '' ? '' : Number(manager.delaySecs) / 3600}
              onChange={(e) => update({ delaySecs: e.target.value === '' ? '' : Number(e.target.value) * 3600 })}
              inputMode="decimal"
              size="sm"
              data-testid="role-form-manager-delay"
              {...t.input}
            />
            <Text fontSize="xs" color={t.help} mt={1}>
              0 applies changes immediately. During a delay the org can review pending changes; someone must finalize them afterward.
            </Text>
          </FormControl>
        </>
      )}
    </VStack>
  );
}
