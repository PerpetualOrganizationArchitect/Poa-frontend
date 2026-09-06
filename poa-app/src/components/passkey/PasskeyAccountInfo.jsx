/**
 * PasskeyAccountInfo
 * Header display for passkey-authenticated users.
 * Shows fingerprint icon with disconnect dropdown.
 */

import {
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Icon,
} from '@chakra-ui/react';
import { FaFingerprint, FaSignOutAlt } from 'react-icons/fa';
import { useAuth } from '@/context/AuthContext';

export default function PasskeyAccountInfo() {
  const { accountAddress, forgetPasskey, isPasskeyUser } = useAuth();

  if (!isPasskeyUser || !accountAddress) return null;

  return (
    <Menu placement="bottom-end">
      <MenuButton
        as={IconButton}
        icon={<Icon as={FaFingerprint} color="amethyst.500" boxSize={5} />}
        size="sm"
        variant="outline"
        borderRadius="full"
        borderColor="amethyst.300"
        bg="rgba(255, 255, 255, 0.8)"
        _hover={{ bg: 'rgba(255, 255, 255, 0.95)', borderColor: 'amethyst.400' }}
        _active={{ bg: 'white' }}
        aria-label="Passkey account menu"
      />
      <MenuList
        borderRadius="xl"
        boxShadow="xl"
        minW="180px"
        p={1}
        bg="gray.900"
        borderColor="whiteAlpha.300"
      >
        <MenuItem
          onClick={forgetPasskey}
          icon={<Icon as={FaSignOutAlt} color="red.300" />}
          borderRadius="md"
          bg="transparent"
          _hover={{ bg: 'red.900' }}
          fontSize="sm"
          fontWeight="500"
          color="red.200"
        >
          Disconnect Passkey
        </MenuItem>
      </MenuList>
    </Menu>
  );
}
