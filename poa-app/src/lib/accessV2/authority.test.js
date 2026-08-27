import { describe, it, expect } from 'vitest';
import {
  classifyAuthority,
  authorityStatusCopy,
  moduleUsesAuthority,
  AUTHORITY_STATE,
} from './authority';
import { authorityNode, AUTHORITY_ADDRESS, EXECUTOR_ADDRESS } from './fixtures';

describe('classifyAuthority — the legacy org must be untouched', () => {
  it('an org with NO authority is legacy', () => {
    const a = classifyAuthority(null);
    expect(a.state).toBe(AUTHORITY_STATE.LEGACY);
    expect(a.enabled).toBe(false);
    expect(a.migrated).toBe(false);
    expect(a.address).toBeNull();
    expect(a.reason).toBe('no-authority');
  });

  it('an org on an endpoint that has not been republished is legacy, even if it HAS an authority', () => {
    // The app reads the decentralised gateway; new fields exist only after the Wave-E publish.
    const a = classifyAuthority(authorityNode(), { capable: false });
    expect(a.enabled).toBe(false);
    expect(a.migrated).toBe(false);
    expect(a.reason).toBe('subgraph-not-published');
  });

  it('a deployed-but-unbound authority is PENDING, not active', () => {
    const a = classifyAuthority(authorityNode({ isRouterBound: false, cutoverAt: null }));
    expect(a.state).toBe(AUTHORITY_STATE.PENDING);
    expect(a.enabled).toBe(false);
    expect(a.migrated).toBe(true);
    expect(a.address).toBe(AUTHORITY_ADDRESS.toLowerCase());
    expect(a.reason).toBe('not-cut-over');
  });

  it('a router-bound authority is ACTIVE', () => {
    const a = classifyAuthority(authorityNode());
    expect(a.state).toBe(AUTHORITY_STATE.ACTIVE);
    expect(a.enabled).toBe(true);
    expect(a.executor).toBe(EXECUTOR_ADDRESS.toLowerCase());
    expect(a.roleCount).toBe(2);
    expect(a.groupCount).toBe(1);
    expect(a.cutoverAt).toBe(1750000000);
  });

  it('an authority node with no id cannot enable anything', () => {
    expect(classifyAuthority({ isRouterBound: true }).enabled).toBe(false);
  });
});

describe('authorityStatusCopy', () => {
  it('says nothing on a legacy org', () => {
    expect(authorityStatusCopy(classifyAuthority(null))).toBeNull();
  });

  it('explains the pre-cutover window without alarming members', () => {
    const copy = authorityStatusCopy(classifyAuthority(authorityNode({ isRouterBound: false })));
    expect(copy.tone).toBe('info');
    expect(copy.body).toMatch(/Nothing has changed for members/);
  });

  it('says READS still work while writes are paused', () => {
    const copy = authorityStatusCopy(classifyAuthority(authorityNode({ paused: true })));
    expect(copy.tone).toBe('warning');
    expect(copy.body).toMatch(/still be viewed/);
  });

  it('is silent on a healthy live org', () => {
    expect(authorityStatusCopy(classifyAuthority(authorityNode()))).toBeNull();
  });
});

describe('moduleUsesAuthority — membershipAuthority() == 0 means LEGACY', () => {
  it('treats zero, the zero address and nullish as legacy', () => {
    expect(moduleUsesAuthority(null)).toBe(false);
    expect(moduleUsesAuthority(undefined)).toBe(false);
    expect(moduleUsesAuthority('')).toBe(false);
    expect(moduleUsesAuthority(`0x${'0'.repeat(40)}`)).toBe(false);
    expect(moduleUsesAuthority('0')).toBe(false);
  });

  it('treats a real address as v2', () => {
    expect(moduleUsesAuthority(AUTHORITY_ADDRESS)).toBe(true);
    expect(moduleUsesAuthority(AUTHORITY_ADDRESS.toUpperCase())).toBe(true);
  });
});
