/**
 * roleOptions — the ROLE LIST every picker in the app renders, from whichever access system this
 * org is on.
 *
 * `useRoleNames().allRoles` feeds the setter-template `roleSelect`, ElectionConfigurator's role +
 * fallback pickers, RoleConfigurator's parent picker and the restricted-poll subject picker. It
 * was built from POContext `roleHatIds` — the LEGACY Hats list.
 *
 * On an access-v2 org that list is frozen at cutover: it still contains hats that were deactivated
 * afterwards, and it can never contain a role created since, because a v2-native role has no hat
 * at all (its id is `(authority << 64) | seq`). So the pickers offer roles that no longer exist and
 * cannot offer the ones that do.
 *
 * The v2 source is the authority's ROLE subjects. The projection is deliberately LEGACY-SHAPED —
 * `{ hatId, name, index }`, with `hatId` carrying the subject id — because a migrated org adopts
 * its hat ids verbatim as subject ids, so every consumer keeps working unchanged and a v2-native
 * id flows through the same field.
 *
 * GROUPS are excluded: `allRoles` is a role picker, and a group is not a role. (`useRoleNames`'s
 * `resolveSubjectName` still resolves group ids for LABELLING — see `subjectNames.js`.)
 *
 * PURE, because there is no React harness in this repo.
 */

import { toSubjectId } from '@/lib/accessV2/ids';
import { shortSubjectLabel } from '@/lib/accessV2/subjectNames';

export const ROLE_OPTION_SOURCE = {
  LEGACY: 'legacy',
  AUTHORITY: 'authority',
};

/**
 * Build the role options, the id list and the id -> name map for one org.
 *
 * @param {object} input
 * @param {boolean} input.authorityEnabled - `useOrgAuthority().enabled`. FALSE means the output is
 *   the pre-access-v2 projection, unchanged.
 * @param {Array} input.legacyRoleHatIds - POContext `roleHatIds` (already stripped of the
 *   eligibility-module admin hat there).
 * @param {object} input.legacyRoleNames - the normalised `{ [hatId]: name }` map.
 * @param {object} input.legacyCanVoteMap - POContext `roleCanVoteMap`.
 * @param {Array} input.subjectRoles - `useAuthoritySubjects().roles` (already excludes GROUPS and
 *   the structural top hat, and carries the group-folded `canVote`).
 * @param {Array<string>} input.excludeIds - subject ids to drop even on the v2 path. The
 *   eligibility-module admin hat is adopted as a subject like any other hat, and the legacy path
 *   strips it in POContext, so the v2 path has to strip it too or it reappears in every picker.
 * @param {(hatId: string, index: number) => string} [input.nameFor] - the legacy name resolver
 *   (`getRoleName`). Used on the legacy path ONLY; on v2 the subject carries its own name.
 * @returns {{source: string, roleHatIds: string[], roleNamesById: object,
 *            allRoles: Array<object>, votingEligibleRoles: Array<object>}}
 */
export function foldRoleOptions({
  authorityEnabled = false,
  legacyRoleHatIds = [],
  legacyRoleNames = {},
  legacyCanVoteMap = {},
  subjectRoles = [],
  excludeIds = [],
  nameFor = null,
} = {}) {
  if (!authorityEnabled) {
    // ── LEGACY — the projection as it shipped. `{ hatId, name, index }`, nothing added. ───────
    const ids = legacyRoleHatIds || [];
    const allRoles = ids.length
      ? ids.map((hatId, index) => ({
        hatId: String(hatId),
        name: nameFor ? nameFor(hatId, index) : '',
        index,
      }))
      : [];
    return {
      source: ROLE_OPTION_SOURCE.LEGACY,
      roleHatIds: ids,
      roleNamesById: legacyRoleNames || {},
      allRoles,
      votingEligibleRoles: allRoles.filter(
        (role) => legacyCanVoteMap?.[role.hatId] !== false
      ),
    };
  }

  // ── ACCESS V2 ───────────────────────────────────────────────────────────────────────────────
  const excluded = new Set(
    (excludeIds || []).map(toSubjectId).filter((id) => id !== null)
  );

  const seen = new Set();
  const roles = [];
  for (const s of subjectRoles || []) {
    if (!s || s.isGroup) continue;
    const id = toSubjectId(s.subjectId ?? s.hatId);
    if (id === null || excluded.has(id) || seen.has(id)) continue;
    seen.add(id);
    roles.push({ id, subject: s });
  }

  const allRoles = roles.map(({ id, subject }, index) => ({
    hatId: id,
    // A subject with no name is a real (if rare) state; an honest short id beats "Unknown Role",
    // which reads as an error, and beats "Role 3", which is a position in a list nobody sees.
    name: (subject.name || '').trim() || shortSubjectLabel(id),
    index,
    // Group-folded DD_VOTE, straight off the subject. The legacy `roleCanVoteMap` is frozen at
    // cutover and has no entry at all for a role created since.
    canVote: subject.canVote !== false,
  }));

  const roleNamesById = { ...(legacyRoleNames || {}) };
  for (const { id, subject } of roles) {
    const name = (subject.name || '').trim();
    // Subject names win over the frozen legacy map: renaming a role is a v2 verb
    // (SUBJECT_RENAME), and it never writes back to the Hats-era name.
    if (name) roleNamesById[id] = name;
  }

  return {
    source: ROLE_OPTION_SOURCE.AUTHORITY,
    roleHatIds: allRoles.map((r) => r.hatId),
    roleNamesById,
    allRoles,
    votingEligibleRoles: allRoles.filter((role) => role.canVote !== false),
  };
}

export default foldRoleOptions;
