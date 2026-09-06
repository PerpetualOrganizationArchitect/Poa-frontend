import { describe, it, expect } from 'vitest';
import {
  asciiLower,
  normalizeDomain,
  normalizeEmail,
  domainError,
  emailError,
  parseInviteTokens,
  dedupeDomains,
  dedupeEmails,
  mergeInviteTokens,
  joinMethods,
  usesEmailEligibility,
  joinConfigError,
} from './joinConfig';

describe('asciiLower — mirrors the merkle-leaf normalisation', () => {
  it('lowercases ONLY ASCII A–Z and trims', () => {
    expect(asciiLower('  ACME.Coop  ')).toBe('acme.coop');
  });
  it('leaves non-ASCII letters untouched (unlike String.toLowerCase)', () => {
    // A unicode-aware lowercase would change these; the circuit/contract would not, so we must not.
    expect(asciiLower('İ')).toBe('İ');
  });
});

describe('normalizeDomain', () => {
  it('accepts a bare domain', () => {
    expect(normalizeDomain('Acme.Coop')).toBe('acme.coop');
  });
  it('extracts the domain from an @domain or an address', () => {
    expect(normalizeDomain('@acme.coop')).toBe('acme.coop');
    expect(normalizeDomain('alice@acme.coop')).toBe('acme.coop');
  });
  it('rejects schemes, spaces, single labels and non-ASCII', () => {
    expect(normalizeDomain('https://acme.coop')).toBeNull();
    expect(normalizeDomain('acme')).toBeNull();
    expect(normalizeDomain('acme .coop')).toBeNull();
    expect(normalizeDomain('acmé.coop')).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('canonicalises case + whitespace', () => {
    expect(normalizeEmail('  Alice@Acme.Coop ')).toBe('alice@acme.coop');
  });
  it('rejects malformed addresses and non-ASCII', () => {
    expect(normalizeEmail('alice')).toBeNull();
    expect(normalizeEmail('alice@acme')).toBeNull();
    expect(normalizeEmail('aliçe@acme.coop')).toBeNull();
  });
  it('enforces the circuit’s 192-byte limit before preparing a claim', () => {
    const domain192 = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.x`;
    expect(domain192).toHaveLength(193);
    expect(normalizeDomain(domain192)).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(182)}@example.io`)).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(181)}@example.io`)).not.toBeNull();
  });
});

describe('domainError / emailError', () => {
  it('flags non-ASCII with the unclaimable-invite reason', () => {
    expect(domainError('acmé.coop')).toMatch(/plain letters/i);
    expect(emailError('aliçe@acme.coop')).toMatch(/plain ASCII/i);
  });
  it('passes valid values', () => {
    expect(domainError('acme.coop')).toBeNull();
    expect(emailError('alice@acme.coop')).toBeNull();
  });
});

describe('parse + dedupe', () => {
  it('splits on commas / whitespace / newlines', () => {
    expect(parseInviteTokens('a@x.io, b@x.io\n c@x.io;d@x.io')).toEqual([
      'a@x.io', 'b@x.io', 'c@x.io', 'd@x.io',
    ]);
  });
  it('dedupes domains canonically, first wins', () => {
    expect(dedupeDomains(['Acme.Coop', 'acme.coop ', 'other.org'])).toEqual(['acme.coop', 'other.org']);
  });
  it('dedupes emails canonically and drops invalid', () => {
    expect(dedupeEmails(['A@x.io', 'a@x.io', 'nope'])).toEqual(['a@x.io']);
  });
});

describe('mergeInviteTokens', () => {
  it('reports added / duplicate / invalid separately', () => {
    const res = mergeInviteTokens(['a@x.io'], 'a@x.io, b@x.io, garbage', 'email');
    expect(res.list).toEqual(['a@x.io', 'b@x.io']);
    expect(res.added).toEqual(['b@x.io']);
    expect(res.duplicate).toEqual(['a@x.io']);
    expect(res.invalid).toEqual(['garbage']);
  });
});

describe('joinMethods — combinable, election is the baseline', () => {
  it('names election ONLY when nothing else is on', () => {
    const m = joinMethods({});
    expect(m).toHaveLength(1);
    expect(m[0].id).toBe('election');
  });
  it('lists every enabled method and drops the election baseline', () => {
    const ids = joinMethods({
      openRole: true,
      perms: { QJ_AUTOJOIN: true },
      vouching: { enabled: true, quorum: 2 },
      join: { domains: ['acme.coop'] },
      emailInvites: [{ email: 'a@x.io' }],
    }).map((m) => m.id);
    expect(ids).toEqual(['open', 'autojoin', 'vouch', 'domain', 'email']);
    expect(ids).not.toContain('election');
  });
});

describe('usesEmailEligibility', () => {
  it('is true for domains or specific emails, false otherwise', () => {
    expect(usesEmailEligibility({ join: { domains: ['acme.coop'] } })).toBe(true);
    expect(usesEmailEligibility({ emailInvites: [{ email: 'a@x.io' }] })).toBe(true);
    expect(usesEmailEligibility({ join: { domains: ['nonsense'] } })).toBe(false);
    expect(usesEmailEligibility({})).toBe(false);
  });
});

describe('joinConfigError', () => {
  it('allows email plus vouching but rejects open roles in the email claim path', () => {
    expect(joinConfigError({ emailInvites: ['a@example.org'], vouching: { enabled: true } })).toBeNull();
    expect(joinConfigError({ emailInvites: ['a@example.org'], openRole: true })).toMatch(/cannot be combined/);
    expect(joinConfigError({ join: { domains: ['example.org'] }, openRole: true })).toMatch(/cannot be combined/);
  });
  it('requires an open eligible role for automatic org joining', () => {
    expect(joinConfigError({ perms: { QJ_AUTOJOIN: true } })).toMatch(/open claiming/);
    expect(joinConfigError({ perms: { QJ_AUTOJOIN: true }, openRole: true })).toBeNull();
  });
});
