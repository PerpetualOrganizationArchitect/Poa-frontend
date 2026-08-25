/**
 * Gas Configuration
 * Centralizes gas-related constants and utilities.
 *
 * On mainnet (Arbitrum / Gnosis) we do NOT hardcode a gas price —
 * ethers.js queries the network and uses EIP-1559 automatically,
 * which produces correct pricing on both L2s.
 */

import { ethers } from 'ethers';

/**
 * Gas configuration constants
 */
export const GAS_CONFIG = {
  // Gas limit multiplier as percentage (115 = 15% buffer)
  gasLimitMultiplier: 115,

  // Higher multiplier for delete/cancel operations (120 = 20% buffer)
  deleteGasMultiplier: 120,

  // Divisor for percentage calculation
  gasLimitDivisor: 100,

  // Maximum gas price to prevent runaway costs (in gwei)
  maxGasPriceGwei: '50',

  // Minimum gas price (in gwei)
  minGasPriceGwei: '0.01',
};

/**
 * Get the default gas price as a BigNumber.
 * Kept for backward compatibility but should not be used —
 * let the provider determine gas pricing via EIP-1559.
 * @returns {BigNumber} Gas price in wei
 */
export function getDefaultGasPrice() {
  return ethers.utils.parseUnits('0.1', 'gwei');
}

/**
 * Get maximum allowed gas price as a BigNumber
 * @returns {BigNumber} Maximum gas price in wei
 */
export function getMaxGasPrice() {
  return ethers.utils.parseUnits(GAS_CONFIG.maxGasPriceGwei, 'gwei');
}

/**
 * Calculate gas limit with safety buffer
 * @param {BigNumber} estimate - Gas estimate from contract
 * @param {boolean} [isDelete=false] - Whether this is a delete/cancel operation
 * @returns {BigNumber} Gas limit with buffer applied
 */
export function calculateGasLimit(estimate, isDelete = false) {
  const multiplier = isDelete
    ? GAS_CONFIG.deleteGasMultiplier
    : GAS_CONFIG.gasLimitMultiplier;

  return estimate.mul(multiplier).div(GAS_CONFIG.gasLimitDivisor);
}

/**
 * Create gas options object for a transaction.
 * Only sets gasLimit — gas price is left to the provider (EIP-1559)
 * so it works correctly on Arbitrum, Gnosis, and other L2s.
 *
 * `gasLimitFloor` raises the result when the caller KNOWS the estimate is too low. It is a floor,
 * never a cap: an estimate above it always wins. The motivating case is `announceWinner`, which
 * runs the winning batch inside a try/catch — `eth_estimateGas` therefore prices only the cheap
 * caught-failure path, and the under-funded call silently skips the batch while the transaction
 * itself succeeds. See lib/accessV2/gasFloors.
 *
 * @param {BigNumber} gasEstimate - Gas estimate from contract
 * @param {Object} [options={}] - Additional options
 * @param {boolean} [options.isDelete=false] - Whether this is a delete operation
 * @param {number|BigNumber|string|null} [options.gasLimitFloor] - minimum gas limit to send
 * @returns {Object} Gas options for transaction
 */
export function createGasOptions(gasEstimate, options = {}) {
  const { isDelete = false, gasLimitFloor = null } = options;

  let gasLimit = calculateGasLimit(gasEstimate, isDelete);

  if (gasLimitFloor !== null && gasLimitFloor !== undefined) {
    try {
      const floor = ethers.BigNumber.from(
        typeof gasLimitFloor === 'number' ? Math.floor(gasLimitFloor) : gasLimitFloor
      );
      if (floor.gt(gasLimit)) gasLimit = floor;
    } catch { /* an unparseable floor must never break a transaction — keep the estimate */ }
  }

  return { gasLimit };
}

/**
 * Clamp gas price within acceptable bounds
 * @param {BigNumber} gasPrice - Proposed gas price
 * @returns {BigNumber} Clamped gas price
 */
export function clampGasPrice(gasPrice) {
  const min = ethers.utils.parseUnits(GAS_CONFIG.minGasPriceGwei, 'gwei');
  const max = getMaxGasPrice();

  if (gasPrice.lt(min)) return min;
  if (gasPrice.gt(max)) return max;
  return gasPrice;
}
