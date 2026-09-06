import { describe, expect, it, vi } from 'vitest';
import { createZkEmailInvitesService } from '@/services/web3/domain/ZkEmailInvitesService';

const MODULE = `0x${'11'.repeat(20)}`;
const AUTHORITY = `0x${'22'.repeat(20)}`;
const EXECUTOR = `0x${'33'.repeat(20)}`;
const INFRA = `0x${'44'.repeat(20)}`;
const ROOT = `0x${'aa'.repeat(32)}`;
const CID = `0x${'bb'.repeat(32)}`;

const setup = () => {
  const emailModule = {
    merkleRoot: vi.fn().mockResolvedValue(ROOT), allowlistCid: vi.fn().mockResolvedValue(CID),
    executor: vi.fn().mockResolvedValue(EXECUTOR),
    domainVerifier: vi.fn().mockResolvedValue(INFRA), emailVerifier: vi.fn().mockResolvedValue(INFRA),
    dkimRegistry: vi.fn().mockResolvedValue(INFRA), accountRegistry: vi.fn().mockResolvedValue(INFRA),
    universalFactory: vi.fn().mockResolvedValue(INFRA), isEmailRegistered: vi.fn().mockResolvedValue(false),
  };
  const executor = { hats: vi.fn().mockResolvedValue(AUTHORITY), isAuthorizedHatMinter: vi.fn().mockResolvedValue(true) };
  const readFactory = { createReadOnly: vi.fn((address) => address === EXECUTOR ? executor : emailModule) };
  const factory = { createReadOnly: vi.fn(() => { throw new Error('home chain read'); }), createWritable: vi.fn().mockReturnValue({ address: MODULE }) };
  const txManager = { execute: vi.fn().mockResolvedValue({ success: true }) };
  const service = createZkEmailInvitesService(factory, txManager, readFactory);
  return { service, emailModule, executor, factory, readFactory, txManager };
};

describe('v2 email service routing', () => {
  it('reads the commitment and registration on the org factory while retaining authenticated writes', async () => {
    const { service, readFactory, factory, txManager } = setup();
    expect(await service.getActiveAllowlist(MODULE)).toEqual({ root: ROOT, cid: CID });
    expect(await service.isEmailRegistered(MODULE, ROOT)).toBe(false);
    const options = { paymasterClaimTarget: MODULE, paymasterHatIds: ['42'] };
    await service.claimRoleByEmail(MODULE, { proof: true }, AUTHORITY, ['42'], [], options);
    expect(factory.createReadOnly).not.toHaveBeenCalled();
    expect(readFactory.createReadOnly).toHaveBeenCalled();
    expect(txManager.execute).toHaveBeenCalledWith({ address: MODULE }, 'claimRoleByEmail', [{ proof: true }, AUTHORITY, ['42'], []], options);
  });

  it('verifies the migrated Executor authority surface and allows authorization to be granted by the proposal', async () => {
    const { service, executor } = setup();
    executor.isAuthorizedHatMinter.mockResolvedValue(false);
    expect(await service.getRoleEmailConfig(MODULE, AUTHORITY, EXECUTOR)).toMatchObject({ ready: true, enabled: true, authorityMatches: true, minterAuthorized: false });
  });

  it('refuses email joining when Executor still points at legacy Hats', async () => {
    const { service, executor, emailModule } = setup();
    executor.hats.mockResolvedValue(INFRA);
    expect(await service.getRoleEmailConfig(MODULE, AUTHORITY, EXECUTOR)).toMatchObject({ enabled: false, authorityMatches: false });
  });

  it('keeps domain claims available without a specific-email verifier and vice versa', async () => {
    const { service, emailModule } = setup();
    emailModule.emailVerifier.mockResolvedValue(`0x${'0'.repeat(40)}`);
    expect(await service.getRoleEmailConfig(MODULE, AUTHORITY, EXECUTOR)).toMatchObject({
      enabled: true, authorityMatches: true, domainEnabled: true, emailEnabled: false,
    });
    emailModule.emailVerifier.mockResolvedValue(INFRA);
    emailModule.domainVerifier.mockResolvedValue(`0x${'0'.repeat(40)}`);
    expect(await service.getRoleEmailConfig(MODULE, AUTHORITY, EXECUTOR)).toMatchObject({
      enabled: true, domainEnabled: false, emailEnabled: true,
    });
  });

  it('keeps existing-account claims available when passkey enrollment is not configured', async () => {
    const { service, emailModule } = setup();
    emailModule.universalFactory.mockResolvedValue(`0x${'0'.repeat(40)}`);
    emailModule.accountRegistry.mockResolvedValue(`0x${'0'.repeat(40)}`);
    expect(await service.getRoleEmailConfig(MODULE, AUTHORITY, EXECUTOR)).toMatchObject({
      enabled: true, domainEnabled: true, emailEnabled: true, passkeyEnrollmentEnabled: false,
      error: null, onboardingError: expect.stringContaining('existing account'),
    });
  });

  it('requires DKIM and at least one verifier for claims', async () => {
    const { service, emailModule } = setup();
    emailModule.dkimRegistry.mockResolvedValue(`0x${'0'.repeat(40)}`);
    expect(await service.getRoleEmailConfig(MODULE, AUTHORITY, EXECUTOR)).toMatchObject({
      enabled: false, domainEnabled: false, emailEnabled: false,
    });
    emailModule.dkimRegistry.mockResolvedValue(INFRA);
    emailModule.domainVerifier.mockResolvedValue(`0x${'0'.repeat(40)}`);
    emailModule.emailVerifier.mockResolvedValue(`0x${'0'.repeat(40)}`);
    expect(await service.getRoleEmailConfig(MODULE, AUTHORITY, EXECUTOR)).toMatchObject({
      enabled: false, domainEnabled: false, emailEnabled: false,
    });
  });
});
