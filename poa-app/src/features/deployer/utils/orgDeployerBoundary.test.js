import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';

import OrgDeployerAccessV2ABI from '../../../../abi/OrgDeployerNew.json';
import OrgDeployerLegacyABI from '../../../../abi/OrgDeployerLegacy.json';
import {
  ORG_DEPLOYER_SCHEMA,
  ORG_DEPLOYER_SELECTORS,
  assertDeployedOrgDeployerSchema,
  assertDeploymentParamsSchema,
  assertOrgDeploymentCalldataSchema,
  decodeOrgDeployedLog,
  decodeOrgDeploymentResult,
  detectOrgDeployerSchema,
  encodeOrgDeploymentCalldata,
  getOrgDeployerInterface,
  parseOrgDeploymentReceipt,
} from './orgDeployerBoundary';

const DEPLOYER = '0x1111111111111111111111111111111111111111';
const REGISTRY = '0x2222222222222222222222222222222222222222';
const ADDRESSES = Array.from({ length: 12 }, (_, i) =>
  ethers.utils.getAddress(`0x${(i + 10).toString(16).padStart(40, '0')}`)
);

const commonParams = () => ({
  orgId: ethers.utils.id('boundary-test'),
  orgName: 'Boundary Test',
  metadataHash: ethers.constants.HashZero,
  registryAddr: REGISTRY,
  deployerAddress: DEPLOYER,
  deployerUsername: '',
  regDeadline: 0,
  regNonce: 0,
  regSignature: '0x',
  autoUpgrade: true,
  hybridThresholdPct: 51,
  ddThresholdPct: 51,
  hybridClasses: [{ strategy: 0, slicePct: 100, quadratic: false, minBalance: 0, asset: ethers.constants.AddressZero, hatIds: [] }],
  ddInitialTargets: [],
  roleAssignments: {
    quickJoinRolesBitmap: 1,
    tokenMemberRolesBitmap: 1,
    tokenApproverRolesBitmap: 1,
    taskCreatorRolesBitmap: 1,
    educationCreatorRolesBitmap: 1,
    educationMemberRolesBitmap: 1,
    hybridProposalCreatorRolesBitmap: 1,
    ddVotingRolesBitmap: 1,
    ddCreatorRolesBitmap: 1,
  },
  metadataAdminRoleIndex: 0,
  passkeyEnabled: true,
  educationHubConfig: { enabled: false },
  bootstrap: { projects: [], tasks: [] },
  paymasterConfig: {
    operatorRoleIndex: ethers.constants.MaxUint256,
    autoWhitelistContracts: false,
    maxFeePerGas: 0,
    maxPriorityFeePerGas: 0,
    maxCallGas: 0,
    maxVerificationGas: 0,
    maxPreVerificationGas: 0,
    defaultBudgetCapPerEpoch: 0,
    defaultBudgetEpochLen: 0,
  },
  taskManagerPerms: { roleIndices: [], masks: [] },
  hybridQuorum: 0,
  ddQuorum: 0,
  tokenName: '',
  tokenSymbol: '',
});

const legacyParams = () => ({
  ...commonParams(),
  roles: [{
    name: 'Member',
    image: '',
    metadataCID: ethers.constants.HashZero,
    canVote: true,
    vouching: { enabled: false, quorum: 0, voucherRoleIndex: 0, combineWithHierarchy: false },
    defaults: { eligible: true, standing: true },
    hierarchy: { adminRoleIndex: ethers.constants.MaxUint256 },
    distribution: { mintToDeployer: true, additionalWearers: [] },
    hatConfig: { maxSupply: 1000, mutableHat: true },
  }],
});

const accessV2Params = () => ({
  ...commonParams(),
  roles: [{
    name: 'Member',
    image: '',
    metadataCID: ethers.constants.HashZero,
    canVote: true,
    open: true,
    maxMembers: 1000,
    vouching: { enabled: false, quorum: 0, voucherRoleIndex: 0 },
    distribution: { mintToDeployer: true, additionalWearers: [] },
  }],
  groups: [{ name: 'Everyone', memberRoleIndices: [0] }],
});

