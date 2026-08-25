/**
 * LIVE half of the contract-limit pin — reads the limit off DEPLOYED contracts.
 *
 * OPT-IN, like the live subgraph layer, because it needs the network:
 *
 *     POA_LIVE_CHAIN_TESTS=1 yarn test src/config/contractLimits.live.test.js
 *     yarn test:live-chain
 *
 * (`POA_LIVE_RPC_URL` overrides the RPC; `POA_LIVE_SUBGRAPH_URL` the subgraph.)
 *
 * WHY: `MAX_CALLS_PER_BATCH` is a mirror of a number that lives in Solidity, and the ABI cannot
 * carry its value — only its getter. The 24 this replaced was never wrong against any test, it was
 * wrong against the chain, and nothing in the repo could tell. This test asks the chain.
 *
 * It resolves a real org's Executor + both voting modules from the subgraph rather than hardcoding
 * addresses (which rot), and calls the constant getters. Read-only: two `eth_call`s and one query.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { MAX_CALLS_PER_BATCH } from './contractLimits';

const SUBGRAPH = process.env.POA_LIVE_SUBGRAPH_URL
  || 'https://api.studio.thegraph.com/query/73367/poa-gnosis-v-1/version/latest';
const RPC = process.env.POA_LIVE_RPC_URL || 'https://rpc.gnosischain.com';
const ENABLED = process.env.POA_LIVE_CHAIN_TESTS === '1';

// keccak256("MAX_CALLS_PER_BATCH()") / keccak256("MAX_CALLS()"), first 4 bytes.
const SELECTORS = {
  MAX_CALLS_PER_BATCH: '0x65f4c69b',
  MAX_CALLS: '0xb9add4b7',
};

async function ethCall(to, data) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${to} ${data}: ${json.error.message}`);
  return Number(BigInt(json.result));
}

describe.skipIf(!ENABLED)('MAX_CALLS_PER_BATCH against live deployments', () => {
  let org;

  beforeAll(async () => {
    const res = await fetch(SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          organizations(first: 1, where: { executorContract_not: null }) {
            name
            executorContract { id }
            hybridVoting { id }
            directDemocracyVoting { id }
          }
        }`,
      }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors));
    org = json.data.organizations[0];
  }, 30_000);

  it('matches the deployed Executor', async () => {
    expect(await ethCall(org.executorContract.id, SELECTORS.MAX_CALLS_PER_BATCH)).toBe(MAX_CALLS_PER_BATCH);
  }, 30_000);

  it('matches both deployed voting modules — the gate that fires at proposal creation', async () => {
    for (const mod of [org.hybridVoting, org.directDemocracyVoting]) {
      if (!mod) continue;
      expect(await ethCall(mod.id, SELECTORS.MAX_CALLS)).toBe(MAX_CALLS_PER_BATCH);
    }
  }, 30_000);
});
