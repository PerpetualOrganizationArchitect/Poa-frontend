import { describe, it, expect } from 'vitest';
import {
  PERM_KEYS,
  FOLD_TAG,
  derivePermKey,
  foldTag,
  foldTagLabel,
  permKeyName,
  encodePermWord,
  decodePermWord,
  boolPermWord,
  maskPermWord,
  resolvePermCtx,
  taskPermLabels,
  isGlobalCtx,
  GLOBAL_CTX,
  EXISTS_BIT,
  INHERIT_GLOBAL_BIT,
  VALUE_MASK,
  PERM_CATALOGUE,
} from './permKeys';

// INDEPENDENTLY COMPUTED against the Solidity constants in
// contracts/src/libs/AccessV2PermKeys.sol — `(tag << 248) | (keccak256(label) >> 8)`,
// with the keccak digests taken from `cast keccak`, NOT from this module's own derivation.
const EXPECTED = {
  DD_VOTE: '0x00d2ccbeefc4233e480c89e84be328b119863efcb2c62fef63721ac7dffbc752',
  TM_PERMS: '0x01d1007359947de61bae5632c8492d9be17185b0568f9935575dff632664271e',
  SUBJECT_RENAME: '0x0090df957fa3a6c9ad901e3459f40d2ffd56378cf6baa00b79c9f1c219f35f69',
};

