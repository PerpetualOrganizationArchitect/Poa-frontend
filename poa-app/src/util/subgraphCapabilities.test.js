/**
 * The capability probe is the only thing standing between a not-yet-upgraded
 * subgraph endpoint and a blank task board: one unknown field fails the WHOLE
 * GraphQL document, and the document these capabilities gate is the one that
 * backs every project and task in the app.
 *
 * Only the pure seams are exercised here (the repo has no fetch/localStorage
 * harness): the requirement evaluator and the introspection document builder.
 */

import { describe, it, expect } from 'vitest';
import {
  satisfies,
  buildIntrospectionQuery,
  hasCapability,
  CAPABILITY,
} from './subgraphCapabilities';

/** Introspection result shaped like introspect() returns: type -> Set|null. */
const typeMap = (entries) => new Map(Object.entries(entries).map(
  ([k, v]) => [k, v === null ? null : new Set(v)]
));

const FULL = typeMap({
  Task: ['id', 'status', 'reclaimCount', 'releaseCount', 'lastReleasedAt', 'releases'],
  TaskRelease: ['id', 'selfRelease', 'releasedAt'],
});

describe('satisfies', () => {
  it('accepts a schema that has every required field', () => {
    expect(satisfies(FULL, CAPABILITY.TASK_RELEASES.require)).toBe(true);
  });

  it('rejects when the entity is absent entirely (__type resolves null)', () => {
    const noEntity = typeMap({
      Task: ['id', 'releaseCount', 'lastReleasedAt', 'releases'],
      TaskRelease: null,
    });
    expect(satisfies(noEntity, CAPABILITY.TASK_RELEASES.require)).toBe(false);
  });

  it('rejects a PARTIAL deployment — every missing field individually flips it false', () => {
    // The real hazard: a schema with some of the new fields would still fail the
    // document, so anything less than the full set must read as unsupported.
    for (const missing of ['releaseCount', 'lastReleasedAt', 'releases']) {
      const partial = typeMap({
        Task: ['id', 'releaseCount', 'lastReleasedAt', 'releases'].filter((f) => f !== missing),
        TaskRelease: ['id'],
      });
      expect(satisfies(partial, CAPABILITY.TASK_RELEASES.require)).toBe(false);
    }
  });

  it('rejects an unknown type and an empty requirement list', () => {
    expect(satisfies(new Map(), CAPABILITY.TASK_RELEASES.require)).toBe(false);
    expect(satisfies(FULL, [])).toBe(false);
  });

  it('checks entity existence only when no field is named', () => {
    expect(satisfies(typeMap({ TaskRelease: [] }), [{ type: 'TaskRelease' }])).toBe(true);
    expect(satisfies(typeMap({ TaskRelease: null }), [{ type: 'TaskRelease' }])).toBe(false);
  });
});

describe('buildIntrospectionQuery', () => {
  it('aliases each type so one capability costs one round trip', () => {
    const q = buildIntrospectionQuery(['Task', 'TaskRelease']);
    expect(q).toContain('t0: __type(name: "Task")');
    expect(q).toContain('t1: __type(name: "TaskRelease")');
    expect(q).toMatch(/^\{.*\}$/s);
  });

  it('is driven by the DEDUPED type list — Task is required 3 times, asked once', () => {
    const types = [...new Set(CAPABILITY.TASK_RELEASES.require.map((r) => r.type))];
    expect(types).toEqual(['Task', 'TaskRelease']);
    expect(buildIntrospectionQuery(types).match(/__type/g)).toHaveLength(2);
  });
});

describe('capability descriptors', () => {
  it('keeps the pre-generalisation localStorage key for the proposer probe', () => {
    // Back-compat pin: users whose endpoint was already marked upgraded must not
    // be re-probed, and VotingContext must keep working untouched.
    expect(CAPABILITY.PROPOSAL_PROPOSER.legacyStorageKey('https://x/y'))
      .toBe('poa:subgraphHasProposer:https://x/y');
  });

  it('gives the release capability its own id and no legacy key', () => {
    expect(CAPABILITY.TASK_RELEASES.id).toBe('taskReleases');
    expect(CAPABILITY.TASK_RELEASES.legacyStorageKey).toBeUndefined();
  });
});

describe('hasCapability guards', () => {
  it('resolves false without touching the network when inputs are missing', async () => {
    await expect(hasCapability(undefined, CAPABILITY.TASK_RELEASES)).resolves.toBe(false);
    await expect(hasCapability('', CAPABILITY.TASK_RELEASES)).resolves.toBe(false);
    await expect(hasCapability('https://x/y', null)).resolves.toBe(false);
  });
});
