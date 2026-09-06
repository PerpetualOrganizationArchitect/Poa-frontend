import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';

import { buildDeployCalldata, deployWithCalldata } from '../../../../scripts/newDeployment';
import { TaskPermission } from '@/util/permissions';
import { createDefaultRole, initialState } from '../context/deployerReducer';
import {
  buildAccessV2TaskManagerPerms,
  mapStateToAccessV2DeploymentParams,
  validateAccessV2Representability,
} from './deploymentMapperV2';
import {
  ORG_DEPLOYER_SCHEMA,
  ORG_DEPLOYER_SELECTORS,
  getOrgDeployerInterface,
} from './orgDeployerBoundary';

const DEPLOYER = '0x1111111111111111111111111111111111111111';
const REGISTRY = '0x2222222222222222222222222222222222222222';
const ORG_DEPLOYER = '0x3333333333333333333333333333333333333333';
const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const EVENT_ADDRESSES = Array.from({ length: 9 }, (_, index) =>
  ethers.utils.getAddress(`0x${(index + 10).toString(16).padStart(40, '0')}`)
);

const clone = (value) => JSON.parse(JSON.stringify(value));

function flatState() {
  const state = clone(initialState);
  state.organization.name = 'Kyoto Test';
  state.organization.description = 'Access v2 mapper fixture';
  state.roles = [
    {
      ...createDefaultRole(0, 'Member'),
      hierarchy: { adminRoleIndex: null },
      hatConfig: { maxSupply: 500, mutableHat: true },
    },
    {
      ...createDefaultRole(1, 'Steward'),
      hierarchy: { adminRoleIndex: null },
      defaults: { eligible: false, standing: true },
      hatConfig: { maxSupply: 12, mutableHat: true },
    },
  ];
  state.permissions = {
    ...state.permissions,
    quickJoinRoles: [0],
    taskCreatorRoles: [0],
  };
  state.taskManagerPerms = { 1: TaskPermission.REVIEW };
  state.groups = [{ name: 'Leadership', memberRoleIndices: [1] }];
  return state;
}

function productionBuildArgs(state, params) {
  return {
    memberTypeNames: state.roles.map((role) => role.name),
    executivePermissionNames: [],
    POname: state.organization.name,
    quadraticVotingEnabled: false,
    democracyVoteWeight: 100,
    participationVoteWeight: 0,
    hybridVotingEnabled: false,
    participationVotingEnabled: true,
    electionEnabled: false,
    educationHubEnabled: false,
    zkEmailEnabled: false,
    infoIPFSHash: '',
    quorumPercentageDD: state.voting.ddQuorum,
    quorumPercentagePV: state.voting.hybridQuorum,
    username: '',
    deployerAddress: DEPLOYER,
    customRoles: params.roles,
    groups: params.groups,
    autoUpgrade: params.autoUpgrade,
    roleAssignments: params.roleAssignments,
    orgDeployerSchema: ORG_DEPLOYER_SCHEMA.ACCESS_V2,
    infrastructureAddresses: {
      orgDeployerAddress: ORG_DEPLOYER,
      registryAddress: REGISTRY,
    },
    taskManagerPerms: params.taskManagerPerms,
    ddInitialTargets: params.ddInitialTargets,
    bootstrap: params.bootstrap,
    paymasterConfig: params.paymasterConfig,
    metadataAdminRoleIndex: params.metadataAdminRoleIndex,
    hybridClasses: params.hybridClasses,
    hybridVoterQuorum: params.hybridQuorum,
    ddVoterQuorum: params.ddQuorum,
    tokenName: params.tokenName,
    tokenSymbol: params.tokenSymbol,
  };
}

