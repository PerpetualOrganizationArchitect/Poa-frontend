/**
 * White-label host → default org name mapping.
 *
 * Lifted out of POContext to break a circular import (POContext used to
 * own this map and `useOrgName` imported `getDefaultOrgForHost` from it;
 * once POContext started calling `useOrgName`, the cycle became real).
 */

// White-label hosts that auto-select an org when no ?org= / ?userDAO= is passed.
// Explicit query params still win, so support can always override.
// NOTE: the value is the org's CURRENT on-chain name — POContext resolves it
// with `organizations(where: { name: $name })`, an exact match. An org that
// renames itself breaks its own white-label domain until this map is updated;
// add the retired name to ORG_NAME_ALIASES below at the same time.
const HOST_DEFAULT_ORG = {
  'dao.kublockchain.com': 'Kansas Blockchain',
  'poa.earth': 'Test6',
  'www.poa.earth': 'Test6',
};

export function getDefaultOrgForHost() {
  if (typeof window === 'undefined') return '';
  return HOST_DEFAULT_ORG[window.location.hostname] || '';
}

// Retired org name → current name. Orgs rename themselves on-chain, but every
// ?org=<old name> link already printed on a flyer, pasted into Discord, or
// bookmarked keeps pointing at the name they had at the time. Without this the
// lookup 404s ("Organization not found") because the subgraph only knows the
// new name. Keys are lowercased; matching is case-insensitive.
const ORG_NAME_ALIASES = {
  kubi: 'Kansas Blockchain',
};

/** Map a possibly-retired org name onto the one the subgraph knows. */
export function resolveOrgAlias(name) {
  if (typeof name !== 'string') return name;
  return ORG_NAME_ALIASES[name.trim().toLowerCase()] || name;
}

// Inverse of HOST_DEFAULT_ORG for the explore page's Visit button: send users
// to an org's white-label domain instead of the default poa.box home route.
const ORG_WHITE_LABEL_URL = {
  'Kansas Blockchain': 'https://dao.kublockchain.com',
};

export function getVisitUrlForOrg(orgId) {
  if (orgId && ORG_WHITE_LABEL_URL[orgId]) return ORG_WHITE_LABEL_URL[orgId];
  return `/home?org=${encodeURIComponent(orgId)}`;
}
