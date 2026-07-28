/**
 * VotingService
 * Handles Hybrid Voting and Direct Democracy Voting operations
 */

import { ethers } from 'ethers';
import HybridVotingABI from '../../../../abi/HybridVotingNew.json';
import DirectDemocracyVotingABI from '../../../../abi/DirectDemocracyVotingNew.json';
import { stringToBytes, ipfsCidToBytes32 } from '../utils/encoding';
import {
  requireAddress,
  requireString,
  requirePositiveNumber,
  requireValidVoteWeights,
  requireValidDuration,
} from '../utils/validation';

/**
 * Voting types
 */
export const VotingType = {
  HYBRID: 'hybrid',
  DIRECT_DEMOCRACY: 'dd',
};

/**
 * VotingService - Proposal creation and voting operations
 */
export class VotingService {
  /**
   * @param {ContractFactory} contractFactory - Contract factory instance
   * @param {TransactionManager} transactionManager - Transaction manager instance
   * @param {Object} ipfsService - IPFS service for metadata storage
   */
  constructor(contractFactory, transactionManager, ipfsService = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.ipfs = ipfsService;
  }

  // ============================================
  // Hybrid Voting Functions
  // ============================================

  /**
   * Create a Hybrid Voting proposal
   * @param {string} contractAddress - HybridVoting contract address
   * @param {Object} proposalData - Proposal data
   * @param {string} proposalData.name - Proposal title
   * @param {string} proposalData.description - Proposal description
   * @param {number} proposalData.durationMinutes - Duration in minutes
   * @param {number} proposalData.numOptions - Number of voting options
   * @param {Array} [proposalData.optionNames=[]] - Names for each voting option
   * @param {Array} [proposalData.batches=[]] - Execution batches
   * @param {Array} [proposalData.hatIds=[]] - Hat IDs to restrict voting
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createHybridProposal(contractAddress, proposalData, options = {}) {
    requireAddress(contractAddress, 'HybridVoting contract address');
    requireString(proposalData.name, 'Proposal name');
    requireValidDuration(proposalData.durationMinutes);
    requirePositiveNumber(proposalData.numOptions, 'Number of options');

    const {
      name,
      description = '',
      durationMinutes,
      numOptions,
      optionNames = [],
      batches = [],
      hatIds = [],
      actionSummaries = [],
    } = proposalData;

    const contract = this.factory.createWritable(contractAddress, HybridVotingABI);

    const titleBytes = stringToBytes(name);
    const duration = Math.max(1, Math.floor(durationMinutes));

    const descriptionHash = await this._uploadProposalMetadata({
      description,
      optionNames,
      actionSummaries,
      label: 'Hybrid',
    });

    return this.txManager.execute(
      contract,
      'createProposal',
      [titleBytes, descriptionHash, duration, numOptions, batches, hatIds],
      options
    );
  }

  /**
   * Upload proposal metadata (description + optionNames) to IPFS and return
   * the bytes32 hash to pass to the contract. Throws if the IPFS service is
   * unavailable or returns a malformed CID — silently passing HashZero would
   * leave the subgraph with no metadata source so the UI falls back to
   * "Option 1" / "Option 2" labels with no clear failure signal.
   *
   * Returns HashZero only when there is genuinely nothing to upload (empty
   * description AND empty optionNames).
   */
  async _uploadProposalMetadata({ description, optionNames, actionSummaries, label }) {
    const hasContent =
      Boolean(description)
      || (optionNames && optionNames.length > 0)
      || (actionSummaries && actionSummaries.length > 0);
    if (!hasContent) {
      return ethers.constants.HashZero;
    }

    if (!this.ipfs || typeof this.ipfs.addToIpfs !== 'function') {
      throw new Error(
        `IPFS service unavailable — cannot upload ${label} proposal metadata. ` +
          'Without IPFS, voters would see generic "Option 1/2" labels instead of the actual option names.'
      );
    }

    const metadata = {
      description: description || '',
      optionNames: optionNames || [],
      // Forward-compatible, human-readable previews of the on-chain action(s)
      // this proposal will run if it passes (e.g. "If Yes wins, send 5 xDAI …").
      // Purely additive to the metadata JSON — omitted entirely when empty so
      // existing proposals' CIDs stay byte-identical.
      ...(actionSummaries && actionSummaries.length > 0
        ? { actionSummaries }
        : {}),
      createdAt: Date.now(),
    };
    console.log(`[VotingService] Uploading ${label} proposal metadata to IPFS:`, metadata);
    const ipfsResult = await this.ipfs.addToIpfs(JSON.stringify(metadata));

    const cid = ipfsResult?.path;
    if (!cid || typeof cid !== 'string' || !cid.startsWith('Qm')) {
      throw new Error(
        `IPFS upload returned an invalid CID (${cid ?? 'undefined'}). ` +
          'Proposal metadata could not be persisted.'
      );
    }

    const descriptionHash = ipfsCidToBytes32(cid);
    if (descriptionHash === ethers.constants.HashZero) {
      throw new Error(
        `ipfsCidToBytes32 produced HashZero for CID ${cid}. ` +
          'Proposal metadata would be unreadable by the subgraph.'
      );
    }

    console.log(`[VotingService] IPFS CID: ${cid} -> bytes32: ${descriptionHash}`);
    return descriptionHash;
  }

