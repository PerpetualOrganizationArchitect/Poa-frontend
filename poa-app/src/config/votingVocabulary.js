/**
 * votingVocabulary — single source of truth for user-facing governance strings.
 *
 * Product direction (Hudson): the weighted voting system is called "Blended
 * voting" everywhere a member can see it — plain, warm, co-op language. The
 * on-chain / code identifiers (HybridVoting, votingType === 'Hybrid', subgraph
 * fields) stay unchanged; this file only maps them to human copy.
 *
 * Wave-2 components (pollModal, CompletedPollModal, VoteCard, tabs) import
 * from here too so the vocabulary never drifts between surfaces again.
 */

/**
 * Map an internal voting-type identifier to its member-facing display name.
 * `votingType` comes from VotingContext ('Hybrid' | 'Direct Democracy' |
 * 'Participation'); we never surface "Hybrid" to a member.
 */
export function displayName(votingType) {
  switch (votingType) {
    case 'Hybrid':
      return 'Blended voting';
    case 'Direct Democracy':
      return 'Direct democracy';
    case 'Participation':
      return 'Participation voting';
    default:
      return votingType || 'Voting';
  }
}

/**
 * One-line tagline for each voting model, member-facing.
 */
export function taglineFor(votingType) {
  switch (votingType) {
    case 'Hybrid':
      return 'Decisions weighted by membership + contributions';
    case 'Direct Democracy':
      return 'One person, one vote — gauge sentiment before it binds';
    case 'Participation':
      return 'Binding decisions weighted by your contributions';
    default:
      return '';
  }
}

/**
 * Threshold / support-to-pass explainer. `pct` is the support percentage.
 */
export function thresholdLabel(pct) {
  const n = pct == null ? '' : `${pct}%`;
  return `Passes if the top choice gets over ${n} support`;
}

/**
 * Quorum explainer. `n` is the minimum voter count.
 */
export function quorumLabel(n) {
  const count = n == null ? '' : n;
  return `Needs ${count} voters for the result to count`;
}

/** Section label for who is currently able to vote (active poll). */
export const ELIGIBILITY_LABEL = 'Who can vote:';

/** Section label for who was able to vote (completed poll). */
export const COMPLETED_ELIGIBILITY_LABEL = 'Who could vote:';

/** Verb for finalizing / announcing a poll result. */
export const FINALIZE_VERB = 'Count the votes';

/**
 * Trailing note for a CLOSED vote sitting under today's quorum. Says nothing
 * about what the older rule WAS — no per-proposal snapshot exists, so the only
 * honest claim is that the chain applied whatever was live at the time.
 */
export const PRIOR_RULES_NOTE = 'counted under the rules at the time';

/** Tooltip behind PRIOR_RULES_NOTE. `quorum` is the CURRENT rule. */
export function priorRulesTooltip(quorum, voted) {
  const one = quorum === 1;
  const ballots = voted === 1 ? '1 ballot' : `${voted} ballots`;
  return `Your group now needs ${quorum} voter${one ? '' : 's'} for a result to count. ` +
    `This vote closed earlier with ${ballots} and was already counted on-chain under the rule ` +
    `in force then \u2014 changing the rule doesn\u2019t re-open decisions that are already made.`;
}

/**
 * Turnout copy — votes cast vs. eligible denominator, with a quorum aside.
 * `voted` = distinct voters, `eligible` = eligible denominator (may be the
 * member count fallback → set `approximate` so the label reads "members"),
 * `quorum` = minimum voters for the result to count (0 = no quorum).
 * Returns `{ line, quorumMet, needsMore, lowQuorum, priorRules }`.
 *
 * `settled` (poll closed) is not cosmetic: `quorum` is ALWAYS the org's current
 * rule, and a closed vote was counted under whatever was live then — raising
 * quorum 1 → 2 used to repaint every past decision amber with "needs 1 more for
 * quorum (2)". Settled polls show turnout ONLY, plus a neutral note when the
 * turnout wouldn't clear today's line yet still produced a result.
 * `hasResult` = isValid !== false; a no-result poll is left to invalidReason.
 */
