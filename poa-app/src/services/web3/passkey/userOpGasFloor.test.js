/**
 * The 4337 half of the announceWinner gas floor: `callGasLimitFloor` must survive
 * `buildUserOpWithFallback` and land on the UserOp the bundler is asked to run.
 *
 * Sponsored users finalize through this path, so a floor that only worked on the EOA path would
 * leave exactly the population that finalizes most often exposed to the silent-skip bug.
 */

import { describe, it, expect } from 'vitest';
import { buildUserOpWithFallback } from './userOpBuilder';

const SENDER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/**
 * A bundler that reports the CHEAP CAUGHT-FAILURE estimate announceWinner really produces
 * (~29k for the try/catch path), plus a publicClient that only answers getNonce.
 */
function fakeClients({ callGasLimit = 29_000n } = {}) {
  return {
    publicClient: { readContract: async () => 0n },
    bundlerClient: {
      getUserOperationGasPrice: async () => null,
      estimateUserOperationGas: async () => ({
        callGasLimit,
        verificationGasLimit: 100_000n,
        preVerificationGas: 50_000n,
      }),
    },
  };
}

async function build(gasOverrides, opts) {
  const { publicClient, bundlerClient } = fakeClients(opts);
  return buildUserOpWithFallback({
    sender: SENDER,
    callData: '0x',
    bundlerClient,
    publicClient,
    gasOverrides,
  });
}

describe('callGasLimitFloor', () => {
  it('raises a bundler estimate that priced only the caught-failure path', async () => {
    const userOp = await build({ callGasLimitFloor: 1_650_000n });
    expect(userOp.callGasLimit).toBe(1_650_000n);
  });

  it('composes with the announceWinner 3x multiplier instead of replacing it — the larger wins', async () => {
    // 29k * 3 = 87k, still short of the batch: the floor takes over.
    const floored = await build({ callGasLimitMultiplier: 3n, callGasLimitFloor: 1_650_000n });
    expect(floored.callGasLimit).toBe(1_650_000n);

    // A bundler estimate big enough that 3x already clears the floor keeps the multiplier's value.
    const multiplied = await build(
      { callGasLimitMultiplier: 3n, callGasLimitFloor: 1_000_000n },
      { callGasLimit: 800_000n }
    );
    expect(multiplied.callGasLimit).toBe(2_400_000n);
  });

  it('is a floor, never a cap: a lower floor leaves the buffered estimate alone', async () => {
    const userOp = await build({ callGasLimitFloor: 10_000n }, { callGasLimit: 900_000n });
    expect(userOp.callGasLimit).toBe(990_000n); // 900k + 10% buffer
  });

  it('changes nothing when absent (default 10% buffer path)', async () => {
    const userOp = await build({});
    expect(userOp.callGasLimit).toBe(31_900n); // 29k + 10%
  });

  it('rejects a non-positive floor at the caller rather than sending an OOG op', async () => {
    await expect(build({ callGasLimitFloor: 0n })).rejects.toThrow(/callGasLimitFloor must be positive/);
    await expect(build({ callGasLimitFloor: -1n })).rejects.toThrow(/callGasLimitFloor must be positive/);
  });

  it('fails LOUDLY rather than silently trimming the floor back under MAX_USEROP_GAS', async () => {
    // The whole point of a floor is that the caller knows better than the estimator. Quietly
    // shaving it off would reproduce the original bug with extra steps.
    await expect(build({ callGasLimitFloor: 40_000_000n })).rejects.toThrow(/MAX_USEROP_GAS/);
  });
});
