import { describe, it, expect } from 'vitest';
import { countdownFigure, lifecycleVariant } from './votingDisplay';
import { outcomeProblem, outcomeHeadline } from '@/config/votingVocabulary';

// Fixed clock — these helpers take `now` explicitly so a card can tick.
const NOW_MS = 1_800_000_000_000;
const NOW_SEC = Math.floor(NOW_MS / 1000);
const inSecs = (n) => String(NOW_SEC + n);

const render = (fig) =>
  `${fig.prefix}${fig.parts.map((p) => p.value + p.unit).join(' ')}`;

describe('countdownFigure — a live card always shows a number', () => {
  it('splits days into the two largest units', () => {
    expect(render(countdownFigure(inSecs(2 * 86400 + 4 * 3600 + 30 * 60), NOW_MS))).toBe('2d 4h');
  });

  it('drops a zero second unit rather than padding it', () => {
    expect(render(countdownFigure(inSecs(3 * 86400), NOW_MS))).toBe('3d');
    expect(render(countdownFigure(inSecs(5 * 3600), NOW_MS))).toBe('5h');
  });

  it('falls to hours + minutes inside a day', () => {
    expect(render(countdownFigure(inSecs(3 * 3600 + 12 * 60), NOW_MS))).toBe('3h 12m');
  });

  it('falls to bare minutes inside an hour', () => {
    expect(render(countdownFigure(inSecs(47 * 60), NOW_MS))).toBe('47m');
  });

  it('renders "<1m" under a minute — never "0m"', () => {
    expect(render(countdownFigure(inSecs(30), NOW_MS))).toBe('<1m');
    expect(countdownFigure(inSecs(30), NOW_MS).ariaText).toBe('less than 1 minute left');
  });

  it('never renders a negative figure once the deadline has passed', () => {
    expect(render(countdownFigure(inSecs(-9999), NOW_MS))).toBe('<1m');
  });

  it('never renders a negative figure for a missing endTimestamp', () => {
    expect(render(countdownFigure(null, NOW_MS))).toBe('<1m');
    expect(render(countdownFigure('0', NOW_MS))).toBe('<1m');
  });

  it('spells the remaining time out for screen readers', () => {
    expect(countdownFigure(inSecs(86400 + 3600), NOW_MS).ariaText).toBe('1 day 1 hour left');
    expect(countdownFigure(inSecs(2 * 86400 + 4 * 3600), NOW_MS).ariaText).toBe('2 days 4 hours left');
  });
});

describe('lifecycleVariant — ticks with the clock it is given', () => {
  const live = (endsInSecs, extra = {}) => ({
    isOngoing: true,
    isExpired: false,
    endTimestamp: inSecs(endsInSecs),
    ...extra,
  });

  it('flips to closing-soon inside 24h', () => {
    expect(lifecycleVariant(live(48 * 3600), NOW_MS)).toBe('live-unvoted');
    expect(lifecycleVariant(live(23 * 3600), NOW_MS)).toBe('closing-soon');
  });

  it('distinguishes voted from unvoted while comfortably live', () => {
    expect(lifecycleVariant(live(48 * 3600, { userHasVoted: true }), NOW_MS)).toBe('live-voted');
  });

  it('flips to awaiting-finalize when the deadline passes under a mounted card', () => {
    // isExpired is stale (computed once at transform time) — the clock decides.
    expect(lifecycleVariant(live(-60), NOW_MS)).toBe('awaiting-finalize');
  });

  it('does not flip an ongoing poll whose endTimestamp is unindexed', () => {
    expect(lifecycleVariant({ isOngoing: true, isExpired: false, endTimestamp: '0' }, NOW_MS))
      .toBe('closing-soon');
  });

  it('a closed poll is completed regardless of the clock', () => {
    expect(lifecycleVariant({ isOngoing: false, endTimestamp: inSecs(3600) }, NOW_MS)).toBe('completed');
  });
});

