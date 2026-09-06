import React from 'react';
import { Box, Text, VStack } from '@chakra-ui/react';
import { PERM_CATALOGUE, TASK_PERM_BITS } from '@/lib/accessV2/permKeys';
import { tokensFor } from '@/components/accessV2/roleForm/formTokens';

/** Keep inherited grants visible without presenting a local checkbox that could revoke them. */
export default function InheritedPermissions({ groups = [], variant }) {
  const t = tokensFor(variant);
  if (!groups.length) return null;
  return (
    <Box p={3} bg={t.subtleBg} border="1px solid" borderColor={t.panelBorder} borderRadius="lg">
      <Text fontSize="xs" color={t.label} fontWeight="semibold" mb={2}>Also inherited from groups</Text>
      <VStack align="stretch" spacing={2}>
        {groups.map((group) => {
          const labels = PERM_CATALOGUE.flatMap((entry) => {
            const value = Number(group.permEffective?.(entry.key) || 0);
            if (!value) return [];
            return entry.mask
              ? TASK_PERM_BITS.filter((bit) => (value & bit.value) !== 0).map((bit) => bit.label)
              : [entry.label];
          });
          return (
            <Box key={group.subjectId}>
              <Text fontSize="xs" color={t.label} fontWeight="medium">{group.name || 'Untitled group'}</Text>
              <Text fontSize="xs" color={t.help}>
                {labels.length ? labels.join(' · ') : 'Any permissions granted to this group are inherited by the role.'}
              </Text>
            </Box>
          );
        })}
      </VStack>
      <Text fontSize="xs" color={t.help} mt={2}>
        To stop inheriting a group’s permissions, remove it on the Groups step. Project rules and
        voting eligibility granted through that group also continue to apply.
      </Text>
    </Box>
  );
}
