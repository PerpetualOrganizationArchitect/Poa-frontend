/**
 * treasuryBatches — the pure half of the "Send money from the treasury" vote.
 *
 * WHY THIS EXISTS. The org's money lives in THREE places and only one of them was ever wired to
 * the vote wizard:
 *
 *   • the Executor — the account that runs a passed proposal's batch. POContext aliases it as
 *     `treasuryContractAddress`. The old transfer batch could only spend THIS balance, which on
 *     every org we looked at is empty (deposits never land here);
 *   • the PaymentManager — where "Deposit to treasury" (`payERC20`) puts money and what /treasury
 *     renders as "In the treasury". Its `withdraw(token, to, amount)` is `onlyOwner`, and the owner
 *     is the Executor, so a passed proposal is the ONLY way to move it;
 *   • the TaskManager — the task-reward pool. Whatever it holds is what completed tasks pay their
 *     bounties from (`safeTransfer` to the claimer at completion), so "fund task rewards" means
 *     "move tokens to the TaskManager". Today that is a plain transfer from a member's OWN wallet;
 *     this module lets the ORG's treasury do it by vote.
 *
 * PURE: no React, no provider, no ABI file. Every function takes plain values (balances as
 * decimal strings / BigInt-compatible) and returns plain values, so the calldata a vote will run
 * is unit-testable. `useProposalForm` calls `buildTreasuryTransferBatch`; `CreateVoteModal` calls
 * `resolveTransferSource` with the live pot balances from `useOrgPotBalances`.
 *
 * PAYMENT-MANAGER ACCOUNTING. `withdraw` refuses to touch funds that are COMMITTED to an
 * unfinalized distribution (`balance < totalCommitted + amount` → `InsufficientFunds()`), even
 * when every claim on that distribution has already been paid out. Test6 is exactly that: 0.10
 * BREAD in the contract, all of it still "committed" to a fully-claimed distribution, so a bare
 * withdraw reverts inside announceWinner's try/catch and the vote silently does nothing. A
 * fully-claimed distribution can be closed with `finalizeDistribution(id, 0)` at no cost to anyone
 * (unclaimed = 0, nothing moves; it only releases the accounting), so when the spendable balance is
 * short the batch CLOSES those first and says so in its summary. Partially-claimed distributions
 * are never touched here — closing one returns real unclaimed money to the Executor and forfeits
 * open claims, which is a separate decision for a separate vote.
 */

import { utils, constants } from 'ethers';
import { estimateBatchGas } from '@/lib/accessV2/proposalBuilders';

export const TRANSFER_DESTINATION = Object.freeze({
  ADDRESS: 'address',
  BOUNTY_POOL: 'bountyPool',
});

export const TRANSFER_SOURCE = Object.freeze({
  EXECUTOR: 'executor',
  PAYMENT_MANAGER: 'paymentManager',
});

/** The member-facing noun for the TaskManager's balance. Matches /treasury's "Fund task rewards". */
export const BOUNTY_POOL_LABEL = 'task-reward pool';

/** `/voting?propose=fund-bounties` — opens the wizard on this mode (from /treasury). */
export const FUND_BOUNTIES_DEEP_LINK = 'fund-bounties';

/**
 * The ballot a payout is voted on — ONE pair per destination, used for the on-chain option
 * names, the review screen and the config step alike, so voters never see a wording the
 * creator did not.
 */
export const TRANSFER_OPTION_NAMES = Object.freeze(['Yes — send the money', 'No — keep it in the treasury']);
export const BOUNTY_POOL_OPTION_NAMES = Object.freeze(['Yes — move the money', 'No — keep it in the treasury']);

export function transferOptionNames(destination) {
  return destination === TRANSFER_DESTINATION.BOUNTY_POOL
    ? [...BOUNTY_POOL_OPTION_NAMES]
    : [...TRANSFER_OPTION_NAMES];
}

