/**
 * v1 links contain six bytes, encoded as eight URL-safe characters:
 * version(4), registry(4), immutable org index(16), kind(4), item ID(20).
 * The registry position is on-chain; no shortener database or saved mapping.
 * A bare query token works on a plain static/IPFS host with no route rewrites.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const LINK_KIND = Object.freeze({ org: 0, task: 1, project: 2, hybrid: 3, democracy: 4, participation: 5, allTasks: 6, myWork: 7 });
export const LINK_PAGES = new Set(['home', 'dashboard', 'tasks', 'voting', 'votes', 'treasury', 'learn', 'team', 'profile', 'settings', 'join', 'claim', 'rules', 'leaderboard']);
const MAX_ITEM = (1n << 20n) - 1n;

export const linkPage = (pathname) => pathname.split('/').filter(Boolean).at(-1);

export function encodeShortCode({ registry, orgIndex, kind = LINK_KIND.org, item = 0n }) {
  try {
    const id = BigInt(item);
    if (!Number.isInteger(registry) || registry < 0 || registry > 15
      || !Number.isInteger(orgIndex) || orgIndex < 0 || orgIndex > 65535
      || !Number.isInteger(kind) || kind < 0 || kind > 7 || id < 0n || id > MAX_ITEM
      || ([0, 6, 7].includes(kind) && id !== 0n)) return null;
    let packed = (1n << 44n) | (BigInt(registry) << 40n) | (BigInt(orgIndex) << 24n) | (BigInt(kind) << 20n) | id;
    let code = '';
    for (let i = 0; i < 8; i++) { code = ALPHABET[Number(packed & 63n)] + code; packed >>= 6n; }
    return code;
  } catch { return null; }
}

export function decodeShortCode(code) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{8}$/.test(code)) return null;
  let packed = 0n;
  for (const char of code) packed = (packed << 6n) | BigInt(ALPHABET.indexOf(char));
  if ((packed >> 44n) !== 1n) return null;
  const kind = Number((packed >> 20n) & 15n);
  const item = packed & MAX_ITEM;
  if (kind > 7 || ([0, 6, 7].includes(kind) && item !== 0n)) return null;
  return { registry: Number((packed >> 40n) & 15n), orgIndex: Number((packed >> 24n) & 65535n), kind, item };
}

export function queryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) params.append(key, String(item));
    }
  }
  return params.toString();
}

export function longUrl(pathname, query = {}, hash = '') {
  const search = queryString(query);
  return `${pathname}${search ? `?${search}` : ''}${hash}`;
}

function entityId(value, address, hex = false) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(address || '') || !value.startsWith(`${address}-`)) return null;
  const suffix = value.slice(address.length + 1);
  if (!(hex ? /^0x[0-9a-f]{64}$/ : /^(0|[1-9]\d{0,77})$/).test(suffix)) return null;
  return BigInt(suffix);
}

// Extra data that has no on-chain index (notably counterfactual vouch addresses)
// stays in the link. Role IDs often end in zero bytes; store that padding as a count.
function compactNumber(value) {
  if (!/^(0x[0-9a-fA-F]{1,64}|\d{1,78})$/.test(String(value))) return null;
  let number = BigInt(value);
  if (number >= (1n << 256n)) return null;
  const plain = number.toString(36);
  let zeros = 0;
  while (number > 0n && number % 256n === 0n) { number /= 256n; zeros++; }
  const padded = `${number.toString(36)}.${zeros.toString(36)}`;
  return zeros && padded.length < plain.length ? padded : plain;
}

function expandNumber(value) {
  if (typeof value !== 'string' || !/^[0-9a-z]{1,50}(\.[0-9a-z]{1,2})?$/.test(value)) return null;
  const [digits, padding] = value.split('.');
  const zeros = padding ? parseInt(padding, 36) : 0;
  if (zeros > 31) return null;
  let number = 0n;
  for (const char of digits) number = number * 36n + BigInt(parseInt(char, 36));
  number <<= BigInt(zeros * 8);
  return number < (1n << 256n) ? number : null;
}

export function expandLinkExtras(query) {
  const result = { ...query };
  if ('a' in result) {
    const address = expandNumber(result.a);
    if (address === null || address >= (1n << 160n)) throw new Error('Invalid vouch address in this link.');
    result.vouch = `0x${address.toString(16).padStart(40, '0')}`;
    delete result.a;
  }
  if ('h' in result) {
    const hat = expandNumber(result.h);
    if (hat === null) throw new Error('Invalid role in this link.');
    result.hatId = hat.toString();
    delete result.h;
  }
  return result;
}

/** null means the target cannot fit safely; keep its complete legacy URL. */
export function buildShortLink(pathname, query, org) {
  const page = linkPage(pathname);
  if (!LINK_PAGES.has(page) || !org) return null;
  const extras = { ...query };
  let kind = LINK_KIND.org;
  let item = 0n;
  if (page === 'tasks') {
    if (query.task !== undefined) {
      item = entityId(query.task, org.taskManager?.id);
      if (item === null) return null;
      kind = LINK_KIND.task;
      delete extras.task;
      // Recover the task's project from chain/indexer data when opening the link.
      if (entityId(query.projectId, org.taskManager?.id, true) !== null) delete extras.projectId;
    } else if (query.projectId === '__all__' || query.projectId === '__mine__') {
      kind = query.projectId === '__all__' ? LINK_KIND.allTasks : LINK_KIND.myWork;
      delete extras.projectId;
    } else if (query.projectId !== undefined) {
      item = entityId(query.projectId, org.taskManager?.id, true);
      if (item === null) return null;
      kind = LINK_KIND.project;
      delete extras.projectId;
    }
  }
  if ((page === 'voting' || page === 'votes') && query.poll !== undefined) {
    const lanes = [[LINK_KIND.hybrid, org.hybridVoting?.id], [LINK_KIND.democracy, org.directDemocracyVoting?.id], [LINK_KIND.participation, org.participationVoting?.id]];
    const match = lanes.find(([, address]) => entityId(query.poll, address) !== null);
    if (!match) return null;
    kind = match[0];
    item = entityId(query.poll, match[1]);
    delete extras.poll;
  }
  const code = encodeShortCode({ registry: org.registry, orgIndex: org.orgIndex, kind, item });
  if (!code) return null;
  for (const key of ['org', 'userDAO', 'orgId', 'chainId']) delete extras[key];
  if (page === 'join') {
    for (const [key, alias] of [['vouch', 'a'], ['hatId', 'h']]) {
      const compact = compactNumber(extras[key]);
      if (compact !== null && !(alias in extras)) { delete extras[key]; extras[alias] = compact; }
    }
  }
  const search = queryString(extras);
  return `${pathname}?${code}${search ? `&${search}` : ''}`;
}

export async function shareUrl(pathname, query, scope) {
  if (typeof window === 'undefined') return '';
  let path = longUrl(pathname, query);
  try {
    const { createShortLink } = await import('@/services/web3/domain/ShortLinkService');
    path = (await createShortLink(pathname, query, scope))?.url || path;
  } catch { /* A complete link is still shareable when a read service is down. */ }
  return `${window.location.origin}${path}`;
}

/** The first bare query field is the code; ordinary parameters remain extras. */
export function parseShortLink(asPath) {
  const url = new URL(asPath, 'https://short-link.invalid');
  const first = [...url.searchParams.entries()][0];
  if (!first || first[1] !== '' || !decodeShortCode(first[0])) return null;
  const extras = {};
  url.searchParams.delete(first[0]);
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    extras[key] = values.length === 1 ? values[0] : values;
  }
  return { code: first[0], extras };
}
