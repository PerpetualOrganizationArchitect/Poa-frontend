/**
 * ProfileHeader - User identity header for the profile hub
 * Compact design with action buttons on the right
 */

import React from 'react';
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
} from '@chakra-ui/react';
import { SettingsIcon, CopyIcon, CheckIcon } from '@chakra-ui/icons';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { truncateAddress } from '@/utils/profileUtils';

/**
 * ProfileHeader component
 * @param {Object} props
 * @param {string} props.username - User's display name
 * @param {string} props.address - User's wallet address
 * @param {Object[]} props.userRoles - Array of user's roles with name property
 * @param {boolean} props.isExec - Whether user has executive role
 * @param {() => void} props.onSettingsClick - Settings button handler
 * @param {() => void} props.onExecutiveMenuClick - Executive menu handler
 */
export function ProfileHeader({
  username,
  address,
  userRoles = [],
  isExec,
  onSettingsClick,
  onExecutiveMenuClick,
}) {
  const { hasCopied, onCopy } = useClipboard(address || '');

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
          <Box display={{ base: 'none', md: 'block' }}>
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus="address"
            />
          </Box>

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

          {isExec && (
            <Button
              size="sm"
              colorScheme="teal"
              onClick={onExecutiveMenuClick}
            >
              Executive Menu
            </Button>
          )}
        </HStack>
      </HStack>
    </Box>
  );
}

export default ProfileHeader;
