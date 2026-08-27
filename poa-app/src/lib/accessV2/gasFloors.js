/**
 * accessV2/gasFloors — remember a proposal's announceWinner GAS FLOOR from creation until someone
 * counts the votes.
 *
 * WHY THIS EXISTS (CLAUDE.md's loudest gotcha, confirmed live on Test6 proposal #23):
 * `announceWinner` runs the winning batch inside a try/catch. Gas estimation — `eth_estimateGas`,
 * a wallet, a bundler's `eth_estimateUserOperationGas` — therefore prices only the CHEAP
 * CAUGHT-FAILURE path (~30k). An expensive batch (module deploy/init, ten authority calls) then
 * hits OutOfGas in a sub-call and is SILENTLY SKIPPED: the tx succeeds, `Winner` reports
 * `executed=false`, `ProposalExecutionFailed` carries `Executor.CallFailed(index, 0x)`, the
 * proposal is marked executed, and NOTHING HAPPENED. There is no second chance.
 *
 * The builders in `proposalBuilders` compute the floor (`estimateBatchGas`). It has to survive to
 * the finalize transaction, which is a different session — usually a different person — from the
 * one that created the proposal. There is no on-chain getter for a proposal's batch (HybridVoting
 * stores no batch accessor) and the subgraph does not index proposal calldata, so the floor cannot
 * be recomputed at finalize time. It is recorded here instead, keyed by (voting contract,
 * proposal id), and read back by `useVoteActions.handleFinalize`.
 *
 * KNOWN LIMITATION: this is per-browser. Whoever finalises from a device that did not create the
 * proposal gets no recorded floor and falls back to the estimate-plus-multiplier behaviour. That
 * is strictly no worse than before this module existed, and the create-role flow's own
 * "announceWinner needs a gas buffer" warning covers the gap in copy. Fixing it properly needs the
 * subgraph to index proposal batches.
 *
 * PURE-ISH: every function takes an explicit `store` (anything with getItem/setItem/removeItem),
 * defaulting to localStorage, so the whole module is unit-testable with a Map.
 */

const STORAGE_KEY = 'poa:accessV2:announceWinnerGasFloors';

/** Floors older than this are dropped: a proposal's voting window is days, not months. */
export const GAS_FLOOR_TTL_MS = 45 * 24 * 60 * 60 * 1000;

/** Never park an absurd value — a corrupted entry must not be able to brick a finalize. */
export const MAX_GAS_FLOOR = 30_000_000;

/** A no-op store, so SSR and a blocked-localStorage browser take the same path as "nothing here". */
const nullStore = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export function defaultStore() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch { /* storage blocked (private mode, third-party cookie policy) */ }
  return nullStore;
}

/** `${contract}:${proposalId}`, lowercased — the same handle handleFinalize already holds. */
export function gasFloorKey(contractAddress, proposalId) {
  const c = String(contractAddress || '').toLowerCase();
  const p = String(proposalId ?? '');
  if (!c || !p) return null;
  return `${c}:${p}`;
}

function readAll(store) {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(store, map) {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* quota or blocked storage — the floor is an optimisation, never a hard requirement */ }
}

/** Drop entries past their TTL. Returns a NEW map. */
export function pruneGasFloors(map, now = Date.now()) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    if (!v || typeof v.gas !== 'number') continue;
    if (now - Number(v.at || 0) > GAS_FLOOR_TTL_MS) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Park the floor for a proposal that was just created.
 *
 * @param {string} contractAddress - the voting contract announceWinner will be called on
 * @param {string|number} proposalId - the on-chain id (from the createProposal receipt)
 * @param {number} gas - the builder's floor
 * @returns {boolean} whether anything was recorded
 */
export function recordGasFloor(contractAddress, proposalId, gas, { store = defaultStore(), now = Date.now() } = {}) {
  const key = gasFloorKey(contractAddress, proposalId);
  const value = Number(gas);
  if (!key || !Number.isFinite(value) || value <= 0) return false;

  const map = pruneGasFloors(readAll(store), now);
  map[key] = { gas: Math.min(Math.floor(value), MAX_GAS_FLOOR), at: now };
  writeAll(store, map);
  return true;
}

/**
 * The floor recorded for a proposal, or null.
 *
 * @returns {number|null}
 */
export function readGasFloor(contractAddress, proposalId, { store = defaultStore(), now = Date.now() } = {}) {
  const key = gasFloorKey(contractAddress, proposalId);
  if (!key) return null;
  const entry = pruneGasFloors(readAll(store), now)[key];
  if (!entry) return null;
  const gas = Number(entry.gas);
  return Number.isFinite(gas) && gas > 0 ? Math.min(gas, MAX_GAS_FLOOR) : null;
}

/** Forget a floor (the proposal settled — nothing will call announceWinner on it again). */
export function clearGasFloor(contractAddress, proposalId, { store = defaultStore(), now = Date.now() } = {}) {
  const key = gasFloorKey(contractAddress, proposalId);
  if (!key) return;
  const map = pruneGasFloors(readAll(store), now);
  if (!(key in map)) return;
  delete map[key];
  writeAll(store, map);
}

/**
 * The transaction options a floor turns into, for BOTH transaction managers.
 *
 *   • `gasLimit`          — the EOA path. `TransactionManager` treats it as a FLOOR over its own
 *                           buffered estimate, never as a cap.
 *   • `callGasLimitFloor` — the ERC-4337 path. Also a floor: `announceHybridWinner` already applies
 *                           a 3x multiplier for the Hats tree-walk, and the larger of the two wins.
 *                           NOT `callGasLimit`, which is an ABSOLUTE override that would throw the
 *                           multiplier away and could under-fund a big Hats walk.
 *
 * @param {number|null} floor
 * @returns {object} options to spread into the announceWinner call ({} when there is no floor)
 */
export function gasFloorOptions(floor) {
  const gas = Number(floor);
  if (!Number.isFinite(gas) || gas <= 0) return {};
  const capped = Math.min(Math.floor(gas), MAX_GAS_FLOOR);
  return { gasLimit: capped, callGasLimitFloor: capped };
}
