/**
 * Human rendering of an email-invite list.
 *
 * The saved list is a merkle tree committed on-chain, but nobody voting on it should
 * ever have to read a hash. These helpers turn the stored document into the words a
 * person actually uses: who is invited, what they can become, and what changes.
 *
 * Vocabulary is deliberate and shared by both surfaces (Settings and the vote):
 *   - "invite", never "entry" or "allowlist"
 *   - "Anyone at acme.com", never "domain: acme.com"
 *   - roles by name, never a hat id
 */

/** Stable key for one invite — its type plus identifier, which is what the leaf commits to. */
export function inviteKey(invite) {
  return `${invite?.type || ''}:${String(invite?.identifier || '').toLowerCase()}`;
}

/**
 * The identifier as a sentence fragment. A domain covers everyone at it, which is a
 * materially bigger grant than one address — so the phrasing carries the type and the
 * row needs no badge.
 */
export function describeWho(invite) {
  const id = String(invite?.identifier || '').trim();
  if (!id) return '';
  return invite?.type === 'domain' ? `Anyone at ${id}` : id;
}

/**
 * Role names for one invite.
 *
 * hatIds are AUTHORITATIVE: they are what the merkle leaf commits to and what the
 * contract grants. roleIndexes is a convenience the builder writes alongside them,
 * and a stale or hand-crafted document can carry indexes that disagree — which would
 * show a voter "Member" while the vote actually hands out Treasurer.
 *
 * So: resolve from hatIds whenever they exist, and fail closed if none of them can be
 * named rather than falling back to indexes that might describe a different role.
 * Indexes are used only when the document carries no hatIds at all.
 */
export function inviteRoleNames(invite, { roleHatIds = [], roleNames = {} } = {}) {
  const nameFor = (hatId) => {
    if (hatId === undefined || hatId === null) return null;
    const direct = roleNames?.[hatId] ?? roleNames?.[String(hatId)];
    if (direct) return direct;
    // hat ids appear as decimal strings, 0x-hex, or BigInt across the stack.
    try {
      const target = BigInt(hatId);
      const match = (roleHatIds || []).find((h) => {
        try { return BigInt(h) === target; } catch { return false; }
      });
      if (match !== undefined) return roleNames?.[match] ?? roleNames?.[String(match)] ?? null;
    } catch { /* not numeric */ }
    return null;
  };

  // Authoritative path: whatever the leaf actually commits to.
  const hats = invite?.hatIds || [];
  if (hats.length) return hats.map(nameFor).filter(Boolean);

  // Only when the document carries no hat ids at all.
  return (invite?.roleIndexes || [])
    .map((i) => (roleHatIds?.[i] !== undefined ? nameFor(roleHatIds[i]) : null))
    .filter(Boolean);
}

/**
 * Canonical decimal form of a hat id. The same hat travels as '0x'-hex in a saved
 * document, a decimal string from POContext, or a number — comparing the raw strings
 * reports identical lists as changed.
 */
export function canonicalHatId(hatId) {
  try { return BigInt(hatId).toString(); } catch { return String(hatId); }
}

/** Normalize a fetched document's invites, dropping anything unrenderable. */
export function readInvites(doc) {
  const raw = Array.isArray(doc?.entries) ? doc.entries : [];
  return raw
    .filter((e) => (e?.type === 'domain' || e?.type === 'email') && e?.identifier)
    .map((e) => ({
      type: e.type,
      identifier: String(e.identifier),
      hatIds: Array.isArray(e.hatIds) ? e.hatIds : [],
      roleIndexes: Array.isArray(e.roleIndexes) ? e.roleIndexes : [],
    }));
}

/**
 * What approving `next` actually changes versus the list that is live today.
 *
 * Approving REPLACES the whole list, so a removal is a real revocation and has to be
 * as visible as an addition. A role change on an existing invite counts as changed,
 * not untouched — the same address becoming Treasurer instead of Member matters.
 */
