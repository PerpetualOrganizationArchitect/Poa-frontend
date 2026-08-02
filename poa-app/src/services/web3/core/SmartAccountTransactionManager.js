/**
 * SmartAccountTransactionManager
 * Drop-in replacement for TransactionManager for passkey (ERC-4337) users.
 *
 * Implements the same execute(contract, method, args, options) API.
 * Instead of sending a direct transaction, it wraps calls inside
 * PasskeyAccount.execute() → builds a UserOp → signs with passkey → submits to bundler.
 */

import { encodeFunctionData } from 'viem';
import { TransactionResult, TransactionState } from './TransactionManager';
import PasskeyAccountABI from '../../../../abi/PasskeyAccount.json';
import { buildUserOpWithFallback, getUserOpHash } from '../passkey/userOpBuilder';
import { decodeContractRevert, decodeRevertData } from '../../../lib/errors/contractErrors';
import { signUserOpWithPasskey } from '../passkey/passkeySign';
import { encodeHatPaymasterData, encodeClaimPaymasterData } from '../passkey/paymasterData';
import { ENTRY_POINT_ADDRESS } from '../../../config/passkey';
import { NETWORKS, DEFAULT_NETWORK } from '../../../config/networks';

/**
 * ERC-4337 error code mappings.
 * AA21 is about prefund/gas (the account didn't pay the bundler), not account
 * existence — AA20 is the "account not deployed" code. Keep AA21 framed as a gas
 * issue so users don't get told to "create their account" when their account is
 * already there and the real problem is funding.
 */
const AA_ERROR_MESSAGES = {
  AA20: 'Account not deployed. Try signing in again.',
  AA21: 'Gas sponsorship is unavailable for this transaction and your account has no funds to pay for gas.',
  AA25: 'Signature validation failed. Please try signing again.',
  AA31: 'Gas sponsor rejected the transaction. The organization may have run out of gas budget.',
  AA33: 'Gas sponsor rejected the transaction. The organization may have run out of gas budget.',
  AA40: 'Verification gas limit too low.',
  AA41: 'Transaction exceeds gas limits.',
  AA51: 'Prefund not available. Your account needs funds to pay for gas.',
};

/**
 * When paymaster falls back to self-funded and self-funded also fails,
 * the real issue is usually that the account has no native tokens.
 * These AA codes get a more specific message in that scenario.
 */
const AA_FALLBACK_MESSAGES = {
  AA21: 'Gas sponsorship was unavailable and your account has no funds to pay for gas.',
  AA51: 'Gas sponsorship was unavailable and your account has no funds to pay for gas.',
};

/**
 * Turn a decodeRevertData/decodeContractRevert result into a display string,
 * or null when there's nothing meaningful to show. Mirrors the EOA path's
 * fallback (curated message → raw require string → "Contract error: <Name>").
 */
function friendlyFromDecoded(d) {
  if (!d) return null;
  if (d.message) return d.message;
  if (d.isStringError && d.reason) return d.reason;
  if (d.name && d.name !== 'Error' && d.name !== 'Panic') return `Contract error: ${d.name}`;
  return null;
}

export class SmartAccountTransactionManager {
  /**
   * @param {Object} params
   * @param {string} params.accountAddress - Smart account address
   * @param {string} params.rawCredentialId - base64url credential ID for signing
   * @param {Object} params.publicClient - viem public client
   * @param {Object} params.bundlerClient - Pimlico bundler client
   * @param {string} params.paymasterAddress - PaymasterHub proxy address
   * @param {string} [params.orgId] - Current org ID (bytes32) for paymaster data
   * @param {string[]} [params.hatIds] - User's hat IDs for hat-scoped paymaster budget (tries each before self-pay)
   * @param {number} [params.chainId] - Chain ID for UserOp hash (defaults to home chain)
   * @param {string} [params.initCode='0x'] - initCode for cross-chain account deployment
   */
  constructor({ accountAddress, rawCredentialId, publicClient, bundlerClient, paymasterAddress, orgId = null, hatIds = null, chainId = null, initCode = '0x' }) {
    this.accountAddress = accountAddress;
    this.rawCredentialId = rawCredentialId;
    this.publicClient = publicClient;
    this.bundlerClient = bundlerClient;
    this.paymasterAddress = paymasterAddress;
    this.orgId = orgId;
    this.hatIds = hatIds;
    this.chainId = chainId || NETWORKS[DEFAULT_NETWORK].chainId;
    this.initCode = initCode;
  }

