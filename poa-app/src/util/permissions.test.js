import { describe, it, expect } from 'vitest';
import {
  TaskPermission,
  hasPermission,
  userWearsAnyHat,
  userHasEffectiveTaskPermission,
  userIsProjectManager,
  projectTaskPermissions,
  permissionGate,
  taskEditRights,
  PERMISSION_MESSAGES,
} from './permissions';

/**
 * Fixtures are transcribed from the LIVE Gnosis subgraph (2026-08-20), not invented.
 * The point of this file is that role ORDER carries no authority: Argus deployed its
 * senior role first, so any `roleHatIds[1]`-shaped gate is inverted there.
 */

// --- Argus (real org; roleHatIds = [Agent, Apprentice, ELIGIBILITY_ADMIN]) -------
const AGENT = '30222100625258283641858621132055137413908072809768050515156576961036288';
const APPRENTICE = '30222100625264560743594007812818973203331280476184152870601040995549184';
const ARGUS_EXECUTOR = '0x9116bb47ef766cd867151fee8823e662da3bdad9';
const ARGUS_MEMBER = '0xc04c860454e73a9ba524783acbc7f7d6f5767eb6';

/** mask -> the subgraph's expanded can* booleans, so fixtures stay honest. */
function perm(hatId, mask) {
  return {
    hatId,
    mask,
    canCreate: (mask & TaskPermission.CREATE) !== 0,
    canClaim: (mask & TaskPermission.CLAIM) !== 0,
    canReview: (mask & TaskPermission.REVIEW) !== 0,
    canAssign: (mask & TaskPermission.ASSIGN) !== 0,
    canSelfReview: (mask & TaskPermission.SELF_REVIEW) !== 0,
    canBudget: (mask & TaskPermission.BUDGET) !== 0,
    canEditMeta: (mask & TaskPermission.EDIT_META) !== 0,
    canEditFull: (mask & TaskPermission.EDIT_FULL) !== 0,
  };
}

// "Docs": Agent mask 15 (CREATE|CLAIM|REVIEW|ASSIGN), Apprentice mask 2 (CLAIM).
const ARGUS_DOCS = {
  rolePermissions: [perm(AGENT, 15), perm(APPRENTICE, 2)],
  globalRolePermissions: [], // Argus has none
  managers: ['0x451563ab9b5b4e8dfaa602f5e7890089edf6bf10'],
};

// "Portfolio v5 …": no role permissions at all, and the only manager is the
// Executor contract — i.e. governance-only. 7 of Argus's 16 projects look like this.
const ARGUS_GOVERNANCE_ONLY = {
  rolePermissions: [],
  globalRolePermissions: [],
  managers: [ARGUS_EXECUTOR],
};

// "Hudson": no role permissions, but a real human manager.
const ARGUS_MANAGER_ONLY = {
  rolePermissions: [],
  globalRolePermissions: [],
  managers: [ARGUS_MEMBER],
};

// --- Test6 (default-template org; roleHatIds = [Member, Executive, …]) ----------
const T6_MEMBER = '29035862971903655586674243772344327311664727652070589302159213246545920';
const T6_EXEC = '29035862971903655490893272468226273664268038455176265325988018110070784';

// Executive: project mask 15; Member: project mask 2 (CLAIM).
// Executive ALSO has global mask 160 = BUDGET|EDIT_FULL (a governance ROLE_PERM grant).
const TEST6_PROJECT = {
  rolePermissions: [perm(T6_EXEC, 15), perm(T6_MEMBER, 2)],
  globalRolePermissions: [perm(T6_EXEC, 160)],
  managers: [],
};

describe('hasPermission', () => {
  it('matches the TaskPerm bit values', () => {
    expect(TaskPermission.CREATE).toBe(1);
    expect(TaskPermission.CLAIM).toBe(2);
    expect(TaskPermission.REVIEW).toBe(4);
    expect(TaskPermission.ASSIGN).toBe(8);
    expect(TaskPermission.SELF_REVIEW).toBe(16);
    expect(TaskPermission.BUDGET).toBe(32);
    expect(TaskPermission.EDIT_META).toBe(64);
    expect(TaskPermission.EDIT_FULL).toBe(128);
  });

  it('tests a single bit out of a mask', () => {
    expect(hasPermission(15, TaskPermission.ASSIGN)).toBe(true);
    expect(hasPermission(15, TaskPermission.BUDGET)).toBe(false);
    expect(hasPermission(2, TaskPermission.CLAIM)).toBe(true);
  });
});