export function turnoutCopy({
  voted = 0,
  eligible = 0,
  quorum = 0,
  approximate = false,
  settled = false,
  hasResult = true,
}) {
  const noun = approximate ? 'members' : 'eligible';
  const denom = eligible > 0 ? `${voted} of ${eligible} ${noun}` : `${voted} voted`;
  const base = eligible > 0 ? `${denom} voted` : denom;

  // A quorum that's trivially small relative to the group gets NO triumphant
  // green check — the UI must not endorse rubber-stamp rules (panel: Marcus).
  const lowQuorum = quorum > 0 && eligible > 1 && quorum < Math.max(2, Math.ceil(eligible * 0.2));

  if (settled) {
    // Only a visible mismatch earns a line; everything else is just turnout.
    const priorRules = quorum > 0 && voted < quorum && hasResult;
    return {
      line: priorRules ? `${base} \u00b7 ${PRIOR_RULES_NOTE}` : base,
      // A closed poll is never failing a live gate — no amber, no shortfall.
      quorumMet: true,
      needsMore: 0,
      lowQuorum: false,
      priorRules,
    };
  }

  if (!quorum || quorum <= 0) {
    return { line: base, quorumMet: true, needsMore: 0, lowQuorum: false, priorRules: false };
  }
  if (voted >= quorum) {
    return {
      // Always show the quorum's actual size — bare "quorum met" hid how weak it was.
      line: `${base} \u00b7 quorum\u00a0${quorum}${lowQuorum ? '' : '\u00a0\u2713'}`,
      quorumMet: true,
      needsMore: 0,
      lowQuorum,
      priorRules: false,
    };
  }
  const needsMore = quorum - voted;
  return {
    line: `${base} \u00b7 needs\u00a0${needsMore}\u00a0more\u00a0for\u00a0quorum\u00a0(${quorum})`,
    quorumMet: false,
    needsMore,
    lowQuorum,
    priorRules: false,
  };
}

/**
 * Static "what it takes to pass" rule line, member-facing. Reuses the turnout
 * fraction-of-members phrasing so the Constitution panel and the live meters
 * speak the same language, e.g. "passes over 25% support · quorum 1 of 9".
 * `thresholdPct` = support-to-pass line, `quorum` = minimum voters,
 * `eligible` = member denominator (0 → omit the "of N" aside).
 */
export function passRuleCopy({ thresholdPct = 0, quorum = 0, eligible = 0 } = {}) {
  const support = thresholdPct > 0
    ? `passes over ${Math.round(thresholdPct)}% support`
    : 'passes by simple majority';
  if (!quorum || quorum <= 0) {
    return `${support} · no quorum`;
  }
  const denom = eligible > 0 ? ` of ${eligible}` : '';
  return `${support} · quorum ${quorum}${denom}`;
}

/** Tooltip for a quorum that is low relative to the group (see turnoutCopy). */
export function lowQuorumTooltip(quorum, eligible) {
  const one = quorum === 1;
  return `Your group's rules set quorum to ${quorum} vote${one ? '' : 's'} out of ${eligible} \u2014 ` +
    `binding decisions can pass with ${one ? 'a single ballot' : `just ${quorum} ballots`}. ` +
    `You can change this under \u201cChange the group's rules\u201d.`;
}

/**
 * Leading-option support vs. the pass threshold, member-facing.
 * `supportPct` = leading option's support %, `thresholdPct` = pass line.
 */
export function supportCopy(supportPct, thresholdPct) {
  const s = supportPct == null ? 0 : Math.round(supportPct);
  if (!thresholdPct || thresholdPct <= 0) {
    return `Leading option has ${s}% support`;
  }
  return `Leading option has ${s}% support · passes over ${Math.round(thresholdPct)}%`;
}

// ---------------------------------------------------------------------------
// Lifecycle status chips (board cards + detail header).
// ---------------------------------------------------------------------------

/** Live poll still open (paired with a relative-time countdown by the caller). */
export const STATUS_LIVE = 'LIVE';
/** Live poll closing within 24h. */
export const STATUS_CLOSING_SOON = 'CLOSING SOON';
/** Voting window ended, result not yet counted on-chain. */
export const STATUS_AWAITING_COUNT = 'VOTING ENDED';

/** "You already voted" affordance. */
export const YOU_VOTED_CHIP = 'You voted ✓';

