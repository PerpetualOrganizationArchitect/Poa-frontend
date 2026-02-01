/**
 * ProfileHeader - User identity header for the profile hub
 * Redesigned with cleaner visual hierarchy
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
  Divider,
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

      {/* Content */}
      <VStack
        spacing={4}
        align="stretch"
        p={{ base: 5, md: 6 }}
        position="relative"
      >
        {/* Top section: Avatar + User Info */}
        <HStack spacing={{ base: 4, md: 6 }} align="flex-start">
          <Avatar
            size={{ base: 'xl', md: '2xl' }}
            name={username || address}
            bg="purple.500"
            color="white"
            boxShadow="lg"
          />
          <VStack align="start" spacing={2} flex={1}>
            {/* Username */}
            <Text
              fontSize={{ base: '2xl', md: '4xl' }}
              fontWeight="bold"
              color="white"
              lineHeight="1.1"
            >
              {username || 'Anonymous'}
            </Text>

            {/* Status Badge */}
            {memberStatus && (
              <Badge
                colorScheme={memberStatus === 'Active' ? 'green' : 'gray'}
                fontSize={{ base: 'sm', md: 'md' }}
                px={3}
                py={1}
                borderRadius="full"
              >
                {memberStatus}
              </Badge>
            )}

            {/* Address with copy */}
            <Tooltip label={hasCopied ? 'Copied!' : 'Click to copy address'}>
              <HStack
                spacing={2}
                cursor="pointer"
                onClick={onCopy}
                _hover={{ bg: 'whiteAlpha.100' }}
                borderRadius="md"
                px={2}
                py={1}
                ml={-2}
                transition="background 0.2s"
              >
                <Text fontSize="sm" color="gray.400" fontFamily="mono">
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

        {/* Divider */}
        <Divider borderColor="whiteAlpha.200" />

        {/* Bottom section: Action buttons */}
        <HStack
          spacing={3}
          flexWrap="wrap"
          justify={{ base: 'center', md: 'flex-start' }}
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
            size="md"
            aria-label="Account Settings"
            onClick={onSettingsClick}
            bg="whiteAlpha.200"
            color="white"
            _hover={{ bg: 'whiteAlpha.300' }}
          />

          {isExec && (
            <Button
              size="md"
              colorScheme="teal"
              onClick={onExecutiveMenuClick}
            >
              Executive Menu
            </Button>
          )}
        </HStack>
      </VStack>
    </Box>
  );
}

export default ProfileHeader;
