import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import { hasBounty as checkHasBounty } from '@/util/tokens';
import { isClaimExpired } from '@/util/deadlineUtils';
import {
  isTaskMine,
  taskNeedsReview,
  userCanReviewAnywhere,
} from '@/util/taskIndicators';

// A single filter surface shared by Board, List, and Gantt. URL query params are
// the source of truth so a filtered view is a shareable link:
//   ?q=<search text>&filters=<comma-separated chip ids>
// Mirrors useViewMode.js's shallow `router.replace` pattern for `view`.
//
// Search text keeps a local, immediate copy so typing filters cards live, and
// debounces the URL write (~200ms). Chips write the URL immediately.

const TaskFilterContext = createContext(null);

const DEBOUNCE_MS = 200;

// Chip definitions. `reviewGated` chips only render when the user can review in
// at least one project (see canReviewAnywhere below).
export const FILTER_CHIPS = [
  { id: 'mine', label: 'Mine' },
  { id: 'needs-review', label: 'Needs review', reviewGated: true },
  { id: 'open', label: 'Open to claim' },
  { id: 'has-bounty', label: 'Bounty' },
  { id: 'expired', label: 'Expired' },
];

const readCsv = (v) =>
  (typeof v === 'string' ? v : '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function TaskFilterProvider({ children }) {
  const router = useRouter();
  const { accountAddress } = useAuth() || {};
  const {
    address: ctxAddress,
    graphUsername,
    userData,
    hasExecRole,
  } = useUserContext() || {};
  const { projectsData } = useProjectContext() || {};

  const address = accountAddress || ctxAddress || '';
  const userHatIds = userData?.hatIds || [];

  // --- Search text: local-immediate value, debounced URL write ---------------
  const urlQ = typeof router.query.q === 'string' ? router.query.q : '';
  const [q, setLocalQ] = useState(urlQ);
  const lastWrittenQ = useRef(urlQ);
  const debounceRef = useRef(null);

  // Keep the local value in sync when the URL changes from outside our own write
  // (deep-link load, back/forward). Guards against a write→read feedback loop.
  useEffect(() => {
    if (urlQ !== lastWrittenQ.current) {
      lastWrittenQ.current = urlQ;
      setLocalQ(urlQ);
    }
  }, [urlQ]);

  const writeQ = useCallback(
    (next) => {
      lastWrittenQ.current = next;
      const nextQuery = { ...router.query };
      if (next) nextQuery.q = next;
      else delete nextQuery.q;
      router.replace(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  const setQ = useCallback(
    (next) => {
      setLocalQ(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => writeQ(next), DEBOUNCE_MS);
    },
    [writeQ],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // --- Quick-filter chips: URL is the source of truth, written immediately ----
  const filtersCsv = typeof router.query.filters === 'string' ? router.query.filters : '';
  const activeFilters = useMemo(() => new Set(readCsv(filtersCsv)), [filtersCsv]);

  const toggleFilter = useCallback(
    (id) => {
      const next = new Set(readCsv(router.query.filters));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const nextQuery = { ...router.query };
      const csv = [...next].join(',');
      if (csv) nextQuery.filters = csv;
      else delete nextQuery.filters;
      router.replace(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  const clearAll = useCallback(() => {
    setLocalQ('');
    lastWrittenQ.current = '';
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const nextQuery = { ...router.query };
    delete nextQuery.q;
    delete nextQuery.filters;
    router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true },
    );
  }, [router]);

  // Chip/section gate: is review possible anywhere for this user?
  const canReviewAnywhere = useMemo(
    () => userCanReviewAnywhere(projectsData, userHatIds, hasExecRole),
    [projectsData, userHatIds, hasExecRole],
  );

  const projectById = useMemo(() => {
    const m = new Map();
    (projectsData || []).forEach((p) => {
      if (p) m.set(p.id, p);
    });
    return m;
  }, [projectsData]);

  // One pure predicate combining search + every active chip (AND semantics).
  // `columnId` overrides task.columnId — the Board passes it as a separate prop
  // where the raw task object may not carry its column.
  const predicate = useCallback(
    (task, columnId) => {
      if (!task) return false;
      const col = columnId || task.columnId;

      const text = q.trim().toLowerCase();
      if (text) {
        const hay = `${task.name || task.title || ''} ${task.description || ''}`.toLowerCase();
        if (!hay.includes(text)) return false;
      }

      for (const f of activeFilters) {
        switch (f) {
          case 'mine':
            if (!isTaskMine(task, address, graphUsername)) return false;
            break;
          case 'needs-review':
            if (!taskNeedsReview(col, projectById.get(task.projectId), userHatIds, hasExecRole))
              return false;
            break;
          case 'open':
            if (col !== 'open') return false;
            break;
          case 'has-bounty':
            if (!checkHasBounty(task.bountyToken, task.bountyPayoutRaw)) return false;
            break;
          case 'expired':
            if (!isClaimExpired(task)) return false;
            break;
          default:
            break;
        }
      }
      return true;
    },
    [q, activeFilters, address, graphUsername, projectById, userHatIds, hasExecRole],
  );

  const isFiltering = q.trim() !== '' || activeFilters.size > 0;

  const value = useMemo(
    () => ({
      q,
      setQ,
      activeFilters,
      toggleFilter,
      predicate,
      clearAll,
      isFiltering,
      canReviewAnywhere,
    }),
    [q, setQ, activeFilters, toggleFilter, predicate, clearAll, isFiltering, canReviewAnywhere],
  );

  return <TaskFilterContext.Provider value={value}>{children}</TaskFilterContext.Provider>;
}

// No-op fallback so a view rendered outside a provider still works (predicate
// passes everything → no filtering).
const NOOP_FILTERS = {
  q: '',
  setQ: () => {},
  activeFilters: new Set(),
  toggleFilter: () => {},
  predicate: () => true,
  clearAll: () => {},
  isFiltering: false,
  canReviewAnywhere: false,
};

export function useTaskFilters() {
  return useContext(TaskFilterContext) || NOOP_FILTERS;
}
