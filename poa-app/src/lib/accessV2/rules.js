/**
 * accessV2/rules — the explicit-rule slot and the removal preflight (ACCESS-V2-SPEC.md §2 / §4).
 *
 * PURE.
 *
 * There is exactly ONE rule slot per (subject, user) — the slot IS the rule. No ALLOW/DENY
 * coexistence, no partial shapes:
 *
 *     { kind: None | Grant | Ban, author: Governance | Delegated, delegable: bool }
 *
 * STICKY has exactly ONE meaning in this system: `author == Governance && delegable == false`.
 * A sticky grant cannot be touched by any delegate and SURVIVES renounce. That single flag is what
 * keeps "Executives manage Members" alive while an election result stays governance-only.
 */

export const RULE_KIND = { NONE: 'None', GRANT: 'Grant', BAN: 'Ban' };
export const RULE_AUTHOR = { GOVERNANCE: 'Governance', DELEGATED: 'Delegated' };

/** uint8 values the contract takes for `setRule(subject, user, kind, delegable)`. */
export const RULE_KIND_ENUM = { None: 0, Grant: 1, Ban: 2 };

/** Normalise a subgraph AccessRule row. */
export function normalizeRule(raw) {
  if (!raw) return null;
  const kind = raw.kind || RULE_KIND.NONE;
  const author = raw.author || RULE_AUTHOR.GOVERNANCE;
  const delegable = Boolean(raw.delegable);
  return {
    id: raw.id,
    user: String(raw.user || '').toLowerCase(),
    kind,
    author,
    delegable,
    // Trust the indexed flag when present; otherwise derive it EXACTLY as the mapping does —
    // `kind == Grant && author == Governance && !delegable` (membership-authority.ts). The `kind`
    // term is not optional: `clearRule` leaves the slot but still emits RuleSet(kind=None,
    // author=Governance, delegable=false), so an author/delegable-only derivation badges a CLEARED
    // slot as a live sticky rule (the subgraph was bitten by exactly this).
    sticky: raw.sticky !== undefined
      ? Boolean(raw.sticky)
      : kind === RULE_KIND.GRANT && author === RULE_AUTHOR.GOVERNANCE && !delegable,
    present: kind !== RULE_KIND.NONE,
    managerSubject: raw.managerSubject || null,
    setAt: raw.setAt ? Number(raw.setAt) : null,
    clearedAt: raw.clearedAt ? Number(raw.clearedAt) : null,
  };
}

/** The sticky/delegable explainer the create-role wizard shows next to the choice. */
export const STICKY_COPY = {
  delegable: {
    label: 'Managers can change this later',
    help:
      'The role’s managers can remove or replace this person without another vote. This is the '
      + 'normal choice — it is what keeps day-to-day membership out of governance.',
  },
  sticky: {
    label: 'Only a vote can change this',
    help:
      'Locks the seat to governance: no manager can remove or replace this person, and the seat '
      + 'is even held in reserve if they resign. Use it for election results.',
  },
};

/**
 * Surviving-eligibility-source bitmask, as returned by `canRemove` and carried by the
 * `RemovalIneffective` revert. A member held by several sources reports all of them.
 * bit = 1 << uint8(EligSource).
 */
export const ELIG_SOURCE_BIT = {
  DefaultAllow: 1 << 0,
  VouchQuorum: 1 << 1,
  EmailVerified: 1 << 2,
  StickyGovernanceGrant: 1 << 3,
};

/**
 * SOURCE-ACCURATE removal copy, composed from contract data — never frontend guesswork.
 * Each variant names the ONE thing that has to change for a soft removal to bite.
 */
export const REMOVAL_BLOCKER_COPY = {
  DefaultAllow: 'This role is open to everyone — removing someone means blocking them.',
  VouchQuorum: 'They are still vouched for by enough members — block them, or revoke the vouches.',
  EmailVerified: 'They hold a live email verification — block them, or clear it.',
  StickyGovernanceGrant:
    'They are held by a non-delegable governance grant — only a vote can clear it.',
};

