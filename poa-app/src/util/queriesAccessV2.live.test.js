/**
 * QUERY-VALIDITY LAYER (live half) — executes EVERY access-v2 document against a real graph-node.
 *
 * OPT-IN. Skipped unless `POA_LIVE_SUBGRAPH_TESTS=1`, because it needs the network:
 *
 *     POA_LIVE_SUBGRAPH_TESTS=1 yarn test src/util/queriesAccessV2.live.test.js
 *
 * (Override the endpoint with `POA_LIVE_SUBGRAPH_URL=…` — any graph-node already serving the
 * access-v2 schema will do. The default is the Gnosis Studio deployment, which serves it today.)
 *
 * WHY A LIVE LAYER AT ALL, given `queriesAccessV2.grammar.test.js` exists: the offline lint only
 * knows the rules we have already been bitten by. graph-node enforces a whole family of runtime
 * `where`/ordering constraints that are invisible to both GraphQL validation and schema
 * introspection — the `{ authority, or: [...] }` bug got through all three of those gates and
 * failed every request in production. Running the real documents against a real graph-node is the
 * only check that is not a restatement of our own assumptions.
 *
 * READ-ONLY and side-effect free: every document is a query, and the variables are deliberately
 * synthesised as zero values so it matches nothing and returns empty collections. We assert on the
 * ABSENCE of a GraphQL `errors` array, not on data — a document that parses, validates, and
 * executes is what is being pinned.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as accessV2 from './queriesAccessV2';
import { collectOperations } from './graphNodeFilterGrammar';
import { ACCESS_V2_REQUIREMENTS, buildIntrospectionQuery, satisfies } from './subgraphCapabilities';

const ENDPOINT = process.env.POA_LIVE_SUBGRAPH_URL
  || 'https://api.studio.thegraph.com/query/73367/poa-gnosis-v-1/version/latest';

const ENABLED = process.env.POA_LIVE_SUBGRAPH_TESTS === '1';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * A harmless zero value for each variable type the documents declare, so a document can be
 * executed without naming any real org. Derived from the document's own variable definitions —
 * a new variable is covered automatically instead of needing a hand-maintained map.
 */
function zeroValueFor(typeNode) {
  // Unwrap NonNull / List wrappers down to the NamedType.
  let node = typeNode;
  while (node && node.kind !== 'NamedType') {
    if (node.kind === 'ListType') return [];
    node = node.type;
  }
  switch (node?.name?.value) {
    case 'ID':
    case 'String':
    case 'Bytes':
      return ZERO_ADDRESS;
    case 'Int':
    case 'BigInt':
      return 0;
    case 'Boolean':
      return false;
    default:
      return ZERO_ADDRESS;
  }
}

function variablesFor(op) {
  const vars = {};
  for (const def of op.variableDefinitions) {
    // Variables with a default (e.g. `$status: String = "Pending"`) are left out on purpose, so the
    // default is what gets exercised — that is what the app sends.
    if (def.defaultValue) continue;
    vars[def.variable.name.value] = zeroValueFor(def.type);
  }
  return vars;
}

async function execute(op) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: op.source, variables: variablesFor(op) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${ENDPOINT}`);
  return res.json();
}

const operations = collectOperations(accessV2);

describe.skipIf(!ENABLED)('access-v2 documents execute on a live graph-node', () => {
  beforeAll(() => {
    // A silent empty list would make every `it` below vacuously pass — the same tautology this
    // whole file exists to close.
    expect(operations.length, 'no documents were collected from queriesAccessV2').toBeGreaterThan(0);
  });

  it('the endpoint serves the access-v2 schema (otherwise these results mean nothing)', async () => {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '{ t: __type(name: "SubjectMembership") { name fields { name } } }',
      }),
    });
    const json = await res.json();
    const fields = (json?.data?.t?.fields || []).map((f) => f.name);
    expect(json.errors, JSON.stringify(json.errors)).toBeUndefined();
    expect(fields, `${ENDPOINT} does not serve the v2 schema`).toContain('claimable');
    expect(fields).toContain('eligibilitySource');
  }, 30_000);

  it('the CAPABILITY.ACCESS_V2 probe passes on an endpoint that serves the documents', async () => {
    // The probe list is generated from the documents, so it is now large (~120 fields). That makes
    // an over-strict gate a real failure mode: one requirement the real endpoint lacks would turn
    // v2 OFF for every org. This asserts the two agree on the endpoint that serves both.
    const types = [...new Set(ACCESS_V2_REQUIREMENTS.map((r) => r.type))];
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: buildIntrospectionQuery(types) }),
    });
    const json = await res.json();
    const typeMap = new Map();
    types.forEach((t, i) => {
      const node = json?.data?.[`t${i}`];
      typeMap.set(t, node ? new Set((node.fields || []).map((f) => f?.name)) : null);
    });

    const missing = ACCESS_V2_REQUIREMENTS
      .filter((r) => !typeMap.get(r.type)?.has(r.field))
      .map((r) => `${r.type}.${r.field}`);
    expect(missing, `probe requires fields this endpoint does not serve: ${missing.join(', ')}`).toEqual([]);
    expect(satisfies(typeMap, ACCESS_V2_REQUIREMENTS)).toBe(true);
  }, 30_000);

  it.each(operations.map((op) => [op.name, op]))(
    '%s executes without a GraphQL error',
    async (_name, op) => {
      const json = await execute(op);
      const messages = (json.errors || []).map((e) => e.message).join('\n');
      expect(messages, `${op.name} was rejected by graph-node:\n${messages}`).toBe('');
      expect(json.data, `${op.name} returned no data block`).toBeDefined();
    },
    30_000
  );
});

describe.skipIf(ENABLED)('live subgraph tests', () => {
  it('are skipped without POA_LIVE_SUBGRAPH_TESTS=1 (documented in this file’s header)', () => {
    expect(ENABLED).toBe(false);
  });
});
