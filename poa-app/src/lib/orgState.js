/**
 * Org data is useful only for the name whose lookup produced it. The render
 * guard hides a previous org before the lookup effect can reset the reducer;
 * scoped actions then reject any late response from that previous org.
 */
export function selectOrgState(state, orgName, initialState) {
  return state.scopeName === orgName ? state : initialState;
}

export function createOrgStateReducer(initialState) {
  return (state, action) => {
    if (action.type === 'RESET_ORG') {
      return { ...initialState, scopeName: action.orgName };
    }
    if (state.scopeName !== action.orgName) return state;

    switch (action.type) {
      case 'SET_ORG_DATA':
        return { ...state, ...action.payload };
      case 'SET_LOADING':
        return { ...state, poContextLoading: action.payload };
      default:
        return state;
    }
  };
}
