import { describe, it, expect } from 'vitest';
import { utils, constants } from 'ethers';
import PaymentManagerABI from '../../../abi/PaymentManager.json';
import ERC20ABI from '../../../abi/ERC20.json';
import {
  TRANSFER_DESTINATION,
  TRANSFER_SOURCE,
  BOUNTY_POOL_LABEL,
  isNativeToken,
  amountDecimalsError,
  amountToWei,
  paymentManagerAvailability,
  resolveTransferSource,
  buildTreasuryTransferBatch,
  treasuryTransferCopy,
  transferOptionNames,
  TRANSFER_OPTION_NAMES,
  BOUNTY_POOL_OPTION_NAMES,
} from './treasuryBatches';

// Test6 (Gnosis) — the live fixture these batches were simulated against.
const PM = '0x10e96701746b567882b74e39a24aee7267c22bb5';
const TM = '0x3d93f0d090356d25e7a1614f0f8764b103ca99bc';
const BREAD = '0xa555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3';
const USDC = '0xDDAfbb505ad214D7b80b1f830fcCc89B60fB7A83';
const ALICE = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';

const pmIface = new utils.Interface(PaymentManagerABI);
const erc20Iface = new utils.Interface(ERC20ABI);

// Test6's distribution #1: 0.1 BREAD, fully claimed, never finalized — it pins the entire balance.
const TEST6_DIST_1 = {
  id: '1',
  payoutToken: BREAD,
  totalAmount: '100000000000000000',
  totalClaimed: '100000000000000000',
  finalized: false,
};

describe('isNativeToken', () => {
  it('treats empty, null and the zero address as the native currency', () => {
    expect(isNativeToken('')).toBe(true);
    expect(isNativeToken(null)).toBe(true);
    expect(isNativeToken(constants.AddressZero)).toBe(true);
    expect(isNativeToken(BREAD)).toBe(false);
  });
});

describe('amountDecimalsError / amountToWei', () => {
  it('names the token and its precision instead of throwing', () => {
    expect(amountDecimalsError('0.0000001', 6, 'USDC')).toBe('USDC only supports 6 decimal places.');
    expect(amountDecimalsError('1.5', 0, 'NFT')).toBe('NFT has no decimal places.');
    expect(amountDecimalsError('0.000001', 6, 'USDC')).toBeNull();
    expect(amountDecimalsError('', 6, 'USDC')).toBeNull();
    expect(amountDecimalsError('abc', 6, 'USDC')).toBeNull(); // the positive-amount check owns that
  });

  it('converts with the token decimals, not parseEther', () => {
    expect(amountToWei('1.5', 6)).toBe(1500000n);
    expect(amountToWei('0.01', 18)).toBe(10000000000000000n);
    expect(amountToWei('0.0000001', 6)).toBeNull();
    expect(amountToWei('', 18)).toBeNull();
  });
});

describe('paymentManagerAvailability', () => {
  it('reports Test6 as fully committed but releasable', () => {
    const a = paymentManagerAvailability({
      balance: '100000000000000000',
      distributions: [TEST6_DIST_1],
      token: BREAD,
    });
    expect(a.spendable).toBe('0');
    expect(a.committed).toBe('100000000000000000');
    expect(a.releasable).toBe('100000000000000000');
    expect(a.releaseIds).toEqual(['1']);
    expect(a.spendableAfterRelease).toBe('100000000000000000');
  });

  it('never over-counts claims already paid out when a round is closed (balance < committed)', () => {
    // PM holds 0.07; round #1 = 0.10 fully claimed & unfinalized, round #2 = 0.05 with 0.03 claimed.
    // After closing #1 the contract still commits 0.05, so only 0.02 can leave — not 0.10.
    const a = paymentManagerAvailability({
      balance: '70000000000000000',
      distributions: [
        { id: '1', payoutToken: BREAD, totalAmount: '100000000000000000', totalClaimed: '100000000000000000', finalized: false },
        { id: '2', payoutToken: BREAD, totalAmount: '50000000000000000', totalClaimed: '30000000000000000', finalized: false },
      ],
      token: BREAD,
    });
    expect(a.spendable).toBe('0');
    expect(a.releaseIds).toEqual(['1']);
    expect(a.spendableAfterRelease).toBe('20000000000000000');
    const r = resolveTransferSource({ amountWei: 50000000000000000n, executorBalance: '0', paymentManager: a });
    expect(r.ok).toBe(false);
  });

  it('never releases a partially-claimed distribution', () => {
    const a = paymentManagerAvailability({
      balance: '100',
      distributions: [{ id: '2', payoutToken: BREAD, totalAmount: '60', totalClaimed: '10', finalized: false }],
      token: BREAD,
    });
    expect(a.spendable).toBe('40');
    expect(a.releasable).toBe('0');
    expect(a.releaseIds).toEqual([]);
    expect(a.spendableAfterRelease).toBe('40');
  });

  it('ignores finalized rows and other tokens', () => {
    const a = paymentManagerAvailability({
      balance: '100',
      distributions: [
        { id: '1', payoutToken: BREAD, totalAmount: '50', totalClaimed: '50', finalized: true },
        { id: '2', payoutToken: USDC, totalAmount: '50', totalClaimed: '0', finalized: false },
      ],
      token: BREAD,
    });
    expect(a.spendable).toBe('100');
    expect(a.committed).toBe('0');
  });

  it('matches the native currency across its spellings', () => {
    const a = paymentManagerAvailability({
      balance: '100',
      distributions: [{ id: '1', payoutToken: constants.AddressZero, totalAmount: '30', totalClaimed: '0', finalized: false }],
      token: '',
    });
    expect(a.spendable).toBe('70');
  });
});