describe('exact OrgDeployer ABI boundary', () => {
  it('pins the legacy and Kyoto selectors/event topics', () => {
    expect(ORG_DEPLOYER_SELECTORS[ORG_DEPLOYER_SCHEMA.LEGACY]).toEqual({
      deployFullOrg: '0x209bcafc',
      deployFullOrgWithZkEmail: '0xca87c570',
      orgDeployed: '0x590841baca28c7c0514990b2539ec26c7d98f3dc905aebfa7b89fb5089a0a0f7',
    });
    expect(ORG_DEPLOYER_SELECTORS[ORG_DEPLOYER_SCHEMA.ACCESS_V2]).toEqual({
      deployFullOrg: '0x972034ae',
      deployFullOrgWithZkEmail: '0x45a5da08',
      orgDeployed: '0x77520609d4c0603098a23801e4e2cc75fa112e7cbb7d1520376e4d76834cd70e',
    });
  });

  it('contains Kyoto roles/groups and authority-native deployment event fields', () => {
    const deploy = OrgDeployerAccessV2ABI.find((entry) => entry.type === 'function' && entry.name === 'deployFullOrg');
    const fields = deploy.inputs[0].components;
    expect(fields.map((field) => field.name)).toContain('groups');
    expect(fields.find((field) => field.name === 'roles').components.map((field) => field.name)).toEqual([
      'name', 'image', 'metadataCID', 'canVote', 'open', 'maxMembers', 'vouching', 'distribution',
    ]);
    const event = OrgDeployerAccessV2ABI.find((entry) => entry.type === 'event' && entry.name === 'OrgDeployed');
    expect(event.inputs.map((field) => field.name).slice(-3)).toEqual([
      'membershipAuthority', 'adminSubjectId', 'roleSubjectIds',
    ]);
  });

  it('encodes each schema with only its own selector and tuple shape', () => {
    const legacy = encodeOrgDeploymentCalldata({ schema: ORG_DEPLOYER_SCHEMA.LEGACY, params: legacyParams() });
    const v2 = encodeOrgDeploymentCalldata({ schema: ORG_DEPLOYER_SCHEMA.ACCESS_V2, params: accessV2Params() });
    expect(legacy.slice(0, 10)).toBe(ORG_DEPLOYER_SELECTORS[ORG_DEPLOYER_SCHEMA.LEGACY].deployFullOrg);
    expect(v2.slice(0, 10)).toBe(ORG_DEPLOYER_SELECTORS[ORG_DEPLOYER_SCHEMA.ACCESS_V2].deployFullOrg);

    const [decoded] = getOrgDeployerInterface(ORG_DEPLOYER_SCHEMA.ACCESS_V2)
      .decodeFunctionData('deployFullOrg', v2);
    expect(decoded.roles[0].open).toBe(true);
    expect(decoded.roles[0].maxMembers).toBe(1000);
    expect(decoded.groups[0].name).toBe('Everyone');
    expect(decoded.groups[0].memberRoleIndices[0].toNumber()).toBe(0);
  });

  it('fails instead of mixing role schemas', () => {
    expect(() => assertDeploymentParamsSchema(
      ORG_DEPLOYER_SCHEMA.ACCESS_V2,
      { ...legacyParams(), groups: [] }
    ))
      .toThrow(/open\/maxMembers|required|legacy Hats/i);
    expect(() => assertDeploymentParamsSchema(
      ORG_DEPLOYER_SCHEMA.LEGACY,
      { ...accessV2Params(), groups: [] }
    ))
      .toThrow(/Access v2 fields|legacy Hats RoleConfig/i);
    expect(() => encodeOrgDeploymentCalldata({ params: legacyParams() })).toThrow(/missing/i);
    expect(() => encodeOrgDeploymentCalldata({ schema: '__proto__', params: legacyParams() }))
      .toThrow(/Unsupported OrgDeployer schema/i);
  });

  it('rejects pre-built calldata from the other schema or with a malformed tuple', () => {
    const legacy = encodeOrgDeploymentCalldata({ schema: ORG_DEPLOYER_SCHEMA.LEGACY, params: legacyParams() });
    expect(() => assertOrgDeploymentCalldataSchema({
      schema: ORG_DEPLOYER_SCHEMA.ACCESS_V2,
      calldata: legacy,
    })).toThrow(/does not belong/i);
    expect(() => assertOrgDeploymentCalldataSchema({
      schema: ORG_DEPLOYER_SCHEMA.LEGACY,
      calldata: legacy.slice(0, -64),
    })).toThrow(/not a valid/i);
  });
});