/** "This rule includes you" chip on the Our-rules who-can-open rows. */
export const YOU_CAN_OPEN_CHIP = 'You can ✓';

// ---------------------------------------------------------------------------
// Completed-poll execution-status taxonomy (preserved from CompletedPollModal)
// with plain-language explanations. `label` is the chip; `explain` is one line.
// ---------------------------------------------------------------------------

/**
 * Resolve the execution-status chip for a completed proposal.
 * @param {object} p - transformed proposal (isValid, wasExecuted,
 *   executionFailed, executionError, hasExecutableActions)
 */
export function executionStatus(p = {}) {
  const isValid = p.isValid !== false;
  const hasActions = !!(p.executionBatchId || p.executedCallsCount > 0 || p.hasExecutableActions);

  if (!isValid) {
    return {
      // `key` stays 'no_quorum' — callers branch on it — but the member-facing
      // copy must not name a cause `isValid` cannot distinguish (see invalidReason).
      key: 'no_quorum',
      label: 'No result',
      colorScheme: 'gray',
      explain: invalidReason(p),
      canRetry: false,
    };
  }
  if (p.executionFailed === true) {
    return {
      key: 'failed',
      label: 'Execution Failed',
      colorScheme: 'red',
      explain: p.executionError
        ? `The winning action failed on-chain: ${p.executionError}`
        : "The winning option's on-chain action failed to run — it can be retried.",
      canRetry: true,
    };
  }
  if (p.wasExecuted) {
    return {
      key: 'applied',
      label: 'Decision Applied',
      colorScheme: 'green',
      explain: "The winning option's action was applied on-chain.",
      canRetry: false,
    };
  }
  if (hasActions) {
    return {
      key: 'pending',
      label: 'Pending Execution',
      colorScheme: 'yellow',
      explain: 'This decision has an action waiting to be applied — it can be retried.',
      canRetry: true,
    };
  }
  return {
    key: 'signal',
    label: 'Signal vote',
    colorScheme: 'blue',
    explain: 'This was a sentiment check with no on-chain action.',
    canRetry: false,
  };
}

/**
 * Plain-language pass/fail line for a completed proposal.
 * @param {object} p - transformed proposal
 */
export function outcomeHeadline(p = {}) {
  // Same three-way `isValid` caveat as outcomeProblem — don't assert a cause.
  if (p.isValid === false) return `No result — ${invalidReason(p).replace(/, so nothing changed\.$/, '')}`;
  const win = p.options?.[p.winningOption];
  if (!win) return 'Voting complete';
  const raw = Number(win.percentage) || 0;
  const support = Math.round(raw);
  // Compare raw, display rounded — and stay in step with outcomeProblem, or the
  // detail modal would say "Passed" over a card that says "Didn't pass".
  const passed = !p.thresholdPct || raw >= p.thresholdPct;
  return passed
    ? `Passed — "${win.name}" won with ${support}% support`
    : `Did not pass — "${win.name}" led with ${support}% but fell short`;
}

/**
 * Why a proposal came back `isValid === false`.
 *
 * `isValid` is a verdict, not a cause. It goes false for FOUR different
 * outcomes: nothing was counted, too few people voted, the top two TIED, or the
 * winner fell under the required share — so naming any one of them outright is
 * a guess. `quorum` IS a minimum voter count (`QuorumSet(uint32)`, and Argus
 * invalidated a 1-voter/100%-support proposal at quorum 2 with only 3 members,
 * which a percentage reading can't explain), and the contracts reject a
 * sub-quorum turnout BEFORE the support math ever runs.
 *
 * Neither the quorum nor the threshold in force AT THE TIME is recorded per
 * proposal, so we name a cause only where today's rules leave exactly one
 * standing: a turnout under quorum whose leader clears the support line can
 * only have failed on turnout, and vice versa. When both fit — or neither,
 * meaning the rules have moved since — say so plainly instead of inventing one.
 */
