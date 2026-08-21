/**
 * Permission constants for the POA Task Manager
 * Matches TaskPerm.sol bitmask values from the POP smart contracts
 */

/**
 * Task permission bitmask values
 * These match the TaskPerm.sol contract constants
 */
export const TaskPermission = {
    CREATE: 1,        // 1 << 0 - Can create tasks
    CLAIM: 2,         // 1 << 1 - Can claim tasks / apply for tasks
    REVIEW: 4,        // 1 << 2 - Can complete/review tasks
    ASSIGN: 8,        // 1 << 3 - Can assign tasks / approve applications
    SELF_REVIEW: 16,  // 1 << 4 - Claimer may complete their own task
    BUDGET: 32,       // 1 << 5 - Edit project PT cap and bounty caps
    EDIT_META: 64,    // 1 << 6 - Edit title/metadataHash on CLAIMED/SUBMITTED tasks
    EDIT_FULL: 128,   // 1 << 7 - Edit everything (payout + bounty + meta) on CLAIMED/SUBMITTED tasks; strict superset of EDIT_META
};

/**
 * Check if a permission mask includes a specific permission
 * @param {number} mask - The permission bitmask
 * @param {number} permission - The permission to check (from TaskPermission)
 * @returns {boolean} - True if the permission is included
 */
export function hasPermission(mask, permission) {
    return (mask & permission) === permission;
}

/**
 * User-facing permission error messages
 */
export const PERMISSION_MESSAGES = {
    REQUIRE_MEMBER: 'You must be a member to perform this action. Go to user page to join.',
    REQUIRE_CLAIM: 'You need claim permission on this project, or to be one of its managers.',
    REQUIRE_CREATE: 'You need create permission on this project, or to be one of its managers.',
    REQUIRE_REVIEW: 'You need review permission on this project, or to be one of its managers.',
    REQUIRE_ASSIGN: 'You need assign permission on this project, or to be one of its managers.',
    REQUIRE_SELF_REVIEW: 'You claimed this task, so approving it needs self-review permission on this project.',
    REQUIRE_EDIT: 'Editing this task needs edit permission on this project, or to be one of its managers.',
    // Budget is the one permission with NO project-manager bypass — TaskManager's
    // _requireBudgetEditor is "executor OR the BUDGET bit", full stop.
    REQUIRE_BUDGET: 'You must hold a role with the BUDGET permission to edit project budgets.',
    REQUIRE_PROJECT_CREATOR: 'Creating or deleting projects needs a role your organization granted project-creation rights.',
    CANNOT_MOVE_COMPLETED: 'You cannot move tasks from the Completed column.',
    TASK_CLAIM_MEMBER: 'You must be a member to claim this task. Go to user page to join.',
    TASK_SUBMIT_MEMBER: 'You must be a member to submit tasks. Go to user page to join.',
};

/**
 * Normalize a hat ID to a string for comparison.
 * Handles BigInt strings from subgraph which may have different formats.
 * @param {string|number|BigInt} hatId - Hat ID in any format
 * @returns {string} - Normalized string representation
 */
function normalizeHatId(hatId) {
    if (hatId === null || hatId === undefined) return '';
    // Convert to string and trim whitespace
    return String(hatId).trim();
}

/**
 * Canonicalize a hat id to a decimal string so hex, decimal, and BigInt
 * representations compare cleanly (subgraph vs on-chain reads).
 */
function canonicalHatId(hatId) {
    const str = normalizeHatId(hatId);
    if (!str) return '';
    try {
        return BigInt(str).toString();
    } catch {
        return str.toLowerCase();
    }
}

/**
 * Does the user wear at least one of the given hats?
 * @param {string[]} userHatIds - Hat IDs the user currently holds
 * @param {string[]} hatIds - Hat IDs to test against
 * @returns {boolean}
 */
export function userWearsAnyHat(userHatIds, hatIds) {
    if (!userHatIds?.length || !hatIds?.length) return false;
    const normalized = new Set(userHatIds.map(canonicalHatId));
    return hatIds.some((h) => normalized.has(canonicalHatId(h)));
}

/**
 * Compute whether the user has a permission considering BOTH per-project and global grants.
 * Mirrors the contract's `_permMask` semantics in TaskManager.sol:
 *
 *   for each hat the user wears:
 *     mask = rolePermProj[pid][hat]              // try the per-project override
 *     if mask == 0: mask = rolePermGlobal[hat]   // fall back to global
 *     accumulate mask
 *
 * The frontend version: for each hat the user wears, look up the matching per-project
 * entry. If one exists AND has a non-zero mask, the bit is read from there (project
 * mask shadows global, per contract). Otherwise the global entry's bit is read.
 *
 * Returns true if ANY of the user's hats grants the requested permission via this
 * effective-mask resolution.
 *
 * @param {string[]} userHatIds - Hat IDs the user currently holds
 * @param {Array} projectRolePermissions - ProjectRolePermission entries for the project
 * @param {Array} globalRolePermissions - GlobalRolePermission entries from the org's TaskManager
 * @param {string} permissionType - 'canCreate' | 'canClaim' | 'canReview' | 'canAssign' | 'canSelfReview' | 'canBudget' | 'canEditMeta' | 'canEditFull'
 */
