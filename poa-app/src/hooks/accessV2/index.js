/**
 * Access v2 hooks — every one of them is a no-op on a legacy org.
 *
 * The gate is `useOrgAuthority().enabled`. Nothing here puts a v2 query on the wire until the
 * serving endpoint has been probed for CAPABILITY.ACCESS_V2 and the org's authority is
 * router-bound.
 */

export { useSubgraphCapability } from './useSubgraphCapability';
export { useOrgAuthority } from './useOrgAuthority';
export { useAuthoritySubjects } from './useAuthoritySubjects';
export { useAuthorityMemberships, useMyMemberships } from './useAuthorityMemberships';
export { usePendingActions } from './usePendingActions';
export { useSubjectVouches } from './useSubjectVouches';
export { useVouchCandidates } from './useVouchCandidates';
export { useAuthorityActions } from './useAuthorityActions';
export { useActivationGate } from './useActivationGate';
export { useAccessV2Proposal, MAX_SPONSORED_CALLS } from './useAccessV2Proposal';
