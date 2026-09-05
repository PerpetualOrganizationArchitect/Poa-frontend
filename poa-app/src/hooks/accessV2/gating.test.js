/**
 * The v2 hooks' stated contract, enforced over their SOURCE.
 *
 * `hooks/accessV2/index.js` promises: "Nothing here puts a v2 query on the wire until the serving
 * endpoint has been probed for CAPABILITY.ACCESS_V2 and the org's authority is router-bound." That
 * promise was false — six hooks skipped on `authority.migrated`, which is already true in the
 * PENDING window (authority deployed, not yet bound) where every v2 surface renders only a banner.
 *
 * There is no React harness in this repo, so the invariant is checked the only way it can be:
 * against the files. Crude, but it fails when someone reintroduces the wrong gate, which is exactly
 * when it matters — a wrong gate is invisible in every other test because it only costs gateway
 * quota and renders nothing.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const sources = readdirSync(HERE)
  .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
  .map((f) => ({ file: f, src: readFileSync(join(HERE, f), 'utf8') }));

/** The hook that DEFINES the gate is allowed to talk about `migrated`; the consumers are not. */
const GATE_OWNER = new Set(['useOrgAuthority.js', 'index.js']);

describe('v2 hooks gate on `enabled` (router-bound), not `migrated`', () => {
  it('finds the hook files at all (guards against a silently empty scan)', () => {
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.some((s) => s.file === 'useAuthoritySubjects.js')).toBe(true);
  });

  it('no consumer hook gates a query on authority.migrated', () => {
    const offenders = sources
      .filter((s) => !GATE_OWNER.has(s.file))
      .filter((s) => /authority\.migrated/.test(s.src))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it('the gate hook itself is gated on the capability probe', () => {
    // useOrgAuthority IS the gate, so it cannot gate on its own output — the cheap authority
    // lookup is allowed once the endpoint has been probed.
    const owner = sources.find((s) => s.file === 'useOrgAuthority.js');
    expect(owner.src).toMatch(/skip:[^\n]*!capable/);
  });

  it('keeps consumers loading until the first capability and authority checks settle', () => {
    const owner = sources.find((s) => s.file === 'useOrgAuthority.js');
    const capabilityHook = sources.find((s) => s.file === 'useSubgraphCapability.js');
    expect(capabilityHook.src).toContain('useSubgraphCapabilityState');
    expect(capabilityHook.src).toMatch(/state\.key === key \? state : initialState/);
    expect(capabilityHook.src).toMatch(/key,\s*supported:\s*Boolean\(ok\),\s*loading:\s*false/);
    expect(owner.src).toContain('capability.loading || (capable ? loading : false)');
  });

  it('every other useQuery in this directory has a skip that consults authority.enabled', () => {
    for (const { file, src } of sources.filter((s) => !GATE_OWNER.has(s.file))) {
      const queries = src.match(/useQuery\([\s\S]*?\}\);/g) || [];
      for (const q of queries) {
        expect(q, `${file}: useQuery without a skip`).toMatch(/skip:/);
        expect(q, `${file}: skip does not consult authority.enabled`).toMatch(/skip:[^\n]*authority\.enabled/);
      }
    }
  });
});

describe('v2 hooks invalidate their indexed view models after writes', () => {
  const sourceOf = (file) => sources.find((s) => s.file === file)?.src || '';

  it('refreshes the shared subject source after a proposal creates or edits a role/group', () => {
    const src = sourceOf('useAuthoritySubjects.js');
    expect(src).toContain('useRefreshSubscription');
    expect(src).toContain('RefreshEvent.PROPOSAL_COMPLETED');
    expect(src).toMatch(/PROPOSAL_COMPLETED[\s\S]*refetch/);
  });

  it('refreshes org-wide and per-user membership projections after access-v2 writes', () => {
    const src = sourceOf('useAuthorityMemberships.js');
    expect(src).toContain('RefreshEvent.ROLE_CLAIMED');
    expect(src).toContain('RefreshEvent.ROLE_RENOUNCED');
    expect(src).toContain('RefreshEvent.MEMBERSHIP_CHANGED');
    expect(src.match(/useRefreshSubscription\(/g)).toHaveLength(2);
  });
});