export function diffInvites(next = [], current = null) {
  if (!Array.isArray(current)) {
    return { added: next, removed: [], changed: [], kept: [], isFirstList: true };
  }
  const byKey = (list) => new Map(list.map((i) => [inviteKey(i), i]));
  const nextMap = byKey(next);
  const currentMap = byKey(current);

  const added = next.filter((i) => !currentMap.has(inviteKey(i)));
  const removed = current.filter((i) => !nextMap.has(inviteKey(i)));
  const shared = next.filter((i) => currentMap.has(inviteKey(i)));

  return { added, removed, isFirstList: false, ...splitShared(shared, currentMap) };
}

/**
 * Roles an invite grants, as a comparable fingerprint.
 *
 * Mirrors inviteRoleNames' authority order: hat ids decide when present, indexes only
 * stand in when the document has none. Comparing BOTH arrays reported a phantom
 * "Different roles" whenever one document carried roleIndexes and the other didn't,
 * even though the enforced hats were identical — and that wrong verdict would have
 * gone into the proposal title members read on the board.
 */
function roleFingerprint(invite) {
  const hats = invite?.hatIds || [];
  if (hats.length) {
    return 'h:' + hats.map(canonicalHatId).slice().sort().join(',');
  }
  return 'i:' + (invite?.roleIndexes || []).map(Number).slice().sort((a, b) => a - b).join(',');
}

function splitShared(shared, currentMap) {
  const changed = [];
  const kept = [];
  for (const invite of shared) {
    const before = currentMap.get(inviteKey(invite));
    (roleFingerprint(invite) === roleFingerprint(before) ? kept : changed).push(invite);
  }
  return { changed, kept };
}

/** "alice@acme.com (Member)" — one invite, named, with what it grants. */
function describeLine(invite, ctx) {
  const roles = inviteRoleNames(invite, ctx);
  const who = describeWho(invite);
  return roles.length ? `${who} (${roles.join(', ')})` : who;
}

function joinList(items, limit = 6) {
  if (items.length <= limit) return items.join(', ');
  return `${items.slice(0, limit).join(', ')} and ${items.length - limit} more`;
}

/**
 * The description auto-written into the proposal, for members reading it on the
 * board or in the modal. Prose, not a data dump: it says what happens, names who
 * is affected, and states the consequence of a removal in plain words.
 */
export function describeProposal(diff, invites, ctx = {}) {
  const lines = [
    'Anyone who can prove they own one of these email addresses can join the group. '
    + 'They don’t need a wallet first.',
  ];

  if (!diff || diff.isFirstList) {
    lines.push('', `Invited (${invites.length}): ${joinList(invites.map((i) => describeLine(i, ctx)))}`);
  } else {
    const { added = [], removed = [], changed = [], kept = [] } = diff;
    if (added.length) {
      lines.push('', `Newly invited (${added.length}): ${joinList(added.map((i) => describeLine(i, ctx)))}`);
    }
    if (removed.length) {
      lines.push('', `Losing their invite (${removed.length}): ${joinList(removed.map((i) => describeWho(i)))}`
        + '. They keep any role they already claimed, they just can’t use their invite again.');
    }
    if (changed.length) {
      lines.push('', `Different roles (${changed.length}): ${joinList(changed.map((i) => describeLine(i, ctx)))}`);
    }
    if (!added.length && !removed.length && !changed.length) {
      lines.push('', 'Nothing changes. This is the same list that is already in use.');
    } else if (kept.length) {
      lines.push('', `${kept.length} other ${kept.length === 1 ? 'invite stays' : 'invites stay'} as ${kept.length === 1 ? 'it is' : 'they are'}.`);
    }
    lines.push('', 'Approving this replaces the whole list.');
  }

  return lines.join('\n');
}

/**
 * The one-line summary that becomes the proposal title and the "if this passes" text.
 * States the CHANGE, not just the size, so a member can read the board without
 * opening anything. Every branch stays in one shape: "Email invites: <what changed>".
 */
export function summarizeProposal(diff, total) {
  if (!diff || diff.isFirstList) {
    return `Email invites: ${total} invited`;
  }
  const parts = [];
  if (diff.added.length) parts.push(`${diff.added.length} added`);
  if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
  if (diff.changed?.length) parts.push(`${diff.changed.length} changed`);
  if (!parts.length) return `Email invites: no change (${total} invited)`;
  return `Email invites: ${parts.join(', ')}, ${total} invited in total`;
}
