import { supportedMemberships } from '@/lib/supportedOrganizations';

// Matched against the org's CURRENT on-chain name, lowercased. Retired names
// ('kubi' → 'kansas blockchain') stay listed so the filter survives a rename
// in either direction.
const HUDSONHRH_ALLOWED = new Set(['poa', 'kubi', 'kansas blockchain']);

export function filterUserOrgsForViewedProfile(orgs, profileUsername) {
  const supported = supportedMemberships(orgs);
  const owner = profileUsername?.trim().toLowerCase();
  if (owner === 'hudsonhrh') {
    return supported.filter((entry) =>
      HUDSONHRH_ALLOWED.has(entry?.organization?.name?.trim().toLowerCase())
    );
  }
  return supported;
}
