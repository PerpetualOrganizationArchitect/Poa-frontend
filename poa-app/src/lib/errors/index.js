/**
 * Error Classes Module
 * Barrel exports for all error classes and utilities
 */

// Base error
export { AppError, AppErrorCodes } from './AppError';

// Web3/Blockchain errors
export {
  Web3Error,
  Web3ErrorCategory,
  TransactionError,
  ContractCreationError,
} from './Web3Error';

// IPFS errors
export {
  IPFSError,
  IPFSErrorCode,
  IPFSOperation,
} from './IPFSError';

// Error parsing utilities
export {
  ParsedError,
  parseError,
  createParsedError,
} from './ErrorParser';

// Contract-revert decoding shared by both transaction paths. `describeExecutionFailure` is the
// read-side twin: the same bytes arrive as `ProposalExecutionFailed.reason` on a receipt and as
// `Proposal.executionError` from the subgraph, and both must read as English, not as hex.
export {
  decodeContractRevert,
  decodeRevertData,
  decodeExecutorCallFailure,
  describeExecutionFailure,
  shortSelector,
  EXECUTOR_CALL_FAILED_SELECTOR,
} from './contractErrors';
