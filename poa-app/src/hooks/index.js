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
export { useProposalForm } from './useProposalForm';
export { useWinnerStatus } from './useWinnerStatus';
export { useVoteLanes } from './useVoteLanes';

// Organization Structure
export { useOrgStructure } from './useOrgStructure';
export { useClaimRole } from './useClaimRole';
export { useVouches } from './useVouches';
export { useUserSearch } from './useUserSearch';
export { useIsOrgAdmin } from './useIsOrgAdmin';

// Voting Education & Power
export { useRoleNames } from './useRoleNames';
export { useVotingPower } from './useVotingPower';
export { useTreasuryShare } from './useTreasuryShare';

// Passkey Vouch-First Onboarding
export { useVouchFirstOnboarding } from './useVouchFirstOnboarding';

// Global Account
export { useGlobalAccount } from './useGlobalAccount';

// Org Theme
export { useOrgTheme } from './useOrgTheme';

// TaskManager v4 (folders + organizer hats)
export { useTaskManagerV4State } from './useTaskManagerV4State';
