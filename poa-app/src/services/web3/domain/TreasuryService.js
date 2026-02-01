/**
 * TreasuryService
 * Handles PaymentManager operations for treasury distributions
 */

import { ethers } from 'ethers';
import PaymentManagerABI from '../../../../abi/PaymentManager.json';
import { requireAddress, requirePositiveNumber } from '../utils/validation';

/**
 * TreasuryService - Distribution and payment management
 */
export class TreasuryService {
  /**
   * @param {ContractFactory} contractFactory - Contract factory instance
   * @param {TransactionManager} transactionManager - Transaction manager instance
   */
  constructor(contractFactory, transactionManager) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
  }

  // ============================================
  // Distribution Functions
  // ============================================

  /**
   * Create a new distribution for profit sharing
   * @param {string} contractAddress - PaymentManager contract address
   * @param {string} payoutToken - ERC20 token address for distribution (address(0) for ETH)
   * @param {string} amount - Total amount to distribute (in wei)
   * @param {string} merkleRoot - Merkle root for claim verification
   * @param {number|string} checkpointBlock - Block number for snapshot
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createDistribution(contractAddress, payoutToken, amount, merkleRoot, checkpointBlock, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');
    requireAddress(payoutToken, 'Payout token address');
    requirePositiveNumber(amount, 'Distribution amount');

    const contract = this.factory.createWritable(contractAddress, PaymentManagerABI);

    console.log('=== createDistribution DEBUG ===');
    console.log('PaymentManager address:', contractAddress);
    console.log('Payout token:', payoutToken);
    console.log('Amount:', amount);
    console.log('Merkle root:', merkleRoot);
    console.log('Checkpoint block:', checkpointBlock);
    console.log('=== END createDistribution DEBUG ===');

    return this.txManager.execute(
      contract,
      'createDistribution',
      [payoutToken, amount, merkleRoot, checkpointBlock],
      options
    );
  }

  /**
   * Claim from a distribution
   * @param {string} contractAddress - PaymentManager contract address
   * @param {number|string} distributionId - Distribution ID to claim from
   * @param {string} claimAmount - Amount to claim (in wei)
   * @param {string[]} merkleProof - Merkle proof for claim verification
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async claimDistribution(contractAddress, distributionId, claimAmount, merkleProof, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');
    requirePositiveNumber(claimAmount, 'Claim amount');

    const contract = this.factory.createWritable(contractAddress, PaymentManagerABI);
    const id = ethers.BigNumber.from(distributionId);

    console.log('=== claimDistribution DEBUG ===');
    console.log('PaymentManager address:', contractAddress);
    console.log('Distribution ID:', id.toString());
    console.log('Claim amount:', claimAmount);
    console.log('Merkle proof length:', merkleProof.length);
    console.log('=== END claimDistribution DEBUG ===');

    return this.txManager.execute(
      contract,
      'claimDistribution',
      [id, claimAmount, merkleProof],
      options
    );
  }

  /**
   * Claim from multiple distributions in one transaction
   * @param {string} contractAddress - PaymentManager contract address
   * @param {Array<{distributionId: string, amount: string, proof: string[]}>} claims - Array of claims
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async claimMultiple(contractAddress, claims, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    if (!claims || claims.length === 0) {
      throw new Error('At least one claim is required');
    }

    const contract = this.factory.createWritable(contractAddress, PaymentManagerABI);

    const distributionIds = claims.map(c => ethers.BigNumber.from(c.distributionId));
    const amounts = claims.map(c => c.amount);
    const proofs = claims.map(c => c.proof);

    console.log('=== claimMultiple DEBUG ===');
    console.log('PaymentManager address:', contractAddress);
    console.log('Number of claims:', claims.length);
    console.log('=== END claimMultiple DEBUG ===');

    return this.txManager.execute(
      contract,
      'claimMultiple',
      [distributionIds, amounts, proofs],
      options
    );
  }

  /**
   * Finalize a distribution (return unclaimed funds)
   * @param {string} contractAddress - PaymentManager contract address
   * @param {number|string} distributionId - Distribution ID to finalize
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async finalizeDistribution(contractAddress, distributionId, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    const contract = this.factory.createWritable(contractAddress, PaymentManagerABI);
    const id = ethers.BigNumber.from(distributionId);

    console.log('=== finalizeDistribution DEBUG ===');
    console.log('PaymentManager address:', contractAddress);
    console.log('Distribution ID:', id.toString());
    console.log('=== END finalizeDistribution DEBUG ===');

    return this.txManager.execute(
      contract,
      'finalizeDistribution',
      [id],
      options
    );
  }

  // ============================================
  // View Functions
  // ============================================

  /**
   * Get the current distribution counter
   * @param {string} contractAddress - PaymentManager contract address
   * @returns {Promise<string>} Distribution counter
   */
  async getDistributionCounter(contractAddress) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    const contract = this.factory.createReadOnly(contractAddress, PaymentManagerABI);
    const counter = await contract.distributionCounter();

    return counter.toString();
  }

  /**
   * Get distribution details
   * @param {string} contractAddress - PaymentManager contract address
   * @param {number|string} distributionId - Distribution ID
   * @returns {Promise<Object>} Distribution details
   */
  async getDistribution(contractAddress, distributionId) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    const contract = this.factory.createReadOnly(contractAddress, PaymentManagerABI);
    const id = ethers.BigNumber.from(distributionId);
    const result = await contract.distributions(id);

    return {
      payoutToken: result.payoutToken,
      totalAmount: result.totalAmount.toString(),
      totalClaimed: result.totalClaimed.toString(),
      checkpointBlock: result.checkpointBlock.toString(),
      merkleRoot: result.merkleRoot,
      finalized: result.finalized,
    };
  }

  /**
   * Check if a user has claimed from a distribution
   * @param {string} contractAddress - PaymentManager contract address
   * @param {number|string} distributionId - Distribution ID
   * @param {string} userAddress - User address to check
   * @returns {Promise<boolean>} Whether user has claimed
   */
  async hasClaimed(contractAddress, distributionId, userAddress) {
    requireAddress(contractAddress, 'PaymentManager contract address');
    requireAddress(userAddress, 'User address');

    const contract = this.factory.createReadOnly(contractAddress, PaymentManagerABI);
    const id = ethers.BigNumber.from(distributionId);
    const claimed = await contract.claimed(id, userAddress);

    return claimed;
  }

  /**
   * Get the revenue share token address
   * @param {string} contractAddress - PaymentManager contract address
   * @returns {Promise<string>} Revenue share token address
   */
  async getRevenueShareToken(contractAddress) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    const contract = this.factory.createReadOnly(contractAddress, PaymentManagerABI);
    const token = await contract.revenueShareToken();

    return token;
  }

  /**
   * Check if a user has opted out of distributions
   * @param {string} contractAddress - PaymentManager contract address
   * @param {string} userAddress - User address to check
   * @returns {Promise<boolean>} Whether user has opted out
   */
  async isOptedOut(contractAddress, userAddress) {
    requireAddress(contractAddress, 'PaymentManager contract address');
    requireAddress(userAddress, 'User address');

    const contract = this.factory.createReadOnly(contractAddress, PaymentManagerABI);
    const optedOut = await contract.optedOut(userAddress);

    return optedOut;
  }

  /**
   * Toggle opt-out status for distributions
   * @param {string} contractAddress - PaymentManager contract address
   * @param {boolean} optOut - Whether to opt out
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async toggleOptOut(contractAddress, optOut, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    const contract = this.factory.createWritable(contractAddress, PaymentManagerABI);

    return this.txManager.execute(
      contract,
      'toggleOptOut',
      [optOut],
      options
    );
  }
}

/**
 * Create a TreasuryService instance
 * @param {ContractFactory} factory - Contract factory
 * @param {TransactionManager} txManager - Transaction manager
 * @returns {TreasuryService}
 */
export function createTreasuryService(factory, txManager) {
  return new TreasuryService(factory, txManager);
}
