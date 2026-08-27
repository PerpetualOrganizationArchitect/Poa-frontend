/**
 * accessV2/authority — FEATURE DETECTION (pure).
 *
 * Access v2 rolls out ORG BY ORG. An org is on the v2 path only when BOTH hold:
 *
 *   1. the serving subgraph knows the v2 schema at all (see `CAPABILITY.ACCESS_V2` in
 *      `util/subgraphCapabilities`) — the app reads the DECENTRALISED GATEWAY endpoints, which lag
 *      Studio by a manual publish, so "the schema file has it" is never evidence, and one unknown
 *      field fails the WHOLE document; and
 *   2. the org itself has a `MembershipAuthorityContract` that is ROUTER-BOUND (the cutover
 *      moment). Before the bind the authority exists but the modules still read legacy Hats, and a
 *      module whose `membershipAuthority()` is 0 is, by definition, legacy.
 *
 * Anything short of that is the LEGACY path, unchanged. Every v2 surface in this codebase must be
 * behind `useOrgAuthority().enabled`, and every v2 query must be `skip`ped when it is false.
 */

/** The three states an org can be in. `pending` = migrated but not yet cut over. */
export const AUTHORITY_STATE = {
  LEGACY: 'legacy',
  PENDING: 'pending',
  ACTIVE: 'active',
};

/**
 * Classify an org from its `organization.membershipAuthority` subgraph node.
 *
 * @param {object|null|undefined} authorityNode - `organization.membershipAuthority`, or null
 * @param {object} [opts]
 * @param {boolean} [opts.capable=true] - does the serving endpoint know the v2 schema
 * @returns {{
 *   state: string, enabled: boolean, migrated: boolean, address: string|null,
 *   paused: boolean, executor: string|null, subjectCount: number, roleCount: number,
 *   groupCount: number, cutoverAt: number|null, reason: string|null
 * }}
 */
export function classifyAuthority(authorityNode, { capable = true } = {}) {
  const base = {
    state: AUTHORITY_STATE.LEGACY,
    enabled: false,
    migrated: false,
    address: null,
    paused: false,
    executor: null,
    subjectCount: 0,
    roleCount: 0,
    groupCount: 0,
    memberCount: 0,
    cutoverAt: null,
    maxDailyVouches: 0,
    reason: null,
  };

  if (!capable) return { ...base, reason: 'subgraph-not-published' };
  if (!authorityNode || !authorityNode.id) return { ...base, reason: 'no-authority' };

  const bound = Boolean(authorityNode.isRouterBound);
  return {
    state: bound ? AUTHORITY_STATE.ACTIVE : AUTHORITY_STATE.PENDING,
    enabled: bound,
    migrated: true,
    address: String(authorityNode.id).toLowerCase(),
    paused: Boolean(authorityNode.paused),
    executor: authorityNode.executor ? String(authorityNode.executor).toLowerCase() : null,
    subjectCount: Number(authorityNode.subjectCount ?? 0),
    roleCount: Number(authorityNode.roleSubjectCount ?? 0),
    groupCount: Number(authorityNode.groupSubjectCount ?? 0),
    memberCount: Number(authorityNode.acceptedMembershipCount ?? 0),
    cutoverAt: authorityNode.cutoverAt ? Number(authorityNode.cutoverAt) : null,
    maxDailyVouches: Number(authorityNode.maxDailyVouches ?? 0),
    reason: bound ? null : 'not-cut-over',
  };
}

/**
 * The banner an org admin sees while the authority exists but is not yet live.
 * Writes are paused until the cutover; READS stay live throughout (that is what lets the hub's
 * org-admin checks resolve through a still-paused authority during the cutover ordering).
 */
export function authorityStatusCopy(auth) {
  if (!auth || auth.state === AUTHORITY_STATE.LEGACY) return null;
  if (auth.state === AUTHORITY_STATE.PENDING) {
    return {
      tone: 'info',
      title: 'New roles system is being set up',
      body: 'Your org’s new roles and permissions system is deployed but not switched on yet. Nothing has changed for members.',
    };
  }
  if (auth.paused) {
    return {
      tone: 'warning',
      title: 'Membership changes are paused',
      body: 'Roles can still be viewed, but joining, leaving, vouching and role changes are paused right now.',
    };
  }
  return null;
}

/**
 * A module-level detector for the "module.membershipAuthority() == 0 means legacy" rule, for the
 * places that read a module's own pointer rather than the org entity (e.g. a direct contract read
 * during a cutover window). Zero, zero-address and nullish all mean LEGACY.
 */
export function moduleUsesAuthority(membershipAuthorityAddress) {
  if (!membershipAuthorityAddress) return false;
  const a = String(membershipAuthorityAddress).toLowerCase();
  return a !== '0x' && a !== `0x${'0'.repeat(40)}` && a !== '0';
}
