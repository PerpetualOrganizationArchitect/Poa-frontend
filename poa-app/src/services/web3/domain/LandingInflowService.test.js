import { describe, expect, it, vi } from 'vitest';
import { NETWORKS } from '@/config/networks';
import { fetchChainInflows, fetchUsdSpotRate } from '@/services/web3/domain/LandingInflowService';

const data = () => ({
  taskManagers: [{ id: `0x${'1'.repeat(40)}`, createdAtBlock: '10' }],
  paymentManagerContracts: [], executorContracts: [], paymasterHubContracts: [],
  payments: [], paymasterDepositEvents: [], solidarityEvents: [],
  _meta: { block: { number: 100 }, hasIndexingErrors: false },
});
const response = (json) => ({ ok: true, json: async () => json });

describe('native deposit USD pricing', () => {
  it('reads a fresh public spot quote without rounding its decimal string', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ data: { base: 'ETH', currency: 'USD', amount: '2507.685' } }));
    expect(await fetchUsdSpotRate('ETH', fetcher)).toBe('2507.685');
    expect(fetcher).toHaveBeenCalledWith('https://api.coinbase.com/v2/prices/ETH-USD/spot', expect.objectContaining({ cache: 'no-store' }));
  });

  it('rejects failed, malformed, and wrong-currency quotes', async () => {
    const quote = { base: 'ETH', currency: 'USD', amount: '2507.685' };
    for (const invalid of [
      { ok: false }, response({}), response({ data: { ...quote, base: 'BTC' } }),
      response({ data: { ...quote, currency: 'EUR' } }), response({ data: { ...quote, amount: '0' } }),
      response({ data: { ...quote, amount: 'NaN' } }),
    ]) {
      await expect(fetchUsdSpotRate('ETH', vi.fn().mockResolvedValue(invalid))).rejects.toThrow('exchange rate unavailable');
    }
  });
});

describe('landing inflow source integrity', () => {
  it('pins token history to the indexed block and bounds the fetch count', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ data: data() }))
      .mockResolvedValue(response({ result: [] }));
    expect(await fetchChainInflows(NETWORKS.gnosis, fetcher)).toEqual({});
    expect(fetcher).toHaveBeenCalledTimes(2);
    const filters = fetcher.mock.calls.slice(1).map(([, options]) => JSON.parse(options.body).params[0]);
    expect(filters.map(({ fromBlock, toBlock }) => [fromBlock, toBlock])).toEqual([['0xa', '0x64']]);
    expect(filters[0].topics[1]).toBeNull();
    expect(filters[0].topics[2]).toHaveLength(1);
  });

  it('rejects a GraphQL error instead of displaying a zero', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ errors: [{ message: 'unavailable' }] }));
    await expect(fetchChainInflows(NETWORKS.gnosis, fetcher)).rejects.toThrow('rejected');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a truncated collection, indexing errors, and missing source collections', async () => {
    for (const invalid of [
      { ...data(), payments: Array(1000).fill({}) },
      { ...data(), _meta: { block: { number: 100 }, hasIndexingErrors: true } },
      { ...data(), solidarityEvents: undefined },
    ]) {
      const fetcher = vi.fn().mockResolvedValue(response({ data: invalid }));
      await expect(fetchChainInflows(NETWORKS.gnosis, fetcher)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects failed token history instead of exposing an incomplete total', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ data: data() }))
      .mockResolvedValueOnce(response({ error: { message: 'range exceeded' } }));
    await expect(fetchChainInflows(NETWORKS.gnosis, fetcher)).rejects.toThrow('rejected');
  });
});
