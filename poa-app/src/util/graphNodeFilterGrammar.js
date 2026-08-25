/**
 * graphNodeFilterGrammar — a LINT for the `where:` grammar rules graph-node enforces at RUNTIME
 * and that neither GraphQL validation nor the schema-introspection capability probe can catch.
 *
 * WHY THIS EXISTS: `FETCH_AUTHORITY_MEMBERSHIPS` shipped as
 *
 *     where: { authority: $authority, or: [{ isMember: true }, { claimable: true }] }
 *
 * Every field in that document exists on the schema, so `CAPABILITY.ACCESS_V2` passed and the
 * colocated unit tests (which only ever exercised the response TRANSFORMS against fixtures) passed
 * too — while graph-node rejected the document on every single request with
 *
 *     "Cannot mix column filters with 'or' operator at the same level.
 *      Found column filter(s) 'authority' alongside 'or' operator."
 *
 * A whole-document failure is invisible in this codebase: the hooks return empty arrays and the
 * panels render "0 people" rather than an error. So the shape of a `where` clause needs its own
 * check, run over the ACTUAL documents, offline, in CI.
 *
 * This is deliberately a small, targeted grammar walker — not a graph-node reimplementation. It
 * encodes the rules we have actually been bitten by, and each one cites the graph-node behaviour it
 * mirrors. `queriesAccessV2.live.test.js` is the paired belt-and-braces check that executes the
 * same documents against a real endpoint.
 */

import { print } from 'graphql';

/** graph-node's boolean combinators. Everything else in a `where` object is a "column filter". */
const BOOLEAN_OPERATORS = new Set(['and', 'or']);

/**
 * Walk a parsed GraphQL document and yield every `where:` ObjectValue argument, with a path label
 * for the error message.
 *
 * @param {object} doc - a parsed document (the object `gql` returns)
 * @returns {Array<{ field: string, node: object }>}
 */
export function collectWhereArguments(doc) {
  const found = [];

  const visitSelectionSet = (selectionSet, trail) => {
    if (!selectionSet) return;
    for (const sel of selectionSet.selections || []) {
      if (sel.kind !== 'Field') continue;
      const name = sel.name?.value || '?';
      const path = trail ? `${trail}.${name}` : name;
      for (const arg of sel.arguments || []) {
        if (arg.name?.value === 'where' && arg.value?.kind === 'ObjectValue') {
          found.push({ field: path, node: arg.value });
        }
      }
      visitSelectionSet(sel.selectionSet, path);
    }
  };

  for (const def of doc?.definitions || []) {
    if (def.kind !== 'OperationDefinition') continue;
    visitSelectionSet(def.selectionSet, def.name?.value ? `${def.name.value}` : '');
  }
  return found;
}

/**
 * RULE 1 — a boolean operator (`and` / `or`) may not share a `where` object with a column filter.
 *
 * graph-node's own message spells out the required rewrite: distribute the column filter into every
 * branch. `{ a: 1, or: [{ b }, { c }] }` must become `{ or: [{ a: 1, b }, { a: 1, c }] }`.
 *
 * Applies at EVERY nesting level, including inside the branches of another operator.
 *
 * @param {object} objectValue - an ObjectValue AST node
 * @param {string} where - a label for the message
 * @returns {string[]} violation messages (empty when clean)
 */
function checkNoMixedOperators(objectValue, where) {
  const violations = [];

  const walk = (node, depthLabel) => {
    if (!node || node.kind !== 'ObjectValue') return;
    const operators = [];
    const columns = [];
    for (const field of node.fields || []) {
      const name = field.name?.value;
      if (BOOLEAN_OPERATORS.has(name)) operators.push(name);
      else columns.push(name);
    }

    if (operators.length > 0 && columns.length > 0) {
      violations.push(
        `${where}${depthLabel}: cannot mix column filter(s) `
        + `${columns.map((c) => `'${c}'`).join(', ')} with '${operators.join("', '")}' at the same `
        + 'level — graph-node rejects the whole document. Distribute the column filter into every '
        + `branch instead: { ${operators[0]}: [{ ${columns[0]}, … }, { ${columns[0]}, … }] }.`
      );
    }

    // Recurse into the operator branches AND into any nested object filters.
    for (const field of node.fields || []) {
      const name = field.name?.value;
      const value = field.value;
      if (value?.kind === 'ListValue') {
        (value.values || []).forEach((v, i) => walk(v, `${depthLabel}.${name}[${i}]`));
      } else if (value?.kind === 'ObjectValue') {
        walk(value, `${depthLabel}.${name}`);
      }
    }
  };

  walk(objectValue, '');
  return violations;
}

/**
 * Lint one parsed document against the graph-node `where`-grammar rules.
 *
 * @param {object} doc - the object `gql` returns
 * @returns {string[]} violation messages; empty means the document's filters are well-formed
 */
export function lintWhereGrammar(doc) {
  const violations = [];
  for (const { field, node } of collectWhereArguments(doc)) {
    violations.push(...checkNoMixedOperators(node, `${field}(where:)`));
  }
  return violations;
}

/**
 * Lint a whole module of documents (e.g. `import * as queries from './queriesAccessV2'`).
 * Non-document exports are ignored, so this cannot go stale when the module grows helpers.
 *
 * @param {object} moduleExports
 * @returns {Array<{ name: string, violations: string[] }>} entries with at least one violation
 */
export function lintDocumentModule(moduleExports) {
  const out = [];
  for (const [name, value] of Object.entries(moduleExports || {})) {
    if (!isGraphQLDocument(value)) continue;
    const violations = lintWhereGrammar(value);
    if (violations.length) out.push({ name, violations });
  }
  return out;
}

/** Every parsed GraphQL document, and nothing else. */
export function isGraphQLDocument(value) {
  return Boolean(value) && typeof value === 'object' && value.kind === 'Document'
    && Array.isArray(value.definitions);
}

/**
 * Every executable operation in a module, as `{ name, operationName, source }`.
 * Shared by the live test so BOTH layers derive their subject list from the documents themselves
 * rather than a hand-maintained list that can drift.
 */
export function collectOperations(moduleExports) {
  const ops = [];
  for (const [name, value] of Object.entries(moduleExports || {})) {
    if (!isGraphQLDocument(value)) continue;
    for (const def of value.definitions) {
      if (def.kind !== 'OperationDefinition') continue;
      ops.push({
        name,
        operationName: def.name?.value || name,
        variableDefinitions: def.variableDefinitions || [],
        source: print(value),
      });
    }
  }
  return ops;
}
