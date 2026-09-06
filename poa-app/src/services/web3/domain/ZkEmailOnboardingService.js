/**
 * ZkEmailOnboardingService — ONE-STEP "create account + claim role by email".
 *
 * Mirrors PasskeyOnboardingService's vouch-claim shape, but against ZkEmailInvites'
 * registerAndClaimBy{Domain,Email}WithPasskey: a single gasless UserOp that
 *   1. deploys the passkey smart account (initCode, counterfactual address),
 *   2. registers the username on the UniversalAccountRegistry (EIP-712 passkey sig), and
 *   3. verifies the ZK email proof + merkle proof and mints the role hats,
 * all atomically — the on-chain twin of QuickJoin's registerAndClaimHatsWithPasskey.
 *
 * Requires the org's ZkEmailInvites proxy to have `universalFactory` set (late-bind via governance);
 * the factory MUST be the same PasskeyAccountFactory the frontend computes counterfactual addresses
 * with, or the in-circuit-bound claimer won't match the derived account and the claim reverts.
 */

import { encodeFunctionData } from 'viem';
import PasskeyAccountABI from '../../../../abi/PasskeyAccount.json';
import PasskeyAccountFactoryABI from '../../../../abi/PasskeyAccountFactory.json';
import UniversalAccountRegistryABI from '../../../../abi/UniversalAccountRegistry.json';
import ZkEmailInvitesABI from '../../../../abi/ZkEmailInvites.json';
import { createPasskeyCredential } from '../passkey/passkeyCreate';
import { signUserOpWithPasskey, signRegistrationChallenge, computeRegistrationChallenge } from '../passkey/passkeySign';
import { buildUserOpWithFallback, getUserOpHash } from '../passkey/userOpBuilder';
import { encodeClaimPaymasterData, encodeHatPaymasterData } from '../passkey/paymasterData';
import { ENTRY_POINT_ADDRESS } from '../../../config/passkey';

const REGISTRATION_DEADLINE_SECONDS = 1209600;

const toBig = (v) => BigInt(v);
const proofTupleDomain = (p) => ({
  pA: p.pA.map(toBig),
  pB: p.pB.map((pair) => pair.map(toBig)),
  pC: p.pC.map(toBig),
  pubkeyHash: p.pubkeyHash,
  emailNullifier: p.emailNullifier,
  fromDomainHash: p.fromDomainHash,
});
const proofTupleEmail = (p) => ({ ...proofTupleDomain(p), emailHash: p.emailHash });

export class ZkEmailOnboardingService {
  constructor({
    publicClient,
    bundlerClient,
    factoryAddress,
    registryAddress,
    zkEmailInvitesAddress,
    paymasterAddress,
    orgId,
    chainId,
  }) {
    this.publicClient = publicClient;
    this.bundlerClient = bundlerClient;
    this.factoryAddress = factoryAddress;
    this.registryAddress = registryAddress;
    this.zkEmailInvitesAddress = zkEmailInvitesAddress;
    this.paymasterAddress = paymasterAddress;
    this.orgId = orgId;
    this.chainId = chainId;
  }

