/**
 * accessV2/permKeys — the semantic permission-key table (ACCESS-V2-SPEC.md §3).
 *
 * PURE. Mirrors `src/libs/AccessV2PermKeys.sol` exactly, INCLUDING the derivation, so a key added
 * in Solidity is one line here and never a magic constant:
 *
 *     key = (tag << 248) | (keccak256(label) >> 8)
 *
 * The FOLD TAG is the key's TOP BYTE — 0x00 bool-any, 0x01 OR-mask, 0x02 reserved MAX. The
 * authority folds keys it has never seen, so a new module is a new key constant here + a rulebook
 * entry + a subgraph template, and NEVER a contract change.
 *
 * The stored perm WORD packs three things into one slot:
 *   bit 255  EXISTS          — the row is present (vs. a zero word meaning "no row")
 *   bit 254  INHERIT_GLOBAL  — combine this ctx row with the subject's global row
 *   bits 0..253  VALUE       — bool-any: nonzero = true; OR-mask: the TaskManager bitmask
 */

import { utils } from 'ethers';

/** Fold tags (top byte of the key). */
export const FOLD_TAG = {
  BOOL_ANY: 0x00,
  OR_MASK: 0x01,
  MAX: 0x02, // RESERVED — unused in v1
};

const TAG_LABEL = {
  [FOLD_TAG.BOOL_ANY]: 'bool-any',
  [FOLD_TAG.OR_MASK]: 'or-mask',
  [FOLD_TAG.MAX]: 'max',
};

/** `(tag << 248) | (keccak256(label) >> 8)` as a 0x-prefixed bytes32. */
export function derivePermKey(tag, label) {
  const hash = BigInt(utils.keccak256(utils.toUtf8Bytes(label)));
  const key = (BigInt(tag) << 248n) | (hash >> 8n);
  return `0x${key.toString(16).padStart(64, '0')}`;
}

/** The fold tag encoded in a key's top byte. */
export function foldTag(key) {
  const b = BigInt(key);
  return Number(b >> 248n);
}

export function foldTagLabel(key) {
  return TAG_LABEL[foldTag(key)] || 'unknown';
}

/**
 * The protocol key set. `ctx` documents the ONLY ctx a key is meaningful at:
 * 'global' means ctx must be bytes32(0); 'project' means the key also takes a projectId ctx.
 */
export const PERM_KEYS = {
  DD_VOTE: derivePermKey(FOLD_TAG.BOOL_ANY, 'poa.perm.dd.vote'),
  DD_CREATE: derivePermKey(FOLD_TAG.BOOL_ANY, 'poa.perm.dd.create'),
  HV_CREATE: derivePermKey(FOLD_TAG.BOOL_ANY, 'poa.perm.hv.create'),
  TM_PERMS: derivePermKey(FOLD_TAG.OR_MASK, 'poa.perm.tm.perms'),
  PT_MEMBER: derivePermKey(FOLD_TAG.BOOL_ANY, 'poa.perm.pt.member'),
  PT_APPROVE: derivePermKey(FOLD_TAG.BOOL_ANY, 'poa.perm.pt.approve'),
  EDU_CREATE: derivePermKey(FOLD_TAG.BOOL_ANY, 'poa.perm.edu.create'),
  EDU_MEMBER: derivePermKey(FOLD_TAG.BOOL_ANY, 'poa.perm.edu.member'),
  QJ_AUTOJOIN: derivePermKey(FOLD_TAG.BOOL_ANY, 'poa.perm.qj.autojoin'),
  PAY_CREATE: derivePermKey(FOLD_TAG.BOOL_ANY, 'poa.perm.pay.create'),
  SUBJECT_RENAME: derivePermKey(FOLD_TAG.BOOL_ANY, 'poa.perm.subject.rename'),
};

/** key (lowercased hex) -> constant name, for rendering an indexed PermRow. */
export const PERM_KEY_NAMES = Object.entries(PERM_KEYS).reduce((acc, [name, key]) => {
  acc[key.toLowerCase()] = name;
  return acc;
}, {});