describe('Kyoto DeploymentParams mapper', () => {
  it('maps flat roles to open/maxMembers and preserves explicit groups', () => {
    const state = flatState();
    const params = mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });

    expect(params.roles[0]).toMatchObject({ name: 'Member', open: true, maxMembers: 500 });
    expect(params.roles[1]).toMatchObject({ name: 'Steward', open: false, maxMembers: 12 });
    params.roles.forEach((role) => {
      expect(role).not.toHaveProperty('defaults');
      expect(role).not.toHaveProperty('hierarchy');
      expect(role).not.toHaveProperty('hatConfig');
      expect(role.vouching).not.toHaveProperty('combineWithHierarchy');
    });
    expect(params.groups[0].name).toBe('Leadership');
    expect(params.groups[0].memberRoleIndices[0].toNumber()).toBe(1);

    // Kyoto reads task permissions directly from authority TM_PERMS rows. Member
    // therefore keeps an explicit CREATE-only row, while non-creator Steward's
    // REVIEW row must not accidentally acquire CREATE.
    const taskMasks = Object.fromEntries(params.taskManagerPerms.roleIndices.map((index, position) => [
      index.toNumber(),
      params.taskManagerPerms.masks[position],
    ]));
    expect(taskMasks).toEqual({
      0: TaskPermission.CREATE,
      1: TaskPermission.REVIEW,
    });
  });

  it('uses the same explicit openness for validation and encoding', () => {
    const state = flatState();
    state.roles[0].open = false;
    expect(validateAccessV2Representability(state).errors.join(' ')).toMatch(/Quick Join.*not open/i);

    state.permissions.quickJoinRoles = [];
    expect(mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY }).roles[0].open)
      .toBe(false);

    state.roles[0].open = true;
    state.roles[0].defaults.eligible = false;
    state.permissions.quickJoinRoles = [0];
    expect(validateAccessV2Representability(state).isValid).toBe(true);
    expect(mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY }).roles[0].open)
      .toBe(true);

    state.roles[0].vouching.enabled = true;
    state.permissions.quickJoinRoles = [];
    expect(mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY }).roles[0].open)
      .toBe(false);
  });

  it('round-trips the production builder through Kyoto\'s exact ABI', () => {
    const state = flatState();
    state.organization.autoUpgrade = false;
    const params = mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });
    const { calldata } = buildDeployCalldata(productionBuildArgs(state, params));

    expect(calldata.slice(0, 10)).toBe(ORG_DEPLOYER_SELECTORS[ORG_DEPLOYER_SCHEMA.ACCESS_V2].deployFullOrg);
    const [sent] = getOrgDeployerInterface(ORG_DEPLOYER_SCHEMA.ACCESS_V2)
      .decodeFunctionData('deployFullOrg', calldata);
    expect(sent.roles.map((role) => [role.name, role.open, role.maxMembers])).toEqual([
      ['Member', true, 500],
      ['Steward', false, 12],
    ]);
    expect(sent.groups[0].name).toBe('Leadership');
    expect(sent.groups[0].memberRoleIndices.map((index) => index.toNumber())).toEqual([1]);
    expect(sent.taskManagerPerms.roleIndices.map((index) => index.toNumber())).toEqual([0, 1]);
    expect(sent.taskManagerPerms.masks).toEqual([TaskPermission.CREATE, TaskPermission.REVIEW]);
    expect(sent.autoUpgrade).toBe(false);
  });

  it('requires explicit role assignments for Access v2 encoding', () => {
    const state = flatState();
    const params = mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });
    const args = productionBuildArgs(state, params);
    delete args.roleAssignments;
    expect(() => buildDeployCalldata(args)).toThrow(/explicit role assignments/i);
  });

  it('preserves a creator\'s explicit task bits when adding its required CREATE row', () => {
    const perms = buildAccessV2TaskManagerPerms({ 0: TaskPermission.REVIEW }, [0], 2);
    expect(perms.roleIndices.map((index) => index.toNumber())).toEqual([0]);
    expect(perms.masks).toEqual([TaskPermission.CREATE | TaskPermission.REVIEW]);
  });

  it('refuses to send when VERSION resolves to the other ABI major', async () => {
    const state = flatState();
    const params = mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });
    const { calldata } = buildDeployCalldata(productionBuildArgs(state, params));
    const versionIface = getOrgDeployerInterface(ORG_DEPLOYER_SCHEMA.ACCESS_V2);
    const wallet = {
      getChainId: vi.fn(async () => 100),
      provider: {
        call: vi.fn(async () => versionIface.encodeFunctionResult('VERSION', ['1.0.1'])),
      },
      estimateGas: vi.fn(),
      sendTransaction: vi.fn(),
    };

    await expect(deployWithCalldata({
      wallet,
      to: ORG_DEPLOYER,
      calldata,
      orgDeployerSchema: ORG_DEPLOYER_SCHEMA.ACCESS_V2,
      expectedChainId: 100,
    })).rejects.toThrow(/unsupported ABI major 1/i);
    expect(wallet.estimateGas).not.toHaveBeenCalled();
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('sends the exact v2 bytes and parses the v2 receipt after matching VERSION', async () => {
    const state = flatState();
    const params = mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });
    const { calldata } = buildDeployCalldata(productionBuildArgs(state, params));
    const iface = getOrgDeployerInterface(ORG_DEPLOYER_SCHEMA.ACCESS_V2);
    const encodedEvent = iface.encodeEventLog(iface.getEvent('OrgDeployed'), [
      params.orgId,
      ...EVENT_ADDRESSES,
      101,
      [102, 103],
    ]);
    const receipt = {
      transactionHash: ethers.utils.id('deployment-transaction'),
      logs: [{ topics: encodedEvent.topics, data: encodedEvent.data }],
    };
    const sendTransaction = vi.fn(async () => ({
      hash: receipt.transactionHash,
      wait: vi.fn(async () => receipt),
    }));
    const wallet = {
      getChainId: vi.fn(async () => 100),
      provider: {
        call: vi.fn(async () => iface.encodeFunctionResult('VERSION', ['2.0.0'])),
      },
      estimateGas: vi.fn(async () => ethers.BigNumber.from(100000)),
      sendTransaction,
    };

    const result = await deployWithCalldata({
      wallet,
      to: ORG_DEPLOYER,
      calldata,
      orgDeployerSchema: ORG_DEPLOYER_SCHEMA.ACCESS_V2,
      expectedChainId: 100,
    });

    expect(sendTransaction).toHaveBeenCalledWith(expect.objectContaining({
      to: ORG_DEPLOYER,
      data: calldata,
      gasLimit: ethers.BigNumber.from(120000),
    }));
    expect(result.deployment.membershipAuthority).toBe(EVENT_ADDRESSES[8]);
    expect(result.deployment.roleSubjectIds.map((id) => id.toNumber())).toEqual([102, 103]);
  });

  it('refuses to send if the wallet changed away from the selected deployment chain', async () => {
    const state = flatState();
    const params = mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });
    const { calldata } = buildDeployCalldata(productionBuildArgs(state, params));
    const provider = { call: vi.fn() };
    const wallet = {
      getChainId: vi.fn(async () => 1),
      provider,
      estimateGas: vi.fn(),
      sendTransaction: vi.fn(),
    };

    await expect(deployWithCalldata({
      wallet,
      to: ORG_DEPLOYER,
      calldata,
      orgDeployerSchema: ORG_DEPLOYER_SCHEMA.ACCESS_V2,
      expectedChainId: 100,
    })).rejects.toThrow(/connected to chain 1.*targets chain 100.*Refusing to send/i);
    expect(provider.call).not.toHaveBeenCalled();
    expect(wallet.estimateGas).not.toHaveBeenCalled();
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects an initial distribution above maxMembers', () => {
    const state = flatState();
    state.roles[0].hatConfig.maxSupply = 1;
    state.roles[0].distribution.additionalWearers = [ALICE];
    expect(() => mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY }))
      .toThrow(/can hold 1 members.*contains 2/i);
  });
});

