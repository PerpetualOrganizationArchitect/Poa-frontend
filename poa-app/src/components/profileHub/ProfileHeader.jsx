/**
 * ProfileHeader - User identity header for the profile hub
 * Compact design with action buttons on the right
 */

import React, { useEffect, useState } from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Avatar,
  Badge,
  IconButton,
  Button,
  Tooltip,
  useClipboard,
  CloseButton,
} from '@chakra-ui/react';
import { SettingsIcon, CopyIcon, CheckIcon, EditIcon } from '@chakra-ui/icons';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { truncateAddress } from '@/utils/profileUtils';
import { useAuth } from '@/context/AuthContext';
import { useIdentity } from '@/context/IdentityContext';
import PasskeyAccountInfo from '@/components/passkey/PasskeyAccountInfo';

const NUDGE_DISMISS_KEY = (address) => `poa:profileNudgeDismissed:${address?.toLowerCase()}`;

/**
 * ProfileHeader component
 * @param {Object} props
 * @param {string} props.username
 * @param {string} props.address
 * @param {string} [props.avatarUrl]
 * @param {Object[]} [props.userRoles]
 * @param {boolean} [props.canApproveRequests] - Wears one of the participation token's
 *   approver hats; the only authority behind the menu this button opens.
 * @param {Object} [props.profileMetadata] - { bio, avatar, github, twitter, website }
 * @param {boolean} [props.canEdit] - Whether to show edit button + nudge
 * @param {() => void} [props.onEditProfileClick]
 * @param {() => void} props.onSettingsClick
 * @param {() => void} props.onExecutiveMenuClick
 */