function invalidReason(p) {
  const shares = (p.options || []).map((o) => Number(o.percentage) || 0);
  const top = shares.length ? Math.max(...shares) : 0;
  if (top <= 0) return 'No votes were counted, so nothing changed.';
  // A tie is the one failure a member can read straight off the bars.
  if (shares.filter((s) => s === top).length > 1) {
    return 'Tied — no single option won, so nothing changed.';
  }
  // Absent votes we claim no turnout cause at all — `totalVotes` is a weight
  // sum for Direct Democracy, not a headcount, so it can't stand in here.
  const voted = Array.isArray(p.votes) ? p.votes.length : 0;
  const quorum = Number(p.quorum) || 0;
  const threshold = Number(p.thresholdPct) || 0;
  const turnoutShort = voted > 0 && quorum > 0 && voted < quorum;
  const supportShort = threshold > 0 && top < threshold;
  if (turnoutShort && !supportShort) {
    return 'Not enough of the group voted for this to count, so nothing changed.';
  }
  if (supportShort && !turnoutShort) {
    return 'No option reached the support this group requires, so nothing changed.';
  }
  return 'This vote didn\u2019t clear the group\u2019s rules, so nothing changed.';
}

/**
 * Failure sentence for a completed proposal, or null when it passed cleanly.
 *
 * Product direction (Hudson): a card spends a line ONLY when something went
 * wrong. A clean pass is signalled by the green seal beside the winning option
 * in ResultBars — "Passed — X won with 100% support" just re-narrates the bar
 * that is already on screen. The detail modal still gets the full headline
 * (see outcomeHeadline).
 *
 * Two families of failure: the result was never valid on-chain (see
 * invalidReason for why that is not the same as "missed quorum"), or it was
 * valid but the leader fell under this org's pass line.
 */
export function outcomeProblem(p = {}) {
  if (p.isValid === false) return invalidReason(p);
  const win = p.options?.[p.winningOption];
  // A winner the subgraph hasn't indexed yet is a data gap, not a failure —
  // reporting it as one would libel a vote that may well have passed.
  if (!win) return null;
  const threshold = Number(p.thresholdPct) || 0;
  if (threshold <= 0) return null;
  // Compare the RAW support, display the rounded one: 49.6% against a 50% line
  // rounds up to "50%" and would otherwise earn the green pass seal.
  const raw = Number(win.percentage) || 0;
  if (raw >= threshold) return null;
  // The bars right above already name the leading option — repeating it here
  // pushes the numbers, which are the point, past the card's 2-line clamp.
  return `Didn’t pass — ${Math.round(raw)}% support, under the ${Math.round(threshold)}% needed.`;
}

// ---------------------------------------------------------------------------
// Vote-celebration copy (VoteCelebration.jsx).
// ---------------------------------------------------------------------------

/** Shown in the ballot zone before casting — votes are public on-chain. */
export const BALLOT_PUBLIC_NOTE =
  'Your vote is public to your co-op — members can see who voted and how.';
/** One-liner bridging the two voting systems wherever the type badge appears. */
export const TYPE_EXPLAINER =
  "Polls count every member equally. Binding votes use your group's blended weights.";
/** Provenance suffix for creator-restricted ballots. */
export const RESTRICTION_PROVENANCE = 'chosen by the vote\u2019s creator';
/** Caption for results with very few ballots (panel: ghost-town optics). */
export function earlyResultCaption(voted, eligible) {
  const frac = eligible > 0 ? `${voted} of ${eligible}` : `${voted}`;
  return `Early result — ${frac} voted`;
}

export const CELEBRATION_HEADLINE = 'Your vote is in!';
/** `pct` = the viewer's total share of this decision. */
export function celebrationShare(pct) {
  if (pct == null || Number.isNaN(pct)) return null;
  return `Counted as ${Number(pct).toFixed(1)}% of this decision`;
}
export const CELEBRATION_YOUR_CHOICE = 'You voted:';
export const CELEBRATION_DONE = 'Done';
export const CELEBRATION_ERROR_TITLE = "Your vote didn't go through";
export const CELEBRATION_ERROR_BODY = 'Nothing was recorded. Try again.';
export const CELEBRATION_RETRY = 'Try again';

// ---------------------------------------------------------------------------
// Finalize-zone explainer (PollDetail section i).
// ---------------------------------------------------------------------------

export const FINALIZE_EXPLAINER =
  "Voting has ended. Counting records the final result on-chain — anyone can " +
  "do it, it doesn't change the outcome, and it can't be undone. If nobody " +
  "counts, the result simply waits — nothing is lost.";
