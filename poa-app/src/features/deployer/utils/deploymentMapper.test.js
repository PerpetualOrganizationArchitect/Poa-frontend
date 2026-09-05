/**
 * deploymentMapper — deploy-time invariants.
 *
 * These lock in the rules the POP contracts enforce at deploy/join time, so a
 * wizard change can't silently ship calldata that reverts:
 *
 *   M-03  EligibilityModule rejects vouch config on a default-eligible hat
 *         (aborts the whole deploy).
 *   H-03  QuickJoin rejects claiming a default-eligible ("open") hat.
 *   M-09  RoleResolver reverts on a permission bitmap bit that maps to no role.
 *   L-60  Executor.MAX_HATS_PER_MINT caps a mint batch at 20 hats.
 *
 * Set POP_CASES_OUT=<path> to also dump every case's ABI-encoded calldata for
 * execution against the real contracts (see script/frontend-cases in the POP repo).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ethers } from 'ethers';

import {
  mapStateToDeploymentParams,
  buildRoleAssignments,
  validateDeploymentConfig,
  mapVotingClasses,
  getPaymasterFundingValue,
  mapPaymasterConfig,
  buildTaskManagerPerms,
} from './deploymentMapper';
import { indicesToBitmap } from './bitmapUtils';
import { TaskPermission } from '@/util/permissions';
import {
  initialState,
  createDefaultRole,
  createDefaultVotingClass,
  VOTING_STRATEGY,
  deployerReducer,
  ACTION_TYPES,
} from '../context/deployerReducer';
import { buildDeployCalldata } from '../../../../scripts/newDeployment';
import OrgDeployerLegacyABI from '../../../../abi/OrgDeployerLegacy.json';
import { ORG_DEPLOYER_SCHEMA } from './orgDeployerBoundary';

const REGISTRY = '0x55F72CEB09cBC1fAAED734b6505b99b0a1DFA1cA';
const DEPLOYER = '0x1111111111111111111111111111111111111111';

const clone = (o) => JSON.parse(JSON.stringify(o));

/** A wizard state built from the real initial state, named like a real org. */
function stateWith({ name } = {}) {
  const s = clone(initialState);
  s.organization.name = name || 'Test Org';
  s.organization.description = 'desc';
  return s;
}

const vouchedRole = (index, name, voucherRoleIndex, combine) => ({
  ...createDefaultRole(index, name),
  vouching: { enabled: true, quorum: 2, voucherRoleIndex, combineWithHierarchy: combine },
  // deliberately left default-eligible — the mapper must correct this
  defaults: { eligible: true, standing: true },
  hierarchy: { adminRoleIndex: voucherRoleIndex },
});

describe('vouching ⇒ not default-eligible (M-03 / H-03)', () => {
  it('normalizes defaults.eligible to false for every vouched role', () => {
    const state = stateWith();
    state.roles = [vouchedRole(0, 'Member', 1, true), { ...createDefaultRole(1, 'Exec'), hierarchy: { adminRoleIndex: null } }];
    state.permissions = { ...state.permissions, quickJoinRoles: [] };

    const params = mapStateToDeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });

    expect(params.roles[0].vouching.enabled).toBe(true);
    expect(params.roles[0].defaults.eligible).toBe(false);
    // untouched for the non-vouched role
    expect(params.roles[1].defaults.eligible).toBe(true);
  });

  it('normalizes even when combineWithHierarchy is off (H-03 still applies)', () => {
    const state = stateWith();
    state.roles = [vouchedRole(0, 'Member', 1, false), { ...createDefaultRole(1, 'Exec'), hierarchy: { adminRoleIndex: null } }];
    state.permissions = { ...state.permissions, quickJoinRoles: [] };

    const params = mapStateToDeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });
    expect(params.roles[0].defaults.eligible).toBe(false);
  });

  it('flags the conflict in validation so the user is told which switch to flip', () => {
    const state = stateWith();
    state.roles = [vouchedRole(0, 'Member', 1, true), { ...createDefaultRole(1, 'Exec'), hierarchy: { adminRoleIndex: null } }];
    state.permissions = { ...state.permissions, quickJoinRoles: [] };

    const { isValid, errors } = validateDeploymentConfig(state);
    expect(isValid).toBe(false);
    expect(errors.join(' ')).toMatch(/Eligible by default/i);
  });

  it('leaves the existing quick-join eligibility rescue intact', () => {
    const state = stateWith();
    state.roles = [
      { ...createDefaultRole(0, 'Member'), defaults: { eligible: false, standing: true }, hierarchy: { adminRoleIndex: 1 } },
      { ...createDefaultRole(1, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    state.permissions = { ...state.permissions, quickJoinRoles: [0] };

    const params = mapStateToDeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });
    expect(params.roles[0].defaults.eligible).toBe(true);
  });
});

