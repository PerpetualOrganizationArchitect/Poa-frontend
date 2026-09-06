/**
 * Add a new authority role to the org's email invites without revoking its current list.
 * setActiveAllowlist replaces ONE org-wide root, so the verified tree is the source of truth.
 * Specific addresses remain local input: every published email row contains only its commitment.
 */
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import {
  ALLOWLIST_SCHEMA,
  LEAF_TYPES,
  assertRootMatches,
  domainHash,
  emailHash,
} from '@/lib/zkemail/allowlist';
import { normalizeDomain, normalizeEmail } from '@/lib/accessV2/joinConfig';
import { bytes32ToIpfsCid, ipfsCidToBytes32 } from '@/services/web3/utils/encoding';

export const EMPTY_EMAIL_ROOT = `0x${'0'.repeat(64)}`;
const BYTES32 = /^0x[\da-f]{64}$/i;
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const ids = (values) => [...new Set(values.map((id) => BigInt(id).toString()))]
  .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));

function canonicalInputs(form) {
  const domains = (form?.join?.domains || []).map((raw) => {
    const domain = normalizeDomain(raw);
    if (!domain || domain.length > 192) throw new Error('Enter a valid email domain of at most 192 characters.');
    return domain;
  });
  const emails = (form?.emailInvites || []).map((raw) => {
    const email = normalizeEmail(raw?.email ?? raw);
    if (!email || email.length > 192) throw new Error('Enter a valid email address of at most 192 characters.');
    return email;
  });
  if ((domains.length || emails.length) && form?.kind === 'group') {
    throw new Error('Email invites belong to individual roles. A group includes the people in its roles.');
  }
  if ((domains.length || emails.length) && form?.openRole) {
    throw new Error('Open roles cannot be claimed by email. Turn off open joining to use email invites.');
  }
  return { domains: [...new Set(domains)], emails: [...new Set(emails)] };
}

/** Build a preserved replacement document. Existing subjects come from root-verified tree leaves. */
export async function buildRoleEmailAllowlist({ form, subjectId, orgId, currentDoc = null, currentRoot }) {
  const input = canonicalInputs(form);
  if (!input.domains.length && !input.emails.length) return null;
  const subject = BigInt(subjectId).toString();
  if (BigInt(subject) <= 0n || BigInt(subject) >= (1n << 256n)) throw new Error('The new role ID is invalid.');
  if (!BYTES32.test(currentRoot || '')) throw new Error('Could not read the org’s active email invites.');
  const rows = new Map();
  const merge = (type, id, hatIds, identifier = '') => {
    const key = `${type}:${id.toLowerCase()}`;
    const before = rows.get(key);
    rows.set(key, {
      type,
      id: id.toLowerCase(),
      identifier: type === 'domain' ? identifier || before?.identifier || '' : '',
      hatIds: ids([...(before?.hatIds || []), ...hatIds]),
    });
  };

  if (!same(currentRoot, EMPTY_EMAIL_ROOT)) {
    if (!currentDoc) throw new Error('Could not load the current email invites. Try again to preserve everyone already invited.');
    if (currentDoc.orgId && !same(currentDoc.orgId, orgId)) throw new Error('The email invite file belongs to another org.');
    const tree = assertRootMatches(currentDoc, currentRoot);
    // Only verified domain names are copied. Email identifiers and uncommitted metadata are never
    // spread into the new document, even when an older file published plaintext addresses.
    const domainNames = new Map();
    for (const entry of currentDoc.entries || []) {
      if (entry.type !== 'domain') continue;
      const name = normalizeDomain(entry.identifier);
      if (name && name.length <= 192) domainNames.set((await domainHash(name)).toLowerCase(), name);
    }
    for (const [, leaf] of tree.entries()) {
      const kind = Number(leaf[0]);
      const id = String(leaf[1]).toLowerCase();
      if (![0, 1].includes(kind) || !BYTES32.test(id) || !Array.isArray(leaf[2])) {
        throw new Error('The current email invite file has an unsupported entry.');
      }
      const type = kind === 0 ? 'domain' : 'email';
      if (type === 'domain' && !domainNames.has(id)) {
        throw new Error('The current email invite file is missing a verified domain name.');
      }
      merge(type, id, leaf[2], domainNames.get(id));
    }
  }
  for (const domain of input.domains) merge('domain', await domainHash(domain), [subject], domain);
  const emailHashes = [];
  for (const email of input.emails) {
    const hash = await emailHash(email);
    emailHashes.push(hash);
    merge('email', hash, [subject]);
  }
  const values = [...rows.values()];
  const tree = StandardMerkleTree.of(values.map((r) => [r.type === 'domain' ? 0 : 1, r.id, r.hatIds]), LEAF_TYPES);
  const doc = {
    schema: ALLOWLIST_SCHEMA,
    orgId,
    root: tree.root,
    leafTypes: LEAF_TYPES,
    entries: values.map((r) => ({
      type: r.type,
      identifier: r.identifier,
      [r.type === 'domain' ? 'domainHash' : 'emailHash']: r.id,
      hatIds: r.hatIds.map((id) => `0x${BigInt(id).toString(16)}`),
      roleIndexes: [],
    })),
    treeDump: tree.dump(),
  };
  return {
    doc, json: JSON.stringify(doc), root: tree.root, subjectId: subject,
    domainCount: input.domains.length, emailCount: input.emails.length, emailHashes,
  };
}

