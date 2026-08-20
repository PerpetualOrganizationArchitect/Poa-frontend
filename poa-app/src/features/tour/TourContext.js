import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import { useAuth } from '@/context/AuthContext';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { useProjectContext } from '@/context/ProjectContext';
import { useVoteCreateGate } from '@/hooks/useVoteCreateGate';
import { projectTaskPermissions, userWearsAnyHat } from '@/util/permissions';
import { useOrgName } from '@/hooks/useOrgName';
import { TOUR_STEPS } from './tourSteps';

const TourContext = createContext(null);

function getTourStorageKey(orgName) {
  return `poa-tour-${orgName}`;
}

function loadTourState(orgName) {
  if (!orgName || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getTourStorageKey(orgName));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTourState(orgName, stateToSave) {
  if (!orgName || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getTourStorageKey(orgName), JSON.stringify(stateToSave));
  } catch {}
}

const initialState = {
  isActive: false,
  currentStepId: null, // track by ID, not index, so reactive filtering works
  orgName: null,
  showPrompt: false,
};

function tourReducer(state, action) {
  switch (action.type) {
    case 'SHOW_PROMPT':
      return { ...state, showPrompt: true, orgName: action.payload };
    case 'DISMISS_PROMPT':
      return { ...state, showPrompt: false };
    case 'START_TOUR':
      return { ...state, isActive: true, currentStepId: action.payload.firstStepId, orgName: action.payload.orgName, showPrompt: false };
    case 'RESUME_TOUR':
      return { ...state, isActive: true, currentStepId: action.payload.stepId, orgName: action.payload.orgName, showPrompt: false };
    case 'SET_STEP':
      return { ...state, currentStepId: action.payload };
    case 'COMPLETE_TOUR':
      return { ...state, isActive: false, currentStepId: null };
    case 'SKIP_TOUR':
      return { ...state, isActive: false, showPrompt: false, currentStepId: null };
    default:
      return state;
  }
}

