import { describe, it, expect } from 'vitest';
import {
  HATS_NAMESPACE_FLOOR,
  toSubjectBigInt,
  toSubjectId,
  isLegacyAdoptedId,
  isV2NativeId,
  embeddedAuthority,
  localSeq,
  composeSubjectId,
  predictNextSubjectId,
  predictNextSubjectIds,
  hasCompetingSubjectCreation,
} from './ids';

// A real Hats tophat id: uint256(1) << 224.
const TOPHAT = (1n << 224n).toString();
// A real child hat under that tophat.
const CHILD_HAT = ((1n << 224n) | (1n << 208n)).toString();

const AUTH = '0x1111111111111111111111111111111111111111';
const OTHER_AUTH = '0x2222222222222222222222222222222222222222';

describe('toSubjectBigInt / toSubjectId', () => {
  it('accepts decimal strings, hex strings, numbers and bigints', () => {
    expect(toSubjectBigInt('42')).toBe(42n);
    expect(toSubjectBigInt(42)).toBe(42n);
    expect(toSubjectBigInt(42n)).toBe(42n);
    expect(toSubjectBigInt('0x2a')).toBe(42n);
  });

  it('returns null for garbage instead of throwing (subgraph rows must not crash a page)', () => {
    expect(toSubjectBigInt('not-an-id')).toBeNull();
    expect(toSubjectBigInt(null)).toBeNull();
    expect(toSubjectBigInt(undefined)).toBeNull();
    expect(toSubjectBigInt('')).toBeNull();
    expect(toSubjectId('nope')).toBeNull();
  });

  it('never loses precision on a 256-bit id', () => {
    // Number() would round this; BigInt must not.
    expect(toSubjectId(CHILD_HAT)).toBe(CHILD_HAT);
  });
});

describe('namespace classification', () => {
  it('treats every real Hats id as legacy-adopted', () => {
    expect(isLegacyAdoptedId(TOPHAT)).toBe(true);
    expect(isLegacyAdoptedId(CHILD_HAT)).toBe(true);
    expect(HATS_NAMESPACE_FLOOR).toBe(1n << 224n);
  });

  it('treats an embedded-address id below 2^224 as v2-native', () => {
    const id = composeSubjectId(AUTH, 1);
    expect(isV2NativeId(id)).toBe(true);
    expect(isLegacyAdoptedId(id)).toBe(false);
  });

  it('does not treat a small id (no embedded address) as v2-native', () => {
    expect(isV2NativeId('1')).toBe(false);
    expect(isV2NativeId('0')).toBe(false);
    // ...and those are safe-zeros territory: Hats holds nothing below 2^224.
    expect(isLegacyAdoptedId('1')).toBe(false);
  });

  it('the two namespaces are disjoint by construction', () => {
    const v2 = composeSubjectId(AUTH, 999);
    expect(isV2NativeId(v2) && isLegacyAdoptedId(v2)).toBe(false);
    expect(isV2NativeId(CHILD_HAT) && isLegacyAdoptedId(CHILD_HAT)).toBe(false);
  });
});

describe('composeSubjectId / embeddedAuthority / localSeq', () => {
  it('round-trips the authority address and the sequence', () => {
    const id = composeSubjectId(AUTH, 7);
    expect(embeddedAuthority(id)).toBe(AUTH.toLowerCase());
    expect(localSeq(id)).toBe(7n);
  });

  it('is self-routing: two orgs never collide on the same seq', () => {
    expect(composeSubjectId(AUTH, 1)).not.toBe(composeSubjectId(OTHER_AUTH, 1));
  });

  it('rejects a bad authority or seq', () => {
    expect(() => composeSubjectId('nope', 1)).toThrow();
    expect(() => composeSubjectId(AUTH, 0)).toThrow();
  });

  it('returns null authority for a legacy id', () => {
    expect(embeddedAuthority(CHILD_HAT)).toBeNull();
  });
});

describe('predictNextSubjectIds', () => {
  it('starts at seq 1 for an org with only ADOPTED legacy subjects', () => {
    const subjects = [{ subjectId: TOPHAT }, { subjectId: CHILD_HAT }];
    expect(predictNextSubjectId(AUTH, subjects)).toBe(composeSubjectId(AUTH, 1));
  });

  it('continues from the highest existing localSeq, not the subject COUNT', () => {
    // 4 subjects, but only 2 of them consumed the localSeq counter — adopted ids never do.
    const subjects = [
      { subjectId: TOPHAT },
      { subjectId: CHILD_HAT },
      { subjectId: composeSubjectId(AUTH, 1) },
      { subjectId: composeSubjectId(AUTH, 2) },
    ];
    expect(predictNextSubjectId(AUTH, subjects)).toBe(composeSubjectId(AUTH, 3));
  });

  it('ignores ids belonging to a different authority', () => {
    const subjects = [
      { subjectId: composeSubjectId(OTHER_AUTH, 50) },
      { subjectId: composeSubjectId(AUTH, 2) },
    ];
    expect(predictNextSubjectId(AUTH, subjects)).toBe(composeSubjectId(AUTH, 3));
  });

  it('predicts a run of ids in allocation order for a multi-subject batch', () => {
    const subjects = [{ subjectId: composeSubjectId(AUTH, 5) }];
    expect(predictNextSubjectIds(AUTH, subjects, 3)).toEqual([
      composeSubjectId(AUTH, 6),
      composeSubjectId(AUTH, 7),
      composeSubjectId(AUTH, 8),
    ]);
  });

  it('accepts bare id strings as well as row objects', () => {
    expect(predictNextSubjectId(AUTH, [composeSubjectId(AUTH, 9)])).toBe(composeSubjectId(AUTH, 10));
  });

  it('handles an empty org', () => {
    expect(predictNextSubjectId(AUTH, [])).toBe(composeSubjectId(AUTH, 1));
  });
});

describe('hasCompetingSubjectCreation', () => {
  it('flags an unexecuted proposal that would allocate an id (the prediction race)', () => {
    expect(hasCompetingSubjectCreation([{ createsSubject: true, executed: false }])).toBe(true);
  });

  it('ignores executed or expired ones, and proposals that create nothing', () => {
    expect(hasCompetingSubjectCreation([{ createsSubject: true, executed: true }])).toBe(false);
    expect(hasCompetingSubjectCreation([{ createsSubject: true, expired: true }])).toBe(false);
    expect(hasCompetingSubjectCreation([{ createsSubject: false, executed: false }])).toBe(false);
    expect(hasCompetingSubjectCreation([])).toBe(false);
  });
});