describe('honest Access v2 compatibility failures', () => {
  it.each([
    ['parent hierarchy', (state) => { state.roles[0].hierarchy.adminRoleIndex = 1; }, /parent-role hierarchy/i],
    ['hierarchy vouching', (state) => {
      state.roles[0].vouching = { enabled: true, quorum: 1, voucherRoleIndex: 0, combineWithHierarchy: true };
      state.roles[0].defaults.eligible = false;
    }, /hierarchy admins vouch/i],
    ['standing default', (state) => { state.roles[0].defaults.standing = false; }, /standing default/i],
    ['immutable role', (state) => { state.roles[0].hatConfig.mutableHat = false; }, /immutable/i],
    ['closed quick join', (state) => { state.roles[0].defaults.eligible = false; }, /Quick Join.*not open/i],
  ])('does not silently drop %s semantics', (_name, mutate, message) => {
    const state = flatState();
    mutate(state);
    const result = validateAccessV2Representability(state);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(message);
  });

  it('does not derive groups from a legacy parent relationship', () => {
    const state = flatState();
    state.roles[0].hierarchy.adminRoleIndex = 1;
    state.groups = [];
    expect(() => mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY }))
      .toThrow(/remove the parent relationship/i);
  });

  it('enforces Kyoto role/group structural limits', () => {
    const tooManyRoles = flatState();
    tooManyRoles.roles = Array.from({ length: 17 }, (_, index) => ({
      ...createDefaultRole(index, `Role ${index}`),
      hierarchy: { adminRoleIndex: null },
    }));
    expect(validateAccessV2Representability(tooManyRoles).errors.join(' ')).toMatch(/at most 16 roles/i);

    const duplicateGroup = flatState();
    duplicateGroup.groups = [{ name: 'Leaders', memberRoleIndices: [1, 1] }];
    expect(validateAccessV2Representability(duplicateGroup).errors.join(' ')).toMatch(/same role more than once/i);
  });
});
