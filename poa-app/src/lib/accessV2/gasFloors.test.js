import { describe, it, expect } from 'vitest';
import {
  recordGasFloor,
  readGasFloor,
  clearGasFloor,
  pruneGasFloors,
  gasFloorKey,
  gasFloorOptions,
  GAS_FLOOR_TTL_MS,
  MAX_GAS_FLOOR,
} from './gasFloors';

/** A localStorage-shaped store backed by a Map, so nothing here needs a browser. */
function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

const VOTING = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('gasFloorKey', () => {
  it('is case-insensitive on the address, so a checksummed write reads back from a lowercase read', () => {
    expect(gasFloorKey(VOTING, '7')).toBe(gasFloorKey(VOTING.toLowerCase(), 7));
  });

  it('refuses a half-identified proposal rather than colliding every proposal onto one key', () => {
    expect(gasFloorKey('', '7')).toBeNull();
    expect(gasFloorKey(VOTING, '')).toBeNull();
    expect(gasFloorKey(VOTING, null)).toBeNull();
  });

  it('treats proposal id 0 as a real id (it is a valid on-chain id)', () => {
    expect(gasFloorKey(VOTING, 0)).toBe(`${VOTING.toLowerCase()}:0`);
  });
});

describe('recordGasFloor / readGasFloor', () => {
  it('round-trips the floor the builder computed', () => {
    const store = memoryStore();
    expect(recordGasFloor(VOTING, '12', 1_650_000, { store })).toBe(true);
    expect(readGasFloor(VOTING, '12', { store })).toBe(1_650_000);
  });

  it('reads back for a DIFFERENT session — the write survives in the store, not in a closure', () => {
    const store = memoryStore();
    recordGasFloor(VOTING, '12', 900_000, { store });
    // A fresh module-level read with only the store shared, i.e. the finalize page.
    expect(readGasFloor(VOTING.toLowerCase(), 12, { store })).toBe(900_000);
  });

  it('returns null for a proposal created on another device (no entry)', () => {
    expect(readGasFloor(VOTING, '99', { store: memoryStore() })).toBeNull();
  });

  it('ignores a non-positive or non-finite floor instead of parking a bricking value', () => {
    const store = memoryStore();
    expect(recordGasFloor(VOTING, '1', 0, { store })).toBe(false);
    expect(recordGasFloor(VOTING, '1', -5, { store })).toBe(false);
    expect(recordGasFloor(VOTING, '1', NaN, { store })).toBe(false);
    expect(recordGasFloor(VOTING, '1', undefined, { store })).toBe(false);
    expect(readGasFloor(VOTING, '1', { store })).toBeNull();
  });

  it('caps an absurd floor at MAX_GAS_FLOOR on the way in AND on the way out', () => {
    const store = memoryStore();
    recordGasFloor(VOTING, '1', 900_000_000, { store });
    expect(readGasFloor(VOTING, '1', { store })).toBe(MAX_GAS_FLOOR);

    // Hand-corrupted storage (a user edited it, or an older format) is capped on read too.
    const tampered = memoryStore({
      'poa:accessV2:announceWinnerGasFloors': JSON.stringify({
        [`${VOTING.toLowerCase()}:2`]: { gas: 999_999_999, at: Date.now() },
      }),
    });
    expect(readGasFloor(VOTING, '2', { store: tampered })).toBe(MAX_GAS_FLOOR);
  });

  it('survives corrupt JSON in storage rather than throwing into the submit path', () => {
    const store = memoryStore({ 'poa:accessV2:announceWinnerGasFloors': 'not json{' });
    expect(readGasFloor(VOTING, '1', { store })).toBeNull();
    expect(recordGasFloor(VOTING, '1', 500_000, { store })).toBe(true);
    expect(readGasFloor(VOTING, '1', { store })).toBe(500_000);
  });

  it('never throws when the store itself is hostile (quota / blocked storage)', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(() => recordGasFloor(VOTING, '1', 500_000, { store: blocked })).not.toThrow();
    expect(readGasFloor(VOTING, '1', { store: blocked })).toBeNull();
    expect(() => clearGasFloor(VOTING, '1', { store: blocked })).not.toThrow();
  });

  it('keeps floors for several proposals side by side', () => {
    const store = memoryStore();
    recordGasFloor(VOTING, '1', 400_000, { store });
    recordGasFloor(VOTING, '2', 1_200_000, { store });
    expect(readGasFloor(VOTING, '1', { store })).toBe(400_000);
    expect(readGasFloor(VOTING, '2', { store })).toBe(1_200_000);
  });
});

