import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WIRING,
  TASK_PERM_BITS,
  buildRoleWiring,
  validateWiring,
  resolveWiring,
} from './wiring';

describe('buildRoleWiring', () => {
  it('maps an empty config to the zero-effect default', () => {
    expect(buildRoleWiring({})).toEqual(DEFAULT_WIRING);
  });

  it('sets setTaskPerm only when globalPerms > 0 and masks to 8 bits', () => {
    const w = buildRoleWiring({ globalPerms: TASK_PERM_BITS.CREATE | TASK_PERM_BITS.REVIEW });
    expect(w.setTaskPerm).toBe(true);
    expect(w.taskPermMask).toBe(5);
  });

  it('treats zero globalPerms as no task perm', () => {
    const w = buildRoleWiring({ globalPerms: 0 });
    expect(w.setTaskPerm).toBe(false);
    expect(w.taskPermMask).toBe(0);
  });

  it('accepts legacy canVote as hvCreator', () => {
    expect(buildRoleWiring({ canVote: true }).hvCreator).toBe(true);
    expect(buildRoleWiring({ hvCreator: true }).hvCreator).toBe(true);
  });

  it('resolves self-vouch to hat id 0 and explicit voucher verbatim', () => {
    const selfV = buildRoleWiring({ vouching: { enabled: true, quorum: 2, selfVouch: true, combineWithHierarchy: true } });
    expect(selfV.vouchMembershipHatId).toBe('0');
    expect(selfV.vouchQuorum).toBe(2);
    const explicit = buildRoleWiring({ vouching: { enabled: true, quorum: 1, voucherHatId: '42', combineWithHierarchy: true } });
    expect(explicit.vouchMembershipHatId).toBe('42');
  });

  it('coerces hvClassIndexes to bytes', () => {
    expect(buildRoleWiring({ hvClassIndexes: [0, 1, 2] }).hvClassIndexes).toEqual([0, 1, 2]);
  });

  it('passes budget through as strings/numbers', () => {
    const w = buildRoleWiring({ budget: { capPerEpoch: '1000000', epochLen: 86400 } });
    expect(w.budgetCapPerEpoch).toBe('1000000');
    expect(w.budgetEpochLen).toBe(86400);
  });
});

describe('validateWiring — mirrors contract WiringIncompatible guards', () => {
  const withVouch = (over) => buildRoleWiring({ vouching: { enabled: true, quorum: 1, combineWithHierarchy: true, ...over } });

  it('accepts a valid vouching config (combine on, quorum>=1)', () => {
    expect(validateWiring(withVouch())).toBeNull();
  });

  it('rejects vouching with combine off', () => {
    expect(validateWiring(withVouch({ combineWithHierarchy: false }))).toMatch(/combine/i);
  });

  it('rejects vouching with quorum 0', () => {
    const w = buildRoleWiring({ vouching: { enabled: true, quorum: 0, combineWithHierarchy: true } });
    expect(validateWiring(w)).toMatch(/quorum/i);
  });

  it('rejects vouching on a group marker', () => {
    expect(validateWiring(withVouch(), { isGroupMarker: true })).toMatch(/group/i);
  });

  it('rejects quickJoinAutoMint on a non-default-eligible (new) role', () => {
    const w = buildRoleWiring({ quickJoinAutoMint: true });
    expect(validateWiring(w, { defaultEligible: false })).toMatch(/auto-mint/i);
  });

  it('allows quickJoinAutoMint on a default-eligible hat', () => {
    const w = buildRoleWiring({ quickJoinAutoMint: true });
    expect(validateWiring(w, { defaultEligible: true })).toBeNull();
  });

  it('rejects a budget with only one of cap/len set', () => {
    const capOnly = buildRoleWiring({ budget: { capPerEpoch: '100', epochLen: 0 } });
    expect(validateWiring(capOnly)).toMatch(/budget/i);
    const lenOnly = buildRoleWiring({ budget: { capPerEpoch: '0', epochLen: 100 } });
    expect(validateWiring(lenOnly)).toMatch(/budget/i);
  });

  it('accepts a fully-off wiring', () => {
    expect(validateWiring(DEFAULT_WIRING)).toBeNull();
  });
});

describe('resolveWiring', () => {
  it('returns both the wiring and a null error for valid config', () => {
    const { wiring, error } = resolveWiring({ globalPerms: 1 });
    expect(error).toBeNull();
    expect(wiring.setTaskPerm).toBe(true);
  });

  it('surfaces the guard error for invalid config', () => {
    const { error } = resolveWiring(
      { vouching: { enabled: true, quorum: 1, combineWithHierarchy: false } },
    );
    expect(error).toMatch(/combine/i);
  });
});
