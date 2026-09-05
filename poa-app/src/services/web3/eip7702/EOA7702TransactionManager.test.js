import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildUserOpWithFallback: vi.fn(),
  buildEOAAuthorization: vi.fn(),
  signUserOpWithWallet: vi.fn(),
}));

vi.mock('../passkey/userOpBuilder', () => ({
  buildUserOpWithFallback: mocks.buildUserOpWithFallback,
  getUserOpHash: vi.fn(() => `0x${'1'.repeat(64)}`),
}));

vi.mock('./authorizationBuilder', () => ({
  buildEOAAuthorization: mocks.buildEOAAuthorization,
}));

vi.mock('./walletSigner', () => ({
  signUserOpWithWallet: mocks.signUserOpWithWallet,
}));

import { EOA7702TransactionManager } from './EOA7702TransactionManager';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const TARGET = '0x2222222222222222222222222222222222222222';
const DELEGATION = '0x3333333333333333333333333333333333333333';
const PAYMASTER = '0x4444444444444444444444444444444444444444';

function mockUserOp(overrides = {}) {
  return {
    sender: ACCOUNT,
    nonce: 0n,
    callData: '0x',
    callGasLimit: 1_650_000n,
    verificationGasLimit: 100_000n,
    preVerificationGas: 50_000n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    signature: '0x',
    ...overrides,
  };
}

function makeManager(sendUserOperation = vi.fn(async () => `0x${'3'.repeat(64)}`)) {
  const receipt = {
    success: true,
    receipt: { transactionHash: `0x${'2'.repeat(64)}`, blockNumber: 1 },
  };
  return new EOA7702TransactionManager({
    accountAddress: ACCOUNT,
    walletClient: {},
    publicClient: {},
    bundlerClient: {
      sendUserOperation,
      waitForUserOperationReceipt: vi.fn(async () => receipt),
    },
    paymasterAddress: null,
    orgId: null,
    hatIds: [],
    chainId: 100,
    eoaDelegationAddress: DELEGATION,
  });
}

function fakeContract() {
  return {
    address: TARGET,
    interface: {
      encodeFunctionData: vi.fn(() => '0x12345678'),
    },
  };
}

describe('EOA7702TransactionManager gas floors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildEOAAuthorization.mockResolvedValue({ address: DELEGATION });
    mocks.signUserOpWithWallet.mockResolvedValue(`0x${'4'.repeat(130)}`);
    mocks.buildUserOpWithFallback.mockResolvedValue(mockUserOp());
  });

  it('forwards an execute callGasLimitFloor to the real UserOp builder boundary', async () => {
    const manager = makeManager();

    const result = await manager.execute(fakeContract(), 'announceWinner', ['12'], {
      callGasLimitMultiplier: 3n,
      callGasLimitFloor: 1_650_000,
    });

    expect(result.success).toBe(true);
    expect(mocks.buildUserOpWithFallback).toHaveBeenCalledWith(expect.objectContaining({
      gasOverrides: {
        callGasLimit: undefined,
        callGasLimitMultiplier: 3n,
        callGasLimitFloor: 1_650_000,
      },
    }));
  });

  it('forwards the same floor for executeBatch', async () => {
    const manager = makeManager();

    const result = await manager.executeBatch([
      { contract: fakeContract(), method: 'remove', args: [] },
    ], { callGasLimitFloor: 5_400_000 });

    expect(result.success).toBe(true);
    expect(mocks.buildUserOpWithFallback).toHaveBeenCalledWith(expect.objectContaining({
      gasOverrides: {
        callGasLimit: undefined,
        callGasLimitMultiplier: undefined,
        callGasLimitFloor: 5_400_000,
      },
    }));
  });

  it('keeps the floor when a rejected sponsored op is rebuilt self-funded', async () => {
    const paymasterError = new Error('AA33 validatePaymasterUserOp reverted');
    const send = vi.fn()
      .mockRejectedValueOnce(paymasterError)
      .mockResolvedValueOnce(`0x${'3'.repeat(64)}`);
    const manager = makeManager(send);
    mocks.buildUserOpWithFallback
      .mockResolvedValueOnce(mockUserOp({ paymaster: PAYMASTER }))
      .mockResolvedValueOnce(mockUserOp());

    const result = await manager.execute(fakeContract(), 'announceWinner', ['12'], {
      callGasLimitMultiplier: 3n,
      callGasLimitFloor: 5_400_000,
    });

    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(mocks.buildUserOpWithFallback).toHaveBeenNthCalledWith(2, expect.objectContaining({
      gasOverrides: {
        callGasLimit: undefined,
        callGasLimitMultiplier: 3n,
        callGasLimitFloor: 5_400_000,
      },
    }));
  });
});