/** A distribution is CLOSEABLE for free when every claim on it has been paid. */
const PAYMENT_MANAGER_ABI = [
  'function withdraw(address token, address to, uint256 amount)',
  'function finalizeDistribution(uint256 distributionId, uint256 minClaimPeriodBlocks)',
];
const ERC20_ABI = ['function transfer(address to, uint256 amount)'];

export const paymentManagerInterface = new utils.Interface(PAYMENT_MANAGER_ABI);
export const erc20Interface = new utils.Interface(ERC20_ABI);

const toBig = (v) => {
  if (v === null || v === undefined || v === '') return 0n;
  try {
    return BigInt(typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : v);
  } catch {
    return 0n;
  }
};

const maxBig = (a, b) => (a > b ? a : b);

/**
 * Checksum an address that may arrive in any casing. Config addresses (e.g. the Gnosis USDC entry
 * in networks.js) are not all checksummed, and `getAddress` REJECTS mixed-case input whose
 * checksum is wrong rather than fixing it — lowercasing first makes it re-derive the checksum.
 */
const checksum = (address) => utils.getAddress(String(address).toLowerCase());

/** '' / null / the zero address all mean the chain's native currency. */
export function isNativeToken(token) {
  if (!token) return true;
  return String(token).toLowerCase() === constants.AddressZero;
}

const sameToken = (a, b) => {
  if (isNativeToken(a) && isNativeToken(b)) return true;
  if (isNativeToken(a) || isNativeToken(b)) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
};

const shortAddress = (address) => {
  const a = String(address || '');
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return a;
  const checked = checksum(a);
  return `${checked.slice(0, 6)}…${checked.slice(-4)}`;
};

/**
 * `parseUnits` throws a raw ethers error ("fractional component exceeds decimals") AFTER every
 * wizard gate has passed. This is the same check as a sentence, for the config step.
 *
 * @returns {string|null} the reason, or null when the amount is representable
 */
export function amountDecimalsError(amount, decimals, symbol = 'tokens') {
  const s = String(amount ?? '').trim();
  if (!s) return null;
  const d = Number(decimals);
  if (!Number.isFinite(d)) return null;
  const match = s.match(/^\d*(?:\.(\d*))?$/);
  if (!match) return null; // not a number at all — the positive-amount check owns that message
  const fraction = match[1] || '';
  if (fraction.length > d) {
    return d === 0
      ? `${symbol} has no decimal places.`
      : `${symbol} only supports ${d} decimal place${d === 1 ? '' : 's'}.`;
  }
  return null;
}

/**
 * The amount in base units, or null when it cannot be represented (the reason is what
 * `amountDecimalsError` says).
 *
 * @returns {bigint|null}
 */
export function amountToWei(amount, decimals) {
  const s = String(amount ?? '').trim();
  if (!s || amountDecimalsError(s, decimals) !== null) return null;
  try {
    return BigInt(utils.parseUnits(s, Number(decimals)).toString());
  } catch {
    return null;
  }
}

/**
 * What the PaymentManager can actually pay out for one token.
 *
 * @param {object} opts
 * @param {string|bigint} opts.balance - `token.balanceOf(paymentManager)` (native: its ETH balance)
 * @param {Array<{ id: string|number, payoutToken: string, totalAmount: string|bigint,
 *                 totalClaimed: string|bigint, finalized: boolean }>} [opts.distributions]
 * @param {string} [opts.token] - '' for native
 * @returns {{ balance: string, committed: string, spendable: string, releasable: string,
 *             releaseIds: string[], spendableAfterRelease: string }} decimal strings
 */