  /**
   * Cast a Hybrid Vote
   * @param {string} contractAddress - HybridVoting contract address
   * @param {number} proposalId - Proposal ID
   * @param {number[]} optionIndices - Indices of options to vote for
   * @param {number[]} weights - Weights for each option (must sum to 100)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async castHybridVote(contractAddress, proposalId, optionIndices, weights, options = {}) {
    requireAddress(contractAddress, 'HybridVoting contract address');
    requireValidVoteWeights(weights);

    const contract = this.factory.createWritable(contractAddress, HybridVotingABI);

    return this.txManager.execute(
      contract,
      'vote',
      [proposalId, optionIndices, weights],
      options
    );
  }

  /**
   * Announce winner for Hybrid Voting proposal
   *
   * NOTE: `announceWinner` triggers the Executor to run the winning batch, which for
   * role-election proposals walks the Hats protocol tree through beacon-proxy
   * eligibility + toggle chains. Bundler gas estimation systematically undercounts
   * this recursive path (dummy-sig traces don't match real cost), so we apply a 3x
   * multiplier on the bundler's callGasLimit estimate by default. Ignored by the
   * direct-EOA TransactionManager (ethers estimates are already accurate).
   *
   * @param {string} contractAddress - HybridVoting contract address
   * @param {number} proposalId - Proposal ID
   * @param {Object} [options={}] - Transaction options (any caller-provided override wins)
   * @returns {Promise<TransactionResult>}
   */
  async announceHybridWinner(contractAddress, proposalId, options = {}) {
    requireAddress(contractAddress, 'HybridVoting contract address');

    const contract = this.factory.createWritable(contractAddress, HybridVotingABI);

    return this.txManager.execute(contract, 'announceWinner', [proposalId], {
      callGasLimitMultiplier: 3n,
      ...options,
    });
  }

  // ============================================
  // Direct Democracy Voting Functions
  // ============================================

  /**
   * Create a Direct Democracy proposal
   * @param {string} contractAddress - DirectDemocracyVoting contract address
   * @param {Object} proposalData - Proposal data (same as Hybrid)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createDDProposal(contractAddress, proposalData, options = {}) {
    requireAddress(contractAddress, 'DirectDemocracyVoting contract address');
    requireString(proposalData.name, 'Proposal name');
    requireValidDuration(proposalData.durationMinutes);
    requirePositiveNumber(proposalData.numOptions, 'Number of options');

    const {
      name,
      description = '',
      durationMinutes,
      numOptions,
      optionNames = [],
      batches = [],
      hatIds = [],
      actionSummaries = [],
    } = proposalData;

    const contract = this.factory.createWritable(contractAddress, DirectDemocracyVotingABI);

    const titleBytes = stringToBytes(name);
    const duration = Math.max(1, Math.floor(durationMinutes));

    const descriptionHash = await this._uploadProposalMetadata({
      description,
      optionNames,
      actionSummaries,
      label: 'DD',
    });

    return this.txManager.execute(
      contract,
      'createProposal',
      [titleBytes, descriptionHash, duration, numOptions, batches, hatIds],
      options
    );
  }

  /**
   * Cast a Direct Democracy Vote
   * @param {string} contractAddress - DirectDemocracyVoting contract address
   * @param {number} proposalId - Proposal ID
   * @param {number[]} optionIndices - Indices of options to vote for
   * @param {number[]} weights - Weights for each option (must sum to 100)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async castDDVote(contractAddress, proposalId, optionIndices, weights, options = {}) {
    requireAddress(contractAddress, 'DirectDemocracyVoting contract address');
    requireValidVoteWeights(weights);

    const contract = this.factory.createWritable(contractAddress, DirectDemocracyVotingABI);

    // Convert to numbers for contract
    const idxs = optionIndices.map(i => Number(i));
    const wts = weights.map(w => Number(w));

    return this.txManager.execute(contract, 'vote', [proposalId, idxs, wts], options);
  }

  /**
   * Announce winner for Direct Democracy proposal
   * @param {string} contractAddress - DirectDemocracyVoting contract address
   * @param {number} proposalId - Proposal ID
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async announceDDWinner(contractAddress, proposalId, options = {}) {
    requireAddress(contractAddress, 'DirectDemocracyVoting contract address');

    const contract = this.factory.createWritable(contractAddress, DirectDemocracyVotingABI);

    // See announceHybridWinner for multiplier rationale (same Hats tree-walk path).
    return this.txManager.execute(contract, 'announceWinner', [proposalId], {
      callGasLimitMultiplier: 3n,
      ...options,
    });
  }

  // ============================================
  // Read Methods
  // ============================================

  /**
   * Get voting class configuration for Hybrid Voting
   * @param {string} contractAddress - HybridVoting contract address
   * @returns {Promise<Array>} Array of ClassConfig structs
   */
  async getHybridClasses(contractAddress) {
    requireAddress(contractAddress, 'HybridVoting contract address');
    const contract = this.factory.createReadable(contractAddress, HybridVotingABI);
    return contract.getClasses();
  }

