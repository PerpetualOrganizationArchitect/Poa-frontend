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
   */
  constructor({ accountAddress, walletClient, publicClient, bundlerClient, paymasterAddress, orgId, hatIds, chainId, eoaDelegationAddress, fallbackTxManager, on7702Disabled }) {
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
    this._paymasterFellBack = false;
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
    } = options;

    try {
      this._notifyState(onStateChange, TransactionState.ESTIMATING);

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
      const authorization = await buildEOAAuthorization(this.walletClient, this.eoaDelegationAddress);

      // 4. Build UserOp with paymaster fallback
      const userOp = await this._buildUserOpWithFallback(callData, authorization, overrideHatIds, paymasterClaimTarget, {
        callGasLimit,
        callGasLimitMultiplier,
      });

      // 5. Sign UserOp hash with wallet (ECDSA via personal_sign)
      this._notifyState(onStateChange, TransactionState.AWAITING_SIGNATURE);
      const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, this.chainId);
      const signature = await signUserOpWithWallet(userOpHash, this.walletClient);
      userOp.signature = signature;

      // 6. Submit to bundler
      this._notifyState(onStateChange, TransactionState.PENDING);
      const submittedHash = await this.bundlerClient.sendUserOperation({
        ...userOp,
        entryPointAddress: ENTRY_POINT_ADDRESS,
      });

      console.log(`[7702] UserOp submitted: ${submittedHash}`);

      // 7. Wait for receipt
      this._notifyState(onStateChange, TransactionState.CONFIRMING);
      const receipt = await this.bundlerClient.waitForUserOperationReceipt({
        hash: submittedHash,
        timeout: 120_000,
      });

      if (!receipt.success) {
        const error = this._parseAAError(receipt.reason || 'UserOp execution failed');
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
      console.error('[7702] Transaction error:', error.message);

      // If wallet doesn't support 7702, fall back to direct tx transparently
      if (error.message === 'WALLET_7702_UNSUPPORTED' && this.fallbackTxManager) {
        console.warn('[7702] Wallet does not support EIP-7702, falling back to direct transaction');
        this.on7702Disabled?.();
        return this.fallbackTxManager.execute(contract, method, args, options);
      }

      const parsedError = this._parseAAError(error.message || 'Unknown error', error);
      this._notifyState(onStateChange, TransactionState.ERROR, { error: parsedError });
      return TransactionResult.failure(parsedError);
    }
  }

  /**
   * Execute multiple calls atomically via executeBatch.
   */
  async executeBatch(transactions, batchOptions = {}) {
    const { onStateChange, callGasLimit, callGasLimitMultiplier } = batchOptions;

    try {
      this._notifyState(onStateChange, TransactionState.ESTIMATING);

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

      const authorization = await buildEOAAuthorization(this.walletClient, this.eoaDelegationAddress);
      const userOp = await this._buildUserOpWithFallback(callData, authorization, null, null, {
        callGasLimit,
        callGasLimitMultiplier,
      });

      this._notifyState(onStateChange, TransactionState.AWAITING_SIGNATURE);
      const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, this.chainId);
      const signature = await signUserOpWithWallet(userOpHash, this.walletClient);
      userOp.signature = signature;

      this._notifyState(onStateChange, TransactionState.PENDING);
      const submittedHash = await this.bundlerClient.sendUserOperation({
        ...userOp,
        entryPointAddress: ENTRY_POINT_ADDRESS,
      });

      this._notifyState(onStateChange, TransactionState.CONFIRMING);
      const receipt = await this.bundlerClient.waitForUserOperationReceipt({
        hash: submittedHash,
        timeout: 120_000,
      });

      if (!receipt.success) {
        const error = this._parseAAError(receipt.reason || 'Batch execution failed');
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

  async _buildUserOpWithFallback(callData, authorization, overrideHatIds = null, claimTarget = null, gasOverrides = {}) {
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
      sender: this.accountAddress,
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
    return userOp;
  }

  _parseAAError(message, originalError = null) {
    // 7702-specific error: wallet doesn't support delegation
    if (message === 'WALLET_7702_UNSUPPORTED') {
      return {
        category: 'delegation_unsupported',
        userMessage: 'Your wallet does not support gas sponsorship (EIP-7702). The transaction was not sent. Please try again — it will use your own gas.',
        technicalMessage: message,
        originalError,
      };
    }

    // User rejected the delegation or signing prompt
    if (message.includes('User rejected') || message.includes('user rejected') ||
        message.includes('User denied') || message.includes('denied by user') ||
        originalError?.code === 4001) {
      return {
        category: 'user_rejected',
        userMessage: 'Transaction was cancelled.',
        technicalMessage: message,
        originalError,
      };
    }

    // ERC-4337 AA error codes
    for (const [code, userMessage] of Object.entries(AA_ERROR_MESSAGES)) {
      if (message.includes(code)) {
        return {
          category: 'smart_account_error',
          userMessage: this._paymasterFellBack
            ? 'Gas sponsorship was unavailable and your account has no funds for gas.'
            : userMessage,
          technicalMessage: message,
          originalError,
        };
      }
    }
    return {
      category: 'unknown_error',
      userMessage: message.length > 200 ? 'Transaction failed. Please try again.' : message,
      technicalMessage: message,
      originalError,
    };
  }

  _notifyState(callback, state, data = {}) {
    if (callback) callback(state, data);
  }
}

export function createEOA7702TransactionManager(params) {
  return new EOA7702TransactionManager(params);
}
