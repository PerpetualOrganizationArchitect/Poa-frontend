/**
 * subgraphCapabilities — runtime feature detection for subgraph schema fields.
 *
 * Adding a field the serving subgraph doesn't have errors the ENTIRE query
 * (the org-metadata ordering rule), so new-field consumption must self-enable.
 * We introspect the schema once per (subgraph URL, capability), cache the
 * answer in localStorage, and let callers pick the richer query only when it's
 * safe.
 *
 * This matters more than it looks: the app's default endpoints are the
 * DECENTRALIZED GATEWAY subgraphs (see config/networks.js), which lag Studio by
 * a manual publish. A field can be merged, deployed and live on Studio while
 * the endpoint the app actually reads still doesn't serve it — so "the subgraph
 * has it" is never safe to assume from the schema file.
 *
 * Detected capabilities:
 *   PROPOSAL_PROPOSER — subgraph-pop #195, proposer attribution.
 *   TASK_RELEASES     — subgraph-pop #201, TaskManager v7 claim release.
 *
 * Once an org's endpoint serves the newer version the feature lights up with no
 * frontend change.
 */

const memory = new Map(); // `${url}|${capabilityId}` -> boolean | Promise<boolean>

const memKey = (url, cap) => `${url}|${cap.id}`;

const storageKey = (url, cap) =>
  (cap.legacyStorageKey ? cap.legacyStorageKey(url) : `poa:subgraphCapability:${cap.id}:${url}`);

/**
 * A capability is a list of requirements.
 *   { type }         — the entity must exist in the schema
 *   { type, field }  — the entity must exist AND expose that field
 */
export const CAPABILITY = {
  PROPOSAL_PROPOSER: {
    id: 'proposalProposer',
    require: [{ type: 'Proposal', field: 'proposer' }],
    // Predates the generalisation. Keep the original key so endpoints already
    // marked as upgraded in a user's localStorage don't get re-probed.
    legacyStorageKey: (url) => `poa:subgraphHasProposer:${url}`,
  },
  /**
   * TaskManager v7 claim release. Requires the WHOLE set the task query
   * selects — a partial deployment must read as "absent", because one unknown
   * field still fails the entire document.
   */
  TASK_RELEASES: {
    id: 'taskReleases',
    require: [
      { type: 'Task', field: 'releaseCount' },
      { type: 'Task', field: 'lastReleasedAt' },
      { type: 'Task', field: 'releases' },
      { type: 'TaskRelease' },
    ],
  },
  /**
   * RoleManager phase-2 role/group model (subgraph-pop RoleManager wave). Gates
   * the whole set of fields the org-structure + role queries newly select — one
   * unknown field fails the entire document, so orgs whose endpoint hasn't been
   * republished (or that never adopted RoleManager) must read this as "absent"
   * and fall back to the pre-RoleManager UI unchanged.
   */
  ROLE_MANAGER: {
    id: 'roleManager',
    require: [
      { type: 'Organization', field: 'roleManager' },
      { type: 'Organization', field: 'roleGroups' },
      { type: 'Role', field: 'isGroupMarker' },
      { type: 'Role', field: 'groupMemberships' },
      { type: 'RoleGroup' },
      { type: 'RoleGroupMembership' },
      { type: 'RoleOffer' },
    ],
  },
  /**
   * createProposalV2 config (quorumOverride / equalWeight) on Proposal +
   * DDVProposal. Only lights the V2 restricted-poll UI when the serving
   * subgraph can render the resulting fields; the on-chain selector is
   * feature-detected separately per module instance (VotingService).
   */
  PROPOSAL_V2: {
    id: 'proposalV2',
    require: [
      { type: 'Proposal', field: 'quorumOverride' },
      { type: 'Proposal', field: 'equalWeight' },
    ],
  },
};

/**
 * Build a single introspection document aliasing every distinct type, so one
 * capability costs one round trip regardless of how many fields it spans.
 * `__type` on an unknown name resolves to null rather than erroring, which is
 * what makes batching safe here.
 */