describe('VERSION major dispatch', () => {
  const versionIface = getOrgDeployerInterface(ORG_DEPLOYER_SCHEMA.ACCESS_V2);
  const providerFor = (version) => ({
    call: vi.fn(async () => versionIface.encodeFunctionResult('VERSION', [version])),
  });

  it.each([
    ['1.0.1', ORG_DEPLOYER_SCHEMA.LEGACY],
    ['2.0.0', ORG_DEPLOYER_SCHEMA.ACCESS_V2],
    ['2.3.4-beta.1', ORG_DEPLOYER_SCHEMA.ACCESS_V2],
  ])('maps VERSION %s to %s', async (version, schema) => {
    await expect(detectOrgDeployerSchema({ provider: providerFor(version), address: DEPLOYER }))
      .resolves.toEqual({ version, schema });
  });

  it.each([
    'not-semver',
    'v2',
    '2.0',
    '02.0.0',
    '2.0.0-01',
    '2.0.0-beta..1',
    '2.0.0+build..1',
    '3.0.0',
  ])('fails closed for VERSION %s', async (version) => {
    await expect(detectOrgDeployerSchema({ provider: providerFor(version), address: DEPLOYER }))
      .rejects.toThrow(/Refusing|unsupported/i);
  });

  it('fails closed when VERSION cannot be decoded', async () => {
    await expect(detectOrgDeployerSchema({ provider: { call: vi.fn(async () => '0x') }, address: DEPLOYER }))
      .rejects.toThrow(/decodable VERSION/i);
  });

  it('revalidates a prepared schema against the currently deployed major', async () => {
    await expect(assertDeployedOrgDeployerSchema({
      provider: providerFor('2.0.0'),
      address: DEPLOYER,
      schema: ORG_DEPLOYER_SCHEMA.ACCESS_V2,
    })).resolves.toMatchObject({ version: '2.0.0' });

    await expect(assertDeployedOrgDeployerSchema({
      provider: providerFor('1.0.1'),
      address: DEPLOYER,
      schema: ORG_DEPLOYER_SCHEMA.ACCESS_V2,
    })).rejects.toThrow(/reports legacy-hats-v17.*Refusing to send/i);
  });
});

describe('schema-specific result and event decoding', () => {
  it('decodes the Kyoto DeploymentResult membership authority field', () => {
    const iface = getOrgDeployerInterface(ORG_DEPLOYER_SCHEMA.ACCESS_V2);
    const calldata = encodeOrgDeploymentCalldata({ schema: ORG_DEPLOYER_SCHEMA.ACCESS_V2, params: accessV2Params() });
    const data = iface.encodeFunctionResult('deployFullOrg', [ADDRESSES.slice(0, 10)]);
    const result = decodeOrgDeploymentResult({ schema: ORG_DEPLOYER_SCHEMA.ACCESS_V2, calldata, data });
    expect(result.membershipAuthority).toBe(ADDRESSES[8]);
    expect(result.zkEmailInvites).toBe(ADDRESSES[9]);
    expect(result.eligibilityModule).toBeUndefined();
  });

  it.each([
    [ORG_DEPLOYER_SCHEMA.LEGACY, false],
    [ORG_DEPLOYER_SCHEMA.ACCESS_V2, true],
  ])('parses and normalizes %s OrgDeployed', (schema, accessV2) => {
    const iface = getOrgDeployerInterface(schema);
    const values = accessV2
      ? [ethers.utils.id('org'), ...ADDRESSES.slice(0, 9), 101, [102, 103]]
      : [ethers.utils.id('org'), ...ADDRESSES.slice(0, 10), 101, [102, 103]];
    const encoded = iface.encodeEventLog(iface.getEvent('OrgDeployed'), values);
    const log = { topics: encoded.topics, data: encoded.data };
    const parsed = decodeOrgDeployedLog({ schema, log });
    const fromReceipt = parseOrgDeploymentReceipt({ logs: [{ topics: [], data: '0x' }, log] }, schema);

    expect(fromReceipt.orgId).toBe(parsed.orgId);
    if (accessV2) {
      expect(parsed.membershipAuthority).toBe(ADDRESSES[8]);
      expect(parsed.adminSubjectId.toNumber()).toBe(101);
      expect(parsed.roleSubjectIds.map((id) => id.toNumber())).toEqual([102, 103]);
      expect(parsed.topHatId).toBeUndefined();
    } else {
      expect(parsed.eligibilityModule).toBe(ADDRESSES[8]);
      expect(parsed.toggleModule).toBe(ADDRESSES[9]);
      expect(parsed.topHatId.toNumber()).toBe(101);
      expect(parsed.roleHatIds.map((id) => id.toNumber())).toEqual([102, 103]);
      expect(parsed.membershipAuthority).toBeUndefined();
    }
  });
});

describe('legacy artifact is retained independently', () => {
  it('still exposes the v17 legacy role tuple', () => {
    const deploy = OrgDeployerLegacyABI.find((entry) => entry.type === 'function' && entry.name === 'deployFullOrg');
    expect(deploy.inputs[0].components.find((field) => field.name === 'roles').components.map((field) => field.name))
      .toEqual(['name', 'image', 'metadataCID', 'canVote', 'vouching', 'defaults', 'hierarchy', 'distribution', 'hatConfig']);
  });
});
