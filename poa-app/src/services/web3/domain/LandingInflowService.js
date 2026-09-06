import { NETWORKS } from '@/config/networks';
import { getBountyTokenOptions } from '@/util/tokens';
import { LANDING_INFLOWS_QUERY, INFLOW_COLLECTION_LIMIT } from '@/util/landingInflowQueries';
import { addressTopic, aggregateChainInflows, inflowContracts, parseUsdRate, summarizeInflows, TRANSFER_TOPIC } from '@/lib/landing/inflows';

const COLLECTIONS = [
  'taskManagers', 'paymentManagerContracts', 'executorContracts', 'paymasterHubContracts',
  'payments', 'paymasterDepositEvents', 'solidarityEvents',
];
const REQUEST_TIMEOUT = 15000;
const CACHE_DURATION = 5 * 60 * 1000;
let cached = null;
let pending = null;

export async function fetchUsdSpotRate(symbol, fetcher = fetch) {
  const response = await fetcher(`https://api.coinbase.com/v2/prices/${encodeURIComponent(symbol)}-USD/spot`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('USD exchange rate unavailable');
  const { data } = await response.json();
  if (data?.base !== symbol || data?.currency !== 'USD') {
    throw new Error('USD exchange rate unavailable');
  }
  parseUsdRate(data.amount);
  return data.amount;
}

async function post(url, body, fetcher) {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (!response.ok) throw new Error('Inflow source unavailable');
  const json = await response.json();
  if (json.errors?.length || json.error) throw new Error('Inflow source rejected request');
  return json;
}

export async function fetchChainInflows(network, fetcher = fetch) {
  const { data } = await post(network.subgraphUrl, { query: LANDING_INFLOWS_QUERY }, fetcher);
  const block = data?._meta?.block?.number;
  if (!Number.isSafeInteger(block) || data._meta.hasIndexingErrors) {
    throw new Error('Inflow index unavailable');
  }
  for (const key of COLLECTIONS) {
    if (!Array.isArray(data[key]) || data[key].length >= INFLOW_COLLECTION_LIMIT) {
      throw new Error('Inflow index incomplete');
    }
  }
  const contracts = inflowContracts(data);
  if (!contracts.length) return {};
  if (contracts.some(({ createdAtBlock }) => !/^\d+$/.test(createdAtBlock))) {
    throw new Error('Contract deployment block missing');
  }
  const firstBlock = contracts.reduce((min, contract) => {
    const created = BigInt(contract.createdAtBlock);
    return created < min ? created : min;
  }, BigInt(block));
  const tokens = getBountyTokenOptions(network.chainId).filter((token) => token.isStable);
  const addresses = [...new Set(contracts.map(({ id }) => addressTopic(id)))];
  const filter = {
    address: tokens.map((token) => token.address),
    fromBlock: `0x${firstBlock.toString(16)}`,
    // Pin RPC reads to the indexed block so all sources describe one snapshot.
    toBlock: `0x${block.toString(16)}`,
  };
  // One bounded request, with no per-org or per-block scan. If a provider's
  // range limit is exceeded, fail the metric instead of inventing a partial sum.
  let transferLogs = [];
  if (tokens.length) {
    const { result } = await post(network.rpcUrl, {
      jsonrpc: '2.0', id: 1, method: 'eth_getLogs',
      params: [{ ...filter, topics: [TRANSFER_TOPIC, null, addresses] }],
    }, fetcher);
    if (!Array.isArray(result)) throw new Error('Transfer history unavailable');
    transferLogs = result;
  }
  return aggregateChainInflows({ data, transferLogs, network, tokens });
}

/**
 * Recorded app-supported external inflows on every production chain: gas pool
 * and solidarity deposits; supported stablecoins entering treasury, bounty and
 * executor contracts; indexed native treasury payments. Direct native sends to
 * TaskManager/Executor emit no indexed receive event and cannot be reconstructed
 * by this lightweight public reader. Native deposits are valued at the current
 * USD spot rate, not their historical deposit-day prices.
 * Returns from external exchanges are incoming transfers; event data alone does
 * not reliably attribute those to earlier outgoing funds inside bundled calls.
 */
export async function fetchLandingInflows() {
  if (cached && Date.now() - cached.at < CACHE_DURATION) return cached.value;
  if (pending) return pending;
  pending = Promise.all(
    Object.values(NETWORKS).filter((network) => !network.isTestnet).map((network) => fetchChainInflows(network))
  ).then(async (chains) => {
    const currencies = [...new Set(chains.flatMap((amounts) => Object.entries(amounts)
      .filter(([symbol, amount]) => symbol !== 'USD' && amount > 0n)
      .map(([symbol]) => symbol)))];
    const rates = Object.fromEntries(await Promise.all(currencies.map(async (symbol) =>
      [symbol, await fetchUsdSpotRate(symbol)])));
    const value = summarizeInflows(chains, rates);
    cached = { at: Date.now(), value };
    return value;
  }).finally(() => { pending = null; });
  return pending;
}
