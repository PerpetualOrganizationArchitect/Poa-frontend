/**
 * RolesGroupsPanel — the org-admin view of roles and groups.
 *
 * Renders ONLY on an org whose authority is live; a legacy org never mounts it (see
 * `AccessV2TeamSection`). Everything on screen comes from the fold mirror, so there are no
 * eth_calls behind this page.
 *
 * Deliberate choices:
 *   • the member count shown is the ACTIVE count (accepted && eligible), never the raw
 *     accepted count — a lapsed member is not a member;
 *   • a GROUP shows no seat count and no "join" affordance, because group membership is derived
 *     from its roles and groups are not tokens;
 *   • a group's permission change is labelled with its blast radius before anyone clicks.
 */

import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  SimpleGrid,
  Alert,
  AlertIcon,
  Skeleton,
  Wrap,
  WrapItem,
  Tag,
} from '@chakra-ui/react';
import { FiPlus, FiUsers, FiLayers } from 'react-icons/fi';
import { lightSectionStyle, lightCardStyle } from '@/components/shared/glassStyles';
import { useAuthoritySubjects, useAuthorityMemberships } from '@/hooks/accessV2';
import { groupChangeBlastRadius } from '@/lib/accessV2/subjects';
import { managerConfigSummary } from '@/lib/accessV2/pendingActions';
import CreateRoleWizard from './CreateRoleWizard';
import SubjectDetailPanel from './SubjectDetailPanel';

function SeatLabel({ subject }) {
  if (subject.isGroup) return null;
  return (
    <Text fontSize="xs" color="warmGray.500">
      {subject.unlimitedSeats
        ? `${subject.memberCount} member${subject.memberCount === 1 ? '' : 's'}`
        : `${subject.memberCount} of ${subject.maxMembers} seats`}
    </Text>
  );
}

function SubjectCard({ subject, memberCount, onOpen }) {
  return (
    <Box
      {...lightCardStyle}
      p={4}
      cursor="pointer"
      onClick={() => onOpen(subject)}
      _hover={{ borderColor: 'coral.300', transform: 'translateY(-2px)' }}
      transition="transform .15s, border-color .15s"
    >
      <VStack align="stretch" spacing={2}>
        <HStack justify="space-between">
          <HStack>
            <Text fontWeight="semibold" color="warmGray.900">{subject.name || 'Untitled'}</Text>
            {subject.isOpen && <Badge colorScheme="green">Open</Badge>}
            {subject.isGroup && <Badge colorScheme="purple">Group</Badge>}
          </HStack>
          {subject.isGroup ? (
            <Text fontSize="xs" color="warmGray.500">{memberCount} people</Text>
          ) : (
            <SeatLabel subject={subject} />
          )}
        </HStack>

        {subject.isGroup ? (
          <Text fontSize="xs" color="warmGray.500">
            {subject.memberRoles?.length
              ? subject.memberRoles.map((r) => r.name).join(', ')
              : 'No roles in this group yet'}
          </Text>
        ) : (
          <Wrap spacing={1}>
            {(subject.groups || []).map((g) => (
              <WrapItem key={g.subjectId}>
                <Tag size="sm" colorScheme="purple" variant="subtle">{g.name}</Tag>
              </WrapItem>
            ))}
          </Wrap>
        )}

        {subject.managerConfig?.enabled && (
          <Text fontSize="xs" color="warmGray.500">{managerConfigSummary(subject.managerConfig)}</Text>
        )}
      </VStack>
    </Box>
  );
}

export default function RolesGroupsPanel({ activeProposals = [] }) {
  const { roles, groups, loading, authority } = useAuthoritySubjects();
  const { groupMembers, membersOf } = useAuthorityMemberships();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  if (loading) {
    return (
      <Box {...lightSectionStyle} p={6}>
        <VStack align="stretch" spacing={3}>
          <Skeleton height="20px" />
          <Skeleton height="80px" />
          <Skeleton height="80px" />
        </VStack>
      </Box>
    );
  }

  return (
    <Box {...lightSectionStyle} p={{ base: 4, md: 6 }}>
      <HStack justify="space-between" mb={4} flexWrap="wrap" gap={2}>
        <VStack align="start" spacing={0}>
          <Text fontSize="lg" fontWeight="bold" color="warmGray.900">Roles and groups</Text>
          <Text fontSize="sm" color="warmGray.600">
            Roles are what people hold. Groups bundle permissions across roles.
          </Text>
        </VStack>
        <Button leftIcon={<FiPlus />} colorScheme="coral" size="sm" onClick={() => setWizardOpen(true)}>
          New role
        </Button>
      </HStack>

      {authority.paused && (
        <Alert status="warning" borderRadius="md" fontSize="sm" mb={4}>
          <AlertIcon />
          Membership changes are paused for this org. You can still look, but nothing can change yet.
        </Alert>
      )}

      <Tabs colorScheme="coral" variant="soft-rounded" size="sm">
        <TabList mb={4}>
          <Tab><HStack spacing={2}><FiUsers /><Text>Roles ({roles.length})</Text></HStack></Tab>
          <Tab><HStack spacing={2}><FiLayers /><Text>Groups ({groups.length})</Text></HStack></Tab>
        </TabList>

        <TabPanels>
          <TabPanel px={0}>
            {roles.length === 0 ? (
              <Alert status="info" borderRadius="md" fontSize="sm">
                <AlertIcon />
                No roles yet. Create the first one — it opens a vote.
              </Alert>
            ) : (
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                {roles.map((r) => (
                  <SubjectCard
                    key={r.subjectId}
                    subject={r}
                    memberCount={membersOf(r.subjectId).length}
                    onOpen={setSelected}
                  />
                ))}
              </SimpleGrid>
            )}
          </TabPanel>

          <TabPanel px={0}>
            {groups.length === 0 ? (
              <Alert status="info" borderRadius="md" fontSize="sm">
                <AlertIcon />
                No groups yet. Groups are how you give several roles the same powers at once.
              </Alert>
            ) : (
              <VStack align="stretch" spacing={3}>
                {groups.map((g) => (
                  <Box key={g.subjectId}>
                    <SubjectCard
                      subject={g}
                      memberCount={(groupMembers.get(g.subjectId) || []).length}
                      onOpen={setSelected}
                    />
                    <Text fontSize="xs" color="warmGray.500" mt={1} px={1}>
                      {groupChangeBlastRadius(g)}
                    </Text>
                  </Box>
                ))}
              </VStack>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>

      <CreateRoleWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        activeProposals={activeProposals}
      />
      <SubjectDetailPanel
        subject={selected}
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
      />
    </Box>
  );
}
