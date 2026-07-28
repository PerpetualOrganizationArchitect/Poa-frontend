/**
 * Web3/Blockchain Error Classes
 * Handles all blockchain-related errors with proper classification
 */

import { AppError } from './AppError';

/**
 * Error categories for Web3 operations
 */
export const Web3ErrorCategory = {
  USER_REJECTED: 'USER_REJECTED',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONTRACT_REVERT: 'CONTRACT_REVERT',
  GAS_ESTIMATION_FAILED: 'GAS_ESTIMATION_FAILED',
  WALLET_SIGNATURE: 'WALLET_SIGNATURE',
  NO_SIGNER: 'NO_SIGNER',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INVALID_ABI: 'INVALID_ABI',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Canonical geth/ethers messages indicating the sender can't cover gas (+ value).
 *
 * These are deliberately specific (include the trailing "for gas"/"for transfer"/
 * "for intrinsic" qualifier, or the erigon-style "sender doesn't have enough funds"
 * phrase) to avoid false positives on contract reverts that happen to contain the
 * bare phrase "insufficient funds" — e.g. the PaymentManager's `InsufficientFunds`
 * error or any Solidity `require(..., "Insufficient funds")`. Those should flow
 * through the contract-revert path (see REVERT_PATTERNS in ErrorParser.js).
 */
const INSUFFICIENT_FUNDS_PATTERNS = [
  'insufficient funds for gas',        // "insufficient funds for gas * price + value" (geth)
  'insufficient funds for transfer',   // native value transfer shortfall (geth)
  'insufficient funds for intrinsic',  // "insufficient funds for intrinsic transaction cost" (ethers v5)
  "sender doesn't have enough funds",  // erigon
];

/**
 * Walk an ethers/RPC error object (through `error`, `error.error`, `error.data`)
 * and return true if any frame signals the sender can't cover gas.
 *
 * Wallets/providers wrap errors inconsistently: MetaMask nests the RPC error
 * under `error.error`, ethers v5 wraps insufficient-funds failures as
 * UNPREDICTABLE_GAS_LIMIT with the real cause under `error.error`, and some
 * providers surface the message at `error.data.message`. A tree walk catches
 * all of these without guessing the shape.
 */
function hasInsufficientFunds(rootError) {
  const seen = new Set();
  const queue = [rootError];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    // ethers canonical code — set whenever ethers itself classified the error
    if (node.code === 'INSUFFICIENT_FUNDS') return true;

    const msg = typeof node.message === 'string' ? node.message.toLowerCase() : '';
    if (msg) {
      for (const pattern of INSUFFICIENT_FUNDS_PATTERNS) {
        if (msg.includes(pattern)) return true;
      }
    }

    if (node.error) queue.push(node.error);
    if (node.data && typeof node.data === 'object') queue.push(node.data);
  }

  return false;
}

/**
 * Phrases from go-ethereum's strict RLP decoder that surface when the signed
 * tx the wallet handed off has non-canonical big-int fields (typically the
 * signature's R or S has a leading zero byte that wasn't stripped). Hits
 * for ~1 in 256 signatures from buggy signers and is fully recoverable by
 * re-signing — a different `S` rolls.
 *
 * Patterns are lowercased; matching is substring on the message text.
 * Conservative: requires BOTH "non-canonical" AND the rlp/big.Int context
 * so we don't mis-classify unrelated `-32602` errors.
 */
const NON_CANONICAL_SIGNATURE_PATTERNS = [
  'rlp: non-canonical',                // go-ethereum verbatim
  'non-canonical integer (leading zero', // looser variant if the prefix is trimmed
];

/**
 * Walk an error envelope looking for the go-ethereum non-canonical-RLP signal.
 * Same shape as `hasInsufficientFunds` — wallets nest these inconsistently.
 */
function hasNonCanonicalSignature(rootError) {
  const seen = new Set();
  const queue = [rootError];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    const msg = typeof node.message === 'string' ? node.message.toLowerCase() : '';
    if (msg) {
      for (const pattern of NON_CANONICAL_SIGNATURE_PATTERNS) {
        if (msg.includes(pattern)) return true;
      }
    }

    if (node.error) queue.push(node.error);
    if (node.data && typeof node.data === 'object') queue.push(node.data);
    if (node.cause && typeof node.cause === 'object') queue.push(node.cause);
    if (node.originalError && typeof node.originalError === 'object') queue.push(node.originalError);
  }

  return false;
}

/**
 * Base Web3 Error
 */
export class Web3Error extends AppError {
  /**
   * @param {string} message - Error message
   * @param {string} [category=UNKNOWN] - Error category
   * @param {Error} [originalError=null] - Original error that caused this
   */
  constructor(message, category = Web3ErrorCategory.UNKNOWN, originalError = null) {
    super(message, 'WEB3_ERROR', {
      category,
      originalMessage: originalError?.message,
      reason: originalError?.reason,
    });

    this.category = category;
    this.originalError = originalError;
  }

  /**
   * Check if this error was caused by user rejection
   * @returns {boolean}
   */
  isUserRejection() {
    return this.category === Web3ErrorCategory.USER_REJECTED;
  }

  /**
   * Check if this error is recoverable (user can retry)
   * @returns {boolean}
   */
  isRecoverable() {
    return [
      Web3ErrorCategory.USER_REJECTED,
      Web3ErrorCategory.NETWORK_ERROR,
      Web3ErrorCategory.GAS_ESTIMATION_FAILED,
    ].includes(this.category);
  }
}

