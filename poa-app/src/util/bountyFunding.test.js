import { describe, it, expect } from 'vitest';
import { committedBountiesByToken, bountyShortfall } from './bountyFunding';

const BREAD = '0xA555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3';
const USDC = '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83';

describe('committedBountiesByToken', () => {
  it('sums bounty payouts per token across projects, keyed lowercase', () => {
    const projects = [
      { bountyTasks: [
        { bountyToken: BREAD, bountyPayout: '20000000000000000000' },
        { bountyToken: BREAD.toLowerCase(), bountyPayout: '100000000000000000000' },
      ] },
      { bountyTasks: [
        { bountyToken: USDC, bountyPayout: '5000000' },
      ] },
    ];
    expect(committedBountiesByToken(projects)).toEqual({
      [BREAD.toLowerCase()]: '120000000000000000000',
      [USDC]: '5000000',
    });
  });

  it('ignores zero-address tokens, zero payouts and malformed amounts', () => {
    const projects = [
      { bountyTasks: [
        { bountyToken: '0x0000000000000000000000000000000000000000', bountyPayout: '5' },
        { bountyToken: BREAD, bountyPayout: '0' },
        { bountyToken: BREAD, bountyPayout: 'not-a-number' },
        { bountyToken: null, bountyPayout: '5' },
      ] },
    ];
    expect(committedBountiesByToken(projects)).toEqual({});
  });

  it('handles missing projects, missing bountyTasks and empty input', () => {
    expect(committedBountiesByToken()).toEqual({});
    expect(committedBountiesByToken([null, {}, { bountyTasks: null }])).toEqual({});
  });
});

describe('bountyShortfall', () => {
  it('returns committed minus balance when underfunded', () => {
    expect(bountyShortfall('100000000000000000000', '280000000000000000000'))
      .toBe('180000000000000000000');
  });

  it('returns 0 when the pool covers everything (or over-covers)', () => {
    expect(bountyShortfall('280000000000000000000', '280000000000000000000')).toBe('0');
    expect(bountyShortfall('300000000000000000000', '280000000000000000000')).toBe('0');
  });

  it('treats missing or malformed values as zero', () => {
    expect(bountyShortfall(undefined, '5')).toBe('5');
    expect(bountyShortfall('junk', '5')).toBe('5');
    expect(bountyShortfall('5', undefined)).toBe('0');
  });
});
