/**
 * Pure helpers for the Create-a-Vote "remove people from a role" flow.
 *
 * MembershipAuthority.remove(subject, user, false) is intentionally a SOFT removal. It clears an
 * explicit grant, then re-checks the other eligibility sources and reverts RemovalIneffective when
 * the person still qualifies through an open role, live vouches, or verified email. The form uses
 * the same three fields the subgraph fold exposes to decide when the call must set `ban=true`.
 */

import { MAX_CALLS_PER_BATCH } from '@/config/contractLimits';
import { actionReasonCopy } from './rules';

export const defaultRoleRemovalConfig = {
  subjectId: '',
  subjectName: '',
  // [{ address, username, ban, banReasons }]
  members: [],
  // A hard removal writes a governance Ban. Never infer consent from selection alone.
  confirmBans: false,
  // Drafts and deep links must revisit the live role roster before they can advance.
  liveReconciled: false,
};

export const ROLE_REMOVAL_UNAVAILABLE_MESSAGE =
  'Role-removal votes are available after this group moves to the new roles system.';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;

function validSubjectId(value) {
  const raw = String(value ?? '').trim();
  if (!/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(raw)) return false;
  try {
    const id = BigInt(raw);
    return id > 0n && id < (1n << 256n);
  } catch {
    return false;
  }
}

/** The surviving eligibility sources MembershipAuthority.canRemove checks for a soft removal. */
export function removalBanReasons(membership) {
  if (!membership) return [];
  const reasons = [];
  if (membership.emailVerified) reasons.push('verified email');
  if (membership.vouchMet) reasons.push('live vouches');
  if (membership.subject?.defaultAllow) reasons.push('an open role');
  return reasons;
}

/** `true` means a soft remove would revert RemovalIneffective on the current indexed state. */
export function removalNeedsBan(membership) {
  return removalBanReasons(membership).length > 0;
}

/**
 * A checked confirmation covers one exact set of durable governance bans. Selecting another
 * ban-backed member (or a live refresh changing who needs a ban) expands that consequence and
 * therefore requires a fresh confirmation. Soft-only selection changes do not.
 */
export function retainBanConfirmation(currentMembers, nextMembers, confirmed) {
  if (!confirmed) return false;
  const banTargets = (members) => (Array.isArray(members) ? members : [])
    .filter((member) => Boolean(member?.ban))
    .map((member) => String(member?.address || '').toLowerCase())
    .sort();
  const before = banTargets(currentMembers);
  const after = banTargets(nextMembers);
  return after.length > 0
    && before.length === after.length
    && before.every((address, index) => address === after[index]);
}

/**
 * Validate the persisted form payload independently of React and the current query result.
 * The builder calls this again, so a restored/tampered draft cannot bypass the UI limit.
 */
export function roleRemovalConfigError(config) {
  const rc = config || {};
  if (!rc.subjectId) return 'Please select a role.';
  if (!validSubjectId(rc.subjectId)) return 'The selected role has an invalid id.';
  if (!rc.liveReconciled) return 'Wait for the current role holders to finish loading.';

  const members = Array.isArray(rc.members) ? rc.members : [];
  if (members.length === 0) return 'Select at least one person to remove.';
  if (members.length > MAX_CALLS_PER_BATCH) {
    return `A vote can remove at most ${MAX_CALLS_PER_BATCH} people at once. Split this into another vote.`;
  }

  const seen = new Set();
  for (const member of members) {
    const address = String(member?.address || '');
    if (!ADDRESS_RE.test(address)) return 'One of the selected people has an invalid address.';
    const key = address.toLowerCase();
    if (key === ZERO_ADDRESS) return 'The zero address cannot hold a role.';
    if (seen.has(key)) return 'The same person cannot be selected twice.';
    seen.add(key);
  }

  if (members.some((member) => Boolean(member?.ban)) && !rc.confirmBans) {
    return 'Confirm that the required blocks should prevent those people from reclaiming this role.';
  }
  return null;
}

