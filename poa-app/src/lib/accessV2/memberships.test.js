import { describe, it, expect } from 'vitest';
import {
  normalizeMembership,
  normalizeMemberships,
  claimableMemberships,
  activeMemberships,
  isHeldInReserve,
  activationGate,
  activationGateCopy,
  eligibilityCopy,
  ELIGIBILITY_SOURCE,
  groupBySubject,
} from './memberships';
import { normalizeRule } from './rules';
import {
  aliceMembership,
  bobExecMembership,
  bobRenouncedStickySeat,
  carolOffer,
  EXECS_ID,
  MEMBERS_ID,
} from './fixtures';

describe('normalizeMembership', () => {
  it('mirrors the fold: isMember = accepted && eligible', () => {
    const m = normalizeMembership(aliceMembership());
    expect(m.accepted).toBe(true);
    expect(m.eligible).toBe(true);
    expect(m.isMember).toBe(true);
    expect(m.claimable).toBe(false);
  });

  it('a claimable seat is eligible but NOT accepted', () => {
    const m = normalizeMembership(carolOffer());
    expect(m.isMember).toBe(false);
    expect(m.claimable).toBe(true);
    expect(m.eligibilitySource).toBe(ELIGIBILITY_SOURCE.EXPLICIT_GRANT);
  });

  it('keeps the legacy projection (hatId / wearing)', () => {
    const m = normalizeMembership(bobExecMembership());
    expect(m.hatId).toBe(EXECS_ID);
    expect(m.wearing).toBe(true);
  });

  it('flags a paused-window seed rather than rendering a bogus join date', () => {
    // On-chain seeds while paused are backdated to acceptedAt = 1; the event carries no timestamp.
    const m = normalizeMembership(aliceMembership({ seededWhilePaused: true, acceptedAt: '1' }));
    expect(m.seededWhilePaused).toBe(true);
  });

  it('drops garbage rows', () => {
    expect(normalizeMembership(null)).toBeNull();
    expect(normalizeMemberships([null, aliceMembership()])).toHaveLength(1);
  });
});

describe('claimable rows carry WHY', () => {
  const rows = () => normalizeMemberships([aliceMembership(), bobExecMembership(), carolOffer()]);

  it('filters to !accepted && eligible', () => {
    const c = claimableMemberships(rows());
    expect(c).toHaveLength(1);
    expect(c[0].subjectId).toBe(EXECS_ID);
  });

  it('attaches the source badge and sentence', () => {
    const [c] = claimableMemberships(rows());
    expect(c.badge).toBe('Invited');
    expect(c.why).toMatch(/granted this role by a vote/);
  });

  it('has copy for every source in the enum', () => {
    for (const source of Object.values(ELIGIBILITY_SOURCE)) {
      const copy = eligibilityCopy(source);
      expect(copy.badge).toBeTruthy();
      expect(copy.why).toBeTruthy();
    }
  });

  it('distinguishes an OPEN role from an invitation', () => {
    const open = normalizeMembership(
      aliceMembership({ accepted: false, isMember: false, claimable: true, eligibilitySource: 'SubjectDefault' })
    );
    const [c] = claimableMemberships([open]);
    expect(c.badge).toBe('Open role');
  });

  it('activeMemberships keeps only real members', () => {
    expect(activeMemberships(rows()).map((m) => m.user)).toHaveLength(2);
  });
});

