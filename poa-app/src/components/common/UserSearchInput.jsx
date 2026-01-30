/**
 * UserSearchInput - Reusable user search input component
 * Searches by username or wallet address with auto-detection
 */

import React from 'react';
import {
  Box,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  HStack,
  VStack,
  Text,
  Icon,
  Spinner,
  Avatar,
} from '@chakra-ui/react';
import { FiSearch, FiCheck, FiUserPlus } from 'react-icons/fi';
import { useUserSearch } from '@/hooks/useUserSearch';

/**
 * UserSearchInput component
 * @param {Object} props
 * @param {Function} props.onSelect - Callback when user is selected: ({ address, username }) => void
 * @param {string} props.placeholder - Input placeholder text
 * @param {boolean} props.disabled - Disable input
 * @param {string} props.size - Chakra size: 'sm' | 'md' | 'lg'
 */
export function UserSearchInput({
  onSelect,
  placeholder = 'Search by username or 0x address...',
  disabled = false,
  size = 'md',
}) {
  const {
    searchQuery,
    setSearchQuery,
    searchResult,
    isSearching,
    error,
    helperText,
    clear,
    truncateAddress,
  } = useUserSearch();

  const handleSelect = () => {
    if (searchResult && onSelect) {
      onSelect(searchResult);
      clear();
    }
  };

  return (
    <Box position="relative">
      <InputGroup size={size}>
        <InputLeftElement pointerEvents="none">
          <Icon as={FiSearch} color="gray.400" />
        </InputLeftElement>
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled}
          bg="whiteAlpha.50"
          border="1px solid"
          borderColor="whiteAlpha.200"
          color="white"
          _placeholder={{ color: 'gray.500' }}
          _hover={{ borderColor: 'whiteAlpha.300' }}
          _focus={{
            borderColor: 'purple.400',
            boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)',
          }}
        />
        <InputRightElement>
          {isSearching && <Spinner size="sm" color="purple.400" />}
          {!isSearching && searchResult && (
            <Icon as={FiCheck} color="green.400" />
          )}
        </InputRightElement>
      </InputGroup>

      {/* Results dropdown */}
      {searchResult && (
        <Box
          position="absolute"
          top="100%"
          left={0}
          right={0}
          mt={1}
          bg="gray.800"
          borderRadius="md"
          border="1px solid"
          borderColor="whiteAlpha.200"
          boxShadow="lg"
          zIndex={10}
          overflow="hidden"
        >
          <HStack
            p={3}
            cursor="pointer"
            _hover={{ bg: 'whiteAlpha.100' }}
            onClick={handleSelect}
            transition="background-color 0.2s"
          >
            <Avatar
              size="sm"
              name={searchResult.username || searchResult.address}
              bg="purple.500"
            />
            <VStack align="start" spacing={0} flex={1}>
              <Text color="white" fontSize="sm" fontWeight="medium">
                {searchResult.username || 'No username registered'}
              </Text>
              <Text color="gray.400" fontSize="xs">
                {truncateAddress(searchResult.address)}
              </Text>
            </VStack>
            <Icon as={FiUserPlus} color="purple.400" />
          </HStack>
        </Box>
      )}

      {/* Error message */}
      {error && (
        <Text color="red.400" fontSize="xs" mt={1}>
          {error}
        </Text>
      )}

      {/* Helper text */}
      {helperText && !error && (
        <Text color="gray.500" fontSize="xs" mt={1}>
          {helperText}
        </Text>
      )}
    </Box>
  );
}

export default UserSearchInput;
