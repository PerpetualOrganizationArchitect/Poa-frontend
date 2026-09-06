import React, { useEffect, useState } from 'react';
import {
  Box,
  HStack,
  Stack,
  VStack,
  Heading,
  Text,
  Avatar,
  Badge,
  IconButton,
  Button,
  CloseButton,
} from '@chakra-ui/react';
import { SettingsIcon, CheckIcon, EditIcon } from '@chakra-ui/icons';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { useIdentity } from '@/context/IdentityContext';
import AccountControl from '@/components/common/AccountControl';
import useIpfsImage from '@/hooks/useIpfsImage';

const NUDGE_DISMISS_KEY = (address) => `poa:profileNudgeDismissed:${address?.toLowerCase()}`;

export function ProfileHeader({
  username,
  address,
  avatarCid,
  orgName,
  dateJoined,
  userRoles = [],
  canApproveRequests,
  profileMetadata,
  canEdit = false,
  onEditProfileClick,
  onSettingsClick,
  onExecutiveMenuClick,
}) {
  const identity = useIdentity(address);
  // Fresh profile data takes precedence over the cross-chain identity cache,
  // which may still hold the avatar from before the user's latest edit.
  const selectedAvatarCid = avatarCid || identity?.avatarCid || null;
  const resolvedAvatarUrl = useIpfsImage(selectedAvatarCid);
  const bio = typeof profileMetadata?.bio === 'string' ? profileMetadata.bio.trim() : '';
  const hasJoinDate = dateJoined && dateJoined !== 'Unknown';
  const profileIncomplete = canEdit && !!address && !!onEditProfileClick && (
    !profileMetadata?.avatar || !bio
  );
  const [nudgeDismissed, setNudgeDismissed] = useState(true);

  useEffect(() => {
    if (!address || typeof window === 'undefined') return;
    try {
      setNudgeDismissed(window.localStorage.getItem(NUDGE_DISMISS_KEY(address)) === '1');
    } catch {
      setNudgeDismissed(false);
    }
  }, [address]);

  const dismissNudge = () => {
    setNudgeDismissed(true);
    if (!address || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(NUDGE_DISMISS_KEY(address), '1');
    } catch {
      // Dismiss for this visit even when browser storage is unavailable.
    }
  };

  return (
    // Account menus must stay above the cards that follow this header.
    <Box
      w="100%"
      borderRadius="2xl"
      bg="transparent"
      boxShadow="lg"
      position="relative"
      zIndex={3}
      borderWidth="1px"
      borderColor="whiteAlpha.200"
    >
      <div style={glassLayerStyle} />

      <Stack
        direction={{ base: 'column', lg: 'row' }}
        spacing={{ base: 5, md: 6 }}
        p={{ base: 5, md: 6 }}
        position="relative"
        align={{ base: 'stretch', lg: 'flex-start' }}
        justify="space-between"
      >
        <HStack spacing={{ base: 4, md: 5 }} align="flex-start" flex={1} minW={0}>
          <Avatar
            size={{ base: 'lg', md: 'xl' }}
            name={username || 'Your profile'}
            src={resolvedAvatarUrl}
            bg="amethyst.600"
            color="white"
            borderWidth="1px"
            borderColor="whiteAlpha.300"
            flexShrink={0}
          />
          <VStack align="start" spacing={2} minW={0}>
            <Text fontSize="xs" color="gray.400" fontWeight="medium">
              Your profile
            </Text>
            <Heading
              as="h1"
              fontSize={{ base: '2xl', md: '3xl' }}
              fontWeight="semibold"
              letterSpacing="-0.035em"
              color="white"
              lineHeight="1.15"
              noOfLines={1}
              maxW="100%"
            >
              {username || 'Welcome'}
            </Heading>
            {(orgName || hasJoinDate) && (
              <Text fontSize="sm" color="gray.400" lineHeight="tall">
                {orgName && <Text as="span" color="gray.300">{orgName}</Text>}
                {orgName && hasJoinDate && <Text as="span" mx={2} aria-hidden="true">·</Text>}
                {hasJoinDate && `Active since ${dateJoined}`}
              </Text>
            )}
            {bio && (
              <Text fontSize="sm" color="gray.300" lineHeight="tall" maxW="52ch" overflowWrap="anywhere">
                {bio}
              </Text>
            )}
            {userRoles.length > 0 && (
              <HStack spacing={1.5} flexWrap="wrap" pt={1}>
                {userRoles.slice(0, 3).map((role) => (
                  <Badge
                    key={role.hatId || role.name}
                    bg="whiteAlpha.100"
                    color="gray.300"
                    fontSize="xs"
                    fontWeight="normal"
                    textTransform="none"
                    px={2.5}
                    py={1}
                    borderRadius="full"
                    maxW="100%"
                    noOfLines={1}
                  >
                    {role.name}
                  </Badge>
                ))}
                {userRoles.length > 3 && (
                  <Text fontSize="xs" color="gray.400" px={1}>
                    +{userRoles.length - 3} more
                  </Text>
                )}
              </HStack>
            )}
          </VStack>
        </HStack>

        <HStack
          spacing={2}
          flexShrink={0}
          justify={{ base: 'flex-end', md: 'initial' }}
          w={{ base: '100%', lg: 'auto' }}
          flexWrap="wrap"
          rowGap={2}
        >
          {canEdit && onEditProfileClick && (
            <>
              <Button
                size="sm"
                leftIcon={<EditIcon />}
                onClick={onEditProfileClick}
                variant="ghost"
                color="gray.300"
                _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
                display={{ base: 'none', md: 'inline-flex' }}
              >
                Edit profile
              </Button>
              <IconButton
                icon={<EditIcon />}
                size="sm"
                aria-label="Edit profile"
                onClick={onEditProfileClick}
                variant="ghost"
                color="gray.300"
                _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
                display={{ base: 'inline-flex', md: 'none' }}
              />
            </>
          )}
          <AccountControl label="Account" />

          <IconButton
            icon={<SettingsIcon />}
            size="sm"
            aria-label="Account Settings"
            onClick={onSettingsClick}
            variant="ghost"
            color="gray.300"
            _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
          />

          {canApproveRequests && (
            <>
              <Button
                size="sm"
                onClick={onExecutiveMenuClick}
                bg="whiteAlpha.100"
                color="gray.200"
                _hover={{ bg: 'whiteAlpha.200', color: 'white' }}
                display={{ base: 'none', md: 'inline-flex' }}
              >
                Approvals & Roles
              </Button>
              <IconButton
                icon={<CheckIcon />}
                size="sm"
                bg="whiteAlpha.100"
                color="gray.200"
                _hover={{ bg: 'whiteAlpha.200', color: 'white' }}
                aria-label="Approvals & Roles"
                onClick={onExecutiveMenuClick}
                display={{ base: 'inline-flex', md: 'none' }}
              />
            </>
          )}
        </HStack>
      </Stack>

      {profileIncomplete && !nudgeDismissed && (
        <HStack
          mx={{ base: 5, md: 6 }}
          mb={{ base: 4, md: 5 }}
          pt={3}
          borderTopWidth="1px"
          borderColor="whiteAlpha.200"
          spacing={3}
          position="relative"
        >
          <Text fontSize="xs" color="gray.400" flex={1} lineHeight="tall">
            {!profileMetadata?.avatar && !bio
              ? 'Add a photo and bio.'
              : !profileMetadata?.avatar
                ? 'Add a profile photo.'
                : 'Add a short bio.'}
          </Text>
          <Button
            size="xs"
            variant="ghost"
            color="amethyst.200"
            _hover={{ bg: 'whiteAlpha.100' }}
            onClick={onEditProfileClick}
            flexShrink={0}
          >
            Add details
          </Button>
          <CloseButton size="sm" aria-label="Dismiss profile reminder" onClick={dismissNudge} flexShrink={0} color="gray.400" />
        </HStack>
      )}
    </Box>
  );
}

export default ProfileHeader;
