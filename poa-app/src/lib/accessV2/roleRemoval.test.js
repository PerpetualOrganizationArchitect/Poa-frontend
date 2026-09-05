import { describe, expect, it } from 'vitest';
import {
  buildRoleRemovalCopy,
  buildRoleRemovalSummaries,
  removalBanReasons,
  removalNeedsBan,
  roleRemovalConfigError,
  MAX_ROLE_REMOVALS,
  preflightRoleRemovals,
  retainBanConfirmation,
  roleRemovalGasFloorFromProposal,
} from './roleRemoval';
import { AUTHORITY_ADDRESS as A, ALICE, BOB, EXECS_ID } from './fixtures';
import { estimateBatchGas } from './proposalBuilders';

describe('the soft-removal mirror', () => {
  it('matches the three surviving sources checked by MembershipAuthority.canRemove', () => {
    expect(removalBanReasons({
      emailVerified: true,
      vouchMet: true,
      subject: { defaultAllow: true },
    })).toEqual(['verified email', 'live vouches', 'an open role']);
  });

  it('uses a soft removal for a plain explicit grant', () => {
    expect(removalNeedsBan({
      emailVerified: false,
      vouchMet: false,
      subject: { defaultAllow: false },
      rule: { kind: 'Grant' },
    })).toBe(false);
  });

  it('requires a hard removal when any surviving source would restore eligibility', () => {
    expect(removalNeedsBan({ emailVerified: true, subject: { defaultAllow: false } })).toBe(true);
    expect(removalNeedsBan({ vouchMet: true, subject: { defaultAllow: false } })).toBe(true);
    expect(removalNeedsBan({ subject: { defaultAllow: true } })).toBe(true);
  });
});

