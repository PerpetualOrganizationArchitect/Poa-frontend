/**
 * PasskeyOnboardingService
 * Orchestrates the full passkey onboarding flow:
 * 1. Create WebAuthn credential (biometric prompt)
 * 2. Compute counterfactual smart account address
 * 3. Sign registration challenge (biometric prompt — proves passkey ownership for username registration)
 * 4. Build UserOp with initCode (account deployment) + callData (registerAndQuickJoin)
 * 5. Sign UserOp hash with passkey (biometric prompt)
 * 6. Submit to bundler
 * 7. Wait for receipt
 */

import { encodeFunctionData } from 'viem';
import PasskeyAccountABI from '../../../../abi/PasskeyAccount.json';
import PasskeyAccountFactoryABI from '../../../../abi/PasskeyAccountFactory.json';
import UniversalAccountRegistryABI from '../../../../abi/UniversalAccountRegistry.json';
import QuickJoinABI from '../../../../abi/QuickJoinNew.json';
import { createPasskeyCredential } from '../passkey/passkeyCreate';
import { signUserOpWithPasskey, signRegistrationChallenge, computeRegistrationChallenge } from '../passkey/passkeySign';
import { buildUserOp, getUserOpHash } from '../passkey/userOpBuilder';
import { encodeOnboardingPaymasterData, encodeSolidarityOnboardingPaymasterData } from '../passkey/paymasterData';
import { ENTRY_POINT_ADDRESS } from '../../../config/passkey';
import { NETWORKS, DEFAULT_NETWORK } from '../../../config/networks';

// Registration deadline: 5 minutes from now
const REGISTRATION_DEADLINE_SECONDS = 1209600;

/**
 * Onboarding step identifiers for progress tracking
 */
