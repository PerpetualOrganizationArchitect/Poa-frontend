import { describe, it, expect } from 'vitest';
import {
  isTaskMine,
  projectCanReview,
  taskNeedsReview,
  userCanReviewAnywhere,
  hasPendingApplication,
} from './taskIndicators';

const AGENT = '30222100625258283641858621132055137413908072809768050515156576961036288';
const APPRENTICE = '30222100625264560743594007812818973203331280476184152870601040995549184';
const MANAGER = '0xc04c860454e73a9ba524783acbc7f7d6f5767eb6';
const EXECUTOR = '0x9116bb47ef766cd867151fee8823e662da3bdad9';

const reviewPerm = (hatId) => ({ hatId, mask: 15, canCreate: true, canClaim: true, canReview: true, canAssign: true });
const claimPerm = (hatId) => ({ hatId, mask: 2, canCreate: false, canClaim: true, canReview: false, canAssign: false });

// Argus "Docs": Agent can review, Apprentice cannot. Agent is roleHatIds[0].
const REVIEWABLE = {
  id: 'p1',
  rolePermissions: [reviewPerm(AGENT), claimPerm(APPRENTICE)],
  globalRolePermissions: [],
  managers: [],
};

// Argus governance-only project: no masks, only the Executor as manager.
const GOVERNANCE_ONLY = {
  id: 'p2', rolePermissions: [], globalRolePermissions: [], managers: [EXECUTOR],
};

// Argus "Hudson": no masks, but a real human manager.
const MANAGED = {
  id: 'p3', rolePermissions: [], globalRolePermissions: [], managers: [MANAGER],
};

describe('projectCanReview', () => {
  it('follows the REVIEW bit, not role order', () => {
    expect(projectCanReview(REVIEWABLE, [AGENT], '0xagent')).toBe(true);
    expect(projectCanReview(REVIEWABLE, [APPRENTICE], '0xapprentice')).toBe(false);
  });

  it('grants a project manager review even with no masks configured', () => {
    expect(projectCanReview(MANAGED, [], MANAGER)).toBe(true);
    expect(projectCanReview(MANAGED, [], MANAGER.toUpperCase())).toBe(true);
  });

  it('denies everyone on a governance-only project', () => {
    expect(projectCanReview(GOVERNANCE_ONLY, [AGENT], '0xagent')).toBe(false);
    expect(projectCanReview(GOVERNANCE_ONLY, [APPRENTICE], MANAGER)).toBe(false);
  });
});

describe('taskNeedsReview', () => {
  const AGENT_ADDR = '0x1111111111111111111111111111111111111111';

  it('is only ever true in the inReview column', () => {
    expect(taskNeedsReview('inReview', REVIEWABLE, [AGENT], AGENT_ADDR)).toBe(true);
    for (const col of ['open', 'inProgress', 'completed']) {
      expect(taskNeedsReview(col, REVIEWABLE, [AGENT], AGENT_ADDR)).toBe(false);
    }
  });

  // completeTask needs SELF_REVIEW when the reviewer is the claimer (PMs exempt), so
  // flagging your own submission would advertise an action the app refuses.
  it('does not flag the viewer\'s OWN submission without SELF_REVIEW', () => {
    const mine = { claimedBy: AGENT_ADDR.toUpperCase() };
    expect(taskNeedsReview('inReview', REVIEWABLE, [AGENT], AGENT_ADDR, mine)).toBe(false);
  });

  it('still flags someone else\'s submission', () => {
    const theirs = { claimedBy: '0x2222222222222222222222222222222222222222' };
    expect(taskNeedsReview('inReview', REVIEWABLE, [AGENT], AGENT_ADDR, theirs)).toBe(true);
  });

  it('flags the viewer\'s own submission when they DO hold SELF_REVIEW', () => {
    const selfReviewer = {
      ...REVIEWABLE,
      rolePermissions: [{ hatId: AGENT, mask: 20, canReview: true, canSelfReview: true }],
    };
    const mine = { claimedBy: AGENT_ADDR };
    expect(taskNeedsReview('inReview', selfReviewer, [AGENT], AGENT_ADDR, mine)).toBe(true);
  });

  it('flags a project manager\'s own submission (the contract exempts PMs)', () => {
    const mine = { claimedBy: MANAGER };
    expect(taskNeedsReview('inReview', MANAGED, [], MANAGER, mine)).toBe(true);
  });

  it('keeps the plain REVIEW answer when no task is supplied', () => {
    expect(taskNeedsReview('inReview', REVIEWABLE, [AGENT], AGENT_ADDR)).toBe(true);
  });
});

describe('userCanReviewAnywhere', () => {
  it('is true when at least one project grants review', () => {
    expect(userCanReviewAnywhere([GOVERNANCE_ONLY, REVIEWABLE], [AGENT], '0xagent')).toBe(true);
  });

  it('is false when no project does', () => {
    expect(userCanReviewAnywhere([GOVERNANCE_ONLY, REVIEWABLE], [APPRENTICE], '0xapprentice')).toBe(false);
    expect(userCanReviewAnywhere([], [AGENT], '0xagent')).toBe(false);
    expect(userCanReviewAnywhere(null, [AGENT], '0xagent')).toBe(false);
  });

  it('is true for a manager of one project even with no hats at all', () => {
    expect(userCanReviewAnywhere([GOVERNANCE_ONLY, MANAGED], [], MANAGER)).toBe(true);
  });
});

describe('isTaskMine', () => {
  it('matches on claimer address or username, case-insensitively', () => {
    expect(isTaskMine({ claimedBy: MANAGER.toUpperCase() }, MANAGER, '')).toBe(true);
    expect(isTaskMine({ claimerUsername: 'Hudson' }, '', 'hudson')).toBe(true);
    expect(isTaskMine({ claimedBy: EXECUTOR }, MANAGER, 'hudson')).toBe(false);
    expect(isTaskMine(null, MANAGER, 'hudson')).toBe(false);
  });
});

describe('hasPendingApplication', () => {
  it('ignores already-approved applications', () => {
    const task = { applicants: [{ address: MANAGER, approved: true }] };
    expect(hasPendingApplication(task, MANAGER, '')).toBe(false);
  });

  it('finds a pending application by address or username', () => {
    expect(hasPendingApplication({ applicants: [{ address: MANAGER }] }, MANAGER, '')).toBe(true);
    expect(hasPendingApplication({ applicants: [{ username: 'Hudson' }] }, '', 'hudson')).toBe(true);
  });
});
