/**
 * OrganizationService
 * Handles organization membership operations (QuickJoin)
 */

import QuickJoinABI from '../../../../abi/QuickJoinNew.json';
import UniversalAccountRegistryABI from '../../../../abi/UniversalAccountRegistry.json';
import { requireAddress, requireValidUsername } from '../utils/validation';
import { signRegistrationChallenge, computeRegistrationChallenge } from '../passkey/passkeySign';
import { signRegistration } from '../utils/registrySigner';
import { NETWORKS, DEFAULT_NETWORK } from '../../../config/networks';

// Registration deadline: 5 minutes
const REGISTRATION_DEADLINE_SECONDS = 1209600;

/**
 * OrganizationService - Organization membership management
 */
export class OrganizationService {
  /**
   * @param {ContractFactory} contractFactory - Contract factory instance
   * @param {TransactionManager} transactionManager - Transaction manager instance
   * @param {string} [registryAddress] - UniversalAccountRegistry address for new user registration
   * @param {number} [chainId] - Chain ID for registration challenge (defaults to home chain)
   */
  constructor(contractFactory, transactionManager, registryAddress = null, chainId = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.registryAddress = registryAddress;
    this.chainId = chainId || NETWORKS[DEFAULT_NETWORK].chainId;
  }

  /**
   * Register a username and join an organization via registerAndQuickJoinWithPasskey.
   * Combines registration + org join into a single atomic contract call.
   *
   * Requires two biometric prompts:
   *   1. Sign the registration challenge (proves passkey ownership for username)
   *   2. Sign the UserOp (handled by SmartAccountTransactionManager)
   *
   * @param {string} contractAddress - QuickJoin contract address
   * @param {string} username - Username for new account
   * @param {Object} credential - Passkey credential { credentialId, publicKeyX, publicKeyY, salt, rawCredentialId }
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async registerAndJoinNewUser(contractAddress, username, credential, options = {}) {
    requireAddress(contractAddress, 'QuickJoin contract address');
    requireValidUsername(username);

    if (!this.registryAddress) {
      throw new Error('Registry address is required for new user registration');
    }

    const { credentialId, publicKeyX, publicKeyY, salt, rawCredentialId } = credential;
    const accountAddress = this.txManager.accountAddress;

    // Query registry nonce for this account (0 for accounts that haven't registered).
    // Passkey: use chain-routed viem client (ethers provider may be on a different chain).
    // EOA: use ethers via contract factory (signer's provider is on the correct chain after auto-switch).
    let nonce;
    if (this.txManager.publicClient) {
      nonce = BigInt(await this.txManager.publicClient.readContract({
        address: this.registryAddress,
        abi: UniversalAccountRegistryABI,
        functionName: 'nonces',
        args: [accountAddress],
      }));
    } else {
      const registryContract = this.factory.createReadOnly(this.registryAddress, UniversalAccountRegistryABI);
      nonce = BigInt(await registryContract.nonces(accountAddress));
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + REGISTRATION_DEADLINE_SECONDS);

    // Compute and sign the registration challenge (biometric prompt #1)
    const challengeHash = computeRegistrationChallenge({
      accountAddress,
      username,
      nonce,
      deadline,
      chainId: this.chainId,
      registryAddress: this.registryAddress,
    });

    console.log('[OrganizationService] Signing registration challenge...');
    const auth = await signRegistrationChallenge(challengeHash, rawCredentialId);

    // Call registerAndQuickJoinWithPasskey on QuickJoin
    // SmartAccountTransactionManager wraps this in execute() and signs the UserOp (biometric prompt #2)
    console.log('[OrganizationService] Calling registerAndQuickJoinWithPasskey...');
    const quickJoinContract = this.factory.createWritable(contractAddress, QuickJoinABI);

    return this.txManager.execute(
      quickJoinContract,
      'registerAndQuickJoinWithPasskey',
      [
        [credentialId, publicKeyX, publicKeyY, BigInt(salt)],
        username,
        deadline,
        nonce,
        [auth.authenticatorData, auth.clientDataJSON, auth.challengeIndex, auth.typeIndex, auth.r, auth.s],
      ],
      options
    );
  }

  /**
   * Register a username and join an organization via registerAndQuickJoin (EOA wallets).
   * Uses EIP-712 signature for username registration.
   *
   * @param {string} contractAddress - QuickJoin contract address
   * @param {string} username - Username for new account
   * @param {ethers.Signer} signer - Ethers signer for the EOA wallet
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async registerAndJoinEOA(contractAddress, username, signer, options = {}) {
    requireAddress(contractAddress, 'QuickJoin contract address');
    requireValidUsername(username);

    if (!this.registryAddress) {
      throw new Error('Registry address is required for new user registration');
    }

    // Sign registration via EIP-712
    console.log('[OrganizationService] Requesting EIP-712 registration signature...');
    const { deadline, nonce, signature } = await signRegistration({
      signer,
      registryAddress: this.registryAddress,
      username,
    });

    const userAddress = await signer.getAddress();

    console.log('[OrganizationService] Calling registerAndQuickJoin...');
    const quickJoinContract = this.factory.createWritable(contractAddress, QuickJoinABI);

    return this.txManager.execute(
      quickJoinContract,
      'registerAndQuickJoin',
      [userAddress, username, deadline, nonce, signature],
      options
    );
  }

  /**
   * Join an organization with an existing account
   * @param {string} contractAddress - QuickJoin contract address
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async quickJoinWithUser(contractAddress, options = {}) {
    requireAddress(contractAddress, 'QuickJoin contract address');

    const contract = this.factory.createWritable(contractAddress, QuickJoinABI);

    return this.txManager.execute(contract, 'quickJoinWithUser', [], options);
  }


}

/**
 * Create an OrganizationService instance
 * @param {ContractFactory} factory - Contract factory
 * @param {TransactionManager} txManager - Transaction manager
 * @param {string} [registryAddress] - UniversalAccountRegistry address
 * @returns {OrganizationService}
 */
export function createOrganizationService(factory, txManager, registryAddress = null, chainId = null) {
  return new OrganizationService(factory, txManager, registryAddress, chainId);
}