describe('perm key derivation matches the Solidity constants', () => {
  it('DD_VOTE (bool-any tag 0x00)', () => {
    expect(PERM_KEYS.DD_VOTE).toBe(EXPECTED.DD_VOTE);
  });

  it('TM_PERMS (OR-mask tag 0x01)', () => {
    expect(PERM_KEYS.TM_PERMS).toBe(EXPECTED.TM_PERMS);
  });

  it('SUBJECT_RENAME', () => {
    expect(PERM_KEYS.SUBJECT_RENAME).toBe(EXPECTED.SUBJECT_RENAME);
  });

  it('every key is a 32-byte hex string', () => {
    for (const key of Object.values(PERM_KEYS)) {
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it('keys are pairwise distinct', () => {
    const all = Object.values(PERM_KEYS);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('fold tags live in the key top byte', () => {
  it('reads the tag back off the key', () => {
    expect(foldTag(PERM_KEYS.DD_VOTE)).toBe(FOLD_TAG.BOOL_ANY);
    expect(foldTag(PERM_KEYS.TM_PERMS)).toBe(FOLD_TAG.OR_MASK);
    expect(foldTagLabel(PERM_KEYS.TM_PERMS)).toBe('or-mask');
  });

  it('a brand-new key needs no contract change — only a constant', () => {
    const future = derivePermKey(FOLD_TAG.OR_MASK, 'poa.perm.future.thing');
    expect(foldTag(future)).toBe(FOLD_TAG.OR_MASK);
    expect(future).toMatch(/^0x01/);
  });

  it('names a known key and returns null for an unknown one', () => {
    expect(permKeyName(PERM_KEYS.DD_VOTE)).toBe('DD_VOTE');
    expect(permKeyName(PERM_KEYS.DD_VOTE.toUpperCase())).toBe('DD_VOTE');
    expect(permKeyName('0xdead')).toBeNull();
  });
});

describe('perm word packing', () => {
  it('packs and unpacks exists / inheritGlobal / value', () => {
    const word = encodePermWord({ value: 5n, inheritGlobal: true });
    const d = decodePermWord(word);
    expect(d.exists).toBe(true);
    expect(d.inheritGlobal).toBe(true);
    expect(d.value).toBe('5');
    expect(d.enabled).toBe(true);
  });

  it('a zero word is "no row", not "granted false"', () => {
    const d = decodePermWord('0');
    expect(d.exists).toBe(false);
    expect(d.enabled).toBe(false);
  });

  it('an exists row with value 0 is present but not enabled', () => {
    const d = decodePermWord(encodePermWord({ value: 0n }));
    expect(d.exists).toBe(true);
    expect(d.enabled).toBe(false);
  });

  it('uses the documented bit positions', () => {
    expect(EXISTS_BIT).toBe(1n << 255n);
    expect(INHERIT_GLOBAL_BIT).toBe(1n << 254n);
    expect(VALUE_MASK).toBe((1n << 254n) - 1n);
    expect(BigInt(boolPermWord(true))).toBe(EXISTS_BIT | 1n);
  });

  it('rejects a value that would collide with the flag bits', () => {
    expect(() => encodePermWord({ value: VALUE_MASK + 1n })).toThrow();
  });

  it('never throws on a garbage word', () => {
    expect(decodePermWord('banana').exists).toBe(false);
    expect(decodePermWord(undefined).exists).toBe(false);
  });

  it('maskPermWord inherits the global row by default (the un-shadowing default)', () => {
    expect(decodePermWord(maskPermWord(6)).inheritGlobal).toBe(true);
    expect(decodePermWord(maskPermWord(6, { inheritGlobal: false })).inheritGlobal).toBe(false);
  });
});

describe('ctx resolution replays the contract fold', () => {
  const global = decodePermWord(maskPermWord(1)); // CREATE
  const project = decodePermWord(maskPermWord(4)); // REVIEW
  const projectNoInherit = decodePermWord(maskPermWord(4, { inheritGlobal: false }));

  it('a subject with ONLY a global row contributes at every project ctx', () => {
    const r = resolvePermCtx(PERM_KEYS.TM_PERMS, global, null);
    expect(r).toEqual({ value: '1', source: 'global' });
  });

  it('an inherit=true project row ORs with global (the un-shadowing case)', () => {
    const r = resolvePermCtx(PERM_KEYS.TM_PERMS, global, project);
    expect(r).toEqual({ value: '5', source: 'combined' });
  });

  it('an inherit=false project row REPLACES global (the deliberate exclusion)', () => {
    const r = resolvePermCtx(PERM_KEYS.TM_PERMS, global, projectNoInherit);
    expect(r).toEqual({ value: '4', source: 'project' });
  });

  it('bool-any keys fold with logical-any, not OR arithmetic', () => {
    const g = decodePermWord(boolPermWord(true));
    const p = decodePermWord(encodePermWord({ value: 0n, inheritGlobal: true }));
    // The project row itself says "no", but it inherits — so the global YES still wins.
    expect(resolvePermCtx(PERM_KEYS.DD_VOTE, g, p)).toEqual({ value: '1', source: 'combined' });
    // ...and without inheritance the project row is authoritative.
    const pNoInherit = decodePermWord(encodePermWord({ value: 0n, inheritGlobal: false }));
    expect(resolvePermCtx(PERM_KEYS.DD_VOTE, g, pNoInherit)).toEqual({ value: '0', source: 'project' });
  });

  it('no rows at all resolves to nothing', () => {
    expect(resolvePermCtx(PERM_KEYS.TM_PERMS, null, null)).toEqual({ value: '0', source: 'none' });
  });
});

describe('misc', () => {
  it('decodes a TaskManager mask into bit names', () => {
    expect(taskPermLabels(5)).toEqual(['CREATE', 'REVIEW']);
    expect(taskPermLabels(0)).toEqual([]);
  });

  it('bytes32(0) is the global ctx', () => {
    expect(isGlobalCtx(GLOBAL_CTX)).toBe(true);
    expect(isGlobalCtx(undefined)).toBe(true);
    expect(isGlobalCtx('0x01')).toBe(false);
  });

  it('every catalogue entry points at a real protocol key', () => {
    const known = new Set(Object.values(PERM_KEYS));
    for (const entry of PERM_CATALOGUE) {
      expect(known.has(entry.key)).toBe(true);
      expect(PERM_KEYS[entry.id]).toBe(entry.key);
      expect(entry.label && entry.help).toBeTruthy();
    }
  });
});
