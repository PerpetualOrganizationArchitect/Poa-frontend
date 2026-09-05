import { describe, expect, it, vi } from 'vitest';
import { MembershipAuthorityService } from './MembershipAuthorityService';

const AUTHORITY = '0x1111111111111111111111111111111111111111';
const USER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('MembershipAuthorityService cross-chain reads', () => {
  it('uses the dedicated org-chain read factory for canRemove', async () => {
    const canRemove = vi.fn(async () => ({ reason: 0, sourceSet: 0 }));
    const writeFactory = {
      createReadOnly: vi.fn(() => { throw new Error('home-chain factory used for read'); }),
    };
    const readFactory = {
      createReadOnly: vi.fn(() => ({ canRemove })),
    };
    const service = new MembershipAuthorityService(writeFactory, null, readFactory);

    await expect(service.canRemove(AUTHORITY, '7', USER, true)).resolves.toEqual({
      reason: 0,
      sourceSet: 0,
    });
    expect(readFactory.createReadOnly).toHaveBeenCalledWith(AUTHORITY, expect.any(Array));
    expect(writeFactory.createReadOnly).not.toHaveBeenCalled();
    expect(canRemove).toHaveBeenCalledWith('7', USER, true);
  });

  it('keeps the original factory as the backwards-compatible default', async () => {
    const factory = {
      createReadOnly: vi.fn(() => ({
        canRemove: async () => ({ reason: 7, sourceSet: 5 }),
      })),
    };
    const service = new MembershipAuthorityService(factory, null);
    await expect(service.canRemove(AUTHORITY, '8', USER, false)).resolves.toEqual({
      reason: 7,
      sourceSet: 5,
    });
    expect(factory.createReadOnly).toHaveBeenCalledOnce();
  });
});
