import { describe, expect, it } from 'vitest';
import { addressTopic, aggregateChainInflows, formatInflowAmount, summarizeInflows, TRANSFER_TOPIC, ZERO_ADDRESS } from '@/lib/landing/inflows';
import { NETWORKS } from '@/config/networks';
import { getBountyTokenOptions } from '@/util/tokens';

const treasury = `0x${'1'.repeat(40)}`;
const tasks = `0x${'2'.repeat(40)}`;
const executor = `0x${'3'.repeat(40)}`;
const paymaster = `0x${'4'.repeat(40)}`;
const user = `0x${'5'.repeat(40)}`;
const usdc = `0x${'a'.repeat(40)}`;
const bread = `0x${'b'.repeat(40)}`;
const native = { symbol: 'xDAI', decimals: 18, usdPegged: true };
const tokens = [
  { address: usdc, decimals: 6, isStable: true },
  { address: bread, decimals: 18, isStable: true },
];
const emptyData = () => ({
  taskManagers: [{ id: tasks }], paymentManagerContracts: [{ id: treasury }],
  executorContracts: [{ id: executor }], paymasterHubContracts: [{ id: paymaster }],
  payments: [], paymasterDepositEvents: [], solidarityEvents: [],
});
const log = ({ token = bread, from = user, to = treasury, amount = 1n * 10n ** 18n, tx = '0x1', index = '0x0' } = {}) => ({
  address: token, topics: [TRANSFER_TOPIC, addressTopic(from), addressTopic(to)],
  data: `0x${amount.toString(16)}`, transactionHash: tx, logIndex: index,
});
const aggregate = (data, transferLogs, nativeCurrency = native) => aggregateChainInflows({
  data, transferLogs, tokens, network: { nativeCurrency },
});