/** Extra confirm-dialog sentence when the vote never reached quorum. */
export const FINALIZE_SUBQUORUM =
  "Quorum wasn't met, so counting records “no quorum” — no option wins and " +
  "nothing changes on-chain.";
export const FINALIZE_CONFIRM_TITLE = 'Count the votes?';
export const FINALIZE_CONFIRM_BODY =
  "This records the final tally on-chain. It doesn't change who won and can't be undone.";

/** Badge on binding (official) polls. */
export const BINDING_BADGE = 'BINDING';

/** Badge on non-binding (temperature-check) polls. */
export const POLL_BADGE = 'POLL';

/**
 * Short plain-language explanation of Blended voting — reused by the education
 * header footer and the VotePowerReceipt "how it works" panel.
 */
export const BLENDED_EXPLAINER =
  'Blended voting mixes two kinds of say. Every member gets an equal vote, ' +
  'and contributors get extra weight from the shares they have earned. Each ' +
  'class counts for a fixed slice of every decision, so members always have a ' +
  'voice while the people doing the work carry more influence.';

// ---------------------------------------------------------------------------
// Class-label helpers — used by VotePowerReceipt and the education header.
// A "class" is one on-chain voting class (strategy DIRECT or ERC20_BAL).
// ---------------------------------------------------------------------------

/**
 * Human label for a voting class, derived from its strategy + config.
 * `roleNames` (optional) is an array of resolved role names for a DIRECT
 * class's gating hats, used to make the label specific ("Founders — equal vote").
 */
export function classLabel(cls, roleNames = []) {
  if (!cls) return 'Voting class';
  if (cls.strategy === 'DIRECT') {
    if (roleNames && roleNames.length > 0) {
      const shown = roleNames.slice(0, 2).join(', ');
      const suffix = roleNames.length > 2 ? '…' : '';
      return `${shown}${suffix} — equal vote`;
    }
    return 'Members — equal vote';
  }
  // ERC20_BAL
  return cls.quadratic ? 'Contributors — shares, quadratic' : 'Contributors — shares';
}

/**
 * Short slice badge copy, e.g. "80% of every decision".
 */
export function sliceBadge(slicePct) {
  const n = slicePct == null ? 0 : Math.round(Number(slicePct));
  return `${n}% of every decision`;
}

/**
 * Reason copy for why a class does not count for this user yet.
 */
export function ineligibleCopy(reason, opts = {}) {
  switch (reason) {
    case 'below_min_balance':
      return opts.minLabel
        ? `below the ${opts.minLabel} minimum — this class doesn't count for you yet`
        : "below the minimum balance — this class doesn't count for you yet";
    case 'no_role':
      return "you don't hold an eligible role — this class doesn't count for you yet";
    case 'no_balance':
      return "you hold no shares — this class doesn't count for you yet";
    default:
      return "this class doesn't count for you yet";
  }
}

export default {
  displayName,
  taglineFor,
  thresholdLabel,
  quorumLabel,
  ELIGIBILITY_LABEL,
  COMPLETED_ELIGIBILITY_LABEL,
  FINALIZE_VERB,
  BINDING_BADGE,
  POLL_BADGE,
  BLENDED_EXPLAINER,
  classLabel,
  sliceBadge,
  ineligibleCopy,
  turnoutCopy,
  PRIOR_RULES_NOTE,
  priorRulesTooltip,
  passRuleCopy,
  supportCopy,
  STATUS_LIVE,
  STATUS_CLOSING_SOON,
  STATUS_AWAITING_COUNT,
  YOU_VOTED_CHIP,
  YOU_CAN_OPEN_CHIP,
  executionStatus,
  outcomeHeadline,
  outcomeProblem,
  CELEBRATION_HEADLINE,
  celebrationShare,
  CELEBRATION_YOUR_CHOICE,
  CELEBRATION_DONE,
  CELEBRATION_ERROR_TITLE,
  CELEBRATION_ERROR_BODY,
  CELEBRATION_RETRY,
  FINALIZE_EXPLAINER,
  FINALIZE_CONFIRM_TITLE,
  FINALIZE_CONFIRM_BODY,
};