/** Decode the `sourceSet` bitmask into source names. */
export function decodeEligSources(sourceSet) {
  const n = Number(sourceSet || 0);
  return Object.entries(ELIG_SOURCE_BIT)
    .filter(([, bit]) => (n & bit) === bit)
    .map(([name]) => name);
}

/**
 * Turn a `canRemove` result into the sentence(s) the removal dialog shows.
 * @param {number} sourceSet
 * @returns {{ sources: string[], messages: string[], mustBan: boolean }}
 */
export function removalBlockers(sourceSet) {
  const sources = decodeEligSources(sourceSet);
  return {
    sources,
    messages: sources.map((s) => REMOVAL_BLOCKER_COPY[s]).filter(Boolean),
    // Only governance can clear a sticky grant, so a delegate cannot resolve that one by banning.
    mustBan: sources.length > 0 && !sources.includes('StickyGovernanceGrant'),
  };
}

/** Mirrors `AccessV2Types.ActionReason` — the preflight reason codes for canGrant/canRemove/canClaim. */
export const ACTION_REASON = {
  0: 'Ok',
  1: 'UnknownSubject',
  2: 'NotInOrg',
  3: 'AlreadyMember',
  4: 'NotMember',
  5: 'SubjectFull',
  6: 'BlockedByGovernanceBan',
  7: 'RemovalIneffective',
  8: 'NotYetActive',
  9: 'NoRuleToClaim',
  10: 'RenouncedClaimable',
  11: 'Paused',
};

/**
 * One place that turns a preflight reason into user copy. `announceWinner` swallows inner reverts,
 * so the builders call the preflights BEFORE composing a batch and show this instead of letting a
 * proposal pass and silently do nothing.
 */
export const ACTION_REASON_COPY = {
  Ok: null,
  UnknownSubject: 'That role or group does not exist.',
  NotInOrg:
    'They are not in the org yet, so this becomes an invitation they have to accept rather than a direct add.',
  AlreadyMember: 'They already hold this role.',
  NotMember: 'They do not hold this role.',
  SubjectFull: 'This role is full. Free a seat first, or raise the seat limit.',
  BlockedByGovernanceBan: 'A governance block is in place — only a vote can lift it.',
  RemovalIneffective: 'Removing them would not take effect — they still qualify another way.',
  NotYetActive: 'This is still in its review window — it can be accepted once the countdown ends.',
  NoRuleToClaim: 'There is nothing to claim here.',
  RenouncedClaimable: 'You resigned from this role, but the seat is still held for you — you can take it back.',
  Paused: 'Membership changes are paused for this org right now.',
};

export function actionReasonName(reason) {
  return ACTION_REASON[Number(reason)] ?? 'Unknown';
}

export function actionReasonCopy(reason) {
  const name = actionReasonName(reason);
  return { name, ok: name === 'Ok', message: ACTION_REASON_COPY[name] ?? null };
}

/**
 * Can a DELEGATE act on this rule? §2 supremacy, restated:
 *   • no rule            -> yes
 *   • delegate-authored  -> yes (any delegate of the subject may cancel/clear/replace it)
 *   • governance + delegable -> yes (a delegated remove may clear or replace it)
 *   • governance + sticky    -> NO (untouchable by every delegate)
 */
export function delegateCanOverride(rule) {
  if (!rule || !rule.present) return true;
  if (rule.author === RULE_AUTHOR.DELEGATED) return true;
  return Boolean(rule.delegable);
}

/**
 * Does renounce clear the grant, or is the seat held in reserve?
 * Renounce clears `accepted` AND the explicit grant when the grant is clearable — any
 * delegated-authored grant and any governance grant with delegable = true. A sticky grant survives.
 */
export function renounceClearsRule(rule) {
  if (!rule || !rule.present || rule.kind !== RULE_KIND.GRANT) return true;
  if (rule.author === RULE_AUTHOR.DELEGATED) return true;
  return Boolean(rule.delegable);
}

export function renounceCopy(rule) {
  return renounceClearsRule(rule)
    ? 'Leaving this role gives up your seat. You would need a new invitation to come back.'
    : 'Leaving this role holds your seat in reserve — you can take it back at any time until a vote clears it.';
}
