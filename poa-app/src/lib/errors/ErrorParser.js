/**
 * Error Parser
 * Parses blockchain errors into user-friendly messages
 */

import { ethers } from 'ethers';
import { Web3ErrorCategory, TransactionError } from './Web3Error';

/**
 * Common contract revert patterns and their user-friendly messages
 * Add more patterns as you discover them in your contracts
 */
const REVERT_PATTERNS = {
  // Account Registry errors
  'Already registered': 'You already have an account registered.',
  'Username taken': 'This username is already taken. Please choose another.',
  'Username too short': 'Username must be at least 3 characters.',
  'Username too long': 'Username must be less than 32 characters.',

  // Membership errors
  'Not a member': 'You must be a member of this organization.',
  'Already a member': 'You are already a member of this organization.',
  'Unauthorized': 'You do not have permission for this action.',
  'Insufficient permissions': 'You do not have the required permissions.',

  // Voting errors
  'Proposal expired': 'This proposal has expired.',
  'Already voted': 'You have already voted on this proposal.',
  'Voting not started': 'Voting has not started yet.',
  'Voting ended': 'Voting has ended for this proposal.',
  'Invalid vote weight': 'Vote weights must sum to 100.',

  // Task errors
  'Task already claimed': 'This task has already been claimed.',
  'Task not claimed': 'This task has not been claimed yet.',
  'Not task claimer': 'Only the task claimer can perform this action.',
  'Task completed': 'This task has already been completed.',
  'Invalid task': 'This task does not exist.',
  'Project not found': 'This project does not exist.',

  // TaskManager custom errors (from POP contracts)
  'NotCreator': 'You don\'t have permission to create projects. Contact your organization admin to get creator permissions.',
  'NotExecutor': 'Only the executor can perform this action.',
  'NotFound': 'The requested resource was not found.',
  'BudgetExceeded': 'This operation would exceed the project budget.',
  'BadStatus': 'Invalid task status for this operation.',
  'EmptyTitle': 'Title cannot be empty.',
  'TitleTooLong': 'Title exceeds maximum length.',
  'InvalidPayout': 'Invalid payout amount.',
  'AlreadyApplied': 'You have already applied for this task.',
  'RequiresApplication': 'This task requires an application before claiming.',
  'NoApplicationRequired': 'This task does not accept applications.',
  'NotApplicant': 'You are not an applicant for this task.',
  'NotClaimer': 'Only the task claimer can perform this action.',

  // Token errors
  'Insufficient balance': 'Insufficient token balance for this operation.',
  'Transfer failed': 'Token transfer failed.',

  // General errors
  'Paused': 'This contract is currently paused.',
  'Not owner': 'Only the owner can perform this action.',
};

/**
 * Parse error reason from various error formats
 * @param {Error} error - Original error
 * @returns {string|null} Parsed reason or null
 */
function extractRevertReason(error) {
  // Direct reason
  if (error.reason) {
    return error.reason.replace('execution reverted: ', '');
  }

  // Nested error reason
  if (error.error?.reason) {
    return error.error.reason.replace('execution reverted: ', '');
  }

  // Error data message
  if (error.error?.data?.message) {
    return error.error.data.message.replace('execution reverted: ', '');
  }

  // Try to extract from message
  if (error.message) {
    const match = error.message.match(/reverted with reason string '([^']+)'/);
    if (match) return match[1];

    const revertMatch = error.message.match(/execution reverted: (.+)/);
    if (revertMatch) return revertMatch[1];
  }

  return null;
}

/**
 * Try to decode custom error using ABI
 * @param {Error} error - Original error
 * @param {Array} [abi] - Contract ABI
 * @returns {Object|null} Decoded error or null
 */
function tryDecodeCustomError(error, abi) {
  if (!abi || !error.data) return null;

  try {
    const iface = new ethers.utils.Interface(abi);
    const decodedError = iface.parseError(error.data);
    return {
      name: decodedError.name,
      args: decodedError.args,
      signature: decodedError.signature,
    };
  } catch {
    return null;
  }
}

