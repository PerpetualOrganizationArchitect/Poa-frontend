import { ethers } from 'ethers';

import OrgDeployerAccessV2ABI from '../../../../abi/OrgDeployerNew.json';
import OrgDeployerLegacyABI from '../../../../abi/OrgDeployerLegacy.json';

/**
 * OrgDeployer's public VERSION major is the explicit ABI routing boundary.
 * Major 1 selects the bundled current-v1 Hats adapter; historic 1.x releases did
 * not consistently bump VERSION for tuple changes, so the mandatory deployment
 * simulation remains the final compatibility check. Major 2 is Kyoto's exact
 * authority-native schema and follows breaking-major versioning.
 */
export const ORG_DEPLOYER_SCHEMA = Object.freeze({
  LEGACY: 'legacy-hats-v17',
  ACCESS_V2: 'access-v2-kyoto',
});

export const ORG_DEPLOYER_SCHEMA_BY_MAJOR = Object.freeze({
  1: ORG_DEPLOYER_SCHEMA.LEGACY,
  2: ORG_DEPLOYER_SCHEMA.ACCESS_V2,
});

const ABIS = Object.freeze({
  [ORG_DEPLOYER_SCHEMA.LEGACY]: OrgDeployerLegacyABI,
  [ORG_DEPLOYER_SCHEMA.ACCESS_V2]: OrgDeployerAccessV2ABI,
});

const INTERFACES = Object.freeze({
  [ORG_DEPLOYER_SCHEMA.LEGACY]: new ethers.utils.Interface(OrgDeployerLegacyABI),
  [ORG_DEPLOYER_SCHEMA.ACCESS_V2]: new ethers.utils.Interface(OrgDeployerAccessV2ABI),
});

// SemVer 2.0.0 (without surrounding whitespace). Numeric identifiers cannot
// have leading zeroes, and prerelease/build identifiers cannot be empty. The
// deployer major is an ABI boundary, so permissive version parsing is unsafe.
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export class OrgDeployerBoundaryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrgDeployerBoundaryError';
  }
}

function requireKnownSchema(schema) {
  if (!Object.prototype.hasOwnProperty.call(ABIS, schema)) {
    throw new OrgDeployerBoundaryError(
      `Unsupported OrgDeployer schema "${schema || 'missing'}". Refusing to encode deployment calldata.`
    );
  }
}

export function getOrgDeployerAbi(schema) {
  requireKnownSchema(schema);
  return ABIS[schema];
}

export function getOrgDeployerInterface(schema) {
  requireKnownSchema(schema);
  return INTERFACES[schema];
}

export function getOrgDeployFunctionName(zkEmailEnabled) {
  return zkEmailEnabled ? 'deployFullOrgWithZkEmail' : 'deployFullOrg';
}

/**
 * Fail closed when params from one schema reach the other adapter.  Ethers ignores
 * unknown object keys while tuple-encoding, which otherwise makes a stale caller
 * look successful while silently dropping access semantics.
 */
