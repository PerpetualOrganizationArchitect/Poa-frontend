/**
 * Deterministic, READ-ONLY chain-target check for the Gnosis task-submission fix.
 *
 * Inspects the exact call the direct-EOA fallback (TransactionManager) makes for
 * `submitTask` — WITHOUT broadcasting anything — against the real Decentral Park
 * TaskManager on both the org chain (Gnosis, 100) and the wallet's stale home chain
 * (Arbitrum, 42161). It demonstrates that the TaskManager contract lives on Gnosis
 * (where `submitTask` estimates cleanly — the fix path) and that the same address is
 * codeless on Arbitrum (the wrong target the pre-fix flow broadcasts to when the
 * wallet is still on its home chain).
 *
 *   Production fixture (from the bug report + a read-only Gnosis subgraph query):
 *     TaskManager : 0x2d9d397a842b8d691ea2a232062cbc8ef8ebbdb7  (Decentral Park)
 *     task         : composite "…-7"  → numeric id 7   (parseTaskId, see
 *                    src/services/web3/utils/encoding.parseTaskId.test.js)
 *     project      : composite "…-0x00…00" → bytes32 zero (parseProjectId, same test)
 *     status       : Assigned  (claimed, submissionHash null → ready to submit)
 *     assignee     : 0xa6f4d9f44dd980b7168d829d5f74c2b00a46b2c9  (hudsonhrh, the reporter)
 *
 * WHAT THIS PROVES (and what it does NOT):
 *   - Gnosis has the TaskManager code AND `submitTask(7, hash)` from the assignee
 *     estimates cleanly → the fix (switch to the org chain before send) is valid.
 *   - The same address has NO code on Arbitrum → that is the wrong target the pre-fix
 *     flow reached.
 *   It does NOT reproduce or explain the provider-specific production `-32603
 *   "Error processing the transaction"`. `eth_estimateGas` and `eth_call` against
 *   a codeless address can SUCCEED as a no-op (estimate ≈ the intrinsic 21k +
 *   calldata cost; call returns "0x"), and some providers may also accept such a
 *   broadcast as a useless no-op. We therefore assert only the observable facts:
 *   code presence, a clean Gnosis estimate, and the codeless Arbitrum target.
 *
 * Read-only: only eth_getCode + eth_estimateGas + eth_call. No key, no broadcast.
 * Not part of the vitest suite (no live-network calls in CI). Run manually:
 *   node poa-app/scripts/verify/gnosis-task-submit-chain-check.mjs
 */
import { ethers } from 'ethers';

const TASK_MANAGER = '0x2d9d397a842b8d691ea2a232062cbc8ef8ebbdb7';
const TASK_ID = 7; // parseTaskId('0x2d9d…-7') — locked by encoding.parseTaskId.test.js
const ASSIGNEE = '0xa6f4d9f44dd980b7168d829d5f74c2b00a46b2c9'; // hudsonhrh (task assignee)

// A plausible submission hash (content is not validated by submitTask; it is stored).
const SUBMISSION_HASH = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('regression-probe'));

const IFACE = new ethers.utils.Interface([
  'function submitTask(uint256 id, bytes32 submissionHash)',
]);
const CALLDATA = IFACE.encodeFunctionData('submitTask', [TASK_ID, SUBMISSION_HASH]);

const CHAINS = {
  gnosis: {
    label: 'Gnosis (org chain, 100) — the FIX path',
    rpc: process.env.NEXT_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com',
    expectCode: true,
  },
  arbitrum: {
    label: 'Arbitrum (stale home chain, 42161) — the wrong, codeless target',
    rpc: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    expectCode: false,
  },
};

async function probe(cfg) {
  const provider = new ethers.providers.JsonRpcProvider(cfg.rpc);
  const out = { label: cfg.label, expectCode: cfg.expectCode };

  // 1) Does the TaskManager address have contract code on this chain?
  try {
    const code = await provider.getCode(TASK_MANAGER);
    out.hasCode = code && code !== '0x';
    out.codeLen = code ? (code.length - 2) / 2 : 0;
  } catch (e) {
    out.getCodeError = e.message;
  }

  // 2) The exact first RPC the direct TransactionManager makes: eth_estimateGas.
  //    NOTE: against a codeless address this can SUCCEED as a no-op (intrinsic gas),
  //    so a clean estimate here does NOT mean the send would succeed.
  try {
    const gas = await provider.estimateGas({ from: ASSIGNEE, to: TASK_MANAGER, data: CALLDATA });
    out.estimateGas = gas.toString();
  } catch (e) {
    out.estimateGasError = { code: e.code, reason: e.reason, message: e.message };
  }

  // 3) eth_call, for the raw return / revert data the node produces. A codeless
  //    address typically returns "0x" (no-op) rather than reverting.
  try {
    const ret = await provider.call({ from: ASSIGNEE, to: TASK_MANAGER, data: CALLDATA });
    out.callReturn = ret;
  } catch (e) {
    out.callError = { code: e.code, reason: e.reason, message: e.message };
  }

  return out;
}

(async () => {
  console.log('submitTask calldata:', CALLDATA);
  const results = {};
  for (const [key, cfg] of Object.entries(CHAINS)) {
    results[key] = await probe(cfg);
    console.log(`\n=== ${cfg.label} ===`);
    console.log(JSON.stringify(results[key], null, 2));
  }

  const g = results.gnosis;
  const a = results.arbitrum;

  // Verdict is based on the observable, deterministic facts only:
  //   the fix path (Gnosis) has the TaskManager code AND estimates cleanly, and
  //   the pre-fix target (Arbitrum) has NO code at that address. We deliberately do
  //   NOT require Arbitrum to error — a codeless-target estimate/call can no-op.
  const gnosisHasCode = g.hasCode === true;
  const gnosisEstimates = typeof g.estimateGas === 'string';
  const arbitrumNoCode = a.hasCode === false;

  console.log('\n=== VERDICT ===');
  console.log('Gnosis TaskManager has code   :', gnosisHasCode);
  console.log('Gnosis submitTask estimates ok:', gnosisEstimates, g.estimateGas ? `(gas ${g.estimateGas})` : `(${JSON.stringify(g.estimateGasError)})`);
  console.log('Arbitrum TaskManager NO code  :', arbitrumNoCode, '(the wrong target the pre-fix flow reached)');
  console.log('Arbitrum estimate/call        :', 'read-only no-op — does NOT reproduce the reported provider-specific -32603');

  const pass = gnosisHasCode && gnosisEstimates && arbitrumNoCode;
  console.log(`\n${pass ? 'PASS' : 'FAIL'}: submitTask targets a real contract on the org chain (Gnosis) but a codeless address on the stale home chain (Arbitrum) — so the fix must switch to the org chain before sending.`);
  process.exit(pass ? 0 : 1);
})();