export function TourProvider({ children }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(tourReducer, initialState);

  // Build tour context from app state (used for skip functions)
  const { isAuthenticated } = useAuth();
  const { hideTreasury, educationHubEnabled, poContextLoading, creatorHatIds } = usePOContext();
  const { hasMemberRole, userData, address } = useUserContext();
  const { projects } = useDataBaseContext();
  const { projectsData } = useProjectContext();
  const { canCreateProposal } = useVoteCreateGate();

  const userHatIds = useMemo(() => userData?.hatIds || [], [userData]);

  // The two action steps drive REAL transactions, so they are gated on the two
  // authorities the contracts actually check — TaskManager's creator hats for
  // `createProject`, and per-project CREATE (or being a manager) for `createTask`.
  // A positional role index would either block a real admin or walk a member into
  // a revert.
  const canCreateProject = useMemo(
    () => userWearsAnyHat(userHatIds, creatorHatIds),
    [userHatIds, creatorHatIds],
  );
  const canCreateTaskAnywhere = useMemo(
    () => (projectsData || []).some(
      (p) => projectTaskPermissions(p, userHatIds, address).canCreate,
    ),
    [projectsData, userHatIds, address],
  );

  const tourCtx = useMemo(() => ({
    isAuthenticated,
    hasMemberRole,
    canCreateProject,
    canCreateTaskAnywhere,
    canCreateProposal,
    hasProjects: !!(projects && projects.length > 0),
    hideTreasury: !!hideTreasury,
    educationHubEnabled: !!educationHubEnabled,
  }), [isAuthenticated, hasMemberRole, canCreateProject, canCreateTaskAnywhere, canCreateProposal, projects, hideTreasury, educationHubEnabled]);

  // Reactively compute effective steps from tourCtx, but pin the user's current
  // step so a mid-tour skip-rule flip (e.g. hasProjects becoming true after the
  // user creates one) can't make the active step disappear. Without this guard,
  // safeIndex below clamps to the last index and auto-advance trips a premature
  // COMPLETE_TOUR.
  const effectiveSteps = useMemo(() => {
    const currentId = state.currentStepId;
    return TOUR_STEPS.filter(step => {
      if (currentId && step.id === currentId) return true;
      return !step.skip || !step.skip(tourCtx);
    });
  }, [tourCtx, state.currentStepId]);

  // Resolve current step index from ID
  const currentStepIndex = state.isActive
    ? effectiveSteps.findIndex(s => s.id === state.currentStepId)
    : -1;
  // If the current step was removed by a skip change, clamp to last step
  const safeIndex = currentStepIndex >= 0 ? currentStepIndex : Math.max(0, effectiveSteps.length - 1);
  const currentStepDef = state.isActive ? effectiveSteps[safeIndex] ?? null : null;
  const pendingAction = currentStepDef?.action || null;

  // After a new org deploy, auto-show the tour prompt once org data has loaded.
  // Only consume the deploy flag once we actually dispatch the prompt — otherwise
  // a refresh during the 500ms settle would lose the welcome forever.
  const orgName = useOrgName();
  useEffect(() => {
    if (poContextLoading || !orgName) return;
    try {
      const raw = localStorage.getItem('poa-new-org-deploy');
      if (!raw) return;
      const deployData = JSON.parse(raw);
      if (deployData.orgName !== orgName) return;

      // If the user already dismissed or completed the tour for this org, respect that.
      const saved = loadTourState(orgName);
      if (saved && (saved.status === 'dismissed' || saved.status === 'completed')) {
        localStorage.removeItem('poa-new-org-deploy');
        return;
      }

      const timeoutId = setTimeout(() => {
        localStorage.removeItem('poa-new-org-deploy');
        dispatch({ type: 'SHOW_PROMPT', payload: orgName });
      }, 500);
      return () => clearTimeout(timeoutId);
    } catch {}
  }, [poContextLoading, orgName]);

  // Resume an active tour after page refresh / navigation. Runs once per mount
  // and skips if the saved step has been filtered out by current skip rules.
  const resumeAttemptedRef = React.useRef(false);
  useEffect(() => {
    if (resumeAttemptedRef.current) return;
    if (poContextLoading || !orgName) return;
    if (state.isActive) return; // already running

    const saved = loadTourState(orgName);
    if (!saved || saved.status !== 'active' || !saved.stepId) return;

    const stepIdx = effectiveSteps.findIndex(s => s.id === saved.stepId);
    if (stepIdx < 0) return; // step no longer applies (skip rule change)

    resumeAttemptedRef.current = true;
    dispatch({ type: 'RESUME_TOUR', payload: { orgName, stepId: saved.stepId } });

    const stepDef = effectiveSteps[stepIdx];
    if (stepDef.page && stepDef.page !== router.pathname) {
      const dao = router.query.org || router.query.userDAO || orgName;
      router.push(`${stepDef.page}?org=${encodeURIComponent(dao)}`).catch(() => {});
    }
  }, [poContextLoading, orgName, effectiveSteps, state.isActive, router]);

  const showPrompt = useCallback((orgName) => {
    const saved = loadTourState(orgName);
    if (saved && (saved.status === 'completed' || saved.status === 'dismissed')) return;
    dispatch({ type: 'SHOW_PROMPT', payload: orgName });
  }, []);

  const dismissPrompt = useCallback(() => {
    if (state.orgName) {
      saveTourState(state.orgName, { status: 'dismissed', dismissedAt: Date.now() });
    }
    dispatch({ type: 'DISMISS_PROMPT' });
  }, [state.orgName]);

  const startTour = useCallback((orgName) => {
    const steps = TOUR_STEPS.filter(step => !step.skip || !step.skip(tourCtx));
    const firstId = steps[0]?.id;
    dispatch({ type: 'START_TOUR', payload: { orgName, firstStepId: firstId } });
    saveTourState(orgName, { status: 'active', stepId: firstId, startedAt: Date.now() });

    const firstStep = steps[0];
    if (firstStep?.page && firstStep.page !== router.pathname) {
      // startTour's arg shadows the outer orgName; fall back to it when the
      // URL / hostname default didn't resolve anything.
      const dao = router.query.org || router.query.userDAO || orgName;
      router.push(`${firstStep.page}?org=${encodeURIComponent(dao)}`).catch(() => {});
    }
  }, [router, tourCtx]);

  const nextStep = useCallback(() => {
    const nextIdx = safeIndex + 1;
    if (nextIdx >= effectiveSteps.length) {
      saveTourState(state.orgName, { status: 'completed', completedAt: Date.now() });
      dispatch({ type: 'COMPLETE_TOUR' });
      return;
    }

    const nextStepDef = effectiveSteps[nextIdx];
    if (nextStepDef.page && nextStepDef.page !== router.pathname) {
      const dao = router.query.org || router.query.userDAO || state.orgName;
      router.push(`${nextStepDef.page}?org=${encodeURIComponent(dao)}`).catch(() => {});
    }

    dispatch({ type: 'SET_STEP', payload: nextStepDef.id });
    saveTourState(state.orgName, { status: 'active', stepId: nextStepDef.id });
  }, [safeIndex, effectiveSteps, state.orgName, router]);

  const prevStep = useCallback(() => {
    const prevIdx = safeIndex - 1;
    if (prevIdx < 0) return;

    const prevStepDef = effectiveSteps[prevIdx];
    if (prevStepDef.page && prevStepDef.page !== router.pathname) {
      const dao = router.query.org || router.query.userDAO || state.orgName;
      router.push(`${prevStepDef.page}?org=${encodeURIComponent(dao)}`).catch(() => {});
    }

    dispatch({ type: 'SET_STEP', payload: prevStepDef.id });
    saveTourState(state.orgName, { status: 'active', stepId: prevStepDef.id });
  }, [safeIndex, effectiveSteps, state.orgName, router]);

  const skipTour = useCallback(() => {
    if (state.orgName) {
      saveTourState(state.orgName, { status: 'dismissed', dismissedAt: Date.now() });
    }
    dispatch({ type: 'SKIP_TOUR' });
  }, [state.orgName]);

  // Auto-advance when a pending action's refresh event fires
  const nextStepRef = React.useRef(nextStep);
  nextStepRef.current = nextStep;
  const autoAdvancePendingRef = React.useRef(false);

  // executeWithNotification waits for the subgraph block before emitting the
  // event, but the React render pipeline (refetch → setSelectedProject → render)
  // still takes a couple hundred ms before the next step's spotlight target
  // exists in the DOM. The 100-retry × 100ms loop in useSpotlightTarget
  // covers the rest, but giving the pipeline a 2s head start avoids a flash
  // where the tooltip points at nothing.
  useRefreshSubscription(
    [RefreshEvent.PROJECT_CREATED, RefreshEvent.TASK_CREATED],
    useCallback((event) => {
      if (!state.isActive || !pendingAction || autoAdvancePendingRef.current) return;
      if (pendingAction === 'create-project' && event.event === RefreshEvent.PROJECT_CREATED) {
        autoAdvancePendingRef.current = true;
        setTimeout(() => { autoAdvancePendingRef.current = false; nextStepRef.current(); }, 2000);
      }
      if (pendingAction === 'create-task' && event.event === RefreshEvent.TASK_CREATED) {
        autoAdvancePendingRef.current = true;
        setTimeout(() => { autoAdvancePendingRef.current = false; nextStepRef.current(); }, 2000);
      }
    }, [state.isActive, pendingAction]),
    [state.isActive, pendingAction]
  );

  const value = useMemo(() => ({
    isActive: state.isActive,
    currentStep: safeIndex,
    currentStepDef,
    totalSteps: effectiveSteps.length,
    pendingAction,
    orgName: state.orgName,
    showPromptModal: state.showPrompt,
    tourCtx,
    showPrompt,
    dismissPrompt,
    startTour,
    nextStep,
    prevStep,
    skipTour,
  }), [state, safeIndex, currentStepDef, effectiveSteps.length, pendingAction, tourCtx, showPrompt, dismissPrompt, startTour, nextStep, prevStep, skipTour]);

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    return {
      isActive: false,
      currentStep: 0,
      currentStepDef: null,
      totalSteps: 0,
      pendingAction: null,
      orgName: null,
      showPromptModal: false,
      tourCtx: {},
      showPrompt: () => {},
      dismissPrompt: () => {},
      startTour: () => {},
      nextStep: () => {},
      prevStep: () => {},
      skipTour: () => {},
    };
  }
  return ctx;
}

export default TourContext;