/**
 * Transaction-specific error
 */
export class TransactionError extends Web3Error {
  /**
   * @param {string} method - Contract method that failed
   * @param {Error} originalError - Original error from ethers
   * @param {string} [category] - Error category (auto-detected if not provided)
   */
  constructor(method, originalError, category = null) {
    const detectedCategory = category || TransactionError.detectCategory(originalError);
    const userMessage = TransactionError.getUserMessage(detectedCategory, method);

    super(userMessage, detectedCategory, originalError);

    this.code = 'TRANSACTION_ERROR';
    this.method = method;
    this.txHash = originalError?.transactionHash;
  }

  /**
   * Detect error category from original error
   * @param {Error} error - Original error
   * @returns {string} Error category
   */
  static detectCategory(error) {
    if (!error) return Web3ErrorCategory.UNKNOWN;

    // User rejected transaction
    if (
      error.code === 4001 ||
      error.code === 'ACTION_REJECTED' ||
      error.message?.toLowerCase().includes('user rejected') ||
      error.message?.toLowerCase().includes('user denied')
    ) {
      return Web3ErrorCategory.USER_REJECTED;
    }

    // Insufficient funds — check BEFORE UNPREDICTABLE_GAS_LIMIT because ethers
    // often wraps an insufficient-funds RPC error inside a gas-estimation failure,
    // e.g. { code: 'UNPREDICTABLE_GAS_LIMIT', error: { code: -32000, message: 'insufficient funds ...' } }.
    // Walk the nested error tree so we catch the real cause regardless of wrapping.
    if (hasInsufficientFunds(error)) {
      return Web3ErrorCategory.INSUFFICIENT_FUNDS;
    }

    // Wallet produced a signature the network rejected for non-canonical RLP
    // encoding (leading zero in R or S). Fully recoverable by re-signing.
    // Check BEFORE the generic CONTRACT_REVERT path because the message often
    // contains the substring "revert" inside the wallet's wrap layer.
    if (hasNonCanonicalSignature(error)) {
      return Web3ErrorCategory.WALLET_SIGNATURE;
    }

    // Network errors
    if (
      error.code === 'NETWORK_ERROR' ||
      error.code === 'TIMEOUT' ||
      error.code === 'SERVER_ERROR' ||
      error.message?.toLowerCase().includes('network') ||
      error.message?.toLowerCase().includes('timeout')
    ) {
      return Web3ErrorCategory.NETWORK_ERROR;
    }

    // Gas estimation failed (usually means tx would revert)
    if (
      error.code === 'UNPREDICTABLE_GAS_LIMIT' ||
      error.message?.toLowerCase().includes('cannot estimate gas')
    ) {
      return Web3ErrorCategory.GAS_ESTIMATION_FAILED;
    }

    // Contract revert
    if (
      error.reason ||
      error.data ||
      error.error?.reason ||
      error.message?.toLowerCase().includes('revert')
    ) {
      return Web3ErrorCategory.CONTRACT_REVERT;
    }

    return Web3ErrorCategory.UNKNOWN;
  }

  /**
   * Get user-friendly message based on category
   * @param {string} category - Error category
   * @param {string} method - Method that failed
   * @returns {string} User-friendly message
   */
  static getUserMessage(category, method) {
    const messages = {
      [Web3ErrorCategory.USER_REJECTED]: 'Transaction cancelled.',
      [Web3ErrorCategory.INSUFFICIENT_FUNDS]: 'Insufficient funds for this transaction.',
      [Web3ErrorCategory.NETWORK_ERROR]: 'Network error. Please check your connection and try again.',
      [Web3ErrorCategory.GAS_ESTIMATION_FAILED]: 'Transaction would fail. Please check your inputs.',
      [Web3ErrorCategory.CONTRACT_REVERT]: 'Transaction rejected by the contract.',
      [Web3ErrorCategory.WALLET_SIGNATURE]: 'Your wallet produced an invalid signature (rare encoding quirk). Click again to retry — a fresh signature usually succeeds.',
      [Web3ErrorCategory.UNKNOWN]: `Transaction failed: ${method}`,
    };

    return messages[category] || messages[Web3ErrorCategory.UNKNOWN];
  }
}

/**
 * Contract creation error
 */
export class ContractCreationError extends Web3Error {
  /**
   * @param {string} message - Error message
   * @param {string} [category=UNKNOWN] - Error category
   */
  constructor(message, category = Web3ErrorCategory.UNKNOWN) {
    super(message, category, null);
    this.code = 'CONTRACT_CREATION_ERROR';
  }

  /**
   * Create error for missing signer
   * @returns {ContractCreationError}
   */
  static noSigner() {
    return new ContractCreationError(
      'We couldn’t reach your account to sign this. Please sign in again, then retry.',
      Web3ErrorCategory.NO_SIGNER
    );
  }

  /**
   * Create error for invalid address
   * @param {string} address - The invalid address
   * @returns {ContractCreationError}
   */
  static invalidAddress(address) {
    return new ContractCreationError(
      `Invalid contract address: ${address}`,
      Web3ErrorCategory.INVALID_ADDRESS
    );
  }

  /**
   * Create error for invalid ABI
   * @returns {ContractCreationError}
   */
  static invalidAbi() {
    return new ContractCreationError(
      'Invalid or empty ABI provided.',
      Web3ErrorCategory.INVALID_ABI
    );
  }
}