  /**
   * Execute a contract transaction via ERC-4337 UserOp.
   * Same signature as TransactionManager.execute().
   *
   * @param {ethers.Contract} contract - Contract instance (used for ABI encoding only)
   * @param {string} method - Method name to call
   * @param {Array} [args=[]] - Method arguments
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async execute(contract, method, args = [], options = {}) {
    const {
      onStateChange,
      paymasterHatIds: overrideHatIds,
      paymasterClaimTarget,
      value,
      callGasLimit,
      callGasLimitMultiplier,
    } = options;

    try {
      // State: Estimating
      this._notifyState(onStateChange, TransactionState.ESTIMATING);

      // 1. ABI-encode the target call
      const targetAddress = contract.address;
      const targetCallData = contract.interface.encodeFunctionData(method, args);

      // 2. Wrap in PasskeyAccount.execute(target, value, data)
      const callData = encodeFunctionData({
        abi: PasskeyAccountABI,
        functionName: 'execute',
        args: [targetAddress, value ? BigInt(value) : 0n, targetCallData],
      });

      // 3. Build UserOp — try with paymaster first, fall back to self-funded
      const userOp = await this._buildUserOpWithFallback(callData, overrideHatIds, paymasterClaimTarget, {
        callGasLimit,
        callGasLimitMultiplier,
      });

      // State: Awaiting signature (biometric prompt)
      this._notifyState(onStateChange, TransactionState.AWAITING_SIGNATURE);

      // 5. Compute UserOp hash and sign with passkey
      const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, this.chainId);
      const signature = await signUserOpWithPasskey(userOpHash, this.rawCredentialId);
      userOp.signature = signature;

      // State: Pending (submitting to bundler)
      this._notifyState(onStateChange, TransactionState.PENDING);

      // 6. Submit to bundler
      const userOpHashFromBundler = await this.bundlerClient.sendUserOperation({
        ...userOp,
        entryPointAddress: ENTRY_POINT_ADDRESS,
      });

      console.log(`UserOp submitted: ${userOpHashFromBundler}`);

      // State: Confirming
      this._notifyState(onStateChange, TransactionState.CONFIRMING);

      // 7. Wait for receipt
      const receipt = await this.bundlerClient.waitForUserOperationReceipt({
        hash: userOpHashFromBundler,
        timeout: 120_000,
      });

      if (!receipt.success) {
        const error = this._parseAAError(receipt.reason || 'UserOp execution failed', null, contract?.interface);
        this._notifyState(onStateChange, TransactionState.ERROR, { error });
        return TransactionResult.failure(error);
      }

      // State: Success
      const txReceipt = receipt.receipt;
      this._notifyState(onStateChange, TransactionState.SUCCESS, {
        receipt: txReceipt,
        txHash: txReceipt.transactionHash,
      });

      console.log(`UserOp confirmed: ${txReceipt.transactionHash} (block ${txReceipt.blockNumber})`);

      return TransactionResult.success(txReceipt);

    } catch (error) {
      console.error('=== SMART ACCOUNT TX ERROR ===');
      console.error('Method:', method);
      console.error('Args:', args);
      console.error('Error:', error.message);
      console.error('=== END SMART ACCOUNT TX ERROR ===');

      // Pass the target contract's interface so a contract revert (custom error
      // or require string) bubbled up from gas estimation decodes to its real reason.
      const parsedError = this._parseAAError(error.message || 'Unknown error', error, contract?.interface);
      this._notifyState(onStateChange, TransactionState.ERROR, { error: parsedError });

      return TransactionResult.failure(parsedError);
    }
  }

  /**
   * Execute multiple calls atomically via PasskeyAccount.executeBatch().
   *
   * @param {Array<{contract, method, args, options}>} transactions
   * @param {Object} [batchOptions={}]
   * @returns {Promise<TransactionResult>}
   */
  async executeBatch(transactions, batchOptions = {}) {
    const { onStateChange, callGasLimit, callGasLimitMultiplier } = batchOptions;

    try {
      this._notifyState(onStateChange, TransactionState.ESTIMATING);

      // Encode all target calls
      const targets = [];
      const values = [];
      const datas = [];

      for (const tx of transactions) {
        targets.push(tx.contract.address);
        values.push(0n);
        datas.push(tx.contract.interface.encodeFunctionData(tx.method, tx.args || []));
      }

      // Wrap in PasskeyAccount.executeBatch
      const callData = encodeFunctionData({
        abi: PasskeyAccountABI,
        functionName: 'executeBatch',
        args: [targets, values, datas],
      });

      // Build UserOp — try with paymaster first, fall back to self-funded
      const userOp = await this._buildUserOpWithFallback(callData, null, null, {
        callGasLimit,
        callGasLimitMultiplier,
      });

      this._notifyState(onStateChange, TransactionState.AWAITING_SIGNATURE);

      const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, this.chainId);
      const signature = await signUserOpWithPasskey(userOpHash, this.rawCredentialId);
      userOp.signature = signature;

      this._notifyState(onStateChange, TransactionState.PENDING);

      const userOpHashFromBundler = await this.bundlerClient.sendUserOperation({
        ...userOp,
        entryPointAddress: ENTRY_POINT_ADDRESS,
      });

      this._notifyState(onStateChange, TransactionState.CONFIRMING);

      const receipt = await this.bundlerClient.waitForUserOperationReceipt({
        hash: userOpHashFromBundler,
        timeout: 120_000,
      });

      if (!receipt.success) {
        const error = this._parseAAError(receipt.reason || 'Batch UserOp execution failed');
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
      console.error('=== SMART ACCOUNT BATCH TX ERROR ===');
      console.error('Error:', error.message);
      console.error('=== END SMART ACCOUNT BATCH TX ERROR ===');

      const parsedError = this._parseAAError(error.message || 'Unknown error', error);
      this._notifyState(onStateChange, TransactionState.ERROR, { error: parsedError });

      return TransactionResult.failure(parsedError);
    }
  }