describe('resolveTransferSource', () => {
  const pmTest6 = paymentManagerAvailability({ balance: '100000000000000000', distributions: [TEST6_DIST_1], token: BREAD });

  it('prefers the Executor when it can pay', () => {
    const r = resolveTransferSource({ amountWei: 5n, executorBalance: '10', paymentManager: pmTest6 });
    expect(r).toMatchObject({ ok: true, source: TRANSFER_SOURCE.EXECUTOR, finalizeIds: [] });
  });

  it('falls back to the PaymentManager and closes fully-claimed rounds when the spendable balance is short', () => {
    const r = resolveTransferSource({ amountWei: 10000000000000000n, executorBalance: '0', paymentManager: pmTest6 });
    expect(r.ok).toBe(true);
    expect(r.source).toBe(TRANSFER_SOURCE.PAYMENT_MANAGER);
    expect(r.finalizeIds).toEqual(['1']);
  });

  it('does not close anything when the spendable balance already covers it', () => {
    const pm = paymentManagerAvailability({ balance: '200', distributions: [{ id: '1', payoutToken: BREAD, totalAmount: '50', totalClaimed: '50', finalized: false }], token: BREAD });
    const r = resolveTransferSource({ amountWei: 100n, executorBalance: '0', paymentManager: pm });
    expect(r).toMatchObject({ ok: true, source: TRANSFER_SOURCE.PAYMENT_MANAGER, finalizeIds: [] });
  });

  it('honours a preferred source that can pay, and ignores one that cannot', () => {
    const pm = paymentManagerAvailability({ balance: '100', distributions: [], token: BREAD });
    expect(resolveTransferSource({ amountWei: 5n, executorBalance: '10', paymentManager: pm, preferred: TRANSFER_SOURCE.PAYMENT_MANAGER }).source)
      .toBe(TRANSFER_SOURCE.PAYMENT_MANAGER);
    expect(resolveTransferSource({ amountWei: 50n, executorBalance: '10', paymentManager: pm, preferred: TRANSFER_SOURCE.EXECUTOR }).source)
      .toBe(TRANSFER_SOURCE.PAYMENT_MANAGER);
  });

  it('reports the shortfall against the richest pot when nothing can pay', () => {
    const r = resolveTransferSource({ amountWei: 1000n, executorBalance: '10', paymentManager: paymentManagerAvailability({ balance: '300', distributions: [], token: BREAD }) });
    expect(r.ok).toBe(false);
    expect(r.shortfall).toBe('700');
    expect(r.covers).toEqual({ executor: false, paymentManager: false });
  });

  it('is not ok for a zero amount', () => {
    expect(resolveTransferSource({ amountWei: 0n, executorBalance: '10' }).ok).toBe(false);
  });
});

