/**
 * useOrgPotBalances — how much of one asset each of the org's money pots holds, live.
 *
 * The three pots (see lib/voting/treasuryBatches for why there are three):
 *   • executor       — the account a passed proposal spends from directly
 *   • paymentManager — "In the treasury" on /treasury; spendable only via `withdraw` by vote.
 *                      Also returns its distributions, because committed-but-unfinalized rounds
 *                      pin the balance (`treasuryBatches.paymentManagerAvailability`).
 *   • bountyPool     — the TaskManager's balance, what completed tasks pay their rewards from
 *
 * Reads go through the org chain's public client (the same read path DepositModal, TreasuryPage
 * and useTokenBalances use) — never the wallet provider, which may sit on another chain.
 *
 * `token` is an ERC20 address or '' for the native currency. Returns base-unit decimal strings.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAddress } from 'viem';
import { usePOContext } from '@/context/POContext';
import { RefreshEvent, useRefreshSubscription } from '@/context/RefreshContext';
import { createPublicClientForChain } from '@/services/web3/utils/chainClients';
import PaymentManagerABI from '../../abi/PaymentManager.json';

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

/** A runaway distribution counter must not turn one modal open into hundreds of eth_calls. */
const MAX_DISTRIBUTIONS_READ = 50;

const isNative = (token) => !token || String(token).toLowerCase() === '0x0000000000000000000000000000000000000000';

/**
 * Config addresses are not all checksummed (networks.js ships the Gnosis USDC entry with a
 * broken casing) and viem REJECTS a mixed-case address whose checksum is wrong instead of fixing
 * it. Lowercasing first makes `getAddress` re-derive the checksum. Same rule as
 * `treasuryBatches.checksum`.
 */
const checksum = (address) => getAddress(String(address).toLowerCase());

const EMPTY = Object.freeze({
  executor: '0',
  paymentManager: '0',
  bountyPool: '0',
  distributions: [],
  distributionsTruncated: false,
});

async function readBalance(client, token, holder) {
  if (!holder) return '0';
  const who = checksum(holder);
  if (isNative(token)) {
    const bal = await client.getBalance({ address: who });
    return bal.toString();
  }
  const bal = await client.readContract({
    address: checksum(token),
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [who],
  });
  return bal.toString();
}

/**
 * viem returns named outputs as an object and unnamed ones as an array — accept both. The
 * positional order is the ABI's: (payoutToken, totalAmount, checkpointBlock, merkleRoot,
 * totalClaimed, finalized) — note totalClaimed comes AFTER the merkle root.
 */
function normalizeDistribution(id, raw) {
  const r = raw || {};
  const pick = (name, idx) => (r[name] !== undefined ? r[name] : r[idx]);
  return {
    id: String(id),
    payoutToken: String(pick('payoutToken', 0) || ''),
    totalAmount: String(pick('totalAmount', 1) ?? '0'),
    checkpointBlock: String(pick('checkpointBlock', 2) ?? '0'),
    totalClaimed: String(pick('totalClaimed', 4) ?? '0'),
    finalized: Boolean(pick('finalized', 5)),
  };
}

async function readDistributions(client, paymentManager) {
  if (!paymentManager) return [];
  const pm = checksum(paymentManager);
  const counter = Number(await client.readContract({
    address: pm,
    abi: PaymentManagerABI,
    functionName: 'distributionCounter',
  }));
  // Ids are 1-based. Read the NEWEST rounds: those are the ones still likely to be unfinalized
  // (and therefore still pinning the balance); the oldest are the ones most likely closed.
  const first = Math.max(1, counter - MAX_DISTRIBUTIONS_READ + 1);
  const ids = Array.from({ length: Math.max(0, counter - first + 1) }, (_, i) => first + i);
  const rows = await Promise.all(ids.map((id) =>
    client.readContract({
      address: pm,
      abi: PaymentManagerABI,
      functionName: 'getDistribution',
      args: [BigInt(id)],
    }).then((raw) => normalizeDistribution(id, raw)).catch(() => null)
  ));
  return { rows: rows.filter(Boolean), truncated: counter > ids.length };
}

/**
 * @param {object} opts
 * @param {string} [opts.token] - ERC20 address or '' for native
 * @param {boolean} [opts.enabled=true] - skip all reads (e.g. while the modal is closed)
 */
export function useOrgPotBalances({ token = '', enabled = true } = {}) {
  const {
    orgChainId,
    executorContractAddress,
    paymentManagerAddress,
    taskManagerContractAddress,
  } = usePOContext();

  const [state, setState] = useState({ loading: false, error: null, data: EMPTY });

  const fetchAll = useCallback(async (signal) => {
    if (!enabled || !orgChainId) return;
    const client = createPublicClientForChain(orgChainId);
    if (!client) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    // Settle every read independently: one failing pot must not blank the other three, and a
    // failure is reported as `error` (the wizard then refuses to guess) rather than as "0".
    const settled = await Promise.allSettled([
      readBalance(client, token, executorContractAddress),
      readBalance(client, token, paymentManagerAddress),
      readBalance(client, token, taskManagerContractAddress),
      readDistributions(client, paymentManagerAddress),
    ]);
    if (signal?.cancelled) return;
    const failures = settled.filter((r) => r.status === 'rejected').map((r) => r.reason);
    if (failures.length > 0) console.error('[useOrgPotBalances] read failed:', failures[0]);
    const value = (i, fallback) => (settled[i].status === 'fulfilled' ? settled[i].value : fallback);
    const dist = value(3, { rows: [], truncated: false });
    setState({
      loading: false,
      error: failures.length > 0 ? failures[0] : null,
      data: {
        executor: value(0, '0'),
        paymentManager: value(1, '0'),
        bountyPool: value(2, '0'),
        distributions: dist.rows,
        distributionsTruncated: Boolean(dist.truncated),
      },
    });
  }, [enabled, orgChainId, token, executorContractAddress, paymentManagerAddress, taskManagerContractAddress]);

  useEffect(() => {
    const signal = { cancelled: false };
    fetchAll(signal);
    return () => { signal.cancelled = true; };
  }, [fetchAll]);

  // A deposit or an executed proposal changes what the pots hold.
  useRefreshSubscription(
    [RefreshEvent.TREASURY_DEPOSITED, RefreshEvent.PROPOSAL_COMPLETED],
    () => { fetchAll({ cancelled: false }); },
    [fetchAll]
  );

  return useMemo(() => ({
    ...state.data,
    loading: state.loading,
    error: state.error,
    addresses: {
      executor: executorContractAddress || '',
      paymentManager: paymentManagerAddress || '',
      bountyPool: taskManagerContractAddress || '',
    },
    refetch: () => fetchAll({ cancelled: false }),
  }), [state, executorContractAddress, paymentManagerAddress, taskManagerContractAddress, fetchAll]);
}

export default useOrgPotBalances;
