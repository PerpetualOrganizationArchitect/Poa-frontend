/**
 * Account-scoping rules for UserContext.
 *
 * Every value UserContext exposes belongs to one (org, account) pair. Two
 * Apollo behaviours make that easy to get wrong, and both produced the
 * "someone else's profile is still on screen" class of bug:
 *
 *   - When a query becomes `skip`ped, Apollo keeps returning the previous
 *     `data`. Disconnecting therefore leaves the last user's roles and tasks
 *     readable.
 *   - When variables change (account A -> B), the old `data` is still returned
 *     for a render or two before the new result lands.
 *
 * So results are matched against the *current* scope before they are trusted,
 * and loading is derived rather than latched.
 *
 * Pure and DOM-free so the rules are covered by real runtime tests.
 */

/** `${orgId}-${lowercased address}`, or null when either half is unknown. */
export function buildUserScope(orgId, account) {
  if (!orgId || !account) return null;
  return `${orgId}-${String(account).toLowerCase()}`;
}

/**
 * Does this Apollo result actually belong to the scope we are rendering?
 *
 * Entity ids are compared case-insensitively: the subgraph lowercases
 * addresses, but org ids are checksummed contract addresses in some documents.
 */
export function isDataForScope({ data, account, orgUserID }) {
  if (!account || !orgUserID || !data) return false;

  const accountId = data.account?.id;
  if (accountId && String(accountId).toLowerCase() !== String(account).toLowerCase()) {
    return false;
  }

  const userId = data.user?.id;
  if (userId && String(userId).toLowerCase() !== String(orgUserID).toLowerCase()) {
    return false;
  }

  return true;
}

/**
 * Should consumers see user-derived state, or the empty defaults?
 *
 * True only when there is an account, its org scope is known, and state that
 * was actually resolved for that exact scope is in hand.
 */
export function isUserStateCurrent({ account, orgUserID, resolvedUserScope }) {
  return !!account && !!orgUserID && resolvedUserScope === orgUserID;
}

/**
 * The loading flag consumers see.
 *
 * - No account: never loading. A logged-out visitor is not "waiting", and
 *   gating a page on a flag that can never settle is how the Profile Hub used
 *   to spin forever.
 * - Account but no org scope yet: still loading (POContext resolves orgId a
 *   tick after the address arrives).
 * - Account and scope, but nothing resolved for that scope yet: loading.
 * - Otherwise: whatever the in-flight query says.
 */
export function deriveUserDataLoading({
  account,
  orgUserID,
  resolvedUserScope,
  queryLoading,
}) {
  if (!account) return false;
  if (!orgUserID) return true;
  if (!isUserStateCurrent({ account, orgUserID, resolvedUserScope })) return true;
  return !!queryLoading;
}
