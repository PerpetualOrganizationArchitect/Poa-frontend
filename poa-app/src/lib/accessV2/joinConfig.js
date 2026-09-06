/**
 * accessV2/joinConfig — how people get INTO a role, as pure helpers shared by the RoleForm Joining
 * step and its email-invite People input.
 *
 * WHY THIS EXISTS. Access-v2 eligibility is a layered OR fold with ban supreme
 * (`MembershipAuthorityLogic._eligibleRole`): explicit rule (grant/ban) > attestor (email OR vouch,
 * both ALLOW-only) > the subject's own default. There is no "election" primitive and no
 * exclusivity in that fold. The email claim contract adds a stricter rule: it rejects openly
 * claimable roles before proving email eligibility. Email and vouching can be combined; email
 * and open claiming cannot. Governance grants ("elections") remain available in every case.
 *
 * EMAIL / DOMAIN NORMALISATION mirrors `lib/zkemail/allowlist.norm` EXACTLY (trim + ASCII-only
 * lowercase, printable-ASCII required): the identifier a member types here must be byte-identical
 * to the one hashed into the merkle leaf, or the on-chain claim can never reproduce it — a silent,
 * permanently-unclaimable invite. JS `String.toLowerCase()` is Unicode-aware and would diverge, so
 * we lowercase ONLY 0x41–0x5A, like the circuit's `ToLower` and the contract's `_lower`.
 *
 * PRIVACY. A domain ("anyone at acme.coop") is public by nature. A specific email address is
 * personal data: it is committed on-chain only as a Poseidon HASH (the merkle leaf id), and the
 * claimer proves possession client-side — the frontend never has to put a plaintext address on
 * chain. The creation flow keeps plaintext only in the private form; published allowlist entries
 * contain hashes, never plaintext email addresses.
 *
 * PURE.
 */

/** ASCII-only lowercase + trim — byte-identical to `lib/zkemail/allowlist.norm`. */
export function asciiLower(value) {
  return String(value ?? '')
    .trim()
    .replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;
// The email circuits/hash helper pack at most 192 ASCII bytes, even though DNS/RFC limits are larger.
const MAX_EMAIL_ID_BYTES = 192;
// A single DNS label: 1–63 chars, alphanumeric with internal hyphens.
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const DOMAIN_RE = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);
// Deliberately permissive local-part — the circuit proves the real address; this only rejects
// obvious nonsense so the founder learns before the claimer does.
const EMAIL_RE = new RegExp(`^[^\\s@]+@${LABEL}(?:\\.${LABEL})+$`);

/**
 * Canonicalise a domain the way the allowlist will hash it, or return null if it cannot be one.
 * Accepts a bare domain, an "@domain", or an "alice@domain" (takes the domain part) so paste is
 * forgiving; rejects anything with a scheme, path, or non-ASCII.
 */
export function normalizeDomain(raw) {
  let s = asciiLower(raw);
  if (!s) return null;
  if (s.includes('@')) s = s.slice(s.lastIndexOf('@') + 1);
  s = s.replace(/^\.+/, '').replace(/\.+$/, '');
  if (!s || !PRINTABLE_ASCII.test(s) || s.length > MAX_EMAIL_ID_BYTES) return null;
  return DOMAIN_RE.test(s) ? s : null;
}

/** Canonicalise a specific email address, or null. */
export function normalizeEmail(raw) {
  const s = asciiLower(raw);
  if (!s || !PRINTABLE_ASCII.test(s) || s.length > MAX_EMAIL_ID_BYTES) return null;
  return EMAIL_RE.test(s) ? s : null;
}

/** The member-facing reason a domain is rejected, or null when it is valid. */
export function domainError(raw) {
  const s = asciiLower(raw);
  if (!s) return 'Enter a domain.';
  if (!PRINTABLE_ASCII.test(String(raw))) {
    return 'A domain can only use plain letters, numbers and hyphens — an email proof can’t match anything else.';
  }
  return normalizeDomain(raw) ? null : `“${String(raw).trim()}” isn’t a valid domain (try acme.coop).`;
}

