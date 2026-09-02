/**
 * accessV2/ids — subject-id namespace arithmetic (ACCESS-V2-SPEC.md §1).
 *
 * PURE. Mirrors `src/libs/AccessV2Ids.sol` in the contracts repo one-for-one.
 *
 * Two namespaces share one id space and are told apart STRUCTURALLY (no lookup):
 *
 *   id >= 2^224                 -> LEGACY: a real Hats id, ADOPTED verbatim by a migrated org.
 *                                  Every Hats id embeds a nonzero tophat domain in bits 224..255.
 *   id <  2^224, bits 64..223   -> V2-NATIVE: `(uint160(authority) << 64) | localSeq`. The owning
 *   nonzero                        authority address IS the id, so the router needs no registry
 *                                  lookup and two orgs can never mint the same subject id.
 *
 * Everything here works on DECIMAL STRINGS via BigInt: subject ids are up to 256 bits, so they
 * must never touch Number. The subgraph keys `Subject.id` by the decimal string verbatim.
 */

import { competingSubjectCreations } from './proposalRace';

/** Every real Hats id is >= 2^224 (Hats.sol mints tophats as `++lastTopHatId << 224`). */
export const HATS_NAMESPACE_FLOOR = 1n << 224n;

/** The v2-native id shifts the authority address into bits 64..223. */
export const AUTHORITY_ADDR_SHIFT = 64n;

const ADDR_MASK = (1n << 160n) - 1n;
const SEQ_MASK = (1n << 64n) - 1n;

/**
 * Coerce anything id-shaped (BigInt, decimal string, hex string, number) to BigInt.
 * Returns null rather than throwing — subgraph rows are the caller here and a malformed
 * row must degrade to "unknown", never crash a page.
 *
 * @param {bigint|string|number|null|undefined} id
 * @returns {bigint|null}
 */
export function toSubjectBigInt(id) {
  if (id === null || id === undefined || id === '') return null;
  try {
    if (typeof id === 'bigint') return id;
    if (typeof id === 'number') return Number.isFinite(id) ? BigInt(Math.trunc(id)) : null;
    const s = String(id).trim();
    if (!s) return null;
    return BigInt(s);
  } catch {
    return null;
  }
}

/** Canonical string form of a subject id (decimal, matching `Subject.id`). */
export function toSubjectId(id) {
  const b = toSubjectBigInt(id);
  return b === null ? null : b.toString();
}

/** True for the legacy/Hats namespace — an ADOPTED id on a migrated org. */
export function isLegacyAdoptedId(id) {
  const b = toSubjectBigInt(id);
  return b === null ? false : b >= HATS_NAMESPACE_FLOOR;
}

/**
 * True only for a Hats TOP HAT, not for one of its child roles.
 *
 * A top hat is the root of an organisation's Hats tree. Its id is the non-zero tree domain in
 * bits 224..255 with every lower bit clear. Migration adopts it into MembershipAuthority because
 * the executor wears it, but it remains structural organisation ownership — the legacy UI never
 * included it in `roleHatIds`, and access-v2 user-facing role surfaces must not include it either.
 *
 * This structural check is deliberately stronger than matching a name. Decentral Park's top hat
 * was created with the malformed Hats details string `ipfs://Decentral Park `, but an IPFS-looking
 * name is not proof that an arbitrary role is structural.
 */
export function isLegacyTopHatId(id) {
  const b = toSubjectBigInt(id);
  if (b === null || b < HATS_NAMESPACE_FLOOR) return false;
  return (b & (HATS_NAMESPACE_FLOOR - 1n)) === 0n;
}

/** User-facing subjects exclude structural Hats roots but include child hats and v2-native ids. */
export function isUserFacingSubjectId(id) {
  return toSubjectBigInt(id) !== null && !isLegacyTopHatId(id);
}

/** True for a v2-native id (below the Hats floor AND carrying an embedded authority address). */
export function isV2NativeId(id) {
  const b = toSubjectBigInt(id);
  if (b === null || b < 0n) return false;
  if (b >= HATS_NAMESPACE_FLOOR) return false;
  return ((b >> AUTHORITY_ADDR_SHIFT) & ADDR_MASK) !== 0n;
}