export function permKeyName(key) {
  if (!key) return null;
  return PERM_KEY_NAMES[String(key).toLowerCase()] || null;
}

/**
 * User-facing permission catalogue — what the create-role wizard renders as checkboxes.
 * `group` clusters them; `help` is the one-line explainer next to the box.
 * Order is the render order.
 */
export const PERM_CATALOGUE = [
  {
    id: 'DD_VOTE',
    key: PERM_KEYS.DD_VOTE,
    label: 'Vote in community votes',
    help: 'Members of this role can cast a vote in direct-democracy polls.',
    group: 'Voting',
  },
  {
    id: 'DD_CREATE',
    key: PERM_KEYS.DD_CREATE,
    label: 'Open a community vote',
    help: 'Members of this role can start a direct-democracy poll.',
    group: 'Voting',
  },
  {
    id: 'HV_CREATE',
    key: PERM_KEYS.HV_CREATE,
    label: 'Open a binding vote',
    help: 'Members of this role can start a blended (binding) vote.',
    group: 'Voting',
  },
  {
    id: 'TM_PERMS',
    key: PERM_KEYS.TM_PERMS,
    label: 'Task permissions',
    help: 'Which task actions this role can take. Choose the specific actions below.',
    group: 'Tasks',
    mask: true,
  },
  {
    id: 'PT_MEMBER',
    key: PERM_KEYS.PT_MEMBER,
    label: 'Hold participation tokens',
    help: 'Members count as token members — they can receive and hold participation tokens.',
    group: 'Tokens',
  },
  {
    id: 'PT_APPROVE',
    key: PERM_KEYS.PT_APPROVE,
    label: 'Approve token requests',
    help: 'Members can approve other people’s participation-token requests.',
    group: 'Tokens',
  },
  {
    id: 'EDU_CREATE',
    key: PERM_KEYS.EDU_CREATE,
    label: 'Create learning modules',
    help: 'Members can publish education-hub modules.',
    group: 'Learning',
  },
  {
    id: 'EDU_MEMBER',
    key: PERM_KEYS.EDU_MEMBER,
    label: 'Take learning modules',
    help: 'Members can complete education-hub modules and earn their rewards.',
    group: 'Learning',
  },
  {
    id: 'PAY_CREATE',
    key: PERM_KEYS.PAY_CREATE,
    label: 'Create payments',
    help: 'Members can raise payments from the treasury payment manager.',
    group: 'Treasury',
  },
  {
    id: 'QJ_AUTOJOIN',
    key: PERM_KEYS.QJ_AUTOJOIN,
    label: 'Granted on join',
    help: 'Anyone joining through the join link is auto-added to this role. Pair it with an open role.',
    group: 'Membership',
  },
  {
    id: 'SUBJECT_RENAME',
    key: PERM_KEYS.SUBJECT_RENAME,
    label: 'Rename roles and groups',
    help: 'Members can change the name, image and description of any role or group.',
    group: 'Membership',
  },
];

/**
 * TaskManager permission bits — the VALUE of a TM_PERMS row (OR-mask fold).
 * Identical bit values to TaskPerm.sol / `src/util/permissions.js`; v2 drops the uint8 saturation
 * so the value field is a full 254-bit word, but the meaningful bits are unchanged.
 */
export const TASK_PERM_BITS = [
  { value: 1, id: 'CREATE', label: 'Create new tasks' },
  { value: 2, id: 'CLAIM', label: 'Claim tasks' },
  { value: 4, id: 'REVIEW', label: 'Review completed tasks' },
  { value: 8, id: 'ASSIGN', label: 'Assign tasks to others' },
  { value: 16, id: 'SELF_REVIEW', label: 'Complete their own claimed task' },
  { value: 32, id: 'BUDGET', label: 'Edit project budgets' },
  { value: 64, id: 'EDIT_META', label: 'Edit task title / metadata' },
  { value: 128, id: 'EDIT_FULL', label: 'Edit task payout, bounty & metadata' },
];

