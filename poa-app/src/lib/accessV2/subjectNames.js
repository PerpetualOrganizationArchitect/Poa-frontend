/**
 * accessV2/subjectNames — resolve a restriction id to a human name, across BOTH id namespaces.
 *
 * A restricted poll carries subject ids, and on a v2 org those can be:
 *   • an ADOPTED legacy hat id — also in the legacy `roleNames` map, resolves either way;
 *   • a v2-NATIVE role id `(authority << 64) | seq` — not in the legacy map at all;
 *   • a GROUP id — not in the legacy map, and not a "role" in any legacy sense.
 *
 * Every legacy consumer resolved these through the legacy Hats list alone, so a group-restricted
 * poll rendered as "Unknown Role" (PollDetail, VotePowerReceipt) or, worse, as "All members" in
 * CreateVoteModal's review step — telling the creator the poll is open to everyone at the exact
 * moment they are confirming a restriction. The fallback chain here is: legacy names → v2 subjects
 * → a short, honest id label. It never invents "All members".
 *
 * PURE.
 */

import { toSubjectId } from './ids';

/**
 * Last-resort label for an id we have no name for: short, and obviously an id.
 * Better than "Unknown Role" (which reads as an error) and far better than silently dropping it.
 */
export function shortSubjectLabel(id) {
  const s = String(id ?? '').trim();
  if (!s) return 'Unknown role';
  return s.length <= 12 ? `Role ${s}` : `Role ${s.slice(0, 6)}…${s.slice(-4)}`;
}

/**
 * Build a resolver over the sources a page has.
 *
 * @param {object} sources
 * @param {object} [sources.legacyNames] - `{ [hatId]: name }` (POContext roleNames)
 * @param {Array} [sources.subjects] - normalised v2 subjects (roles AND groups)
 * @returns {(id: string) => string}
 */
export function makeSubjectNameResolver({ legacyNames = {}, subjects = [] } = {}) {
  const v2 = new Map();
  for (const s of subjects || []) {
    if (!s || !s.subjectId) continue;
    if (s.name) v2.set(String(s.subjectId), s.name);
  }

  return (id) => {
    const raw = String(id ?? '').trim();
    if (!raw) return 'Unknown role';

    // Legacy map first: it is what the org's own admins named these, and an adopted subject keeps
    // its hat id verbatim, so both maps agree when both know it.
    const direct = legacyNames?.[raw] || legacyNames?.[raw.toLowerCase()];
    if (direct) return direct;

    // Then the v2 subjects — the only source that knows GROUPS and v2-native roles.
    const canonical = toSubjectId(raw);
    const fromV2 = v2.get(raw) || (canonical ? v2.get(canonical) : null);
    if (fromV2) return fromV2;

    return shortSubjectLabel(raw);
  };
}

/**
 * The comma-joined label a review step / receipt shows.
 *
 * Returns null for an EMPTY list, so the caller decides what "no restriction" reads as — the bug
 * this replaces was a resolver that answered "All members" for a restriction it merely failed to
 * resolve, which is the inverse of the truth.
 *
 * @returns {string|null}
 */
export function subjectNamesLabel(ids = [], resolver) {
  const list = (ids || []).filter((x) => x !== null && x !== undefined && String(x).trim() !== '');
  if (list.length === 0) return null;
  const resolve = typeof resolver === 'function' ? resolver : makeSubjectNameResolver();
  return list.map(resolve).join(', ');
}