describe('userWearsAnyHat', () => {
  it('compares hex, decimal and BigInt forms of the same hat', () => {
    expect(userWearsAnyHat([AGENT], [BigInt(AGENT).toString()])).toBe(true);
    expect(userWearsAnyHat([AGENT], ['0x' + BigInt(AGENT).toString(16)])).toBe(true);
    expect(userWearsAnyHat([AGENT], [APPRENTICE])).toBe(false);
  });

  it('is false for empty inputs', () => {
    expect(userWearsAnyHat([], [AGENT])).toBe(false);
    expect(userWearsAnyHat([AGENT], [])).toBe(false);
  });
});

describe('userHasEffectiveTaskPermission (_permMask mirror)', () => {
  it('falls back to the global mask when the hat has no project mask', () => {
    // Test6 Executive holds EDIT_FULL globally but not on a project with a mask.
    expect(userHasEffectiveTaskPermission(
      [T6_EXEC], [], TEST6_PROJECT.globalRolePermissions, 'canEditFull',
    )).toBe(true);
  });

  it('lets a NON-ZERO project mask REPLACE the global mask, not OR with it', () => {
    // Executive: project mask 15 has no EDIT_FULL bit, so the global 160 is shadowed.
    expect(userHasEffectiveTaskPermission(
      [T6_EXEC],
      TEST6_PROJECT.rolePermissions,
      TEST6_PROJECT.globalRolePermissions,
      'canEditFull',
    )).toBe(false);
    // …while the project mask's own bits still resolve.
    expect(userHasEffectiveTaskPermission(
      [T6_EXEC], TEST6_PROJECT.rolePermissions, TEST6_PROJECT.globalRolePermissions, 'canReview',
    )).toBe(true);
  });
});

describe('userIsProjectManager (_isPM mirror)', () => {
  it('matches case-insensitively (subgraph lowercases, wagmi checksums)', () => {
    expect(userIsProjectManager(ARGUS_MANAGER_ONLY, ARGUS_MEMBER.toUpperCase())).toBe(true);
    expect(userIsProjectManager(ARGUS_MANAGER_ONLY, ARGUS_MEMBER)).toBe(true);
  });

  it('is false for a non-manager, a missing address, and a missing project', () => {
    expect(userIsProjectManager(ARGUS_MANAGER_ONLY, ARGUS_EXECUTOR)).toBe(false);
    expect(userIsProjectManager(ARGUS_MANAGER_ONLY, null)).toBe(false);
    expect(userIsProjectManager(undefined, ARGUS_MEMBER)).toBe(false);
  });

  it('is false when managers have not loaded yet', () => {
    expect(userIsProjectManager({ ...ARGUS_MANAGER_ONLY, managers: [] }, ARGUS_MEMBER)).toBe(false);
  });
});

describe('projectTaskPermissions — the Argus inversion (regression for #470)', () => {
  it('grants an Agent every bit their mask carries, despite being roleHatIds[0]', () => {
    const p = projectTaskPermissions(ARGUS_DOCS, [AGENT], '0xsomeagent');
    expect(p.canCreate).toBe(true);
    expect(p.canClaim).toBe(true);
    expect(p.canReview).toBe(true);
    expect(p.canAssign).toBe(true);
    // mask 15 carries no EDIT / SELF_REVIEW / BUDGET bits
    expect(p.canEditFull).toBe(false);
    expect(p.canEditMeta).toBe(false);
    expect(p.canSelfReview).toBe(false);
    expect(p.canBudget).toBe(false);
  });

  it('gives an Apprentice ONLY claim, despite being roleHatIds[1]', () => {
    const p = projectTaskPermissions(ARGUS_DOCS, [APPRENTICE], '0xapprentice');
    expect(p.canClaim).toBe(true);
    expect(p.canCreate).toBe(false);
    expect(p.canReview).toBe(false);
    expect(p.canAssign).toBe(false);
  });

  it('grants nobody but governance on a project with no masks and only the Executor as manager', () => {
    const p = projectTaskPermissions(ARGUS_GOVERNANCE_ONLY, [AGENT], '0xsomeagent');
    expect(p.isPM).toBe(false);
    expect(p.canCreate).toBe(false);
    expect(p.canReview).toBe(false);
    expect(p.canAssign).toBe(false);
    expect(p.canClaim).toBe(false);
  });

  it('grants a human project manager everything except budget', () => {
    const p = projectTaskPermissions(ARGUS_MANAGER_ONLY, [], ARGUS_MEMBER);
    expect(p.isPM).toBe(true);
    expect(p.canCreate).toBe(true);
    expect(p.canClaim).toBe(true);
    expect(p.canReview).toBe(true);
    expect(p.canAssign).toBe(true);
    expect(p.canSelfReview).toBe(true);
    expect(p.canEditFull).toBe(true);
    expect(p.canEditMeta).toBe(true);
    expect(p.canCreateAndAssign).toBe(true);
    // _requireBudgetEditor has NO project-manager bypass.
    expect(p.canBudget).toBe(false);
  });
});

