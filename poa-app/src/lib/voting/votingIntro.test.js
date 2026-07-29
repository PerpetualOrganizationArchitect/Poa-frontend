import { describe, it, expect } from 'vitest';
import {
  recordVisit,
  isFinalNudge,
  NUDGE_COPY,
  NUDGE_VISITS,
  VISITS_KEY,
  INTRO_DONE_KEY,
  SESSION_KEY,
} from './votingIntro';

/** Walk N visits through the machine the way the hook does, honouring actions. */
function simulate(visits, actOn = () => null) {
  let stored = {};
  const shown = [];
  for (let i = 0; i < visits; i++) {
    const next = recordVisit(stored);
    stored = { visits: next.visits, introDone: next.introDone };
    if (next.nudge) {
      shown.push({ visit: next.visits, variant: next.nudge });
      const action = actOn(next.nudge, next.visits);
      if (action === 'show-me') stored.introDone = true;
      if (action === 'dismiss' && isFinalNudge(next.nudge)) stored.introDone = true;
    }
  }
  return { stored, shown };
}

describe('recordVisit', () => {
  it('nudges on the first visit ever', () => {
    expect(recordVisit({})).toEqual({ visits: 1, introDone: false, nudge: 'first' });
  });

  it('says nothing on visits 2, 4, 5', () => {
    for (const prior of [1, 3, 4]) {
      expect(recordVisit({ visits: prior }).nudge).toBeNull();
    }
  });

  it('nudges again on the third visit', () => {
    expect(recordVisit({ visits: 2 })).toEqual({ visits: 3, introDone: false, nudge: 'reminder' });
  });

  it('never nudges once the intro is done', () => {
    for (const prior of [0, 1, 2, 3, 10]) {
      expect(recordVisit({ visits: prior, introDone: true }).nudge).toBeNull();
    }
  });

  it('still counts visits after the intro is done', () => {
    expect(recordVisit({ visits: 7, introDone: true }).visits).toBe(8);
  });

  it('treats corrupt / missing counters as a first visit', () => {
    for (const bad of [undefined, null, NaN, 'abc', -3, 0, {}]) {
      expect(recordVisit({ visits: bad })).toEqual({ visits: 1, introDone: false, nudge: 'first' });
    }
  });

  it('floors fractional counters instead of drifting', () => {
    expect(recordVisit({ visits: 2.7 }).visits).toBe(3);
  });
});

describe('nudge schedule end to end', () => {
  it('shows exactly two nudges across ten passive visits', () => {
    const { shown } = simulate(10);
    expect(shown).toEqual([
      { visit: 1, variant: 'first' },
      { visit: 3, variant: 'reminder' },
    ]);
  });

  it('retires forever once the member opens the explainer', () => {
    const { shown, stored } = simulate(10, (variant) => (variant === 'first' ? 'show-me' : null));
    expect(shown).toEqual([{ visit: 1, variant: 'first' }]);
    expect(stored.introDone).toBe(true);
  });

  it('dismissing the first nudge only defers it to visit 3', () => {
    const { shown } = simulate(10, () => 'dismiss');
    expect(shown.map((s) => s.visit)).toEqual([1, 3]);
  });

  it('dismissing the reminder retires it — never a third ask', () => {
    const { stored } = simulate(10, () => 'dismiss');
    expect(stored.introDone).toBe(true);
    expect(recordVisit(stored).nudge).toBeNull();
  });
});

describe('isFinalNudge', () => {
  it('only the reminder is terminal', () => {
    expect(isFinalNudge('first')).toBe(false);
    expect(isFinalNudge('reminder')).toBe(true);
    expect(isFinalNudge(null)).toBe(false);
  });
});

describe('copy + keys', () => {
  it('has copy for every scheduled variant', () => {
    for (const visit of NUDGE_VISITS) {
      const variant = recordVisit({ visits: visit - 1 }).nudge;
      expect(variant).toBeTruthy();
      const copy = NUDGE_COPY[variant];
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
      expect(copy.cta.length).toBeGreaterThan(0);
      expect(copy.dismiss.length).toBeGreaterThan(0);
    }
  });

  it('never says "Hybrid" to a member', () => {
    for (const copy of Object.values(NUDGE_COPY)) {
      expect(`${copy.title} ${copy.body}`).not.toMatch(/hybrid/i);
    }
  });

  it('scopes storage per org', () => {
    expect(VISITS_KEY('0xabc')).toBe('poa:votingVisits:0xabc');
    expect(INTRO_DONE_KEY('0xabc')).toBe('poa:votingIntroDone:0xabc');
    expect(SESSION_KEY('0xabc')).toBe('poa:votingVisitSession:0xabc');
    expect(VISITS_KEY('0xabc')).not.toBe(VISITS_KEY('0xdef'));
  });

  it('derives NUDGE_VISITS from the schedule, ascending, with the last one final', () => {
    expect(NUDGE_VISITS).toEqual([1, 3]);
    const last = NUDGE_VISITS[NUDGE_VISITS.length - 1];
    expect(isFinalNudge(recordVisit({ visits: last - 1 }).nudge)).toBe(true);
    for (const v of NUDGE_VISITS.slice(0, -1)) {
      expect(isFinalNudge(recordVisit({ visits: v - 1 }).nudge)).toBe(false);
    }
  });

  it('every scheduled visit has a distinct variant with copy', () => {
    const variants = NUDGE_VISITS.map((v) => recordVisit({ visits: v - 1 }).nudge);
    expect(new Set(variants).size).toBe(variants.length);
    expect(variants.every((v) => !!NUDGE_COPY[v])).toBe(true);
  });
});
