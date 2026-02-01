/**
 * ProfileHeader - Consolidated user identity header for the profile hub
 * Shows avatar, username, member status, wallet connection, and action buttons
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
  Flex,
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
 * @param {string} props.memberStatus - Membership status (Active, etc.)
 * @param {boolean} props.isExec - Whether user has executive role
 * @param {() => void} props.onSettingsClick - Settings button handler
 * @param {() => void} props.onExecutiveMenuClick - Executive menu handler
 */
export function ProfileHeader({
  username,
  address,
  memberStatus,
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

      {/* Darker header section with user info */}
      <VStack position="relative" borderTopRadius="2xl" align="stretch" pb={2}>
        <div style={glassLayerStyle} />

        <Flex
          justify="space-between"
          align={{ base: 'stretch', md: 'center' }}
          flexDir={{ base: 'column', md: 'row' }}
          gap={{ base: 4, md: 0 }}
          p={{ base: 4, md: 5 }}
        >
          {/* Left side: Avatar + User Info */}
          <HStack spacing={4}>
            <Avatar
              size={{ base: 'lg', md: 'xl' }}
              name={username || address}
              bg="purple.500"
              color="white"
            />
            <VStack align="start" spacing={0}>
              <HStack spacing={2} flexWrap="wrap">
                <Text
                  fontSize={{ base: '2xl', md: '3xl' }}
                  fontWeight="extrabold"
                  color="white"
                >
                  {username || 'Anonymous'}
                </Text>
                {memberStatus && (
                  <Badge
                    colorScheme={memberStatus === 'Active' ? 'green' : 'gray'}
                    fontSize="sm"
                    px={2}
                    py={0.5}
                    borderRadius="md"
                  >
                    {memberStatus}
                  </Badge>
                )}
              </HStack>
              <Tooltip label={hasCopied ? 'Copied!' : 'Click to copy address'}>
                <HStack
                  spacing={1}
                  cursor="pointer"
                  onClick={onCopy}
                  _hover={{ color: 'gray.300' }}
                >
                  <Text fontSize="sm" color="gray.400">
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

          {/* Right side: Actions */}
          <HStack
            spacing={3}
            justify={{ base: 'flex-start', md: 'flex-end' }}
            flexWrap="wrap"
          >
            <Box>
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
        </Flex>
      </VStack>
    </Box>
  );
}

export default ProfileHeader;