describe('isHeldInReserve — the sticky seat that survives renounce', () => {
  const row = (raw) => ({ ...normalizeMembership(raw), rule: normalizeRule(raw.rule) });

  it('is true for a resigned seat held by a sticky governance grant', () => {
    expect(isHeldInReserve(row(bobRenouncedStickySeat()))).toBe(true);
  });

  it('does NOT require acceptedAt — the mapping nulls it on the renounce burn', () => {
    // The regression this pins: `claimable && sticky && acceptedAt` made the state permanently
    // unreachable, because renounce runs `_flipOff` (zeroes acceptedAt on chain) and
    // membership-authority.ts mirrors it with `membership.acceptedAt = null`. Every real row this
    // state describes therefore arrives with acceptedAt null.
    const raw = bobRenouncedStickySeat();
    expect(raw.acceptedAt, 'fixture must match what the mapping actually emits').toBeNull();
    expect(row(raw).acceptedAt).toBeNull();
    expect(isHeldInReserve(row(raw))).toBe(true);
  });

  it('is false for a plain delegable invitation (never previously held)', () => {
    expect(isHeldInReserve(row(carolOffer()))).toBe(false);
  });

  it('is false while the row is still a MEMBER — nothing has been given up yet', () => {
    expect(isHeldInReserve(row(bobExecMembership()))).toBe(false);
  });

  it('is false while an OPEN pending entry owns the row — mirrors the contract’s `pid == 0`', () => {
    // A delegated offer in its review window is mid-ceremony; the countdown copy owns that row.
    const raw = bobRenouncedStickySeat({
      pendingAction: {
        id: 'p-1', pendingId: '9', action: 'Offer', actor: '0x0', activatesAt: '1750100000',
        status: 'Pending',
      },
    });
    expect(isHeldInReserve(row(raw))).toBe(false);
  });

  it('is true again once that pending entry is resolved', () => {
    for (const status of ['Cancelled', 'Voided', 'Finalized']) {
      const raw = bobRenouncedStickySeat({
        pendingAction: { id: 'p-1', pendingId: '9', action: 'Offer', activatesAt: '1', status },
      });
      expect(isHeldInReserve(row(raw)), status).toBe(true);
    }
  });

  it('matches the contract’s RenouncedClaimable flags exactly (Grant + Governance + !delegable)', () => {
    // `sticky` is the subgraph's fold of those three; anything else is NOT held in reserve.
    const notSticky = [
      { kind: 'Grant', author: 'Governance', delegable: true, sticky: false },
      { kind: 'Grant', author: 'Delegated', delegable: false, sticky: false },
      { kind: 'Ban', author: 'Governance', delegable: false, sticky: false },
    ];
    for (const rule of notSticky) {
      const raw = bobRenouncedStickySeat({ rule: { id: 'r', ...rule } });
      expect(isHeldInReserve(row(raw)), JSON.stringify(rule)).toBe(false);
    }
  });
});

describe('activationGate — the electorate activation gate', () => {
  it('treats seededWhilePaused rows as backdated to 1 (ceremony members vote on in-flight proposals)', () => {
    // On-chain the seed writes acceptedAt = 1; the subgraph stores the indexed timestamp + a flag.
    const seeded = [{ isMember: true, acceptedAt: 1756200000, seededWhilePaused: true }];
    const out = activationGate(seeded, 1700000000); // proposal long before the seed batch indexed
    expect(out.canVote).toBe(true);
    expect(out.activeSince).toBe(1);
  });

  it('still gates a post-cutover claimant off pre-claim proposals', () => {
    const claimed = [{ isMember: true, acceptedAt: 1756200000, seededWhilePaused: false }];
    const out = activationGate(claimed, 1700000000);
    expect(out.canVote).toBe(false);
    expect(out.reason).toBe('joined-after-proposal');
  });

  const at = (t) => normalizeMembership(aliceMembership({ acceptedAt: String(t) }));

  it('lets a member who joined BEFORE the proposal vote', () => {
    const g = activationGate([at(1000)], 2000);
    expect(g).toEqual({ canVote: true, activeSince: 1000, reason: null });
  });

  it('blocks a member who joined AFTER the proposal was created', () => {
    const g = activationGate([at(3000)], 2000);
    expect(g.canVote).toBe(false);
    expect(g.reason).toBe('joined-after-proposal');
  });

  it('EARLIEST activation governs when several roles qualify', () => {
    // One pre-proposal role plus one post-proposal role passes.
    const g = activationGate([at(3000), at(1000)], 2000);
    expect(g).toEqual({ canVote: true, activeSince: 1000, reason: null });
  });

  it('a non-member cannot vote', () => {
    const notAMember = normalizeMembership(carolOffer());
    expect(activationGate([notAMember], 2000).reason).toBe('not-a-member');
  });

  it('reads as policy, not as a bug', () => {
    const g = activationGate([at(3000)], 2000);
    const copy = activationGateCopy(g, 2000);
    expect(copy).toMatch(/You joined after this proposal was created/);
    expect(activationGateCopy({ canVote: true }, 2000)).toBeNull();
  });
});

describe('groupBySubject', () => {
  it('buckets rows by subject id', () => {
    const map = groupBySubject(normalizeMemberships([aliceMembership(), bobExecMembership()]));
    expect(map.get(MEMBERS_ID)).toHaveLength(1);
    expect(map.get(EXECS_ID)).toHaveLength(1);
  });
});
