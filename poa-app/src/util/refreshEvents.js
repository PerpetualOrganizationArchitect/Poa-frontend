/**
 * Refresh event names.
 *
 * Extracted from RefreshContext so pure modules and their tests can import the event
 * vocabulary without pulling in React — RefreshContext.js contains JSX, which the
 * vitest loader cannot parse from a `.js` file. RefreshContext re-exports this, so
 * every existing `import { RefreshEvent } from '.../RefreshContext'` keeps working.
 */

export const RefreshEvent = {
  // Voting events
  PROPOSAL_CREATED: 'proposal:created',
  PROPOSAL_VOTED: 'proposal:voted',
  PROPOSAL_COMPLETED: 'proposal:completed',

  // Task events
  PROJECT_CREATED: 'project:created',
  PROJECT_DELETED: 'project:deleted',
  TASK_CREATED: 'task:created',
  TASK_CLAIMED: 'task:claimed',
  TASK_SUBMITTED: 'task:submitted',
  TASK_COMPLETED: 'task:completed',
  TASK_UPDATED: 'task:updated',
  TASK_CANCELLED: 'task:cancelled',
  TASK_REJECTED: 'task:rejected',
  TASK_APPLICATION_SUBMITTED: 'task:application_submitted',
  TASK_APPLICATION_APPROVED: 'task:application_approved',
  TASK_ASSIGNED: 'task:assigned',
  TASK_UNCLAIMED: 'task:unclaimed',
  PROJECT_BUDGET_UPDATED: 'project:budget-updated',
  FOLDERS_UPDATED: 'folders:updated',
  ORGANIZER_HAT_UPDATED: 'organizer-hat:updated',

  // Education events
  MODULE_CREATED: 'module:created',
  MODULE_COMPLETED: 'module:completed',

  // Token request events
  TOKEN_REQUEST_CREATED: 'token:request_created',
  TOKEN_REQUEST_APPROVED: 'token:request_approved',
  TOKEN_REQUEST_CANCELLED: 'token:request_cancelled',

  // Organization events
  MEMBER_JOINED: 'member:joined',
  METADATA_UPDATED: 'org:metadataUpdated',

  // Role/Vouching events
  ROLE_CLAIMED: 'role:claimed',
  ROLE_VOUCHED: 'role:vouched',
  ROLE_VOUCH_REVOKED: 'role:vouch-revoked',
  ROLE_APPLICATION_SUBMITTED: 'role:application-submitted',
  ROLE_APPLICATION_WITHDRAWN: 'role:application-withdrawn',

  // Treasury events
  TREASURY_DEPOSITED: 'treasury:deposited',
  GAS_POOL_DEPOSITED: 'gaspool:deposited',

  // User events
  USER_CREATED: 'user:created',
  USERNAME_CHANGED: 'user:username_changed',
  PROFILE_UPDATED: 'user:profile_updated',

  // Generic events
  ALL: '*',
};
