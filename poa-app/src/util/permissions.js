/**
 * Permission constants for the POA Task Manager
 * Matches TaskPerm.sol bitmask values from the POP smart contracts
 */

/**
 * Task permission bitmask values
 * These match the TaskPerm.sol contract constants
 */
export const TaskPermission = {
    CREATE: 1,   // 1 << 0 - Can create tasks
    CLAIM: 2,    // 1 << 1 - Can claim tasks / apply for tasks
    REVIEW: 4,   // 1 << 2 - Can complete/review tasks
    ASSIGN: 8,   // 1 << 3 - Can assign tasks / approve applications
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
    REQUIRE_EXECUTIVE: 'You must have the required role to perform this action.',
    REQUIRE_CLAIM: 'You must have claim permissions for this project.',
    REQUIRE_CREATE: 'You must have create permissions for this project.',
    REQUIRE_REVIEW: 'You must have review permissions for this project.',
    REQUIRE_ASSIGN: 'You must have assign permissions for this project.',
    CANNOT_MOVE_COMPLETED: 'You cannot move tasks from the Completed column.',
    TASK_CLAIM_MEMBER: 'You must be a member to claim this task. Go to user page to join.',
    TASK_SUBMIT_MEMBER: 'You must be a member to submit tasks. Go to user page to join.',
    TASK_REVIEW_EXEC: 'You must be an executive to review tasks.',
    TASK_CREATE_EXEC: 'You must be an executive to create tasks.',
    TASK_DELETE_EXEC: 'You must be an executive to delete tasks.',
    TASK_EDIT_EXEC: 'You must be an executive to edit tasks.',
    PROJECT_MANAGE_EXEC: 'You must be an executive to manage projects.',
};

/**
 * Role indices in the roleHatIds array
 * These correspond to the hat IDs returned from the POContext
 */
export const ROLE_INDICES = {
    MEMBER: 0,
    EXECUTIVE: 1,
};
