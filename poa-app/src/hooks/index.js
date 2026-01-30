/**
 * Hooks
 * Barrel exports for all custom hooks
 */

// Toast/Permission
export { usePermissionToast } from './usePermissionToast';

// Web3 Services
export {
  useWeb3Services,
  useTransactionWithNotification,
  useWeb3,
} from './useWeb3Services';

// Swipe Navigation (mobile)
export { useSwipeNavigation } from './useSwipeNavigation';

// Voting Hooks
export { usePollNavigation } from './usePollNavigation';
export { useVotingPagination } from './useVotingPagination';
export { useProposalForm } from './useProposalForm';
export { useWinnerStatus } from './useWinnerStatus';

// Organization Structure
export { useOrgStructure } from './useOrgStructure';
export { useClaimRole } from './useClaimRole';
export { useVouches } from './useVouches';
export { useUserSearch } from './useUserSearch';

// Voting Education & Power
export { useRoleNames } from './useRoleNames';
export { useVotingPower } from './useVotingPower';

// Global Account
export { useGlobalAccount } from './useGlobalAccount';
