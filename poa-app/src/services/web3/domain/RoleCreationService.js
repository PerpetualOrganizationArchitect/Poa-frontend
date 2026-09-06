/** Read-only preflights for proposal configuration, always on the org's chain. */
import { utils, constants } from 'ethers';

const PAYMASTER_ABI = [
  'function setBudget(bytes32 orgId, bytes32 subjectKey, uint128 capPerEpoch, uint32 epochLen)',
  'function getOrgConfig(bytes32 orgId) view returns (tuple(uint256 adminHatId,uint256 operatorHatId,bool paused,uint40 registeredAt,bool bannedFromSolidarity))',
  'function getBudget(bytes32 orgId,bytes32 key) view returns (tuple(uint128 capPerEpoch,uint128 usedInEpoch,uint32 epochLen,uint32 epochStart))',
];
const REGISTRY_ABI = [
  'function metadataAdminHatOf(bytes32 orgId) view returns (uint256)',
];
const AUTHORIZATION_ERRORS = new Set([
  utils.id('NotOperator()').slice(0, 10), utils.id('NotAdmin()').slice(0, 10),
]);

export class RoleCreationService {
  constructor(readFactory) { this.readFactory = readFactory; }

  async getMetadataAdmin(orgRegistry, orgId) {
    const registry = this.readFactory.createReadOnly(orgRegistry, REGISTRY_ABI);
    return String(await registry.metadataAdminHatOf(orgId));
  }

  async getSponsorshipConfig({ paymasterHub, executor, orgId, zkEmailAddress }) {
    if (!paymasterHub || !executor || !orgId) {
      return { ready: true, canConfigure: false, error: 'Gas sponsorship is not configured for this org.' };
    }
    const hub = this.readFactory.createReadOnly(paymasterHub, PAYMASTER_ABI);
    const org = await hub.getOrgConfig(orgId);
    if (String(org.adminHatId ?? org[0]) === '0') {
      return { ready: true, canConfigure: false, error: 'This org has not registered for gas sponsorship.' };
    }
    try {
      // eth_call only: exercise the live operator gate as the batch's actual sender. Authority
      // migration changes how the admin subject resolves, so an indexed role label is not proof.
      await hub.callStatic.setBudget(orgId, constants.HashZero, '1', 3600, { from: executor });
      let claimBudget = null;
      if (zkEmailAddress) {
        const key = utils.solidityKeccak256(['uint8', 'bytes32'], [5, utils.hexZeroPad(zkEmailAddress, 32)]);
        const budget = await hub.getBudget(orgId, key);
        claimBudget = { capWei: String(budget.capPerEpoch ?? budget[0]), epochSecs: Number(budget.epochLen ?? budget[2]) };
      }
      return {
        ready: true, canConfigure: true, paused: Boolean(org.paused ?? org[2]), error: null,
        claimBudget, claimBudgetMissing: claimBudget ? claimBudget.epochSecs === 0 : false,
      };
    } catch (error) {
      const data = error?.error?.data?.data || error?.error?.data || error?.data;
      if (AUTHORIZATION_ERRORS.has(typeof data === 'string' ? data.slice(0, 10) : '')) {
        return {
          ready: true, canConfigure: false,
          error: 'This org’s gas sponsor is managed by an operator. A role-creation vote cannot change its budgets.',
        };
      }
      throw error;
    }
  }
}
