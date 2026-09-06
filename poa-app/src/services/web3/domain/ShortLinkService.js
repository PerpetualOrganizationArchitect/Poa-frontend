import { SHORT_LINK_REGISTRIES } from '@/config/shortLinkRegistries';
import { getSubgraphUrl } from '@/config/networks';
import { resolveOrgAlias } from '@/config/hostDefaultOrg';
import { createPublicClientForChain } from '@/services/web3/utils/chainClients';
import { buildShortLink, decodeShortCode, expandLinkExtras, linkPage, LINK_KIND } from '@/util/shortLinks';

class ShortLinkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ShortLinkError';
  }
}

const REGISTRY_ABI = [
  { type: 'function', name: 'getOrgIds', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32[]' }] },
  { type: 'function', name: 'orgIds', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bytes32' }] },
];
const ORG_FIELDS = 'id name taskManager { id } hybridVoting { id } directDemocracyVoting { id }';
const orgCache = new Map();
const indexCache = new Map();

function memo(map, key, read) {
  if (!map.has(key)) map.set(key, Promise.resolve().then(read).catch((error) => { map.delete(key); throw error; }));
  return map.get(key);
}

async function queryGraph(registry, query, variables) {
  const { chainId } = SHORT_LINK_REGISTRIES[registry];
  const response = await fetch(getSubgraphUrl(chainId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data) throw new ShortLinkError('Could not load this link. Please try again.');
  return result.data;
}

async function readRegistry(registry, functionName, args = []) {
  const config = SHORT_LINK_REGISTRIES[registry];
  if (!config) throw new ShortLinkError('This link uses an unsupported registry.');
  const client = createPublicClientForChain(config.chainId);
  return client.readContract({ address: config.address, abi: REGISTRY_ABI, functionName, args });
}

async function orgIndex(registry, orgId) {
  let ids = await memo(indexCache, registry, () => readRegistry(registry, 'getOrgIds'));
  let index = ids.findIndex((id) => id.toLowerCase() === orgId.toLowerCase());
  if (index < 0) {
    // The org may have been registered since this tab first read the array.
    indexCache.delete(registry);
    ids = await memo(indexCache, registry, () => readRegistry(registry, 'getOrgIds'));
    index = ids.findIndex((id) => id.toLowerCase() === orgId.toLowerCase());
  }
  if (index < 0) throw new ShortLinkError('This organization is not in the link registry yet.');
  return index;
}

async function findOrg(query, scope) {
  const orgId = scope?.orgId || query.orgId;
  const chainId = Number(scope?.orgChainId || query.chainId);
  const name = resolveOrgAlias(query.org || query.userDAO || scope?.orgName);
  const registry = SHORT_LINK_REGISTRIES.findIndex((entry) => entry.chainId === chainId);
  if (orgId && registry >= 0) {
    const resolved = await memo(orgCache, `${registry}:${orgId}`, async () => {
      const data = await queryGraph(registry, `query ShortLinkOrg($id: Bytes!) { organization(id: $id) { ${ORG_FIELDS} } }`, { id: orgId });
      if (!data.organization) throw new ShortLinkError('Organization not found.');
      return { ...data.organization, registry, orgIndex: await orgIndex(registry, orgId) };
    });
    // POContext can briefly retain the prior org's data during navigation.
    if (name && resolveOrgAlias(resolved.name) !== name) {
      return findOrg({ ...query, orgId: undefined, chainId: undefined });
    }
    return resolved;
  }
  if (typeof name !== 'string' || !name) return null;
  return memo(orgCache, `name:${name}`, async () => {
    // A failed chain cannot count as an empty one: that could select a same-name
    // org on the wrong chain. Failure leaves the original full link available.
    const candidates = (await Promise.all(SHORT_LINK_REGISTRIES.map(async (_, slot) => {
      const data = await queryGraph(slot, `query ShortLinkOrgName($name: String!) { organizations(where: { name: $name }, first: 2) { ${ORG_FIELDS} } }`, { name });
      return data.organizations.map((org) => ({ ...org, registry: slot }));
    }))).flat();
    if (candidates.length !== 1) throw new ShortLinkError('Could not identify a unique organization for this link.');
    const org = candidates[0];
    return { ...org, orgIndex: await orgIndex(org.registry, org.id) };
  });
}

/** Read-only: creating a link requires no transaction, upload, or saved mapping. */
export async function createShortLink(pathname, query, scope) {
  const org = await findOrg(query, scope);
  if (!org) return null;
  const url = buildShortLink(pathname, query, org);
  return url ? { url, orgId: org.id, chainId: SHORT_LINK_REGISTRIES[org.registry].chainId } : null;
}

export async function resolveShortLink(pathname, code, extras = {}) {
  const token = decodeShortCode(code);
  if (!token || !SHORT_LINK_REGISTRIES[token.registry]) throw new ShortLinkError('This link is invalid or uses an unsupported format.');
  const page = linkPage(pathname);
  const isTask = [LINK_KIND.task, LINK_KIND.project, LINK_KIND.allTasks, LINK_KIND.myWork].includes(token.kind);
  const isVote = [LINK_KIND.hybrid, LINK_KIND.democracy, LINK_KIND.participation].includes(token.kind);
  if ((isTask && page !== 'tasks') || (isVote && !['voting', 'votes'].includes(page))) throw new ShortLinkError('This link belongs to a different page.');
  const orgId = await readRegistry(token.registry, 'orgIds', [BigInt(token.orgIndex)]);
  const data = await queryGraph(token.registry, `query ResolveShortLinkOrg($id: Bytes!) { organization(id: $id) { ${ORG_FIELDS} } }`, { id: orgId });
  const org = data.organization;
  if (!org) throw new ShortLinkError('This organization is not available yet. Please try again.');
  const query = {
    ...(page === 'join' ? expandLinkExtras(extras) : extras),
    org: org.name,
    orgId: org.id,
    chainId: String(SHORT_LINK_REGISTRIES[token.registry].chainId),
  };
  delete query.userDAO;
  const taskManager = org.taskManager?.id;
  if (isTask && !taskManager) throw new ShortLinkError('This organization has no task board.');
  if (token.kind === LINK_KIND.task) {
    query.task = `${taskManager}-${token.item}`;
    const taskData = await queryGraph(token.registry, 'query ResolveShortLinkTask($id: ID!) { task(id: $id) { id project { id } } }', { id: query.task });
    if (!taskData.task?.project?.id) throw new ShortLinkError('This task could not be found.');
    if (!['__all__', '__mine__'].includes(query.projectId)) query.projectId = taskData.task.project.id;
  } else if (token.kind === LINK_KIND.project) {
    query.projectId = `${taskManager}-0x${token.item.toString(16).padStart(64, '0')}`;
  } else if (token.kind === LINK_KIND.allTasks || token.kind === LINK_KIND.myWork) {
    query.projectId = token.kind === LINK_KIND.allTasks ? '__all__' : '__mine__';
  } else if (isVote) {
    const address = { [LINK_KIND.hybrid]: org.hybridVoting?.id, [LINK_KIND.democracy]: org.directDemocracyVoting?.id, [LINK_KIND.participation]: org.participationVoting?.id }[token.kind];
    if (!address) throw new ShortLinkError('This voting contract is not available.');
    query.poll = `${address}-${token.item}`;
  }
  return query;
}
