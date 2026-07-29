/**
 * ZK Email allowlist — build / parse / prove.
 *
 * The org "allowed emails" allowlist (whole domains + specific addresses -> role hat IDs) is a JSON
 * file on IPFS, committed on-chain by a single merkle root. This module builds that file + its merkle
 * tree, and produces the merkle proof a member submits when claiming.
 *
 * CRITICAL coordination (must match exactly, all verified):
 *   - Merkle leaf == `ZkEmailInvites._leaf` == OpenZeppelin StandardMerkleTree over
 *     `['uint8','bytes32','uint256[]']` = [kind, id, hatIds], kind 0=domain, 1=email.
 *   - domain id = Poseidon(packBytes(lowercase(domain), 192))  (== circuit `fromDomainHash` signal /
 *     `PoaDKIMRegistry` key; Blocker 2 — no longer a caller-supplied keccak of a domain string).
 *   - email  id = emailHash(address) = Poseidon(packBytes(lowercase(address) zero-padded to 192 bytes))
 *     == the `emailHash` public signal of `circuits/PopRoleClaimV2.circom` (verified equal for a real
 *     proof). The 192 + little-endian 31-byte packing here MUST equal `EMAX`/`PackBytes` in the circuit.
 */
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

export const ALLOWLIST_SCHEMA = 'poa.zkemail.allowlist/1';
export const LEAF_TYPES = ['uint8', 'bytes32', 'uint256[]'];
const EMAIL_PAD = 192; // == EMAX in PopRoleClaimV2.circom
const CHUNKS = 7; // ceil(192 / 31)

// ASCII-only lowercase — EXACTLY mirrors the circuit's `ToLower` (PopRoleClaimV2.circom) and the
// contract's `_lower`/`domainHashOf`, both of which transform only bytes 0x41–0x5A. JS
// String.prototype.toLowerCase() is Unicode-aware and would additionally lowercase non-ASCII letters,
// producing a leaf the on-chain path can never reproduce — a silent, permanently-unclaimable entry
// (fail-closed: no security risk, but a broken invite). Trim, then ASCII-lowercase.
const norm = (s) =>
  String(s || '')
    .trim()
    .replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

