/**
 * VouchRequestCard - Card showing a user seeking vouches for a role
 * Displays user info, progress, voucher list, and action buttons
 */

import React from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Button,
  Avatar,
  Tooltip,
  Wrap,
  WrapItem,
  Icon,
} from '@chakra-ui/react';
import { FiUserPlus, FiUserMinus, FiCheck } from 'react-icons/fi';
import { VouchProgressBar } from './VouchProgressBar';

/**
 * Truncate an Ethereum address for display
 */
function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * VouchRequestCard component
 * @param {Object} props
 * @param {Object} props.request - Vouch request data (wearer, vouchers, vouchCount, quorum, etc.)
 * @param {boolean} props.hasUserVouched - Whether current user has already vouched
 * @param {boolean} props.canVouch - Whether current user can vouch (has membership hat)
 * @param {boolean} props.isVouching - Whether a vouch transaction is in progress
 * @param {boolean} props.isRevoking - Whether a revoke transaction is in progress
 * @param {boolean} props.isConnected - Whether wallet is connected
 * @param {Function} props.onVouch - Callback when vouch button is clicked
 * @param {Function} props.onRevokeVouch - Callback when revoke button is clicked
 */
export function VouchRequestCard({
  request,
  hasUserVouched = false,
  canVouch = false,
  isVouching = false,
  isRevoking = false,
  isConnected = true,
  onVouch,
  onRevokeVouch,
}) {
  const {
    wearer,
    wearerUsername,
    hatId,
    vouchers = [],
    vouchCount = 0,
    quorum = 1,
    roleName,
  } = request;

  const displayName = wearerUsername || truncateAddress(wearer);
  const isComplete = vouchCount >= quorum;

  // Determine button state and text
  const getButtonConfig = () => {
    if (!isConnected) {
      return {
        label: 'Connect Wallet',
        tooltip: 'Connect your wallet to vouch',
        disabled: true,
        isLoading: false,
        colorScheme: 'gray',
        icon: FiUserPlus,
        onClick: null,
      };
    }

    if (isComplete) {
      return {
        label: 'Quorum Reached',
        tooltip: 'This user has reached the required vouches',
        disabled: true,
        isLoading: false,
        colorScheme: 'green',
        icon: FiCheck,
        onClick: null,
      };
    }

    if (hasUserVouched) {
      return {
        label: 'Revoke Vouch',
        tooltip: 'Remove your vouch for this user',
        disabled: isRevoking,
        isLoading: isRevoking,
        colorScheme: 'red',
        variant: 'outline',
        icon: FiUserMinus,
        onClick: () => onRevokeVouch?.(wearer, hatId),
      };
    }

    if (!canVouch) {
      return {
        label: 'Cannot Vouch',
        tooltip: 'You don\'t have the required role to vouch for this position',
        disabled: true,
        isLoading: false,
        colorScheme: 'gray',
        icon: FiUserPlus,
        onClick: null,
      };
    }

    return {
      label: 'Vouch',
      tooltip: 'Vouch for this user to help them join',
      disabled: isVouching,
      isLoading: isVouching,
      colorScheme: 'purple',
      icon: FiUserPlus,
      onClick: () => onVouch?.(wearer, hatId),
    };
  };

  const buttonConfig = getButtonConfig();

  return (
    <Box
      bg="whiteAlpha.50"
      borderRadius="lg"
      p={4}
      border="1px solid"
      borderColor="whiteAlpha.100"
      _hover={{
        bg: 'whiteAlpha.100',
        borderColor: 'whiteAlpha.200',
      }}
      transition="all 0.2s"
    >
      <VStack spacing={3} align="stretch">
        {/* User Info Row */}
        <HStack justify="space-between" align="flex-start">
          <HStack spacing={3}>
            <Avatar
              size="sm"
              name={displayName}
              bg="purple.500"
            />
            <VStack align="start" spacing={0}>
              <Text color="white" fontWeight="medium" fontSize="sm">
                {displayName}
              </Text>
              {wearerUsername && (
                <Text color="gray.500" fontSize="xs">
                  {truncateAddress(wearer)}
                </Text>
              )}
            </VStack>
          </HStack>

          {/* Action Button */}
          <Tooltip label={buttonConfig.tooltip} placement="top">
            <Button
              size="sm"
              colorScheme={buttonConfig.colorScheme}
              variant={buttonConfig.variant || 'solid'}
              leftIcon={!buttonConfig.isLoading ? <Icon as={buttonConfig.icon} /> : undefined}
              isDisabled={buttonConfig.disabled}
              onClick={buttonConfig.onClick}
              isLoading={buttonConfig.isLoading}
              loadingText="Processing..."
            >
              {buttonConfig.label}
            </Button>
          </Tooltip>
        </HStack>

        {/* Progress Bar */}
        <VouchProgressBar
          current={vouchCount}
          quorum={quorum}
          size="sm"
        />

        {/* Voucher List */}
        {vouchers.length > 0 && (
          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>
              Vouched by:
            </Text>
            <Wrap spacing={1}>
              {vouchers.slice(0, 5).map((voucher, index) => (
                <WrapItem key={voucher.address || index}>
                  <Tooltip
                    label={voucher.username || truncateAddress(voucher.address)}
                    placement="top"
                  >
                    <Avatar
                      size="xs"
                      name={voucher.username || voucher.address}
                      bg="purple.600"
                    />
                  </Tooltip>
                </WrapItem>
              ))}
              {vouchers.length > 5 && (
                <WrapItem>
                  <Tooltip label={`${vouchers.length - 5} more vouchers`} placement="top">
                    <Box
                      bg="whiteAlpha.200"
                      borderRadius="full"
                      w={6}
                      h={6}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text fontSize="xs" color="gray.400">
                        +{vouchers.length - 5}
                      </Text>
                    </Box>
                  </Tooltip>
                </WrapItem>
              )}
            </Wrap>
          </Box>
        )}
      </VStack>
    </Box>
  );
}

export default VouchRequestCard;
