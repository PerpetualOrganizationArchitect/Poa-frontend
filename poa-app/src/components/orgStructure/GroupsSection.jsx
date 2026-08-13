/**
 * GroupsSection — RoleManager role groups on the team page.
 *
 * Renders each group (Executives, …) with its member roles. A group's shared
 * permissions live on its marker hat (HatPermission entries), which the roles
 * table already surfaces per-role; here we focus on WHO is in the group so the
 * "one change, everyone" model is legible.
 *
 * Self-gating: returns null when the org has no RoleManager groups
 * (roleGroups is [] for non-RoleManager orgs / old subgraph), so existing orgs
 * render unchanged.
 */

import React from 'react';
import { Box, Heading, Text, VStack, HStack, Badge, Wrap, WrapItem, SimpleGrid } from '@chakra-ui/react';
import { usePOContext } from '@/context/POContext';

export function GroupsSection() {
  const { roleGroups = [], roleManagerEnabled } = usePOContext();

  if (!roleManagerEnabled || !roleGroups.length) return null;

  return (
    <Box as="section" data-tour="role-groups">
      <Heading size="lg" color="warmGray.900" mb={4}>
        Groups
      </Heading>
      <Text color="warmGray.600" mb={4}>
        Groups bundle shared permissions. Everyone whose role is in a group gets the group’s access — change it once and it applies to all of them.
      </Text>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {roleGroups.map((group) => {
          const members = (group.memberships || []).filter((m) => m?.isActive !== false);
          return (
            <Box
              key={group.id || group.groupId}
              p={5}
              borderRadius="lg"
              bg="white"
              border="1px solid"
              borderColor="warmGray.200"
              boxShadow="sm"
            >
              <HStack justify="space-between" align="start" mb={3}>
                <VStack align="start" spacing={0}>
                  <Heading size="md" color="warmGray.900">
                    {group.name || `Group ${group.groupId}`}
                  </Heading>
                  <Text fontSize="xs" color="warmGray.500">
                    {members.length} member role{members.length === 1 ? '' : 's'}
                  </Text>
                </VStack>
                {group.isExisting ? (
                  <Badge colorScheme="gray" fontSize="2xs">adopted</Badge>
                ) : (
                  <Badge colorScheme="purple" fontSize="2xs">group</Badge>
                )}
              </HStack>

              {members.length === 0 ? (
                <Text fontSize="sm" color="warmGray.500">
                  No roles in this group yet. Add one by creating or editing a role and selecting this group.
                </Text>
              ) : (
                <Wrap spacing={2}>
                  {members.map((m) => (
                    <WrapItem key={m.id || m.roleManagerRoleId}>
                      <Badge
                        colorScheme="purple"
                        variant="subtle"
                        px={2}
                        py={1}
                        borderRadius="md"
                        fontSize="xs"
                      >
                        {m.role?.name || `Role ${m.roleManagerRoleId}`}
                      </Badge>
                    </WrapItem>
                  ))}
                </Wrap>
              )}
            </Box>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}

export default GroupsSection;
