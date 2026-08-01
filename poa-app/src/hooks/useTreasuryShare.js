/**
 * useTreasuryShare - Calculates the user's proportional share of treasury stablecoin balances.
 *
 * Fetches ERC20 balances held by the payment manager contract, sums ONLY the USD-pegged
 * stablecoins (token.isStable) as USD, and multiplies by (userPTBalance / totalPTSupply)
 * to get the user's share. Tokens without a dollar peg are never treated as $1.
 *
 * Returns:
 *   treasuryShare - user's proportional USD share (null until fetched / when hidden)
 *   stableTotal   - total treasury stablecoin balance in USD (null until fetched / when hidden)
 *   userSharePct  - userPT / totalPT (0..1)
 *
 * Returns null for treasuryShare when the org has treasury hidden.
 */

import { useState, useEffect, useCallback } from 'react';
import { usePOContext } from '../context/POContext';
import { useUserContext } from '../context/UserContext';
import { useRefreshSubscription, RefreshEvent } from '../context/RefreshContext';
import { getBountyTokenOptions } from '../util/tokens';
import { createChainClients } from '../services/web3/utils/chainClients';

const BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

export function useTreasuryShare() {
  const { paymentManagerAddress, orgChainId, ptTokenBalance, hideTreasury } = usePOContext();
  const { userData } = useUserContext();

  const [totalStablecoinBalance, setTotalStablecoinBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!paymentManagerAddress || !orgChainId) return;

    const tokens = getBountyTokenOptions(orgChainId);
    if (tokens.length === 0) return;

    // Only USD-pegged stablecoins count toward the treasury's USD figure.
    const stableTokens = tokens.filter((t) => t.isStable);

    const clients = createChainClients(orgChainId);
    const client = clients?.publicClient;
    if (!client) return;

    setIsLoading(true);
    try {
      const balances = await Promise.all(
        stableTokens.map(async (token) => {
          try {
            const balance = await client.readContract({
              address: token.address,
              abi: BALANCE_OF_ABI,
              functionName: 'balanceOf',
              args: [paymentManagerAddress],
            });
            return Number(balance) / Math.pow(10, token.decimals);
          } catch {
            return 0;
          }
        })
      );
      setTotalStablecoinBalance(balances.reduce((sum, b) => sum + b, 0));
      setHasFetched(true);
    } catch (e) {
      console.error('Failed to fetch treasury balances for share calc:', e);
    } finally {
      setIsLoading(false);
    }
  }, [paymentManagerAddress, orgChainId]);

  useEffect(() => {
    if (!hideTreasury && paymentManagerAddress && orgChainId) {
      fetchBalances();
    }
  }, [hideTreasury, paymentManagerAddress, orgChainId, fetchBalances]);

  // Deposits and claims change these balances — refetch when they land.
  useRefreshSubscription(RefreshEvent.TREASURY_DEPOSITED, () => {
    if (!hideTreasury) fetchBalances();
  }, [fetchBalances, hideTreasury]);

  if (hideTreasury) {
    return {
      treasuryShare: null, stableTotal: null, userSharePct: 0,
      userPtBalance: 0, totalPtSupply: 0, isLoading: false, isHidden: true,
    };
  }

  const userBalance = Number(userData?.participationTokenBalance) || 0;
  const totalSupply = Number(ptTokenBalance) || 0;
  const userSharePct = totalSupply > 0 ? userBalance / totalSupply : 0;
  const treasuryShare = hasFetched ? userSharePct * totalStablecoinBalance : null;

  return {
    treasuryShare,
    stableTotal: hasFetched ? totalStablecoinBalance : null,
    userSharePct,
    userPtBalance: userBalance,
    totalPtSupply: totalSupply,
    isLoading: isLoading || !hasFetched,
    isHidden: false,
  };
}

export default useTreasuryShare;