describe('buildTreasuryTransferBatch', () => {
  it('Executor source, ERC20: one transfer() moving the Executor’s own balance (the legacy shape)', () => {
    const { batch, summaries, gasLimit } = buildTreasuryTransferBatch({
      source: TRANSFER_SOURCE.EXECUTOR, token: USDC, decimals: 6, symbol: 'USDC', amount: '1.5', recipient: ALICE,
    });
    expect(batch).toHaveLength(1);
    // networks.js ships this USDC address with a BROKEN checksum casing; the builder must
    // still emit a valid checksummed target rather than throwing.
    expect(batch[0].target).toBe(utils.getAddress(USDC.toLowerCase()));
    expect(batch[0].value).toBe('0');
    const decoded = erc20Iface.decodeFunctionData('transfer', batch[0].data);
    expect(decoded[0]).toBe(ALICE);
    expect(decoded[1].toString()).toBe('1500000');
    expect(summaries).toEqual([`If Yes wins, send 1.5 USDC from the treasury to 0x71C7…976F.`]);
    expect(gasLimit).toBeGreaterThan(0);
  });

  it('Executor source, native: a plain value send', () => {
    const { batch } = buildTreasuryTransferBatch({
      source: TRANSFER_SOURCE.EXECUTOR, token: '', decimals: 18, symbol: 'xDAI', amount: '0.25', recipient: ALICE,
    });
    expect(batch).toEqual([{ target: ALICE, value: '250000000000000000', data: '0x' }]);
  });

  it('PaymentManager source: withdraw(token, to, amount) decoded through the real ABI', () => {
    const { batch } = buildTreasuryTransferBatch({
      source: TRANSFER_SOURCE.PAYMENT_MANAGER, token: BREAD, decimals: 18, symbol: 'BREAD', amount: '0.01',
      recipient: TM, paymentManagerAddress: PM, destination: TRANSFER_DESTINATION.BOUNTY_POOL,
    });
    expect(batch).toHaveLength(1);
    expect(batch[0].target).toBe(utils.getAddress(PM));
    const decoded = pmIface.decodeFunctionData('withdraw', batch[0].data);
    expect(decoded.token).toBe(utils.getAddress(BREAD));
    expect(decoded.to).toBe(utils.getAddress(TM));
    expect(decoded.amount.toString()).toBe('10000000000000000');
  });

  it('PaymentManager source, native: withdraw(address(0), …)', () => {
    const { batch } = buildTreasuryTransferBatch({
      source: TRANSFER_SOURCE.PAYMENT_MANAGER, token: '', decimals: 18, symbol: 'xDAI', amount: '1',
      recipient: ALICE, paymentManagerAddress: PM,
    });
    const decoded = pmIface.decodeFunctionData('withdraw', batch[0].data);
    expect(decoded.token).toBe(constants.AddressZero);
  });

  it('closes the fully-claimed rounds FIRST, then withdraws — the Test6 batch that simulates green', () => {
    const { batch, summaries, warnings } = buildTreasuryTransferBatch({
      source: TRANSFER_SOURCE.PAYMENT_MANAGER, token: BREAD, decimals: 18, symbol: 'BREAD', amount: '0.01',
      recipient: TM, paymentManagerAddress: PM, finalizeIds: ['1'], destination: TRANSFER_DESTINATION.BOUNTY_POOL,
    });
    expect(batch).toHaveLength(2);
    const fin = pmIface.decodeFunctionData('finalizeDistribution', batch[0].data);
    expect(fin.distributionId.toString()).toBe('1');
    expect(fin.minClaimPeriodBlocks.toString()).toBe('0');
    expect(pmIface.decodeFunctionData('withdraw', batch[1].data).to).toBe(utils.getAddress(TM));
    expect(summaries[0]).toMatch(/^Closes fully-claimed payout #1 first/);
    expect(summaries[1]).toBe(`If Yes wins, move 0.01 BREAD from the treasury to the ${BOUNTY_POOL_LABEL}.`);
    expect(warnings).toEqual([expect.stringMatching(/^Based on what the treasury holds today\./)]);
  });

  it('rejects an amount finer than the token, a bad recipient, and a zero amount with the wizard’s own sentences', () => {
    expect(() => buildTreasuryTransferBatch({ token: USDC, decimals: 6, symbol: 'USDC', amount: '0.0000001', recipient: ALICE }))
      .toThrow('USDC only supports 6 decimal places.');
    expect(() => buildTreasuryTransferBatch({ token: USDC, decimals: 6, symbol: 'USDC', amount: '1', recipient: '0x123' }))
      .toThrow('Please enter a valid recipient address.');
    expect(() => buildTreasuryTransferBatch({ token: USDC, decimals: 6, symbol: 'USDC', amount: '0', recipient: ALICE }))
      .toThrow('Please enter a valid transfer amount.');
    expect(() => buildTreasuryTransferBatch({ source: TRANSFER_SOURCE.PAYMENT_MANAGER, token: USDC, decimals: 6, symbol: 'USDC', amount: '1', recipient: ALICE }))
      .toThrow(/isn't set up for payouts by vote/);
  });
});

describe('treasuryTransferCopy', () => {
  it('describes the bounty pool by its member-facing name', () => {
    const c = treasuryTransferCopy({ amount: '0.05', symbol: 'BREAD', recipient: TM, destination: TRANSFER_DESTINATION.BOUNTY_POOL });
    expect(c.title).toBe(`Move 0.05 BREAD to the ${BOUNTY_POOL_LABEL}`);
    expect(c.description).toBe(`If this vote passes, 0.05 BREAD moves from the treasury into the ${BOUNTY_POOL_LABEL}. It can only leave again as payment for a completed task.`);
  });

  it('keeps the legacy wording for a plain payout', () => {
    const c = treasuryTransferCopy({ amount: '5', symbol: 'xDAI', recipient: ALICE, destination: TRANSFER_DESTINATION.ADDRESS });
    expect(c.title).toBe('Send 5 xDAI to 0x71C7…976F');
    expect(c.description).toBe('If this vote passes, 5 xDAI goes from the treasury to 0x71C7…976F.');
  });
});

describe('transferOptionNames', () => {
  it('is one pair per destination, and the same pair the ballot renders', () => {
    expect(transferOptionNames(TRANSFER_DESTINATION.ADDRESS)).toEqual([...TRANSFER_OPTION_NAMES]);
    expect(transferOptionNames(TRANSFER_DESTINATION.BOUNTY_POOL)).toEqual([...BOUNTY_POOL_OPTION_NAMES]);
    expect(transferOptionNames(undefined)).toEqual([...TRANSFER_OPTION_NAMES]);
    for (const pair of [TRANSFER_OPTION_NAMES, BOUNTY_POOL_OPTION_NAMES]) {
      expect(pair[0]).toMatch(/^Yes — /);
      expect(pair[1]).toMatch(/^No — /);
    }
  });
});