export function ProfileHeader({
  username,
  address,
  avatarUrl,
  userRoles = [],
  canApproveRequests,
  profileMetadata,
  canEdit = false,
  onEditProfileClick,
  onSettingsClick,
  onExecutiveMenuClick,
}) {
  const { hasCopied, onCopy } = useClipboard(address || '');
  const { isPasskeyUser } = useAuth();
  const identity = useIdentity(address);
  const resolvedAvatarUrl = avatarUrl || (identity?.avatarCid ? `https://ipfs.io/ipfs/${identity.avatarCid}` : undefined);

  const profileIncomplete = canEdit && !!address && (
    !profileMetadata?.avatar || !profileMetadata?.bio
  );

  const [nudgeDismissed, setNudgeDismissed] = useState(true);

  useEffect(() => {
    if (!address || typeof window === 'undefined') return;
    const dismissed = window.localStorage.getItem(NUDGE_DISMISS_KEY(address)) === '1';
    setNudgeDismissed(dismissed);
  }, [address]);

  const dismissNudge = () => {
    if (!address || typeof window === 'undefined') return;
    window.localStorage.setItem(NUDGE_DISMISS_KEY(address), '1');
    setNudgeDismissed(true);
  };

  return (
    <Box
      w="100%"
      borderRadius="2xl"
      bg="transparent"
      boxShadow="lg"
      position="relative"
      zIndex={2}
    >
      <div style={glassLayerStyle} />

      {/* Content - Single row layout */}
      <HStack
        spacing={{ base: 4, md: 6 }}
        p={{ base: 4, md: 5 }}
        position="relative"
        align="center"
        justify="space-between"
      >
        {/* Left: Avatar + User Info */}
        <HStack spacing={{ base: 3, md: 4 }} align="center" flex={1} minW={0}>
          <Avatar
            size={{ base: 'lg', md: 'xl' }}
            name={username || address}
            src={resolvedAvatarUrl}
            bg="purple.500"
            color="white"
            boxShadow="lg"
            flexShrink={0}
          />
          <VStack align="start" spacing={1} minW={0}>
            {/* Username */}
            <Text
              fontSize={{ base: 'xl', md: '2xl' }}
              fontWeight="bold"
              color="white"
              lineHeight="1.2"
              noOfLines={1}
            >
              {username || 'Anonymous'}
            </Text>

            {/* Role Badges */}
            {userRoles.length > 0 && (
              <HStack spacing={1} flexWrap="wrap">
                {userRoles.slice(0, 3).map((role) => (
                  <Badge
                    key={role.hatId || role.name}
                    colorScheme="purple"
                    fontSize="xs"
                    px={2}
                    py={0.5}
                    borderRadius="full"
                  >
                    {role.name}
                  </Badge>
                ))}
                {userRoles.length > 3 && (
                  <Badge
                    colorScheme="gray"
                    fontSize="xs"
                    px={2}
                    py={0.5}
                    borderRadius="full"
                  >
                    +{userRoles.length - 3}
                  </Badge>
                )}
              </HStack>
            )}

            {/* Address with copy */}
            <Tooltip label={hasCopied ? 'Copied!' : 'Click to copy address'}>
              <HStack
                spacing={1}
                cursor="pointer"
                onClick={onCopy}
                _hover={{ bg: 'whiteAlpha.100' }}
                borderRadius="md"
                px={1}
                py={0.5}
                ml={-1}
                transition="background 0.2s"
              >
                <Text fontSize="xs" color="gray.400" fontFamily="mono">
                  {truncateAddress(address)}
                </Text>
                <IconButton
                  icon={hasCopied ? <CheckIcon /> : <CopyIcon />}
                  size="xs"
                  variant="ghost"
                  color={hasCopied ? 'green.400' : 'gray.400'}
                  aria-label="Copy address"
                  minW="auto"
                  h="auto"
                  p={0}
                />
              </HStack>
            </Tooltip>
          </VStack>
        </HStack>

        {/* Right: Action buttons */}
        <HStack spacing={2} flexShrink={0}>
          {canEdit && onEditProfileClick && (
            <>
              <Button
                size="sm"
                leftIcon={<EditIcon />}
                onClick={onEditProfileClick}
                bg="whiteAlpha.200"
                color="white"
                _hover={{ bg: 'whiteAlpha.300' }}
                display={{ base: 'none', md: 'inline-flex' }}
              >
                Edit profile
              </Button>
              <IconButton
                icon={<EditIcon />}
                isRound
                size="sm"
                aria-label="Edit profile"
                onClick={onEditProfileClick}
                bg="whiteAlpha.200"
                color="white"
                _hover={{ bg: 'whiteAlpha.300' }}
                display={{ base: 'inline-flex', md: 'none' }}
              />
            </>
          )}
          {isPasskeyUser ? (
            <PasskeyAccountInfo />
          ) : (
            <Box display={{ base: 'none', md: 'block' }}>
              <ConnectButton
                showBalance={false}
                chainStatus="icon"
                accountStatus="address"
              />
            </Box>
          )}

          <IconButton
            icon={<SettingsIcon />}
            isRound
            size="sm"
            aria-label="Account Settings"
            onClick={onSettingsClick}
            bg="whiteAlpha.200"
            color="white"
            _hover={{ bg: 'whiteAlpha.300' }}
          />

          {canApproveRequests && (
            <Button
              size="sm"
              colorScheme="teal"
              onClick={onExecutiveMenuClick}
            >
              Approvals & Roles
            </Button>
          )}
        </HStack>
      </HStack>

      {profileIncomplete && !nudgeDismissed && (
        <HStack
          mx={{ base: 3, md: 5 }}
          mb={{ base: 3, md: 4 }}
          px={{ base: 3, md: 4 }}
          py={2}
          borderRadius="lg"
          bg="whiteAlpha.100"
          borderWidth="1px"
          borderColor="amethyst.300"
          spacing={{ base: 2, md: 3 }}
          position="relative"
          zIndex={2}
        >
          <Text fontSize={{ base: "xs", md: "sm" }} color="white" flex={1} lineHeight="short">
            {!profileMetadata?.avatar && !profileMetadata?.bio
              ? 'Add a profile picture and bio so others can recognize you across the org.'
              : !profileMetadata?.avatar
                ? 'Add a profile picture so others can recognize you.'
                : 'Add a short bio so others know who you are.'}
          </Text>
          <Button
            size="xs"
            colorScheme="purple"
            onClick={onEditProfileClick}
            flexShrink={0}
          >
            Add now
          </Button>
          <CloseButton size="sm" onClick={dismissNudge} flexShrink={0} />
        </HStack>
      )}
    </Box>
  );
}

export default ProfileHeader;