/**
 * Get user-friendly message from revert reason
 * @param {string} reason - Revert reason
 * @returns {string|null} User-friendly message or null
 */
function matchRevertPattern(reason) {
  if (!reason) return null;

  const lowerReason = reason.toLowerCase();

  for (const [pattern, message] of Object.entries(REVERT_PATTERNS)) {
    if (lowerReason.includes(pattern.toLowerCase())) {
      return message;
    }
  }

  return null;
}

/**
 * Parsed error result
 */
export class ParsedError {
  /**
   * @param {string} category - Error category
   * @param {string} userMessage - User-friendly message
   * @param {string} technicalMessage - Technical details
   * @param {Error} originalError - Original error
   */
  constructor(category, userMessage, technicalMessage, originalError) {
    this.category = category;
    this.userMessage = userMessage;
    this.technicalMessage = technicalMessage;
    this.originalError = originalError;
    this.timestamp = Date.now();
  }

  /**
   * Check if user rejected the transaction
   * @returns {boolean}
   */
  isUserRejection() {
    return this.category === Web3ErrorCategory.USER_REJECTED;
  }

  /**
   * Check if error is recoverable
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
 * Parse blockchain error into user-friendly format
 * @param {Error} error - Original error from ethers/contract
 * @param {Array} [abi] - Optional ABI for custom error decoding
 * @returns {ParsedError} Parsed error with category and messages
 */
export function parseError(error, abi = null) {
  // Detect category
  const category = TransactionError.detectCategory(error);

  // User rejection - simple message
  if (category === Web3ErrorCategory.USER_REJECTED) {
    return new ParsedError(
      category,
      'Transaction cancelled.',
      'User rejected the transaction',
      error
    );
  }

  // Insufficient funds
  if (category === Web3ErrorCategory.INSUFFICIENT_FUNDS) {
    return new ParsedError(
      category,
      'Insufficient funds for this transaction.',
      'Account balance too low for gas + value',
      error
    );
  }

  // Network errors
  if (category === Web3ErrorCategory.NETWORK_ERROR) {
    return new ParsedError(
      category,
      'Network error. Please check your connection and try again.',
      error.message,
      error
    );
  }

  // Gas estimation failed - try to get revert reason
  if (category === Web3ErrorCategory.GAS_ESTIMATION_FAILED) {
    const reason = extractRevertReason(error);
    const userMessage = matchRevertPattern(reason) ||
      'Transaction would fail. Please check your inputs.';

    return new ParsedError(
      category,
      userMessage,
      reason || 'Gas estimation failed',
      error
    );
  }

  // Contract revert - try to extract and match reason
  if (category === Web3ErrorCategory.CONTRACT_REVERT) {
    const reason = extractRevertReason(error);
    let userMessage = matchRevertPattern(reason);

    // Try custom error decoding
    if (!userMessage && abi) {
      const decoded = tryDecodeCustomError(error, abi);
      if (decoded) {
        // Check if we have a user-friendly message for this custom error name
        userMessage = matchRevertPattern(decoded.name) || `Contract error: ${decoded.name}`;
      }
    }

    // Fallback to generic revert message
    if (!userMessage) {
      userMessage = reason
        ? `Transaction failed: ${reason}`
        : 'Transaction rejected by the contract.';
    }

    return new ParsedError(
      category,
      userMessage,
      reason || 'Contract revert',
      error
    );
  }

  // Unknown error
  return new ParsedError(
    Web3ErrorCategory.UNKNOWN,
    'An unexpected error occurred. Please try again.',
    error.message || 'Unknown error',
    error
  );
}

/**
 * Create a ParsedError from any error
 * @param {Error|string} error - Error or error message
 * @returns {ParsedError}
 */
export function createParsedError(error) {
  if (error instanceof ParsedError) return error;

  if (typeof error === 'string') {
    return new ParsedError(
      Web3ErrorCategory.UNKNOWN,
      error,
      error,
      new Error(error)
    );
  }

  return parseError(error);
}