  /**
   * Build a UserOp with paymaster-first-then-self-funded fallback.
   * Nonce + gas prices are fetched once; only estimation is retried on paymaster rejection.
   *
   * @param {string} callData - Encoded call data
   * @param {string[]} [overrideHatIds] - Override hat IDs for paymaster budget
   * @param {Object} [gasOverrides] - Optional gas overrides ({ callGasLimit, callGasLimitMultiplier })
   */
  async _buildUserOpWithFallback(callData, overrideHatIds = null, claimTarget = null, gasOverrides = {}) {
    // Use override hat IDs if provided (e.g., target hat for first role claim),
    // otherwise fall back to the user's current hats.
    const effectiveHatIds = overrideHatIds?.length > 0 ? overrideHatIds : this.hatIds;
    const hasPaymaster = this.paymasterAddress && this.orgId && (claimTarget || effectiveHatIds?.length > 0);

    console.log('[SmartAccountTxMgr] Paymaster check:', {
      hasPaymaster,
      paymasterAddress: this.paymasterAddress,
      orgId: this.orgId,
      hatIds: effectiveHatIds,
      accountAddress: this.accountAddress,
    });

    // Determine initCode: only include if account doesn't exist on-chain yet.
    // This handles cross-chain joins where the passkey account needs deployment.
    // Always check bytecode so we can provide a clear error when the account
    // isn't deployed and no initCode is available.
    let initCode = '0x';
    const bytecode = await this.publicClient.getBytecode({ address: this.accountAddress });
    const accountDeployed = bytecode && bytecode !== '0x';

    if (!accountDeployed) {
      if (this.initCode && this.initCode !== '0x') {
        initCode = this.initCode;
        console.log('[SmartAccountTxMgr] Cross-chain: including initCode for account deployment');
      } else {
        throw Object.assign(
          new Error('Smart account is not deployed on this chain and no deployment data is available. Please try again in a moment — the app may still be loading cross-chain data.'),
          { category: 'account_not_deployed' }
        );
      }
    }

    // Build paymaster data for each hat ID so the builder can try them all
    // CLAIM subject first (no eligibility pre-check; required for a first-role claim by a
    // not-yet-eligible account), then the hat-subject entries as fallbacks for orgs that predate
    // the CLAIM budget config.
    const paymasterDataEntries = hasPaymaster
      ? [
          ...(claimTarget ? [encodeClaimPaymasterData({ claimTarget, orgId: this.orgId })] : []),
          ...(effectiveHatIds || []).map((hatId) => encodeHatPaymasterData({ hatId, orgId: this.orgId })),
        ]
      : [];

    const userOp = await buildUserOpWithFallback({
      sender: this.accountAddress,
      callData,
      bundlerClient: this.bundlerClient,
      publicClient: this.publicClient,
      initCode,
      ...(hasPaymaster ? {
        paymasterAddress: this.paymasterAddress,
        paymasterDataEntries,
      } : {}),
      gasOverrides,
    });

    // Track whether paymaster was expected but the UserOp ended up self-funded.
    // This helps produce better error messages if self-funded execution also fails.
    this._paymasterFellBack = hasPaymaster && !userOp.paymaster;

    return userOp;
  }