describe('projectTaskPermissions — default-template regression guard', () => {
  it('does NOT give a plain Test6 Member any exec surface', () => {
    const p = projectTaskPermissions(TEST6_PROJECT, [T6_MEMBER], '0xmember');
    expect(p.canClaim).toBe(true);
    expect(p.canCreate).toBe(false);
    expect(p.canReview).toBe(false);
    expect(p.canAssign).toBe(false);
    expect(p.canEditMeta).toBe(false);
    expect(p.canBudget).toBe(false);
    expect(p.canCreateAndAssign).toBe(false);
  });

  it('keeps the Test6 Executive on the same footing as before', () => {
    const p = projectTaskPermissions(TEST6_PROJECT, [T6_EXEC], '0xexec');
    expect(p.canCreate).toBe(true);
    expect(p.canReview).toBe(true);
    expect(p.canAssign).toBe(true);
    expect(p.canCreateAndAssign).toBe(true);
    // project mask 15 shadows the global 160 grant
    expect(p.canEditFull).toBe(false);
  });

  it('requires CREATE and ASSIGN together for createAndAssignTask', () => {
    const assignOnly = { rolePermissions: [perm(AGENT, TaskPermission.ASSIGN)], globalRolePermissions: [], managers: [] };
    const p = projectTaskPermissions(assignOnly, [AGENT], '0xagent');
    expect(p.canAssign).toBe(true);
    expect(p.canCreate).toBe(false);
    expect(p.canCreateAndAssign).toBe(false);
  });

  it('returns all-false for a project that has not resolved yet', () => {
    const p = projectTaskPermissions(undefined, [AGENT], '0xagent');
    expect(p.isPM).toBe(false);
    expect(p.canCreate).toBe(false);
    expect(p.canReview).toBe(false);
  });
});

describe('taskEditRights', () => {
  const editFullOnly = {
    rolePermissions: [perm(AGENT, TaskPermission.EDIT_FULL)], globalRolePermissions: [], managers: [],
  };
  const editMetaOnly = {
    rolePermissions: [perm(AGENT, TaskPermission.EDIT_META)], globalRolePermissions: [], managers: [],
  };

  it('locks terminal tasks for everyone, including a project manager', () => {
    const pmPerms = projectTaskPermissions(ARGUS_MANAGER_ONLY, [], ARGUS_MEMBER);
    expect(taskEditRights(pmPerms, 'completed')).toEqual({ canEditFull: false, canEditMeta: false });
  });

  it('lets a CREATE hat edit fully while the task is UNCLAIMED, and not after', () => {
    const perms = projectTaskPermissions(ARGUS_DOCS, [AGENT], '0xagent'); // mask 15 → CREATE, no EDIT bits
    expect(taskEditRights(perms, 'open')).toEqual({ canEditFull: true, canEditMeta: true });
    expect(taskEditRights(perms, 'inProgress')).toEqual({ canEditFull: false, canEditMeta: false });
    expect(taskEditRights(perms, 'inReview')).toEqual({ canEditFull: false, canEditMeta: false });
  });

  it('lets EDIT_FULL edit in any non-terminal status', () => {
    const perms = projectTaskPermissions(editFullOnly, [AGENT], '0xagent');
    expect(taskEditRights(perms, 'inProgress')).toEqual({ canEditFull: true, canEditMeta: true });
  });

  it('routes EDIT_META-only callers to metadata-only after a claim', () => {
    const perms = projectTaskPermissions(editMetaOnly, [AGENT], '0xagent');
    expect(taskEditRights(perms, 'inReview')).toEqual({ canEditFull: false, canEditMeta: true });
  });

  it('is all-false when perms are missing', () => {
    expect(taskEditRights(null, 'open')).toEqual({ canEditFull: false, canEditMeta: false });
  });
});

