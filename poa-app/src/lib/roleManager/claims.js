/**
 * Role-offer claim helpers — pure.
 *
 * Accepting a role offer is a single EligibilityModule.claimHats call carrying
 * the identity hat FIRST, then every marker hat of the groups that role belongs
 * to (PLAN.md §1.4b / INTERFACES.md W1). The identity hat minted first in the
 * array makes the caller derived-eligible for the markers within the same call.
 *
 * @module lib/roleManager/claims
 */

/**
 * Derive the ordered claim hat list for accepting a role offer.
 *
 * @param {Object} offer - a RoleOffer-shaped object
 * @param {string|number} offer.hatId - the role's identity hat id
 * @param {Array<{markerHatId: string|number, isActive?: boolean}>} [groups=[]]
 *   the role's active group memberships (each carries its group's marker hat id)
 * @returns {string[]} [identityHatId, ...markerHatIds] as strings, de-duped
 */
export function deriveClaimHats(offer, groups = []) {
  if (!offer || offer.hatId === undefined || offer.hatId === null) return [];
  const identity = String(offer.hatId);
  const seen = new Set([identity]);
  const out = [identity];
  for (const g of groups || []) {
    if (g && g.isActive === false) continue;
    const marker = g?.markerHatId;
    if (marker === undefined || marker === null) continue;
    const s = String(marker);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * Given the org's role list (subgraph roles with groupMemberships) and a target
 * roleManagerRoleId or hatId, collect the marker hat ids for its groups.
 *
 * @param {Object} role - subgraph Role with `groupMemberships[].group.markerHatId`
 * @returns {string[]} marker hat ids (strings), active memberships only
 */
export function markerHatsForRole(role) {
  const memberships = role?.groupMemberships || [];
  return memberships
    .filter((m) => m && m.isActive !== false && m.group?.markerHatId != null)
    .map((m) => String(m.group.markerHatId));
}
