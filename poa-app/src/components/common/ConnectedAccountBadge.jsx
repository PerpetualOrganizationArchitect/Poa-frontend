import {
  Box,
  Flex,
  Icon,
  Text,
  Button,
  Spacer,
  useColorModeValue,
} from '@chakra-ui/react';
import { FaFingerprint, FaCheck, FaSignOutAlt } from 'react-icons/fa';
import { useAccount } from 'wagmi';
import { useAuth } from '@/context/AuthContext';
import useOnboardingColors from '@/components/shared/useOnboardingColors';
import useUnifiedDisconnect from '@/hooks/useUnifiedDisconnect';

const formatShortAddress = (address) =>
  `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

export default function ConnectedAccountBadge({ variant, username }) {
  const { accountAddress, isPasskeyUser, isAuthenticated } = useAuth();
  const { address: eoaAddress } = useAccount();
  // Was `signOut(); if (isEOAUser) disconnect();` — right order, but a bare
  // disconnect() drops only the current connector, so a second live connection
  // was promoted and this badge kept showing an address. Same rules as the
  // account menu now.
  const handleDisconnect = useUnifiedDisconnect();

  const successBg = useColorModeValue('green.50', 'green.900');
  const successBorderColor = useColorModeValue('green.200', 'green.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const joinColors = useOnboardingColors();
  const isJoin = variant === 'join';

  if (!isAuthenticated) return null;

  const displayAddress = isPasskeyUser ? accountAddress : eoaAddress;
  if (!displayAddress) return null;

  const label = isPasskeyUser
    ? `Passkey Account: ${formatShortAddress(displayAddress)}`
    : `Wallet Connected: ${formatShortAddress(displayAddress)}`;

  return (
    <Box
      p={isJoin ? 3 : { base: 3, md: 4 }}
      borderRadius="lg"
      bg={isJoin ? joinColors.soft : successBg}
      borderWidth={isJoin ? '0' : '1px'}
      borderColor={successBorderColor}
    >
      <Flex align="center" flexWrap="wrap" gap={2}>
        <Icon
          as={isJoin ? FaCheck : isPasskeyUser ? FaFingerprint : FaCheck}
          color={isJoin ? joinColors.muted : 'green.500'}
          boxSize={isJoin ? 3 : { base: 4, md: 5 }}
        />
        <Text color={isJoin ? joinColors.ink : textColor} fontWeight="medium" fontSize={isJoin ? 'xs' : { base: 'sm', md: 'md' }} title={isJoin ? displayAddress : undefined} overflowWrap="anywhere">
          {isJoin ? (username ? `Signed in as ${username}` : 'You’re signed in') : label}
        </Text>
        <Spacer />
        <Button
          size="xs"
          variant="ghost"
          colorScheme={isJoin ? undefined : 'red'}
          leftIcon={<Icon as={FaSignOutAlt} />}
          onClick={handleDisconnect}
          minH={isJoin ? '32px' : undefined}
          {...(isJoin ? { color: joinColors.muted, _hover: { color: joinColors.ink, bg: joinColors.line }, _focusVisible: { boxShadow: joinColors.focusRing } } : {})}
        >
          {isJoin ? 'Sign out' : 'Disconnect'}
        </Button>
      </Flex>
    </Box>
  );
}