export function shortAddress(address) {
  const value = String(address || '');
  return value.length === 42 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function removalMemberLabel(member) {
  return String(member?.username || '').trim() || shortAddress(member?.address);
}

const ROLE_REMOVAL_BATCH_SUMMARY = /^Remove (\d+) role membership(?:s)? in one atomic batch\.$/;

/** Human metadata is indexed cross-device; the first line is also a portable call-count marker. */
export function buildRoleRemovalSummaries(config) {
  const rc = config || {};
  const members = Array.isArray(rc.members) ? rc.members : [];
  if (members.length === 0) return [];
  const roleName = rc.subjectName || 'the selected role';
  return [
    `Remove ${members.length} role membership${members.length === 1 ? '' : 's'} in one atomic batch.`,
    ...members.map((member) => (
      member.ban
        ? `Remove ${removalMemberLabel(member)} from ${roleName} and block them from reclaiming it.`
        : `Remove ${removalMemberLabel(member)} from ${roleName}.`
    )),
  ];
}

/**
 * Recover this proposal's safe finalization floor from indexed IPFS metadata on any device.
 * Local storage remains a fast exact path, but the creator is rarely guaranteed to be the member
 * who counts the votes days later.
 */
export function roleRemovalGasFloorFromProposal(proposal) {
  const summaries = Array.isArray(proposal?.actionSummaries) ? proposal.actionSummaries : [];
  for (const summary of summaries) {
    const match = String(summary || '').match(ROLE_REMOVAL_BATCH_SUMMARY);
    if (!match) continue;
    const callCount = Number(match[1]);
    if (!Number.isInteger(callCount) || callCount < 1 || callCount > MAX_CALLS_PER_BATCH) return null;
    return 400_000 + 250_000 * callCount;
  }
  return null;
}

/**
 * Re-read every selected pair from MembershipAuthority immediately before proposal creation.
 * The winning batch is atomic, so one stale or newly-blocked row would otherwise make the whole
 * action fail later while HybridVoting still records a successful finalize transaction.
 *
 * This narrows the stale-data window; it cannot eliminate changes made during the voting period.
 */
export async function preflightRoleRemovals({ membershipAuthority, authority, config }) {
  const error = roleRemovalConfigError(config);
  if (error) throw new Error(error);
  if (!authority || typeof membershipAuthority?.canRemove !== 'function') {
    throw new Error('The new roles service is still loading. Please try again in a moment.');
  }

  let checks;
  try {
    checks = await Promise.all((config.members || []).map(async (member) => ({
      member,
      // Always test the non-banning form first. Its RemovalIneffective result is the
      // authority's live answer to "does this row require a durable governance Ban?".
      // Calling canRemove(..., true) for an already-marked row would hide a blocker that
      // disappeared since the draft was built and let an unnecessary Ban through.
      result: await membershipAuthority.canRemove(
        authority,
        config.subjectId,
        member.address,
        false,
      ),
    })));
  } catch (cause) {
    const failure = new Error('Could not verify the selected role memberships. Please try again.');
    failure.cause = cause;
    throw failure;
  }

  const staleChoice = checks.find(({ member, result }) => {
    const liveNeedsBan = Number(result?.reason) === 7;
    return (Number(result?.reason) === 0 || liveNeedsBan)
      && liveNeedsBan !== Boolean(member?.ban);
  });
  if (staleChoice) {
    const label = removalMemberLabel(staleChoice.member);
    if (Number(staleChoice.result?.reason) === 7) {
      throw new Error(
        `${label} now qualifies for this role another way, so a normal removal would not work. `
        + 'Go back and reselect them to review the required block.'
      );
    }
    throw new Error(
      `${label} no longer needs a governance block. `
      + 'Go back and reselect them so the vote uses a normal removal.'
    );
  }

  // RemovalIneffective is expected only for a row whose confirmed action is the hard
  // `remove(..., true)` form. Every other non-Ok result invalidates the atomic batch.
  const invalid = checks.find(({ member, result }) => (
    Number(result?.reason) !== 0
    && !(Boolean(member?.ban) && Number(result?.reason) === 7)
  ));
  if (invalid) {
    const label = removalMemberLabel(invalid.member);
    const reason = actionReasonCopy(invalid.result?.reason);
    if (reason.name === 'NotMember') {
      throw new Error(`${label} no longer holds this role. Go back and refresh the selection.`);
    }
    throw new Error(
      `${label} cannot be removed right now${reason.message ? `: ${reason.message}` : '.'}`
    );
  }

  return checks.map(({ result }) => result);
}

/** Auto-copy kept deliberately compact even when all 20 batch slots are selected. */
export function buildRoleRemovalCopy(config) {
  const rc = config || {};
  const members = Array.isArray(rc.members) ? rc.members : [];
  const roleName = String(rc.subjectName || 'the selected role').trim();
  if (!rc.subjectId || members.length === 0) return { title: '', description: '' };

  const who = members.length === 1
    ? removalMemberLabel(members[0])
    : `${members.length} people`;
  const banCount = members.filter((member) => Boolean(member?.ban)).length;
  const title = `Remove ${who} from ${roleName}`;

  let consequence = 'They can only receive the role again through a later grant or eligibility change.';
  if (banCount === members.length) {
    consequence = 'They will also be blocked from reclaiming it until another vote unblocks them.';
  } else if (banCount > 0) {
    consequence = `${banCount} ${banCount === 1 ? 'person' : 'people'} will also be blocked from reclaiming it because their current eligibility would otherwise keep the role.`;
  }

  return {
    title,
    description: `If approved, remove ${who} from ${roleName}. ${consequence}`,
  };
}

export { MAX_CALLS_PER_BATCH as MAX_ROLE_REMOVALS };
