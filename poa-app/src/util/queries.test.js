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
  FETCH_PROJECTS_DATA_NEW,
  FETCH_PROJECTS_DATA_WITH_RELEASES,
  FETCH_ORG_FULL_DATA,
  FETCH_ORG_STRUCTURE_DATA,
  FETCH_PROJECT_MANAGERS,
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

/**
 * The projects query backs the ENTIRE task board, and one unknown field fails
 * the whole document — so a release field leaking into the base variant blanks
 * the board on every endpoint that predates subgraph-pop #201 (today: both
 * decentralized-gateway defaults the app ships with). These are the guards.
 */
describe('projects query — v7 claim-release gating', () => {
  it('the base variant asks for NO release fields', () => {
    const text = print(FETCH_PROJECTS_DATA_NEW);
    for (const field of ['releaseCount', 'lastReleasedAt', 'releases', 'selfRelease']) {
      expect(text).not.toContain(field);
    }
  });

  it('the release variant asks for all of them', () => {
    const text = print(FETCH_PROJECTS_DATA_WITH_RELEASES);
    for (const field of ['releaseCount', 'lastReleasedAt', 'releases', 'selfRelease']) {
      expect(text).toContain(field);
    }
  });

  it('the two variants differ ONLY by the release fields', () => {
    // Both come from one builder, so this should hold by construction; the test
    // pins it so a future hand-edit to either one cannot silently diverge.
    const base = selectionOf(FETCH_PROJECTS_DATA_NEW, 'tasks');
    const rich = selectionOf(FETCH_PROJECTS_DATA_WITH_RELEASES, 'tasks');
    expect(base).toBeTruthy();
    expect(rich).not.toBe(base);
    const stripped = rich
      .replace(/releases\(orderBy: releasedAt, orderDirection: desc, first: 5\) \{[^}]*\}/, '')
      .replace(/\breleaseCount\b/, '')
      .replace(/\blastReleasedAt\b/, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(stripped).toBe(base);
  });

  it('both take $orgId as their only variable, under distinct operation names', () => {
    const ops = [FETCH_PROJECTS_DATA_NEW, FETCH_PROJECTS_DATA_WITH_RELEASES].map(
      (doc) => doc.definitions.find((d) => d.kind === 'OperationDefinition')
    );
    for (const op of ops) {
      expect(op.variableDefinitions).toHaveLength(1);
      expect(op.variableDefinitions[0].variable.name.value).toBe('orgId');
    }
    expect(ops[0].name.value).not.toBe(ops[1].name.value);
  });

  it('keeps release fields out of the app-global org queries', () => {
    // FETCH_ORG_FULL_DATA / FETCH_ORG_STRUCTURE_DATA back every page, not just
    // the board — an ungated field there is a whole-app outage, so they stay bare.
    for (const doc of [FETCH_ORG_FULL_DATA, FETCH_ORG_STRUCTURE_DATA]) {
      const text = print(doc);
      expect(text).not.toContain('totalTasksReleased');
      expect(text).not.toContain('releaseCount');
    }
  });
});

/**
 * Nested collections default to 100 on The Graph, and HatPermission ids begin
 * with the CONTRACT ADDRESS — so the default ordering truncates in whole-
 * contract blocks rather than sampling evenly. An org that crosses the cap can
 * lose its entire HybridVoting creator set while keeping every token row.
 *
 * That is not a cosmetic loss. useVoteCreateGate fails OPEN on an empty creator
 * array, so every member would be offered a "Create vote" button whose tx
 * reverts Unauthorized after the whole wizard; and the "Who can open a vote"
 * panel would announce that only a passed vote can open one. At ~3.2 rows per
 * role the cap lands around 32 roles, which is within the supported range.
 */
describe('hatPermissions pagination', () => {
  /** Args printed for the first field named `name`, e.g. '(first: 1000)'. */
  function argsOf(doc, name) {
    let found = null;
    const walk = (node) => {
      if (found || !node || typeof node !== 'object') return;
      if (node.kind === 'Field' && node.name?.value === name) {
        found = (node.arguments || []).map((a) => print(a)).join(', ');
        return;
      }
      for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) child.forEach(walk);
        else if (child && typeof child === 'object') walk(child);
      }
    };
    walk(doc);
    return found;
  }

  it.each([
    ['FETCH_ORG_FULL_DATA', FETCH_ORG_FULL_DATA],
    ['FETCH_ORG_STRUCTURE_DATA', FETCH_ORG_STRUCTURE_DATA],
  ])('%s raises hatPermissions past the default 100', (_label, doc) => {
    expect(argsOf(doc, 'hatPermissions')).toBe('first: 1000');
  });

  it('uses identical args in both, so Apollo shares one cached field', () => {
    // InMemoryCache keys a field by name + args. Differing args would store two
    // Organization.hatPermissions entries and refetch the same rows per page.
    expect(argsOf(FETCH_ORG_FULL_DATA, 'hatPermissions'))
      .toBe(argsOf(FETCH_ORG_STRUCTURE_DATA, 'hatPermissions'));
  });
});

/**
 * `Project.managers` is the `_isPM` half of TaskManager's permission check. It rides
 * in its OWN document on purpose: one unknown field fails the WHOLE document, and
 * the projects document backs the entire task board. Isolated, an endpoint that
 * lacks the field degrades to "no manager bypass" instead of a blank board.
 */
describe('FETCH_PROJECT_MANAGERS isolation', () => {
  it('selects the project id (the merge key) and only active managers', () => {
    const printed = print(FETCH_PROJECT_MANAGERS).replace(/\s+/g, ' ');
    expect(printed).toContain('managers(where: {isActive: true})');
    expect(printed).toContain('manager');
    // `id` is load-bearing: ProjectContext keys the merge into projectsData by it.
    expect(selectionOf(FETCH_PROJECT_MANAGERS, 'projects')).toMatch(/^\{ id /);
  });

  it.each([
    ['FETCH_PROJECTS_DATA_NEW', FETCH_PROJECTS_DATA_NEW],
    ['FETCH_PROJECTS_DATA_WITH_RELEASES', FETCH_PROJECTS_DATA_WITH_RELEASES],
  ])('%s does NOT select managers (would risk blanking the board)', (_label, doc) => {
    expect(print(doc)).not.toContain('managers');
  });
});
