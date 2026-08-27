import { describe, it, expect } from 'vitest';
import {
  normalizePendingAction,
  normalizePendingActions,
  isOpen,
  isActivated,
  secondsUntilActive,
  formatCountdown,
  pendingActionCopy,
  pendingAgainstUser,
  pendingByActor,
  finalizable,
  normalizeManagerConfig,
  encodeCaps,
  managerConfigSummary,
  MANAGER_CAP,
  PENDING_KIND,
  PENDING_STATUS,
} from './pendingActions';
import { pendingActionRow, membersSubject, BOB, CAROL, EXECS_ID, EXECS_ID as EXEC } from './fixtures';

const ACTIVATES = 1750100000;
const BEFORE = ACTIVATES - 3600;
const AFTER = ACTIVATES + 1;

describe('normalizePendingAction', () => {
  it('normalises the row and its subject', () => {
    const p = normalizePendingAction(pendingActionRow());
    expect(p.pendingId).toBe('7');
    expect(p.subjectId).toBe(EXEC);
    expect(p.subjectName).toBe('Executives');
    expect(p.action).toBe(PENDING_KIND.OFFER);
    expect(p.activatesAt).toBe(ACTIVATES);
  });

  it('drops garbage', () => {
    expect(normalizePendingAction(null)).toBeNull();
    expect(normalizePendingActions([null, pendingActionRow()])).toHaveLength(1);
  });
});

describe('the review window', () => {
  const open = () => normalizePendingAction(pendingActionRow());

  it('counts down to activatesAt', () => {
    expect(secondsUntilActive(open(), BEFORE)).toBe(3600);
    expect(secondsUntilActive(open(), AFTER)).toBe(0);
  });

  it('is not activated before the anchor (claim would revert NotYetActive)', () => {
    expect(isActivated(open(), BEFORE)).toBe(false);
    expect(isActivated(open(), AFTER)).toBe(true);
  });

  it('a closed entry has no countdown', () => {
    const cancelled = normalizePendingAction(pendingActionRow({ status: 'Cancelled' }));
    expect(isOpen(cancelled)).toBe(false);
    expect(secondsUntilActive(cancelled, BEFORE)).toBeNull();
    expect(isActivated(cancelled, AFTER)).toBe(false);
  });

  it('formats a human countdown', () => {
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(30)).toBe('30 seconds');
    expect(formatCountdown(90)).toBe('1 minute');
    expect(formatCountdown(7200)).toBe('2 hours');
    expect(formatCountdown(172800)).toBe('2 days');
    expect(formatCountdown(null)).toBeNull();
  });
});

describe('pendingActionCopy — the window has to be VISIBLE', () => {
  it('tells the TARGET of a delegated removal what is happening to them', () => {
    const p = normalizePendingAction(pendingActionRow({ action: 'Remove', user: CAROL }));
    const copy = pendingActionCopy(p, CAROL, BEFORE);
    expect(copy.tone).toBe('warning');
    expect(copy.title).toMatch(/You are being removed/);
    expect(copy.body).toMatch(/1 hour/);
  });

  it('reads differently for an observer than for the target', () => {
    const p = normalizePendingAction(pendingActionRow({ action: 'Remove' }));
    expect(pendingActionCopy(p, BOB, BEFORE).title).toMatch(/Removal from .* pending/);
  });

  it('an offer past its anchor says it can be accepted now', () => {
    const p = normalizePendingAction(pendingActionRow());
    expect(pendingActionCopy(p, CAROL, AFTER).body).toMatch(/accept this invitation now/);
  });

  it('a closed entry renders its terminal state, never a countdown', () => {
    const voided = normalizePendingAction(pendingActionRow({ status: PENDING_STATUS.VOIDED }));
    expect(pendingActionCopy(voided, CAROL, AFTER).body).toMatch(/superseded by a vote/);
  });

  it('returns null for nothing', () => {
    expect(pendingActionCopy(null, CAROL)).toBeNull();
  });
});

describe('selectors', () => {
  const rows = () =>
    normalizePendingActions([
      pendingActionRow(),
      pendingActionRow({ id: 'x-8', pendingId: '8', action: 'Remove', user: BOB, actor: CAROL }),
      pendingActionRow({ id: 'x-9', pendingId: '9', status: 'Cancelled' }),
    ]);

  it('finds what is pending AGAINST a user (open entries only)', () => {
    expect(pendingAgainstUser(rows(), CAROL).map((p) => p.pendingId)).toEqual(['7']);
    expect(pendingAgainstUser(rows(), BOB).map((p) => p.pendingId)).toEqual(['8']);
  });

  it('finds what a manager started and can still cancel', () => {
    expect(pendingByActor(rows(), BOB).map((p) => p.pendingId)).toEqual(['7']);
  });

  it('the finalise queue excludes OFFERs — a claim IS the finalize there', () => {
    const q = finalizable(rows(), AFTER);
    expect(q.map((p) => p.pendingId)).toEqual(['8']);
  });

  it('the finalise queue is empty before the anchor', () => {
    expect(finalizable(rows(), BEFORE)).toEqual([]);
  });
});

describe('ManagerConfig', () => {
  it('normalises caps and delay', () => {
    const cfg = normalizeManagerConfig(membersSubject().managerConfig);
    expect(cfg.canGrant).toBe(true);
    expect(cfg.canRemove).toBe(true);
    expect(cfg.delaySecs).toBe(172800);
    expect(cfg.enabled).toBe(true);
    expect(cfg.managerSubjectId).toBe(EXECS_ID);
  });

  it('derives caps from the bitmask when the booleans are absent', () => {
    const cfg = normalizeManagerConfig({ id: '1', managerSubjectId: '2', caps: MANAGER_CAP.REMOVE, delaySecs: '0' });
    expect(cfg.canGrant).toBe(false);
    expect(cfg.canRemove).toBe(true);
  });

  it('encodes the two checkboxes into the caps bitmask', () => {
    expect(encodeCaps({ canGrant: true, canRemove: false })).toBe(1);
    expect(encodeCaps({ canGrant: false, canRemove: true })).toBe(2);
    expect(encodeCaps({ canGrant: true, canRemove: true })).toBe(3);
    expect(encodeCaps()).toBe(0);
  });

  it('summarises the delegation in one sentence', () => {
    const cfg = normalizeManagerConfig(membersSubject().managerConfig);
    expect(managerConfigSummary(cfg)).toBe(
      'Executives can add and remove people, taking effect after 2 days.'
    );
  });

  it('says "only a vote" when there is no delegation', () => {
    expect(managerConfigSummary(null)).toMatch(/Only a vote/);
  });
});
