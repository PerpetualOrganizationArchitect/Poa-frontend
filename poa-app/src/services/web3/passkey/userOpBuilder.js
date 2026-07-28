/**
 * userOpBuilder.js
 * Construct, pack, and hash ERC-4337 v0.7 UserOperations.
 *
 * Uses viem for encoding and the Pimlico bundler client (from permissionless)
 * for gas estimation and submission.
 */

import {
  concat,
  pad,
  toHex,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';
import { entryPoint07Abi } from 'viem/account-abstraction';
import { ENTRY_POINT_ADDRESS, GAS_BUFFER_PERCENT, MAX_USEROP_GAS } from '../../../config/passkey';
import { extractRevertDataFromText, decodeRevertData } from '../../../lib/errors/contractErrors';

/**
 * Build a complete UserOp ready for signing.
 *
 * @param {Object} params
 * @param {string} params.sender - Smart account address
 * @param {string} params.callData - Encoded call data (already wrapped in execute/executeBatch)
 * @param {Object} params.bundlerClient - Pimlico bundler client (from createPimlicoClient)
 * @param {Object} params.publicClient - viem public client for chain reads
 * @param {string} [params.initCode='0x'] - Factory address + init calldata for account deployment
 * @param {string} params.paymasterAddress - PaymasterHub address
 * @param {string} params.paymasterData - Encoded paymaster-specific data (after address)
 * @param {Object} [params.gasOverrides] - Optional gas override params (see estimateGas)
 * @returns {Object} UserOperation object ready for signing
 */
export async function buildUserOp({
  sender,
  callData,
  bundlerClient,
  publicClient,
  initCode = '0x',
  paymasterAddress,
  paymasterData,
  authorization,
  dummySignatureLength,
  gasOverrides,
}) {
  const entryPoint = ENTRY_POINT_ADDRESS;

  // 1. Fetch nonce and gas prices in parallel (single round-trip)
  const [nonce, gasPrices] = await Promise.all([
    publicClient.readContract({
      address: entryPoint,
      abi: entryPoint07Abi,
      functionName: 'getNonce',
      args: [sender, 0n],
    }),
    bundlerClient.getUserOperationGasPrice().catch((e) => {
      console.warn('Failed to get gas price from bundler, using defaults:', e.message);
      return null;
    }),
  ]);

  // Parse initCode into factory + factoryData (v0.7 format)
  let factory = undefined;
  let factoryData = undefined;
  if (initCode && initCode !== '0x' && initCode.length > 2) {
    factory = '0x' + initCode.slice(2, 42);
    factoryData = '0x' + initCode.slice(42);
  }

  // 2. Build base UserOp with placeholder gas values and dummy signature
  const dummySig = dummySignatureLength
    ? '0x' + 'ff'.repeat(dummySignatureLength)
    : DUMMY_SIGNATURE;

  const userOp = {
    sender,
    nonce,
    factory,
    factoryData,
    callData,
    callGasLimit: 500_000n,
    verificationGasLimit: 1_500_000n,
    preVerificationGas: 100_000n,
    maxFeePerGas: gasPrices?.standard?.maxFeePerGas ?? 500_000_000n,
    maxPriorityFeePerGas: gasPrices?.standard?.maxPriorityFeePerGas ?? 100_000_000n,
    ...(paymasterAddress ? {
      paymaster: paymasterAddress,
      paymasterVerificationGasLimit: 200_000n,
      paymasterPostOpGasLimit: 200_000n,
      paymasterData,
    } : {}),
    ...(authorization ? { authorization } : {}),
    signature: dummySig,
  };

  // 3. Estimate gas via bundler
  await estimateGas(userOp, bundlerClient, gasOverrides);

  return userOp;
}

/**
 * Build a UserOp with paymaster fallback.
 * Fetches nonce + gas prices once, then tries gas estimation with paymaster.
 * If the paymaster rejects, strips paymaster fields and re-estimates (only the
 * estimation call is repeated, not the nonce/gas price fetches).
 *
 * @param {Object} params
 * @param {string} params.sender - Smart account address
 * @param {string} params.callData - Encoded call data
 * @param {Object} params.bundlerClient - Pimlico bundler client
 * @param {Object} params.publicClient - viem public client
 * @param {string} [params.initCode='0x'] - initCode for account deployment
 * @param {string} [params.paymasterAddress] - PaymasterHub address (optional)
 * @param {string} [params.paymasterData] - Paymaster-specific data (optional, single entry)
 * @param {string[]} [params.paymasterDataEntries] - Array of paymaster data to try (tries each before self-pay)
 * @param {Object} [params.gasOverrides] - Optional gas override params (see estimateGas)
 * @returns {Object} UserOperation ready for signing
 */
export async function buildUserOpWithFallback({
  sender,
  callData,
  bundlerClient,
  publicClient,
  initCode = '0x',
  paymasterAddress,
  paymasterData,
  paymasterDataEntries,
  authorization, // EIP-7702 authorization (optional — for delegated EOAs)
  dummySignatureLength, // Override dummy sig length (65 for ECDSA, 640 for passkey)
  gasOverrides, // { callGasLimit, callGasLimitMultiplier }
}) {
  const entryPoint = ENTRY_POINT_ADDRESS;

  // 1. Fetch nonce and gas prices in parallel — done once regardless of fallback
  const [nonce, gasPrices] = await Promise.all([
    publicClient.readContract({
      address: entryPoint,
      abi: entryPoint07Abi,
      functionName: 'getNonce',
      args: [sender, 0n],
    }),
    bundlerClient.getUserOperationGasPrice().catch((e) => {
      console.warn('Failed to get gas price from bundler, using defaults:', e.message);
      return null;
    }),
  ]);

  // Parse initCode into factory + factoryData (v0.7 format)
  let factory = undefined;
  let factoryData = undefined;
  if (initCode && initCode !== '0x' && initCode.length > 2) {
    factory = '0x' + initCode.slice(2, 42);
    factoryData = '0x' + initCode.slice(42);
  }

  const dummySig = dummySignatureLength
    ? '0x' + 'ff'.repeat(dummySignatureLength)
    : DUMMY_SIGNATURE;

  const baseFields = {
    sender,
    nonce,
    factory,
    factoryData,
    callData,
    callGasLimit: 500_000n,
    verificationGasLimit: 1_500_000n,
    preVerificationGas: 100_000n,
    maxFeePerGas: gasPrices?.standard?.maxFeePerGas ?? 500_000_000n,
    maxPriorityFeePerGas: gasPrices?.standard?.maxPriorityFeePerGas ?? 100_000_000n,
    signature: dummySig,
    ...(authorization ? { authorization } : {}),
  };

  // Normalize: support both single paymasterData and paymasterDataEntries array
  const dataEntries = paymasterDataEntries || (paymasterData ? [paymasterData] : []);

  // 2. Try with paymaster if available — iterate through all entries before giving up
  if (paymasterAddress && dataEntries.length > 0) {
    for (let i = 0; i < dataEntries.length; i++) {
      const userOp = {
        ...baseFields,
        paymaster: paymasterAddress,
        paymasterVerificationGasLimit: 200_000n,
        paymasterPostOpGasLimit: 200_000n,
        paymasterData: dataEntries[i],
      };

      try {
        await estimateGas(userOp, bundlerClient, gasOverrides);
        console.log(`UserOp built with gas sponsorship (entry ${i + 1}/${dataEntries.length})`);
        return userOp;
      } catch (e) {
        const msg = e.message || e.shortMessage || e.details || '';
        const isPaymasterRejection = msg.includes('AA31') || msg.includes('AA32') || msg.includes('AA33')
          || msg.includes('paymaster') || msg.includes('Paymaster')
          || msg.includes('validatePaymasterUserOp');

        if (isPaymasterRejection) {
          console.warn(`Paymaster rejected entry ${i + 1}/${dataEntries.length}, trying next:`, msg);
        } else {
          throw e;
        }
      }
    }
    console.warn('All paymaster entries rejected, falling back to self-funded');
  }

  // 3. Self-funded (no paymaster fields)
  const userOp = { ...baseFields };
  console.log('Building self-funded UserOp (account pays gas)');
  await estimateGas(userOp, bundlerClient, gasOverrides);
  return userOp;
}

/**
 * Run bundler gas estimation on a UserOp and apply results.
 * Mutates the userOp in place.
 *
 * @param {Object} userOp - UserOp to estimate gas for (mutated in place)
 * @param {Object} bundlerClient - Pimlico bundler client
 * @param {Object} [gasOverrides] - Optional gas overrides
 * @param {bigint} [gasOverrides.callGasLimit] - Absolute callGasLimit override (skips bundler estimate scaling)
 * @param {bigint} [gasOverrides.callGasLimitMultiplier] - Multiplier applied to bundler's callGasLimit
 *   estimate INSTEAD of the default 10% buffer. Pass as BigInt (e.g. 3n for 3x).
 *   Useful for ops like `announceWinner` where the bundler can't simulate recursive
 *   sub-calls (Hats protocol tree-walk through beacon-proxy chains) and undercounts.
 */
async function estimateGas(userOp, bundlerClient, gasOverrides = {}) {
  const { callGasLimit: callGasLimitOverride, callGasLimitMultiplier } = gasOverrides;

  // Validate overrides eagerly so misuse surfaces at the caller, not deep in the bundler.
  // 0 / 0n are treated as invalid (not "no override") — these would cause immediate OOG.
  if (callGasLimitOverride !== undefined && callGasLimitOverride !== null) {
    if (BigInt(callGasLimitOverride) <= 0n) {
      throw new Error(`callGasLimit override must be positive, got ${callGasLimitOverride}`);
    }
  }
  if (callGasLimitMultiplier !== undefined && callGasLimitMultiplier !== null) {
    if (BigInt(callGasLimitMultiplier) <= 0n) {
      throw new Error(`callGasLimitMultiplier must be positive, got ${callGasLimitMultiplier}`);
    }
  }

  try {
    const gasEstimate = await bundlerClient.estimateUserOperationGas({
      ...userOp,
      entryPointAddress: ENTRY_POINT_ADDRESS,
    });

    let overrideApplied = false;
    if (callGasLimitOverride !== undefined && callGasLimitOverride !== null) {
      // Absolute override — use exactly this value, ignore bundler estimate
      userOp.callGasLimit = BigInt(callGasLimitOverride);
      overrideApplied = true;
      console.log(`[UserOp] callGasLimit override: ${userOp.callGasLimit} (bundler estimated ${gasEstimate.callGasLimit})`);
    } else if (callGasLimitMultiplier !== undefined && callGasLimitMultiplier !== null) {
      // Multiplier — scale bundler estimate by this integer factor (e.g. 3n for 3x)
      userOp.callGasLimit = BigInt(gasEstimate.callGasLimit) * BigInt(callGasLimitMultiplier);
      overrideApplied = true;
      console.log(`[UserOp] callGasLimit ${callGasLimitMultiplier}x multiplier: ${userOp.callGasLimit} (bundler estimated ${gasEstimate.callGasLimit})`);
    } else {
      userOp.callGasLimit = applyBuffer(gasEstimate.callGasLimit);
    }
    userOp.preVerificationGas = applyBuffer(gasEstimate.preVerificationGas);

    // P-256 signature verification costs ~300-400k gas on-chain (Solidity fallback)
    // or ~3k with the RIP-7212 precompile. The bundler's gas estimation uses a dummy
    // signature that quick-fails, causing it to underestimate the real verification cost.
    // Enforce a minimum to prevent AA23 (validateUserOp OOG) errors.
    // When initCode is present (cross-chain account creation), account deployment +
    // P-256 verification needs more gas than subsequent calls.
    const hasInitCode = userOp.factory && userOp.factoryData;
    const has7702Auth = !!userOp.authorization;
    // ECDSA verification (~3k gas) is much cheaper than P-256 (~300-400k).
    // 7702 delegated EOAs use ECDSA, so they need far less verification gas.
    const MIN_VERIFICATION_GAS = has7702Auth ? 100_000n : (hasInitCode ? 1_000_000n : 500_000n);
    const estimatedVerification = applyBuffer(gasEstimate.verificationGasLimit);
    userOp.verificationGasLimit = estimatedVerification < MIN_VERIFICATION_GAS
      ? MIN_VERIFICATION_GAS
      : estimatedVerification;

    if (gasEstimate.paymasterVerificationGasLimit) {
      userOp.paymasterVerificationGasLimit = applyBuffer(gasEstimate.paymasterVerificationGasLimit);
    }
    if (gasEstimate.paymasterPostOpGasLimit) {
      userOp.paymasterPostOpGasLimit = applyBuffer(gasEstimate.paymasterPostOpGasLimit);
    }

    // Ensure total gas stays under bundler's per-UserOp limit.
    // If the total exceeds MAX_USEROP_GAS, reduce callGasLimit since the
    // bundler's execution trace gives accurate estimates and it needs less
    // buffer than verification gas (which is underestimated due to dummy sig).
    const totalGas = userOp.callGasLimit + userOp.verificationGasLimit
      + userOp.preVerificationGas
      + (userOp.paymasterVerificationGasLimit || 0n)
      + (userOp.paymasterPostOpGasLimit || 0n);

    if (totalGas > MAX_USEROP_GAS) {
      const excess = totalGas - MAX_USEROP_GAS;
      const reduced = userOp.callGasLimit - excess;
      if (overrideApplied) {
        // An explicit caller override/multiplier pushed us over the cap.
        // The caller asked for this much gas specifically — don't silently
        // reduce it. Fail loudly so the caller can pick a smaller value or
        // split the op into multiple transactions.
        // Use a tagged error so the catch below re-throws rather than swallowing.
        const err = new Error(
          `callGasLimit override/multiplier would exceed MAX_USEROP_GAS. ` +
          `Requested total ${totalGas}, max ${MAX_USEROP_GAS} (over by ${excess}). ` +
          `Reduce callGasLimit or multiplier and retry.`
        );
        err.isGasOverrideError = true;
        throw err;
      }
      console.warn(
        `[UserOp] Total gas ${totalGas} exceeds max ${MAX_USEROP_GAS}. ` +
        `Reducing callGasLimit from ${userOp.callGasLimit} to ${reduced}`
      );
      userOp.callGasLimit = reduced;
    }
  } catch (e) {
    // Re-throw gas-override errors — caller asked for specific gas and we
    // can't honor it, so they need to see this instead of a silent fallback.
    if (e.isGasOverrideError) {
      throw e;
    }
    // Re-throw paymaster rejections so callers can fall back to self-funded.
    // AA31=validation failed, AA32=deposit too low, AA33=time range expired
    const msg = e.message || e.shortMessage || e.details || '';
    if (msg.includes('AA31') || msg.includes('AA32') || msg.includes('AA33')
        || msg.includes('paymaster') || msg.includes('Paymaster')
        || msg.includes('validatePaymasterUserOp')) {
      throw e;
    }

    // A genuine, DECODABLE contract revert means this UserOp will fail on-chain.
    // Don't paper over it with generous defaults and submit a doomed op (which
    // wastes the user's time and, on the self-funded path, can't even pay gas) —
    // re-throw with the revert bytes so the manager surfaces the real reason
    // immediately. Bundler under-simulation / OOG noise (e.g. recursive Hats
    // tree-walks in announceWinner) does NOT decode to a known revert, so it
    // still falls through to the generous-defaults path below.
    const revertText = [msg, e.shortMessage, e.details, e.cause?.shortMessage, e.cause?.details, e.cause?.message]
      .filter(Boolean)
      .join('\n');
    for (const hex of extractRevertDataFromText(revertText)) {
      const decoded = decodeRevertData(hex);
      if (decoded) {
        const revertErr = new Error(`Contract call would revert: ${decoded.reason || decoded.name || hex}`);
        revertErr.isContractRevert = true;
        revertErr.revertData = hex;
        revertErr.cause = e;
        throw revertErr;
      }
    }

    console.warn('Gas estimation failed, using generous defaults:', msg);
  }
}

/**
 * Compute the UserOp hash per EIP-4337 v0.7 (PackedUserOperation) spec.
 *
 * hash = keccak256(abi.encode(
 *   keccak256(pack(userOp)),  // without signature
 *   entryPoint,
 *   chainId
 * ))
 *
 * For v0.7 PackedUserOperation:
 *   pack = abi.encode(sender, nonce, hashInitCode, hashCallData,
 *          accountGasLimits, preVerificationGas, gasFees, hashPaymasterAndData)
 */
export function getUserOpHash(userOp, entryPoint, chainId) {
  // Reconstruct initCode from factory + factoryData
  let initCode = '0x';
  if (userOp.factory && userOp.factoryData) {
    initCode = concat([userOp.factory, userOp.factoryData]);
  }

  // Reconstruct paymasterAndData
  let paymasterAndData = '0x';
  if (userOp.paymaster) {
    const pmVerGas = pad(toHex(userOp.paymasterVerificationGasLimit || 0n), { size: 16 });
    const pmPostGas = pad(toHex(userOp.paymasterPostOpGasLimit || 0n), { size: 16 });
    if (userOp.paymasterData && userOp.paymasterData !== '0x') {
      paymasterAndData = concat([userOp.paymaster, pmVerGas, pmPostGas, userOp.paymasterData]);
    } else {
      paymasterAndData = concat([userOp.paymaster, pmVerGas, pmPostGas]);
    }
  }

  // Pack gas fields into bytes32 per v0.7 format
  const accountGasLimits = packUint128Pair(
    userOp.verificationGasLimit,
    userOp.callGasLimit,
  );
  const gasFees = packUint128Pair(
    userOp.maxPriorityFeePerGas,
    userOp.maxFeePerGas,
  );

  const packed = encodeAbiParameters(
    parseAbiParameters('address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32'),
    [
      userOp.sender,
      userOp.nonce,
      keccak256(initCode || '0x'),
      keccak256(userOp.callData),
      accountGasLimits,
      userOp.preVerificationGas,
      gasFees,
      keccak256(paymasterAndData || '0x'),
    ]
  );

  const userOpPacked = keccak256(packed);

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, address, uint256'),
      [userOpPacked, entryPoint, BigInt(chainId)]
    )
  );
}

/**
 * Pack two uint128 values into a single bytes32.
 * high128 || low128
 */
function packUint128Pair(high, low) {
  return pad(toHex((BigInt(high) << 128n) | BigInt(low)), { size: 32 });
}

/**
 * Apply gas buffer percentage to an estimate.
 */
function applyBuffer(value) {
  return (BigInt(value) * (100n + GAS_BUFFER_PERCENT)) / 100n;
}

/**
 * Dummy signature for gas estimation.
 * Must be approximately the same length as a real passkey signature
 * so gas estimation accounts for signature verification cost.
 * A real signature is ~640 bytes (ABI-encoded credentialId + WebAuthnAuth).
 */
const DUMMY_SIGNATURE = '0x' + 'ff'.repeat(640);
