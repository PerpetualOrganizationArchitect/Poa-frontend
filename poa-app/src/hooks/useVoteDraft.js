import { useCallback, useEffect, useRef, useState } from 'react';
import { usePOContext } from '@/context/POContext';

/**
 * useVoteDraft
 *
 * Debounced localStorage autosave for the Create-a-Vote form, keyed per org
 * (`poa:voteDraft:<orgId>`). Mirrors the useTaskDrafts persistence pattern but
 * for a single in-progress proposal object.
 *
 * The hook is deliberately dumb about the proposal's shape: it stores whatever
 * object it's given and hands the same object back on restore. CreateVoteModal
 * owns applying a restored draft back into form state (via the form's
 * general-purpose merge setter), so this hook never needs the granular field
 * handlers.
 *
 * Lifecycle:
 *   - restore-on-open is a one-shot: `pendingDraft` holds the draft that existed
 *     when the modal opened, so the UI can offer "Restored your unsaved draft —
 *     start fresh?" without a save/restore feedback loop re-triggering it.
 *   - autosave is debounced (~500ms) and suppressed until the modal is open, so
 *     merely mounting the modal offscreen never writes a draft.
 *   - clear() wipes the key (used on successful submit and on explicit
 *     start-fresh).
 */

const STORAGE_PREFIX = 'poa:voteDraft:';
const DEBOUNCE_MS = 500;

function getKey(orgId) {
  return `${STORAGE_PREFIX}${orgId}`;
}

function loadDraft(orgId) {
  if (!orgId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getKey(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(orgId, draft) {
  if (!orgId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getKey(orgId), JSON.stringify(draft));
  } catch {}
}

function removeDraft(orgId) {
  if (!orgId || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getKey(orgId));
  } catch {}
}

/**
 * A proposal counts as "worth saving" once the user has typed anything
 * meaningful — otherwise a freshly-opened default form would persist an empty
 * draft and the restore prompt would appear on every open.
 */
function isMeaningful(proposal) {
  if (!proposal || typeof proposal !== 'object') return false;
  if (proposal.name && proposal.name.trim() !== '') return true;
  if (proposal.description && proposal.description.trim() !== '') return true;
  if ((proposal.options || []).some(o => (o || '').trim() !== '')) return true;
  if (proposal.transferAddress && proposal.transferAddress.trim() !== '') return true;
  if (proposal.transferAmount && String(proposal.transferAmount).trim() !== '') return true;
  if (proposal.setterTemplate) return true;
  if ((proposal.electionCandidates || []).length > 0) return true;
  if (proposal.roleConfig?.name && proposal.roleConfig.name.trim() !== '') return true;
  return false;
}

export function useVoteDraft({ isOpen, proposal }) {
  const { orgId } = usePOContext();

  // Draft that existed at the moment the modal last opened. Drives the
  // dismissible restore banner; null once dismissed/restored/none-existed.
  const [pendingDraft, setPendingDraft] = useState(null);

  const debounceRef = useRef(null);
  // Suppress autosave for the render(s) immediately after we clear or after a
  // restore, so those state churns don't re-persist.
  const suppressRef = useRef(false);

  // On open: snapshot any existing draft exactly once.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setPendingDraft(loadDraft(orgId));
    }
    if (!isOpen && wasOpenRef.current) {
      // On close, flush any pending debounce immediately so a last edit isn't lost.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, orgId]);

  // Debounced autosave while the modal is open.
  useEffect(() => {
    if (!isOpen || !orgId) return undefined;
    if (suppressRef.current) {
      suppressRef.current = false;
      return undefined;
    }
    if (!isMeaningful(proposal)) return undefined;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      writeDraft(orgId, proposal);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, orgId, proposal]);

  const clear = useCallback(() => {
    suppressRef.current = true;
    removeDraft(orgId);
    setPendingDraft(null);
  }, [orgId]);

  // Explicit "start fresh" — drop both the stored draft and the banner. The
  // caller is responsible for resetting form state.
  const startFresh = useCallback(() => {
    clear();
  }, [clear]);

  // Dismiss the restore banner without discarding the draft (it keeps
  // autosaving as the user edits).
  const dismissRestorePrompt = useCallback(() => {
    setPendingDraft(null);
  }, []);

  // Mark that the next proposal change came from a programmatic restore, so it
  // doesn't immediately re-persist an identical copy.
  const markRestored = useCallback(() => {
    suppressRef.current = true;
    setPendingDraft(null);
  }, []);

  return {
    orgId,
    pendingDraft,
    clear,
    startFresh,
    dismissRestorePrompt,
    markRestored,
  };
}

export default useVoteDraft;