/** The member-facing reason an email is rejected, or null when it is valid. */
export function emailError(raw) {
  const s = asciiLower(raw);
  if (!s) return 'Enter an email address.';
  if (!PRINTABLE_ASCII.test(String(raw))) {
    return 'An email address can only use plain ASCII — an email proof can’t match anything else.';
  }
  return normalizeEmail(raw) ? null : `“${String(raw).trim()}” isn’t a valid email address.`;
}

/** Split a pasted blob into candidate tokens (comma / whitespace / newline separated). */
export function parseInviteTokens(raw) {
  return String(raw ?? '')
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

const canonicalDedupe = (list, normalise) => {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const c = normalise(item);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
};

/** Canonical, order-preserving, first-wins dedupe of a domain list. */
export const dedupeDomains = (list) => canonicalDedupe(list, normalizeDomain);

/** Canonical, order-preserving, first-wins dedupe of an email list. */
export const dedupeEmails = (list) => canonicalDedupe(list, normalizeEmail);

/**
 * Add tokens to an existing canonical list, returning the merged list plus what was rejected and
 * what was a duplicate — so the input can tell the member exactly what happened to a paste.
 */
export function mergeInviteTokens(existing, raw, kind) {
  const normalise = kind === 'domain' ? normalizeDomain : normalizeEmail;
  const current = canonicalDedupe(existing, normalise);
  const seen = new Set(current);
  const added = [];
  const invalid = [];
  const duplicate = [];
  for (const token of parseInviteTokens(raw)) {
    const c = normalise(token);
    if (!c) { invalid.push(token); continue; }
    if (seen.has(c)) { duplicate.push(c); continue; }
    seen.add(c);
    added.push(c);
  }
  return { list: [...current, ...added], added, invalid, duplicate };
}

/**
 * The join methods this form turns ON, most-open first. Election (a passing vote grants the seat)
 * is the always-available baseline and is only named when NOTHING else is on, so the member is
 * never told a role is "election only" while it is also open to the whole org.
 */
export function joinMethods(form = {}) {
  const methods = [];
  if (form.openRole) methods.push({ id: 'open', label: 'Anyone can claim this role' });
  if (form.perms?.QJ_AUTOJOIN) methods.push({ id: 'autojoin', label: 'Everyone who joins the org is added automatically' });
  if (form.vouching?.enabled) {
    const q = Number(form.vouching.quorum) || 1;
    methods.push({ id: 'vouch', label: `Join by collecting ${q} vouch${q === 1 ? '' : 'es'}` });
  }
  const domains = dedupeDomains(form.join?.domains);
  if (domains.length) {
    methods.push({
      id: 'domain',
      label: `Anyone with a verified email at ${domains.join(', ')}`,
    });
  }
  const emails = dedupeEmails((form.emailInvites || []).map((e) => e?.email ?? e));
  if (emails.length) {
    methods.push({
      id: 'email',
      label: `${emails.length} invited email${emails.length === 1 ? '' : 's'}`,
    });
  }
  if (!methods.length) {
    methods.push({ id: 'election', label: 'Added only by a governance vote' });
  }
  return methods;
}

/** True when a role relies on the ZkEmail allowlist (domains or specific emails). */
export function usesEmailEligibility(form = {}) {
  return dedupeDomains(form.join?.domains).length > 0
    || dedupeEmails((form.emailInvites || []).map((e) => e?.email ?? e)).length > 0;
}

/** ZkEmailInvites._rejectOpenClaimHats rejects these even though authority eligibility is OR. */
export function joinConfigError(form = {}) {
  if (form.openRole && usesEmailEligibility(form)) {
    return 'Email joining cannot be combined with open claiming. Turn off open claiming or remove the email domains and invites.';
  }
  if (form.perms?.QJ_AUTOJOIN && !form.openRole) {
    return 'Automatic org joining needs open claiming enabled for this role.';
  }
  return null;
}

export const EMAIL_PRIVACY_NOTE =
  'Email addresses are committed on-chain only as a one-way hash — the person proves their own '
  + 'address to claim the role. They can join once they verify it.';

export const EMAIL_ELIGIBILITY_UNAVAILABLE =
  'This org isn’t set up to verify emails yet, so email domains and email invites can’t be used '
  + 'here. Ask an admin to enable “Who can join by email” first.';
