/**
 * useGlobalAccount Hook
 * Provides global account state (username, account existence) independent of organization context.
 * Uses the UniversalAccountRegistry subgraph data.
 */

import { useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { useAccount } from 'wagmi';
import { FETCH_USERNAME_NEW } from '@/util/queries';
import { useRefresh } from '@/context/RefreshContext';

/**
 * Hook to check if the connected wallet has a registered account
 * @returns {Object} Account state
 * @returns {string|null} globalUsername - The registered username or null
 * @returns {boolean} hasAccount - Whether the wallet has a registered account
 * @returns {boolean} isLoading - Whether the query is loading
 * @returns {Function} refetchAccount - Function to manually refetch account data
 */
export function useGlobalAccount() {
  const { address } = useAccount();
  const { subscribe } = useRefresh();

  const { data, loading, refetch } = useQuery(FETCH_USERNAME_NEW, {
    variables: { id: address?.toLowerCase() },
    skip: !address,
    fetchPolicy: 'cache-and-network',
  });

  // Subscribe to refresh events to update when account is created/changed
  useEffect(() => {
    if (!subscribe) return;

    const unsub1 = subscribe('user:created', () => {
      setTimeout(() => refetch(), 1500);
    });
    const unsub2 = subscribe('user:username_changed', () => {
      setTimeout(() => refetch(), 1500);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [subscribe, refetch]);

  const username = data?.account?.username || null;

  return {
    globalUsername: username,
    hasAccount: !!username,
    isLoading: loading,
    refetchAccount: refetch,
  };
}

export default useGlobalAccount;