  /** Read on the same org chain that receives the onboarding UserOp. */
  async getActiveAllowlist() {
    const read = (functionName) => this.publicClient.readContract({
      address: this.zkEmailInvitesAddress, abi: ZkEmailInvitesABI, functionName,
    });
    for (let attempt = 0; ; attempt++) {
      try {
        const root = await read('merkleRoot');
        const cid = await read('allowlistCid');
        return { root, cid };
      } catch (error) {
        if (attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }

  async isEmailRegistered(hash) {
    return this.publicClient.readContract({
      address: this.zkEmailInvitesAddress, abi: ZkEmailInvitesABI,
      functionName: 'isEmailRegistered', args: [hash],
    });
  }

  /**
   * Create a passkey credential LOCALLY (one biometric prompt, no transaction) and compute the
   * counterfactual account address — the address the verification email's subject binds the claim to.
   * @returns {{ credential: Object, accountAddress: string }}
   */
  async createPendingCredential(username) {
    // Bare email claims do not need enrollment infrastructure, but this combined path does.
    // Verify the module's factory before producing a credential/address for the claim email.
    const accountRegistry = await this.publicClient.readContract({
      address: this.zkEmailInvitesAddress, abi: ZkEmailInvitesABI, functionName: 'accountRegistry',
    });
    const universalFactory = await this.publicClient.readContract({
      address: this.zkEmailInvitesAddress, abi: ZkEmailInvitesABI, functionName: 'universalFactory',
    });
    if (String(accountRegistry).toLowerCase() !== this.registryAddress.toLowerCase()
      || String(universalFactory).toLowerCase() !== this.factoryAddress.toLowerCase()) {
      throw new Error('Creating an account while claiming an email invite is not configured for this org. Sign in with an existing account to claim.');
    }
    const credential = await createPasskeyCredential(username);
    const accountAddress = await this.publicClient.readContract({
      address: this.factoryAddress,
      abi: PasskeyAccountFactoryABI,
      functionName: 'getAddress',
      args: [credential.credentialId, credential.publicKeyX, credential.publicKeyY, credential.salt],
    });
    return { credential, accountAddress };
  }

  /**
   * Submit the single UserOp: deploy account + register username + claim the role hats.
   *
   * @param {Object} p
   * @param {Object} p.credential  pending credential ({credentialId, publicKeyX, publicKeyY, salt, rawCredentialId})
   * @param {string} p.accountAddress counterfactual account (the proof's bound claimer)
   * @param {string} p.username
   * @param {'domain'|'email'} p.mode which claim circuit the proof is for
   * @param {Object} p.proof formatted proof from prover.js (hex fields)
   * @param {Array}  p.hatIds entry's hat IDs (decimal strings)
   * @param {Array}  p.merkleProof bytes32[] proof for the entry's leaf
   * @param {Function} [p.onStep] progress callback: 'signing_registration' | 'signing' | 'submitting' | 'confirming'
   * @returns {{ accountAddress, transactionHash }}
   */
  async registerAndClaim({ credential, accountAddress, username, mode, proof, hatIds, merkleProof, onStep = () => {} }) {
    const { credentialId, publicKeyX, publicKeyY, rawCredentialId } = credential;
    const salt = toBig(credential.salt);

    // initCode only while the account is still counterfactual (idempotent across retries: a failed
    // op that already deployed the account must not resend initCode or the EntryPoint rejects AA10).
    const code = await this.publicClient.getBytecode({ address: accountAddress });
    let initCode = '0x';
    if (!code || code === '0x') {
      const factoryCallData = encodeFunctionData({
        abi: PasskeyAccountFactoryABI,
        functionName: 'createAccount',
        args: [credentialId, publicKeyX, publicKeyY, salt],
      });
      initCode = this.factoryAddress + factoryCallData.slice(2);
    }

    // Registry EIP-712 registration challenge (same machinery as QuickJoin's WithPasskey path).
    const nonce = await this.publicClient.readContract({
      address: this.registryAddress,
      abi: UniversalAccountRegistryABI,
      functionName: 'nonces',
      args: [accountAddress],
    });
    const deadline = BigInt(Math.floor(Date.now() / 1000) + REGISTRATION_DEADLINE_SECONDS);
    const challengeHash = computeRegistrationChallenge({
      accountAddress,
      username,
      nonce,
      deadline,
      chainId: this.chainId,
      registryAddress: this.registryAddress,
    });
    onStep('signing_registration');
    const auth = await signRegistrationChallenge(challengeHash, rawCredentialId);

    const isEmail = mode === 'email';
    const inner = encodeFunctionData({
      abi: ZkEmailInvitesABI,
      functionName: isEmail ? 'registerAndClaimByEmailWithPasskey' : 'registerAndClaimByDomainWithPasskey',
      args: [
        { credentialId, publicKeyX, publicKeyY, salt },
        username,
        deadline,
        nonce,
        auth,
        isEmail ? proofTupleEmail(proof) : proofTupleDomain(proof),
        hatIds.map(toBig),
        merkleProof,
      ],
    });
    const callData = encodeFunctionData({
      abi: PasskeyAccountABI,
      functionName: 'execute',
      args: [this.zkEmailInvitesAddress, 0n, inner],
    });

    // CLAIM subject (0x05) first: the hub binds the op to the ZkEmailInvites proxy and does NO
    // eligibility pre-check — required for a FRESH account's first claim (a HAT subject fails
    // validation before the claim can grant eligibility). Budget: keccak(0x05, proxy). The entry
    // hats follow as fallback subjects for orgs whose claim budget isn't configured yet.
    const paymasterDataEntries = [
      encodeClaimPaymasterData({ claimTarget: this.zkEmailInvitesAddress, orgId: this.orgId }),
      ...hatIds.map((hatId) => encodeHatPaymasterData({ hatId, orgId: this.orgId })),
    ];
    const userOp = await buildUserOpWithFallback({
      sender: accountAddress,
      callData,
      bundlerClient: this.bundlerClient,
      publicClient: this.publicClient,
      initCode,
      paymasterAddress: this.paymasterAddress,
      paymasterDataEntries,
    });

    onStep('signing');
    const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, this.chainId);
    userOp.signature = await signUserOpWithPasskey(userOpHash, rawCredentialId);

    onStep('submitting');
    const submittedHash = await this.bundlerClient.sendUserOperation({
      ...userOp,
      entryPointAddress: ENTRY_POINT_ADDRESS,
    });

    onStep('confirming');
    const receipt = await this.bundlerClient.waitForUserOperationReceipt({ hash: submittedHash, timeout: 120_000 });
    if (!receipt.success) {
      throw new Error(receipt.reason || 'Register-and-claim UserOp failed on-chain');
    }
    return {
      accountAddress,
      transactionHash: receipt.receipt.transactionHash,
      // Callers thread this into the subgraph-sync + refresh machinery (role:claimed).
      blockNumber: Number(receipt.receipt.blockNumber),
    };
  }
}

export function createZkEmailOnboardingService(params) {
  return new ZkEmailOnboardingService(params);
}