export function paymentManagerAvailability({ balance, distributions = [], token = '' } = {}) {
  const bal = toBig(balance);
  let committed = 0n;
  let releasable = 0n;
  const releaseIds = [];
  for (const d of distributions || []) {
    if (!d || d.finalized) continue;
    if (!sameToken(d.payoutToken, token)) continue;
    const total = toBig(d.totalAmount);
    committed += total;
    if (total > 0n && toBig(d.totalClaimed) >= total) {
      releasable += total;
      releaseIds.push(String(d.id));
    }
  }
  const spendable = maxBig(0n, bal - committed);
  // `totalCommitted` is NOT decremented by claims (only by finalize), while the balance IS, so
  // `balance < committed` is the normal state after any claim. Closing the fully-claimed rounds
  // lowers the commitment; the ceiling after that is balance minus what is STILL committed —
  // never "spendable plus released", which would double-count claims already paid out.
  const spendableAfterRelease = maxBig(0n, bal - (committed - releasable));
  return {
    balance: bal.toString(),
    committed: committed.toString(),
    spendable: spendable.toString(),
    releasable: releasable.toString(),
    releaseIds,
    spendableAfterRelease: spendableAfterRelease.toString(),
  };
}

/**
 * Which pot pays, given the live balances.
 *
 * Auto mode prefers the Executor (one plain call, no accounting), then the PaymentManager's
 * spendable balance, then the PaymentManager after closing its fully-claimed distributions.
 * A `preferred` source is honoured when it can cover the amount and falls back otherwise.
 *
 * @param {object} opts
 * @param {bigint|string} opts.amountWei
 * @param {string|bigint} [opts.executorBalance]
 * @param {object} [opts.paymentManager] - a `paymentManagerAvailability` result
 * @param {string} [opts.preferred] - TRANSFER_SOURCE value
 * @returns {{ ok: boolean, source: string, finalizeIds: string[], shortfall: string,
 *             covers: { executor: boolean, paymentManager: boolean } }}
 */
export function resolveTransferSource({ amountWei, executorBalance = '0', paymentManager = null, preferred } = {}) {
  const amount = toBig(amountWei);
  const exec = toBig(executorBalance);
  const pm = paymentManager || paymentManagerAvailability({ balance: '0' });
  const pmSpendable = toBig(pm.spendable);
  const pmAfterRelease = toBig(pm.spendableAfterRelease);

  const executorCovers = amount > 0n && exec >= amount;
  const pmCovers = amount > 0n && pmSpendable >= amount;
  const pmCoversAfterRelease = amount > 0n && pmAfterRelease >= amount;

  const candidates = [];
  if (executorCovers) candidates.push({ source: TRANSFER_SOURCE.EXECUTOR, finalizeIds: [] });
  if (pmCovers) candidates.push({ source: TRANSFER_SOURCE.PAYMENT_MANAGER, finalizeIds: [] });
  else if (pmCoversAfterRelease) candidates.push({ source: TRANSFER_SOURCE.PAYMENT_MANAGER, finalizeIds: [...pm.releaseIds] });

  let pick = candidates.find((c) => c.source === preferred) || candidates[0] || null;

  if (!pick) {
    const best = maxBig(exec, pmAfterRelease);
    return {
      ok: false,
      // The historical default — a fallback that at least encodes the same call it always did.
      source: preferred || TRANSFER_SOURCE.EXECUTOR,
      finalizeIds: [],
      shortfall: (amount - best).toString(),
      covers: { executor: executorCovers, paymentManager: pmCoversAfterRelease },
    };
  }
  return {
    ok: true,
    source: pick.source,
    finalizeIds: pick.finalizeIds,
    shortfall: '0',
    covers: { executor: executorCovers, paymentManager: pmCoversAfterRelease },
  };
}

/**
 * The calls a passed "send money" vote will run, plus the sentences voters read.
 *
 * @param {object} opts
 * @param {string} opts.source - TRANSFER_SOURCE value
 * @param {string} [opts.token] - ERC20 address, or '' for native
 * @param {number} opts.decimals
 * @param {string} opts.symbol
 * @param {string} opts.amount - human units, as typed
 * @param {string} opts.recipient - where the money goes (the TaskManager for the bounty pool)
 * @param {string} [opts.paymentManagerAddress] - required for the PaymentManager source
 * @param {string[]} [opts.finalizeIds] - fully-claimed distributions to close first
 * @param {string} [opts.destination] - TRANSFER_DESTINATION value (copy only)
 * @returns {{ batch: Array<{target: string, value: string, data: string}>, summaries: string[],
 *             gasLimit: number, warnings: string[] }}
 */
