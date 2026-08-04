/**
 * resolveRoleUsernames — the last step between wizard state and deploy calldata.
 *
 * Two failure modes it exists to prevent:
 *   - a member silently missing from the deployed org (it throws instead), and
 *   - a duplicate wearer, which reverts the whole deploy at mint time.
 *
 * Since the Team step switched to the search picker, entries usually arrive with
 * an address already attached; those must NOT trigger a registry lookup, because
 * a resolution that degrades between selection and deploy would otherwise fail a
 * launch the founder already paid to prepare.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveUsernamesAcrossChains = vi.fn();

vi.mock('@/util/crossChainUsername', () => ({
  resolveUsernamesAcrossChains: (...args) => resolveUsernamesAcrossChains(...args),
}));

const { resolveRoleUsernames, validateAllUsernames } = await import('./usernameResolver');

const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CAROL = '0xcccccccccccccccccccccccccccccccccccccccc';

const roleWith = (name, distribution) => ({
  name,
  distribution: { mintToDeployer: true, additionalWearers: [], ...distribution },
});

beforeEach(() => {
  resolveUsernamesAcrossChains.mockReset();
  resolveUsernamesAcrossChains.mockResolvedValue({ resolved: new Map(), notFound: [] });
});

describe('resolveRoleUsernames — picker entries', () => {
  it('uses the address captured at selection time without querying the registry', async () => {
    const roles = [
      roleWith('Member', {
        additionalMembers: [
          { address: ALICE, username: 'alice' },
          { address: BOB, username: 'bob' },
        ],
      }),
    ];

    const out = await resolveRoleUsernames(roles);

    expect(resolveUsernamesAcrossChains).not.toHaveBeenCalled();
    expect(out[0].distribution.additionalWearers).toEqual([ALICE, BOB]);
  });

  it('survives a registry that no longer knows the username', async () => {
    // The exact regression the picker was meant to kill: username resolvable at
    // selection, unresolvable at deploy. With the address in hand it must not matter.
    resolveUsernamesAcrossChains.mockResolvedValue({ resolved: new Map(), notFound: ['alice'] });

    const roles = [roleWith('Member', { additionalMembers: [{ address: ALICE, username: 'alice' }] })];

    await expect(resolveRoleUsernames(roles)).resolves.toMatchObject([
      { distribution: { additionalWearers: [ALICE] } },
    ]);
  });

  it('leaves roles without additional members untouched', async () => {
    const roles = [roleWith('Member', { additionalMembers: [] })];
    const out = await resolveRoleUsernames(roles);

    expect(resolveUsernamesAcrossChains).not.toHaveBeenCalled();
    expect(out[0]).toBe(roles[0]);
  });
});

describe('resolveRoleUsernames — legacy username entries', () => {
  it('resolves bare username strings against the registry', async () => {
    resolveUsernamesAcrossChains.mockResolvedValue({
      resolved: new Map([['alice', ALICE], ['bob', BOB]]),
      notFound: [],
    });

    const roles = [roleWith('Member', { additionalWearerUsernames: ['Alice', 'bob'] })];
    const out = await resolveRoleUsernames(roles);

    expect(resolveUsernamesAcrossChains).toHaveBeenCalledWith(['alice', 'bob']);
    expect(out[0].distribution.additionalWearers).toEqual([ALICE, BOB]);
  });

  it('only looks up the entries that still lack an address', async () => {
    resolveUsernamesAcrossChains.mockResolvedValue({
      resolved: new Map([['carol', CAROL]]),
      notFound: [],
    });

    const roles = [
      roleWith('Member', {
        additionalMembers: [
          { address: ALICE, username: 'alice' },
          { address: null, username: 'carol' },
        ],
      }),
    ];
    const out = await resolveRoleUsernames(roles);

    expect(resolveUsernamesAcrossChains).toHaveBeenCalledWith(['carol']);
    expect(out[0].distribution.additionalWearers).toEqual([ALICE, CAROL]);
  });

  it('throws rather than deploying an org missing a member', async () => {
    resolveUsernamesAcrossChains.mockResolvedValue({ resolved: new Map(), notFound: ['ghost'] });

    const roles = [roleWith('Steward', { additionalWearerUsernames: ['ghost'] })];

    await expect(resolveRoleUsernames(roles)).rejects.toThrow(
      /Could not resolve username "ghost" for role "Steward"/
    );
  });

  it('surfaces a network failure as an error, not as "user not found"', async () => {
    resolveUsernamesAcrossChains.mockRejectedValue(
      new Error('Could not reach all networks to verify usernames — please try again.')
    );

    const roles = [roleWith('Member', { additionalWearerUsernames: ['alice'] })];

    await expect(resolveRoleUsernames(roles)).rejects.toThrow(/Failed to resolve usernames/);
  });
});

describe('resolveRoleUsernames — duplicate wearers', () => {
  it('collapses the same address listed twice on one role', async () => {
    const roles = [
      roleWith('Member', {
        additionalMembers: [
          { address: ALICE, username: 'alice' },
          { address: ALICE.toUpperCase().replace('0X', '0x'), username: 'alice-alt' },
        ],
      }),
    ];

    const out = await resolveRoleUsernames(roles);
    expect(out[0].distribution.additionalWearers).toEqual([ALICE]);
  });

  it('collapses two different usernames that resolve to one address', async () => {
    resolveUsernamesAcrossChains.mockResolvedValue({
      resolved: new Map([['alice', ALICE], ['alice2', ALICE]]),
      notFound: [],
    });

    const roles = [roleWith('Member', { additionalWearerUsernames: ['alice', 'alice2'] })];
    const out = await resolveRoleUsernames(roles);

    expect(out[0].distribution.additionalWearers).toEqual([ALICE]);
  });

  it('keeps the same person on two different roles', async () => {
    const roles = [
      roleWith('Member', { additionalMembers: [{ address: ALICE, username: 'alice' }] }),
      roleWith('Steward', { additionalMembers: [{ address: ALICE, username: 'alice' }] }),
    ];

    const out = await resolveRoleUsernames(roles);
    expect(out[0].distribution.additionalWearers).toEqual([ALICE]);
    expect(out[1].distribution.additionalWearers).toEqual([ALICE]);
  });

  it('batches one lookup across every role', async () => {
    resolveUsernamesAcrossChains.mockResolvedValue({
      resolved: new Map([['alice', ALICE], ['bob', BOB]]),
      notFound: [],
    });

    const roles = [
      roleWith('Member', { additionalWearerUsernames: ['alice'] }),
      roleWith('Steward', { additionalWearerUsernames: ['bob', 'alice'] }),
    ];

    await resolveRoleUsernames(roles);
    expect(resolveUsernamesAcrossChains).toHaveBeenCalledTimes(1);
    expect(resolveUsernamesAcrossChains).toHaveBeenCalledWith(['alice', 'bob']);
  });
});

describe('validateAllUsernames', () => {
  it('passes without a lookup when every member is already resolved', async () => {
    const roles = [roleWith('Member', { additionalMembers: [{ address: ALICE, username: 'alice' }] })];

    await expect(validateAllUsernames(roles)).resolves.toEqual({ isValid: true, errors: {} });
    expect(resolveUsernamesAcrossChains).not.toHaveBeenCalled();
  });

  it('names the offending role for an unknown username', async () => {
    resolveUsernamesAcrossChains.mockResolvedValue({ resolved: new Map(), notFound: ['ghost'] });

    const roles = [roleWith('Steward', { additionalWearerUsernames: ['ghost'] })];
    const result = await validateAllUsernames(roles);

    expect(result.isValid).toBe(false);
    expect(result.errors.usernames).toContain('"ghost" (in Steward)');
  });
});
