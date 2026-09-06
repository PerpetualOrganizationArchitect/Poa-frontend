/** Scope tokens change only when the organization or its endpoint changes. */
export function selectVotingState(state, scope, initialState) {
  return state.scope === scope ? state : initialState;
}

export function createVotingStateReducer(initialState) {
  return (state, action) => {
    if (action.type === 'RESET_VOTING_SCOPE') return { ...initialState, scope: action.scope };
    if (action.type === 'SET_VOTING_DATA' && state.scope === action.scope) {
      return { ...state, ...action.payload };
    }
    return state;
  };
}

/** Apollo can retain data while a query is skipped or its variables change. */
export function votingDataForOrg(data, orgId) {
  return orgId && data?.organization?.id === orgId ? data : undefined;
}

// Compare the token, not just the id: A -> B -> A must not accept a request
// started during the previous visit to A, or clear the new visit's busy state.
export function isCurrentVotingRequest(requestScope, currentScope) {
  return requestScope === currentScope;
}
