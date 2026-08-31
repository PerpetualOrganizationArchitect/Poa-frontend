import { describe, it, expect } from 'vitest';
import { RefreshEvent } from '@/util/refreshEvents';
import {
  PROJECT_AUTHORITY_EVENTS,
  HAT_AUTHORITY_EVENTS,
  NON_AUTHORITY_EVENTS,
  trackAuthorityRefresh,
} from './authorityEvents';

/**
 * The CLAIM gate refuses an action only once `resolved` is true, and `resolved` is false
 * for exactly as long as one of these events is being re-read. Get the lists wrong in
 * either direction and the failure is silent:
 *
 *  - an omitted GRANT event → the user is refused a permission they were just given,
 *    which is the bug this whole mechanism exists to fix;
 *  - an over-broad list → every gated control re-opens on ordinary activity, handing an
 *    unauthorised member a live Claim button.
 *
 * Neither shows up in rendered output, so the classification is pinned here.
 */
describe('authority event classification', () => {
  const ALL = Object.entries(RefreshEvent)
    .filter(([k]) => k !== 'ALL')
    .map(([, v]) => v);

  it('classifies every RefreshEvent, so a new one cannot silently miss the gate', () => {
    const classified = new Set([
      ...PROJECT_AUTHORITY_EVENTS,
      ...HAT_AUTHORITY_EVENTS,
      ...NON_AUTHORITY_EVENTS,
    ]);
    const unclassified = ALL.filter((e) => !classified.has(e));
    expect(unclassified, 'add these to util/authorityEvents.js').toEqual([]);
  });

  it('never lists an event as both authority-changing and not', () => {
    const authority = new Set([...PROJECT_AUTHORITY_EVENTS, ...HAT_AUTHORITY_EVENTS]);
    expect(NON_AUTHORITY_EVENTS.filter((e) => authority.has(e))).toEqual([]);
  });

  it('holds the three on-chain routes that change project managers or role masks', () => {
    // createProject auto-adds its creator as a manager; setConfig(PROJECT_MANAGER, ...),
    // setProjectRolePerm and setConfig(ROLE_PERM, ...) are executor-only, so a passing
    // proposal is the only other in-app route. Deleting a project retires its managers.
    expect(new Set(PROJECT_AUTHORITY_EVENTS)).toEqual(new Set([
      RefreshEvent.PROJECT_CREATED,
      RefreshEvent.PROJECT_DELETED,
      RefreshEvent.PROPOSAL_COMPLETED,
    ]));
  });

  it('holds every route by which the visitor can gain or lose a hat', () => {
    expect(new Set(HAT_AUTHORITY_EVENTS)).toEqual(new Set([
      RefreshEvent.MEMBER_JOINED,
      RefreshEvent.ROLE_CLAIMED,
      RefreshEvent.ROLE_VOUCHED,
      RefreshEvent.ROLE_VOUCH_REVOKED,
      RefreshEvent.PROPOSAL_COMPLETED,
    ]));
  });

  it('keeps ordinary activity OUT, so a denied member does not get a live button', () => {
    // Each of these refetches an authority document for reasons unrelated to authority.
    // Treating them as suspect would re-open every gate several times a session.
    for (const e of [
      RefreshEvent.TASK_CLAIMED, RefreshEvent.TASK_SUBMITTED, RefreshEvent.TASK_COMPLETED,
      RefreshEvent.PROPOSAL_VOTED, RefreshEvent.MODULE_COMPLETED, RefreshEvent.USERNAME_CHANGED,
      RefreshEvent.PROJECT_BUDGET_UPDATED, RefreshEvent.TOKEN_REQUEST_APPROVED,
    ]) {
      expect(PROJECT_AUTHORITY_EVENTS, e).not.toContain(e);
      expect(HAT_AUTHORITY_EVENTS, e).not.toContain(e);
    }
  });

  it('does not treat a role APPLICATION as a grant — applying confers nothing', () => {
    expect(HAT_AUTHORITY_EVENTS).not.toContain(RefreshEvent.ROLE_APPLICATION_SUBMITTED);
    expect(HAT_AUTHORITY_EVENTS).not.toContain(RefreshEvent.ROLE_APPLICATION_WITHDRAWN);
  });
});

describe('trackAuthorityRefresh', () => {
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
  const flag = () => {
    const seen = [];
    return { set: (v) => seen.push(v), seen };
  };

  it('marks authority suspect synchronously, before any request goes out', () => {
    const f = flag();
    trackAuthorityRefresh(f.set, [() => new Promise(() => {})]);
    expect(f.seen).toEqual([true]);
  });

  it('does NOT release when only the faster document has answered', async () => {
    // The managers document is far smaller than the board and lands first. Releasing
    // here would re-arm the refusal while the role-mask grant was still in flight.
    const f = flag();
    const managers = deferred();
    const board = deferred();
    trackAuthorityRefresh(f.set, [() => board.promise, () => managers.promise]);
    managers.resolve({});
    await Promise.resolve(); await Promise.resolve();
    expect(f.seen).toEqual([true]);

    board.resolve({});
    await new Promise((r) => setTimeout(r, 0));
    expect(f.seen).toEqual([true, false]);
  });

  it('releases once every document has settled', async () => {
    const f = flag();
    await trackAuthorityRefresh(f.set, [async () => 1, async () => 2]);
    expect(f.seen).toEqual([true, false]);
  });

  it('releases even when a refetch fails, rather than pinning the gate open', async () => {
    const f = flag();
    await trackAuthorityRefresh(f.set, [
      async () => { throw new Error('429'); },
      async () => 'ok',
    ]);
    expect(f.seen).toEqual([true, false]);
  });

  it('never rejects, so a failed refetch cannot surface as an unhandled rejection', async () => {
    const f = flag();
    await expect(trackAuthorityRefresh(f.set, [async () => { throw new Error('boom'); }]))
      .resolves.toBeUndefined();
  });
});

describe('trackAuthorityRefresh under overlapping events', () => {
  /**
   * Two authority events can land back to back — PROJECT_CREATED immediately followed by
   * PROPOSAL_COMPLETED, or a proposal that both mints a hat and reassigns a manager. Each
   * starts its own batch against the same flag, so the invariant that matters is that the
   * flag always ends RELEASED. A batch that never settles would pin the gate open, which
   * silently reverts the whole permission gate to "never refuses".
   */
  const flag = () => {
    const o = { value: false, seen: [] };
    return { o, set: (v) => { o.value = v; o.seen.push(v); } };
  };

  it('ends released when both batches settle', async () => {
    const f = flag();
    await Promise.all([
      trackAuthorityRefresh(f.set, [async () => 1]),
      trackAuthorityRefresh(f.set, [async () => 2]),
    ]);
    expect(f.o.value).toBe(false);
  });

  it('ends released even if an earlier batch never settles', async () => {
    // Apollo dedupes concurrent refetches of one query, so in practice both batches
    // resolve together — but the gate must not depend on that.
    const f = flag();
    trackAuthorityRefresh(f.set, [() => new Promise(() => {})]);   // never settles
    await trackAuthorityRefresh(f.set, [async () => 'ok']);
    expect(f.o.value).toBe(false);
  });

  it('re-arms while a later batch is still in flight', async () => {
    // The second event must be able to re-open the gate after the first closed it,
    // otherwise a grant arriving during a quiet moment is refused.
    const f = flag();
    await trackAuthorityRefresh(f.set, [async () => 1]);
    expect(f.o.value).toBe(false);
    trackAuthorityRefresh(f.set, [() => new Promise(() => {})]);
    expect(f.o.value).toBe(true);
  });
});
