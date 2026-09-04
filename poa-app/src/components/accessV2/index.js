/**
 * Access v2 components.
 *
 * `AccessV2TeamSection` is the only role surface a page should mount — it owns the handoff from a
 * supplied legacy hierarchy to the v2 panels once the authority is router-bound.
 */

export { default as AccessV2TeamSection } from './AccessV2TeamSection';
export { default as RolesGroupsPanel } from './RolesGroupsPanel';
export { default as SubjectDetailPanel } from './SubjectDetailPanel';
export { default as CreateRoleWizard } from './CreateRoleWizard';
export { default as PermissionPicker } from './PermissionPicker';
export { default as ClaimableRolesPanel } from './ClaimableRolesPanel';
export { default as PendingActionsPanel } from './PendingActionsPanel';
export { default as SubjectVouchPanel } from './SubjectVouchPanel';
export { default as SubjectRestrictionPicker } from './SubjectRestrictionPicker';
