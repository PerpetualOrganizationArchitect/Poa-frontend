/**
 * useUserSearch Hook
 * Reusable hook for searching users by username or wallet address
 * Auto-detects input type and performs debounced searches
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import apolloClient from '@/util/apolloClient';
import { FETCH_USERNAME_NEW, GET_ACCOUNT_BY_USERNAME } from '@/util/queries';

// Username validation regex (alphanumeric + underscore, 3-32 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const MIN_USERNAME_LENGTH = 3;

// Address validation regex (0x followed by 40 hex chars)
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Detect input type (username or address)
 * @param {string} input - The search input
 * @returns {'username' | 'address' | null}
 */
function detectInputType(input) {
  if (!input || input.trim().length === 0) return null;

  const trimmed = input.trim();

  // Check if it's an Ethereum address
  if (ADDRESS_REGEX.test(trimmed)) {
    return 'address';
  }

  // Check if it could be a username (alphanumeric + underscore, 3+ chars)
  if (USERNAME_REGEX.test(trimmed) && trimmed.length >= MIN_USERNAME_LENGTH) {
    return 'username';
  }

  return null;
}

/**
 * Truncate an Ethereum address for display
 * @param {string} address
 * @returns {string}
 */
function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Hook to search for users by username or wallet address
 * @param {Object} options - Hook options
 * @param {number} options.debounceMs - Debounce delay in ms (default: 500)
 * @returns {Object} Search state and utilities
 */
export function useUserSearch({ debounceMs = 500 } = {}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);

  // Detect input type (memoized)
  const inputType = useMemo(() => detectInputType(searchQuery), [searchQuery]);

  // Debounced search effect
  useEffect(() => {
    // Clear results if no valid input
    if (!inputType) {
      setSearchResult(null);
      setError(null);
      setIsSearching(false);
      return;
    }

    // Start searching indicator immediately for UX
    setIsSearching(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        if (inputType === 'address') {
          // Search by address - get username if exists
          const { data } = await apolloClient.query({
            query: FETCH_USERNAME_NEW,
            variables: { id: searchQuery.trim().toLowerCase() },
            fetchPolicy: 'network-only',
          });

          // Address is always valid for vouching, even without username
          setSearchResult({
            address: searchQuery.trim().toLowerCase(),
            username: data?.account?.username || null,
          });
          setError(null);
        } else {
          // Search by username - find the address
          const { data } = await apolloClient.query({
            query: GET_ACCOUNT_BY_USERNAME,
            variables: { username: searchQuery.trim().toLowerCase() },
            fetchPolicy: 'network-only',
          });

          const account = data?.accounts?.[0];
          if (account) {
            setSearchResult({
              address: account.id,
              username: account.username,
            });
            setError(null);
          } else {
            setSearchResult(null);
            setError('Username not found');
          }
        }
      } catch (err) {
        console.error('[useUserSearch] Search failed:', err);
        setSearchResult(null);
        setError('Search failed. Please try again.');
      } finally {
        setIsSearching(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchQuery, inputType, debounceMs]);

  // Clear function
  const clear = useCallback(() => {
    setSearchQuery('');
    setSearchResult(null);
    setError(null);
    setIsSearching(false);
  }, []);

  // Helper text based on current state
  const helperText = useMemo(() => {
    if (error) return null; // Error shown separately
    if (searchResult) return null; // Result shown separately
    if (isSearching) return 'Searching...';
    if (searchQuery && !inputType) {
      return 'Enter a username (3+ chars) or wallet address (0x...)';
    }
    return null;
  }, [searchQuery, inputType, isSearching, error, searchResult]);

  return {
    // Input state
    searchQuery,
    setSearchQuery,

    // Result state
    searchResult,
    isSearching,
    error,

    // Validation
    isValidInput: inputType !== null,
    inputType,

    // Utilities
    clear,
    helperText,
    truncateAddress,
  };
}

export default useUserSearch;
