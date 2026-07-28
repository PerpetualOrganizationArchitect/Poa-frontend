/**
 * ContractFactory
 * Safe contract instance creation with validation
 */

import { ethers } from 'ethers';
import { ContractCreationError, Web3ErrorCategory } from '@/lib/errors';

/**
 * ContractFactory - Creates validated contract instances
 */
export class ContractFactory {
  /**
   * @param {ethers.Signer} signer - Ethers signer for write operations
   * @param {ethers.Provider} [provider] - Ethers provider for read operations
   */
  constructor(signer, provider = null) {
    this.signer = signer;
    this.provider = provider;
  }

  /**
   * Create a contract instance for write operations.
   * When a signer is available (EOA), the contract is connected to it for direct calls.
   * When only a provider is available (passkey), the contract is used for ABI encoding only
   * — SmartAccountTransactionManager handles actual execution via UserOps.
   * @param {string} address - Contract address
   * @param {Array} abi - Contract ABI
   * @returns {ethers.Contract} Contract instance
   * @throws {ContractCreationError} If validation fails
   */
  createWritable(address, abi) {
    this._validateAddress(address);
    this._validateAbi(abi);

    if (this.signer) {
      return new ethers.Contract(address, abi, this.signer);
    }
    if (this.provider) {
      return new ethers.Contract(address, abi, this.provider);
    }

    // No signer or provider: contract supports ABI encoding only (.address, .interface).
    // Used by passkey users where SmartAccountTransactionManager handles execution.
    return new ethers.Contract(address, abi);
  }

  /**
   * Create a contract instance for read-only operations
   * @param {string} address - Contract address
   * @param {Array} abi - Contract ABI
   * @returns {ethers.Contract} Contract instance connected to provider
   * @throws {ContractCreationError} If validation fails
   */
  createReadOnly(address, abi) {
    this._validateAddress(address);
    this._validateAbi(abi);
    this._validateProvider();

    const providerOrSigner = this.provider || this.signer;
    return new ethers.Contract(address, abi, providerOrSigner);
  }

  /**
   * Update the signer (e.g., when wallet changes)
   * @param {ethers.Signer} signer - New signer
   */
  updateSigner(signer) {
    this.signer = signer;
  }

  /**
   * Update the provider
   * @param {ethers.Provider} provider - New provider
   */
  updateProvider(provider) {
    this.provider = provider;
  }

  /**
   * Check if signer is available
   * @returns {boolean}
   */
  hasSigner() {
    return !!this.signer;
  }

  /**
   * Check if provider is available
   * @returns {boolean}
   */
  hasProvider() {
    return !!(this.provider || this.signer);
  }

  /**
   * Validate contract address format
   * @param {string} address - Address to validate
   * @throws {ContractCreationError} If address is invalid
   */
  _validateAddress(address) {
    if (!address) {
      throw new ContractCreationError(
        'Contract address is required.',
        Web3ErrorCategory.INVALID_ADDRESS
      );
    }

    if (!ethers.utils.isAddress(address)) {
      throw ContractCreationError.invalidAddress(address);
    }
  }

  /**
   * Validate ABI format
   * @param {Array} abi - ABI to validate
   * @throws {ContractCreationError} If ABI is invalid
   */
  _validateAbi(abi) {
    if (!abi || !Array.isArray(abi) || abi.length === 0) {
      throw ContractCreationError.invalidAbi();
    }
  }

  /**
   * Validate signer is available
   * @throws {ContractCreationError} If no signer
   */
  _validateSigner() {
    if (!this.signer) {
      throw ContractCreationError.noSigner();
    }
  }

  /**
   * Validate provider or signer is available
   * @throws {ContractCreationError} If no provider or signer
   */
  _validateProvider() {
    if (!this.provider && !this.signer) {
      throw new ContractCreationError(
        'We couldn’t reach the network. Check your connection and try again.',
        Web3ErrorCategory.NETWORK_ERROR
      );
    }
  }
}

/**
 * Create a ContractFactory instance
 * @param {ethers.Signer} signer - Ethers signer
 * @param {ethers.Provider} [provider] - Ethers provider
 * @returns {ContractFactory} Factory instance
 */
export function createContractFactory(signer, provider = null) {
  return new ContractFactory(signer, provider);
}