export function assertDeploymentParamsSchema(schema, params) {
  requireKnownSchema(schema);
  if (!params || !Array.isArray(params.roles)) {
    throw new OrgDeployerBoundaryError('OrgDeployer params must include a roles array.');
  }

  if (schema === ORG_DEPLOYER_SCHEMA.ACCESS_V2) {
    if (!Array.isArray(params.groups)) {
      throw new OrgDeployerBoundaryError('Access v2 OrgDeployer params must include a groups array (use [] for none).');
    }
    params.roles.forEach((role, index) => {
      if (typeof role?.open !== 'boolean' || !Object.prototype.hasOwnProperty.call(role || {}, 'maxMembers')) {
        throw new OrgDeployerBoundaryError(
          `Role ${index} is not an Access v2 RoleConfig (open/maxMembers are required).`
        );
      }
      const legacyKeys = ['defaults', 'hierarchy', 'hatConfig', 'combineWithHierarchy'];
      if (legacyKeys.some((key) => Object.prototype.hasOwnProperty.call(role || {}, key))) {
        throw new OrgDeployerBoundaryError(
          `Role ${index} still contains legacy Hats fields. Refusing to drop them while encoding Access v2 calldata.`
        );
      }
      if (Object.prototype.hasOwnProperty.call(role?.vouching || {}, 'combineWithHierarchy')) {
        throw new OrgDeployerBoundaryError(
          `Role ${index} still contains legacy hierarchy-vouching config. Refusing to encode it as Access v2.`
        );
      }
    });
    return;
  }

  if (Array.isArray(params.groups) && params.groups.length > 0) {
    throw new OrgDeployerBoundaryError('Legacy OrgDeployer cannot encode Access v2 groups.');
  }
  params.roles.forEach((role, index) => {
    if (!role?.defaults || !role?.hierarchy || !role?.hatConfig) {
      throw new OrgDeployerBoundaryError(
        `Role ${index} is not a legacy Hats RoleConfig (defaults/hierarchy/hatConfig are required).`
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(role || {}, 'open') ||
      Object.prototype.hasOwnProperty.call(role || {}, 'maxMembers')
    ) {
      throw new OrgDeployerBoundaryError(
        `Role ${index} contains Access v2 fields. Refusing to encode it with the legacy OrgDeployer ABI.`
      );
    }
  });
}

/** Encode with exactly one ABI after the caller has detected the deployed schema. */
export function encodeOrgDeploymentCalldata({ schema, params, zkEmailEnabled = false }) {
  assertDeploymentParamsSchema(schema, params);
  const iface = getOrgDeployerInterface(schema);
  const functionName = getOrgDeployFunctionName(zkEmailEnabled);

  if (!zkEmailEnabled) return iface.encodeFunctionData(functionName, [params]);

  return iface.encodeFunctionData(functionName, [
    params,
    {
      enabled: true,
      initialRoot: ethers.constants.HashZero,
      initialCid: ethers.constants.HashZero,
    },
  ]);
}

function getOrgDeploymentFragment(schema, calldata) {
  const iface = getOrgDeployerInterface(schema);
  const selector = typeof calldata === 'string' ? calldata.slice(0, 10) : '';
  let fragment;
  try {
    fragment = iface.getFunction(selector);
  } catch {
    throw new OrgDeployerBoundaryError(
      `Deployment calldata selector ${selector || '(missing)'} does not belong to the selected ${schema} ABI.`
    );
  }
  if (!['deployFullOrg', 'deployFullOrgWithZkEmail'].includes(fragment.name)) {
    throw new OrgDeployerBoundaryError(`Selector ${selector} is not an OrgDeployer deployment entrypoint.`);
  }
  try {
    iface.decodeFunctionData(fragment, calldata);
  } catch {
    throw new OrgDeployerBoundaryError(
      `Deployment calldata is not a valid ${fragment.name} call for the selected ${schema} ABI.`
    );
  }
  return fragment;
}

/** Fail closed if pre-built bytes do not belong to the selected deployment ABI. */
export function assertOrgDeploymentCalldataSchema({ schema, calldata }) {
  return getOrgDeploymentFragment(schema, calldata).name;
}

/** Decode the dry-run result with the same schema and entrypoint used to encode it. */
export function decodeOrgDeploymentResult({ schema, calldata, data }) {
  const iface = getOrgDeployerInterface(schema);
  const fragment = getOrgDeploymentFragment(schema, calldata);
  const [result] = iface.decodeFunctionResult(fragment, data);
  return result;
}

function normalizeOrgDeployedArgs(schema, args) {
  const shared = {
    schema,
    orgId: args.orgId,
    executor: args.executor,
    hybridVoting: args.hybridVoting,
    directDemocracyVoting: args.directDemocracyVoting,
    quickJoin: args.quickJoin,
    participationToken: args.participationToken,
    taskManager: args.taskManager,
    educationHub: args.educationHub,
    paymentManager: args.paymentManager,
  };

  if (schema === ORG_DEPLOYER_SCHEMA.ACCESS_V2) {
    return {
      ...shared,
      membershipAuthority: args.membershipAuthority,
      adminSubjectId: args.adminSubjectId,
      roleSubjectIds: args.roleSubjectIds,
    };
  }

  return {
    ...shared,
    eligibilityModule: args.eligibilityModule,
    toggleModule: args.toggleModule,
    topHatId: args.topHatId,
    roleHatIds: args.roleHatIds,
  };
}

/** Parse and normalize the schema-specific OrgDeployed event. */
export function decodeOrgDeployedLog({ schema, log }) {
  const iface = getOrgDeployerInterface(schema);
  let parsed;
  try {
    parsed = iface.parseLog(log);
  } catch {
    throw new OrgDeployerBoundaryError(`Log is not an OrgDeployed event for schema ${schema}.`);
  }
  if (parsed.name !== 'OrgDeployed') {
    throw new OrgDeployerBoundaryError(`Expected OrgDeployed, received ${parsed.name}.`);
  }
  return normalizeOrgDeployedArgs(schema, parsed.args);
}

export function parseOrgDeploymentReceipt(receipt, schema) {
  const logs = receipt?.logs || receipt?.events || [];
  for (const log of logs) {
    try {
      return decodeOrgDeployedLog({ schema, log });
    } catch {
      // A deployment receipt contains events from every factory/module. Keep scanning.
    }
  }
  return null;
}

function extractHexData(value, seen = new Set()) {
  if (typeof value === 'string') {
    return /^0x[0-9a-fA-F]*$/.test(value) ? value : null;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);

  for (const key of ['data', 'result', 'error', 'body']) {
    const found = extractHexData(value[key], seen);
    if (found) return found;
  }
  return null;
}

async function callForData(provider, tx) {
  try {
    return await provider.call(tx);
  } catch (error) {
    return extractHexData(error);
  }
}

/**
 * Route to the deployed tuple schema without sending a transaction. VERSION is
 * the explicit major boundary: unsupported or malformed values are rejected
 * before calldata is constructed. Current-v1 calls are still simulated because
 * historical v1 contracts reused VERSION across tuple changes.
 */
export async function detectOrgDeployerSchema({ provider, address }) {
  if (!provider?.call) {
    throw new OrgDeployerBoundaryError('A read provider is required to detect the OrgDeployer schema.');
  }
  if (!ethers.utils.isAddress(address || '')) {
    throw new OrgDeployerBoundaryError('A valid OrgDeployer address is required for schema detection.');
  }

  const versionIface = getOrgDeployerInterface(ORG_DEPLOYER_SCHEMA.ACCESS_V2);
  const versionData = await callForData(provider, {
    to: address,
    data: versionIface.encodeFunctionData('VERSION'),
  });
  let version;
  try {
    [version] = versionIface.decodeFunctionResult('VERSION', versionData);
  } catch {
    throw new OrgDeployerBoundaryError('The configured OrgDeployer does not expose a decodable VERSION().');
  }
  const match = typeof version === 'string' ? SEMVER_PATTERN.exec(version) : null;
  if (!match) {
    throw new OrgDeployerBoundaryError(
      `OrgDeployer VERSION "${version}" is not valid semantic versioning. Refusing to guess its ABI.`
    );
  }
  const major = Number(match[1]);
  const schema = ORG_DEPLOYER_SCHEMA_BY_MAJOR[major];
  if (!schema) {
    throw new OrgDeployerBoundaryError(
      `OrgDeployer VERSION ${version} uses unsupported ABI major ${major}. Refusing to send deployment calldata.`
    );
  }

  return { schema, version };
}

/** Re-read VERSION and fail if a prepared schema no longer matches the proxy. */
export async function assertDeployedOrgDeployerSchema({ provider, address, schema }) {
  requireKnownSchema(schema);
  const detected = await detectOrgDeployerSchema({ provider, address });
  if (detected.schema !== schema) {
    throw new OrgDeployerBoundaryError(
      `OrgDeployer VERSION ${detected.version} reports ${detected.schema}, but the prepared calldata uses ${schema}. Refusing to send.`
    );
  }
  return detected;
}

export const ORG_DEPLOYER_SELECTORS = Object.freeze({
  [ORG_DEPLOYER_SCHEMA.LEGACY]: Object.freeze({
    deployFullOrg: INTERFACES[ORG_DEPLOYER_SCHEMA.LEGACY].getSighash('deployFullOrg'),
    deployFullOrgWithZkEmail: INTERFACES[ORG_DEPLOYER_SCHEMA.LEGACY].getSighash('deployFullOrgWithZkEmail'),
    orgDeployed: INTERFACES[ORG_DEPLOYER_SCHEMA.LEGACY].getEventTopic('OrgDeployed'),
  }),
  [ORG_DEPLOYER_SCHEMA.ACCESS_V2]: Object.freeze({
    deployFullOrg: INTERFACES[ORG_DEPLOYER_SCHEMA.ACCESS_V2].getSighash('deployFullOrg'),
    deployFullOrgWithZkEmail: INTERFACES[ORG_DEPLOYER_SCHEMA.ACCESS_V2].getSighash('deployFullOrgWithZkEmail'),
    orgDeployed: INTERFACES[ORG_DEPLOYER_SCHEMA.ACCESS_V2].getEventTopic('OrgDeployed'),
  }),
});
