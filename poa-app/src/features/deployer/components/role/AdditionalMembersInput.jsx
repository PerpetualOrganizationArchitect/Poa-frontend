/**
 * AdditionalMembersInput - Pick the people who receive a role at launch.
 *
 * Replaces the free-text username fields the Team step used to ship. Those only
 * surfaced a typo at deploy time, where `resolveRoleUsernames` throws and aborts
 * a transaction the founder has already paid to prepare. Searching resolves the
 * address up front — same component and cross-chain search the vouch flow and
 * task assignment already use — so a member is either verified or not in the list.
 */

import React, { useMemo, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Icon,
  IconButton,
  Badge,
  Tooltip,
} from '@chakra-ui/react';
import { PiInfo, PiUserPlus, PiX, PiWarning } from 'react-icons/pi';
import { UserSearchInput } from '@/components/common';
import UserIdentity from '@/components/common/UserIdentity';
import { useAuth } from '@/context/AuthContext';
import { getAdditionalMembers, memberLabel } from '../../utils/additionalMembers';

/**
 * One selected member row.
 */
function MemberRow({ member, isDeployer, onRemove }) {
  const isUnresolved = !member.address;

  return (
    <HStack
      px={3}
      py={2}
      bg={isUnresolved ? 'orange.50' : 'warmGray.50'}
      border="1px solid"
      borderColor={isUnresolved ? 'orange.200' : 'warmGray.200'}
      borderRadius="md"
      justify="space-between"
      spacing={2}
    >
      {isUnresolved ? (
        // Legacy free-text entry: no address, so it can still fail at deploy.
        <HStack spacing={2} minW={0} flex={1}>
          <Icon as={PiWarning} boxSize={3.5} color="orange.500" flexShrink={0} />
          <Text fontSize="sm" color="warmGray.700" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {memberLabel(member)}
          </Text>
          <Badge colorScheme="orange" fontSize="0.6rem" textTransform="none" flexShrink={0}>
            Unverified
          </Badge>
        </HStack>
      ) : (
        <HStack spacing={2} minW={0} flex={1}>
          <UserIdentity
            address={member.address}
            usernameHint={member.username}
            size="xs"
            showName={false}
            link={false}
          />
          <VStack align="start" spacing={0} minW={0} flex={1}>
            <HStack spacing={2} minW={0}>
              <Text fontSize="sm" color="warmGray.900" fontWeight="medium">
                {member.username || 'No username registered'}
              </Text>
              {isDeployer && (
                <Badge colorScheme="green" fontSize="0.6rem" textTransform="none" flexShrink={0}>
                  You
                </Badge>
              )}
            </HStack>
            {/* The resolved address is the point of the search — show what was
                actually captured, so two similar usernames stay distinguishable. */}
            <Text fontSize="xs" color="warmGray.500" fontFamily="mono">
              {memberLabel({ address: member.address })}
            </Text>
          </VStack>
        </HStack>
      )}

      <IconButton
        size="xs"
        icon={<Icon as={PiX} />}
        onClick={onRemove}
        aria-label={`Remove ${memberLabel(member) || 'member'}`}
        variant="ghost"
        color="warmGray.400"
        _hover={{ color: 'red.500', bg: 'red.50' }}
      />
    </HStack>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.role - Role object from wizard state
 * @param {Function} props.onChange - Called with the next member array
 */
export function AdditionalMembersInput({ role, onChange }) {
  const { accountAddress } = useAuth();
  const members = useMemo(() => getAdditionalMembers(role), [role]);
  // UserSearchInput clears itself on select, so a rejected pick would otherwise
  // look like the click did nothing.
  const [notice, setNotice] = useState(null);

  const deployerAddress = accountAddress ? accountAddress.toLowerCase() : null;
  const mintsToDeployer = Boolean(role?.distribution?.mintToDeployer);

  const selectedAddresses = useMemo(
    () => new Set(members.map((m) => m.address).filter(Boolean)),
    [members]
  );

  // Adding someone who already gets the hat via "Assign to me" would mint the
  // same hat to the same wearer twice, which reverts the whole deploy.
  const deployerAlreadyCovered = mintsToDeployer && Boolean(deployerAddress);

  const handleSelect = (result) => {
    if (!result?.address) return;
    const address = result.address.toLowerCase();

    if (selectedAddresses.has(address)) {
      setNotice(`${result.username || memberLabel({ address })} is already on this role.`);
      return;
    }
    if (deployerAlreadyCovered && address === deployerAddress) {
      setNotice('You already receive this role through "Assign to me".');
      return;
    }

    setNotice(null);
    onChange([...members, { address, username: result.username || null }]);
  };

  const handleRemove = (idx) => {
    setNotice(null);
    onChange(members.filter((_, i) => i !== idx));
  };

  const duplicateDeployerIdx = deployerAlreadyCovered
    ? members.findIndex((m) => m.address === deployerAddress)
    : -1;

  return (
    <Box>
      <HStack spacing={1} mb={2}>
        <Icon as={PiUserPlus} boxSize={3.5} color="warmGray.400" />
        <Text fontSize="xs" color="warmGray.500" fontWeight="600">
          Additional Members
        </Text>
        <Tooltip
          label="Search Poa members by username or wallet address. Everyone you add receives this role the moment your organization launches."
          hasArrow
          placement="top"
          fontSize="xs"
        >
          <Box as="span" cursor="help">
            <Icon as={PiInfo} boxSize={3} color="warmGray.400" />
          </Box>
        </Tooltip>
      </HStack>

      <VStack spacing={2} align="stretch">
        {members.map((member, idx) => (
          <MemberRow
            key={member.address || `${member.username}-${idx}`}
            member={member}
            isDeployer={Boolean(deployerAddress) && member.address === deployerAddress}
            onRemove={() => handleRemove(idx)}
          />
        ))}

        <UserSearchInput
          onSelect={handleSelect}
          placeholder="Search by username or 0x address..."
          size="sm"
          variant="light"
          // Advanced Settings is a Chakra Collapse (overflow: hidden even when
          // open) — a floating dropdown gets sliced off at the card's edge.
          resultsPlacement="inline"
        />

        {notice && (
          <Text fontSize="xs" color="orange.600">
            {notice}
          </Text>
        )}

        {duplicateDeployerIdx >= 0 && (
          <Text fontSize="xs" color="orange.600">
            You already receive this role through &quot;Assign to me&quot;, so listing
            yourself here mints the same role twice and the launch will fail. Remove
            yourself from this list, or turn that toggle off.
          </Text>
        )}

        {members.length === 0 && !notice && (
          <Text fontSize="xs" color="warmGray.500">
            Optional — you can also add people after launch.
          </Text>
        )}
      </VStack>
    </Box>
  );
}

export default AdditionalMembersInput;
