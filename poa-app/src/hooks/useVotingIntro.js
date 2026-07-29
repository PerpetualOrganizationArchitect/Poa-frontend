/**
 * useVotingIntro — drives the voting page's "learn how this works" coach-mark.
 *
 * Owns the storage IO and the reveal timing around the pure schedule in
 * `@/lib/voting/votingIntro` (visit 1 + visit 3, then retire; see that file for
 * the product rationale). The permanent counter lives in localStorage; a
 * sessionStorage marker makes one browser session count as one visit, so
 * bouncing between pages doesn't burn both touches in a minute.
 *
 * @param {string|null} orgId — POContext orgId; nothing runs until it resolves,
 *        so a member's counter is never shared between orgs.
 * @param {{ suppressed?: boolean }} opts — `suppressed` holds the nudge back
 *        while something else owns the screen (guided tour, open modal). It only
 *        defers: the nudge returns when the screen is free, so the visit that
 *        earned it isn't spent on a hint nobody could see.
 * @returns {{ nudge: 'first'|'reminder'|null, dismiss: () => void, markLearned: () => void }}
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  recordVisit,
  isFinalNudge,
  VISITS_KEY,
  INTRO_DONE_KEY,
  SESSION_KEY,
} from '@/lib/voting/votingIntro';

/** Let the board paint before the coach-mark arrives — a nudge that beats the
 *  content it points at reads like an interstitial. */
const REVEAL_DELAY_MS = 900;

/** Returns null when storage is unavailable (locked-down browser / private mode). */
function readStored(orgId) {
  try {
    return {
      visits: Number(window.localStorage.getItem(VISITS_KEY(orgId))),
      introDone: window.localStorage.getItem(INTRO_DONE_KEY(orgId)) === '1',
      // Already counted in this tab's session — a re-navigation, not a new visit.
      countedThisSession: window.sessionStorage.getItem(SESSION_KEY(orgId)) === '1',
    };
  } catch {
    return null;
  }
}

function writeStored(orgId, { visits, introDone }) {
  try {
    window.localStorage.setItem(VISITS_KEY(orgId), String(visits));
    if (introDone) window.localStorage.setItem(INTRO_DONE_KEY(orgId), '1');
    window.sessionStorage.setItem(SESSION_KEY(orgId), '1');
    return true;
  } catch {
    return false;
  }
}

export function useVotingIntro(orgId, { suppressed = false } = {}) {
  const [nudge, setNudge] = useState(null);

  // Counting and revealing are deliberately separate. React StrictMode runs
  // effects setup → cleanup → setup in dev: the count must happen ONCE (a double
  // count would inflate the counter and skip the visit-3 reminder), but the
  // reveal timer must be re-armed on every setup, or the cleanup from the first
  // pass cancels the only timer and the nudge never appears.
  const decisionRef = useRef(null); // { orgId, nudge } — this page view's verdict
  const settledRef = useRef(false); // shown, or closed before it could be shown
  const timerRef = useRef(null);

  useEffect(() => {
    if (!orgId || typeof window === 'undefined') return undefined;

    let decision = decisionRef.current;
    if (!decision || decision.orgId !== orgId) {
      // Switching orgs on the same mounted page is a new page for this purpose:
      // a hint already shown (or dismissed) for org A must not silence org B.
      settledRef.current = false;
      // No storage means no memory of visit 1, so every visit would look like a
      // first visit and the hint would nag forever. Stay quiet instead.
      const stored = readStored(orgId);
      const alreadyCounted = stored?.countedThisSession;
      const next = stored === null || alreadyCounted ? null : recordVisit(stored);
      const persisted = next !== null && writeStored(orgId, next);
      decision = { orgId, nudge: persisted ? next.nudge : null };
      decisionRef.current = decision;
    }

    if (!decision.nudge || settledRef.current) return undefined;

    timerRef.current = window.setTimeout(() => {
      settledRef.current = true;
      setNudge(decision.nudge);
    }, REVEAL_DELAY_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [orgId]);

  /** Stop a pending reveal: the member acted before the delay elapsed (they
   *  clicked the strip straight away), so the nudge must never arrive later. */
  const cancelPending = useCallback(() => {
    settledRef.current = true;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const retire = useCallback(() => {
    if (!orgId || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(INTRO_DONE_KEY(orgId), '1');
    } catch {
      /* storage disabled — nothing was scheduled anyway */
    }
  }, [orgId]);

  /** The member has met the explainer — retire the intro for good. */
  const markLearned = useCallback(() => {
    cancelPending();
    retire();
    setNudge(null);
  }, [cancelPending, retire]);

  /** Dismissed without opening it. The last scheduled nudge retires anyway. */
  const dismiss = useCallback(() => {
    cancelPending();
    if (isFinalNudge(nudge)) retire();
    setNudge(null);
  }, [cancelPending, nudge, retire]);

  return { nudge: suppressed ? null : nudge, dismiss, markLearned };
}

export default useVotingIntro;
