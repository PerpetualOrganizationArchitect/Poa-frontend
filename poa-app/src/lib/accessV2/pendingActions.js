/**
 * accessV2/pendingActions — the delegation review window (ACCESS-V2-SPEC.md §4).
 *
 * PURE.
 *
 * ONE pending-action model covers every delegated lifecycle act (Grant, Offer, Remove). Each act
 * writes exactly one entry `{ action, subject, user, actor, activatesAt }`; finalize/cancel/void
 * semantics are identical across the three.
 *
 * The delay is a REVIEW WINDOW, and a review window nobody can see is not a review window — so
 * these surfaces are load-bearing:
 *   • an OFFER with a delay shows its activation countdown to the invitee (claim before
 *     `activatesAt` reverts NotYetActive; claim IS the finalize),
 *   • a pending delegated REMOVAL against you is VISIBLE to you, not a silent timer,
 *   • the acting manager or governance may cancel; ANY governance write on the same
 *     (subject, user) voids the entry.
 *
 * A pending entry is MACHINERY. It never makes anyone a member and it is never a third membership
 * condition.
 */

import { toSubjectId } from './ids';

export const PENDING_KIND = { GRANT: 'Grant', OFFER: 'Offer', REMOVE: 'Remove' };
export const PENDING_STATUS = {
  PENDING: 'Pending',
  CANCELLED: 'Cancelled',
  VOIDED: 'Voided',
  FINALIZED: 'Finalized',
};

/** Normalise a subgraph PendingAction row. */
export function normalizePendingAction(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    pendingId: raw.pendingId != null ? String(raw.pendingId) : null,
    subjectId: toSubjectId(raw.subject?.subjectId ?? raw.subject?.id ?? raw.subjectId),
    subjectName: raw.subject?.name || '',
    action: raw.action || PENDING_KIND.GRANT,
    user: String(raw.user || '').toLowerCase(),
    actor: String(raw.actor || '').toLowerCase(),
    actorUsername: raw.actorUsername || null,
    activatesAt: Number(raw.activatesAt || 0),
    status: raw.status || PENDING_STATUS.PENDING,
    createdAt: raw.createdAt ? Number(raw.createdAt) : null,
    resolvedAt: raw.resolvedAt ? Number(raw.resolvedAt) : null,
    cancelledBy: raw.cancelledBy ? String(raw.cancelledBy).toLowerCase() : null,
  };
}

export function normalizePendingActions(rows = []) {
  return (rows || []).map(normalizePendingAction).filter(Boolean);
}

/** Still open — not cancelled, voided or consumed. */
export function isOpen(p) {
  return Boolean(p) && p.status === PENDING_STATUS.PENDING;
}

/** Past its anchor: finalize()/claim() would now run the re-checks instead of reverting NotYetActive. */
export function isActivated(p, nowSeconds = Math.floor(Date.now() / 1000)) {
  return isOpen(p) && Number(nowSeconds) >= Number(p?.activatesAt || 0);
}

/**
 * Seconds until `activatesAt` (0 once elapsed, null when there is nothing pending).
 */
export function secondsUntilActive(p, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!isOpen(p)) return null;
  return Math.max(0, Number(p.activatesAt || 0) - Number(nowSeconds));
}

/** "2 days", "3 hours", "12 minutes", "in a moment" — the countdown label. */
export function formatCountdown(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const s = Math.max(0, Math.floor(Number(seconds)));
  if (s === 0) return 'now';
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}

/**
 * The sentence a pending action shows, from the point of view of `viewer`.
 * `subjectName` and the actor name make it concrete; the countdown makes the window visible.
 *
 * @param {object} p - normalised pending action
 * @param {string} viewer - the connected address (lowercased comparison)
 * @param {number} [nowSeconds]
 */
