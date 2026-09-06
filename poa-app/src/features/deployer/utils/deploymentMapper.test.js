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

describe('voting classes', () => {
  it('never ships role indices as literal hat IDs', () => {
    // VotingClassForm writes ROLE INDICES into `hatIds`; the contract reads them as
    // Hats-Protocol ids. Sending them through produced a class with zero voters.
    const mapped = mapVotingClasses([{ ...createDefaultVotingClass(100), hatIds: [0, 1] }]);
    expect(mapped[0].hatIds).toEqual([]);
  });
});