export function userHasEffectiveTaskPermission(
    userHatIds,
    projectRolePermissions,
    globalRolePermissions,
    permissionType,
) {
    if (!userHatIds || !userHatIds.length) return false;

    const normalizedUserHats = userHatIds.map(normalizeHatId);

    // Index project entries by hat for O(1) lookup. mask=0 entries are treated as "absent"
    // here because the contract's _permMask falls back to global when the project mask is 0.
    const projectByHat = new Map();
    (projectRolePermissions || []).forEach((p) => {
        if (p && Number(p.mask || 0) > 0) {
            projectByHat.set(normalizeHatId(p.hatId), p);
        }
    });

    const globalByHat = new Map();
    (globalRolePermissions || []).forEach((p) => {
        if (p) globalByHat.set(normalizeHatId(p.hatId), p);
    });

    for (const userHat of normalizedUserHats) {
        const projectEntry = projectByHat.get(userHat);
        if (projectEntry) {
            // Project mask exists and is non-zero — it REPLACES the global mask per
            // _permMask semantics. Do NOT fall back to global even if this bit is unset.
            if (projectEntry[permissionType]) return true;
            continue;
        }
        const globalEntry = globalByHat.get(userHat);
        if (globalEntry && globalEntry[permissionType]) return true;
    }
    return false;
}

/**
 * Check if a user can create tasks in a project.
 * `globalRolePermissions` is optional but recommended — without it, hats granted CREATE
 * via setConfig(ROLE_PERM, ...) are invisible to the frontend.
 */
export function userCanCreateTask(userHatIds, projectRolePermissions, globalRolePermissions = []) {
    return userHasEffectiveTaskPermission(
        userHatIds, projectRolePermissions, globalRolePermissions, 'canCreate',
    );
}

/**
 * Check if a user can claim tasks in a project.
 */
export function userCanClaimTask(userHatIds, projectRolePermissions, globalRolePermissions = []) {
    return userHasEffectiveTaskPermission(
        userHatIds, projectRolePermissions, globalRolePermissions, 'canClaim',
    );
}

/**
 * Check if a user can review tasks in a project.
 */
export function userCanReviewTask(userHatIds, projectRolePermissions, globalRolePermissions = []) {
    return userHasEffectiveTaskPermission(
        userHatIds, projectRolePermissions, globalRolePermissions, 'canReview',
    );
}

/**
 * Check if a user can assign tasks in a project.
 */
export function userCanAssignTask(userHatIds, projectRolePermissions, globalRolePermissions = []) {
    return userHasEffectiveTaskPermission(
        userHatIds, projectRolePermissions, globalRolePermissions, 'canAssign',
    );
}

/**
 * Check if a user can edit a project's budget (PT cap, bounty caps).
 * Backed by `TaskPerm.BUDGET` (bit 5) — contract gate is strict, project
 * managers do NOT get implicit access.
 */
export function userCanBudgetProject(userHatIds, projectRolePermissions, globalRolePermissions = []) {
    return userHasEffectiveTaskPermission(
        userHatIds, projectRolePermissions, globalRolePermissions, 'canBudget',
    );
}

/**
 * Check if a user can edit a CLAIMED / SUBMITTED task's metadata (title + metadataHash only).
 * Backed by `TaskPerm.EDIT_META` (bit 6). EDIT_FULL is a strict superset so callers with
 * EDIT_FULL also satisfy this gate.
 */
export function userCanEditTaskMetadata(userHatIds, projectRolePermissions, globalRolePermissions = []) {
    return userHasEffectiveTaskPermission(
        userHatIds, projectRolePermissions, globalRolePermissions, 'canEditMeta',
    ) || userHasEffectiveTaskPermission(
        userHatIds, projectRolePermissions, globalRolePermissions, 'canEditFull',
    );
}

/**
 * Check if a user can edit a CLAIMED / SUBMITTED task's payout, bounty, AND metadata.
 * Backed by `TaskPerm.EDIT_FULL` (bit 7). Holders can also edit metadata-only via
 * `updateTaskMetadata`.
 */
export function userCanEditTaskFull(userHatIds, projectRolePermissions, globalRolePermissions = []) {
    return userHasEffectiveTaskPermission(
        userHatIds, projectRolePermissions, globalRolePermissions, 'canEditFull',
    );
}

