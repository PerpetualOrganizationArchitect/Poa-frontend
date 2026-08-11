import { useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/router';

export const VIEW_MODES = ['board', 'list', 'gantt'];
const STORAGE_KEY = 'poa.tasks.viewMode';
const DEFAULT_MODE = 'board';
const MOBILE_DEFAULT = 'list';
// Same breakpoint MainLayout uses to decide mobile vs desktop.
const MOBILE_QUERY = '(max-width: 47.99em)';

const isValid = (m) => VIEW_MODES.includes(m);

const readStoredMode = () => {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  // An explicit, previously-chosen view always wins.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isValid(raw)) return raw;
  } catch {}
  // No saved preference yet — pick the best default for the device. Board reads
  // best on wide screens; on phones the kanban is a cramped single-column
  // carousel, so phones default to the List.
  try {
    if (window.matchMedia && window.matchMedia(MOBILE_QUERY).matches) {
      return MOBILE_DEFAULT;
    }
  } catch {}
  return DEFAULT_MODE;
};

// ONE stored mode shared by every useViewMode() caller. This used to be a
// per-instance `useState(readStoredMode)`, which forked: ViewSwitcher's copy
// advanced when you picked a view, while TaskBoard's copy kept whatever it read
// back at mount. The two only agreed through `?view=` in the URL, so any
// navigation that dropped that param snapped the Board back to the stale mode.
let sharedMode = null; // read from storage lazily, on first client access
const listeners = new Set();

const subscribe = (onStoreChange) => {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
};

const getSharedMode = () => {
  if (sharedMode === null) sharedMode = readStoredMode();
  return sharedMode;
};

// We statically export, so these hooks hydrate — and there is no `window`
// during that pass. useSyncExternalStore re-renders with the real client
// snapshot immediately after.
const getServerMode = () => DEFAULT_MODE;

const putSharedMode = (next) => {
  if (sharedMode === next) return;
  sharedMode = next;
  listeners.forEach((fn) => fn());
};

// URL `?view=` is the source of truth; the shared mode above is the fallback
// for navigations to /tasks without a query param. It resolves synchronously on
// first render, so switching projects (which can strip `?view=`) never renders
// the Board for a tick before catching up.
export function useViewMode({ allowGantt = true, allowBoard = true } = {}) {
  const router = useRouter();
  const urlMode = router.query.view;

  const storedMode = useSyncExternalStore(subscribe, getSharedMode, getServerMode);

  let rawMode = (isValid(urlMode) && urlMode) || storedMode || DEFAULT_MODE;
  if (!allowGantt && rawMode === 'gantt') rawMode = 'list';
  if (!allowBoard && rawMode === 'board') rawMode = 'list';
  const viewMode = rawMode;

  const setViewMode = useCallback(
    (next) => {
      if (!isValid(next)) return;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, next);
        }
      } catch {}
      putSharedMode(next);
      const nextQuery = { ...router.query, view: next };
      router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
        shallow: true,
      });
    },
    [router],
  );

  return { viewMode, setViewMode };
}