describe('projectTaskPermissions — canClaim (regression for #484)', () => {
  // Test6's Newcomer / Treasurer / TaskRunner: real role hats with no mask row on
  // any project and none globally. Membership says yes, the contract says no.
  const T6_NEWCOMER = '29035862971903655586675705273981658214582931336903305585178869179088896';

  it('denies claim to a hat with no project mask and no global mask', () => {
    const p = projectTaskPermissions(TEST6_PROJECT, [T6_NEWCOMER], ARGUS_MEMBER);
    expect(p.canClaim).toBe(false);
    expect(p.isPM).toBe(false);
  });

  it('grants claim from the project mask (Member holds CLAIM on this project)', () => {
    expect(projectTaskPermissions(TEST6_PROJECT, [T6_MEMBER], ARGUS_MEMBER).canClaim).toBe(true);
  });

  it('does NOT let a global mask that lacks CLAIM be rescued by a project mask on another hat', () => {
    // Executive's global mask is 160 (BUDGET|EDIT_FULL, no CLAIM). Its *project*
    // mask 15 does carry CLAIM, and a non-zero project mask REPLACES global — so
    // the same hat is claim-capable here and not on a project with no mask row.
    const elsewhere = { rolePermissions: [], globalRolePermissions: [perm(T6_EXEC, 160)], managers: [] };
    expect(projectTaskPermissions(TEST6_PROJECT, [T6_EXEC], ARGUS_MEMBER).canClaim).toBe(true);
    expect(projectTaskPermissions(elsewhere, [T6_EXEC], ARGUS_MEMBER).canClaim).toBe(false);
  });

  it('grants claim to a project manager on a project with no masks at all (_isPM bypass)', () => {
    // Argus "Hudson": zero role permissions, one human manager. Under a
    // membership-only gate this looked the same as the governance-only projects.
    expect(projectTaskPermissions(ARGUS_MANAGER_ONLY, [], ARGUS_MEMBER).canClaim).toBe(true);
    expect(projectTaskPermissions(ARGUS_GOVERNANCE_ONLY, [AGENT], ARGUS_MEMBER).canClaim).toBe(false);
  });
});

describe('permissionGate', () => {
  it('grants immediately, without waiting for anything to resolve', () => {
    expect(permissionGate(true, false)).toEqual({ allowed: true, pending: false });
    expect(permissionGate(true, true)).toEqual({ allowed: true, pending: false });
  });

  it('holds a denial back until authority resolves, and reports it as pending', () => {
    expect(permissionGate(false, false)).toEqual({ allowed: true, pending: true });
  });

  it('denies once authority has resolved', () => {
    expect(permissionGate(false, true)).toEqual({ allowed: false, pending: false });
  });

  it('never refuses a project manager while the managers document is still in flight', () => {
    // First paint: the board has landed but FETCH_PROJECT_MANAGERS has not, so the
    // project reads `managers: []` and `_isPM` is false. This is the transient the
    // gate exists for — the manager keeps their Claim button, and keeps it after.
    const beforeManagers = { ...ARGUS_MANAGER_ONLY, managers: [] };
    const early = projectTaskPermissions(beforeManagers, [], ARGUS_MEMBER);
    expect(early.canClaim).toBe(false);
    expect(permissionGate(early.canClaim, /* resolved */ false).allowed).toBe(true);

    const late = projectTaskPermissions(ARGUS_MANAGER_ONLY, [], ARGUS_MEMBER);
    expect(permissionGate(late.canClaim, true).allowed).toBe(true);
  });

  it('treats a never-resolving input as permissive, so a missing managers document cannot lock members out', () => {
    // An endpoint whose schema lacks `Project.managers` leaves managersLoaded false
    // forever. The documented degradation is "no manager bypass", NOT "deny everyone".
    expect(permissionGate(false, false).allowed).toBe(true);
  });

  it('coerces truthy/falsy inputs to booleans', () => {
    expect(permissionGate(undefined, undefined)).toEqual({ allowed: true, pending: true });
    expect(permissionGate(0, 1)).toEqual({ allowed: false, pending: false });
  });
});

describe('PERMISSION_MESSAGES', () => {
  it('never tells a user they need to be an "executive" — no contract has that concept', () => {
    for (const [key, msg] of Object.entries(PERMISSION_MESSAGES)) {
      expect(msg.toLowerCase(), key).not.toContain('executive');
    }
  });
});
