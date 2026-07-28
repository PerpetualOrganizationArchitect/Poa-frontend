/**
 * Error Parser
 * Parses blockchain errors into user-friendly messages
 */

import { Web3ErrorCategory, TransactionError } from './Web3Error';
import { decodeContractRevert, messageForErrorName } from './contractErrors';

/**
 * NOTE: the authoritative selector→name map (generated from the ABIs) and the
 * full error-name→friendly-message dictionary now live in `contractErrors.js`,
 * shared with the passkey (ERC-4337) path. The old hand-maintained selector map
 * here had several stale/wrong selectors (e.g. BadStatus/NotClaimer/AlreadyVoted)
 * that silently never matched — decoding is now ABI-first via `decodeContractRevert`.
 */

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
  'Unauthorized': 'You do not have permission for this action. The project may need role permissions configured.',
  'Insufficient permissions': 'You do not have the required permissions.',

  // Hats-protocol / eligibility require() strings (string reverts, not custom errors).
  // These come back via Error(string), so they match by substring here.
  'Not eligible to claim hat': "You're not eligible to claim this role yet. You may need more vouches, or you may already hold it.",
  'not eligible': "You're not eligible for this role yet. You may need more vouches, or you may already hold it.",
  'already wearing': 'You already hold this role.',
  'not active': 'This role is not currently active for your account.',

  // Voting errors
  'Proposal expired': 'This proposal has expired.',
  'Already voted': 'You have already voted on this proposal.',
  'Voting not started': 'Voting has not started yet.',
  'Voting ended': 'Voting has ended for this proposal.',
  'Invalid vote weight': 'Vote weights must sum to 100.',
  'AlreadyVoted': 'You have already voted on this proposal.',
  'VotingExpired': 'Voting has ended for this proposal.',
  'VotingOpen': 'Voting is still in progress.',
  'InvalidQuorum': 'Invalid quorum value.',
  'InvalidThreshold': 'Invalid threshold percentage (must be 1-100).',
  'DurationOutOfRange': 'Vote duration is out of allowed range.',
  'TooManyOptions': 'Too many voting options.',
  'TooManyCalls': 'Too many calls in execution batch.',
  'RoleNotAllowed': 'Your role is not allowed to perform this action.',
  'TargetNotAllowed': 'The target contract is not in the allowed targets list. The organization admin needs to add this contract to the voting allowlist.',
  'TargetSelf': 'A voting contract cannot create proposals that target itself. Use the other voting contract.',
  'WeightSumNot100': 'Vote weights must sum to 100.',
  'LengthMismatch': 'Array lengths do not match.',
  'DuplicateIndex': 'Duplicate option index in vote.',
  'InvalidProposal': 'Invalid proposal.',

  // Task errors (legacy string patterns)
  'Task already claimed': 'This task has already been claimed.',
  'Task not claimed': 'This task has not been claimed yet.',
  'Not task claimer': 'Only the task claimer can perform this action.',
  'Task completed': 'This task has already been completed.',
  'Invalid task': 'This task does not exist.',
  'Project not found': 'This project does not exist.',

  // TaskManager custom errors (POP contracts)
  'BadStatus': 'Task is not in the correct state for this action.',
  'NotClaimer': 'Only the person who claimed this task can perform this action.',
  'NotFound': 'This task does not exist.',
  'NotCreator': 'You don\'t have permission to create projects. Contact your organization admin to get creator permissions.',
  'NotExecutor': 'Unauthorized: caller is not the executor.',
  'AlreadyApplied': 'You have already applied for this task.',
  'NoApplicationRequired': 'This task does not require an application.',
  'NotApplicant': 'You have not applied for this task.',
  'RequiresApplication': 'This task requires an application before claiming.',
  'BudgetExceeded': 'Project budget has been exceeded.',
  'EmptyTitle': 'Task title cannot be empty.',
  'TitleTooLong': 'Task title is too long.',
  'InvalidPayout': 'Invalid payout amount.',
  'InvalidString': 'Invalid string input.',
  'ZeroAddress': 'Address cannot be zero.',
  'CapBelowCommitted': 'Cap cannot be lower than committed amount.',
  'SpentUnderflow': 'Spent amount underflow.',
  'InvalidIndex': 'Invalid index.',
  'NotOrganizer': 'You don\'t hold a folder-organizer hat. Ask an admin to grant your role the organizer permission.',
  'FoldersRootStale': 'Another organizer published a folder update while you were editing. Your changes were not saved — pull the latest tree and try again.',

  // Token errors
  'Insufficient balance': 'Insufficient token balance for this operation.',
  'Transfer failed': 'Token transfer failed.',

  // PaymentManager errors
  'InsufficientFunds': 'The treasury has insufficient funds for this operation.',
  'TransferFailed': 'Token transfer failed. Please check your token approval.',
  'SafeERC20FailedOperation': 'Token transfer failed. The token contract rejected the operation.',

  // General errors
  'Paused': 'This contract is currently paused.',
  'Not owner': 'Only the owner can perform this action.',

  // ParticipationToken errors
  'NotMember': 'You must be a member of this organization to request shares. Please ensure you have been assigned a member role.',
  'ZeroAmount': 'Share amount must be greater than zero.',
  'NotApprover': 'You do not have permission to approve share requests.',
  'AlreadyApproved': 'This share request has already been approved.',
  'RequestUnknown': 'This share request does not exist.',
  'NotRequester': 'Only the original requester can cancel this request.',
  'AlreadySet': 'This value has already been configured.',
  'InvalidAddress': 'Invalid address provided.',
  'TransfersDisabled': 'Transfers are disabled for shares.',
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
 * Get user-friendly message from a revert reason / error name.
 *
 * Order:
 *   1. Exact error-name match against the curated contract dictionary
 *      (contractErrors.js) then the legacy REVERT_PATTERNS — deterministic,
 *      no substring shadowing for decoded PascalCase names.
 *   2. Substring match over REVERT_PATTERNS — for raw require() strings.
 *
 * @param {string} reason - Revert reason or decoded error name
 * @returns {string|null} User-friendly message or null
 */
