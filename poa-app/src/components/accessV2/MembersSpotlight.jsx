/**
 * MembersSpotlight — the members section for a live-authority org.
 *
 * The old grouped-by-role accordions restated what the roles panel above already says. This is
 * the inverse cut: PEOPLE first. A random handful of member cards, each badged with the
 * member's most specific roles (fewest holders first, so "Co-President" beats "Member"), and
 * one expander to see everyone. Stats still come from the legacy per-user records — users are
 * chain-wide entities and did not migrate.
 */

import React, { useMemo, useState } from 'react';
import { Box, Button, Center, SimpleGrid, Skeleton, Text, VStack } from '@chakra-ui/react';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { MemberCard } from '@/components/orgStructure/MembersSection';
import { useAuthoritySubjects, useAuthorityMemberships } from '@/hooks/accessV2';

const PREVIEW_COUNT = 6;

/** Fisher–Yates, non-mutating. Randomness is per-mount by design: a fresh spotlight per visit. */
function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MembersSpotlight({ legacyMembersByRole = {}, loading = false }) {
  const { roles, loading: subjectsLoading } = useAuthoritySubjects();
  const { memberships, loading: membershipsLoading } = useAuthorityMemberships();
  const [showAll, setShowAll] = useState(false);

  // address -> rich legacy stat record (tokens, tasks, votes, joined)
  const statsByAddress = useMemo(() => {
    const map = new Map();
    for (const list of Object.values(legacyMembersByRole || {})) {
      for (const rec of list || []) {
        const addr = String(rec?.address || '').toLowerCase();
        if (addr && !map.has(addr)) map.set(addr, rec);
      }
    }
    return map;
  }, [legacyMembersByRole]);

  // Exclusivity order: a role held by 2 people says more about you than one held by 19.
  const roleRank = useMemo(() => {
    const rank = new Map();
    for (const r of roles || []) rank.set(r.subjectId, r.memberCount ?? Number.MAX_SAFE_INTEGER);
    return rank;
  }, [roles]);

  const members = useMemo(() => {
    const byUser = new Map();
    for (const m of memberships || []) {
      if (!m.isMember || !m.isUserFacing) continue;
      const entry = byUser.get(m.user) || { address: m.user, username: m.username, roles: [] };
      if (!entry.username && m.username) entry.username = m.username;
      entry.roles.push({ subjectId: m.subjectId, name: m.subjectName });
      byUser.set(m.user, entry);
    }
    return [...byUser.values()].map((u) => {
      const names = u.roles
        .filter((r) => r.name)
        .sort((a, b) => (roleRank.get(a.subjectId) ?? 1e9) - (roleRank.get(b.subjectId) ?? 1e9))
        .map((r) => r.name);
      const stats = statsByAddress.get(u.address);
      return {
        record: stats || {
          id: u.address,
          address: u.address,
          username: u.username || null,
          participationTokenBalance: '0',
          totalTasksCompleted: 0,
          totalVotes: 0,
        },
        badges: names,
      };
    });
  }, [memberships, roleRank, statsByAddress]);

  const preview = useMemo(() => shuffled(members).slice(0, PREVIEW_COUNT), [members]);
  const everyone = useMemo(
    () => [...members].sort((a, b) => String(a.record.username || a.record.address).localeCompare(String(b.record.username || b.record.address))),
    [members]
  );

  if (loading || subjectsLoading || membershipsLoading) {
    return (
      <VStack align="stretch" spacing={3}>
        <Skeleton height="90px" borderRadius="lg" />
        <Skeleton height="90px" borderRadius="lg" />
      </VStack>
    );
  }

  if (members.length === 0) {
    return (
      <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="xl" p={6}>
        <Text fontSize="sm" color="warmGray.500">No members yet.</Text>
      </Box>
    );
  }

  const shown = showAll ? everyone : preview;

  return (
    <VStack align="stretch" spacing={4}>
      <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={3}>
        {shown.map(({ record, badges }) => (
          <MemberCard key={record.address} member={record} roleBadges={badges} />
        ))}
      </SimpleGrid>
      {members.length > PREVIEW_COUNT && (
        <Center>
          <Button
            size="sm"
            variant="ghost"
            colorScheme="coral"
            rightIcon={showAll ? <FiChevronUp /> : <FiChevronDown />}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Show fewer' : `Show all ${members.length} members`}
          </Button>
        </Center>
      )}
    </VStack>
  );
}