describe('additional wearers are unique per role', () => {
  // Hats reverts a mint to an address that already wears the hat, and the deploy
  // is one transaction — a duplicate wearer burns the launch outright. The Team
  // step blocks it at entry; this is the backstop for state built another way.
  const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  const stateWithWearers = (wearers, mintToDeployer = true) => {
    const state = stateWith();
    state.roles = [
      {
        ...createDefaultRole(0, 'Member'),
        hierarchy: { adminRoleIndex: 1 },
        distribution: { mintToDeployer, additionalWearers: wearers },
      },
      { ...createDefaultRole(1, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    return state;
  };

  it('drops the deployer when the role is already minted to them', () => {
    const params = mapStateToDeploymentParams(
      stateWithWearers([DEPLOYER, ALICE]),
      DEPLOYER,
      { registryAddress: REGISTRY }
    );
    expect(params.roles[0].distribution.additionalWearers).toEqual([ALICE]);
  });

  it('matches the deployer case-insensitively', () => {
    const params = mapStateToDeploymentParams(
      stateWithWearers([DEPLOYER.toUpperCase().replace('0X', '0x')]),
      DEPLOYER,
      { registryAddress: REGISTRY }
    );
    expect(params.roles[0].distribution.additionalWearers).toEqual([]);
  });

  it('keeps the deployer when the role is NOT minted to them', () => {
    const params = mapStateToDeploymentParams(
      stateWithWearers([DEPLOYER, ALICE], false),
      DEPLOYER,
      { registryAddress: REGISTRY }
    );
    expect(params.roles[0].distribution.additionalWearers).toEqual([DEPLOYER, ALICE]);
  });

  it('collapses a repeated address and drops empty slots', () => {
    const params = mapStateToDeploymentParams(
      stateWithWearers([ALICE, ALICE, '', null], false),
      DEPLOYER,
      { registryAddress: REGISTRY }
    );
    expect(params.roles[0].distribution.additionalWearers).toEqual([ALICE]);
  });

  it('dedupes against a passkey smart-account deployer', () => {
    // A passkey founder has no wagmi address, so create/index.js must pass
    // `passkeyState.accountAddress || address`. Handing the mapper undefined
    // skips this filter entirely and ships the duplicate mint.
    const SMART_ACCOUNT = '0x5ba1000000000000000000000000000000000a8b';
    const params = mapStateToDeploymentParams(
      stateWithWearers([SMART_ACCOUNT, ALICE]),
      SMART_ACCOUNT,
      { registryAddress: REGISTRY }
    );
    expect(params.roles[0].distribution.additionalWearers).toEqual([ALICE]);
  });

  it('cannot drop the deployer when no address is supplied (call sites must pass one)', () => {
    const params = mapStateToDeploymentParams(
      stateWithWearers([DEPLOYER, ALICE]),
      undefined,
      { registryAddress: REGISTRY }
    );
    // Documents the coupling: the filter is only as good as the address given.
    expect(params.roles[0].distribution.additionalWearers).toEqual([DEPLOYER, ALICE]);
  });

  it('leaves a clean wearer list untouched', () => {
    const params = mapStateToDeploymentParams(
      stateWithWearers([ALICE], false),
      DEPLOYER,
      { registryAddress: REGISTRY }
    );
    expect(params.roles[0].distribution.additionalWearers).toEqual([ALICE]);
  });
});

describe('reducer keeps vouching and default-eligibility mutually exclusive', () => {
  const base = () => {
    const s = clone(initialState);
    s.roles = [
      { ...createDefaultRole(0, 'Member'), hierarchy: { adminRoleIndex: 1 } },
      { ...createDefaultRole(1, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    return s;
  };

  it('closes the role when vouching is switched on (simple-mode path)', () => {
    const next = deployerReducer(base(), {
      type: ACTION_TYPES.UPDATE_ROLE_VOUCHING,
      payload: { roleIndex: 0, vouching: { enabled: true, quorum: 1 } },
    });
    expect(next.roles[0].defaults.eligible).toBe(false);
  });

  it('is one-directional — turning vouching off does not force the role open', () => {
    // "not vouched, not default-eligible" is a legitimate admin-granted-only role.
    // Only the join-method selector (which literally means "Anyone can join")
    // reopens it; the reducer must not silently override the user's switch.
    const withVouch = deployerReducer(base(), {
      type: ACTION_TYPES.UPDATE_ROLE_VOUCHING,
      payload: { roleIndex: 0, vouching: { enabled: true, quorum: 1 } },
    });
    const off = deployerReducer(withVouch, {
      type: ACTION_TYPES.UPDATE_ROLE_VOUCHING,
      payload: { roleIndex: 0, vouching: { enabled: false, quorum: 0 } },
    });
    expect(off.roles[0].defaults.eligible).toBe(false);
  });

  it('leaves an explicit "closed, admin-granted only" role alone', () => {
    const s = base();
    s.roles[1] = { ...s.roles[1], defaults: { eligible: false, standing: true } };
    const next = deployerReducer(s, {
      type: ACTION_TYPES.UPDATE_ROLE,
      payload: { index: 1, updates: { name: 'Steward' } },
    });
    expect(next.roles[1].defaults.eligible).toBe(false);
  });

  it('preserves the voter minimums when a philosophy variation is applied', () => {
    // sliderToVotingConfig hardcodes hybridVoterQuorum/ddVoterQuorum to 0, and the
    // variation/philosophy paths replace `voting` wholesale. Since v17 these ship at
    // genesis, so wiping them silently discards real config.
    const s = base();
    s.voting = { ...s.voting, hybridVoterQuorum: 5, ddVoterQuorum: 4 };
    const next = deployerReducer(s, {
      type: ACTION_TYPES.APPLY_PHILOSOPHY,
      payload: { voting: { ...s.voting, hybridVoterQuorum: 0, ddVoterQuorum: 0 }, permissions: s.permissions },
    });
    expect(next.voting.hybridVoterQuorum).toBe(5);
    expect(next.voting.ddVoterQuorum).toBe(4);
  });

  it('applies to whole-role updates too (advanced-mode path)', () => {
    const s = base();
    const next = deployerReducer(s, {
      type: ACTION_TYPES.UPDATE_ROLE,
      payload: {
        index: 0,
        updates: { vouching: { enabled: true, quorum: 2, voucherRoleIndex: 1, combineWithHierarchy: true } },
      },
    });
    expect(next.roles[0].defaults.eligible).toBe(false);
  });
});

describe('permission bitmaps (M-09)', () => {
  it('drops out-of-range indices instead of shipping a bit that reverts', () => {
    const assignments = buildRoleAssignments({ tokenApproverRoles: [0, 2, 7] }, 2);
    expect(assignments.tokenApproverRolesBitmap).toBe(indicesToBitmap([0]));
  });

  it('keeps every in-range index', () => {
    const assignments = buildRoleAssignments({ ddVotingRoles: [0, 1, 2] }, 3);
    expect(assignments.ddVotingRolesBitmap).toBe(0b111);
  });

  it('validation reports an out-of-range permission index', () => {
    const state = stateWith();
    state.permissions = { ...state.permissions, tokenApproverRoles: [5] };
    const { errors } = validateDeploymentConfig(state);
    expect(errors.join(' ')).toMatch(/no longer exists/i);
  });

  it('refuses more than 20 join-time roles (Executor.MAX_HATS_PER_MINT)', () => {
    const state = stateWith();
    state.roles = Array.from({ length: 25 }, (_, i) => ({
      ...createDefaultRole(i, `Role${i}`),
      hierarchy: { adminRoleIndex: i === 24 ? null : 24 },
    }));
    state.permissions = { ...state.permissions, quickJoinRoles: Array.from({ length: 21 }, (_, i) => i) };
    const { errors } = validateDeploymentConfig(state);
    expect(errors.join(' ')).toMatch(/At most 20 roles/i);
  });

  it('encodes bit 31 without going negative (JS `1 << 31` is int32)', () => {
    expect(indicesToBitmap([31])).toBe(2 ** 31);
    expect(indicesToBitmap([30])).toBe(2 ** 30);
    // A full 32-role org must round-trip as a positive uint256.
    const all = indicesToBitmap(Array.from({ length: 32 }, (_, i) => i));
    expect(all).toBe(2 ** 32 - 1);
    expect(all).toBeGreaterThan(0);
  });

  it('ignores indices outside the 32-role cap and de-duplicates', () => {
    expect(indicesToBitmap([32, -1, 1.5])).toBe(0);
    expect(indicesToBitmap([3, 3, 3])).toBe(2 ** 3);
  });
});

/**
 * On the current-v1 legacy path, /create does NOT pass a roleAssignments override,
 * so the bitmaps that actually ship come from buildDeployCalldata's name-derived
 * fallback — a second implementation that has to obey the same int32 rules.
 * Exercise it through the real calldata builder at the top of the supported range:
 * `(1 << 31) - 1` is
 * negative (ethers rejects the uint256) and `(1 << 32) - 1` is 0 (every "all roles"
 * bitmap silently empties, deploying an org where nobody can hold tokens, create
 * tasks, or vote).
 */
describe('production role-assignment bitmaps at the 32-role cap', () => {
  const buildAtScale = (roleCount, executiveIndex) => {
    const names = Array.from({ length: roleCount }, (_, i) => `Role${i}`);
    const { calldata } = buildDeployCalldata({
      memberTypeNames: names,
      executivePermissionNames: [names[executiveIndex]],
      POname: `Scale ${roleCount}`,
      quadraticVotingEnabled: false,
      democracyVoteWeight: 50,
      participationVoteWeight: 50,
      hybridVotingEnabled: false,
      participationVotingEnabled: true,
      electionEnabled: false,
      educationHubEnabled: false,
      zkEmailEnabled: false,
      infoIPFSHash: '',
      quorumPercentageDD: 50,
      quorumPercentagePV: 50,
      username: '',
      deployerAddress: DEPLOYER,
      infrastructureAddresses: {
        orgDeployerAddress: '0x1Ad59E785E3aec1c53069f78bEcC24EcFE6a5d1c',
        registryAddress: REGISTRY,
      },
      orgDeployerSchema: ORG_DEPLOYER_SCHEMA.LEGACY,
    });
    const iface = new ethers.utils.Interface(OrgDeployerLegacyABI);
    const [sent] = iface.decodeFunctionData(iface.getFunction(calldata.slice(0, 10)), calldata);
    return sent.roleAssignments;
  };

  // 32 is the legacy wizard/deployer cap. Kyoto v2 is tested separately at its
  // stricter 16-role limit.
  it.each([2, 30, 31, 32])('encodes %i roles without overflowing', (roleCount) => {
    const ra = buildAtScale(roleCount, roleCount - 1);
    const allRoles = ethers.BigNumber.from(2).pow(roleCount).sub(1);

    ra.forEach((bm) => expect(bm.isNegative()).toBe(false));
    // tokenMember / taskCreator / educationMember / hybridProposalCreator /
    // ddVoting / ddCreator are the "every role" bitmaps.
    [1, 3, 5, 6, 7, 8].forEach((i) => expect(ra[i].toString()).toBe(allRoles.toString()));
    // The top role is the executive, so its bit must be set in the approver bitmap.
    expect(ra[2].toString()).toBe(ethers.BigNumber.from(2).pow(roleCount - 1).toString());
  });

  it('does not silently empty the "all roles" bitmaps at 32 roles', () => {
    // Executive at index 0 keeps bit 31 out of the executive bitmap, so nothing
    // throws — this is the variant that used to encode cleanly with every
    // "all roles" bitmap set to 0.
    const ra = buildAtScale(32, 0);
    [1, 3, 5, 6, 7, 8].forEach((i) => expect(ra[i].isZero()).toBe(false));
  });
});

describe('task-manager permission masks track the deployed CREATE grant', () => {
  it('re-adds CREATE for a role that init grants it (bootstrapGlobalPerms overwrites)', () => {
    const { roleIndices, masks } = buildTaskManagerPerms({ 1: TaskPermission.REVIEW }, [0, 1]);
    expect(roleIndices.map((n) => n.toNumber())).toEqual([1]);
    expect(masks[0] & TaskPermission.CREATE).toBe(TaskPermission.CREATE);
    expect(masks[0] & TaskPermission.REVIEW).toBe(TaskPermission.REVIEW);
  });

  it('does NOT grant CREATE to a role the wizard excluded from task creators', () => {
    const { roleIndices, masks } = buildTaskManagerPerms({ 1: TaskPermission.REVIEW }, [0]);
    expect(roleIndices.map((n) => n.toNumber())).toEqual([1]);
    expect(masks[0] & TaskPermission.CREATE).toBe(0);
    expect(masks[0] & TaskPermission.REVIEW).toBe(TaskPermission.REVIEW);
  });

  it('drops an entry that would end up granting nothing', () => {
    const { roleIndices } = buildTaskManagerPerms({ 1: 0 }, [0]);
    expect(roleIndices).toEqual([]);
  });

  it('keeps the historical all-creators behaviour when no creator list is given', () => {
    const { masks } = buildTaskManagerPerms({ 1: TaskPermission.REVIEW });
    expect(masks[0] & TaskPermission.CREATE).toBe(TaskPermission.CREATE);
  });
});

describe('participation-token identity (v17)', () => {
  const withToken = (name, symbol) => {
    const s = stateWith();
    s.organization.tokenName = name;
    s.organization.tokenSymbol = symbol;
    return s;
  };

  it('accepts values at the contract limits', () => {
    const { errors } = validateDeploymentConfig(withToken('N'.repeat(64), 'S'.repeat(16)));
    expect(errors.join(' ')).not.toMatch(/token/i);
  });

  it('measures BYTES, not characters — setName/setSymbol bound bytes()', () => {
    // 33 emoji = 132 UTF-8 bytes but only 66 UTF-16 units; a .length check passes it.
    const { errors } = validateDeploymentConfig(withToken('🚀'.repeat(33), 'PT'));
    expect(errors.join(' ')).toMatch(/Token name is too long/i);

    const sym = validateDeploymentConfig(withToken('', '🚀'.repeat(5)));
    expect(sym.errors.join(' ')).toMatch(/Token ticker is too long/i);
  });

  it('flags an org name too long to build the default token name from', () => {
    const s = stateWith({ name: 'A'.repeat(60) });
    const { errors } = validateDeploymentConfig(s);
    expect(errors.join(' ')).toMatch(/too long to build a default token name/i);
  });

  it('does not flag a normal org name', () => {
    const { errors } = validateDeploymentConfig(stateWith({ name: 'Sunrise Bakery Collective' }));
    expect(errors.join(' ')).not.toMatch(/default token name/i);
  });
});

describe('at least one role must be able to vote', () => {
  it('rejects an all-canVote-off config (the contract would enrol everyone)', () => {
    const s = stateWith();
    s.roles = s.roles.map((r) => ({ ...r, canVote: false }));
    const { errors } = validateDeploymentConfig(s);
    expect(errors.join(' ')).toMatch(/No role can vote/i);
  });

  it('accepts a mixed config with one non-voting agent role', () => {
    const s = stateWith();
    s.roles = [
      { ...createDefaultRole(0, 'Member'), hierarchy: { adminRoleIndex: 2 } },
      { ...createDefaultRole(1, 'Agent'), canVote: false, hierarchy: { adminRoleIndex: 2 } },
      { ...createDefaultRole(2, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    const { errors } = validateDeploymentConfig(s);
    expect(errors.join(' ')).not.toMatch(/No role can vote/i);
  });
});

describe('canVote gates proposals, not polls', () => {
  it('a canVote:false role is still granted poll rights by the deployed bitmaps', () => {
    // GovernanceFactory._filterCanVoteHats only filters the HYBRID voting classes.
    // Poll eligibility comes from `ddVotingRolesBitmap`, which the deploy derives
    // from role NAMES (all roles). Anything claiming "this role doesn't vote" is
    // therefore only true of proposals — the launch modal states the two separately
    // for exactly this reason.
    const state = stateWith();
    state.roles = [
      { ...createDefaultRole(0, 'Member'), hierarchy: { adminRoleIndex: 2 } },
      { ...createDefaultRole(1, 'Agent'), canVote: false, hierarchy: { adminRoleIndex: 2 } },
      { ...createDefaultRole(2, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    const { calldata } = encodeCase(
      { name: 'canvote-vs-polls', state },
      { registryAddress: REGISTRY, orgDeployerAddress: '0x1Ad59E785E3aec1c53069f78bEcC24EcFE6a5d1c', deployerAddress: DEPLOYER }
    );
    const iface = new ethers.utils.Interface(OrgDeployerLegacyABI);
    const [sent] = iface.decodeFunctionData(iface.getFunction(calldata.slice(0, 10)), calldata);

    expect(sent.roles[1].canVote).toBe(false);
    // …yet bit 1 IS set in the poll-voting bitmap.
    const ddBitmap = sent.roleAssignments.ddVotingRolesBitmap.toNumber();
    expect(ddBitmap & (2 ** 1)).toBe(2 ** 1);
  });
});

describe('voting classes', () => {
  it('never ships role indices as literal hat IDs', () => {
    // VotingClassForm writes ROLE INDICES into `hatIds`; the contract reads them as
    // Hats-Protocol ids. Sending them through produced a class with zero voters.
    const mapped = mapVotingClasses([{ ...createDefaultVotingClass(100), hatIds: [0, 1] }]);
    expect(mapped[0].hatIds).toEqual([]);
  });
});

/*───────────────────────────────────────────────────────────────────────────*
 * Calldata matrix — every case must ABI-encode, and (when POP_CASES_OUT is
 * set) gets dumped for execution against the real OrgDeployer.
 *───────────────────────────────────────────────────────────────────────────*/

function buildCases() {
  const cases = [];
  const add = (name, mutate, opts = {}) => {
    const state = stateWith({ name });
    mutate(state);
    cases.push({ name, state, expectRevert: false, ...opts });
  };

  add('baseline-2-roles', () => {});

  add('auto-upgrade-off', (s) => { s.organization.autoUpgrade = false; });

  add('education-hub', (s) => { s.features.educationHubEnabled = true; });

  add('zkemail-invites', (s) => { s.features.zkEmailInvitesEnabled = true; });

  add('zkemail-plus-education', (s) => {
    s.features.zkEmailInvitesEnabled = true;
    s.features.educationHubEnabled = true;
  });

  add('paymaster-disabled', (s) => { s.paymaster.enabled = false; });

  add('paymaster-with-operator-and-caps', (s) => {
    s.paymaster.operatorRoleIndex = 1;
    s.paymaster.maxFeePerGas = '50';
    s.paymaster.maxPriorityFeePerGas = '2';
    s.paymaster.maxCallGas = '2000000';
    s.paymaster.maxVerificationGas = '1500000';
    s.paymaster.maxPreVerificationGas = '200000';
  });

  add('vouched-role-combine-hierarchy', (s) => {
    s.roles = [
      { ...vouchedRole(0, 'Delegate', 1, true) },
      { ...createDefaultRole(1, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    s.permissions = { ...s.permissions, quickJoinRoles: [] };
  });

  add('vouched-role-no-combine', (s) => {
    s.roles = [
      { ...vouchedRole(0, 'Delegate', 1, false) },
      { ...createDefaultRole(1, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    s.permissions = { ...s.permissions, quickJoinRoles: [] };
  });

  add('open-member-plus-vouched-delegate', (s) => {
    s.roles = [
      { ...createDefaultRole(0, 'Member'), hierarchy: { adminRoleIndex: 2 } },
      { ...vouchedRole(1, 'Delegate', 2, true) },
      { ...createDefaultRole(2, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    s.permissions = {
      quickJoinRoles: [0],
      tokenMemberRoles: [0, 1, 2],
      tokenApproverRoles: [2],
      taskCreatorRoles: [0, 1, 2],
      educationCreatorRoles: [2],
      educationMemberRoles: [0, 1, 2],
      hybridProposalCreatorRoles: [0, 1, 2],
      ddVotingRoles: [0, 1, 2],
      ddCreatorRoles: [0, 1, 2],
    };
  });

  add('hybrid-voting-split', (s) => {
    s.voting.mode = 'HYBRID';
    s.voting.democracyWeight = 60;
    s.voting.participationWeight = 40;
    s.voting.classes = [
      { ...createDefaultVotingClass(60), strategy: VOTING_STRATEGY.DIRECT },
      { ...createDefaultVotingClass(40), strategy: VOTING_STRATEGY.ERC20_BAL },
    ];
  });

  add('quadratic-hybrid', (s) => {
    s.voting.mode = 'HYBRID';
    s.voting.democracyWeight = 50;
    s.voting.participationWeight = 50;
    s.voting.classes = [
      { ...createDefaultVotingClass(50), strategy: VOTING_STRATEGY.DIRECT },
      { ...createDefaultVotingClass(50), strategy: VOTING_STRATEGY.ERC20_BAL, quadratic: true },
    ];
  });

  add('metadata-admin-role', (s) => { s.metadataAdminRoleIndex = 1; });

  add('task-manager-perms', (s) => { s.taskManagerPerms = { 0: 0b00000011, 1: 0b11111111 }; });

  add('bootstrap-project-and-task', (s) => {
    s.bootstrap = {
      projects: [{
        id: 'p1', title: 'Launch', description: '', cap: '100',
        managers: [], createHats: [1], claimHats: [0, 1], reviewHats: [1], assignHats: [1], bounties: [],
      }],
      tasks: [{ id: 't1', projectIndex: 0, title: 'First task', description: '', payout: '10', requiresApplication: false }],
    };
  });

  add('dd-initial-targets', (s) => {
    s.ddInitialTargets = ['0x2222222222222222222222222222222222222222'];
  });

  // ── OrgDeployer v17 deploy-time governance config ────────────────────────
  add('voter-quorum-at-genesis', (s) => {
    s.voting.hybridVoterQuorum = 3;
    s.voting.ddVoterQuorum = 2;
  });

  add('custom-token-identity', (s) => {
    s.organization.tokenName = 'Comfiest House Contribution';
    s.organization.tokenSymbol = 'COMFY';
  });

  add('token-identity-max-length', (s) => {
    s.organization.tokenName = 'N'.repeat(64);
    s.organization.tokenSymbol = 'S'.repeat(16);
  });

  add('non-voting-role-excluded-from-classes', (s) => {
    // GovernanceFactory v17 backfills empty class hatIds with canVote=true role hats
    // ONLY, so an agent/bot role marked canVote:false is excluded at genesis.
    s.roles = [
      { ...createDefaultRole(0, 'Member'), hierarchy: { adminRoleIndex: 2 } },
      { ...createDefaultRole(1, 'Agent'), canVote: false, hierarchy: { adminRoleIndex: 2 } },
      { ...createDefaultRole(2, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    s.permissions = { ...s.permissions, quickJoinRoles: [0] };
  });

  add('six-roles-deep-hierarchy', (s) => {
    s.roles = Array.from({ length: 6 }, (_, i) => ({
      ...createDefaultRole(i, `Role${i}`),
      hierarchy: { adminRoleIndex: i === 5 ? null : i + 1 },
    }));
    s.permissions = {
      quickJoinRoles: [0],
      tokenMemberRoles: [0, 1, 2, 3, 4, 5],
      tokenApproverRoles: [5],
      taskCreatorRoles: [0, 1, 2, 3, 4, 5],
      educationCreatorRoles: [5],
      educationMemberRoles: [0, 1, 2, 3, 4, 5],
      hybridProposalCreatorRoles: [0, 1, 2, 3, 4, 5],
      ddVotingRoles: [0, 1, 2, 3, 4, 5],
      ddCreatorRoles: [0, 1, 2, 3, 4, 5],
    };
  });

  add('everything-on', (s) => {
    s.features.educationHubEnabled = true;
    s.features.zkEmailInvitesEnabled = true;
    s.metadataAdminRoleIndex = 1;
    s.taskManagerPerms = { 1: 0b11111111 };
    s.ddInitialTargets = ['0x3333333333333333333333333333333333333333'];
    s.voting.mode = 'HYBRID';
    s.voting.democracyWeight = 50;
    s.voting.participationWeight = 50;
    s.voting.classes = [
      { ...createDefaultVotingClass(50), strategy: VOTING_STRATEGY.DIRECT },
      { ...createDefaultVotingClass(50), strategy: VOTING_STRATEGY.ERC20_BAL },
    ];
    s.roles = [
      { ...createDefaultRole(0, 'Member'), hierarchy: { adminRoleIndex: 2 } },
      { ...vouchedRole(1, 'Delegate', 2, true) },
      { ...createDefaultRole(2, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    s.permissions = {
      quickJoinRoles: [0],
      tokenMemberRoles: [0, 1, 2],
      tokenApproverRoles: [2],
      taskCreatorRoles: [0, 1, 2],
      educationCreatorRoles: [2],
      educationMemberRoles: [0, 1, 2],
      hybridProposalCreatorRoles: [0, 1, 2],
      ddVotingRoles: [0, 1, 2],
      ddCreatorRoles: [0, 1, 2],
    };
    s.bootstrap = {
      projects: [{
        id: 'p1', title: 'Launch', description: '', cap: '100',
        managers: [], createHats: [2], claimHats: [0, 1, 2], reviewHats: [2], assignHats: [2], bounties: [],
      }],
      tasks: [{ id: 't1', projectIndex: 0, title: 'First task', description: '', payout: '10', requiresApplication: true }],
    };
  });

  // ── Negative controls ────────────────────────────────────────────────────
  // These are excluded from the invariant assertions (they intentionally violate
  // them) and are only emitted into the dump, where the on-chain harness asserts
  // they REVERT on the PR-#185 contracts. They are the proof that the
  // normalization above is load-bearing.
  const addNegative = (name, mutate, opts) => {
    const state = stateWith({ name });
    mutate(state);
    cases.push({ name, state, expectRevert: true, negative: true, ...opts });
  };

  addNegative('NEG-vouched-role-left-default-eligible', (s) => {
    s.roles = [
      { ...vouchedRole(0, 'Delegate', 1, true) },
      { ...createDefaultRole(1, 'Exec'), hierarchy: { adminRoleIndex: null } },
    ];
    s.permissions = { ...s.permissions, quickJoinRoles: [] };
  }, { unNormalize: true });

  return cases;
}

function encodeCase(c, { registryAddress, orgDeployerAddress, deployerAddress }) {
  const params = mapStateToDeploymentParams(c.state, deployerAddress, { registryAddress });
  // `unNormalize` reproduces what the mapper would have emitted BEFORE the
  // vouching⇒not-default-eligible normalization, so the harness can prove the
  // normalization is load-bearing rather than cosmetic.
  if (c.unNormalize) {
    params.roles = params.roles.map((r) =>
      r.vouching.enabled ? { ...r, defaults: { ...r.defaults, eligible: true } } : r
    );
  }
  const { calldata } = buildDeployCalldata({
    memberTypeNames: c.state.roles.map((r) => r.name),
    executivePermissionNames: c.state.roles.filter((r) => r.hierarchy.adminRoleIndex === null).map((r) => r.name),
    POname: c.state.organization.name,
    quadraticVotingEnabled: c.state.voting.classes.some((v) => v.quadratic),
    democracyVoteWeight: 50,
    participationVoteWeight: 50,
    hybridVotingEnabled: c.state.voting.classes.length > 1,
    participationVotingEnabled: c.state.voting.classes.length <= 1,
    electionEnabled: c.state.features.electionHubEnabled,
    educationHubEnabled: c.state.features.educationHubEnabled,
    zkEmailEnabled: c.state.features.zkEmailInvitesEnabled,
    infoIPFSHash: '',
    quorumPercentageDD: c.state.voting.ddQuorum,
    quorumPercentagePV: c.state.voting.hybridQuorum,
    username: '',
    deployerAddress,
    customRoles: params.roles,
    autoUpgrade: params.autoUpgrade,
    // NOTE: no `roleAssignments` override — /create keeps the current-v1 legacy
    // name-derived fallback. Kyoto passes its explicit matrix in the v2 test suite.
    infrastructureAddresses: { orgDeployerAddress, registryAddress },
    orgDeployerSchema: ORG_DEPLOYER_SCHEMA.LEGACY,
    regSignatureData: null,
    paymasterConfig: mapPaymasterConfig(c.state.paymaster),
    metadataAdminRoleIndex: c.state.metadataAdminRoleIndex,
    taskManagerPerms: params.taskManagerPerms,
    ddInitialTargets: params.ddInitialTargets,
    bootstrap: params.bootstrap,
    hybridClasses: params.hybridClasses,
    hybridVoterQuorum: params.hybridQuorum,
    ddVoterQuorum: params.ddQuorum,
    tokenName: params.tokenName,
    tokenSymbol: params.tokenSymbol,
  });
  return { params, calldata, valueWei: getPaymasterFundingValue(c.state.paymaster) };
}

describe('deploy calldata matrix', () => {
  const cases = buildCases();
  const positives = cases.filter((c) => !c.negative);

  it.each(positives.map((c) => [c.name, c]))('%s encodes and satisfies the contract invariants', (_name, c) => {
    const { params, calldata } = encodeCase(c, {
      registryAddress: REGISTRY,
      orgDeployerAddress: '0x1Ad59E785E3aec1c53069f78bEcC24EcFE6a5d1c',
      deployerAddress: DEPLOYER,
    });

    // Decode the calldata back out and assert against THAT, not against the
    // mapper's in-memory params — the whole point is that what gets signed carries
    // the invariants. (Asserting on `params` alone passed even when the encoder
    // dropped them.)
    const iface = new ethers.utils.Interface(OrgDeployerLegacyABI);
    const fn = iface.getFunction(calldata.slice(0, 10));
    const [sent] = iface.decodeFunctionData(fn, calldata);

    expect(sent.orgName).toBe(c.state.organization.name);
    expect(sent.autoUpgrade).toBe(c.state.organization.autoUpgrade);
    expect(sent.roles.length).toBe(params.roles.length);

    // OrgDeployer v17 deploy-time governance config. These are the last four fields
    // of the tuple; if they drift out of order the whole struct decodes garbage, so
    // assert the values actually round-trip.
    expect(sent.hybridQuorum).toBe(Number(c.state.voting.hybridVoterQuorum) || 0);
    expect(sent.ddQuorum).toBe(Number(c.state.voting.ddVoterQuorum) || 0);
    expect(sent.tokenName).toBe((c.state.organization.tokenName || '').trim());
    expect(sent.tokenSymbol).toBe((c.state.organization.tokenSymbol || '').trim());

    // M-03 / H-03: no vouched role may be default-eligible — in the ENCODED tuple.
    sent.roles.forEach((r) => {
      if (r.vouching.enabled) expect(r.defaults.eligible).toBe(false);
    });

    // The voting-class hatIds must be empty on the wire so GovernanceFactory
    // backfills the org's canVote role hats.
    sent.hybridClasses.forEach((cl) => expect(cl.hatIds.length).toBe(0));

    // The user's classes must survive to the wire — count, split, strategy and
    // minBalance. buildDeployCalldata used to regenerate a fixed 50/50 pair from two
    // hardcoded weights, so the preview showed one thing and the chain got another.
    expect(sent.hybridClasses.length).toBe(params.hybridClasses.length);
    sent.hybridClasses.forEach((cl, k) => {
      expect(cl.slicePct).toBe(params.hybridClasses[k].slicePct);
      expect(cl.strategy).toBe(params.hybridClasses[k].strategy);
      expect(cl.quadratic).toBe(params.hybridClasses[k].quadratic);
      expect(cl.minBalance.toString()).toBe(params.hybridClasses[k].minBalance.toString());
    });

    // Every permission bitmap bit must map to a role that exists.
    if (params.roles.length < 32) {
      const maxBit = 2 ** params.roles.length - 1;
      for (let i = 0; i < 9; i++) {
        expect(sent.roleAssignments[i].toNumber() & ~maxBit).toBe(0);
      }
    }

    // OrgDeployer._validateRoleConfigs
    expect(params.roles.length).toBeGreaterThan(0);
    expect(params.roles.length).toBeLessThanOrEqual(32);
    params.roles.forEach((r, i) => {
      expect(r.name.length).toBeGreaterThan(0);
      if (r.vouching.enabled) {
        expect(r.vouching.quorum).toBeGreaterThan(0);
        expect(r.vouching.voucherRoleIndex).toBeLessThan(params.roles.length);
      }
      const admin = ethers.BigNumber.from(r.hierarchy.adminRoleIndex);
      if (!admin.eq(ethers.constants.MaxUint256)) {
        expect(admin.toNumber()).toBeLessThan(params.roles.length);
        expect(admin.toNumber()).not.toBe(i);
      }
    });

    // M-09: every bitmap bit maps to a real role. Uses 2**n arithmetic, not
    // `(1 << n) - 1` — the latter goes negative at n=31 and wraps to 0 at n=32.
    const maxBitmap = 2 ** params.roles.length - 1;
    Object.values(params.roleAssignments).forEach((bm) => {
      expect(Number(bm) & ~maxBitmap).toBe(0);
      expect(Number(bm)).toBeGreaterThanOrEqual(0);
    });

    // L-60: quick-join mints in one batch, capped at 20.
    let joinRoles = 0;
    let bm = params.roleAssignments.quickJoinRolesBitmap;
    while (bm) { joinRoles += bm & 1; bm >>>= 1; }
    expect(joinRoles).toBeLessThanOrEqual(20);

    // Voting slices must sum to 100 (VotingErrors.InvalidSliceSum).
    const sliceSum = params.hybridClasses.reduce((n, cl) => n + cl.slicePct, 0);
    expect(sliceSum).toBe(100);

    // hatIds must be empty so GovernanceFactory backfills the real role hats.
    params.hybridClasses.forEach((cl) => expect(cl.hatIds).toEqual([]));
  });

  it('selects the ZK-Email entrypoint iff the feature is on', () => {
    const withZk = cases.find((c) => c.name === 'zkemail-invites');
    const without = cases.find((c) => c.name === 'baseline-2-roles');
    const iface = new ethers.utils.Interface(OrgDeployerLegacyABI);
    const zkSelector = iface.getSighash(iface.getFunction('deployFullOrgWithZkEmail'));
    const plainSelector = iface.getSighash(iface.getFunction('deployFullOrg'));

    const a = encodeCase(withZk, { registryAddress: REGISTRY, orgDeployerAddress: '0x1Ad59E785E3aec1c53069f78bEcC24EcFE6a5d1c', deployerAddress: DEPLOYER });
    const b = encodeCase(without, { registryAddress: REGISTRY, orgDeployerAddress: '0x1Ad59E785E3aec1c53069f78bEcC24EcFE6a5d1c', deployerAddress: DEPLOYER });

    expect(a.calldata.slice(0, 10)).toBe(zkSelector);
    expect(b.calldata.slice(0, 10)).toBe(plainSelector);
  });

  it('optionally dumps the matrix for on-chain execution', () => {
    const out = process.env.POP_CASES_OUT;
    if (!out) return;
    const env = JSON.parse(fs.readFileSync(process.env.POP_CASES_ENV, 'utf8'));
    const dump = { names: [], calldatas: [], values: [], froms: [], expectRevert: [] };
    for (const c of cases) {
      const { calldata, valueWei } = encodeCase(c, {
        registryAddress: env.accountRegistry,
        orgDeployerAddress: env.orgDeployer,
        deployerAddress: env.orgOwner,
      });
      dump.names.push(c.name);
      dump.calldatas.push(calldata);
      dump.values.push(valueWei.toString());
      dump.froms.push(env.orgOwner);
      dump.expectRevert.push(!!c.expectRevert);
    }
    fs.writeFileSync(out, JSON.stringify(dump, null, 2));
    expect(dump.names.length).toBe(cases.length);
  });
});
