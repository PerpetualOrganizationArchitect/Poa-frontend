import { describe, it, expect } from 'vitest';
import {
  describeWho, inviteRoleNames, readInvites, diffInvites, summarizeProposal, describeProposal,
} from './inviteDisplay';

// Approving an invite list REPLACES the previous one, so a removal silently revokes
// someone's invite. The diff is the only thing standing between a voter and an
// unnoticed revocation — these tests are about that, not about formatting.

const ctx = {
  roleHatIds: ['100', '200', '300'],
  roleNames: { 100: 'Member', 200: 'Executive', 300: 'Treasurer' },
};

const domain = (id, roleIndexes = [0]) => ({ type: 'domain', identifier: id, roleIndexes, hatIds: [] });
const email = (id, roleIndexes = [0]) => ({ type: 'email', identifier: id, roleIndexes, hatIds: [] });

describe('describing an invite', () => {
  it('says a domain covers everyone at it', () => {
    expect(describeWho(domain('acme.com'))).toBe('Anyone at acme.com');
    expect(describeWho(email('alice@acme.com'))).toBe('alice@acme.com');
  });

  it('resolves role names from indexes', () => {
    expect(inviteRoleNames(domain('acme.com', [0, 2]), ctx)).toEqual(['Member', 'Treasurer']);
  });

  it('resolves role names from raw hat ids in any numeric form', () => {
    expect(inviteRoleNames({ hatIds: ['200'] }, ctx)).toEqual(['Executive']);
    expect(inviteRoleNames({ hatIds: ['0xc8'] }, ctx)).toEqual(['Executive']); // 200
    expect(inviteRoleNames({ hatIds: [200] }, ctx)).toEqual(['Executive']);
  });

  it('shows nothing rather than a raw hat id it cannot name', () => {
    expect(inviteRoleNames({ hatIds: ['999999'] }, ctx)).toEqual([]);
  });
});

describe('reading a saved document', () => {
  it('keeps only renderable invites', () => {
    const doc = { entries: [
      { type: 'domain', identifier: 'acme.com', hatIds: ['100'] },
      { type: 'email', identifier: 'a@b.com', hatIds: ['100'] },
      { type: 'domain' },                       // no identifier
      { type: 'nonsense', identifier: 'x' },    // unknown kind
    ] };
    expect(readInvites(doc).map((i) => i.identifier)).toEqual(['acme.com', 'a@b.com']);
  });

  it('survives a missing or malformed document', () => {
    expect(readInvites(null)).toEqual([]);
    expect(readInvites({})).toEqual([]);
    expect(readInvites({ entries: 'nope' })).toEqual([]);
  });
});

