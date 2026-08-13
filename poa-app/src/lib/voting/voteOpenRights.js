/**
 * voteOpenRights — who may OPEN a vote in this group, in this group's own words.
 *
 * The rules panel used to guess ("Members with a creator role… polls are open
 * more widely") and then apologise for guessing ("creator roles set at
 * deployment may not be listed"). Both were wrong: the two creator sets come
 * from useVoteCreateGate — the SAME arrays that enable the Create-vote button —
 * and in every live group the poll set is equal to or NARROWER than the binding
 * set, never wider.
 *
 * So this module never states a relationship between the two tracks. It renders
 * both sets: one row when they match, two rows when they diverge. The reader
 * compares them; nobody has to write a comparison that could be false.
 *
 * Three claims, all computed, never assumed:
 *   - WHO   — the group's own role names, and only names it can resolve. A hat
 *             outside the org's role list is counted ("and 1 more role"), never
 *             invented into "Unknown Role" or printed as a 77-digit id.
 *   - HOW MANY — "Every role" when the set covers every named role (true for
 *             most groups), otherwise "2 of 5 roles". Always a statement about
 *             ROLES: a creator role can have no wearers at all.
 *   - IS THAT ME — an affirmative chip when the viewer can open one, and an
 *             explicit line when a member cannot. Silence is not an answer.
 *
 * An EMPTY set fails CLOSED, matching the contract (HatManager.hasAnyHat returns
 * false on a zero-length array, so only the executor — a passed vote — is left).
 * It is never rendered as "any member", and it never keeps its propose button:
 * useVoteCreateGate deliberately fails OPEN there, and that hedge must not leak
 * into copy that claims a right. A read that FAILED is a third state again, so
 * an RPC hiccup can never masquerade as either extreme.
 *
 * Pure module (no React) so every branch is unit-testable; OrgConstitution only
 * maps the icon keys to components.
 */

import { YOU_CAN_OPEN_CHIP } from '@/config/votingVocabulary';

/** Longest role list spelled out before the rest folds into a count. */
const MAX_NAMED_ROLES = 4;

/** Setter templates that change who can open each track. */
export const OPEN_RIGHTS_TEMPLATE = {
  binding: 'allow-proposal-creator-hybrid',
  poll: 'allow-voter-dd',
};

/**
 * DirectDemocracyVoting's permission setter writes EITHER the voting list or the
 * creator list, and its picker has no default — a poll-creator change has to say
 * which one it means or it stages a blank field and proposes the wrong right.
 */
export const POLL_CREATOR_PREFILL = { hatType: '1' };

/** Closing line of the section — true in every state, so it is always shown. */
export const OPEN_RIGHTS_NOTE =
  'Opening a vote is a separate right from voting in one — and changing who '
  + 'holds it takes a passed vote.';

/** Per-track copy. `both` is the merged row shown when the two sets match. */
const TRACK_COPY = {
  both: {
    icon: 'both',
    pending: 'Checking who can open a vote…',
    failed: 'Couldn’t load who can open a vote',
    every: 'Any member can open a vote',
    some: 'Only some roles can open a vote',
    closed: 'Only a passed vote can open one',
    can: 'can open a binding vote or start a poll.',
    unnamed: 'Only certain roles can open a binding vote or start a poll — this '
      + 'group hasn’t named them yet.',
    none: 'No role can open a binding vote or start a poll directly. New ones '
      + 'can only come from an action inside a vote this group has already passed.',
    cannot: 'Your role can’t open one yet.',
  },
  binding: {
    icon: 'binding',
    pending: 'Checking who can open a binding vote…',
    failed: 'Couldn’t load who can open a binding vote',
    every: 'Any member can open a binding vote',
    some: 'Only some roles can open a binding vote',
    closed: 'Only a passed vote can open a binding vote',
    can: 'can open one.',
    unnamed: 'Only certain roles can open one — this group hasn’t named them yet.',
    none: 'No role can open one directly. New ones can only come from an action '
      + 'inside a vote this group has already passed.',
    cannot: 'Your role can’t open one yet.',
  },
  poll: {
    icon: 'poll',
    pending: 'Checking who can start a poll…',
    failed: 'Couldn’t load who can start a poll',
    every: 'Any member can start a poll',
    some: 'Only some roles can start a poll',
    closed: 'Only a passed vote can start a poll',
    can: 'can start one.',
    unnamed: 'Only certain roles can start one — this group hasn’t named them yet.',
    none: 'No role can start one directly. New ones can only come from an action '
      + 'inside a vote this group has already passed.',
    cannot: 'Your role can’t start one yet.',
  },
};

