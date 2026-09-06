import { describe, expect, it } from 'vitest';
import {
  createVotingStateReducer,
  selectVotingState,
  votingDataForOrg,
  isCurrentVotingRequest,
} from '@/lib/voting/votingScope';

const initialState = Object.freeze({
  scope: null,
  ongoingPolls: [],
  hybridVotingCompleted: [],
  votingClasses: [],
  votingClassesByVersion: {},
  hybridThresholdPct: 0,
});
const reducer = createVotingStateReducer(initialState);
const park = { orgId: 'park-id', subgraphUrl: 'gnosis' };
const test6 = { orgId: 'test6-id', subgraphUrl: 'gnosis' };
const parkOnOtherChain = { orgId: 'park-id', subgraphUrl: 'arbitrum' };
const loaded = {
  ...initialState,
  scope: park,
  ongoingPolls: [{ id: 'park-open' }],
  hybridVotingCompleted: [{ id: 'park-finished' }],
  votingClasses: [{ classIndex: 0 }],
  votingClassesByVersion: { 1: [{ classIndex: 0 }] },
  hybridThresholdPct: 60,
};

describe('voting organization scope', () => {
  it.each([test6, parkOnOtherChain, { orgId: null, subgraphUrl: 'gnosis' }])(
    'hides old proposals, archive rows and voting rules before the new scope effects run',
    (scope) => {
      expect(selectVotingState(loaded, scope, initialState)).toBe(initialState);
    },
  );

  it('keeps state and proposal references on same-org route transitions', () => {
    expect(selectVotingState(loaded, park, initialState)).toBe(loaded);
  });

  it('stays empty if the new org voting query fails or has not answered', () => {
    const reset = reducer(loaded, { type: 'RESET_VOTING_SCOPE', scope: test6 });
    expect(reset).toEqual({ ...initialState, scope: test6 });
    expect(selectVotingState(reset, test6, initialState)).toBe(reset);
  });

  it('rejects an old-scope transform after reset and accepts the new scope', () => {
    const reset = reducer(loaded, { type: 'RESET_VOTING_SCOPE', scope: test6 });
    expect(reducer(reset, {
      type: 'SET_VOTING_DATA', scope: park, payload: loaded,
    })).toBe(reset);
    expect(reducer(reset, {
      type: 'SET_VOTING_DATA', scope: test6, payload: { ongoingPolls: [{ id: 'test6-open' }] },
    })).toEqual({ ...reset, ongoingPolls: [{ id: 'test6-open' }] });
  });

  it('does not process an Apollo result retained from the previous organization', () => {
    const oldResult = { organization: { id: 'park-id', hybridVoting: { proposals: [] } } };
    expect(votingDataForOrg(oldResult, 'test6-id')).toBeUndefined();
    expect(votingDataForOrg(oldResult, null)).toBeUndefined();
    expect(votingDataForOrg(oldResult, 'park-id')).toBe(oldResult);
    expect(votingDataForOrg({ organization: null }, 'park-id')).toBeUndefined();
  });

  it('discards late rescue/pagination writes and cleanup after switching orgs or endpoints', () => {
    expect(isCurrentVotingRequest(park, test6)).toBe(false);
    expect(isCurrentVotingRequest(park, parkOnOtherChain)).toBe(false);
    expect(isCurrentVotingRequest(park, park)).toBe(true);
  });

  it('does not accept a previous visit request after returning to the same org', () => {
    const returnVisit = { ...park };
    expect(isCurrentVotingRequest(park, returnVisit)).toBe(false);
    expect(selectVotingState(loaded, returnVisit, initialState)).toBe(initialState);
    expect(isCurrentVotingRequest(returnVisit, returnVisit)).toBe(true);
  });
});
