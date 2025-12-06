/**
 * Deployer Steps - Export all step components
 */

export { OrganizationStep } from './OrganizationStep';
export { RolesStep } from './RolesStep';
export { PermissionsStep } from './PermissionsStep';
export { VotingStep } from './VotingStep';
export { ReviewStep } from './ReviewStep';

export default {
  OrganizationStep: require('./OrganizationStep').default,
  RolesStep: require('./RolesStep').default,
  PermissionsStep: require('./PermissionsStep').default,
  VotingStep: require('./VotingStep').default,
  ReviewStep: require('./ReviewStep').default,
};
