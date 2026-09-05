/**
 * TreasuryService
 * Handles PaymentManager operations for treasury distributions
 */

import { ethers } from 'ethers';
import PaymentManagerABI from '../../../../abi/PaymentManager.json';
import PaymasterHubABI from '../../../../abi/PaymasterHub.json';
import ERC20ABI from '../../../../abi/ERC20.json';
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
  // Deposit Functions
  // ============================================

  /**
   * Approve an ERC20 token for spending by the PaymentManager
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {string} spenderAddress - Address to approve (PaymentManager)
   * @param {string} amount - Amount to approve (in wei)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async approveToken(tokenAddress, spenderAddress, amount, options = {}) {
    requireAddress(tokenAddress, 'Token address');
    requireAddress(spenderAddress, 'Spender address');
    requirePositiveNumber(amount, 'Approval amount');

    const contract = this.factory.createWritable(tokenAddress, ERC20ABI);
    return this.txManager.execute(contract, 'approve', [spenderAddress, amount], options);
  }

  /**
   * Deposit ERC20 tokens into the PaymentManager treasury
   * @param {string} contractAddress - PaymentManager contract address
   * @param {string} tokenAddress - ERC20 token to deposit
   * @param {string} amount - Amount to deposit (in wei)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async depositERC20(contractAddress, tokenAddress, amount, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');
    requireAddress(tokenAddress, 'Token address');
    requirePositiveNumber(amount, 'Deposit amount');

    const contract = this.factory.createWritable(contractAddress, PaymentManagerABI);
    return this.txManager.execute(contract, 'payERC20', [tokenAddress, amount], options);
  }

  /**
   * Transfer ERC20 tokens directly to a recipient (e.g., TaskManager for bounty funding).
   * Uses plain ERC20.transfer — no approval needed since tokens come from caller's balance.
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {string} recipientAddress - Destination address (e.g., TaskManager)
   * @param {string} amount - Amount to transfer (in wei)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async transferERC20(tokenAddress, recipientAddress, amount, options = {}) {
    requireAddress(tokenAddress, 'Token address');
    requireAddress(recipientAddress, 'Recipient address');
    requirePositiveNumber(amount, 'Transfer amount');

    const contract = this.factory.createWritable(tokenAddress, ERC20ABI);
    return this.txManager.execute(contract, 'transfer', [recipientAddress, amount], options);
  }

  /**
   * Get current ERC20 allowance
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {string} ownerAddress - Token owner address
   * @param {string} spenderAddress - Approved spender address
   * @returns {Promise<string>} Current allowance in wei
   */
  async getAllowance(tokenAddress, ownerAddress, spenderAddress) {
    requireAddress(tokenAddress, 'Token address');
    requireAddress(ownerAddress, 'Owner address');
    requireAddress(spenderAddress, 'Spender address');

    const contract = this.factory.createReadOnly(tokenAddress, ERC20ABI);
    const allowance = await contract.allowance(ownerAddress, spenderAddress);
    return allowance.toString();
  }

  /**
   * Get ERC20 token balance for an account
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {string} accountAddress - Account to check balance of
   * @returns {Promise<string>} Balance in wei
   */
  async getTokenBalance(tokenAddress, accountAddress) {
    requireAddress(tokenAddress, 'Token address');
    requireAddress(accountAddress, 'Account address');

    const contract = this.factory.createReadOnly(tokenAddress, ERC20ABI);
    const balance = await contract.balanceOf(accountAddress);
    return balance.toString();
  }

  // ============================================
  // Gas Pool Functions
  // ============================================

  /**
   * Deposit native token (ETH/xDAI) to the org's gas pool via PaymasterHub.depositForOrg
   * @param {string} paymasterHubAddress - PaymasterHub proxy address
   * @param {string} orgId - Organization ID (bytes32)
   * @param {string} amount - Amount to deposit (in wei)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async depositToGasPool(paymasterHubAddress, orgId, amount, options = {}) {
    requireAddress(paymasterHubAddress, 'PaymasterHub address');
    requirePositiveNumber(amount, 'Deposit amount');

    const contract = this.factory.createWritable(paymasterHubAddress, PaymasterHubABI);
    return this.txManager.execute(contract, 'depositForOrg', [orgId], { ...options, value: amount });
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
  async finalizeDistribution(contractAddress, distributionId, minClaimPeriodBlocks = 0, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    const contract = this.factory.createWritable(contractAddress, PaymentManagerABI);
    const id = ethers.BigNumber.from(distributionId);

    // The ABI takes two arguments — `finalizeDistribution(uint256 distributionId,
    // uint256 minClaimPeriodBlocks)`. Passing one made ethers throw "missing
    // argument" before any RPC was made (this method had no caller until now).
    return this.txManager.execute(
      contract,
      'finalizeDistribution',
      [id, ethers.BigNumber.from(minClaimPeriodBlocks || 0)],
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
    const result = await contract.getDistribution(id);

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
    const claimed = await contract.hasClaimed(id, userAddress);

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
      'optOut',
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
