import { describe, it, expect } from 'vitest';
import {
  isExecutable,
  effectiveQuorum,
  validateProposalV2Config,
  needsV2,
  buildRestrictionPresets,
} from './proposalV2';

describe('isExecutable', () => {
  it('is true when any option batch is non-empty', () => {
    expect(isExecutable([[], [{ target: '0x1' }]])).toBe(true);
  });
  it('is false when all batches are empty (signal poll)', () => {
    expect(isExecutable([[], []])).toBe(false);
    expect(isExecutable([])).toBe(false);
  });
});

describe('effectiveQuorum', () => {
  it('returns global when no override', () => {
    expect(effectiveQuorum(10, 0, true)).toBe(10);
  });
  it('executable → max(global, override) (can only raise)', () => {
    expect(effectiveQuorum(10, 5, true)).toBe(10);
    expect(effectiveQuorum(10, 20, true)).toBe(20);
  });
  it('signal poll → override replaces (may lower)', () => {
    expect(effectiveQuorum(10, 3, false)).toBe(3);
  });
});

describe('validateProposalV2Config', () => {
  it('rejects a quorum override on an unrestricted proposal', () => {
    expect(validateProposalV2Config({ isRestricted: false, quorumOverride: 5 })).toMatch(/restricted/i);
  });
  it('rejects equalWeight on an unrestricted proposal', () => {
    expect(validateProposalV2Config({ isRestricted: false, equalWeight: true, isHybrid: true })).toMatch(/restricted/i);
  });
  it('allows override + equalWeight on a restricted hybrid proposal', () => {
    expect(validateProposalV2Config({ isRestricted: true, quorumOverride: 5, equalWeight: true, isHybrid: true })).toBeNull();
  });
  it('rejects equalWeight for non-hybrid (DD)', () => {
    expect(validateProposalV2Config({ isRestricted: true, equalWeight: true, isHybrid: false })).toMatch(/blended|hybrid/i);
  });
  it('rejects an out-of-range override', () => {
    expect(validateProposalV2Config({ isRestricted: true, quorumOverride: 2 ** 33 })).toMatch(/range/i);
  });
  it('allows a plain restricted proposal with no override', () => {
    expect(validateProposalV2Config({ isRestricted: true })).toBeNull();
  });
});

describe('needsV2', () => {
  it('is true when override or equalWeight set', () => {
    expect(needsV2({ quorumOverride: 3 })).toBe(true);
    expect(needsV2({ equalWeight: true })).toBe(true);
  });
  it('is false for a plain proposal', () => {
    expect(needsV2({})).toBe(false);
    expect(needsV2({ quorumOverride: 0, equalWeight: false })).toBe(false);
  });
});

describe('buildRestrictionPresets', () => {
  it('turns each group into a single-marker-hat preset', () => {
    const presets = buildRestrictionPresets([
      { groupId: '1', name: 'Executives', markerHatId: '99' },
      { groupId: '2', name: 'Council', markerHatId: '100' },
    ]);
    expect(presets).toEqual([
      { id: 'group-1', label: 'Only Executives', hatIds: ['99'] },
      { id: 'group-2', label: 'Only Council', hatIds: ['100'] },
    ]);
  });
  it('skips groups with no marker hat', () => {
    expect(buildRestrictionPresets([{ groupId: '1', name: 'X' }])).toEqual([]);
  });
});
