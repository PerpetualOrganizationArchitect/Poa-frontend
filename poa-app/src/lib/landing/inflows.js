import { formatTokenAmount, parseTokenAmount } from '@/util/formatToken';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const lower = (value) => value?.toLowerCase();

export function addressTopic(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
}

export function inflowContracts(data) {
  return [
    ...data.taskManagers,
    ...data.paymentManagerContracts,
    ...data.executorContracts,
    ...data.paymasterHubContracts,
  ];
}

/**
 * Sum external deposits, retaining integer precision until display. ERC20 event
 * amounts use the token's on-chain decimals (USDC is 6); native deposits use 18.
 * Neither minted participation shares nor arbitrary unsolicited tokens are money.
 *
 * The USD column is the configured USD-pegged assets, not a market-price estimate.
 * Transfers directly between Poa pots do not create new external deposits.
 * Do not net by transaction: a bundler may include unrelated orgs' deposits and
 * payouts in the same transaction. Withdrawals never erase a historical inflow.
 */
export function aggregateChainInflows({ data, transferLogs, network, tokens }) {
  const pots = new Set(inflowContracts(data).map(({ id }) => lower(id)));
  const tokenMap = new Map(tokens.map((token) => [lower(token.address), token]));
  const amounts = {};
  const seen = new Set();

  function add(currency, raw, decimals) {
    const amount = BigInt(raw);
    if (amount < 0n || decimals > 18 || decimals < 0) throw new Error('Invalid inflow amount');
    const normalized = amount * 10n ** BigInt(18 - decimals);
    amounts[currency] = (amounts[currency] || 0n) + normalized;
  }

  for (const log of transferLogs) {
    if (log.removed || log.topics?.[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
    const token = tokenMap.get(lower(log.address));
    if (!token?.isStable) continue;
    const key = `${lower(log.transactionHash)}:${log.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const from = `0x${log.topics[1].slice(-40)}`.toLowerCase();
    const to = `0x${log.topics[2].slice(-40)}`.toLowerCase();
    if (pots.has(to) && !pots.has(from)) add('USD', log.data, token.decimals);
  }

  const nativeCurrency = network.nativeCurrency.usdPegged ? 'USD' : network.nativeCurrency.symbol;
  const nativeEvents = [
    // Payment ERC20 events duplicate the Transfer logs above.
    ...data.payments.filter((payment) => lower(payment.token) === ZERO_ADDRESS)
      .map((payment) => ({ ...payment, from: payment.payer, source: 'payment' })),
    // HubDeposit is the hub moving funds into EntryPoint, not a new external deposit.
    ...data.paymasterDepositEvents.filter((event) => event.eventType === 'OrgDeposit')
      .map((event) => ({ ...event, source: 'orgGas' })),
    // Fees and solidarity redistribution reuse money already deposited.
    ...data.solidarityEvents.filter((event) => event.eventType === 'DonationReceived')
      .map((event) => ({ ...event, source: 'solidarity' })),
  ];
  for (const event of nativeEvents) {
    const key = `${event.source}:${lower(event.id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!event.from) throw new Error('Deposit sender missing');
    if (pots.has(lower(event.from))) continue;
    add(nativeCurrency, event.amount, network.nativeCurrency.decimals);
  }

  return amounts;
}

/** Format without Number(rawWei), scientific notation, or a rounded-down zero. */
export function formatInflowAmount(raw, fractionDigits = 2) {
  const amount = BigInt(raw);
  if (amount === 0n) return '0';
  const unit = 10n ** BigInt(18 - fractionDigits);
  if (amount < unit) return `<${fractionDigits === 0 ? '1' : `0.${'0'.repeat(fractionDigits - 1)}1`}`;
  const rounded = ((amount + unit / 2n) / unit) * unit;
  const formatted = formatTokenAmount(rounded, 18, Math.max(1, fractionDigits));
  const [whole, fraction = ''] = formatted.split('.');
  const trimmed = fraction.slice(0, fractionDigits).replace(/0+$/, '');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${trimmed ? `.${trimmed}` : ''}`;
}

// Quotes stay decimal strings so conversion never rounds a wei amount through
// Number. Reject missing/invalid prices rather than dropping native deposits.
export function parseUsdRate(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,18})?$/.test(value)) {
    throw new Error('USD exchange rate unavailable');
  }
  const rate = BigInt(parseTokenAmount(value, 18));
  if (rate <= 0n) throw new Error('USD exchange rate unavailable');
  return rate;
}

export function summarizeInflows(chains, usdRates = {}) {
  const amounts = chains.reduce((total, chain) => {
    for (const [currency, amount] of Object.entries(chain)) {
      total[currency] = (total[currency] || 0n) + amount;
    }
    return total;
  }, {});
  let usd = amounts.USD || 0n;
  for (const [currency, amount] of Object.entries(amounts)) {
    if (currency !== 'USD' && amount > 0n) {
      usd += amount * parseUsdRate(usdRates[currency]) / 10n ** 18n;
    }
  }
  const formatted = formatInflowAmount(usd);
  if (formatted.startsWith('<')) return { formattedUsd: `<$${formatted.slice(1)}` };
  const [whole, cents = ''] = formatted.split('.');
  return { formattedUsd: `$${whole}.${cents.padEnd(2, '0')}` };
}
