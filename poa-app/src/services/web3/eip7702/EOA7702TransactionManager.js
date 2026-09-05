/**
 * EOA7702TransactionManager
 * Drop-in replacement for TransactionManager for EOA users with EIP-7702 gas sponsorship.
 *
 * Same execute(contract, method, args, options) API as TransactionManager
 * and SmartAccountTransactionManager. Wraps calls in EOADelegation.execute(),
 * builds a UserOp with paymaster data, signs the 7702 authorization + UserOp
 * with the wallet, and submits to the bundler.
 */

import { encodeFunctionData } from 'viem';
import { TransactionResult, TransactionState } from '../core/TransactionManager';
import PasskeyAccountABI from '../../../../abi/PasskeyAccount.json';
import { buildUserOpWithFallback, getUserOpHash } from '../passkey/userOpBuilder';
import { isPaymasterRejection } from '../passkey/sponsorshipBudget';
import { describeReceiptFailure } from '../passkey/receiptFailure';
import { decodeContractRevert, decodeRevertData } from '../../../lib/errors/contractErrors';
import { encodeHatPaymasterData, encodeClaimPaymasterData } from '../passkey/paymasterData';
import { ENTRY_POINT_ADDRESS } from '../../../config/passkey';
import { signUserOpWithWallet } from './walletSigner';
import { buildEOAAuthorization } from './authorizationBuilder';

// PasskeyAccount and EOADelegation share the same execute ABI (selector 0xb61d27f6)
const EXECUTE_ABI = PasskeyAccountABI;

/**
 * ERC-4337 error code mappings (same as SmartAccountTransactionManager)
 */
const AA_ERROR_MESSAGES = {
  AA21: 'Account delegation not active. Your wallet may need to approve the delegation.',
  AA25: 'Signature validation failed. Please try signing again.',
  AA31: 'Gas sponsor rejected the transaction. The organization may have run out of gas budget.',
  AA33: 'Gas sponsor rejected the transaction. The organization may have run out of gas budget.',
  AA40: 'Verification gas limit too low.',
  AA41: 'Transaction exceeds gas limits.',
  AA51: 'Your account needs native tokens to pay for gas.',
};

/**
 * Turn a decoded revert into a display string (curated message → raw require
 * string → "Contract error: <Name>"), or null.
 */
function friendly7702FromDecoded(d) {
  if (!d) return null;
  if (d.message) return d.message;
  if (d.isStringError && d.reason) return d.reason;
  if (d.name && d.name !== 'Error' && d.name !== 'Panic') return `Contract error: ${d.name}`;
  return null;
}

export class EOA7702TransactionManager {
  /**
   * @param {Object} params
   * @param {string} params.accountAddress - EOA wallet address
   * @param {Object} params.walletClient - viem WalletClient from wagmi
   * @param {Object} params.publicClient - viem public client
   * @param {Object} params.bundlerClient - Pimlico bundler client
   * @param {string} params.paymasterAddress - PaymasterHub proxy address
   * @param {string} params.orgId - Current org ID (bytes32)
   * @param {string[]} params.hatIds - User's hat IDs for hat-scoped paymaster budget
   * @param {number} params.chainId - Chain ID for UserOp hash computation
   * @param {string} params.eoaDelegationAddress - EOADelegation contract address
   */
  /**
   * @param {Object} params.fallbackTxManager - Standard TransactionManager for direct tx fallback
   * @param {Function} params.on7702Disabled - Called when 7702 fails permanently (wallet unsupported)
   * @param {Function} [params.ensureChain] - Optional org-chain guard injected by useWeb3Services.
   *   Called before we sign the 7702 authorization (whose chainId comes from the signing
   *   client's chain) or the UserOp, so the wallet is guaranteed to be on the org chain and
   *   a freshly-bound walletClient is used. Returns `{ walletClient, signer }` bound to the
   *   org chain, or null for "nothing to enforce". Fails closed: a rejected/failed switch or a
   *   chain-validation failure THROWS here rather than signing against the wrong chain.
   */
  constructor({ accountAddress, walletClient, publicClient, bundlerClient, paymasterAddress, orgId, hatIds, chainId, eoaDelegationAddress, fallbackTxManager, on7702Disabled, ensureChain }) {
    this.accountAddress = accountAddress;
    this.walletClient = walletClient;
    this.publicClient = publicClient;
    this.bundlerClient = bundlerClient;
    this.paymasterAddress = paymasterAddress;
    this.orgId = orgId;
    this.hatIds = hatIds;
    this.chainId = chainId;
    this.eoaDelegationAddress = eoaDelegationAddress;
    this.fallbackTxManager = fallbackTxManager;
    this.on7702Disabled = on7702Disabled;
    this.ensureChain = ensureChain || null;
    this._paymasterFellBack = false;
  }