describe('TTL', () => {
  const t0 = 1_700_000_000_000;

  it('drops an entry past the TTL', () => {
    const store = memoryStore();
    recordGasFloor(VOTING, '1', 700_000, { store, now: t0 });
    expect(readGasFloor(VOTING, '1', { store, now: t0 + GAS_FLOOR_TTL_MS - 1 })).toBe(700_000);
    expect(readGasFloor(VOTING, '1', { store, now: t0 + GAS_FLOOR_TTL_MS + 1 })).toBeNull();
  });

  it('pruneGasFloors drops expired and malformed rows and keeps live ones', () => {
    const pruned = pruneGasFloors({
      live: { gas: 100, at: t0 },
      stale: { gas: 100, at: t0 - GAS_FLOOR_TTL_MS - 1 },
      malformed: { at: t0 },
      nullish: null,
    }, t0);
    expect(Object.keys(pruned)).toEqual(['live']);
  });
});

describe('clearGasFloor', () => {
  it('forgets a spent floor', () => {
    const store = memoryStore();
    recordGasFloor(VOTING, '1', 700_000, { store });
    clearGasFloor(VOTING, '1', { store });
    expect(readGasFloor(VOTING, '1', { store })).toBeNull();
  });

  it('leaves other proposals alone', () => {
    const store = memoryStore();
    recordGasFloor(VOTING, '1', 700_000, { store });
    recordGasFloor(VOTING, '2', 800_000, { store });
    clearGasFloor(VOTING, '1', { store });
    expect(readGasFloor(VOTING, '2', { store })).toBe(800_000);
  });

  it('is a no-op for an unknown key', () => {
    const store = memoryStore();
    expect(() => clearGasFloor(VOTING, '404', { store })).not.toThrow();
  });
});

describe('gasFloorOptions', () => {
  it('emits BOTH transaction-manager channels — the EOA path and the 4337 path', () => {
    // This is the load-bearing assertion: `gasLimit` is what core/TransactionManager reads
    // (as a floor over its buffered estimate) and `callGasLimitFloor` is what
    // SmartAccountTransactionManager forwards to the userOp builder. Dropping either one
    // silently restores the bug for half the users.
    expect(gasFloorOptions(1_650_000)).toEqual({
      gasLimit: 1_650_000,
      callGasLimitFloor: 1_650_000,
    });
  });

  it('does NOT use `callGasLimit`, which would REPLACE the announceWinner Hats multiplier', () => {
    expect(gasFloorOptions(1_650_000)).not.toHaveProperty('callGasLimit');
  });

  it('is an empty object with no floor, so spreading it changes nothing', () => {
    expect(gasFloorOptions(null)).toEqual({});
    expect(gasFloorOptions(undefined)).toEqual({});
    expect(gasFloorOptions(0)).toEqual({});
    expect(gasFloorOptions(NaN)).toEqual({});
    expect(gasFloorOptions(-1)).toEqual({});
  });

  it('caps at MAX_GAS_FLOOR', () => {
    expect(gasFloorOptions(10 * MAX_GAS_FLOOR)).toEqual({
      gasLimit: MAX_GAS_FLOOR,
      callGasLimitFloor: MAX_GAS_FLOOR,
    });
  });
});