  /**
   * Get threshold percentage for Hybrid Voting (support % to pass)
   * @param {string} contractAddress - HybridVoting contract address
   * @returns {Promise<number>} Threshold percentage (1-100)
   */
  async getHybridQuorum(contractAddress) {
    requireAddress(contractAddress, 'HybridVoting contract address');
    const contract = this.factory.createReadable(contractAddress, HybridVotingABI);
    return contract.thresholdPct();
  }

  /**
   * Get threshold percentage for Direct Democracy Voting (support % to pass)
   * @param {string} contractAddress - DirectDemocracyVoting contract address
   * @returns {Promise<number>} Threshold percentage (1-100)
   */
  async getDDQuorum(contractAddress) {
    requireAddress(contractAddress, 'DirectDemocracyVoting contract address');
    const contract = this.factory.createReadable(contractAddress, DirectDemocracyVotingABI);
    return contract.thresholdPct();
  }

  // ============================================
  // Convenience Methods
  // ============================================

  /**
   * Create a proposal (auto-detect type from contract address context)
   * @param {string} type - 'hybrid' or 'dd'
   * @param {string} contractAddress - Contract address
   * @param {Object} proposalData - Proposal data
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createProposal(type, contractAddress, proposalData, options = {}) {
    if (type === VotingType.HYBRID) {
      return this.createHybridProposal(contractAddress, proposalData, options);
    }
    return this.createDDProposal(contractAddress, proposalData, options);
  }

  /**
   * Cast a vote (auto-detect type)
   * @param {string} type - 'hybrid' or 'dd'
   * @param {string} contractAddress - Contract address
   * @param {number} proposalId - Proposal ID
   * @param {number[]} optionIndices - Option indices
   * @param {number[]} weights - Vote weights
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async castVote(type, contractAddress, proposalId, optionIndices, weights, options = {}) {
    if (type === VotingType.HYBRID) {
      return this.castHybridVote(contractAddress, proposalId, optionIndices, weights, options);
    }
    return this.castDDVote(contractAddress, proposalId, optionIndices, weights, options);
  }

  /**
   * Announce winner (auto-detect type)
   * @param {string} type - 'hybrid' or 'dd'
   * @param {string} contractAddress - Contract address
   * @param {number} proposalId - Proposal ID
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async announceWinner(type, contractAddress, proposalId, options = {}) {
    if (type === VotingType.HYBRID) {
      return this.announceHybridWinner(contractAddress, proposalId, options);
    }
    return this.announceDDWinner(contractAddress, proposalId, options);
  }
}

/**
 * Create a VotingService instance
 * @param {ContractFactory} factory - Contract factory
 * @param {TransactionManager} txManager - Transaction manager
 * @param {Object} [ipfsService] - IPFS service for metadata storage
 * @returns {VotingService}
 */
export function createVotingService(factory, txManager, ipfsService = null) {
  return new VotingService(factory, txManager, ipfsService);
}