/**
 * Why the read produced nothing. The Team page still lists the group's roles
 * (those come from the subgraph, not this read), so it stays a useful next step.
 */
const READ_FAILED_DETAIL =
  'Your group’s voting rules weren’t reachable just now — refresh to try again, '
  + 'or see this group’s roles on the Team page.';

/** Same normalisation useRoleNames applies, so both surfaces match the same ids. */
function normalizeHatId(id) {
  if (id === null || id === undefined) return '';
  const str = String(id).trim();
  return str.startsWith('0x') || str.startsWith('0X') ? str.toLowerCase() : str;
}

/**
 * The roles this group can actually name, in its own order.
 *
 * roleHatIds is POContext's user-facing list (the eligibility-admin system hat
 * is already stripped there); a hat with no resolved name is left out entirely
 * rather than rendered through useRoleNames' "Unknown Role" / "Role 3" fallback.
 */
function namedRoles(roleHatIds, roleNames) {
  const out = [];
  const seen = new Set();
  (roleHatIds || []).forEach((hatId) => {
    const id = normalizeHatId(hatId);
    if (!id || seen.has(id)) return;
    const name = roleNames?.[id] ?? roleNames?.[String(hatId)];
    if (typeof name !== 'string' || !name.trim()) return;
    seen.add(id);
    out.push({ id, name: name.trim() });
  });
  return out;
}

/** Resolve one creator set against the group's named roles. */
function resolveSet(hatIds, roles) {
  const ids = new Set(
    (hatIds || []).map(normalizeHatId).filter(Boolean)
  );
  const names = roles.filter((r) => ids.has(r.id)).map((r) => r.name);
  return {
    empty: ids.size === 0,
    names,
    // Hats the group hasn't named — counted, never named or invented.
    extraCount: ids.size - names.length,
    coversEveryRole: roles.length > 0 && roles.every((r) => ids.has(r.id)),
    ids,
  };
}

