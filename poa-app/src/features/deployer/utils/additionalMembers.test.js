/**
 * additionalMembers — the normalizer every additional-member call site reads
 * through. It has to accept the Team step picker's `{ address, username }`
 * entries AND the bare-string entries the legacy free-text editors wrote, or a
 * founder's members silently vanish from the deployed org.
 */

import { describe, it, expect } from 'vitest';

import {
  isAddressLike,
  countGenesisVoters,
  getAdditionalMembers,
  setAdditionalMembers,
  getResolvedMemberAddresses,
  hasUnresolvedMembers,
  memberLabel,
} from './additionalMembers';

const ALICE = '0xAAAAaaaAAAaAAAAaaAaaaAaAaAAaAAaAAAaAAaAa';
const BOB = '0xBbBbbBBbBBbbBBbbbBbBBbbbbbBbBBbbBBBbBbbB';
const DEPLOYER = '0x1111111111111111111111111111111111111111';

const roleWith = (distribution) => ({ name: 'Member', distribution });

describe('isAddressLike', () => {
  it('accepts a 20-byte hex address in any casing', () => {
    expect(isAddressLike(ALICE)).toBe(true);
    expect(isAddressLike(ALICE.toLowerCase())).toBe(true);
    expect(isAddressLike(`  ${ALICE}  `)).toBe(true);
  });

  it('rejects usernames and malformed addresses', () => {
    expect(isAddressLike('hudson')).toBe(false);
    expect(isAddressLike('0x123')).toBe(false);
    expect(isAddressLike(`${ALICE}00`)).toBe(false);
    expect(isAddressLike(null)).toBe(false);
    expect(isAddressLike(undefined)).toBe(false);
  });
});

describe('getAdditionalMembers', () => {
  it('reads picker entries and lowercases the address', () => {
    const role = roleWith({
      additionalMembers: [{ address: ALICE, username: 'alice' }],
    });

    expect(getAdditionalMembers(role)).toEqual([
      { address: ALICE.toLowerCase(), username: 'alice' },
    ]);
  });

  it('reads legacy username strings as unresolved entries', () => {
    const role = roleWith({ additionalWearerUsernames: ['alice', ' bob '] });

    expect(getAdditionalMembers(role)).toEqual([
      { address: null, username: 'alice' },
      { address: null, username: 'bob' },
    ]);
  });

  it('treats a legacy pasted address as already resolved', () => {
    const role = roleWith({ additionalWearerUsernames: [ALICE] });

    expect(getAdditionalMembers(role)).toEqual([
      { address: ALICE.toLowerCase(), username: null },
    ]);
  });

  it('drops blank, malformed and identity-less entries', () => {
    const role = roleWith({
      additionalMembers: [
        '',
        '   ',
        null,
        undefined,
        42,
        { address: '0xnope', username: '   ' },
        { address: ALICE, username: 'alice' },
      ],
    });

    expect(getAdditionalMembers(role)).toEqual([
      { address: ALICE.toLowerCase(), username: 'alice' },
    ]);
  });

  it('keeps an entry whose address is malformed but which still names a user', () => {
    const role = roleWith({
      additionalMembers: [{ address: '0xnope', username: 'alice' }],
    });

    expect(getAdditionalMembers(role)).toEqual([{ address: null, username: 'alice' }]);
  });

  it('prefers a non-empty additionalMembers over the legacy field', () => {
    const role = roleWith({
      additionalMembers: [{ address: ALICE, username: 'alice' }],
      additionalWearerUsernames: ['stale'],
    });

    expect(getAdditionalMembers(role)).toEqual([
      { address: ALICE.toLowerCase(), username: 'alice' },
    ]);
  });

  it('does NOT let an empty additionalMembers shadow legacy entries', () => {
    // createDefaultRole and every template ship `additionalMembers: []`, so a
    // presence check would drop everything the legacy RoleForm wrote.
    const role = roleWith({
      additionalMembers: [],
      additionalWearerUsernames: ['alice'],
    });

    expect(getAdditionalMembers(role)).toEqual([{ address: null, username: 'alice' }]);
  });

  it('returns [] for roles with no distribution at all', () => {
    expect(getAdditionalMembers(undefined)).toEqual([]);
    expect(getAdditionalMembers({})).toEqual([]);
    expect(getAdditionalMembers(roleWith({}))).toEqual([]);
    expect(getAdditionalMembers(roleWith({ additionalMembers: 'nope' }))).toEqual([]);
  });
});

describe('setAdditionalMembers', () => {
  it('clears the legacy field so an emptied picker cannot resurrect it', () => {
    // The read path folded 'alice' into `members`, so the picker's list is the
    // full truth. Leaving the legacy array behind would make "remove everyone"
    // fall back to it and re-add a member the founder just deleted.
    const role = roleWith({
      additionalMembers: [],
      additionalWearerUsernames: ['alice'],
    });

    const migrated = setAdditionalMembers(role, [
      { address: ALICE.toLowerCase(), username: 'alice' },
      { address: BOB.toLowerCase(), username: 'bob' },
    ]);
    expect(migrated.distribution.additionalWearerUsernames).toEqual([]);
    expect(getAdditionalMembers(migrated)).toHaveLength(2);

    const emptied = setAdditionalMembers(migrated, []);
    expect(getAdditionalMembers(emptied)).toEqual([]);
  });

  it('does not mutate the input role', () => {
    const role = roleWith({ additionalMembers: [] });
    const next = setAdditionalMembers(role, [{ address: ALICE.toLowerCase(), username: 'alice' }]);

    expect(role.distribution.additionalMembers).toEqual([]);
    expect(next).not.toBe(role);
    expect(next.distribution).not.toBe(role.distribution);
  });

  it('preserves the rest of distribution', () => {
    const role = roleWith({ mintToDeployer: true, additionalWearers: ['0x1'], additionalMembers: [] });
    const next = setAdditionalMembers(role, []);

    expect(next.distribution.mintToDeployer).toBe(true);
    expect(next.distribution.additionalWearers).toEqual(['0x1']);
  });
});

