/**
 * FEATURE-DETECTION SUITE — the guarantee this whole branch rests on.
 *
 * Access v2 rolls out org by org, on endpoints that lag the schema by a manual gateway publish.
 * Two failure modes would be shipped bugs, so both are pinned here:
 *
 *   1. A LEGACY org must be completely untouched. `enabled` false, no v2 query on the wire, no
 *      banner, no panels.
 *   2. A MIGRATED org on a NOT-YET-REPUBLISHED endpoint must also read as legacy. One unknown
 *      field fails the whole GraphQL document, so "the schema file has it" is never evidence.
 *
 * The capability requirements are checked field-by-field against a schema map shaped exactly like
 * the introspection result, because a PARTIAL deployment is the realistic failure and it must read
 * as "absent", not "half working".
 */

import { describe, it, expect } from 'vitest';
import { satisfies, buildIntrospectionQuery, CAPABILITY } from '@/util/subgraphCapabilities';
import { classifyAuthority, authorityStatusCopy, AUTHORITY_STATE } from './authority';
import { authorityNode } from './fixtures';

/** A schema map shaped like `introspect()` returns: type -> Set(fieldNames) | null. */
const typeMap = (entries) =>
  new Map(Object.entries(entries).map(([k, v]) => [k, v === null ? null : new Set(v)]));

/** Exactly the fields CAPABILITY.ACCESS_V2 requires, and nothing more. */
const V2_SCHEMA = () => {
  const map = {};
  for (const { type, field } of CAPABILITY.ACCESS_V2.require) {
    map[type] = map[type] || [];
    if (field) map[type].push(field);
  }
  return typeMap(map);
};

describe('CAPABILITY.ACCESS_V2 — the endpoint half of the gate', () => {
  it('passes on an endpoint that serves every field the v2 documents select', () => {
    expect(satisfies(V2_SCHEMA(), CAPABILITY.ACCESS_V2.require)).toBe(true);
  });

  it('fails on the PRE-PUBLISH endpoint — no v2 entities at all', () => {
    const legacySchema = typeMap({
      Organization: ['id', 'name', 'topHatId', 'roleHatIds', 'eligibilityModule'],
      Role: ['id', 'hatId', 'name'],
    });
    expect(satisfies(legacySchema, CAPABILITY.ACCESS_V2.require)).toBe(false);
  });

  it('fails when the Organization link alone is missing — the entry point of every v2 query', () => {
    const schema = V2_SCHEMA();
    schema.set('Organization', new Set([]));
    expect(satisfies(schema, CAPABILITY.ACCESS_V2.require)).toBe(false);
  });

  it('a PARTIAL deployment reads as absent — every single required field flips it false', () => {
    for (const req of CAPABILITY.ACCESS_V2.require) {
      const schema = V2_SCHEMA();
      if (req.field) {
        const fields = new Set(schema.get(req.type));
        fields.delete(req.field);
        schema.set(req.type, fields);
      } else {
        schema.set(req.type, null);
      }
      expect(
        satisfies(schema, CAPABILITY.ACCESS_V2.require),
        `missing ${req.type}.${req.field || '(entity)'} should read as absent`
      ).toBe(false);
    }
  });

  it('names every entity the v2 documents touch', () => {
    const types = new Set(CAPABILITY.ACCESS_V2.require.map((r) => r.type));
    for (const t of [
      'Organization',
      'MembershipAuthorityContract',
      'Subject',
      'SubjectMembership',
      'AccessRule',
      'PermRow',
      'GroupComposition',
      'ManagerConfig',
      'PendingAction',
      'SubjectVouchConfig',
      'SubjectVouchRecord',
      'SubjectMembershipEvent',
    ]) {
      expect(types.has(t), `ACCESS_V2 must probe ${t}`).toBe(true);
    }
  });

  it('costs ONE round trip regardless of how many fields it spans', () => {
    const types = [...new Set(CAPABILITY.ACCESS_V2.require.map((r) => r.type))];
    const q = buildIntrospectionQuery(types);
    expect(q.match(/__type/g)).toHaveLength(types.length);
  });

  it('has its own id and no legacy storage key', () => {
    expect(CAPABILITY.ACCESS_V2.id).toBe('accessV2');
    expect(CAPABILITY.ACCESS_V2.legacyStorageKey).toBeUndefined();
  });
});

describe('the ORG half of the gate', () => {
  it('LEGACY ORG: no authority -> nothing v2 renders, no query runs', () => {
    const a = classifyAuthority(null, { capable: true });
    expect(a.enabled).toBe(false);
    expect(a.migrated).toBe(false);
    expect(a.address).toBeNull();
    // The mount point keys off `migrated`; a null address is also what makes every v2 hook `skip`.
    expect(authorityStatusCopy(a)).toBeNull();
  });

  it('MIGRATED ORG on a PRE-PUBLISH endpoint: still legacy, no banner, no query', () => {
    const a = classifyAuthority(authorityNode(), { capable: false });
    expect(a.enabled).toBe(false);
    expect(a.migrated).toBe(false);
    expect(a.address).toBeNull();
    expect(a.reason).toBe('subgraph-not-published');
    expect(authorityStatusCopy(a)).toBeNull();
  });

  it('MID-CUTOVER ORG: banner only — the modules still read the legacy path', () => {
    const a = classifyAuthority(authorityNode({ isRouterBound: false }), { capable: true });
    expect(a.state).toBe(AUTHORITY_STATE.PENDING);
    expect(a.migrated).toBe(true);
    expect(a.enabled).toBe(false); // panels stay hidden
    expect(authorityStatusCopy(a).tone).toBe('info');
  });

  it('AUTHORITY ORG: every v2 surface lights up', () => {
    const a = classifyAuthority(authorityNode(), { capable: true });
    expect(a.state).toBe(AUTHORITY_STATE.ACTIVE);
    expect(a.enabled).toBe(true);
    expect(a.address).toBeTruthy();
  });

  it('PAUSED AUTHORITY ORG: reads stay live, writes are called out', () => {
    // Pause gates WRITES only — that is load-bearing for the cutover ordering.
    const a = classifyAuthority(authorityNode({ paused: true }), { capable: true });
    expect(a.enabled).toBe(true);
    expect(authorityStatusCopy(a).tone).toBe('warning');
    expect(authorityStatusCopy(a).body).toMatch(/still be viewed/);
  });
});