describe('what a vote changes', () => {
  it('treats everything as new when nothing is live yet', () => {
    const d = diffInvites([domain('acme.com')], []);
    expect(d.added).toHaveLength(1);
    expect(d.removed).toHaveLength(0);
  });

  it('marks the first-ever list so the UI can skip the comparison', () => {
    const d = diffInvites([domain('acme.com')], null);
    expect(d.isFirstList).toBe(true);
  });

  // The one that matters: someone dropped from the list loses their invite.
  it('surfaces a removal', () => {
    const current = [domain('acme.com'), email('bob@acme.com')];
    const next = [domain('acme.com')];
    const d = diffInvites(next, current);
    expect(d.removed.map((i) => i.identifier)).toEqual(['bob@acme.com']);
    expect(d.added).toEqual([]);
    expect(d.kept.map((i) => i.identifier)).toEqual(['acme.com']);
  });

  it('counts a role change as changed, not untouched', () => {
    const current = [email('a@b.com', [0])];       // Member
    const next = [email('a@b.com', [2])];          // Treasurer
    const d = diffInvites(next, current);
    expect(d.changed.map((i) => i.identifier)).toEqual(['a@b.com']);
    expect(d.kept).toEqual([]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('is case-insensitive on the identifier, like the builder', () => {
    const d = diffInvites([domain('ACME.com')], [domain('acme.com')]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('reports no change when the list is identical', () => {
    const list = [domain('acme.com'), email('a@b.com', [1])];
    const d = diffInvites(list, list);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
    expect(d.kept).toHaveLength(2);
  });
});

describe('the sentence members read on the board', () => {
  it('states the change, not just the size', () => {
    const d = diffInvites([domain('a.com'), domain('b.com')], [domain('a.com'), domain('c.com')]);
    const line = summarizeProposal(d, 2);
    expect(line).toContain('1 added');
    expect(line).toContain('1 removed');
  });

  it('reads plainly for a first list', () => {
    expect(summarizeProposal(diffInvites([domain('a.com')], null), 1))
      .toBe('Email invites: 1 invited');
  });

  it('says so when nothing actually changes', () => {
    const list = [domain('a.com')];
    expect(summarizeProposal(diffInvites(list, list), 1)).toBe('Email invites: no change (1 invited)');
  });

  // The title members read on the board once said "Invite 3 invites to join by
  // email" — the verb and the counted noun collided. Guard that exact shape.
  it('never says "Invite N invites"', () => {
    for (const line of [
      summarizeProposal(diffInvites([domain('a.com')], null), 1),
      summarizeProposal(diffInvites([domain('a.com'), domain('b.com')], null), 2),
      summarizeProposal(diffInvites([domain('a.com')], [domain('b.com')]), 1),
      summarizeProposal(diffInvites([domain('a.com')], [domain('a.com')]), 1),
      summarizeProposal(null, 3),
    ]) {
      expect(line, `clumsy count phrasing in "${line}"`).not.toMatch(/invite\s+\d+\s+invite/i);
      expect(line, `clumsy count phrasing in "${line}"`).not.toMatch(/\d+\s+invites?\s+(to|in total)\b/i);
    }
  });

  it('never leaks a hash or implementation word', () => {
    const d = diffInvites([domain('a.com')], [domain('b.com')]);
    for (const line of [summarizeProposal(d, 1), summarizeProposal(null, 3)]) {
      expect(line).not.toMatch(/0x|merkle|allowlist|CID|bytes32/i);
    }
  });
});

describe('the auto-written description', () => {
  const next = [domain('acme.com'), email('alice@beta.org', [2])];
  const current = [domain('acme.com'), email('bob@old.com')];

  it('names who joins and who loses their invite', () => {
    const text = describeProposal(diffInvites(next, current), next, ctx);
    expect(text).toContain('alice@beta.org (Treasurer)');
    expect(text).toContain('bob@old.com');
    expect(text).toMatch(/Losing their invite/);
    // The consequence of a removal must be stated, not implied.
    expect(text).toContain('keep any role they already claimed');
    expect(text).toContain('replaces the whole list');
  });

  it('lists everyone when there is nothing to compare against', () => {
    const text = describeProposal(diffInvites(next, null), next, ctx);
    expect(text).toContain('Anyone at acme.com (Member)');
    expect(text).toContain('alice@beta.org (Treasurer)');
    expect(text).not.toMatch(/Losing their invite/);
  });

  it('says plainly when nothing changes', () => {
    expect(describeProposal(diffInvites(next, next), next, ctx)).toMatch(/Nothing changes/);
  });

  it('stays readable with a long list', () => {
    const many = Array.from({ length: 20 }, (_, i) => domain(`org${i}.com`));
    const text = describeProposal(diffInvites(many, null), many, ctx);
    expect(text).toMatch(/and \d+ more/);
    expect(text.length).toBeLessThan(900);
  });

  it('never leaks implementation words into what members read', () => {
    for (const d of [diffInvites(next, current), diffInvites(next, null), null]) {
      const text = describeProposal(d, next, ctx);
      expect(text).not.toMatch(/0x|merkle|allowlist|CID|bytes32|hat id|IPFS/i);
    }
  });
});

describe('hat-id representations agree across surfaces', () => {
  // A saved document stores hatIds as '0x'-hex; rows added in the composer carry
  // decimal strings from POContext. Anything comparing the two must normalize, or
  // "remove a prefilled row and add it straight back" reads as a permanent edit.
  it('treats hex and decimal hat ids as the same role', () => {
    const hex = { type: 'domain', identifier: 'acme.com', hatIds: ['0xc8'], roleIndexes: [] };
    const dec = { type: 'domain', identifier: 'acme.com', hatIds: ['200'], roleIndexes: [] };

    expect(inviteRoleNames(hex, ctx)).toEqual(inviteRoleNames(dec, ctx));
    expect(inviteRoleNames(hex, ctx)).toEqual(['Executive']);

    // …and the diff must not report a role change between the two spellings.
    const d = diffInvites([dec], [hex]);
    expect(d.changed).toEqual([]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});

// hatIds are what the merkle leaf commits to and what the contract grants.
// roleIndexes is a convenience the builder writes alongside them — a stale or
// crafted document can disagree, and showing the index would tell a voter they are
// granting one role while the vote actually grants another.
describe('hat ids are authoritative over roleIndexes', () => {
  it('displays the role the contract will actually grant', () => {
    const conflicting = { type: 'domain', identifier: 'x.com', roleIndexes: [0], hatIds: ['300'] };
    expect(inviteRoleNames(conflicting, ctx)).toEqual(['Treasurer']); // hat 300, not index 0
  });

  it('shows nothing rather than an index when the hat id cannot be named', () => {
    const unknownHat = { type: 'domain', identifier: 'x.com', roleIndexes: [0], hatIds: ['999999'] };
    expect(inviteRoleNames(unknownHat, ctx)).toEqual([]);
  });

  it('falls back to indexes only when the document carries no hat ids', () => {
    expect(inviteRoleNames({ roleIndexes: [1], hatIds: [] }, ctx)).toEqual(['Executive']);
  });

  it('compares lists on hat ids, so index presence alone is not a change', () => {
    const withIndex = { type: 'domain', identifier: 'x.com', roleIndexes: [1], hatIds: ['0xc8'] };
    const without = { type: 'domain', identifier: 'x.com', roleIndexes: [], hatIds: ['200'] };
    const d = diffInvites([without], [withIndex]);
    expect(d.changed).toEqual([]);
    expect(d.kept).toHaveLength(1);
  });

  it('still reports a genuine role change', () => {
    const before = { type: 'domain', identifier: 'x.com', roleIndexes: [], hatIds: ['100'] };
    const after = { type: 'domain', identifier: 'x.com', roleIndexes: [], hatIds: ['300'] };
    expect(diffInvites([after], [before]).changed).toHaveLength(1);
  });
});