describe('countGenesisVoters', () => {
  // Over-counting here silently suppresses the "nothing can ever pass" warning,
  // and the voter minimum can only be changed by a proposal that reaches it.
  const votingRole = (distribution) => ({ name: 'Member', canVote: true, distribution });
  const silentRole = (distribution) => ({ name: 'Bot', canVote: false, distribution });

  it('counts the founder plus each distinct member', () => {
    const roles = [
      votingRole({
        mintToDeployer: true,
        additionalMembers: [{ address: ALICE }, { address: BOB }],
      }),
    ];
    expect(countGenesisVoters(roles, DEPLOYER)).toBe(3);
  });

  it('counts the founder once when they are also listed as a member', () => {
    const roles = [
      votingRole({ mintToDeployer: true, additionalMembers: [{ address: DEPLOYER }] }),
    ];
    expect(countGenesisVoters(roles, DEPLOYER)).toBe(1);
  });

  it('matches the founder case-insensitively', () => {
    const roles = [
      votingRole({ mintToDeployer: true, additionalMembers: [{ address: DEPLOYER.toUpperCase().replace('0X', '0x') }] }),
    ];
    expect(countGenesisVoters(roles, DEPLOYER)).toBe(1);
  });

  it('does not count the founder when they hold no voting role', () => {
    const roles = [
      silentRole({ mintToDeployer: true, additionalMembers: [] }),
      votingRole({ mintToDeployer: false, additionalMembers: [{ address: ALICE }] }),
    ];
    expect(countGenesisVoters(roles, DEPLOYER)).toBe(1);
  });

  it('returns 0 when nobody can vote at launch', () => {
    expect(countGenesisVoters([silentRole({ mintToDeployer: true })], DEPLOYER)).toBe(0);
    expect(countGenesisVoters([], DEPLOYER)).toBe(0);
    expect(countGenesisVoters(null, DEPLOYER)).toBe(0);
  });

  it('counts someone on two voting roles once', () => {
    const roles = [
      votingRole({ mintToDeployer: false, additionalMembers: [{ address: ALICE }] }),
      votingRole({ mintToDeployer: false, additionalMembers: [{ address: ALICE }] }),
    ];
    expect(countGenesisVoters(roles, DEPLOYER)).toBe(1);
  });

  it('ignores members on non-voting roles', () => {
    const roles = [
      votingRole({ mintToDeployer: true, additionalMembers: [] }),
      silentRole({ mintToDeployer: false, additionalMembers: [{ address: ALICE }] }),
    ];
    expect(countGenesisVoters(roles, DEPLOYER)).toBe(1);
  });

  it('still counts legacy username-only members', () => {
    // Skipping these would undercount into a spurious deadlock warning.
    const roles = [
      votingRole({ mintToDeployer: true, additionalWearerUsernames: ['alice', 'Alice', 'bob'] }),
    ];
    expect(countGenesisVoters(roles, DEPLOYER)).toBe(3);
  });

  it('falls back to a sentinel when the founder address is unknown', () => {
    const roles = [votingRole({ mintToDeployer: true, additionalMembers: [{ address: ALICE }] })];
    expect(countGenesisVoters(roles, null)).toBe(2);
  });
});

describe('getResolvedMemberAddresses', () => {
  it('returns only entries that already carry an address, de-duped', () => {
    const role = roleWith({
      additionalMembers: [
        { address: ALICE, username: 'alice' },
        { address: ALICE.toLowerCase(), username: 'alice-again' },
        { address: BOB, username: 'bob' },
        { address: null, username: 'carol' },
      ],
    });

    expect(getResolvedMemberAddresses(role)).toEqual([
      ALICE.toLowerCase(),
      BOB.toLowerCase(),
    ]);
  });
});

describe('hasUnresolvedMembers', () => {
  it('is true only when a username-only entry survives normalization', () => {
    expect(hasUnresolvedMembers(roleWith({ additionalMembers: [{ address: ALICE }] }))).toBe(false);
    expect(hasUnresolvedMembers(roleWith({ additionalWearerUsernames: ['alice'] }))).toBe(true);
    expect(hasUnresolvedMembers(roleWith({ additionalMembers: [] }))).toBe(false);
    // Blank strings are dropped, not counted as unresolved.
    expect(hasUnresolvedMembers(roleWith({ additionalWearerUsernames: ['  '] }))).toBe(false);
  });
});

describe('memberLabel', () => {
  it('prefers the username, falls back to a truncated address', () => {
    expect(memberLabel({ address: ALICE.toLowerCase(), username: 'alice' })).toBe('alice');
    expect(memberLabel({ address: ALICE.toLowerCase(), username: null })).toBe('0xaaaa...aAaa'.toLowerCase());
    expect(memberLabel({ address: null, username: null })).toBe('');
    expect(memberLabel(null)).toBe('');
  });
});
