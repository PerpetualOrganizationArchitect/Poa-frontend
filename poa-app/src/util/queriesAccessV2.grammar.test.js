/**
 * QUERY-VALIDITY LAYER (offline half).
 *
 * The access-v2 documents shipped with a `where` clause graph-node rejects on EVERY request
 * (`{ authority, or: [...] }`), and nothing caught it: GraphQL validation accepts it, the
 * introspection capability probe accepts it (all the fields exist), and the colocated unit tests
 * only ever ran the response transforms over fixtures. That is the tautological-test pattern —
 * green suite, dead query.
 *
 * This file closes it from the offline side: it lints the ACTUAL exported documents against the
 * graph-node filter grammar, so a bad `where` fails CI with no network. `queriesAccessV2.live.test.js`
 * closes it from the other side by executing the same documents against a real graph-node.
 */

import { describe, it, expect } from 'vitest';
import { gql } from '@apollo/client';
import * as accessV2 from './queriesAccessV2';
import * as legacyQueries from './queries';
import {
  lintWhereGrammar,
  lintDocumentModule,
  collectWhereArguments,
  collectOperations,
} from './graphNodeFilterGrammar';

describe('graph-node where-grammar lint', () => {
  it('flags a column filter sitting next to `or` — the exact shape graph-node rejects', () => {
    const bad = gql`
      query Bad($authority: String!) {
        subjectMemberships(where: { authority: $authority, or: [{ isMember: true }, { claimable: true }] }) {
          id
        }
      }
    `;
    const violations = lintWhereGrammar(bad);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/cannot mix column filter\(s\) 'authority' with 'or'/);
  });

  it('accepts the distributed rewrite graph-node asks for', () => {
    const good = gql`
      query Good($authority: String!) {
        subjectMemberships(
          where: { or: [{ authority: $authority, isMember: true }, { authority: $authority, claimable: true }] }
        ) {
          id
        }
      }
    `;
    expect(lintWhereGrammar(good)).toEqual([]);
  });

  it('catches the violation when it is nested inside another operator branch', () => {
    const bad = gql`
      query Nested($a: String!) {
        subjectMemberships(where: { or: [{ and: [{ x: true }], y: true }] }) {
          id
        }
      }
    `;
    expect(lintWhereGrammar(bad)).toHaveLength(1);
  });

  it('catches the violation on a NESTED collection argument, not just the root field', () => {
    const bad = gql`
      query NestedField($a: ID!) {
        membershipAuthorityContract(id: $a) {
          subjects(where: { kind: "Role", or: [{ defaultAllow: true }, { memberCount_gt: 0 }] }) {
            id
          }
        }
      }
    `;
    const violations = lintWhereGrammar(bad);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/subjects\(where:\)/);
  });

  it('finds `where` on nested selections as well as root fields', () => {
    const doc = gql`
      query Two($a: ID!) {
        membershipAuthorityContract(id: $a) {
          subjects(where: { kind: "Role" }) {
            perms(where: { exists: true }) {
              id
            }
          }
        }
      }
    `;
    expect(collectWhereArguments(doc).map((w) => w.field)).toEqual([
      'Two.membershipAuthorityContract.subjects',
      'Two.membershipAuthorityContract.subjects.perms',
    ]);
  });
});

describe('every shipped document obeys the grammar', () => {
  it('access-v2 documents are clean', () => {
    // Derived FROM the module: a new document is covered the moment it is exported.
    expect(lintDocumentModule(accessV2)).toEqual([]);
  });

  it('the legacy query module is clean too (queriesAccessV2 is re-exported through it)', () => {
    expect(lintDocumentModule(legacyQueries)).toEqual([]);
  });

  it('covers every access-v2 document (guards against an empty-input false pass)', () => {
    const names = new Set(collectOperations(accessV2).map((o) => o.name));
    expect(names.size).toBeGreaterThanOrEqual(9);
    expect(names).toContain('FETCH_AUTHORITY_MEMBERSHIPS');
  });
});

describe('FETCH_AUTHORITY_MEMBERSHIPS specifically', () => {
  it('scopes EVERY or-branch to the authority — dropping it from one leaks other orgs’ rows', () => {
    const [{ node }] = collectWhereArguments(accessV2.FETCH_AUTHORITY_MEMBERSHIPS);
    const or = (node.fields || []).find((f) => f.name.value === 'or');
    expect(or, 'the fold-mirror filter must still be an `or`').toBeTruthy();

    const branches = or.value.values;
    expect(branches.length).toBeGreaterThan(0);
    for (const branch of branches) {
      const keys = branch.fields.map((f) => f.name.value);
      expect(keys).toContain('authority');
    }
    // ...and the branches are still exactly the rows that MATTER: a member, a claimable seat, or an
    // ACCEPTED row (the contract's `_isInOrg` — accepted anywhere, eligibility irrelevant — which
    // is the grant-vs-offer input and is invisible without this branch once a member lapses).
    const branchKeys = branches.map((b) => b.fields.map((f) => f.name.value).sort().join(','));
    expect(branchKeys.sort()).toEqual(
      ['authority,claimable', 'authority,isMember', 'accepted,authority'].sort()
    );
  });
});
