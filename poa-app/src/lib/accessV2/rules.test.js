import { describe, it, expect } from 'vitest';
import {
  normalizeRule,
  RULE_KIND,
  RULE_AUTHOR,
  RULE_KIND_ENUM,
  ELIG_SOURCE_BIT,
  decodeEligSources,
  removalBlockers,
  actionReasonName,
  actionReasonCopy,
  ACTION_REASON,
  ACTION_REASON_COPY,
  delegateCanOverride,
  renounceClearsRule,
  renounceCopy,
  STICKY_COPY,
} from './rules';
import { bobExecMembership, carolOffer } from './fixtures';

describe('normalizeRule / sticky', () => {
  it('reads the indexed sticky flag', () => {
    const r = normalizeRule(bobExecMembership().rule);
    expect(r.sticky).toBe(true);
    expect(r.author).toBe(RULE_AUTHOR.GOVERNANCE);
    expect(r.delegable).toBe(false);
    expect(r.present).toBe(true);
  });

  it('derives sticky when the field is absent — GRANT and governance and not delegable', () => {
    expect(normalizeRule({ kind: 'Grant', author: 'Governance', delegable: false }).sticky).toBe(true);
    expect(normalizeRule({ kind: 'Grant', author: 'Governance', delegable: true }).sticky).toBe(false);
    // A delegate-authored rule is never sticky, delegable flag notwithstanding.
    expect(normalizeRule({ kind: 'Grant', author: 'Delegated', delegable: false }).sticky).toBe(false);
  });

  it('a CLEARED slot is not sticky — `kind` is part of the formula, not decoration', () => {
    // clearRule leaves the slot but still emits RuleSet(kind=None, author=Governance,
    // delegable=false). An author/delegable-only derivation badges that empty slot as a live
    // sticky rule — the exact bug the subgraph mapping documents having been bitten by.
    expect(normalizeRule({ kind: 'None', author: 'Governance', delegable: false }).sticky).toBe(false);
    expect(normalizeRule({ kind: 'Ban', author: 'Governance', delegable: false }).sticky).toBe(false);
  });

  it('the derivation agrees with the indexed flag over the whole enum cross-product', () => {
    // The mapping's formula, verbatim: sticky = kind == "Grant" && author == "Governance" && !delegable
    for (const kind of ['None', 'Grant', 'Ban']) {
      for (const author of ['Governance', 'Delegated']) {
        for (const delegable of [true, false]) {
          const expected = kind === 'Grant' && author === 'Governance' && !delegable;
          const derived = normalizeRule({ kind, author, delegable }).sticky;
          const indexed = normalizeRule({ kind, author, delegable, sticky: expected }).sticky;
          expect(derived, `${kind}/${author}/${delegable}`).toBe(expected);
          expect(indexed).toBe(derived);
        }
      }
    }
  });

  it('a cleared slot is kind None and not present', () => {
    const r = normalizeRule({ kind: 'None', author: 'Governance', delegable: true });
    expect(r.present).toBe(false);
  });

  it('the uint8 enum matches the contract ordering', () => {
    expect(RULE_KIND_ENUM).toEqual({ None: 0, Grant: 1, Ban: 2 });
  });

  it('offers both sides of the sticky choice in plain words', () => {
    expect(STICKY_COPY.sticky.help).toMatch(/Only a vote|no manager/i);
    expect(STICKY_COPY.delegable.help).toMatch(/managers can remove/i);
  });
});

describe('delegateCanOverride — §2 supremacy', () => {
  it('any delegate may clear a delegate-authored rule', () => {
    expect(delegateCanOverride(normalizeRule(carolOffer().rule))).toBe(true);
  });

  it('a delegable governance grant may be cleared by a delegated remove', () => {
    expect(delegateCanOverride(normalizeRule({ kind: 'Grant', author: 'Governance', delegable: true }))).toBe(true);
  });

  it('a STICKY governance grant is untouchable by every delegate', () => {
    expect(delegateCanOverride(normalizeRule(bobExecMembership().rule))).toBe(false);
  });

  it('no rule at all is always overridable', () => {
    expect(delegateCanOverride(null)).toBe(true);
    expect(delegateCanOverride(normalizeRule({ kind: 'None' }))).toBe(true);
  });
});

describe('renounce semantics', () => {
  it('clears a delegable grant — the seat is given up', () => {
    const r = normalizeRule({ kind: 'Grant', author: 'Governance', delegable: true });
    expect(renounceClearsRule(r)).toBe(true);
    expect(renounceCopy(r)).toMatch(/new invitation/);
  });

  it('a STICKY grant survives — the seat is held in reserve, re-claimable', () => {
    const r = normalizeRule(bobExecMembership().rule);
    expect(renounceClearsRule(r)).toBe(false);
    expect(renounceCopy(r)).toMatch(/held in reserve|take it back/);
  });

  it('a BAN is not a grant, so renounce leaves nothing to reason about', () => {
    expect(renounceClearsRule(normalizeRule({ kind: RULE_KIND.BAN, author: 'Governance', delegable: false }))).toBe(true);
  });
});

describe('removal blockers — copy composed from contract data', () => {
  it('decodes the enum-SET (a member held by several sources reports all of them)', () => {
    const set = ELIG_SOURCE_BIT.DefaultAllow | ELIG_SOURCE_BIT.VouchQuorum;
    expect(decodeEligSources(set)).toEqual(['DefaultAllow', 'VouchQuorum']);
  });

  it('gives a source-accurate sentence per blocker', () => {
    const r = removalBlockers(ELIG_SOURCE_BIT.DefaultAllow);
    expect(r.messages[0]).toMatch(/open to everyone/);
    expect(r.mustBan).toBe(true);
  });

  it('a sticky governance grant cannot be resolved by banning — only a vote clears it', () => {
    const r = removalBlockers(ELIG_SOURCE_BIT.StickyGovernanceGrant);
    expect(r.messages[0]).toMatch(/only a vote/i);
    expect(r.mustBan).toBe(false);
  });

  it('an unblocked removal reports nothing', () => {
    expect(removalBlockers(0)).toEqual({ sources: [], messages: [], mustBan: false });
  });
});

describe('preflight reasons', () => {
  it('maps the ActionReason enum in the contract order', () => {
    expect(actionReasonName(0)).toBe('Ok');
    expect(actionReasonName(7)).toBe('RemovalIneffective');
    expect(actionReasonName(8)).toBe('NotYetActive');
    expect(actionReasonName(10)).toBe('RenouncedClaimable');
    expect(actionReasonName(99)).toBe('Unknown');
  });

  it('Ok is the only reason with no message', () => {
    expect(actionReasonCopy(0)).toEqual({ name: 'Ok', ok: true, message: null });
    expect(actionReasonCopy(5).message).toMatch(/full/);
  });

  it('has copy for every non-Ok reason (announceWinner swallows the revert — this is the UI channel)', () => {
    for (const [code, name] of Object.entries(ACTION_REASON)) {
      if (name === 'Ok') continue;
      expect(ACTION_REASON_COPY[name], `missing copy for ${code}/${name}`).toBeTruthy();
    }
  });
});
