import { describe, it, expect } from 'vitest';
import { countdownFigure, lifecycleVariant, turnoutInputs } from './votingDisplay';
import { outcomeProblem, outcomeHeadline, turnoutCopy, PRIOR_RULES_NOTE } from '@/config/votingVocabulary';

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

    // Turnout cleared the quorum, so the support line is the only rule left
    // that the leader could have missed.
    it('names the support line when only it can explain the failure', () => {
      const short = {
        ...passed, isValid: false, quorum: 2, votes: [{ voter: '0x1' }, { voter: '0x2' }],
        options: [{ name: 'Yes', percentage: 40 }, { name: 'No', percentage: 35 }],
      };
      expect(outcomeProblem(short)).toBe(
        'No option reached the support this group requires, so nothing changed.'
      );
    });

    // The real Argus case: 1 voter, quorum 2, leader on 100%. The contracts
    // reject sub-quorum turnout before the support math, and 100% can't have
    // missed a 50% line — so this is a turnout shortfall, not a support one.
    it('names the turnout shortfall when the leader clears the support line', () => {
      const subQuorum = {
        ...passed, isValid: false, quorum: 2, votes: [{ voter: '0x1' }],
        options: [{ name: 'Yes', percentage: 100 }, { name: 'No', percentage: 0 }],
      };
      expect(outcomeProblem(subQuorum)).toBe(
        'Not enough of the group voted for this to count, so nothing changed.'
      );
    });

    it('stays neutral when both rules could explain it', () => {
      const both = {
        ...passed, isValid: false, quorum: 2, votes: [{ voter: '0x1' }],
        options: [{ name: 'Yes', percentage: 40 }, { name: 'No', percentage: 35 }],
      };
      expect(outcomeProblem(both)).toBe(
        'This vote didn\u2019t clear the group\u2019s rules, so nothing changed.'
      );
    });

    // Neither of today's rules fits — the group has changed them since. Naming
    // either one would be an invention.
    it('stays neutral when neither rule fits, meaning the rules moved', () => {
      const moved = {
        ...passed, isValid: false, quorum: 1, votes: [{ voter: '0x1' }, { voter: '0x2' }],
        options: [{ name: 'Yes', percentage: 70 }, { name: 'No', percentage: 30 }],
      };
      expect(outcomeProblem(moved)).toBe(
        'This vote didn\u2019t clear the group\u2019s rules, so nothing changed.'
      );
    });

    it('never claims a shortfall of either kind with no vote data to judge it', () => {
      for (const opts of [
        [{ name: 'A', percentage: 0 }],
        [{ name: 'A', percentage: 50 }, { name: 'B', percentage: 50 }],
        [{ name: 'A', percentage: 70 }, { name: 'B', percentage: 30 }],
      ]) {
        // No `votes` array → no headcount → no turnout verdict, ever.
        const reason = outcomeProblem({ ...passed, isValid: false, quorum: 2, options: opts });
        expect(reason).not.toMatch(/Not enough of the group voted/);
        expect(reason).not.toMatch(/reached the support/);
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

// `p.quorum` is the org's CURRENT rule, so raising it used to retro-fail every
// decided proposal — "needs 1 more for quorum (2)" under a "Decision Applied" chip.
describe('turnoutCopy — a closed vote is not re-judged by today\u2019s quorum', () => {
  const closed = { voted: 1, eligible: 24, quorum: 2, approximate: true, settled: true };

  it('never asks a decided proposal for more votes', () => {
    const { line, quorumMet, needsMore } = turnoutCopy(closed);
    expect(line).not.toMatch(/needs/);
    expect(needsMore).toBe(0);
    expect(quorumMet).toBe(true); // drives the amber ink

  });

  it('notes that the result was counted under the rule in force then', () => {
    const { line, priorRules } = turnoutCopy(closed);
    expect(line).toBe(`1 of 24 members voted \u00b7 ${PRIOR_RULES_NOTE}`);
    expect(priorRules).toBe(true);
  });

  it('stays silent when the closed turnout clears the current line anyway', () => {
    const { line, priorRules } = turnoutCopy({ ...closed, voted: 4 });
    expect(line).toBe('4 of 24 members voted');
    expect(priorRules).toBe(false);
  });

  it('leaves a no-result poll to its own outcome copy', () => {
    // invalidReason already explains isValid === false; blaming today's quorum
    // on top of it would invent a cause we cannot verify.
    const { line, priorRules } = turnoutCopy({ ...closed, hasResult: false });
    expect(line).toBe('1 of 24 members voted');
    expect(priorRules).toBe(false);
  });

  it('still holds a LIVE poll to the current quorum', () => {
    const { line, quorumMet, needsMore } = turnoutCopy({ ...closed, settled: false });
    expect(line).toBe('1 of 24 members voted \u00b7 needs\u00a01\u00a0more\u00a0for\u00a0quorum\u00a0(2)');
    expect(quorumMet).toBe(false);
    expect(needsMore).toBe(1);
  });
});

describe('turnoutInputs — settled tracks the on-chain status, not the deadline', () => {
  const proposal = { quorum: 2, votes: [{ voter: '0x1' }], isValid: true };

  it('marks a completed proposal settled', () => {
    expect(turnoutInputs({ ...proposal, isOngoing: false }, 24)).toMatchObject({
      voted: 1, eligible: 24, quorum: 2, settled: true, hasResult: true,
    });
  });

  it('keeps an awaiting-finalize poll live — its count WILL apply the current quorum', () => {
    expect(turnoutInputs({ ...proposal, isOngoing: true, isExpired: true }, 24).settled).toBe(false);
  });

  it('reports a no-result proposal so the meter withholds the note', () => {
    expect(turnoutInputs({ ...proposal, isOngoing: false, isValid: false }, 24).hasResult).toBe(false);
  });
});
