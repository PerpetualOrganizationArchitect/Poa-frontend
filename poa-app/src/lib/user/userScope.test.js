import { describe, expect, it } from 'vitest';
import {
  buildUserScope,
  deriveUserDataLoading,
  isDataForScope,
  isUserStateCurrent,
} from './userScope';

const ORG = '0x1111111111111111111111111111111111111111';
const ALICE = '0xa6f4d9f44dd980b7168d829d5f74c2b00a46b2c9';
const BOB = '0xb0b0000000000000000000000000000000000b0b';

const scope = (org, addr) => `${org}-${addr}`;

describe('buildUserScope', () => {
  it('lowercases the address and needs both halves', () => {
    expect(buildUserScope(ORG, ALICE.toUpperCase())).toBe(scope(ORG, ALICE));
    expect(buildUserScope(ORG, null)).toBeNull();
    expect(buildUserScope(null, ALICE)).toBeNull();
    expect(buildUserScope(undefined, undefined)).toBeNull();
  });
});

describe('isDataForScope', () => {
  const data = { account: { id: ALICE }, user: { id: scope(ORG, ALICE) } };

  it('accepts a result whose ids match the active scope', () => {
    expect(isDataForScope({ data, account: ALICE, orgUserID: scope(ORG, ALICE) })).toBe(true);
  });

  it('rejects the previous account after a switch', () => {
    // Apollo keeps returning the old `data` for a render or two after the
    // variables change — that is Bob briefly seeing Alice's roles.
    expect(isDataForScope({ data, account: BOB, orgUserID: scope(ORG, BOB) })).toBe(false);
  });

  it('rejects retained data once the account is gone', () => {
    // `skip: true` does not clear Apollo's last result.
    expect(isDataForScope({ data, account: null, orgUserID: null })).toBe(false);
    expect(isDataForScope({ data, account: ALICE, orgUserID: null })).toBe(false);
  });

  it('rejects a result for the same address in a different org', () => {
    const otherOrg = '0x2222222222222222222222222222222222222222';
    expect(isDataForScope({ data, account: ALICE, orgUserID: scope(otherOrg, ALICE) })).toBe(false);
  });

  it('compares ids case-insensitively', () => {
    const checksummed = {
      account: { id: ALICE.toUpperCase() },
      user: { id: scope(ORG, ALICE).toUpperCase() },
    };
    expect(isDataForScope({ data: checksummed, account: ALICE, orgUserID: scope(ORG, ALICE) }))
      .toBe(true);
  });

  it('accepts a result for a member the subgraph has no user entity for yet', () => {
    // A brand-new account resolves `account` but not `user`; that is a real
    // "not a member here" answer, not stale data.
    expect(isDataForScope({
      data: { account: { id: ALICE }, user: null },
      account: ALICE,
      orgUserID: scope(ORG, ALICE),
    })).toBe(true);
  });

  it('rejects a missing result', () => {
    expect(isDataForScope({ data: null, account: ALICE, orgUserID: scope(ORG, ALICE) })).toBe(false);
  });
});

describe('isUserStateCurrent', () => {
  it('is true only for state resolved against the exact active scope', () => {
    const orgUserID = scope(ORG, ALICE);
    expect(isUserStateCurrent({ account: ALICE, orgUserID, resolvedUserScope: orgUserID }))
      .toBe(true);
    expect(isUserStateCurrent({ account: ALICE, orgUserID, resolvedUserScope: scope(ORG, BOB) }))
      .toBe(false);
    expect(isUserStateCurrent({ account: ALICE, orgUserID, resolvedUserScope: null }))
      .toBe(false);
  });

  it('is false after a disconnect even if the old scope is still recorded', () => {
    const orgUserID = scope(ORG, ALICE);
    expect(isUserStateCurrent({ account: null, orgUserID: null, resolvedUserScope: orgUserID }))
      .toBe(false);
  });

  it('is false before the org id resolves', () => {
    expect(isUserStateCurrent({ account: ALICE, orgUserID: null, resolvedUserScope: null }))
      .toBe(false);
  });
});

describe('deriveUserDataLoading', () => {
  const orgUserID = scope(ORG, ALICE);

  it('never leaves a logged-out visitor loading forever', () => {
    // The Profile Hub gates its spinner on this flag; a flag that can never
    // settle is an infinite loader.
    expect(deriveUserDataLoading({
      account: null,
      orgUserID: null,
      resolvedUserScope: null,
      queryLoading: true,
    })).toBe(false);
  });

  it('is loading while the org id has not resolved yet', () => {
    expect(deriveUserDataLoading({
      account: ALICE,
      orgUserID: null,
      resolvedUserScope: null,
      queryLoading: false,
    })).toBe(true);
  });

  it('is loading while nothing has been resolved for the active scope', () => {
    expect(deriveUserDataLoading({
      account: ALICE,
      orgUserID,
      resolvedUserScope: null,
      queryLoading: false,
    })).toBe(true);
  });

  it('is loading again immediately after an account switch', () => {
    expect(deriveUserDataLoading({
      account: BOB,
      orgUserID: scope(ORG, BOB),
      resolvedUserScope: orgUserID,
      queryLoading: false,
    })).toBe(true);
  });

  it('settles once the active scope has resolved', () => {
    expect(deriveUserDataLoading({
      account: ALICE,
      orgUserID,
      resolvedUserScope: orgUserID,
      queryLoading: false,
    })).toBe(false);
  });

  it('settles on a query error, because the error path records the scope', () => {
    // UserContext marks the scope resolved when the query errors; without that
    // the hub spins forever on a subgraph blip.
    expect(deriveUserDataLoading({
      account: ALICE,
      orgUserID,
      resolvedUserScope: orgUserID,
      queryLoading: false,
    })).toBe(false);
  });
});
