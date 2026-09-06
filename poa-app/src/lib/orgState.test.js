import { describe, expect, it } from 'vitest';
import { createOrgStateReducer, selectOrgState } from '@/lib/orgState';

const initialState = Object.freeze({
  scopeName: null,
  orgId: null,
  orgChainId: null,
  treasuryContractAddress: '',
  taskManagerContractAddress: '',
  logoUrl: '',
  educationModules: [],
  poContextLoading: true,
});
const reducer = createOrgStateReducer(initialState);
const loaded = {
  ...initialState,
  scopeName: 'Decentral Park',
  orgId: 'park-id',
  orgChainId: 100,
  treasuryContractAddress: 'park-treasury',
  taskManagerContractAddress: 'park-tasks',
  logoUrl: 'park-logo',
  educationModules: [{ id: 'park-module' }],
  poContextLoading: false,
};

describe('organization data scope', () => {
  it.each(['Test6', 'Unknown organization', ''])(
    'hides every previous-org field on the first render for "%s", before effects run',
    (name) => {
      expect(selectOrgState(loaded, name, initialState)).toBe(initialState);
    },
  );

  it('preserves the exact state and array references on navigation within one org', () => {
    expect(selectOrgState(loaded, 'Decentral Park', initialState)).toBe(loaded);
  });

  it('resets contracts, chain, metadata and modules before looking up the next org', () => {
    const reset = reducer(loaded, { type: 'RESET_ORG', orgName: 'Test6' });
    expect(reset).toEqual({ ...initialState, scopeName: 'Test6' });
    expect(selectOrgState(reset, 'Test6', initialState)).toBe(reset);
  });

  it('rejects late lookup, metadata and module responses from the previous org', () => {
    const current = reducer(loaded, { type: 'RESET_ORG', orgName: 'Test6' });
    for (const payload of [
      { orgId: 'park-id', orgChainId: 100 },
      { logoUrl: 'late-park-logo' },
      { educationModules: [{ id: 'late-park-module' }] },
    ]) {
      expect(reducer(current, {
        type: 'SET_ORG_DATA', orgName: 'Decentral Park', payload,
      })).toBe(current);
    }
    expect(reducer(current, {
      type: 'SET_LOADING', orgName: 'Decentral Park', payload: false,
    })).toBe(current);
  });

  it('finishes a not-found lookup without restoring the previous contracts', () => {
    const reset = reducer(loaded, { type: 'RESET_ORG', orgName: 'Unknown organization' });
    const missing = reducer(reset, {
      type: 'SET_LOADING', orgName: 'Unknown organization', payload: false,
    });
    expect(missing).toEqual({
      ...initialState, scopeName: 'Unknown organization', poContextLoading: false,
    });
  });

  it('accepts current-org data while retaining its scope', () => {
    const reset = reducer(loaded, { type: 'RESET_ORG', orgName: 'Test6' });
    const current = reducer(reset, {
      type: 'SET_ORG_DATA',
      orgName: 'Test6',
      payload: { orgId: 'test6-id', taskManagerContractAddress: 'test6-tasks' },
    });
    expect(current).toEqual({
      ...initialState,
      scopeName: 'Test6',
      orgId: 'test6-id',
      taskManagerContractAddress: 'test6-tasks',
    });
  });
});