  /**
   * Parse a failed UserOp into a user-friendly message.
   *
   * Resolution order:
   *   1. WebAuthn cancellation (user intent).
   *   2. The underlying CONTRACT revert reason — the real "why". Pimlico surfaces
   *      it inside the simulation error (e.g. "...reverted during simulation with
   *      reason: 0x08c379a0…" for an Error(string), or a 4-byte custom-error
   *      selector). Previously this was dropped and users saw a generic message.
   *   3. ERC-4337 AA error codes (prefund/gas/paymaster validation).
   *   4. Paymaster-specific failures.
   *   5. Generic fallback.
   *
   * @param {string} message - Error message text
   * @param {Error} [originalError] - Original error object (viem/bundler error)
   * @param {Object} [iface] - Target contract's ethers Interface for ABI decoding
   * @returns {Object} Parsed error with userMessage and technicalMessage
   */
  _parseAAError(message, originalError = null, iface = null) {
    const text = message || '';

    // 1. WebAuthn cancellation — highest priority (user intent, not a failure).
    if (text.includes('NotAllowedError') || text.includes('The operation either timed out or was not allowed')) {
      return {
        category: 'user_rejected',
        userMessage: 'Authentication cancelled.',
        technicalMessage: text,
        originalError,
      };
    }

    // 2. Disambiguate the shared BudgetExceeded selector.
    //
    // BudgetLib (a project's token budget) and PaymasterHubErrors (the org's gas
    // allowance) declare the same selector, so the shared map can only offer the
    // reader both meanings. Inside a paymaster validation revert we know it is the
    // gas one — say which, and what to do about it.
    if (/validatePaymasterUserOp|AA33/i.test(text)) {
      const reason = this._decodeContractRevertMessage(text, originalError, iface);
      if (reason && /BudgetExceeded|go over a configured budget/i.test(reason)) {
        return {
          category: 'paymaster_error',
          userMessage:
            'Your role has used up its sponsored-gas allowance for this period, so the group '
            + 'can’t cover this transaction right now. The allowance refills on a schedule — or '
            + 'an admin can raise it in the paymaster settings.',
          technicalMessage: text,
          originalError,
        };
      }
    }

    // 3. Decode the underlying contract revert reason, if any.
    const contractReason = this._decodeContractRevertMessage(text, originalError, iface);
    if (contractReason) {
      return {
        category: 'contract_revert',
        userMessage: contractReason,
        technicalMessage: text,
        originalError,
      };
    }

    // 4. ERC-4337 AA error codes — use fallback-specific messages when paymaster
    // was expected but unavailable (so the user knows the real issue is no gas
    // budget + no funds, not a contract problem).
    for (const [code, userMessage] of Object.entries(AA_ERROR_MESSAGES)) {
      if (text.includes(code)) {
        const fallbackMsg = this._paymasterFellBack ? AA_FALLBACK_MESSAGES[code] : null;
        return {
          category: 'smart_account_error',
          userMessage: fallbackMsg || userMessage,
          technicalMessage: text,
          originalError,
        };
      }
    }

    // 5. Paymaster-specific errors.
    if (text.includes('paymaster') || text.includes('Paymaster')) {
      return {
        category: 'paymaster_error',
        userMessage: 'Gas sponsorship failed. The organization may need to add more funds.',
        technicalMessage: text,
        originalError,
      };
    }

    // 6. Generic — if paymaster fell back, hint at the real cause.
    return {
      category: 'smart_account_error',
      userMessage: this._paymasterFellBack
        ? 'Gas sponsorship was unavailable and your account has no funds to pay for gas.'
        : 'Transaction failed. Please try again.',
      technicalMessage: text,
      originalError,
    };
  }

  /**
   * Pull a friendly contract-revert message out of a failed UserOp, if one is
   * decodable. Prefers structured revert bytes attached by userOpBuilder (when a
   * simulation revert short-circuits submission), then scans the viem error's
   * text fields (shortMessage/details/cause) for an anchored revert blob.
   *
   * @returns {string|null}
   */
  _decodeContractRevertMessage(message, originalError, iface) {
    // Structured revert bytes attached by userOpBuilder when it aborts a doomed op.
    if (originalError?.revertData) {
      const d = decodeRevertData(originalError.revertData, iface);
      const m = friendlyFromDecoded(d);
      if (m) return m;
    }

    // Scan the richest available text fields. viem only reliably keeps the raw
    // reason in shortMessage/details/cause — `.message` carries it too but is not
    // a stable contract across viem minors, so we feed all of them.
    const text = [
      message,
      originalError?.shortMessage,
      originalError?.details,
      originalError?.cause?.shortMessage,
      originalError?.cause?.details,
      originalError?.cause?.message,
      originalError?.cause?.cause?.message,
    ].filter(Boolean).join('\n');

    const decoded = decodeContractRevert(originalError, text, iface);
    return friendlyFromDecoded(decoded);
  }

  /**
   * Notify state change callback.
   */
  _notifyState(callback, state, data = {}) {
    if (typeof callback === 'function') {
      callback(state, data);
    }
  }
}

/**
 * Create a SmartAccountTransactionManager instance.
 * @param {Object} params - Constructor params
 * @returns {SmartAccountTransactionManager}
 */
export function createSmartAccountTransactionManager(params) {
  return new SmartAccountTransactionManager(params);
}