/** "Member and Executive" / "Member, Executive, Treasurer and 2 more roles". */
export function roleListPhrase(names = [], extraCount = 0) {
  const shown = names.slice(0, MAX_NAMED_ROLES);
  const hidden = names.length - shown.length + Math.max(0, extraCount);
  const items = [...shown];
  if (hidden > 0) items.push(`${hidden} more role${hidden === 1 ? '' : 's'}`);
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Coverage badge. Suppressed when unnameable hats are in the set — a fraction
 * that silently omits them would under-report who can open a vote.
 */
function coverageBadge(resolved, totalRoles) {
  if (resolved.coversEveryRole) return 'Every role';
  if (resolved.extraCount > 0 || resolved.names.length === 0 || totalRoles === 0) return null;
  return `${resolved.names.length} of ${totalRoles} roles`;
}

/**
 * 'pending' | 'failed' | 'data' — a track's read state.
 *
 * `settled` (not `loading`) decides the empty case: the hook's `loading` is
 * false on the very first render too, so treating "empty and not loading" as an
 * answer would paint the fail-closed line before the RPC had even started.
 * Ids in hand are always an answer — they can only come from a completed read.
 */
function stateOf({ hatIds, settled, failed }) {
  if ((hatIds || []).length > 0) return 'data';
  if (failed) return 'failed';
  if (!settled) return 'pending';
  return 'data';
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/** One rendered row. `actions` is empty whenever proposing would be a lie. */
function buildRow(track, state, resolved, roles, opts) {
  const copy = TRACK_COPY[track];
  const base = { key: track, track, icon: copy.icon, badges: [], detail: null, youLine: null, actions: [] };

  if (state === 'pending') return { ...base, icon: 'pending', title: copy.pending };
  if (state === 'failed') return { ...base, icon: 'failed', title: copy.failed, detail: READ_FAILED_DETAIL };
  if (resolved.empty) return { ...base, icon: 'closed', title: copy.closed, detail: copy.none };

  const badge = coverageBadge(resolved, roles.length);
  const badges = badge ? [badge] : [];
  if (opts.canOpen) badges.push(YOU_CAN_OPEN_CHIP);

  // With no nameable role in the set there is nobody to list — "and 2 more
  // roles can open one" would be a sentence about roles it never named.
  const phrase = resolved.names.length > 0
    ? roleListPhrase(resolved.names, resolved.extraCount)
    : null;
  return {
    ...base,
    title: resolved.coversEveryRole ? copy.every : copy.some,
    badges,
    detail: phrase ? `${phrase} ${copy.can}` : copy.unnamed,
    youLine: !opts.canOpen && opts.isMember ? copy.cannot : null,
    actions: opts.actions,
  };
}

/**
 * Describe who can open each kind of vote.
 *
 * @param {Object} args
 * @param {string[]} args.bindingHatIds  — HybridVoting creator hats
 * @param {string[]} args.pollHatIds     — DirectDemocracyVoting creator hats
 * @param {string[]} args.roleHatIds     — POContext.roleHatIds (user-facing)
 * @param {Object}   args.roleNames      — POContext.roleNames (hatId → name)
 * @param {boolean}  args.hasBinding     — the group deployed Blended voting
 * @param {boolean}  args.hasPolls       — the group deployed Direct democracy
 * @param {boolean}  args.settled        — a creator read has completed for this org
 * @param {boolean}  args.bindingFailed  — that creator read failed (≠ empty)
 * @param {boolean}  args.pollFailed     — that creator read failed (≠ empty)
 * @param {boolean}  args.canOpenBinding — the viewer's gate for binding votes
 * @param {boolean}  args.canOpenPoll    — the viewer's gate for polls
 * @param {boolean}  args.isMember       — the viewer is a member of this group
 * @returns {{ rows: Object[], note: string|null }}
 */
export function describeVoteOpenRights({
  bindingHatIds = [],
  pollHatIds = [],
  roleHatIds = [],
  roleNames = {},
  hasBinding = false,
  hasPolls = false,
  settled = false,
  bindingFailed = false,
  pollFailed = false,
  canOpenBinding = false,
  canOpenPoll = false,
  isMember = false,
} = {}) {
  // Nothing to describe for a group that deployed neither voting contract —
  // an absent contract is not a permission rule.
  if (!hasBinding && !hasPolls) return { rows: [], note: null };

  const roles = namedRoles(roleHatIds, roleNames);
  const binding = resolveSet(bindingHatIds, roles);
  const poll = resolveSet(pollHatIds, roles);
  const bindingState = stateOf({ hatIds: bindingHatIds, settled, failed: bindingFailed });
  const pollState = stateOf({ hatIds: pollHatIds, settled, failed: pollFailed });

  const bindingAction = {
    templateId: OPEN_RIGHTS_TEMPLATE.binding,
    templateValues: null,
    label: 'Change for binding votes',
  };
  const pollAction = {
    templateId: OPEN_RIGHTS_TEMPLATE.poll,
    templateValues: POLL_CREATOR_PREFILL,
    label: 'Change for polls',
  };

  const rows = [];
  const merged = hasBinding && hasPolls
    && bindingState === pollState
    && (bindingState !== 'data' || sameSet(binding.ids, poll.ids));

  if (merged) {
    rows.push(buildRow('both', bindingState, binding, roles, {
      canOpen: canOpenBinding && canOpenPoll,
      isMember,
      actions: [bindingAction, pollAction],
    }));
  } else {
    if (hasBinding) {
      rows.push(buildRow('binding', bindingState, binding, roles, {
        canOpen: canOpenBinding,
        isMember,
        // The row title already names the track, so the button doesn't repeat it.
        actions: [{ ...bindingAction, label: undefined }],
      }));
    }
    if (hasPolls) {
      rows.push(buildRow('poll', pollState, poll, roles, {
        canOpen: canOpenPoll,
        isMember,
        actions: [{ ...pollAction, label: undefined }],
      }));
    }
  }

  return { rows, note: OPEN_RIGHTS_NOTE };
}

export default describeVoteOpenRights;
