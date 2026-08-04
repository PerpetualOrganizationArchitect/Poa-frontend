/**
 * UserSearchInput - Reusable user search input component
 * Searches by partial username or wallet address with auto-detection, and shows
 * a dropdown list of matching users (autocomplete style).
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
} from '@chakra-ui/react';
import { FiSearch, FiUserPlus } from 'react-icons/fi';
import PulseLoader from "@/components/shared/PulseLoader";
import { useUserSearch } from '@/hooks/useUserSearch';
import UserIdentity from '@/components/common/UserIdentity';

/**
 * Color tokens per visual context. The component renders on dark surfaces
 * (e.g. the Add Task modal) by default; pass variant="light" when it sits on a
 * light/white card (e.g. the vouching panel) so typed text stays legible.
 */
const VARIANTS = {
  dark: {
    inputBg: 'whiteAlpha.50',
    inputColor: 'white',
    inputBorder: 'whiteAlpha.200',
    inputHoverBorder: 'whiteAlpha.300',
    placeholder: 'gray.500',
    searchIcon: 'gray.400',
    dropdownBg: 'gray.800',
    dropdownBorder: 'whiteAlpha.200',
    itemHoverBg: 'whiteAlpha.100',
    primaryText: 'white',
    secondaryText: 'gray.400',
    helperText: 'gray.500',
  },
  light: {
    inputBg: 'white',
    inputColor: 'warmGray.900',
    inputBorder: 'warmGray.200',
    inputHoverBorder: 'warmGray.300',
    placeholder: 'warmGray.400',
    searchIcon: 'warmGray.400',
    dropdownBg: 'white',
    dropdownBorder: 'warmGray.200',
    itemHoverBg: 'warmGray.50',
    primaryText: 'warmGray.900',
    secondaryText: 'warmGray.500',
    helperText: 'warmGray.500',
  },
};

/**
 * Where the results list sits relative to the input.
 *
 * 'overlay' floats it over whatever follows — right for modals and panels.
 * 'inline' keeps it in normal flow so the container grows instead. Required
 * inside a Chakra `Collapse` (e.g. the deployer's Advanced Settings), which
 * keeps `overflow: hidden` even when fully open and would otherwise slice the
 * dropdown off at the container's edge.
 */
const PLACEMENTS = {
  overlay: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    mt: 1,
    zIndex: 20,
    boxShadow: 'lg',
  },
  inline: {
    position: 'static',
    mt: 2,
    boxShadow: 'sm',
  },
};

/**
 * UserSearchInput component
 * @param {Object} props
 * @param {Function} props.onSelect - Callback when user is selected: ({ address, username }) => void
 * @param {string} props.placeholder - Input placeholder text
 * @param {boolean} props.disabled - Disable input
 * @param {string} props.size - Chakra size: 'sm' | 'md' | 'lg'
 * @param {'dark'|'light'} props.variant - Color scheme for the surface it sits on (default 'dark')
 * @param {'overlay'|'inline'} props.resultsPlacement - How the results list is positioned (default 'overlay')
 */
export function UserSearchInput({
  onSelect,
  placeholder = 'Search by username or 0x address...',
  disabled = false,
  size = 'md',
  variant = 'dark',
  resultsPlacement = 'overlay',
}) {
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    error,
    helperText,
    clear,
    truncateAddress,
  } = useUserSearch();

  const styles = VARIANTS[variant] || VARIANTS.dark;
  const placement = PLACEMENTS[resultsPlacement] || PLACEMENTS.overlay;

  const handleSelect = (result) => {
    if (result && onSelect) {
      onSelect(result);
      clear();
    }
  };

  return (
    <Box position="relative">
      <InputGroup size={size}>
        <InputLeftElement pointerEvents="none">
          <Icon as={FiSearch} color={styles.searchIcon} />
        </InputLeftElement>
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled}
          bg={styles.inputBg}
          border="1px solid"
          borderColor={styles.inputBorder}
          color={styles.inputColor}
          _placeholder={{ color: styles.placeholder }}
          _hover={{ borderColor: styles.inputHoverBorder }}
          _focus={{
            borderColor: 'purple.400',
            boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)',
          }}
        />
        <InputRightElement>
          {isSearching && <PulseLoader size="sm" color="purple.400" />}
        </InputRightElement>
      </InputGroup>

      {/* Results dropdown */}
      {searchResults.length > 0 && (
        <Box
          {...placement}
          bg={styles.dropdownBg}
          borderRadius="md"
          border="1px solid"
          borderColor={styles.dropdownBorder}
          overflow="hidden"
          maxH="260px"
          overflowY="auto"
        >
          {searchResults.map((result) => (
            <HStack
              key={result.address}
              data-testid="user-search-result"
              p={3}
              cursor="pointer"
              _hover={{ bg: styles.itemHoverBg }}
              onClick={() => handleSelect(result)}
              transition="background-color 0.2s"
            >
              <UserIdentity
                address={result.address}
                usernameHint={result.username}
                size="sm"
                showName={false}
                link={false}
              />
              <VStack align="start" spacing={0} flex={1} minW={0}>
                <Text color={styles.primaryText} fontSize="sm" fontWeight="medium" noOfLines={1}>
                  {result.username || 'No username registered'}
                </Text>
                <Text color={styles.secondaryText} fontSize="xs" fontFamily="mono">
                  {truncateAddress(result.address)}
                </Text>
              </VStack>
              <Icon as={FiUserPlus} color="purple.400" />
            </HStack>
          ))}
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
        <Text color={styles.helperText} fontSize="xs" mt={1}>
          {helperText}
        </Text>
      )}
    </Box>
  );
}

export default UserSearchInput;
