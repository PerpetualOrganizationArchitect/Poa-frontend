/**
 * UserService
 * Handles user account operations with UniversalAccountRegistry
 */

import UniversalAccountRegistryABI from '../../../../abi/UniversalAccountRegistry.json';
import { getUniversalAccountRegistryAddress } from '@/config';
import { requireValidUsername } from '../utils/validation';

/**
 * UserService - User registration and account management
 */
export class UserService {
  /**
   * @param {ContractFactory} contractFactory - Contract factory instance
   * @param {TransactionManager} transactionManager - Transaction manager instance
   * @param {string} [registryAddress] - Registry address from subgraph (preferred)
   */
  constructor(contractFactory, transactionManager, registryAddress = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.registryAddress = registryAddress;
  }

  /**
   * Get the registry contract address
   * @returns {string} Contract address
   */
  _getRegistryAddress() {
    if (this.registryAddress) {
      return this.registryAddress;
    }
    // Fallback to config (for backwards compatibility)
    return getUniversalAccountRegistryAddress(null);
  }

  /**
   * Register a new user account
   * @param {string} username - Username to register
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createNewUser(username, options = {}) {
    requireValidUsername(username);

    const address = this._getRegistryAddress();
    const contract = this.factory.createWritable(address, UniversalAccountRegistryABI);

    return this.txManager.execute(contract, 'registerAccount', [username], options);
  }

  /**
   * Change the username for an existing account
   * @param {string} username - New username
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async changeUsername(username, options = {}) {
    requireValidUsername(username);

    const address = this._getRegistryAddress();
    const contract = this.factory.createWritable(address, UniversalAccountRegistryABI);

    return this.txManager.execute(contract, 'changeUsername', [username], options);
  }
}

/**
 * Create a UserService instance
 * @param {ContractFactory} factory - Contract factory
 * @param {TransactionManager} txManager - Transaction manager
 * @param {string} [registryAddress] - Registry address from subgraph (preferred)
 * @returns {UserService}
 */
export function createUserService(factory, txManager, registryAddress = null) {
  return new UserService(factory, txManager, registryAddress);
}