/**
 * The authority address embedded in a v2-native id (bits 64..223), lowercased 0x-hex.
 * Returns null for legacy ids and for ids with no embedded address.
 */
export function embeddedAuthority(id) {
  if (!isV2NativeId(id)) return null;
  const b = toSubjectBigInt(id);
  const addr = (b >> AUTHORITY_ADDR_SHIFT) & ADDR_MASK;
  return `0x${addr.toString(16).padStart(40, '0')}`;
}

/** The local sequence number (low 64 bits) of a v2-native id. */
export function localSeq(id) {
  const b = toSubjectBigInt(id);
  if (b === null) return null;
  return b & SEQ_MASK;
}

/**
 * Compose a v2-native subject id.
 * @param {string} authority - 0x address of the org's MembershipAuthority proxy
 * @param {bigint|number|string} seq - local sequence (1-based)
 * @returns {string} decimal id string
 */
export function composeSubjectId(authority, seq) {
  if (!authority || !/^0x[0-9a-fA-F]{40}$/.test(authority)) {
    throw new Error('composeSubjectId: authority must be a 0x address');
  }
  const s = toSubjectBigInt(seq);
  if (s === null || s <= 0n) throw new Error('composeSubjectId: seq must be a positive integer');
  const addr = BigInt(authority.toLowerCase());
  return (((addr & ADDR_MASK) << AUTHORITY_ADDR_SHIFT) | (s & SEQ_MASK)).toString();
}

/**
 * PREDICT the ids a batch of `count` new subjects will get.
 *
 * The authority allocates new ids from a monotonically-increasing `localSeq` counter that is
 * bumped ONLY for non-adopted subjects — so it is NOT `subjectCount()` (adopted legacy ids never
 * touch it) and there is no public getter. It IS fully event-sourced: every allocated id is in
 * `SubjectCreated`, so the highest localSeq among the org's indexed v2-native subjects + 1 is the
 * next allocation.
 *
 * This is the v2 replacement for the v1 `Hats.getNextId` prediction — same race caveat: another
 * createRole/createGroup proposal that EXECUTES between this proposal's creation and its
 * announceWinner shifts the ids, and every downstream call in the batch would then point at the
 * wrong subject. Callers MUST surface the same "another role proposal is in flight" warning the
 * v1 configurator did (see `hasCompetingSubjectCreation`).
 *
 * @param {string} authority - the org's MembershipAuthority address
 * @param {Array<{subjectId?: string, id?: string}>} existingSubjects - indexed subjects (any order)
 * @param {number} [count=1]
 * @returns {string[]} predicted ids, in allocation order
 */
export function predictNextSubjectIds(authority, existingSubjects = [], count = 1) {
  const auth = (authority || '').toLowerCase();
  let maxSeq = 0n;
  for (const s of existingSubjects || []) {
    const raw = s?.subjectId ?? s?.id ?? s;
    if (!isV2NativeId(raw)) continue;
    if (embeddedAuthority(raw) !== auth) continue; // ids from another org's authority
    const seq = localSeq(raw);
    if (seq !== null && seq > maxSeq) maxSeq = seq;
  }
  const out = [];
  for (let i = 1; i <= Math.max(0, count); i += 1) {
    out.push(composeSubjectId(auth, maxSeq + BigInt(i)));
  }
  return out;
}

/** Single-id convenience over {@link predictNextSubjectIds}. */
export function predictNextSubjectId(authority, existingSubjects = []) {
  return predictNextSubjectIds(authority, existingSubjects, 1)[0];
}

/**
 * Is another in-flight proposal going to allocate a subject id before ours executes?
 * Any not-yet-executed proposal whose batch creates a subject invalidates our prediction.
 *
 * "Creates a subject" is resolved by `lib/accessV2/proposalRace` — an explicit `createsSubject`
 * flag when we have one, otherwise the proposal's indexed `actionSummaries`, because the subgraph
 * does not index proposal calldata and a competing proposal is usually someone else's.
 *
 * @param {Array} proposals - builder results or transformed subgraph proposals
 * @returns {boolean}
 */
export function hasCompetingSubjectCreation(proposals = []) {
  return competingSubjectCreations(proposals).length > 0;
}