  /**
   * Ensure the wallet is on the org chain and reacquire a walletClient freshly
   * bound to it BEFORE we sign the 7702 authorization or the UserOp. Returns the
   * active { walletClient, accountAddress } to use for this send. Fails closed:
   * an ensureChain throw (rejected switch, chain mismatch) propagates to execute()'s
   * catch and is surfaced — it is NOT treated as a 7702-unsupported fallback.
   */
  async _resolveActiveWallet() {
    if (!this.ensureChain) {
      return { walletClient: this.walletClient, accountAddress: this.accountAddress };
    }
    const bound = await this.ensureChain();
    // null = nothing to enforce (E2E pre-pinned burner / non-org route) — keep ambient.
    if (!bound?.walletClient) {
      return { walletClient: this.walletClient, accountAddress: this.accountAddress };
    }
    return {
      walletClient: bound.walletClient,
      accountAddress: bound.walletClient.account?.address || this.accountAddress,
    };
  }

  /**
   * Execute a contract transaction via EIP-7702 + ERC-4337 UserOp.
   * Same signature as TransactionManager.execute().
   */
  async execute(contract, method, args = [], options = {}) {
    const {
      onStateChange,
      paymasterHatIds: overrideHatIds,
      paymasterClaimTarget,
      callGasLimit,
      callGasLimitMultiplier,
      callGasLimitFloor,
    } = options;

    try {
      this._notifyState(onStateChange, TransactionState.ESTIMATING);

      // 0. Bind to the org chain and reacquire a fresh walletClient BEFORE signing.
      // The 7702 authorization's chainId is derived from the signing client's chain,
      // so a wallet still on the home chain would sign for the wrong network.
      const { walletClient, accountAddress } = await this._resolveActiveWallet();

      // 1. ABI-encode the target call
      const targetAddress = contract.address;
      const targetCallData = contract.interface.encodeFunctionData(method, args);

      // 2. Wrap in execute(target, 0, data) — same selector as PasskeyAccount
      const callData = encodeFunctionData({
        abi: EXECUTE_ABI,
        functionName: 'execute',
        args: [targetAddress, 0n, targetCallData],
      });

      // 3. Build 7702 authorization (wallet signs delegation to EOADelegation)
      const authorization = await buildEOAAuthorization(walletClient, this.eoaDelegationAddress);

      // 4. Build UserOp with paymaster fallback
      const userOp = await this._buildUserOpWithFallback(callData, authorization, overrideHatIds, paymasterClaimTarget, {
        callGasLimit,
        callGasLimitMultiplier,
        callGasLimitFloor,
      }, accountAddress);

      // 5. Sign UserOp hash with wallet (ECDSA via personal_sign)
      this._notifyState(onStateChange, TransactionState.AWAITING_SIGNATURE);
      const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, this.chainId);
      const signature = await signUserOpWithWallet(userOpHash, walletClient);
      userOp.signature = signature;

      // 6. Submit to bundler (self-funded retry if the paymaster refuses at submission)
      this._notifyState(onStateChange, TransactionState.PENDING);
      const submittedHash = await this._sendWithSelfFundedRetry(userOp, {
        callData,
        authorization,
        onStateChange,
        gasOverrides: { callGasLimit, callGasLimitMultiplier, callGasLimitFloor },
        walletClient,
        accountAddress,
      });

      console.log(`[7702] UserOp submitted: ${submittedHash}`);

      // 7. Wait for receipt
      this._notifyState(onStateChange, TransactionState.CONFIRMING);
      const receipt = await this.bundlerClient.waitForUserOperationReceipt({
        hash: submittedHash,
        timeout: 120_000,
      });

      if (!receipt.success) {
        const error = this._parseAAError(describeReceiptFailure(receipt.reason, 'UserOp execution failed'), null, contract?.interface);
        this._notifyState(onStateChange, TransactionState.ERROR, { error });
        return TransactionResult.failure(error);
      }

      const txReceipt = receipt.receipt;
      this._notifyState(onStateChange, TransactionState.SUCCESS, {
        receipt: txReceipt,
        txHash: txReceipt.transactionHash,
      });

      console.log(`[7702] Confirmed: ${txReceipt.transactionHash}`);
      return TransactionResult.success(txReceipt);

    } catch (error) {
      // Unsupported 7702 is an expected capability fallback, not a failed user
      // transaction. Keep it out of the error channel so the console reflects
      // whether the direct fallback actually succeeds or fails.
      if (error.message === 'WALLET_7702_UNSUPPORTED' && this.fallbackTxManager) {
        console.warn('[7702] Wallet does not support EIP-7702, falling back to direct transaction');
        this.on7702Disabled?.();
        return this.fallbackTxManager.execute(contract, method, args, options);
      }

      console.error('[7702] Transaction error:', error.message);
      const parsedError = this._parseAAError(error.message || 'Unknown error', error, contract?.interface);
      this._notifyState(onStateChange, TransactionState.ERROR, { error: parsedError });
      return TransactionResult.failure(parsedError);
    }
  }

  /**
   * Execute multiple calls atomically via executeBatch.
   */
  async executeBatch(transactions, batchOptions = {}) {
    const { onStateChange, callGasLimit, callGasLimitMultiplier, callGasLimitFloor } = batchOptions;

    try {
      this._notifyState(onStateChange, TransactionState.ESTIMATING);

      // Bind to the org chain + reacquire a fresh walletClient before signing (see execute()).
      const { walletClient, accountAddress } = await this._resolveActiveWallet();

      const targets = [];
      const values = [];
      const datas = [];
      for (const tx of transactions) {
        targets.push(tx.contract.address);
        values.push(0n);
        datas.push(tx.contract.interface.encodeFunctionData(tx.method, tx.args || []));
      }

      const callData = encodeFunctionData({
        abi: EXECUTE_ABI,
        functionName: 'executeBatch',
        args: [targets, values, datas],
      });

      const authorization = await buildEOAAuthorization(walletClient, this.eoaDelegationAddress);
      const userOp = await this._buildUserOpWithFallback(callData, authorization, null, null, {
        callGasLimit,
        callGasLimitMultiplier,
        callGasLimitFloor,
      }, accountAddress);

      this._notifyState(onStateChange, TransactionState.AWAITING_SIGNATURE);
      const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, this.chainId);
      const signature = await signUserOpWithWallet(userOpHash, walletClient);
      userOp.signature = signature;

      this._notifyState(onStateChange, TransactionState.PENDING);
      const submittedHash = await this._sendWithSelfFundedRetry(userOp, {
        callData,
        authorization,
        onStateChange,
        gasOverrides: { callGasLimit, callGasLimitMultiplier, callGasLimitFloor },
        walletClient,
        accountAddress,
      });

      this._notifyState(onStateChange, TransactionState.CONFIRMING);
      const receipt = await this.bundlerClient.waitForUserOperationReceipt({
        hash: submittedHash,
        timeout: 120_000,
      });

      if (!receipt.success) {
        const error = this._parseAAError(describeReceiptFailure(receipt.reason, 'Batch execution failed'));
        this._notifyState(onStateChange, TransactionState.ERROR, { error });
        return TransactionResult.failure(error);
      }

      const txReceipt = receipt.receipt;
      this._notifyState(onStateChange, TransactionState.SUCCESS, {
        receipt: txReceipt,
        txHash: txReceipt.transactionHash,
      });
      return TransactionResult.success(txReceipt);

    } catch (error) {
      if (error.message === 'WALLET_7702_UNSUPPORTED' && this.fallbackTxManager) {
        console.warn('[7702] Wallet does not support EIP-7702, falling back to direct batch');
        this.on7702Disabled?.();
        return this.fallbackTxManager.executeBatch(transactions, batchOptions);
      }
      const parsedError = this._parseAAError(error.message || 'Unknown error', error);
      this._notifyState(onStateChange, TransactionState.ERROR, { error: parsedError });
      return TransactionResult.failure(parsedError);
    }
  }

  /**
   * Submission-time twin of the builder's estimation-time fallback — see
   * SmartAccountTransactionManager._sendWithSelfFundedRetry for why the paymaster can refuse an
   * op whose estimate passed. Wallet-signed here (ECDSA), so the retry costs one more signature.
   */
  async _sendWithSelfFundedRetry(userOp, { callData, authorization, onStateChange, gasOverrides = {}, walletClient = this.walletClient, accountAddress = this.accountAddress }) {
    try {
      const hash = await this.bundlerClient.sendUserOperation({ ...userOp, entryPointAddress: ENTRY_POINT_ADDRESS });
      this._paymasterFellBack = false;
      this._paymasterRejection = null;
      return hash;
    } catch (e) {
      if (!userOp.paymaster || !isPaymasterRejection(e)) throw e;
      console.warn('[7702] Paymaster refused at submission; retrying self-funded:', e.shortMessage || e.message);
      this._paymasterFellBack = true;
      this._paymasterRejection = e;

      let retry;
      try {
        retry = await buildUserOpWithFallback({
          sender: accountAddress,
          callData,
          bundlerClient: this.bundlerClient,
          publicClient: this.publicClient,
          authorization,
          dummySignatureLength: 65,
          gasOverrides,
        });
      } catch (buildErr) {
        if (!buildErr.paymasterRejection) {
          Object.defineProperty(buildErr, 'paymasterRejection', { value: e, enumerable: false });
        }
        throw buildErr;
      }
      Object.defineProperty(retry, 'paymasterRejection', { value: e, enumerable: false });

      this._notifyState(onStateChange, TransactionState.AWAITING_SIGNATURE);
      retry.signature = await signUserOpWithWallet(getUserOpHash(retry, ENTRY_POINT_ADDRESS, this.chainId), walletClient);
      this._notifyState(onStateChange, TransactionState.PENDING);
      const hash = await this.bundlerClient.sendUserOperation({ ...retry, entryPointAddress: ENTRY_POINT_ADDRESS });
      this._paymasterFellBack = false;
      this._paymasterRejection = null;
      return hash;
    }
  }

  async _buildUserOpWithFallback(callData, authorization, overrideHatIds = null, claimTarget = null, gasOverrides = {}, accountAddress = this.accountAddress) {
    // Reset per-transaction: the instance is reused, and a stale fell-back flag
    // would mislabel an unrelated later failure as a sponsorship problem.
    this._paymasterFellBack = false;
    this._paymasterRejection = null;

    const effectiveHatIds = overrideHatIds?.length > 0 ? overrideHatIds : this.hatIds;
    const hasPaymaster = this.paymasterAddress && this.orgId && (claimTarget || effectiveHatIds?.length > 0);

    // CLAIM subject first (no eligibility pre-check; required for a first-role claim by a
    // not-yet-eligible account), then the hat-subject entries as fallbacks.
    const paymasterDataEntries = hasPaymaster
      ? [
          ...(claimTarget ? [encodeClaimPaymasterData({ claimTarget, orgId: this.orgId })] : []),
          ...(effectiveHatIds || []).map((hatId) => encodeHatPaymasterData({ hatId, orgId: this.orgId })),
        ]
      : [];

    const userOp = await buildUserOpWithFallback({
      sender: accountAddress,
      callData,
      bundlerClient: this.bundlerClient,
      publicClient: this.publicClient,
      authorization, // 7702 authorization — bundler includes in type-4 tx
      ...(hasPaymaster ? {
        paymasterAddress: this.paymasterAddress,
        paymasterDataEntries,
      } : {}),
      dummySignatureLength: 65, // ECDSA signature is 65 bytes, not 640 (passkey)
      gasOverrides,
    });

    this._paymasterFellBack = hasPaymaster && !userOp.paymaster;
    this._paymasterRejection = userOp.paymasterRejection || null;
    return userOp;
  }

  _parseAAError(message, originalError = null, iface = null) {
    const text = message || '';

    // 7702-specific error: wallet doesn't support delegation
    if (text === 'WALLET_7702_UNSUPPORTED') {
      return {
        category: 'delegation_unsupported',
        userMessage: 'Your wallet does not support gas sponsorship (EIP-7702). The transaction was not sent. Please try again — it will use your own gas.',
        technicalMessage: text,
        originalError,
      };
    }

    // User rejected the delegation or signing prompt
    if (text.includes('User rejected') || text.includes('user rejected') ||
        text.includes('User denied') || text.includes('denied by user') ||
        originalError?.code === 4001) {
      return {
        category: 'user_rejected',
        userMessage: 'Transaction was cancelled.',
        technicalMessage: text,
        originalError,
      };
    }

    // Decode the underlying contract revert reason (the real "why") before
    // falling back to AA codes / generic copy. Same fix as the passkey path.
    const contractReason = this._decodeContractRevertMessage(text, originalError, iface);
    if (contractReason) {
      return {
        category: 'contract_revert',
        userMessage: contractReason,
        technicalMessage: text,
        originalError,
      };
    }

    // ERC-4337 AA error codes — compose the real sponsorship denial (e.g.
    // PaymasterHub RuleDenied) into the message when the op fell back to
    // self-funded, instead of a bare "no funds".
    const fellBack = this._paymasterFellBack || !!originalError?.paymasterRejection;
    for (const [code, userMessage] of Object.entries(AA_ERROR_MESSAGES)) {
      if (text.includes(code)) {
        return {
          category: 'smart_account_error',
          userMessage: fellBack
            ? (this._composeFallbackMessage(originalError)
                || 'Gas sponsorship was unavailable and your account has no funds for gas.')
            : userMessage,
          technicalMessage: text,
          originalError,
        };
      }
    }
    return {
      category: 'unknown_error',
      userMessage: text.length > 200 ? 'Transaction failed. Please try again.' : text,
      technicalMessage: text,
      originalError,
    };
  }

  /**
   * Decode WHY the paymaster refused sponsorship (captured by userOpBuilder
   * during the fallback) into accurate copy. Wallet-flavored: 7702 users have
   * a real wallet that can hold gas funds. Mirrors the passkey manager.
   */
  _composeFallbackMessage(originalError = null) {
    const e = this._paymasterRejection || originalError?.paymasterRejection;
    if (!e) return null;
    const text = [
      e.message,
      e.shortMessage,
      e.details,
      e.cause?.shortMessage,
      e.cause?.details,
      e.cause?.message,
    ].filter(Boolean).join('\n');
    const d = decodeContractRevert(e, text, null);
    if (!d) return null;
    if (d.name === 'RuleDenied') {
      return "The organization doesn't sponsor gas for this action, and your wallet has no funds to pay for gas "
        + 'on this network. An admin can add this action to the sponsored-gas list, or you can add funds.';
    }
    if (d.name === 'BudgetExceeded') {
      return 'Your role has used up its sponsored-gas allowance for this period, and your wallet has no funds '
        + 'to pay for gas on this network. The allowance refills on a schedule — or an admin can raise it.';
    }
    const friendly = friendly7702FromDecoded(d);
    return friendly
      ? `${friendly} Your wallet also has no funds to pay for gas on this network.`
      : null;
  }

  /**
   * Pull a friendly contract-revert message out of a failed UserOp. Mirrors the
   * passkey SmartAccountTransactionManager implementation.
   */
  _decodeContractRevertMessage(message, originalError, iface) {
    if (originalError?.revertData) {
      const d = decodeRevertData(originalError.revertData, iface);
      const m = friendly7702FromDecoded(d);
      if (m) return m;
    }
    const text = [
      message,
      originalError?.shortMessage,
      originalError?.details,
      originalError?.cause?.shortMessage,
      originalError?.cause?.details,
      originalError?.cause?.message,
    ].filter(Boolean).join('\n');
    return friendly7702FromDecoded(decodeContractRevert(originalError, text, iface));
  }

  _notifyState(callback, state, data = {}) {
    if (callback) callback(state, data);
  }
}

export function createEOA7702TransactionManager(params) {
  return new EOA7702TransactionManager(params);
}
