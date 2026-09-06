import { describe, expect, it, vi } from 'vitest';
import { utils, constants } from 'ethers';
import { RoleCreationService } from './RoleCreationService';

const orgId = `0x${'11'.repeat(32)}`;
const executor = `0x${'22'.repeat(20)}`;
const paymasterHub = `0x${'33'.repeat(20)}`;
const setup = () => {
  const hub = {
    getOrgConfig: vi.fn().mockResolvedValue({ adminHatId: '123', paused: false }),
    getBudget: vi.fn().mockResolvedValue({ capPerEpoch: '0', epochLen: 0 }),
    callStatic: { setBudget: vi.fn().mockResolvedValue(undefined) },
  };
  const readFactory = { createReadOnly: vi.fn().mockReturnValue(hub) };
  return { hub, readFactory, service: new RoleCreationService(readFactory) };
};

describe('RoleCreationService sponsorship preflight', () => {
  it('checks the live gate as the executor using only an eth_call', async () => {
    const { service, hub, readFactory } = setup();
    await expect(service.getSponsorshipConfig({ orgId, executor, paymasterHub })).resolves.toMatchObject({ canConfigure: true });
    expect(readFactory.createReadOnly).toHaveBeenCalledWith(paymasterHub, expect.any(Array));
    expect(hub.callStatic.setBudget).toHaveBeenCalledWith(orgId, constants.HashZero, '1', 3600, { from: executor });
  });
  it('distinguishes an operator-only org from a network read failure', async () => {
    const { service, hub } = setup();
    hub.callStatic.setBudget.mockRejectedValueOnce({ data: utils.id('NotOperator()').slice(0, 10) });
    await expect(service.getSponsorshipConfig({ orgId, executor, paymasterHub })).resolves.toMatchObject({ canConfigure: false, ready: true });
    hub.callStatic.setBudget.mockRejectedValueOnce(new Error('RPC unavailable'));
    await expect(service.getSponsorshipConfig({ orgId, executor, paymasterHub })).rejects.toThrow('RPC unavailable');
  });
  it('does not treat an unregistered org as configurable', async () => {
    const { service, hub } = setup();
    hub.getOrgConfig.mockResolvedValue({ adminHatId: '0' });
    await expect(service.getSponsorshipConfig({ orgId, executor, paymasterHub })).resolves.toMatchObject({ canConfigure: false });
    expect(hub.callStatic.setBudget).not.toHaveBeenCalled();
  });
  it('reads the shared claim budget using the email module address, not a role id', async () => {
    const { service, hub } = setup();
    const zkEmailAddress = `0x${'44'.repeat(20)}`;
    await expect(service.getSponsorshipConfig({ orgId, executor, paymasterHub, zkEmailAddress })).resolves.toMatchObject({ claimBudgetMissing: true });
    expect(hub.getBudget).toHaveBeenCalledWith(orgId, utils.solidityKeccak256(['uint8', 'bytes32'], [5, utils.hexZeroPad(zkEmailAddress, 32)]));
    hub.getBudget.mockResolvedValue({ capPerEpoch: '123', epochLen: 3600 });
    await expect(service.getSponsorshipConfig({ orgId, executor, paymasterHub, zkEmailAddress })).resolves.toMatchObject({ claimBudgetMissing: false });
    // A configured zero cap deliberately disables sponsorship; preserve that choice.
    hub.getBudget.mockResolvedValue({ capPerEpoch: '0', epochLen: 3600 });
    await expect(service.getSponsorshipConfig({ orgId, executor, paymasterHub, zkEmailAddress })).resolves.toMatchObject({ claimBudgetMissing: false });
  });
});