// A domain/email identifier that isn't pure printable ASCII can never round-trip through the circuit
// (its From-address regex + PackBytes are ASCII) or the contract (_lower is ASCII), so it would build
// an unclaimable leaf. Reject at build time so the founder learns immediately, not the claimer later.
// Applied for EVERY caller of buildAllowlist (editor, CLI, forge tooling), not just the staging UI.
const isPrintableAscii = (s) => /^[\x20-\x7E]+$/.test(String(s));
const sortHats = (hatIds) => hatIds.map((h) => BigInt(h)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * Poseidon commitment = Poseidon(packBytes(ascii-lower(s) zero-padded to 192), 7). This is the exact
 * commitment the circuits compute: `emailHash` over the From ADDRESS and `fromDomainHash` over the From
 * DOMAIN (Blocker 2). So BOTH allowlist leaf ids — domain (kind 0) and email (kind 1) — use it, and each
 * equals the corresponding on-chain proof signal / DKIM registry key.
 * @returns {Promise<string>} 0x-padded bytes32
 */
async function poseidonCommit(str) {
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();
  const bytes = new Uint8Array(EMAIL_PAD);
  bytes.set(new TextEncoder().encode(norm(str)).slice(0, EMAIL_PAD));
  const chunks = [];
  for (let i = 0; i < CHUNKS; i++) {
    let acc = 0n;
    for (let j = 0; j < 31; j++) {
      const idx = 31 * i + j;
      acc += (idx < EMAIL_PAD ? BigInt(bytes[idx]) : 0n) << BigInt(8 * j);
    }
    chunks.push(acc);
  }
  return '0x' + BigInt(poseidon.F.toString(poseidon(chunks))).toString(16).padStart(64, '0');
}

/**
 * domainHash(domain) — the domain-leaf id, == `PopRoleClaim{,V2}.circom`'s proven `fromDomainHash`
 * signal (Blocker 2) and the `PoaDKIMRegistry` key. Poseidon commitment, NOT keccak.
 * @returns {Promise<string>} 0x-padded bytes32
 */
export function domainHash(domain) {
  return poseidonCommit(domain);
}

/**
 * emailHash(address) — the email-leaf id, == `PopRoleClaimV2.circom`'s `emailHash` signal.
 * @returns {Promise<string>} 0x-padded bytes32
 */
export function emailHash(address) {
  return poseidonCommit(address);
}

/**
 * Build the allowlist JSON + merkle tree from editor entries.
 * @param {{ orgId: string, entries: Array<{type:'domain'|'email', identifier:string, hatIds:Array<string|bigint>, roleIndexes?:number[]}> }} args
 * @returns {Promise<{ doc: object, json: string, tree: StandardMerkleTree, root: string }>}
 */
export async function buildAllowlist({ orgId, entries }) {
  const rows = [];
  for (const e of entries) {
    if (!isPrintableAscii(e.identifier)) {
      throw new Error(
        `Allowlist identifier "${e.identifier}" contains non-ASCII characters, which can never be ` +
          'matched by an email proof on-chain. Use the plain ASCII domain/email.',
      );
    }
    const hatIds = sortHats(e.hatIds);
    const id = e.type === 'domain' ? await domainHash(e.identifier) : await emailHash(e.identifier);
    // Store the canonical (trimmed, ASCII-lowercased) identifier — exactly what was hashed into the
    // leaf — so the doc's displayed identifier can never drift from its committed id.
    rows.push({ ...e, identifier: norm(e.identifier), id, hatIds });
  }
  const tree = StandardMerkleTree.of(
    // uint256[] values as decimal strings (BigInt isn't JSON-serializable in the tree dump).
    rows.map((r) => [r.type === 'domain' ? 0 : 1, r.id, r.hatIds.map((h) => h.toString())]),
    LEAF_TYPES,
  );
  const docEntries = rows.map((r) => ({
    type: r.type,
    identifier: r.identifier,
    [r.type === 'email' ? 'emailHash' : 'domainHash']: r.id,
    hatIds: r.hatIds.map((h) => '0x' + h.toString(16)),
    roleIndexes: r.roleIndexes || [],
  }));
  const doc = {
    schema: ALLOWLIST_SCHEMA,
    orgId,
    root: tree.root,
    leafTypes: LEAF_TYPES,
    entries: docEntries,
    treeDump: tree.dump(), // lets the member side reload the exact tree without recomputing emailHashes
  };
  return { doc, json: JSON.stringify(doc), tree, root: tree.root };
}

/** Reload the exact tree from a fetched allowlist doc (prefers the dumped tree). */
export function treeFromDoc(doc) {
  if (doc?.treeDump) return StandardMerkleTree.load(doc.treeDump);
  throw new Error('Allowlist file is missing its merkle tree dump.');
}

/** Recompute the root from a doc and assert it matches `onchainRoot` (anti-swapped-CID guard). */
export function assertRootMatches(doc, onchainRoot) {
  const tree = treeFromDoc(doc);
  if (tree.root.toLowerCase() !== String(onchainRoot).toLowerCase()) {
    throw new Error('Allowlist file does not match the active on-chain root.');
  }
  return tree;
}

/** Merkle proof + hatIds for a DOMAIN entry, or null if the domain is not in the allowlist. */
export async function proofForDomain(tree, domain) {
  const dh = (await domainHash(domain)).toLowerCase();
  for (const [i, v] of tree.entries()) {
    if (Number(v[0]) === 0 && String(v[1]).toLowerCase() === dh) {
      return { hatIds: v[2].map((h) => h.toString()), proof: tree.getProof(i) };
    }
  }
  return null;
}

/** Merkle proof + hatIds for a SPECIFIC-address entry by its emailHash, or null. */
export function proofForEmailHash(tree, eHash) {
  const target = String(eHash).toLowerCase();
  for (const [i, v] of tree.entries()) {
    if (Number(v[0]) === 1 && String(v[1]).toLowerCase() === target) {
      return { hatIds: v[2].map((h) => h.toString()), proof: tree.getProof(i) };
    }
  }
  return null;
}

/** Human-readable summary for the join UI: which domains + how many specific addresses are invited. */
export function summarize(doc) {
  const domains = (doc.entries || []).filter((e) => e.type === 'domain').map((e) => e.identifier);
  const emails = (doc.entries || []).filter((e) => e.type === 'email').map((e) => e.identifier);
  return { domains, emails };
}
