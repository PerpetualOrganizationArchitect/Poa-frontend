import { describe, it, expect } from 'vitest';
import { gql } from '@apollo/client';
import { print } from 'graphql';
import { deriveRequirements, TYPE_OF_FIELD } from './accessV2Requirements';
import { ACCESS_V2_REQUIREMENTS, CAPABILITY } from './subgraphCapabilities';
import * as accessV2 from './queriesAccessV2';

const documents = Object.values(accessV2).filter((d) => d && d.kind === 'Document');
const has = (type, field) => ACCESS_V2_REQUIREMENTS.some((r) => r.type === type && r.field === field);

describe('the ACCESS_V2 requirement list is generated from the documents', () => {
  it('is what the capability actually probes', () => {
    expect(CAPABILITY.ACCESS_V2.require).toBe(ACCESS_V2_REQUIREMENTS);
    expect(ACCESS_V2_REQUIREMENTS.length).toBeGreaterThan(100);
  });

  it('covers the fields the hand-written list forgot', () => {
    // Every one of these is selected by a shipped document and was unprobed: a publish missing it
    // read as CAPABLE and then failed the whole query.
    expect(has('ConfigLintEvent', 'code')).toBe(true);
    expect(has('ConfigLintEvent', 'lintCode')).toBe(true);
    expect(has('ConfigLintEvent', 'emittedAt')).toBe(true);
    expect(has('Subject', 'isLegacyAdopted')).toBe(true);
    expect(has('SubjectMembership', 'seededWhilePaused')).toBe(true);
    expect(has('SubjectMembership', 'emailVerified')).toBe(true);
    expect(has('PendingAction', 'cancelledBy')).toBe(true);
    expect(has('SubjectVouchRecord', 'seeded')).toBe(true);
    expect(has('SubjectMembershipEvent', 'transactionHash')).toBe(true);
  });

  it('probes every entity type the documents touch, ConfigLintEvent included', () => {
    const types = new Set(ACCESS_V2_REQUIREMENTS.map((r) => r.type));
    for (const t of [
      'Organization', 'MembershipAuthorityContract', 'Subject', 'SubjectMembership', 'AccessRule',
      'PermRow', 'GroupComposition', 'ManagerConfig', 'PendingAction', 'SubjectVouchConfig',
      'SubjectVouchRecord', 'SubjectMembershipEvent', 'ConfigLintEvent',
    ]) {
      expect(types, `missing ${t}`).toContain(t);
    }
  });

  it('every field name any document selects appears somewhere in the list', () => {
    // Derived a SECOND, independent way — straight off the printed documents, with no knowledge of
    // entity types — so this cannot pass just because the walker agrees with itself.
    const probed = new Set(ACCESS_V2_REQUIREMENTS.map((r) => r.field));
    const roots = new Set(Object.keys(TYPE_OF_FIELD).filter((k) => [
      'organization', 'membershipAuthorityContract', 'subjectMemberships', 'pendingActions',
      'subjectVouchRecords', 'subjectMembershipEvents', 'configLintEvents',
    ].includes(k)));

    for (const doc of documents) {
      const text = print(doc);
      const body = text.slice(text.indexOf('{'));
      // Selection lines are bare identifiers or `name(args) {`; arguments/variables are skipped by
      // only taking the leading token of each line and dropping anything with a `:` or `$`.
      for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (!line || line === '{' || line === '}' || line.startsWith('$')) continue;
        const token = line.match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
        if (!token) continue;
        if (line.includes(':') && !line.startsWith(token + ' ') && !line.startsWith(token + '(') && !line.startsWith(token + ' {')) continue;
        if (roots.has(token)) continue; // query roots are not fields OF an entity
        expect(probed, `${token} is selected but never probed`).toContain(token);
      }
    }
  });
});

describe('deriveRequirements', () => {
  it('walks nested selections and attributes each field to its own entity', () => {
    const doc = gql`
      query X($a: ID!) {
        membershipAuthorityContract(id: $a) {
          id
          subjects { subjectId rule { sticky } }
        }
      }
    `;
    expect(deriveRequirements([doc])).toEqual([
      { type: 'MembershipAuthorityContract', field: 'id' },
      { type: 'MembershipAuthorityContract', field: 'subjects' },
      { type: 'Subject', field: 'subjectId' },
      { type: 'Subject', field: 'rule' },
      { type: 'AccessRule', field: 'sticky' },
    ]);
  });

  it('de-dupes a field selected by several documents', () => {
    const one = gql`query A($a: ID!) { membershipAuthorityContract(id: $a) { id paused } }`;
    const two = gql`query B($a: ID!) { membershipAuthorityContract(id: $a) { id paused } }`;
    expect(deriveRequirements([one, two])).toHaveLength(2);
  });

  it('THROWS on a nested selection it cannot attribute, instead of leaving a hole in the gate', () => {
    const doc = gql`query X($a: ID!) { membershipAuthorityContract(id: $a) { somethingNew { id } } }`;
    expect(() => deriveRequirements([doc])).toThrow(/no entity type mapped/);
  });

  it('THROWS on an unmapped ROOT field too', () => {
    const doc = gql`query X { brandNewRoot { id } }`;
    expect(() => deriveRequirements([doc])).toThrow(/brandNewRoot/);
  });

  it('handles an empty input', () => {
    expect(deriveRequirements([])).toEqual([]);
    expect(deriveRequirements()).toEqual([]);
  });
});