export const OnboardingStep = {
  IDLE: 'idle',
  CREATING_CREDENTIAL: 'creating_credential',
  COMPUTING_ADDRESS: 'computing_address',
  BUILDING_TRANSACTION: 'building_transaction',
  SIGNING_REGISTRATION: 'signing_registration',
  SIGNING: 'signing',
  SUBMITTING: 'submitting',
  CONFIRMING: 'confirming',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * Step descriptions for UI display
 */
export const STEP_MESSAGES = {
  [OnboardingStep.CREATING_CREDENTIAL]: 'Creating your passkey...',
  [OnboardingStep.COMPUTING_ADDRESS]: 'Computing your account address...',
  [OnboardingStep.BUILDING_TRANSACTION]: 'Preparing your transaction...',
  [OnboardingStep.SIGNING_REGISTRATION]: 'Sign with your passkey to register your username...',
  [OnboardingStep.SIGNING]: 'Sign with your passkey to confirm...',
  [OnboardingStep.SUBMITTING]: 'Submitting to the network...',
  [OnboardingStep.CONFIRMING]: 'Confirming on blockchain...',
  [OnboardingStep.SUCCESS]: 'Account created successfully!',
  [OnboardingStep.ERROR]: 'Something went wrong.',
};

export class PasskeyOnboardingService {
  /**
   * @param {Object} params
   * @param {Object} params.publicClient - viem public client
   * @param {Object} params.bundlerClient - Pimlico bundler client
   * @param {string} params.factoryAddress - PasskeyAccountFactory address
   * @param {string} params.registryAddress - UniversalAccountRegistry address
   * @param {string} [params.quickJoinAddress] - QuickJoin contract address (org mode only)
   * @param {string} params.paymasterAddress - PaymasterHub proxy address
   * @param {string} [params.orgId] - bytes32 org ID (org mode only)
   * @param {string} [params.mode='org'] - 'org' for org-scoped onboarding, 'solidarity' for protocol-level
   */
  constructor({ publicClient, bundlerClient, factoryAddress, registryAddress, quickJoinAddress, paymasterAddress, orgId, mode = 'org', hatId, chainId = null }) {
    this.publicClient = publicClient;
    this.bundlerClient = bundlerClient;
    this.factoryAddress = factoryAddress;
    this.registryAddress = registryAddress;
    this.quickJoinAddress = quickJoinAddress;
    this.paymasterAddress = paymasterAddress;
    this.orgId = orgId;
    this.mode = mode;
    this.hatId = hatId;
    this.chainId = chainId || NETWORKS[DEFAULT_NETWORK].chainId;
  }

  /**
   * Compute the counterfactual address for a credential without deploying.
   */
  static async computeCounterfactualAddress(publicClient, factoryAddress, credential) {
    return publicClient.readContract({
      address: factoryAddress,
      abi: PasskeyAccountFactoryABI,
      functionName: 'getAddress',
      args: [credential.credentialId, credential.publicKeyX, credential.publicKeyY, credential.salt],
    });
  }

  /**
   * Query the registry nonce for an account address.
   * For new (undeployed) accounts this returns 0n.
   */
  async _getRegistryNonce(accountAddress) {
    return this.publicClient.readContract({
      address: this.registryAddress,
      abi: UniversalAccountRegistryABI,
      functionName: 'nonces',
      args: [accountAddress],
    });
  }

  /**
   * Build the callData for org-mode onboarding using registerAndQuickJoinWithPasskey.
   * Signs the registration challenge (biometric prompt) and encodes the execute call.
   *
   * @param {Object} credential - { credentialId, publicKeyX, publicKeyY, salt, rawCredentialId }
   * @param {string} accountAddress - Counterfactual account address
   * @param {string} username - Username to register
   * @param {Function} onStep - Progress callback
   * @returns {string} Encoded callData for the UserOp
   */
  async _buildOrgModeCallData(credential, accountAddress, username, onStep) {
    const { credentialId, publicKeyX, publicKeyY, salt, rawCredentialId } = credential;

    // Query registry nonce (0 for new accounts)
    const nonce = await this._getRegistryNonce(accountAddress);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + REGISTRATION_DEADLINE_SECONDS);

    // Compute the EIP-712 registration challenge
    const challengeHash = computeRegistrationChallenge({
      accountAddress,
      username,
      nonce,
      deadline,
      chainId: this.chainId,
      registryAddress: this.registryAddress,
    });

    // Sign registration challenge with passkey (biometric prompt)
    onStep(OnboardingStep.SIGNING_REGISTRATION);
    const auth = await signRegistrationChallenge(challengeHash, rawCredentialId);

    // Encode registerAndQuickJoinWithPasskey call on QuickJoin
    const registerAndJoinData = encodeFunctionData({
      abi: QuickJoinABI,
      functionName: 'registerAndQuickJoinWithPasskey',
      args: [
        { credentialId, publicKeyX, publicKeyY, salt },
        username,
        deadline,
        nonce,
        auth,
      ],
    });

    return encodeFunctionData({
      abi: PasskeyAccountABI,
      functionName: 'execute',
      args: [this.quickJoinAddress, 0n, registerAndJoinData],
    });
  }

  /**
   * Execute the full onboarding flow.
   *
   * @param {string} username - Username to register
   * @param {Function} [onStep] - Callback for step changes: (step, data) => {}
   * @returns {Object} { accountAddress, credentialId, publicKeyX, publicKeyY, rawCredentialId, salt }
   */
  async onboard(username, onStep = () => {}) {
    try {
      // Step 1: Create passkey credential (biometric prompt #1)
      onStep(OnboardingStep.CREATING_CREDENTIAL);
      const credential = await createPasskeyCredential(username);
      const { credentialId, publicKeyX, publicKeyY, rawCredentialId, salt } = credential;

      console.log('[Onboarding] Credential created:', credentialId);

      // Step 2: Compute counterfactual address
      onStep(OnboardingStep.COMPUTING_ADDRESS);
      const accountAddress = await this.publicClient.readContract({
        address: this.factoryAddress,
        abi: PasskeyAccountFactoryABI,
        functionName: 'getAddress',
        args: [credentialId, publicKeyX, publicKeyY, salt],
      });

      console.log('[Onboarding] Counterfactual address:', accountAddress);

      // Step 3: Build the UserOp
      onStep(OnboardingStep.BUILDING_TRANSACTION);

      // initCode = factory address + createAccount(credentialId, pubKeyX, pubKeyY, salt)
      const factoryCallData = encodeFunctionData({
        abi: PasskeyAccountFactoryABI,
        functionName: 'createAccount',
        args: [credentialId, publicKeyX, publicKeyY, salt],
      });
      const initCode = this.factoryAddress + factoryCallData.slice(2);

      // Build callData and paymasterData based on mode
      let callData;
      let paymasterData;

      if (this.mode === 'solidarity') {
        // Solidarity mode: deploy + register username (contract whitelists registerAccount)
        const registerCallData = encodeFunctionData({
          abi: UniversalAccountRegistryABI,
          functionName: 'registerAccount',
          args: [username],
        });
        callData = encodeFunctionData({
          abi: PasskeyAccountABI,
          functionName: 'execute',
          args: [this.registryAddress, 0n, registerCallData],
        });
        paymasterData = encodeSolidarityOnboardingPaymasterData();
      } else {
        // Org mode: registerAndQuickJoinWithPasskey
        // The paymaster sponsors the UserOp against this hat's shared org budget, so a
        // hat ID is mandatory. Guard before the registration challenge so a misconfigured
        // call fails fast with a clear message instead of prompting for a second biometric
        // and then throwing "Cannot convert undefined to a BigInt" deep in paymaster encoding.
        if (this.hatId === undefined || this.hatId === null) {
          throw new Error('A paymaster hat ID is required for org-mode onboarding.');
        }

        // This signs the registration challenge (biometric prompt #2)
        callData = await this._buildOrgModeCallData(credential, accountAddress, username, onStep);

        paymasterData = encodeOnboardingPaymasterData({
          hatId: this.hatId,
          orgId: this.orgId,
        });
      }

      const userOp = await buildUserOp({
        sender: accountAddress,
        callData,
        bundlerClient: this.bundlerClient,
        publicClient: this.publicClient,
        initCode,
        paymasterAddress: this.paymasterAddress,
        paymasterData,
      });

      // Step 4: Sign UserOp hash with passkey (biometric prompt #3 for org, #2 for solidarity)
      onStep(OnboardingStep.SIGNING);
      const userOpHash = getUserOpHash(
        userOp,
        ENTRY_POINT_ADDRESS,
        this.chainId,
      );
      const signature = await signUserOpWithPasskey(userOpHash, rawCredentialId);
      userOp.signature = signature;

      // Step 5: Submit to bundler
      onStep(OnboardingStep.SUBMITTING);
      const submittedHash = await this.bundlerClient.sendUserOperation({
        ...userOp,
        entryPointAddress: ENTRY_POINT_ADDRESS,
      });

      console.log('[Onboarding] UserOp submitted:', submittedHash);

      // Step 6: Wait for receipt
      onStep(OnboardingStep.CONFIRMING);
      const receipt = await this.bundlerClient.waitForUserOperationReceipt({
        hash: submittedHash,
        timeout: 120_000,
      });

      if (!receipt.success) {
        throw new Error(receipt.reason || 'Onboarding UserOp failed on-chain');
      }

      console.log('[Onboarding] Confirmed:', receipt.receipt.transactionHash);

      // Step 7: Success
      const result = {
        accountAddress,
        credentialId,
        publicKeyX,
        publicKeyY,
        rawCredentialId,
        salt: salt.toString(),
        transactionHash: receipt.receipt.transactionHash,
      };

      onStep(OnboardingStep.SUCCESS, result);
      return result;

    } catch (error) {
      console.error('[Onboarding] Error:', error);
      onStep(OnboardingStep.ERROR, { error });
      throw error;
    }
  }


}

/**
 * Create a PasskeyOnboardingService instance.
 */
export function createPasskeyOnboardingService(params) {
  return new PasskeyOnboardingService(params);
}
