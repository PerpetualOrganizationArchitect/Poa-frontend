/**
 * PermissionPicker — the semantic permission checkboxes.
 *
 * One checkbox per protocol permission key, grouped and explained. The TaskManager key is a MASK,
 * so it expands into its own bit checkboxes rather than pretending to be a single yes/no.
 *
 * Selection shape is `{ DD_VOTE: true, TM_PERMS: 6, ... }` keyed by the PERM_KEYS constant name —
 * exactly what `buildPermRows` consumes.
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Checkbox,
  CheckboxGroup,
  Wrap,
  WrapItem,
  Divider,
} from '@chakra-ui/react';
import { PERM_CATALOGUE, TASK_PERM_BITS } from '@/lib/accessV2/permKeys';

const groupsOf = (catalogue) => {
  const out = [];
  for (const entry of catalogue) {
    let bucket = out.find((g) => g.name === entry.group);
    if (!bucket) {
      bucket = { name: entry.group, entries: [] };
      out.push(bucket);
    }
    bucket.entries.push(entry);
  }
  return out;
};

function TaskMaskPicker({ mask, onChange }) {
  const value = TASK_PERM_BITS.filter((b) => (Number(mask) & b.value) === b.value).map((b) => String(b.value));

  return (
    <Box pl={6} pt={2}>
      <CheckboxGroup
        value={value}
        onChange={(vals) => onChange(vals.reduce((acc, v) => acc | Number(v), 0))}
      >
        <Wrap spacing={3}>
          {TASK_PERM_BITS.map((bit) => (
            <WrapItem key={bit.value}>
              <Checkbox value={String(bit.value)} colorScheme="coral" size="sm">
                <Text fontSize="sm" color="warmGray.700">{bit.label}</Text>
              </Checkbox>
            </WrapItem>
          ))}
        </Wrap>
      </CheckboxGroup>
    </Box>
  );
}

export default function PermissionPicker({ value = {}, onChange, exclude = [] }) {
  const catalogue = PERM_CATALOGUE.filter((e) => !exclude.includes(e.id));

  const set = (id, next) => onChange?.({ ...value, [id]: next });

  return (
    <VStack align="stretch" spacing={5}>
      {groupsOf(catalogue).map((group, i) => (
        <Box key={group.name}>
          {i > 0 && <Divider mb={4} borderColor="warmGray.100" />}
          <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase" mb={2}>
            {group.name}
          </Text>
          <VStack align="stretch" spacing={3}>
            {group.entries.map((entry) => {
              const checked = entry.mask ? Number(value[entry.id] || 0) > 0 : Boolean(value[entry.id]);
              return (
                <Box key={entry.id}>
                  <Checkbox
                    isChecked={checked}
                    colorScheme="coral"
                    alignItems="flex-start"
                    onChange={(e) => {
                      if (entry.mask) {
                        // Turning the mask on with nothing selected would write a zero-valued row,
                        // which means "granted nothing" — seed it with the safe default instead.
                        set(entry.id, e.target.checked ? Number(value[entry.id] || 0) || 2 : 0);
                      } else {
                        set(entry.id, e.target.checked);
                      }
                    }}
                  >
                    <VStack align="start" spacing={0} ml={1}>
                      <Text fontSize="sm" fontWeight="medium" color="warmGray.900">{entry.label}</Text>
                      <Text fontSize="xs" color="warmGray.500">{entry.help}</Text>
                    </VStack>
                  </Checkbox>
                  {entry.mask && checked && (
                    <TaskMaskPicker mask={value[entry.id]} onChange={(m) => set(entry.id, m)} />
                  )}
                </Box>
              );
            })}
          </VStack>
        </Box>
      ))}
      <HStack />
    </VStack>
  );
}
