/**
 * SubjectRestrictionPicker — "only Executives can vote on this", as ONE selection.
 *
 * Restricted polls take a list of subject ids, and the contract does not care whether an entry is
 * a role or a group. That is what makes this worth its own component: on a v2 org, "only
 * Executives" is a single GROUP id instead of a hand-assembled list of role ids that goes stale the
 * moment someone adds a role to the group.
 *
 * DEGRADES CLEANLY: with no authority it renders the legacy role checkboxes it was given, so the
 * existing restricted-poll flow on an unmigrated org is unchanged.
 */

import React from 'react';
import { Box, VStack, Text, Wrap, WrapItem, Checkbox, Tag, TagLabel, Divider } from '@chakra-ui/react';
import { useOrgAuthority, useAuthoritySubjects } from '@/hooks/accessV2';

export default function SubjectRestrictionPicker({ legacyRoles = [], selected = [], onToggle }) {
  const authority = useOrgAuthority();
  const { roles, groups } = useAuthoritySubjects();

  // Legacy org: exactly the checkbox list the modal rendered before.
  if (!authority.enabled) {
    return (
      <Wrap spacing={2}>
        {(legacyRoles || []).map((role) => (
          <WrapItem key={role.hatId}>
            <Checkbox
              isChecked={selected?.includes(role.hatId)}
              onChange={() => onToggle(role.hatId)}
              colorScheme="purple"
              size="md"
            >
              <Text fontSize="sm" color="white">{role.name}</Text>
            </Checkbox>
          </WrapItem>
        ))}
      </Wrap>
    );
  }

  return (
    <VStack align="stretch" spacing={3}>
      {groups.length > 0 && (
        <Box>
          <Text fontSize="xs" color="gray.400" textTransform="uppercase" mb={2}>
            Groups — picks everyone in every role of the group, now and later
          </Text>
          <Wrap spacing={2}>
            {groups.map((g) => {
              const on = selected?.includes(g.subjectId);
              return (
                <WrapItem key={g.subjectId}>
                  <Tag
                    size="lg"
                    cursor="pointer"
                    colorScheme="purple"
                    variant={on ? 'solid' : 'outline'}
                    onClick={() => onToggle(g.subjectId)}
                  >
                    <TagLabel>{g.name}</TagLabel>
                  </Tag>
                </WrapItem>
              );
            })}
          </Wrap>
        </Box>
      )}

      {groups.length > 0 && roles.length > 0 && <Divider borderColor="whiteAlpha.200" />}

      <Box>
        <Text fontSize="xs" color="gray.400" textTransform="uppercase" mb={2}>
          Individual roles
        </Text>
        <Wrap spacing={2}>
          {roles.map((r) => (
            <WrapItem key={r.subjectId}>
              <Checkbox
                isChecked={selected?.includes(r.subjectId)}
                onChange={() => onToggle(r.subjectId)}
                colorScheme="purple"
                size="md"
              >
                <Text fontSize="sm" color="white">{r.name}</Text>
              </Checkbox>
            </WrapItem>
          ))}
        </Wrap>
      </Box>

      <Text fontSize="xs" color="gray.500">
        People who join after this vote opens cannot vote on it — new members vote from the next one
        onward.
      </Text>
    </VStack>
  );
}
