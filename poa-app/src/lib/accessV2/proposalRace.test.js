import { describe, it, expect } from 'vitest';
import {
  proposalCreatesSubject,
  summaryCreatesSubject,
  isSettledProposal,
  withSubjectCreationFlags,
  competingSubjectCreations,
} from './proposalRace';
import { hasCompetingSubjectCreation } from './ids';
import {
  buildCreateRoleBatch,
  buildCreateGroupBatch,
  buildMemberActionsBatch,
  buildEditPermsBatch,
} from './proposalBuilders';
import { AUTHORITY_ADDRESS as A, ALICE, MEMBERS_ID, EXECS_ID } from './fixtures';

describe('the builders declare whether they allocate a subject id', () => {
  // Nothing in the app set `createsSubject` before, so `hasCompetingSubjectCreation` — built,
  // documented and unit-tested — could never fire from any real caller.
  it('create-role and create-group say yes', () => {
    expect(buildCreateRoleBatch({ authority: A, config: { name: 'Stewards' } }).createsSubject).toBe(true);
    expect(buildCreateGroupBatch({ authority: A, config: { name: 'Everyone' } }).createsSubject).toBe(true);
  });

  it('builders that touch an EXISTING subject say no', () => {
    const grant = buildMemberActionsBatch({
      authority: A,
      subjectId: EXECS_ID,
      actions: [{ action: 'grant', address: ALICE }],
    });
    expect(grant.createsSubject).toBe(false);
    expect(buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: [], nextRows: [] }).createsSubject).toBe(false);
  });
});

describe('detection from indexed actionSummaries (the cross-device half)', () => {
  // The subgraph does not index proposal calldata, so a proposal created by ANOTHER admin on
  // ANOTHER machine can only be recognised from `ProposalMetadata.actionSummaries` — which is
  // exactly what `useAccessV2Proposal` uploads as the proposal's summaries.
  it('recognises the summary the create-role builder actually produces', () => {
    const { summaries } = buildCreateRoleBatch({ authority: A, config: { name: 'Stewards' } });
    expect(summaryCreatesSubject(summaries[0])).toBe(true);
    expect(proposalCreatesSubject({ actionSummaries: summaries })).toBe(true);
  });

  it('recognises the summary the create-group builder actually produces', () => {
    const { summaries } = buildCreateGroupBatch({
      authority: A,
      config: { name: 'Everyone', memberRoleIds: [MEMBERS_ID] },
    });
    expect(summaryCreatesSubject(summaries[0])).toBe(true);
    expect(proposalCreatesSubject({ actionSummaries: summaries })).toBe(true);
  });

  it('does NOT fire on a grant-only proposal’s summaries', () => {
    const { summaries } = buildMemberActionsBatch({
      authority: A,
      subjectId: EXECS_ID,
      subjectName: 'Executives',
      actions: [{ action: 'grant', address: ALICE }],
    });
    expect(proposalCreatesSubject({ actionSummaries: summaries })).toBe(false);
  });

  it('is anchored, so free-text prose about roles does not permanently disarm role creation', () => {
    expect(summaryCreatesSubject('Adopt a bylaw that lets the board create the role of treasurer')).toBe(false);
    expect(summaryCreatesSubject('Pay the contractor')).toBe(false);
    expect(summaryCreatesSubject('')).toBe(false);
    expect(summaryCreatesSubject(null)).toBe(false);
  });

  it('an explicit flag overrides the copy match in both directions', () => {
    expect(proposalCreatesSubject({ createsSubject: false, actionSummaries: ['Create the role “X”'] })).toBe(false);
    expect(proposalCreatesSubject({ createsSubject: true, actionSummaries: [] })).toBe(true);
  });

  it('handles a proposal with no metadata at all', () => {
    expect(proposalCreatesSubject({})).toBe(false);
    expect(proposalCreatesSubject(null)).toBe(false);
  });
});

describe('isSettledProposal', () => {
  it('an EXPIRED-but-unannounced proposal still counts as in flight', () => {
    // This is the most dangerous state of all: announceWinner can run its batch at any moment.
    expect(isSettledProposal({ status: 'Active', isExpired: true, wasExecuted: false })).toBe(false);
  });

  it('an executed proposal is settled, in either field spelling', () => {
    expect(isSettledProposal({ wasExecuted: true })).toBe(true);
    expect(isSettledProposal({ executed: true })).toBe(true);
  });

  it('a non-Active subgraph status is settled', () => {
    expect(isSettledProposal({ status: 'Passed' })).toBe(true);
    expect(isSettledProposal({ status: 'Rejected' })).toBe(true);
    expect(isSettledProposal({ status: 'Active' })).toBe(false);
  });
});

describe('end to end: an ongoing create-role proposal trips the wizard warning', () => {
  // Shaped like VotingContext's transformed proposals, which is what the team page now passes.
  const ongoingCreateRole = {
    id: 'hv-7',
    title: 'New role: Stewards',
    status: 'Active',
    wasExecuted: false,
    isOngoing: true,
    isExpired: false,
    actionSummaries: buildCreateRoleBatch({ authority: A, config: { name: 'Stewards' } }).summaries,
  };
  const ongoingPayment = {
    id: 'hv-8',
    status: 'Active',
    wasExecuted: false,
    actionSummaries: ['If Yes wins, send 5 xDAI to the contractor'],
  };

  it('withSubjectCreationFlags resolves the flag the warning keys on', () => {
    const flagged = withSubjectCreationFlags([ongoingCreateRole, ongoingPayment]);
    expect(flagged.map((p) => p.createsSubject)).toEqual([true, false]);
  });

  it('the wizard’s warning fires for a competing proposal and not for an unrelated one', () => {
    const warned = buildCreateRoleBatch({
      authority: A,
      activeProposals: withSubjectCreationFlags([ongoingCreateRole]),
      config: { name: 'Auditors' },
    });
    expect(warned.warnings.join(' ')).toMatch(/creates a role or group is still open/);

    const quiet = buildCreateRoleBatch({
      authority: A,
      activeProposals: withSubjectCreationFlags([ongoingPayment]),
      config: { name: 'Auditors' },
    });
    expect(quiet.warnings).toEqual([]);
  });

  it('a settled create-role proposal does not warn forever', () => {
    const done = { ...ongoingCreateRole, status: 'Passed', wasExecuted: true };
    expect(hasCompetingSubjectCreation([done])).toBe(false);
    expect(competingSubjectCreations([done])).toEqual([]);
  });

  it('the raw ongoing list works even without the explicit annotation pass', () => {
    // Belt and braces: hasCompetingSubjectCreation resolves the flag itself, so a caller that
    // forgets withSubjectCreationFlags still gets the warning rather than silence.
    expect(hasCompetingSubjectCreation([ongoingCreateRole])).toBe(true);
  });
});