export function pendingActionCopy(p, viewer, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!p) return null;
  const isTarget = String(viewer || '').toLowerCase() === p.user;
  const role = p.subjectName || 'this role';
  const actor = p.actorUsername || 'a manager';
  const left = secondsUntilActive(p, nowSeconds);
  const when = left === 0 ? 'now' : `in ${formatCountdown(left)}`;

  if (!isOpen(p)) {
    const past = {
      [PENDING_STATUS.CANCELLED]: 'was cancelled',
      [PENDING_STATUS.VOIDED]: 'was superseded by a vote',
      [PENDING_STATUS.FINALIZED]: 'went through',
    }[p.status];
    return { tone: 'neutral', title: `${p.action} on ${role}`, body: `This ${past}.` };
  }

  if (p.action === PENDING_KIND.REMOVE) {
    return isTarget
      ? {
        tone: 'warning',
        title: `You are being removed from ${role}`,
        body: `${actor} started removing you from ${role}. It takes effect ${when}. Talk to your org admins if this is wrong.`,
      }
      : {
        tone: 'warning',
        title: `Removal from ${role} pending`,
        body: `${actor} started this removal. It can be finalised ${when}, and can be cancelled until then.`,
      };
  }

  if (p.action === PENDING_KIND.OFFER) {
    return isTarget
      ? {
        tone: 'info',
        title: `You have been invited to ${role}`,
        body: left === 0
          ? 'You can accept this invitation now.'
          : `You can accept this invitation ${when}.`,
      }
      : {
        tone: 'info',
        title: `Invitation to ${role} pending`,
        body: `${actor} invited them. They can accept ${when}.`,
      };
  }

  return isTarget
    ? {
      tone: 'info',
      title: `You are being added to ${role}`,
      body: `${actor} started adding you. It takes effect ${when}.`,
    }
    : {
      tone: 'info',
      title: `Addition to ${role} pending`,
      body: `${actor} started this. It can be finalised ${when}, and can be cancelled until then.`,
    };
}

/** Open entries that name `user` as the target — the "things happening to me" feed. */
export function pendingAgainstUser(rows = [], user) {
  const u = String(user || '').toLowerCase();
  if (!u) return [];
  return (rows || []).filter((p) => isOpen(p) && p.user === u);
}

/** Open entries this `actor` started — what a manager can still cancel. */
export function pendingByActor(rows = [], actor) {
  const a = String(actor || '').toLowerCase();
  if (!a) return [];
  return (rows || []).filter((p) => isOpen(p) && p.actor === a);
}

/** Open entries that are past their anchor — the finalise queue. */
export function finalizable(rows = [], nowSeconds = Math.floor(Date.now() / 1000)) {
  return (rows || []).filter(
    (p) => isActivated(p, nowSeconds) && p.action !== PENDING_KIND.OFFER
  );
}

// ── ManagerConfig ────────────────────────────────────────────────────────────────────────────

export const MANAGER_CAP = { GRANT: 1, REMOVE: 2 };

/** Normalise a subgraph ManagerConfig row. */
export function normalizeManagerConfig(raw) {
  if (!raw) return null;
  const caps = Number(raw.caps ?? 0);
  return {
    id: raw.id,
    subjectId: toSubjectId(raw.subject?.subjectId ?? raw.subject?.id ?? raw.id),
    managerSubjectId: toSubjectId(raw.managerSubjectId ?? raw.managerSubject?.subjectId) ?? '0',
    managerSubjectName: raw.managerSubject?.name || '',
    caps,
    canGrant: raw.canGrant !== undefined ? Boolean(raw.canGrant) : (caps & MANAGER_CAP.GRANT) !== 0,
    canRemove: raw.canRemove !== undefined ? Boolean(raw.canRemove) : (caps & MANAGER_CAP.REMOVE) !== 0,
    delaySecs: Number(raw.delaySecs ?? 0),
    enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : Number(raw.managerSubjectId ?? 0) !== 0,
    setAt: raw.setAt ? Number(raw.setAt) : null,
  };
}

/** caps bitmask from two checkboxes. */
export function encodeCaps({ canGrant = false, canRemove = false } = {}) {
  return (canGrant ? MANAGER_CAP.GRANT : 0) | (canRemove ? MANAGER_CAP.REMOVE : 0);
}

/** The one-line summary of a delegation, e.g. "Executives can add and remove, after 2 days". */
export function managerConfigSummary(cfg) {
  if (!cfg || !cfg.enabled) return 'Only a vote can change who holds this role.';
  const who = cfg.managerSubjectName || 'Managers';
  const verbs = [cfg.canGrant && 'add', cfg.canRemove && 'remove'].filter(Boolean);
  const what = verbs.length === 2 ? 'add and remove people' : `${verbs[0] || 'act on'} people`;
  const delay = cfg.delaySecs > 0
    ? `, taking effect after ${formatCountdown(cfg.delaySecs)}`
    : ', taking effect immediately';
  return `${who} can ${what}${delay}.`;
}
