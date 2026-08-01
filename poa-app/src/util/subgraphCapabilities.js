/**
 * subgraphCapabilities — runtime feature detection for subgraph schema fields.
 *
 * Adding a field the serving subgraph doesn't have errors the ENTIRE query
 * (the org-metadata ordering rule), so new-field consumption must self-enable.
 * We introspect the schema once per subgraph URL, cache the answer in
 * localStorage, and let callers pick the richer query only when it's safe.
 *
 * Currently detected: Proposal.proposer (subgraph-pop #195 — proposer
 * attribution). Once the org's endpoint serves a version with the field,
 * "by {member}" lights up everywhere with no frontend change.
 */

const memory = new Map(); // subgraphUrl -> boolean | Promise<boolean>

const storageKey = (url) => `poa:subgraphHasProposer:${url}`;

async function introspectProposerField(subgraphUrl) {
  const res = await fetch(subgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '{ __type(name: "Proposal") { fields { name } } }',
    }),
  });
  if (!res.ok) throw new Error(`introspection HTTP ${res.status}`);
  const json = await res.json();
  const fields = json?.data?.__type?.fields || [];
  return fields.some((f) => f?.name === 'proposer');
}

/**
 * Does this subgraph's Proposal entity have the `proposer` field?
 * Resolves false on any failure (safe default: the base query).
 * Positive answers are cached in localStorage so later sessions skip the
 * probe AND the base→rich query switch; negatives are re-probed per session
 * (the endpoint upgrades exactly once, and we want to notice).
 */
export function hasProposerField(subgraphUrl) {
  if (!subgraphUrl) return Promise.resolve(false);
  if (memory.has(subgraphUrl)) return Promise.resolve(memory.get(subgraphUrl));

  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey(subgraphUrl)) === '1') {
      memory.set(subgraphUrl, true);
      return Promise.resolve(true);
    }
  } catch { /* storage unavailable — probe instead */ }

  const probe = introspectProposerField(subgraphUrl)
    .then((has) => {
      memory.set(subgraphUrl, has);
      if (has) {
        try { window.localStorage.setItem(storageKey(subgraphUrl), '1'); } catch { /* ignore */ }
      }
      return has;
    })
    .catch(() => {
      memory.set(subgraphUrl, false);
      return false;
    });

  memory.set(subgraphUrl, probe);
  return probe;
}

export default hasProposerField;