export function buildTreasuryTransferBatch({
  source = TRANSFER_SOURCE.EXECUTOR,
  token = '',
  decimals = 18,
  symbol = '',
  amount,
  recipient,
  paymentManagerAddress,
  finalizeIds = [],
  destination = TRANSFER_DESTINATION.ADDRESS,
} = {}) {
  if (!recipient || !utils.isAddress(recipient)) {
    throw new Error('Please enter a valid recipient address.');
  }
  const decimalsError = amountDecimalsError(amount, decimals, symbol || 'This asset');
  if (decimalsError) throw new Error(decimalsError);
  const wei = amountToWei(amount, decimals);
  if (wei === null || wei <= 0n) throw new Error('Please enter a valid transfer amount.');

  const native = isNativeToken(token);
  const to = checksum(recipient);
  const batch = [];
  const summaries = [];
  const warnings = [];

  const where = destination === TRANSFER_DESTINATION.BOUNTY_POOL
    ? `the ${BOUNTY_POOL_LABEL}`
    : shortAddress(to);
  const verb = destination === TRANSFER_DESTINATION.BOUNTY_POOL ? 'move' : 'send';

  if (source === TRANSFER_SOURCE.PAYMENT_MANAGER) {
    if (!paymentManagerAddress || !utils.isAddress(paymentManagerAddress)) {
      throw new Error("This group's treasury isn't set up for payouts by vote yet.");
    }
    const pm = checksum(paymentManagerAddress);
    for (const id of finalizeIds || []) {
      batch.push({
        target: pm,
        value: '0',
        data: paymentManagerInterface.encodeFunctionData('finalizeDistribution', [BigInt(id).toString(), 0]),
      });
    }
    batch.push({
      target: pm,
      value: '0',
      data: paymentManagerInterface.encodeFunctionData('withdraw', [
        native ? constants.AddressZero : checksum(token),
        to,
        wei.toString(),
      ]),
    });
    if ((finalizeIds || []).length > 0) {
      const ids = finalizeIds.map((id) => `#${id}`).join(', ');
      summaries.push(
        `Closes fully-claimed payout ${finalizeIds.length === 1 ? ids : `rounds ${ids}`} first — nobody is owed anything from ${finalizeIds.length === 1 ? 'it' : 'them'}, this only frees the reserved ${symbol}.`,
      );
    }
    // The batch is fixed at creation and runs when the votes are counted; the treasury is not.
    warnings.push(
      `Based on what the treasury holds today. If its balance or payout rounds change before the votes are counted, the move will not run.`,
    );
  } else if (native) {
    batch.push({ target: to, value: wei.toString(), data: '0x' });
  } else {
    batch.push({
      target: checksum(token),
      value: '0',
      data: erc20Interface.encodeFunctionData('transfer', [to, wei.toString()]),
    });
  }

  summaries.push(`If Yes wins, ${verb} ${amount} ${symbol} from the treasury to ${where}.`);

  return { batch, summaries, gasLimit: estimateBatchGas(batch), warnings };
}

/**
 * Auto-copy for the details step, so the title and description describe the same decision the
 * batch encodes.
 */
export function treasuryTransferCopy({ amount, symbol, recipient, destination } = {}) {
  if (destination === TRANSFER_DESTINATION.BOUNTY_POOL) {
    return {
      title: `Move ${amount} ${symbol} to the ${BOUNTY_POOL_LABEL}`,
      description:
        `If this vote passes, ${amount} ${symbol} moves from the treasury into the ${BOUNTY_POOL_LABEL}. `
        + 'It can only leave again as payment for a completed task.',
    };
  }
  const short = shortAddress(recipient);
  return {
    title: `Send ${amount} ${symbol} to ${short}`,
    description: `If this vote passes, ${amount} ${symbol} goes from the treasury to ${short}.`,
  };
}
