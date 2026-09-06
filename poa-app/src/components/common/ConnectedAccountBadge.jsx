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
import useUnifiedDisconnect from '@/hooks/useUnifiedDisconnect';

const formatShortAddress = (address) =>
  `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

export default function ConnectedAccountBadge() {
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

  if (!isAuthenticated) return null;

  const displayAddress = isPasskeyUser ? accountAddress : eoaAddress;
  if (!displayAddress) return null;

  const label = isPasskeyUser
    ? `Passkey Account: ${formatShortAddress(displayAddress)}`
    : `Wallet Connected: ${formatShortAddress(displayAddress)}`;

  return (
    <Box
      p={{ base: 3, md: 4 }}
      borderRadius="lg"
      bg={successBg}
      borderWidth="1px"
      borderColor={successBorderColor}
    >
      <Flex align="center" flexWrap="wrap" gap={2}>
        <Icon
          as={isPasskeyUser ? FaFingerprint : FaCheck}
          color="green.500"
          boxSize={{ base: 4, md: 5 }}
        />
        <Text color={textColor} fontWeight="medium" fontSize={{ base: 'sm', md: 'md' }}>
          {label}
        </Text>
        <Spacer />
        <Button
          size="xs"
          variant="ghost"
          colorScheme="red"
          leftIcon={<Icon as={FaSignOutAlt} />}
          onClick={handleDisconnect}
        >
          Disconnect
        </Button>
      </Flex>
    </Box>
  );
}