/**
 * Submission preparation, with injected service/IPFS callbacks (no wallet calls from components).
 * readActiveAllowlist() must read the org chain; uploadDocument(json) returns {path: CIDv0}.
 * A second commitment read catches changes during hashing/upload. The setter has no on-chain
 * compare-and-set, so voters must also review competing allowlist proposals before execution.
 */
export async function prepareRoleEmailAllowlist({
  form, subjectId, orgId, readActiveAllowlist, fetchDocument, uploadDocument, readEmailRegistered,
}) {
  const input = canonicalInputs(form);
  if (!input.domains.length && !input.emails.length) return null;
  if (typeof readActiveAllowlist !== 'function' || typeof fetchDocument !== 'function' || typeof uploadDocument !== 'function') {
    throw new Error('Email invite services are still loading. Try again in a moment.');
  }
  const active = await readActiveAllowlist();
  if (!BYTES32.test(active?.root || '') || !BYTES32.test(active?.cid || '')) {
    throw new Error('Could not read the org’s active email invites.');
  }
  let currentDoc = null;
  if (!same(active.root, EMPTY_EMAIL_ROOT)) {
    if (same(active.cid, EMPTY_EMAIL_ROOT)) throw new Error('The current email invite file is unavailable.');
    currentDoc = await fetchDocument(bytes32ToIpfsCid(active.cid));
  }
  const built = await buildRoleEmailAllowlist({ form, subjectId, orgId, currentDoc, currentRoot: active.root });
  if (built.emailHashes.length && typeof readEmailRegistered !== 'function') {
    throw new Error('Could not check whether these email addresses have already claimed an invite.');
  }
  for (const hash of built.emailHashes) {
    if (await readEmailRegistered(hash)) {
      throw new Error('An invited email has already claimed an invite in this org. Add that person’s account in People instead.');
    }
  }
  const uploaded = await uploadDocument(built.json);
  const path = typeof uploaded === 'string' ? uploaded : uploaded?.path;
  if (!path?.startsWith('Qm')) throw new Error('Could not save the email invites. Please try again.');
  const cid = ipfsCidToBytes32(path);
  const latest = await readActiveAllowlist();
  if (!same(active.root, latest?.root) || !same(active.cid, latest?.cid)) {
    throw new Error('The org’s email invites changed while preparing this vote. Try again to include the latest list.');
  }
  return {
    root: built.root, cid, subjectId: built.subjectId,
    domainCount: built.domainCount, emailCount: built.emailCount,
    previousRoot: active.root, previousCid: active.cid,
  };
}