/**
 * Mirror of TaskManager's `_isPM(pid, who)` — the ONLY bypass a human can hold:
 *
 *     return (who == l.executor) || l._projects[pid].managers[who];
 *
 * `who == executor` is the Executor *contract*, i.e. a passed governance proposal,
 * never an end user — so only the managers mapping is modelled here. A project's
 * creator is auto-added as a manager on `createProject`, which is why so many
 * projects list the Executor itself: governance created them, and no human can
 * act on them directly.
 *
 * @param {Object} project - Transformed project object (needs `managers`)
 * @param {string} address - The connected account: the smart account for passkey
 *   users, the EOA otherwise — i.e. the tx's `msg.sender` either way.
 * @returns {boolean}
 */
export function userIsProjectManager(project, address) {
    if (!project || !address) return false;
    const target = String(address).toLowerCase();
    return (project.managers || []).some((m) => String(m).toLowerCase() === target);
}

/**
 * Resolve every TaskManager permission for one project, exactly as the contract does:
 *
 *     _checkPerm(pid, FLAG) => TaskPerm.has(_permMask(sender, pid), FLAG) || _isPM(pid, sender)
 *
 * The mask half is `userHasEffectiveTaskPermission` (already a faithful `_permMask`
 * mirror, including the per-hat global fallback); this adds the `|| _isPM` half.
 *
 * `canBudget` is deliberately the ONE field with no manager term: budget changes go
 * through `_requireBudgetEditor`, which is "executor OR the BUDGET bit" and has no
 * project-manager bypass.
 *
 * There is no hat-based "executive" in TaskManager — do not reintroduce one.
 *
 * @param {Object} project - Transformed project ({ rolePermissions, globalRolePermissions, managers })
 * @param {string[]} userHatIds - Hat IDs the user currently wears
 * @param {string} address - The connected account (msg.sender for the tx)
 * @returns {{isPM: boolean, canCreate: boolean, canClaim: boolean, canReview: boolean,
 *   canAssign: boolean, canSelfReview: boolean, canEditMeta: boolean, canEditFull: boolean,
 *   canBudget: boolean, canCreateAndAssign: boolean}}
 */
export function projectTaskPermissions(project, userHatIds, address) {
    const projectRolePermissions = project?.rolePermissions || [];
    const globalRolePermissions = project?.globalRolePermissions || [];
    const isPM = userIsProjectManager(project, address);
    const bit = (permissionType) => userHasEffectiveTaskPermission(
        userHatIds, projectRolePermissions, globalRolePermissions, permissionType,
    );

    const canCreate = isPM || bit('canCreate');
    const canAssign = isPM || bit('canAssign');
    const canEditFull = isPM || bit('canEditFull');

    return {
        isPM,
        canCreate,
        canClaim: isPM || bit('canClaim'),
        canReview: isPM || bit('canReview'),
        canAssign,
        canSelfReview: isPM || bit('canSelfReview'),
        // EDIT_FULL is a strict superset of EDIT_META.
        canEditMeta: canEditFull || bit('canEditMeta'),
        canEditFull,
        canBudget: bit('canBudget'),
        // `createAndAssignTask` checks CREATE **and** ASSIGN together (not either),
        // so offering an assignee field to a CREATE-only hat loses the whole task.
        canCreateAndAssign: isPM || (canCreate && canAssign),
    };
}

/**
 * The status-dependent half of `updateTask` / `updateTaskMetadata`.
 *
 * Contract (both functions): COMPLETED / CANCELLED always revert `BadStatus`. Otherwise
 * the caller passes if they are a project manager / executor, OR hold EDIT_FULL
 * (EDIT_META for the metadata-only variant) in any non-terminal status, OR hold CREATE
 * while the task is still UNCLAIMED.
 *
 * `columnId === 'open'` is the UI's UNCLAIMED: expired-claim takeover cards render under
 * `inProgress`, so no CLAIMED task ever reaches this as 'open'.
 *
 * @param {ReturnType<typeof projectTaskPermissions>} perms
 * @param {string} columnId - 'open' | 'inProgress' | 'inReview' | 'completed'
 * @returns {{canEditFull: boolean, canEditMeta: boolean}} canEditMeta implies the editor
 *   opens at all; canEditFull decides whether payout/bounty fields are editable (and so
 *   whether the save routes through `updateTask` or `updateTaskMetadata`).
 */
export function taskEditRights(perms, columnId) {
    if (!perms || columnId === 'completed') {
        return { canEditFull: false, canEditMeta: false };
    }
    const isUnclaimed = columnId === 'open';
    const canEditFull = perms.canEditFull || (isUnclaimed && perms.canCreate);
    return { canEditFull, canEditMeta: canEditFull || perms.canEditMeta };
}
