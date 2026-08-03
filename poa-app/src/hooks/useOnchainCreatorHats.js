/**
 * useOnchainCreatorHats
 *
 * Reads the creator / voting hats straight from the voting + task-manager
 * contracts, for the org permissions matrix.
 *
 * Why: HybridVoting / DirectDemocracyVoting seed their creator hats (and DDV its
 * voting hats) inside initialize() WITHOUT emitting events, so the subgraph can't
 * index them (see poa-box/POP#171). TaskManager's project-creator hats are only
 * exposed via a lens call, not indexed cleanly either. Until those contract
 * events land + a re-sync, we read them on-chain so the matrix shows the real
 * creators now — at the CURRENT block, which any RPC serves (no archive node, no
 * subgraph dependency).
 *
 * Mirrors useTaskManagerV4State: a chain-specific public client (works for
 * unauthenticated visitors), a sequence guard so an org-switch mid-load can't
 * apply stale data, and per-call error isolation so one reverting getter never
 * blanks the others.
 *
 * Returns HatPermission-shaped rows ({ hatId, contractType, permissionRole,
 * allowed }) to merge additively into useOrgStructure's matrix, plus `loading`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeAbiParameters } from 'viem';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import { createChainClients } from '@/services/web3/utils/chainClients';
import HybridVotingABI from '../../abi/HybridVotingNew.json';
import DirectDemocracyVotingABI from '../../abi/DirectDemocracyVotingNew.json';
import TaskManagerABI from '../../abi/TaskManagerNew.json';
import EducationHubABI from '../../abi/EducationHubNew.json';

// TaskManager getLensData key for the project-creator hat array (CreatorHats).
const TM_CREATOR_HATS_LENS_KEY = 5;

// Session cache of resolved rows per input set. Creator/voting hats change
// only via governance, so serving the last successful read synchronously on
// remount removes the enabled→disabled first-paint flicker on gates that
// consume these rows (useVoteCreateGate); a background refresh still runs.
const rowsCache = new Map();
const cacheKey = ({ hybridVoting, directDemocracyVoting, taskManager, educationHub, chainId }) =>
  `${chainId}:${hybridVoting || ''}:${directDemocracyVoting || ''}:${taskManager || ''}:${educationHub || ''}`;

// Read a `uint256[]` view getter, normalising to decimal-string hat ids (the
// same format the subgraph uses). Returns [] on revert / missing function so a
// single bad call never blocks the others.
async function readHatArray(publicClient, address, abi, functionName) {
  try {
    const res = await publicClient.readContract({ address, abi, functionName });
    return (res || []).map((id) => id.toString());
  } catch (e) {
    return [];
  }
}

// Read the TaskManager creator hats via the lens (the deployed contract has no
// direct creatorHats() getter — it reverts — so we decode getLensData(5)).
async function readLensHatArray(publicClient, address, key) {
  try {
    const raw = await publicClient.readContract({
      address,
      abi: TaskManagerABI,
      functionName: 'getLensData',
      args: [key, '0x'],
    });
    const [ids] = decodeAbiParameters([{ type: 'uint256[]' }], raw);
    return ids.map((id) => id.toString());
  } catch (e) {
    return [];
  }
}

export function useOnchainCreatorHats({
  hybridVoting,
  directDemocracyVoting,
  taskManager,
  educationHub,
  chainId,
}) {
  const [rows, setRows] = useState(
    () => rowsCache.get(cacheKey({ hybridVoting, directDemocracyVoting, taskManager, educationHub, chainId })) || []
  );
  const [loading, setLoading] = useState(false);

  // Latest inputs in a ref so load()'s identity stays stable; seq makes
  // stale responses (org switched mid-load) discardable.
  const inputsRef = useRef({ hybridVoting, directDemocracyVoting, taskManager, educationHub, chainId });
  inputsRef.current = { hybridVoting, directDemocracyVoting, taskManager, educationHub, chainId };
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    const { hybridVoting, directDemocracyVoting, taskManager, educationHub, chainId } = inputsRef.current;
    if (!chainId) return;
    const clients = createChainClients(chainId);
    const pc = clients?.publicClient;
    if (!pc) return;

    setLoading(true);
    try {
      const [hvCreators, ddvCreators, ddvVoters, tmCreators, eduCreators] = await Promise.all([
        hybridVoting
          ? readHatArray(pc, hybridVoting, HybridVotingABI, 'creatorHats')
          : Promise.resolve([]),
        directDemocracyVoting
          ? readHatArray(pc, directDemocracyVoting, DirectDemocracyVotingABI, 'creatorHats')
          : Promise.resolve([]),
        directDemocracyVoting
          ? readHatArray(pc, directDemocracyVoting, DirectDemocracyVotingABI, 'votingHats')
          : Promise.resolve([]),
        taskManager
          ? readLensHatArray(pc, taskManager, TM_CREATOR_HATS_LENS_KEY)
          : Promise.resolve([]),
        educationHub
          ? readHatArray(pc, educationHub, EducationHubABI, 'creatorHatIds')
          : Promise.resolve([]),
      ]);
      if (seq !== seqRef.current) return; // a newer load() started — discard

      const out = [];
      const push = (hatIds, contractType, permissionRole) => {
        hatIds.forEach((hatId) => out.push({ hatId, contractType, permissionRole, allowed: true }));
      };
      push(hvCreators, 'HybridVoting', 'Creator');
      push(ddvCreators, 'DirectDemocracyVoting', 'Creator');
      push(ddvVoters, 'DirectDemocracyVoting', 'Voter');
      push(tmCreators, 'TaskManager', 'CreateProject');
      push(eduCreators, 'EducationHub', 'Creator');
      if (out.length > 0) {
        rowsCache.set(cacheKey({ hybridVoting, directDemocracyVoting, taskManager, educationHub, chainId }), out);
      }
      setRows(out);
    } catch (e) {
      if (seq !== seqRef.current) return;
      // Best-effort augmentation: on failure leave rows empty so the matrix
      // still renders whatever the subgraph provided.
      setRows([]);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  // Reset + reload whenever the org's contracts/chain change so the matrix
  // never shows the previous org's hats while a new read is in flight. A
  // cached read for the SAME inputs is served instead of a blank reset (the
  // load() below still refreshes it in the background).
  useEffect(() => {
    setRows(rowsCache.get(cacheKey({ hybridVoting, directDemocracyVoting, taskManager, educationHub, chainId })) || []);
    if (!chainId) return;
    load();
  }, [hybridVoting, directDemocracyVoting, taskManager, educationHub, chainId, load]);

  // Creator/voting hats only change through governance — re-read after any
  // completed proposal (a passed setter may have granted/revoked a hat) so
  // the gates built on these rows don't hold stale permissions all session.
  // Fires for local finalizations (executeWithNotification) AND remote ones
  // (VotingContext re-emits when polled data shows a proposal completing).
  useRefreshSubscription(
    [RefreshEvent.PROPOSAL_COMPLETED],
    () => { if (inputsRef.current.chainId) load(); },
    [load]
  );

  return { onchainCreatorRows: rows, onchainCreatorLoading: loading };
}

export default useOnchainCreatorHats;