function matchRevertPattern(reason) {
  if (!reason) return null;

  // Exact-name match wins (guards against e.g. a short key shadowing a longer name).
  const exact = messageForErrorName(reason) || REVERT_PATTERNS[reason];
  if (exact) return exact;

  const lowerReason = reason.toLowerCase();
  for (const [pattern, message] of Object.entries(REVERT_PATTERNS)) {
    if (lowerReason.includes(pattern.toLowerCase())) {
      return message;
    }
  }

  return null;
}

/**
 * Resolve a friendly userMessage + reason from a reverting error, shared by the
 * CONTRACT_REVERT and GAS_ESTIMATION_FAILED branches so both surface the same
 * decoded message.
 *
 * Tries, in order: an explicit string reason (require() messages) → the
 * curated dictionary → ABI/selector decode of the raw revert bytes (handles
 * both ethers' gas-estimation nesting and any hex embedded in the message text).
 *
 * @param {Error} error - Original error
 * @param {Array|Object} [abi] - Contract ABI/fragments or a built ethers Interface
 * @returns {{ userMessage: string|null, reason: string|null }}
 */
function resolveRevert(error, abi) {
  let reason = extractRevertReason(error);
  let userMessage = matchRevertPattern(reason);

  if (!userMessage) {
    const text = [error?.message, error?.error?.message, error?.error?.data?.message]
      .filter(Boolean)
      .join('\n');
    const decoded = decodeContractRevert(error, text, abi);
    if (decoded) {
      reason = decoded.reason || reason;
      userMessage = decoded.message
        || (decoded.isStringError ? matchRevertPattern(decoded.reason) || decoded.reason : null)
        || (decoded.name && decoded.name !== 'Error' ? `Contract error: ${decoded.name}` : null);
    }
  }

  return { userMessage, reason };
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
 * @param {Object} [context] - Optional chain context for message formatting
 * @param {string} [context.nativeSymbol] - Native token symbol (e.g. "xDAI", "ETH")
 * @param {string} [context.networkName] - Human-readable network name (e.g. "Gnosis")
 * @returns {ParsedError} Parsed error with category and messages
 */
export function parseError(error, abi = null, context = {}) {
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

  // Insufficient funds — name the native token + network when we can, so the
  // user knows exactly what to top up. EOA has no paymaster fallback, so
  // adding native token to the connected wallet is the only remedy.
  if (category === Web3ErrorCategory.INSUFFICIENT_FUNDS) {
    const { nativeSymbol, networkName } = context;
    const userMessage = nativeSymbol && networkName
      ? `Not enough ${nativeSymbol} on ${networkName} to cover gas. Add ${nativeSymbol} to your wallet and try again.`
      : "Not enough funds to cover gas. Add the network's native token to your wallet and try again.";
    return new ParsedError(
      category,
      userMessage,
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

  // Wallet produced a non-canonical-RLP signature. Wallet/node-side bug,
  // not a contract failure — re-signing with a fresh nonce/S value almost
  // always succeeds. Stable retry messaging avoids the user blaming the
  // contract or their inputs.
  if (category === Web3ErrorCategory.WALLET_SIGNATURE) {
    return new ParsedError(
      category,
      'Your wallet produced an invalid signature (rare encoding quirk). Click again to retry — a fresh signature usually succeeds.',
      'rlp: non-canonical integer in signed transaction',
      error
    );
  }

  // Gas estimation failed — usually means the tx WOULD revert. This is the
  // common pre-flight path for permission/state guards (ethers throws
  // UNPREDICTABLE_GAS_LIMIT). Decode the custom error / revert reason here too —
  // previously this branch only consulted a (stale) hardcoded selector map.
  if (category === Web3ErrorCategory.GAS_ESTIMATION_FAILED) {
    const { userMessage, reason } = resolveRevert(error, abi);
    return new ParsedError(
      category,
      userMessage || 'Transaction would fail. Please check your inputs.',
      reason || 'Gas estimation failed',
      error
    );
  }

  // Contract revert - try to extract and match reason
  if (category === Web3ErrorCategory.CONTRACT_REVERT) {
    const { userMessage, reason } = resolveRevert(error, abi);

    return new ParsedError(
      category,
      userMessage || (reason ? `Transaction failed: ${reason}` : 'Transaction rejected by the contract.'),
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