export function buildIntrospectionQuery(typeNames) {
  const selections = typeNames
    .map((t, i) => `t${i}: __type(name: "${t}") { name fields { name } }`)
    .join(' ');
  return `{ ${selections} }`;
}

/**
 * PURE — exported for tests. Given type -> Set(fieldNames) (null when the type
 * is absent from the schema), does the requirement list hold?
 */
export function satisfies(typeMap, requirements) {
  if (!requirements || requirements.length === 0) return false;
  return requirements.every(({ type, field }) => {
    const fields = typeMap.get(type);
    if (!fields) return false; // entity absent from the schema
    return field ? fields.has(field) : true;
  });
}

async function introspect(subgraphUrl, typeNames) {
  const res = await fetch(subgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: buildIntrospectionQuery(typeNames) }),
  });
  if (!res.ok) throw new Error(`introspection HTTP ${res.status}`);
  const json = await res.json();
  const typeMap = new Map();
  typeNames.forEach((t, i) => {
    const node = json?.data?.[`t${i}`];
    typeMap.set(t, node ? new Set((node.fields || []).map((f) => f?.name)) : null);
  });
  return typeMap;
}

/**
 * Does this subgraph satisfy `capability`?
 * Resolves false on any failure (safe default: the base query).
 * Positive answers are cached in localStorage so later sessions skip the probe
 * AND the base→rich query switch; negatives are re-probed per session (the
 * endpoint upgrades exactly once, and we want to notice).
 *
 * @param {string} subgraphUrl
 * @param {Object} capability - one of CAPABILITY.*
 * @returns {Promise<boolean>}
 */
/**
 * SYNCHRONOUS read of an already-known answer: `true`/`false` when settled,
 * `undefined` when genuinely unknown (never probed, or a probe is in flight).
 *
 * This is what makes the "positive answers skip the base→rich switch" claim
 * above actually true. Consumers hold the answer in useState; with no
 * synchronous seed they must start at `false`, render once with the base
 * document — which is already enough for Apollo to put it on the wire — and
 * only then flip to the rich one. That is a second full fetch of the same data
 * on EVERY load, and the board query is measured in megabytes.
 *
 * Deliberately does not probe; pair it with hasCapability() so an unknown
 * answer still resolves asynchronously.
 */
export function peekCapability(subgraphUrl, capability) {
  if (!subgraphUrl || !capability) return undefined;

  const mk = memKey(subgraphUrl, capability);
  if (memory.has(mk)) {
    const v = memory.get(mk);
    // An in-flight probe is memoised as a Promise — that is "unknown", not false.
    return typeof v === 'boolean' ? v : undefined;
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey(subgraphUrl, capability)) === '1') {
      return true;
    }
  } catch { /* storage unavailable — unknown */ }

  return undefined;
}

export function hasCapability(subgraphUrl, capability) {
  if (!subgraphUrl || !capability) return Promise.resolve(false);

  const mk = memKey(subgraphUrl, capability);
  // Also dedupes concurrent probes: an in-flight Promise is memoised too.
  if (memory.has(mk)) return Promise.resolve(memory.get(mk));

  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey(subgraphUrl, capability)) === '1') {
      memory.set(mk, true);
      return Promise.resolve(true);
    }
  } catch { /* storage unavailable — probe instead */ }

  const typeNames = [...new Set(capability.require.map((r) => r.type))];
  const probe = introspect(subgraphUrl, typeNames)
    .then((typeMap) => {
      const has = satisfies(typeMap, capability.require);
      memory.set(mk, has);
      if (has) {
        try { window.localStorage.setItem(storageKey(subgraphUrl, capability), '1'); } catch { /* ignore */ }
      }
      return has;
    })
    .catch(() => {
      memory.set(mk, false);
      return false;
    });

  memory.set(mk, probe);
  return probe;
}

/**
 * Does this subgraph's Proposal entity have the `proposer` field?
 * Back-compat wrapper — same name, signature, semantics and storage key as
 * before the generalisation, so its caller (VotingContext) needs no change.
 */
export function hasProposerField(subgraphUrl) {
  return hasCapability(subgraphUrl, CAPABILITY.PROPOSAL_PROPOSER);
}

export default hasProposerField;