describe('roleRemovalConfigError', () => {
  const base = {
    subjectId: EXECS_ID,
    subjectName: 'Executives',
    members: [{ address: ALICE }],
    liveReconciled: true,
  };

  it('requires a role and at least one person', () => {
    expect(roleRemovalConfigError({ members: base.members })).toBe('Please select a role.');
    expect(roleRemovalConfigError({ ...base, members: [] }))
      .toBe('Select at least one person to remove.');
  });

  it('holds restored or deep-linked rows until the live roster has reconciled', () => {
    expect(roleRemovalConfigError({ ...base, liveReconciled: false }))
      .toBe('Wait for the current role holders to finish loading.');
    expect(roleRemovalConfigError({ ...base, liveReconciled: true })).toBeNull();
  });

  it('rejects malformed subject ids and the zero address in restored drafts', () => {
    expect(roleRemovalConfigError({ ...base, subjectId: 'not-a-role' })).toMatch(/invalid id/);
    expect(roleRemovalConfigError({
      ...base,
      members: [{ address: `0x${'0'.repeat(40)}` }],
    })).toMatch(/zero address/);
  });

  it('accepts exactly the on-chain batch ceiling and refuses one more', () => {
    const members = Array.from({ length: MAX_ROLE_REMOVALS }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, '0')}`,
    }));
    expect(roleRemovalConfigError({ ...base, members })).toBeNull();
    expect(roleRemovalConfigError({ ...base, members: [...members, { address: BOB }] }))
      .toMatch(/at most 20/);
  });

  it('requires explicit confirmation before encoding a governance ban', () => {
    expect(roleRemovalConfigError({
      ...base,
      members: [{ address: ALICE, ban: true }],
    })).toMatch(/Confirm.*block/i);
    expect(roleRemovalConfigError({
      ...base,
      members: [{ address: ALICE, ban: true }],
      confirmBans: true,
    })).toBeNull();
  });
});

describe('retainBanConfirmation', () => {
  const soft = { address: ALICE, ban: false };
  const hard = { address: BOB, ban: true };
  const anotherHard = { address: '0x0000000000000000000000000000000000000456', ban: true };

  it('preserves consent only while the exact durable-ban target set is unchanged', () => {
    expect(retainBanConfirmation([hard], [hard, soft], true)).toBe(true);
    expect(retainBanConfirmation([hard, soft], [hard], true)).toBe(true);
    expect(retainBanConfirmation([hard], [hard, anotherHard], true)).toBe(false);
    expect(retainBanConfirmation([hard, anotherHard], [hard], true)).toBe(false);
  });

  it('resets when live reconciliation changes a target between soft and hard removal', () => {
    expect(retainBanConfirmation([soft], [{ ...soft, ban: true }], true)).toBe(false);
    expect(retainBanConfirmation([hard], [{ ...hard, ban: false }], true)).toBe(false);
    expect(retainBanConfirmation([], [], true)).toBe(false);
    expect(retainBanConfirmation([hard], [hard], false)).toBe(false);
  });
});

describe('buildRoleRemovalCopy', () => {
  it('names one person and states the durable block when required', () => {
    expect(buildRoleRemovalCopy({
      subjectId: EXECS_ID,
      subjectName: 'Executives',
      members: [{ address: ALICE, username: 'alice', ban: true }],
    })).toEqual({
      title: 'Remove alice from Executives',
      description: 'If approved, remove alice from Executives. They will also be blocked from reclaiming it until another vote unblocks them.',
    });
  });

  it('keeps a large batch title compact and quantifies mixed hard removals', () => {
    const copy = buildRoleRemovalCopy({
      subjectId: EXECS_ID,
      subjectName: 'Contributors',
      members: [
        { address: ALICE, ban: false },
        { address: BOB, ban: true },
      ],
    });
    expect(copy.title).toBe('Remove 2 people from Contributors');
    expect(copy.description).toContain('1 person will also be blocked');
  });
});

describe('portable role-removal gas metadata', () => {
  it('records the atomic call count in human-readable summaries', () => {
    const summaries = buildRoleRemovalSummaries({
      subjectName: 'Executives',
      members: [
        { address: ALICE, username: 'alice', ban: false },
        { address: BOB, username: 'bob', ban: true },
      ],
    });
    expect(summaries[0]).toBe('Remove 2 role memberships in one atomic batch.');
    expect(summaries[2]).toMatch(/block them/);
  });

  it('recovers the 20-call 5.4m floor on another device and ignores unrelated metadata', () => {
    expect(roleRemovalGasFloorFromProposal({
      actionSummaries: ['Remove 1 role membership in one atomic batch.'],
    })).toBe(estimateBatchGas([{}]));
    expect(roleRemovalGasFloorFromProposal({
      actionSummaries: ['Remove 20 role memberships in one atomic batch.'],
    })).toBe(estimateBatchGas(Array.from({ length: 20 }, () => ({}))));
    expect(estimateBatchGas(Array.from({ length: 20 }, () => ({})))).toBe(5_400_000);
    expect(roleRemovalGasFloorFromProposal({ actionSummaries: ['Remove a permission from Editors'] }))
      .toBeNull();
    expect(roleRemovalGasFloorFromProposal({
      actionSummaries: ['Remove 21 role memberships in one atomic batch.'],
    })).toBeNull();
  });
});

describe('preflightRoleRemovals', () => {
  const config = {
    subjectId: EXECS_ID,
    subjectName: 'Executives',
    members: [
      { address: ALICE, username: 'alice', ban: false },
      { address: BOB, username: 'bob', ban: true },
    ],
    confirmBans: true,
    liveReconciled: true,
  };

  it('checks every selected pair in soft mode to refresh whether a block is required', async () => {
    const calls = [];
    const membershipAuthority = {
      canRemove: async (...args) => {
        calls.push(args);
        return { reason: args[2] === BOB ? 7 : 0, sourceSet: args[2] === BOB ? 4 : 0 };
      },
    };

    await expect(preflightRoleRemovals({ membershipAuthority, authority: A, config }))
      .resolves.toHaveLength(2);
    expect(calls).toEqual([
      [A, EXECS_ID, ALICE, false],
      [A, EXECS_ID, BOB, false],
    ]);
  });

  it('stops an atomic batch when a person is stale or newly needs a block', async () => {
    await expect(preflightRoleRemovals({
      membershipAuthority: { canRemove: async () => ({ reason: 4, sourceSet: 0 }) },
      authority: A,
      config: { ...config, members: [config.members[0]] },
    })).rejects.toThrow(/alice no longer holds/i);

    await expect(preflightRoleRemovals({
      membershipAuthority: { canRemove: async () => ({ reason: 7, sourceSet: 1 }) },
      authority: A,
      config: { ...config, members: [config.members[0]] },
    })).rejects.toThrow(/normal removal would not work/i);
  });

  it('rejects an obsolete hard removal instead of creating an unnecessary durable ban', async () => {
    await expect(preflightRoleRemovals({
      membershipAuthority: { canRemove: async () => ({ reason: 0, sourceSet: 0 }) },
      authority: A,
      config: { ...config, members: [config.members[1]] },
    })).rejects.toThrow(/no longer needs a governance block/i);
  });

  it('fails closed when the live preflight service cannot be read', async () => {
    await expect(preflightRoleRemovals({
      membershipAuthority: null,
      authority: A,
      config: { ...config, members: [config.members[0]] },
    })).rejects.toThrow(/still loading/i);

    await expect(preflightRoleRemovals({
      membershipAuthority: { canRemove: async () => { throw new Error('rpc down'); } },
      authority: A,
      config: { ...config, members: [config.members[0]] },
    })).rejects.toThrow(/Could not verify/i);
  });
});
