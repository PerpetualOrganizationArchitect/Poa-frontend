import { ethers } from "ethers";
import bs58 from "bs58";
// Single source of truth for role bitmaps — see the note on buildRoleAssignments.
import { indicesToBitmap } from "../src/features/deployer/utils/bitmapUtils";
import {
  ORG_DEPLOYER_SCHEMA,
  OrgDeployerBoundaryError,
  assertDeployedOrgDeployerSchema,
  assertOrgDeploymentCalldataSchema,
  encodeOrgDeploymentCalldata,
  parseOrgDeploymentReceipt,
} from "../src/features/deployer/utils/orgDeployerBoundary";

/**
 * Convert IPFS CIDv0 to bytes32 sha256 digest
 * CIDv0 = base58( 0x1220 + sha256_digest )
 * We decode and strip the 0x1220 prefix to get the 32-byte digest
 */
function cidToBytes32(cid) {
  console.log("[CID->BYTES32] Input CID:", cid);
  console.log("[CID->BYTES32] CID type:", typeof cid);
  console.log("[CID->BYTES32] CID length:", cid?.length);

  if (!cid || cid.length === 0) {
    console.log("[CID->BYTES32] Empty CID, returning zero hash");
    return ethers.constants.HashZero;
  }

  try {
    // Decode base58 CID to bytes
    console.log("[CID->BYTES32] Decoding base58...");
    const decoded = bs58.decode(cid);
    console.log("[CID->BYTES32] Decoded bytes length:", decoded.length);
    console.log("[CID->BYTES32] First 4 bytes:", Array.from(decoded.slice(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

    // CIDv0 should be 34 bytes: 2-byte prefix (0x1220) + 32-byte sha256
    if (decoded.length !== 34) {
      console.warn(`[CID->BYTES32] CID has unexpected length: ${decoded.length}, expected 34`);
      return ethers.constants.HashZero;
    }

    // Verify multihash prefix (0x12 = sha256, 0x20 = 32 bytes)
    if (decoded[0] !== 0x12 || decoded[1] !== 0x20) {
      console.warn(`[CID->BYTES32] CID has unexpected prefix: 0x${decoded[0].toString(16)}${decoded[1].toString(16)}`);
      return ethers.constants.HashZero;
    }

    // Extract the 32-byte sha256 digest (skip 2-byte prefix)
    const sha256Digest = decoded.slice(2);
    const bytes32Hex = "0x" + Buffer.from(sha256Digest).toString("hex");

    console.log("[CID->BYTES32] Conversion successful!");
    console.log("[CID->BYTES32] SHA256 digest (bytes32):", bytes32Hex);
    console.log("[CID->BYTES32] This bytes32 should be stored in contract");

    // Convert to hex string with 0x prefix
    return bytes32Hex;
  } catch (error) {
    console.error("[CID->BYTES32] Failed to decode CID:", error);
    return ethers.constants.HashZero;
  }
}
// Helper: Build hybrid voting classes
function buildHybridClasses(hybridEnabled, quadratic, ddWeight, ptWeight) {
  if (!hybridEnabled) {
    // Pure direct democracy - single DIRECT class
    return [{
      strategy: 0, // DIRECT (1-person-1-vote based on hat)
      slicePct: 100,
      quadratic: false,
      minBalance: 0,
      asset: ethers.constants.AddressZero,
      hatIds: [],
    }];
  }

  // Hybrid: DIRECT + ERC20_BAL
  return [
    {
      strategy: 0, // DIRECT
      slicePct: ddWeight || 50,
      quadratic: false,
      minBalance: 0,
      asset: ethers.constants.AddressZero,
      hatIds: [],
    },
    {
      strategy: 1, // ERC20_BAL (ParticipationToken)
      slicePct: ptWeight || 50,
      quadratic: quadratic || false,
      minBalance: ethers.utils.parseEther("1"),
      asset: ethers.constants.AddressZero, // Will use org's ParticipationToken
      hatIds: [],
    },
  ];
}

// Helper: Build roles from member types
function buildRoles(memberTypes, executiveRoles) {
  // Find the top-level admin role index (first executive, or first role if no executives)
  const topLevelRoleIndex = executiveRoles.length > 0
    ? Math.max(0, memberTypes.indexOf(executiveRoles[0]))
    : 0;

  return memberTypes.map((name, idx) => {
    // Determine adminRoleIndex:
    // - Top-level role uses type(uint256).max (ethers.constants.MaxUint256)
    // - All other roles point to the top-level role
    // NOTE: Self-referential admin (adminRoleIndex == idx) is NOT allowed by the contract
    const isTopLevelRole = idx === topLevelRoleIndex;

    return {
      name: name,
      image: "",
      metadataCID: ethers.constants.HashZero, // No metadata for auto-generated roles
      canVote: true,
      vouching: {
        enabled: false,
        quorum: 0,
        voucherRoleIndex: 0,
        combineWithHierarchy: false,
      },
      defaults: {
        eligible: true,
        standing: true,
      },
      hierarchy: {
        // type(uint256).max means "use ELIGIBILITY_ADMIN hat as parent" (top-level role)
        // Other roles point to the top-level admin role index
        adminRoleIndex: isTopLevelRole
          ? ethers.constants.MaxUint256  // Top-level role
          : topLevelRoleIndex,           // Child roles point to admin
      },
      distribution: {
        mintToDeployer: idx === 0, // Mint first role to deployer
        additionalWearers: [],
      },
      hatConfig: {
        maxSupply: 1000,
        mutableHat: true,
      },
    };
  });
}

// Helper: Build role assignment bitmaps
//
// Uses `indicesToBitmap` rather than `1 << idx` arithmetic. JS bitwise operators
// coerce to int32, and the wizard allows exactly 32 roles (indices 0..31), so the
// obvious formulations break at the top of the supported range:
//   - `(1 << 31) - 1` is -2147483649 → ethers rejects the uint256 at encode time
//   - `(1 << 32) - 1` is 0           → every "all roles" bitmap silently empties,
//     deploying an org where nobody can hold tokens, create tasks, or vote in DD
// `indicesToBitmap` sums 2**idx instead, which is exact past the 32-role cap.
function buildRoleAssignments(memberTypes, executiveRoles) {
  const allRoleIndices = memberTypes.map((_, i) => i);
  const allRolesBitmap = indicesToBitmap(allRoleIndices);

  // Find executive role indexes
  const executiveIndices = executiveRoles
    .map((execRole) => memberTypes.indexOf(execRole))
    .filter((idx) => idx !== -1);

  // If no executives specified, use first role
  const executiveBitmap = executiveIndices.length > 0
    ? indicesToBitmap(executiveIndices)
    : indicesToBitmap([0]);

  return {
    quickJoinRolesBitmap: 1, // Only first role (MEMBER) can quick join
    tokenMemberRolesBitmap: allRolesBitmap, // All roles can hold tokens
    tokenApproverRolesBitmap: executiveBitmap, // Executives can approve token requests
    taskCreatorRolesBitmap: allRolesBitmap, // All roles can create tasks
    educationCreatorRolesBitmap: executiveBitmap, // Executives can create education
    educationMemberRolesBitmap: allRolesBitmap, // All roles can access education
    hybridProposalCreatorRolesBitmap: allRolesBitmap, // All roles can create proposals
    ddVotingRolesBitmap: allRolesBitmap, // All roles can vote in DD
    ddCreatorRolesBitmap: allRolesBitmap, // All roles can create DD polls
  };
}

/**
 * Build the encoded calldata for deployFullOrg without requiring a signer.
 * Used by passkey accounts that deploy via ERC-4337 UserOperations.
 * `orgDeployerSchema` must come from detectOrgDeployerSchema(); there is no
 * default because guessing here can send a valid-looking tuple to the wrong ABI.
 *
 * @returns {{ calldata: string, orgDeployerAddress: string, orgId: string }}
 */
export function buildDeployCalldata({
  memberTypeNames,
  executivePermissionNames,
  POname,
  quadraticVotingEnabled,
  democracyVoteWeight,
  participationVoteWeight,
  hybridVotingEnabled,
  participationVotingEnabled,
  electionEnabled,
  educationHubEnabled,
  infoIPFSHash,
  quorumPercentageDD,
  quorumPercentagePV,
  username,
  deployerAddress,
  customRoles = null,
  groups = null,
  autoUpgrade = true,
  infrastructureAddresses = {},
  orgDeployerSchema,
  regSignatureData = null,
  paymasterConfig = null,
  metadataAdminRoleIndex = null,
  taskManagerPerms = null,
  ddInitialTargets = null,
  bootstrap = null,
  zkEmailEnabled = false,
  roleAssignments: roleAssignmentsOverride = null,
  // OrgDeployer v17 deploy-time governance config. Zero/empty reproduces v16
  // behaviour exactly, so omitting these is safe.
  hybridVoterQuorum = 0,
  ddVoterQuorum = 0,
  tokenName = '',
  tokenSymbol = '',
  // The wizard's own voting classes, already mapped to contract shape. The
  // democracyVoteWeight/participationVoteWeight fallback below only knows how to
  // build a fixed 50/50 DIRECT+ERC20_BAL pair, so anything the user configured —
  // the split, a third class, minBalance, quadratic — is lost without this.
  hybridClasses: hybridClassesOverride = null,
}) {
  const orgDeployerAddress = infrastructureAddresses.orgDeployerAddress;
  const registryAddress = infrastructureAddresses.registryAddress;

  if (!orgDeployerAddress) {
    throw new Error("OrgDeployer address not found. Please ensure the subgraph is synced.");
  }
  if (!registryAddress) {
    throw new Error("Registry address not found. Please ensure the subgraph is synced.");
  }

  const orgId = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(POname.toLowerCase().replace(/\s+/g, '-'))
  );

  const hybridClasses = (hybridClassesOverride && hybridClassesOverride.length > 0)
    ? hybridClassesOverride
    : buildHybridClasses(
        hybridVotingEnabled,
        quadraticVotingEnabled,
        democracyVoteWeight,
        participationVoteWeight
      );

  const roles = customRoles || buildRoles(memberTypeNames, executivePermissionNames);
  // The legacy path retains its historical name-derived approximation. Access v2
  // requires the wizard's explicit matrix because Quick Join is checked against
  // RoleConfig.open and silently synthesizing permissions is not acceptable.
  if (orgDeployerSchema === ORG_DEPLOYER_SCHEMA.ACCESS_V2 && !roleAssignmentsOverride) {
    throw new Error('Access v2 deployment requires the wizard\'s explicit role assignments.');
  }
  const roleAssignments = roleAssignmentsOverride || buildRoleAssignments(memberTypeNames, executivePermissionNames);
  const metadataHash = cidToBytes32(infoIPFSHash);

  const deploymentParams = {
    orgId,
    orgName: POname,
    metadataHash,
    registryAddr: registryAddress,
    deployerAddress,
    deployerUsername: username || "",
    regDeadline: regSignatureData?.regDeadline ?? 0,
    regNonce: regSignatureData?.regNonce ?? 0,
    regSignature: regSignatureData?.regSignature ?? '0x',
    autoUpgrade: Boolean(autoUpgrade),
    hybridThresholdPct: quorumPercentagePV || 50,
    ddThresholdPct: quorumPercentageDD || 50,
    hybridClasses,
    ddInitialTargets: ddInitialTargets || [],
    roles,
    roleAssignments,
    metadataAdminRoleIndex: metadataAdminRoleIndex !== null && metadataAdminRoleIndex !== undefined
      ? ethers.BigNumber.from(metadataAdminRoleIndex)
      : ethers.constants.MaxUint256,
    passkeyEnabled: true,
    educationHubConfig: { enabled: educationHubEnabled || false },
    bootstrap: bootstrap || { projects: [], tasks: [] },
    paymasterConfig: paymasterConfig || {
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
    // Org-wide TaskManager ROLE_PERM grants
    taskManagerPerms: taskManagerPerms || { roleIndices: [], masks: [] },
    // Deploy-time governance config shared by legacy v17 and Kyoto v2.
    //
    // The voter-count quorums were previously setter-only, so the wizard collected
    // them and threw them away; they now take effect at genesis (0 = no minimum).
    // Empty token name/symbol reproduces the legacy "<orgName> Token" / "PT".
    hybridQuorum: Number(hybridVoterQuorum) || 0,
    ddQuorum: Number(ddVoterQuorum) || 0,
    tokenName: tokenName || '',
    tokenSymbol: tokenSymbol || '',
  };

  if (orgDeployerSchema === ORG_DEPLOYER_SCHEMA.ACCESS_V2) {
    deploymentParams.groups = groups || [];
  }

  // Provision ZkEmailInvites dormant when selected (zero root/CID). The schema
  // boundary chooses exactly one ABI and rejects mixed legacy/v2 RoleConfigs.
  const calldata = encodeOrgDeploymentCalldata({
    schema: orgDeployerSchema,
    params: deploymentParams,
    zkEmailEnabled,
  });

  return { calldata, orgDeployerAddress, orgId, params: deploymentParams, schema: orgDeployerSchema };
}

/**
 * Send a pre-built deploy calldata blob with an ethers signer.
 *
 * This is the EOA counterpart to the passkey UserOp path: both now broadcast the
 * EXACT bytes that were simulated and shown in the preview modal. Previously the
 * wallet path re-derived its own DeploymentParams inside `main()`, which meant the
 * transaction that got signed could differ from the one that was simulated — most
 * visibly, `main()` always called `deployFullOrg`, so wallet deployers silently got
 * no ZkEmailInvites module no matter what the "Email Invites" toggle said.
 *
 * @param {Object} args
 * @param {Object} args.wallet - ethers signer
 * @param {string} args.to - OrgDeployer proxy address
 * @param {string} args.calldata - ABI-encoded deployFullOrg / deployFullOrgWithZkEmail call
 * @param {ethers.BigNumber|null} [args.valueWei] - msg.value for paymaster funding
 * @param {string} args.orgDeployerSchema - Schema selected from VERSION(); required
 * @param {number} args.expectedChainId - Chain the user selected; required
 * @returns {Promise<{ receipt: Object, deployment: Object|null }>}
 */
export async function deployWithCalldata({
  wallet,
  to,
  calldata,
  valueWei = null,
  orgDeployerSchema,
  expectedChainId,
}) {
  assertOrgDeploymentCalldataSchema({ schema: orgDeployerSchema, calldata });
  if (!Number.isInteger(Number(expectedChainId)) || Number(expectedChainId) <= 0) {
    throw new OrgDeployerBoundaryError(
      'A valid expected chain ID is required before sending deployment calldata.'
    );
  }
  const actualChainId = await wallet?.getChainId?.();
  if (Number(actualChainId) !== Number(expectedChainId)) {
    throw new OrgDeployerBoundaryError(
      `Wallet is connected to chain ${actualChainId ?? 'unknown'}, but this deployment targets chain ${expectedChainId}. Refusing to send.`
    );
  }
  await assertDeployedOrgDeployerSchema({
    provider: wallet?.provider,
    address: to,
    schema: orgDeployerSchema,
  });

  const value = valueWei || ethers.BigNumber.from(0);

  // The read-only simulation in /create already proved this reverts nowhere, so a
  // failed estimate here is a node quirk rather than a bad config — fall back to a
  // high ceiling rather than aborting a deploy the user already confirmed.
  let gasLimit;
  try {
    gasLimit = (await wallet.estimateGas({ to, data: calldata, value })).mul(120).div(100);
  } catch (estimateError) {
    console.warn('[DEPLOY] Gas estimation failed after a successful simulation; using fallback limit.', estimateError);
    gasLimit = ethers.BigNumber.from(25000000);
  }

  const tx = await wallet.sendTransaction({ to, data: calldata, value, gasLimit });
  console.log('[DEPLOY] Transaction sent:', tx.hash);
  const receipt = await tx.wait();
  console.log('[DEPLOY] Deployment confirmed:', receipt.transactionHash);
  const deployment = parseOrgDeploymentReceipt(receipt, orgDeployerSchema);
  return { receipt, deployment };
}