/** Short bit names for a TaskManager mask, e.g. 5 -> ['CREATE', 'REVIEW']. */
export function taskPermLabels(mask) {
  const m = BigInt(mask ?? 0);
  return TASK_PERM_BITS.filter((b) => (m & BigInt(b.value)) === BigInt(b.value)).map((b) => b.id);
}

// ── Word packing ───────────────────────────────────────────────────────────────────────────────

export const EXISTS_BIT = 1n << 255n;
export const INHERIT_GLOBAL_BIT = 1n << 254n;
export const VALUE_MASK = (1n << 254n) - 1n;

/**
 * Pack a perm word.
 * @param {{ value?: bigint|number|string, inheritGlobal?: boolean, exists?: boolean }} opts
 * @returns {string} decimal uint256 string (what the contract takes and the subgraph stores)
 */
export function encodePermWord({ value = 0n, inheritGlobal = false, exists = true } = {}) {
  const v = BigInt(value ?? 0);
  if (v < 0n || v > VALUE_MASK) throw new Error('encodePermWord: value exceeds the 254-bit field');
  let word = v;
  if (inheritGlobal) word |= INHERIT_GLOBAL_BIT;
  if (exists) word |= EXISTS_BIT;
  return word.toString();
}

/** The inverse of {@link encodePermWord}. Never throws on a garbage row. */
export function decodePermWord(word) {
  let w;
  try {
    w = BigInt(word ?? 0);
  } catch {
    w = 0n;
  }
  return {
    raw: w.toString(),
    exists: (w & EXISTS_BIT) !== 0n,
    inheritGlobal: (w & INHERIT_GLOBAL_BIT) !== 0n,
    value: (w & VALUE_MASK).toString(),
    /** bool-any keys read the value as a plain truthiness. */
    enabled: (w & EXISTS_BIT) !== 0n && (w & VALUE_MASK) !== 0n,
  };
}

/** A bool-any grant word: exists + value 1. */
export function boolPermWord(enabled = true) {
  return encodePermWord({ value: enabled ? 1n : 0n, exists: true });
}

/** An OR-mask grant word for TaskManager. */
export function maskPermWord(mask, { inheritGlobal = true } = {}) {
  return encodePermWord({ value: BigInt(mask ?? 0), inheritGlobal });
}

/** ctx == bytes32(0) is the GLOBAL scope. */
export const GLOBAL_CTX = `0x${'0'.repeat(64)}`;

export function isGlobalCtx(ctx) {
  if (!ctx) return true;
  try {
    return BigInt(ctx) === 0n;
  } catch {
    return false;
  }
}

/**
 * §3 CTX RESOLUTION, replayed client-side so the UI can show the EFFECTIVE value of a row
 * without an eth_call:
 *   project row exists ? (inheritGlobal ? COMBINE(global, project) : project) : global
 * COMBINE is the key's fold tag: OR for masks, logical-any for booleans.
 *
 * @param {string} key - permKey (its top byte selects the fold)
 * @param {object|null} globalRow - decoded row at ctx 0, or null
 * @param {object|null} projectRow - decoded row at the project ctx, or null
 * @returns {{ value: string, source: 'project'|'global'|'combined'|'none' }}
 */
export function resolvePermCtx(key, globalRow, projectRow) {
  const tag = foldTag(key);
  const g = globalRow && globalRow.exists ? BigInt(globalRow.value) : null;
  const p = projectRow && projectRow.exists ? BigInt(projectRow.value) : null;

  if (p === null) {
    return g === null ? { value: '0', source: 'none' } : { value: g.toString(), source: 'global' };
  }
  if (!projectRow.inheritGlobal) return { value: p.toString(), source: 'project' };
  if (g === null) return { value: p.toString(), source: 'project' };

  const combined = tag === FOLD_TAG.OR_MASK
    ? p | g
    : (p !== 0n || g !== 0n ? 1n : 0n);
  return { value: combined.toString(), source: 'combined' };
}