describe('recorded landing inflows', () => {
  it('includes the configured BREAD token in the dollar total at its peg', () => {
    const gnosisTokens = getBountyTokenOptions(NETWORKS.gnosis.chainId);
    const breadToken = gnosisTokens.find(({ symbol }) => symbol === 'BREAD');
    const result = aggregateChainInflows({
      data: emptyData(), network: NETWORKS.gnosis, tokens: gnosisTokens,
      transferLogs: [log({ token: breadToken.address, amount: 140_400_000_000_000_000_000n })],
    });
    expect(summarizeInflows([result])).toEqual({ formattedUsd: '$140.40' });
  });

  it('includes treasury, direct task bounty and executor deposits with actual token decimals', () => {
    const data = emptyData();
    // The subgraph's ERC20 Payment event duplicates this USDC Transfer.
    data.payments.push({ id: 'payment', token: usdc, amount: '20000000', payer: user, transactionHash: '0x1' });
    const result = aggregate(data, [
      log({ token: usdc, amount: 20_000_000n }),
      log({ to: tasks, amount: 40n * 10n ** 18n, tx: '0x2' }),
      log({ to: executor, amount: 10n ** 18n / 2n, tx: '0x3' }),
    ]);
    expect(result.USD).toBe(60_500_000_000_000_000_000n);
    expect(summarizeInflows([result]).formattedUsd).toBe('$60.50');
  });

  it('counts native treasury, gas sponsorship and solidarity donations once', () => {
    const data = emptyData();
    data.payments = [{ id: 'p', token: ZERO_ADDRESS, payer: user, amount: '1000000000000000000', transactionHash: '0x1' }];
    const deposit = { id: 'g', eventType: 'OrgDeposit', from: user, amount: '2000000000000000000', transactionHash: '0x2' };
    data.paymasterDepositEvents = [deposit, deposit, { ...deposit, id: 'hub', eventType: 'HubDeposit' }];
    data.solidarityEvents = [
      { id: 's', eventType: 'DonationReceived', from: user, amount: '5000000000000000000', transactionHash: '0x3' },
      { id: 'f', eventType: 'FeeCollected', amount: '999999999999999999999', transactionHash: '0x4' },
    ];
    expect(aggregate(data, []).USD).toBe(8n * 10n ** 18n);
  });

  it('excludes internal movements and duplicate logs', () => {
    const data = emptyData();
    data.paymasterDepositEvents = [{ id: 'gas', from: executor, eventType: 'OrgDeposit', amount: '2000000000000000000', transactionHash: '0x3' }];
    const deposit = log({ amount: 10n * 10n ** 18n });
    expect(aggregate(data, [
      deposit, deposit,
      log({ from: treasury, to: tasks, amount: 10n * 10n ** 18n, tx: '0x2' }),
    ]).USD).toBe(10n * 10n ** 18n);
  });

  it('preserves gross inflows when a bundler includes unrelated payouts in the same transaction', () => {
    expect(aggregate(emptyData(), [
      log({ from: tasks, to: user, amount: 20n * 10n ** 18n }),
      log({ token: usdc, from: user, to: treasury, amount: 20_000_000n, index: '0x1' }),
    ]).USD).toBe(20n * 10n ** 18n);
  });

  it('keeps historical deposits after withdrawal and ignores spam tokens and removed logs', () => {
    const data = emptyData();
    expect(aggregate(data, [
      log({ amount: 10n * 10n ** 18n }),
      log({ from: treasury, to: user, amount: 10n * 10n ** 18n, tx: '0x2' }),
      log({ token: `0x${'f'.repeat(40)}`, amount: 999999n * 10n ** 18n, tx: '0x3' }),
      { ...log({ amount: 999999n * 10n ** 18n, tx: '0x4' }), removed: true },
    ]).USD).toBe(10n * 10n ** 18n);
  });

  it('converts ETH to dollars before combining production chains', () => {
    const data = emptyData();
    data.paymasterDepositEvents = [{ id: 'g', eventType: 'OrgDeposit', from: user, amount: '51859000000000000', transactionHash: '0x1' }];
    const eth = aggregate(data, [], { symbol: 'ETH', decimals: 18 });
    expect(summarizeInflows([{ USD: 20n * 10n ** 18n }, eth], { ETH: '3000' })).toEqual({
      formattedUsd: '$175.58',
    });
  });

  it('retains fractional price precision and rounds the combined total only once', () => {
    expect(summarizeInflows([{ USD: 20n * 10n ** 18n, ETH: 10n ** 16n }], { ETH: '3000.5' }))
      .toEqual({ formattedUsd: '$50.01' });
    expect(summarizeInflows([{ USD: 20_004_000_000_000_000_000n, ETH: 4n * 10n ** 12n }], { ETH: '1000' }))
      .toEqual({ formattedUsd: '$20.01' });
  });

  it('never silently omits native deposits when a USD quote is missing or invalid', () => {
    for (const rate of [undefined, '0', '-1', 'NaN', 'Infinity', '1e3', '1.2.3', 3000]) {
      expect(() => summarizeInflows([{ USD: 20n * 10n ** 18n, ETH: 10n ** 18n }], { ETH: rate }))
        .toThrow('exchange rate unavailable');
    }
    expect(summarizeInflows([{ USD: 20n * 10n ** 18n, ETH: 0n }])).toEqual({ formattedUsd: '$20.00' });
  });
});

describe('inflow formatting', () => {
  it('formats wei, fractional deposits and very large amounts without losing integer precision', () => {
    expect(formatInflowAmount(1n)).toBe('<0.01');
    expect(formatInflowAmount(1n, 6)).toBe('<0.000001');
    expect(formatInflowAmount(1_999_000_000_000_000_000n)).toBe('2');
    expect(formatInflowAmount(9_007_199_254_740_993n * 10n ** 18n)).toBe('9,007,199,254,740,993');
    expect(summarizeInflows([{}])).toEqual({ formattedUsd: '$0.00' });
    expect(summarizeInflows([{ USD: 1n }])).toEqual({ formattedUsd: '<$0.01' });
  });
});
