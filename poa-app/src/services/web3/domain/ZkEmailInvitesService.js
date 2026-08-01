/**
 * ZkEmailInvitesService
 * Submits ZK Email role claims to a per-org ZkEmailInvites module (merkle-allowlist model).
 *
 * ZkEmailInvites is an OPTIONAL per-org module: only orgs that opted in (on a chain with ZK Email
 * infra wired) have one. Callers gate on `zkEmailInvitesEnabled` from POContext.
 *
 * Claims carry a merkle proof that the claimer's entry is in the active allowlist, plus the entry's
 * `hatIds`. Domain claims use a `ZkEmailProof` (3-signal circuit); specific-address claims use a
 * `ZkEmailProofV2` (4-signal circuit, exposes emailHash). The claim is permissionless — anyone may
 * submit it for the in-circuit-bound address — so it works from a passkey UserOp (gasless) or an EOA tx.
 */

import ZkEmailInvitesABI from '../../../../abi/ZkEmailInvites.json';
import { requireAddress } from '../utils/validation';

export class ZkEmailInvitesService {
  /**
   * @param {ContractFactory} contractFactory
   * @param {TransactionManager} transactionManager
   */
  constructor(contractFactory, transactionManager) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
  }

  /**
   * Claim role hats for a whole-DOMAIN allowlist entry.
   * @param {string} contractAddress ZkEmailInvites proxy
   * @param {Object} proof ZkEmailProof { pA, pB, pC, pubkeyHash, emailNullifier, fromDomainHash }
   * @param {string} claimer address the hats mint to (must equal the in-circuit-bound address)
   * @param {Array<string>} hatIds the entry's hat IDs (must match the merkle leaf)
   * @param {Array<string>} merkleProof proof that (domain, hatIds) is in the active allowlist root
   * @param {Object} [options={}] tx options (paymasterHatIds for gasless sponsorship)
   */
  async claimRoleByDomain(contractAddress, proof, claimer, hatIds, merkleProof, options = {}) {
    requireAddress(contractAddress, 'ZkEmailInvites contract address');
    requireAddress(claimer, 'Claimer address');
    if (!proof) throw new Error('Email proof is required');
    const contract = this.factory.createWritable(contractAddress, ZkEmailInvitesABI);
    return this.txManager.execute(contract, 'claimRoleByDomain', [proof, claimer, hatIds, merkleProof], options);
  }

  /**
   * Claim role hats for a SPECIFIC-address allowlist entry (v2 proof carries emailHash).
   * @param {Object} proof ZkEmailProofV2 { ..., emailHash }
   */
  async claimRoleByEmail(contractAddress, proof, claimer, hatIds, merkleProof, options = {}) {
    requireAddress(contractAddress, 'ZkEmailInvites contract address');
    requireAddress(claimer, 'Claimer address');
    if (!proof) throw new Error('Email proof is required');
    const contract = this.factory.createWritable(contractAddress, ZkEmailInvitesABI);
    return this.txManager.execute(contract, 'claimRoleByEmail', [proof, claimer, hatIds, merkleProof], options);
  }

  /**
   * Read the active allowlist commitment.
   * @returns {Promise<{ root: string, cid: string }>} both bytes32; `root == 0x0…0` means dormant.
   */
  async getActiveAllowlist(contractAddress) {
    requireAddress(contractAddress, 'ZkEmailInvites contract address');
    const contract = this.factory.createReadOnly(contractAddress, ZkEmailInvitesABI);
    // Sequential (not Promise.all) + one retry: concurrent eth_calls to a rate-limited public RPC
    // intermittently return empty for the second call → ethers CALL_EXCEPTION data="0x".
    for (let attempt = 0; ; attempt++) {
      try {
        const root = await contract.merkleRoot();
        const cid = await contract.allowlistCid();
        return { root, cid };
      } catch (e) {
        if (attempt >= 2) throw e;
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  /** Whether an email nullifier has already been consumed at this org (prevents double-claim). */
  async isNullifierUsed(contractAddress, nullifier) {
    requireAddress(contractAddress, 'ZkEmailInvites contract address');
    const contract = this.factory.createReadOnly(contractAddress, ZkEmailInvitesABI);
    return contract.isNullifierUsed(nullifier);
  }
}

/**
 * Create a ZkEmailInvitesService instance.
 * @param {ContractFactory} factory
 * @param {TransactionManager} txManager
 * @returns {ZkEmailInvitesService}
 */
export function createZkEmailInvitesService(factory, txManager) {
  return new ZkEmailInvitesService(factory, txManager);
}
