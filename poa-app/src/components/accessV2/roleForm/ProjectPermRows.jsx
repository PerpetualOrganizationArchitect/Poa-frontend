/**
 * ProjectPermRows — "…but on THIS project, they can also do that".
 *
 * A per-project row is a TM_PERMS permission written at the project's ctx. Two things it is
 * careful about, both of which are silent when wrong:
 *
 *   • the ctx is `bytes32(projectId + 1)`, not the project id — `proposalBuilders.projectCtx` does
 *     the conversion (and the composite `{taskManager}-{n}` id the UI holds is what it expects),
 *     so nothing here pre-computes anything;
 *   • a project row INHERITS the global mask by default (`buildPermRows`), so these boxes ADD to
 *     what the role can already do everywhere rather than replacing it. The helper text says so,
 *     because v1's silent REPLACE is the shadowing bug that bit this org twice.
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Select,
  Checkbox,
  Wrap,
  WrapItem,
  IconButton,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { TASK_PERM_BITS } from '@/lib/accessV2/permKeys';
import { tokensFor } from './formTokens';

const projectLabel = (p) => p?.name || p?.title || String(p?.id || '').slice(0, 10);

export default function ProjectPermRows({ rows = [], onChange, projects = [], variant = 'light' }) {
  const t = tokensFor(variant);

  const update = (idx, changes) => {
    onChange((rows || []).map((r, i) => (i === idx ? { ...r, ...changes } : r)));
  };
  const remove = (idx) => onChange((rows || []).filter((_, i) => i !== idx));
  const add = () => onChange([...(rows || []), { projectId: '', projectName: '', mask: 0 }]);

  const toggleBit = (idx, bit) => {
    const current = Number(rows[idx]?.mask) || 0;
    update(idx, { mask: (current & bit) === bit ? current & ~bit : current | bit });
  };

  return (
    <VStack align="stretch" spacing={3}>
      <HStack justify="space-between" align="flex-start">
        <Box>
          <Text fontSize="sm" fontWeight="medium" color={t.label}>On specific projects</Text>
          <Text fontSize="xs" color={t.help}>
            Extra task permissions that apply on one project only. They add to what this role can
            already do everywhere.
          </Text>
        </Box>
        <Button
          size="xs"
          variant="ghost"
          colorScheme={t.accent}
          leftIcon={<AddIcon boxSize={2.5} />}
          onClick={add}
          isDisabled={(projects || []).length === 0}
          data-testid="role-form-add-project"
        >
          Add a project
        </Button>
      </HStack>

      {(rows || []).length === 0 ? (
        <Text fontSize="xs" color={t.help}>
          {(projects || []).length === 0
            ? 'This group has no projects yet.'
            : 'No per-project permissions.'}
        </Text>
      ) : (
        (rows || []).map((row, idx) => (
          <Box key={idx} p={3} borderRadius="md" bg={t.subtleBg} border="1px solid" borderColor={t.panelBorder}>
            <VStack align="stretch" spacing={2}>
              <HStack>
                <Select
                  size="sm"
                  placeholder="Pick a project"
                  value={row.projectId || ''}
                  data-testid={`role-form-project-${idx}`}
                  onChange={(e) => {
                    const project = (projects || []).find((p) => String(p.id) === e.target.value);
                    update(idx, {
                      projectId: e.target.value,
                      projectName: project ? projectLabel(project) : '',
                    });
                  }}
                  {...t.input}
                >
                  {(projects || []).map((p) => (
                    <option key={p.id} value={p.id} style={{ background: t.optionBg }}>
                      {projectLabel(p)}
                    </option>
                  ))}
                </Select>
                <IconButton
                  aria-label="Remove this project"
                  icon={<DeleteIcon boxSize={3} />}
                  size="sm"
                  variant="ghost"
                  color={t.help}
                  onClick={() => remove(idx)}
                />
              </HStack>
              <Wrap spacing={3}>
                {TASK_PERM_BITS.map((bit) => (
                  <WrapItem key={bit.value}>
                    <Checkbox
                      size="sm"
                      colorScheme={t.accent}
                      isChecked={(Number(row.mask) & bit.value) === bit.value}
                      onChange={() => toggleBit(idx, bit.value)}
                    >
                      <Text fontSize="xs" color={t.text}>{bit.label}</Text>
                    </Checkbox>
                  </WrapItem>
                ))}
              </Wrap>
            </VStack>
          </Box>
        ))
      )}
    </VStack>
  );
}
