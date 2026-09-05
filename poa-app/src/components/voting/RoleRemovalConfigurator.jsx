/**
 * RoleRemovalConfigurator — choose one v2 role and one or more current members to remove.
 *
 * The winning option is ONE atomic Executor batch with one MembershipAuthority.remove call per
 * selected person. A soft removal is used whenever it can work. For an open/vouched/email-backed
 * membership the contract would reject that as ineffective, so the row is explicitly marked and
 * encoded as a hard removal (`ban=true`) only after the member confirms that durable block.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  Spinner,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import UserIdentity from '@/components/common/UserIdentity';
import { inputStyles } from '@/components/shared/glassStyles';
import { useAuthorityMemberships, useAuthoritySubjects } from '@/hooks/accessV2';
import { applyAutoCopy } from '@/components/voting/create/autoCopy';
import {
  buildRoleRemovalCopy,
  defaultRoleRemovalConfig,
  MAX_ROLE_REMOVALS,
  removalBanReasons,
  removalNeedsBan,
  retainBanConfirmation,
  ROLE_REMOVAL_UNAVAILABLE_MESSAGE,
  shortAddress,
} from '@/lib/accessV2/roleRemoval';

const addressKey = (value) => String(value || '').toLowerCase();

function selectedMember(row) {
  const reasons = removalBanReasons(row);
  return {
    address: row.user,
    username: row.username || '',
    ban: removalNeedsBan(row),
    banReasons: reasons,
  };
}

export default function RoleRemovalConfigurator({ proposal, onChange }) {
  const {
    roles,
    enabled,
    loading: subjectsLoading,
    error: subjectsError,
    refetch: refetchSubjects,
  } = useAuthoritySubjects();
  const {
    membersOf,
    loading: membershipsLoading,
    error: membershipsError,
    refetch: refetchMemberships,
  } = useAuthorityMemberships();
  const [search, setSearch] = useState('');
  const [retrying, setRetrying] = useState(false);

  const config = proposal.roleRemovalConfig || defaultRoleRemovalConfig;
  const selectedRole = useMemo(
    () => (roles || []).find((role) => String(role.subjectId) === String(config.subjectId)) || null,
    [roles, config.subjectId]
  );

  const roleMembers = useMemo(() => {
    if (!config.subjectId) return [];
    return [...(membersOf?.(config.subjectId) || [])].sort((a, b) => {
      const aa = String(a.username || a.user || '').toLowerCase();
      const bb = String(b.username || b.user || '').toLowerCase();
      return aa.localeCompare(bb);
    });
  }, [membersOf, config.subjectId]);

  const selectedKeys = useMemo(
    () => new Set((config.members || []).map((member) => addressKey(member.address))),
    [config.members]
  );

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roleMembers;
    return roleMembers.filter((member) => (
      String(member.username || '').toLowerCase().includes(q)
      || addressKey(member.user).includes(q)
    ));
  }, [roleMembers, search]);

  const updateConfig = useCallback((nextConfig) => {
    const copy = buildRoleRemovalCopy(nextConfig);
    const autoCopy = applyAutoCopy(proposal, copy);
    onChange({ roleRemovalConfig: nextConfig, ...autoCopy });
  }, [onChange, proposal]);

  // A saved draft can outlive the roster snapshot it was made from. Once the live query settles,
  // drop people who no longer hold the role and refresh each surviving row's ban requirement.
  // This is a creation-time guard; the Executor batch remains atomic if membership changes later.
  useEffect(() => {
    if (!enabled || subjectsLoading || membershipsLoading || subjectsError || membershipsError) {
      // Preserve the selected role and people on a transient read failure, but make a restored or
      // previously-settled selection wait for a successful fresh reconciliation before advancing.
      if (config.liveReconciled) updateConfig({ ...config, liveReconciled: false });
      return;
    }
    if (!config.subjectId) return;
    if (!selectedRole) {
      updateConfig({ ...defaultRoleRemovalConfig });
      return;
    }

    const current = new Map(roleMembers.map((row) => [addressKey(row.user), row]));
    const nextMembers = (config.members || [])
      .map((member) => current.get(addressKey(member.address)))
      .filter(Boolean)
      .map(selectedMember);
    const membersChanged = JSON.stringify(nextMembers) !== JSON.stringify(config.members || []);
    const roleNameChanged = (selectedRole.name || '') !== (config.subjectName || '');
    if (membersChanged || roleNameChanged || !config.liveReconciled) {
      updateConfig({
        ...config,
        subjectName: selectedRole.name || '',
        members: nextMembers,
        confirmBans: retainBanConfirmation(
          config.members,
          nextMembers,
          config.confirmBans,
        ),
        liveReconciled: true,
      });
    }
  }, [
    config,
    enabled,
    membershipsLoading,
    membershipsError,
    roleMembers,
    selectedRole,
    subjectsLoading,
    subjectsError,
    updateConfig,
  ]);

  const handleRoleChange = useCallback((event) => {
    const subjectId = event.target.value;
    const role = (roles || []).find((candidate) => String(candidate.subjectId) === subjectId);
    setSearch('');
    updateConfig({
      subjectId,
      subjectName: role?.name || '',
      members: [],
      confirmBans: false,
      liveReconciled: false,
    });
  }, [roles, updateConfig]);

  const toggleMember = useCallback((row) => {
    const key = addressKey(row.user);
    const current = config.members || [];
    const isSelected = current.some((member) => addressKey(member.address) === key);
    if (!isSelected && current.length >= MAX_ROLE_REMOVALS) return;
    const members = isSelected
      ? current.filter((member) => addressKey(member.address) !== key)
      : [...current, selectedMember(row)];
    updateConfig({
      ...config,
      members,
      confirmBans: retainBanConfirmation(config.members, members, config.confirmBans),
    });
  }, [config, updateConfig]);

  const allVisibleSelected = filteredMembers.length > 0
    && filteredMembers.every((row) => selectedKeys.has(addressKey(row.user)));

  const toggleVisible = useCallback(() => {
    const visible = new Set(filteredMembers.map((row) => addressKey(row.user)));
    if (allVisibleSelected) {
      const members = (config.members || [])
        .filter((member) => !visible.has(addressKey(member.address)));
      updateConfig({
        ...config,
        members,
        confirmBans: retainBanConfirmation(config.members, members, config.confirmBans),
      });
      return;
    }

    const members = [...(config.members || [])];
    const have = new Set(members.map((member) => addressKey(member.address)));
    for (const row of filteredMembers) {
      if (members.length >= MAX_ROLE_REMOVALS) break;
      const key = addressKey(row.user);
      if (have.has(key)) continue;
      members.push(selectedMember(row));
      have.add(key);
    }
    updateConfig({
      ...config,
      members,
      confirmBans: retainBanConfirmation(config.members, members, config.confirmBans),
    });
  }, [allVisibleSelected, config, filteredMembers, updateConfig]);

  const retryLoads = useCallback(async () => {
    setRetrying(true);
    try {
      const reads = [refetchSubjects, refetchMemberships]
        .filter((refetch) => typeof refetch === 'function')
        .map((refetch) => refetch());
      await Promise.allSettled(reads);
    } finally {
      setRetrying(false);
    }
  }, [refetchMemberships, refetchSubjects]);

  const banCount = (config.members || []).filter((member) => member.ban).length;
  const loading = subjectsLoading || membershipsLoading;
  const error = subjectsError || membershipsError;

  if (!enabled && !subjectsLoading) {
    return (
      <Alert status="info" borderRadius="md" bg="rgba(66, 153, 225, 0.15)">
        <AlertIcon color="blue.300" />
        <Text fontSize="sm" color="gray.200">
          {ROLE_REMOVAL_UNAVAILABLE_MESSAGE}
        </Text>
      </Alert>
    );
  }

  return (
    <VStack spacing={4} align="stretch">
      <Alert status="info" borderRadius="md" bg="rgba(66, 153, 225, 0.15)">
        <AlertIcon color="blue.300" />
        <Text fontSize="sm" color="gray.200">
          Pick one role, then up to {MAX_ROLE_REMOVALS} people. If the vote passes, every removal
          runs together in one atomic batch — either all selected memberships change or none do.
        </Text>
      </Alert>

      <FormControl>
        <FormLabel color="gray.200" fontSize="sm">Role</FormLabel>
        <Select
          value={config.subjectId || ''}
          onChange={handleRoleChange}
          placeholder="Select a role"
          {...inputStyles}
        >
          {(roles || []).map((role) => (
            <option key={role.subjectId} value={role.subjectId} style={{ background: '#1a1a2e' }}>
              {role.name || `Role ${role.subjectId}`} ({role.memberCount || 0})
            </option>
          ))}
        </Select>
      </FormControl>

      {loading && (
        <HStack justify="center" py={6} color="gray.300">
          <Spinner size="sm" />
          <Text fontSize="sm">Loading current role holders…</Text>
        </HStack>
      )}

      {error && !loading && (
        <Alert status="error" borderRadius="md" bg="rgba(229, 62, 62, 0.14)">
          <AlertIcon />
          <HStack justify="space-between" w="100%" spacing={3}>
            <Text fontSize="sm" color="gray.200">Could not load the current role holders.</Text>
            <Button
              size="xs"
              variant="outline"
              colorScheme="red"
              onClick={retryLoads}
              isLoading={retrying}
              flexShrink={0}
            >
              Try again
            </Button>
          </HStack>
        </Alert>
      )}

      {selectedRole && !loading && !error && (
        <Box>
          <HStack justify="space-between" align="flex-end" mb={3} gap={3}>
            <FormControl flex="1">
              <FormLabel color="gray.200" fontSize="sm">People</FormLabel>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or address"
                {...inputStyles}
              />
            </FormControl>
            <Button
              size="sm"
              variant="ghost"
              color="purple.200"
              onClick={toggleVisible}
              isDisabled={filteredMembers.length === 0}
              mb="1px"
            >
              {allVisibleSelected ? 'Clear shown' : 'Select shown'}
            </Button>
          </HStack>

          <HStack justify="space-between" mb={2}>
            <Text fontSize="xs" color="gray.400">
              {filteredMembers.length} current {filteredMembers.length === 1 ? 'member' : 'members'}
            </Text>
            <Text
              fontSize="xs"
              color={(config.members || []).length >= MAX_ROLE_REMOVALS ? 'orange.300' : 'gray.400'}
            >
              {(config.members || []).length} / {MAX_ROLE_REMOVALS} selected
            </Text>
          </HStack>

          <VStack
            align="stretch"
            spacing={2}
            maxH="300px"
            overflowY="auto"
            pr={1}
          >
            {filteredMembers.map((member) => {
              const key = addressKey(member.user);
              const checked = selectedKeys.has(key);
              const reasons = removalBanReasons(member);
              const needsBan = reasons.length > 0;
              const disabled = !checked && (config.members || []).length >= MAX_ROLE_REMOVALS;
              return (
                <Box
                  key={key}
                  border="1px solid"
                  borderColor={checked ? 'purple.400' : 'whiteAlpha.200'}
                  bg={checked ? 'rgba(148, 115, 220, 0.13)' : 'whiteAlpha.50'}
                  borderRadius="md"
                  px={3}
                  py={2.5}
                >
                  <Checkbox
                    isChecked={checked}
                    isDisabled={disabled}
                    onChange={() => toggleMember(member)}
                    colorScheme="purple"
                    w="100%"
                  >
                    <HStack justify="space-between" w="100%" minW={0} spacing={3}>
                      <VStack align="start" spacing={0} minW={0}>
                        <UserIdentity
                          address={member.user}
                          usernameHint={member.username}
                          link={false}
                          size="xs"
                          nameColor="white"
                          nameFontSize="sm"
                        />
                        <Text fontSize="2xs" color="gray.500" fontFamily="mono">
                          {shortAddress(member.user)}
                        </Text>
                      </VStack>
                      {needsBan ? (
                        <Tooltip
                          hasArrow
                          label={`A normal removal would not work because of ${reasons.join(', ')}. The vote must block this role until another vote reverses it.`}
                        >
                          <Badge colorScheme="orange" flexShrink={0}>Block required</Badge>
                        </Tooltip>
                      ) : (
                        <Badge colorScheme="gray" flexShrink={0}>Remove</Badge>
                      )}
                    </HStack>
                  </Checkbox>
                </Box>
              );
            })}
          </VStack>

          {filteredMembers.length === 0 && (
            <Box
              border="1px dashed"
              borderColor="whiteAlpha.300"
              borderRadius="md"
              p={5}
              textAlign="center"
            >
              <Text fontSize="sm" color="gray.400">
                {roleMembers.length === 0 ? 'This role has no current members.' : 'No members match that search.'}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {banCount > 0 && (
        <Alert status="warning" borderRadius="md" bg="rgba(221, 107, 32, 0.14)">
          <AlertIcon color="orange.300" />
          <VStack align="stretch" spacing={2}>
            <Text fontSize="sm" color="gray.200">
              {banCount} selected {banCount === 1 ? 'person still qualifies' : 'people still qualify'}
              {' '}through this role’s rules. Removing {banCount === 1 ? 'them' : 'those people'} also
              blocks them from reclaiming it; another vote can unblock them later.
            </Text>
            <Checkbox
              isChecked={Boolean(config.confirmBans)}
              onChange={(event) => updateConfig({ ...config, confirmBans: event.target.checked })}
              colorScheme="orange"
            >
              <Text fontSize="sm" fontWeight="600" color="orange.100">
                I understand this adds a governance block.
              </Text>
            </Checkbox>
          </VStack>
        </Alert>
      )}
    </VStack>
  );
}
