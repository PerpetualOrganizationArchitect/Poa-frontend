/**
 * The deep-link rescue (FETCH_PROPOSAL_BY_ID*) fetches ONE proposal and splices
 * it into the RAW array the bulk query produced, so both go through the same
 * transformProposal call. That only holds if the two selection sets stay
 * identical — and a drift is invisible at runtime: the rescued poll just renders
 * with a missing field (a voter shown as 0x1234… instead of their username, a
 * blank description, no action summary). This test is the guard.
 */

import { describe, it, expect } from 'vitest';
import { print } from 'graphql';
import {
  FETCH_VOTING_DATA_NEW,
  FETCH_VOTING_DATA_WITH_PROPOSER,
  FETCH_PROPOSAL_BY_ID,
  FETCH_PROPOSAL_BY_ID_WITH_PROPOSER,
} from './queries';

/** Print the selection set of the first field named `name` (by field name, not alias). */
function selectionOf(doc, name) {
  let found = null;
  const walk = (node) => {
    if (found || !node || typeof node !== 'object') return;
    if (node.kind === 'Field' && node.name?.value === name && node.selectionSet) {
      found = node.selectionSet;
      return;
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object') walk(child);
    }
  };
  walk(doc);
  return found ? print(found).replace(/\s+/g, ' ').trim() : null;
}

const PAIRS = [
  ['hybrid, without proposer', FETCH_VOTING_DATA_NEW, 'proposals', FETCH_PROPOSAL_BY_ID, 'proposal'],
  ['dd, without proposer', FETCH_VOTING_DATA_NEW, 'ddvProposals', FETCH_PROPOSAL_BY_ID, 'ddvproposal'],
  ['hybrid, with proposer', FETCH_VOTING_DATA_WITH_PROPOSER, 'proposals', FETCH_PROPOSAL_BY_ID_WITH_PROPOSER, 'proposal'],
  ['dd, with proposer', FETCH_VOTING_DATA_WITH_PROPOSER, 'ddvProposals', FETCH_PROPOSAL_BY_ID_WITH_PROPOSER, 'ddvproposal'],
];

describe('proposal rescue queries mirror the bulk query', () => {
  it.each(PAIRS)('%s', (_label, bulkDoc, bulkField, byIdDoc, byIdField) => {
    const bulk = selectionOf(bulkDoc, bulkField);
    const byId = selectionOf(byIdDoc, byIdField);
    expect(bulk).toBeTruthy();
    expect(byId).toBeTruthy();
    expect(byId).toBe(bulk);
  });
});

describe('rescue query shape', () => {
  it('asks for both proposal kinds in one round trip', () => {
    for (const doc of [FETCH_PROPOSAL_BY_ID, FETCH_PROPOSAL_BY_ID_WITH_PROPOSER]) {
      const text = print(doc);
      expect(text).toContain('proposal(id: $proposalId)');
      // The singular DD field is all-lowercase after "ddv" — aliased so callers
      // can read `data.ddvProposal` like the nested list.
      expect(text).toContain('ddvProposal: ddvproposal(id: $proposalId)');
    }
  });

  it('takes the composite id as its only variable', () => {
    for (const doc of [FETCH_PROPOSAL_BY_ID, FETCH_PROPOSAL_BY_ID_WITH_PROPOSER]) {
      const op = doc.definitions.find((d) => d.kind === 'OperationDefinition');
      expect(op.variableDefinitions).toHaveLength(1);
      expect(op.variableDefinitions[0].variable.name.value).toBe('proposalId');
    }
  });

  it('only the proposer variant asks for proposer fields', () => {
    expect(print(FETCH_PROPOSAL_BY_ID)).not.toContain('proposerUsername');
    expect(print(FETCH_PROPOSAL_BY_ID_WITH_PROPOSER)).toContain('proposerUsername');
  });
});