describe('outcomeProblem — cards only narrate failures', () => {
  const passed = {
    isValid: true,
    winningOption: 0,
    thresholdPct: 50,
    options: [{ name: 'Yes', percentage: 100 }, { name: 'No', percentage: 0 }],
  };

  it('says nothing when the vote passed cleanly', () => {
    expect(outcomeProblem(passed)).toBeNull();
  });

  it('says nothing when there is no threshold to fall short of', () => {
    expect(outcomeProblem({ ...passed, thresholdPct: 0 })).toBeNull();
  });

  // `isValid === false` is NOT a quorum flag: the contracts compute it as
  // (winner's share >= quorum) && (winner > runner-up), so it also covers ties
  // and a winner below the required share. Never assert "not enough people voted".
  describe('an invalid result is not automatically a missed quorum', () => {
    it('says nothing was counted when no option scored', () => {
      const empty = { ...passed, isValid: false, options: [{ name: 'Yes', percentage: 0 }, { name: 'No', percentage: 0 }] };
      expect(outcomeProblem(empty)).toBe('No votes were counted, so nothing changed.');
    });

    it('names a tie, which the bars show plainly', () => {
      const tie = { ...passed, isValid: false, options: [{ name: 'Yes', percentage: 50 }, { name: 'No', percentage: 50 }] };
      expect(outcomeProblem(tie)).toBe('Tied — no single option won, so nothing changed.');
    });

    it('falls back to a cause-neutral sentence for a below-share winner', () => {
      const short = { ...passed, isValid: false, options: [{ name: 'Yes', percentage: 60 }, { name: 'No', percentage: 40 }] };
      expect(outcomeProblem(short)).toBe(
        'No option reached the support this group requires, so nothing changed.'
      );
    });

    it('never claims a voter shortfall it cannot know', () => {
      for (const opts of [
        [{ name: 'A', percentage: 0 }],
        [{ name: 'A', percentage: 50 }, { name: 'B', percentage: 50 }],
        [{ name: 'A', percentage: 70 }, { name: 'B', percentage: 30 }],
      ]) {
        expect(outcomeProblem({ ...passed, isValid: false, options: opts })).not.toMatch(/people voted/);
      }
    });
  });

  // Reachable with real data: on-chain validity uses the QUORUM share, while
  // thresholdPct is a separate, higher bar. Test6's hybrid org runs quorum 1 /
  // threshold 25, so a 20%-share winner is isValid on-chain yet under threshold.
  it('reports a leader that fell short of the threshold on a VALID proposal', () => {
    const short = {
      isValid: true,
      winningOption: 0,
      quorum: 1,
      thresholdPct: 25,
      options: [
        { name: 'Option 1', percentage: 20 },
        { name: 'Option 2', percentage: 18 },
        { name: 'Option 3', percentage: 17 },
      ],
    };
    expect(outcomeProblem(short)).toBe('Didn’t pass — 20% support, under the 25% needed.');
  });

  it('passes on the exact threshold', () => {
    const exact = { ...passed, thresholdPct: 50, options: [{ name: 'Yes', percentage: 50 }] };
    expect(outcomeProblem(exact)).toBeNull();
  });

  it('does not let rounding hand the pass seal to a vote that fell short', () => {
    // 49.6% rounds to "50%" for display but is genuinely under a 50% line.
    const nearMiss = { ...passed, thresholdPct: 50, options: [{ name: 'Yes', percentage: 49.6 }] };
    expect(outcomeProblem(nearMiss)).toBe('Didn’t pass — 50% support, under the 50% needed.');
    // ...and the detail modal's headline must agree with the card.
    expect(outcomeHeadline(nearMiss)).toMatch(/^Did not pass/);
  });

  it('agrees with outcomeHeadline on a clean pass', () => {
    expect(outcomeProblem(passed)).toBeNull();
    expect(outcomeHeadline(passed)).toMatch(/^Passed/);
  });

  it('treats an unindexed winner as a data gap, not a failure', () => {
    expect(outcomeProblem({ ...passed, winningOption: null })).toBeNull();
    expect(outcomeProblem({ ...passed, winningOption: 7 })).toBeNull();
  });

  it('treats an unknown isValid as valid, matching executionStatus', () => {
    expect(outcomeProblem({ ...passed, isValid: undefined })).toBeNull();
  });
});
