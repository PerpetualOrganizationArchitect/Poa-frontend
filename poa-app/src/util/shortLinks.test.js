import { describe, expect, it } from 'vitest';
import { buildShortLink, decodeShortCode, encodeShortCode, expandLinkExtras, LINK_KIND, longUrl, parseShortLink, queryString } from '@/util/shortLinks';

const taskManager = '0x2d9d397a842b8d691ea2a232062cbc8ef8ebbdb7';
const hybrid = '0x1111111111111111111111111111111111111111';
const democracy = '0x2222222222222222222222222222222222222222';
const org = { registry: 1, orgIndex: 8, taskManager: { id: taskManager }, hybridVoting: { id: hybrid }, directDemocracyVoting: { id: democracy } };
const project = (number) => `${taskManager}-0x${BigInt(number).toString(16).padStart(64, '0')}`;

describe('eight-character decentralized links', () => {
  it('encodes the reported task in exactly eight characters after its page path', () => {
    const query = { org: 'Decentral Park', projectId: project(2), task: `${taskManager}-10` };
    const link = buildShortLink('/tasks/', query, org);
    expect(link).toBe('/tasks/?EQAIEAAK');
    expect(link).toMatch(/^\/tasks\/\?[A-Za-z0-9_-]{8}$/);
    expect(decodeShortCode(link.split('?')[1].split('&')[0])).toEqual({ registry: 1, orgIndex: 8, kind: LINK_KIND.task, item: 10n });
  });

  it.each(['home', 'dashboard', 'treasury', 'learn', 'team', 'rules', 'settings', 'join', 'claim', 'profile'])(
    'gives %s an eight-character org link with no name or address', (page) => {
      const link = buildShortLink(`/${page}/`, { org: 'An organization with a very long name' }, org);
      expect(link).toMatch(new RegExp(`^/${page}/\\?[A-Za-z0-9_-]{8}$`));
      expect(decodeShortCode(link.split('?')[1].split('&')[0]).kind).toBe(LINK_KIND.org);
    },
  );

  it('distinguishes every registry, org, entity kind, and boundary ID without collisions', () => {
    const codes = new Set();
    for (const registry of [0, 1, 15]) for (const orgIndex of [0, 8, 65535]) {
      for (const kind of Object.values(LINK_KIND)) for (const item of ([0, 6, 7].includes(kind) ? [0n] : [0n, 10n, 1048575n])) {
        const fields = { registry, orgIndex, kind, item };
        const code = encodeShortCode(fields);
        expect(code).toHaveLength(8);
        expect(codes.has(code)).toBe(false);
        codes.add(code);
        expect(decodeShortCode(code)).toEqual(fields);
      }
    }
  });

  it.each([
    { registry: -1, orgIndex: 0 }, { registry: 16, orgIndex: 0 },
    { registry: 0, orgIndex: 65536 }, { registry: 0, orgIndex: -1 },
    { registry: 0, orgIndex: 1.1 }, { registry: 0, orgIndex: 0, kind: 1, item: 1048576n },
    { registry: 0, orgIndex: 0, kind: 1, item: -1n }, { registry: 0, orgIndex: 0, kind: 8 },
  ])('never truncates values outside the wire format (%s)', (fields) => {
    expect(encodeShortCode(fields)).toBeNull();
  });

  it.each(['', 'abcd', 'aaaaaaaaa', '!!!!1234', 'AAAAAAAA', '________'])('ignores malformed or unsupported codes: %s', (code) => {
    expect(decodeShortCode(code)).toBeNull();
  });

  it('parses bare tokens and preserves every visible extra when loading a new link', () => {
    expect(parseShortLink('/tasks/?EQAIEAAK&tag=one&tag=two&q=a%26b')).toEqual({
      code: 'EQAIEAAK', extras: { tag: ['one', 'two'], q: 'a&b' },
    });
    expect(parseShortLink('/tasks/?EQAIEAAK=')).toEqual({ code: 'EQAIEAAK', extras: {} });
    expect(parseShortLink('/tasks/?org=Test6')).toBeNull();
    expect(parseShortLink('/tasks/#details')).toBeNull();
  });

  it('keeps free-form filters, repeated query values, and gateway prefixes', () => {
    const query = { org: '東京 + R&D', projectId: project(2), view: 'list', q: 'a&b #c', tag: ['one', 'two'] };
    const link = buildShortLink('/ipfs/bafyexample/tasks/', query, org);
    const parsed = new URL(link, 'https://gateway.example');
    expect(parsed.pathname).toBe('/ipfs/bafyexample/tasks/');
    expect(parsed.searchParams.get('q')).toBe(query.q);
    expect(parsed.searchParams.getAll('tag')).toEqual(['one', 'two']);
    expect(decodeShortCode(parsed.search.slice(1).split('&')[0])).toMatchObject({ kind: LINK_KIND.project, item: 2n });
  });

  it.each(['__all__', '__mine__'])('preserves the %s cross-project board', (id) => {
    const link = buildShortLink('/tasks/', { org: 'Test6', projectId: id, view: 'list' }, org);
    expect(decodeShortCode(link.split('?')[1].split('&')[0]).kind).toBe(id === '__all__' ? LINK_KIND.allTasks : LINK_KIND.myWork);
    expect(link).toContain('view=list');
  });

  it.each(['/voting/', '/votes/'])('keeps both voting lanes distinct on %s', (page) => {
    for (const [address, kind] of [[hybrid, LINK_KIND.hybrid], [democracy, LINK_KIND.democracy]]) {
      const link = buildShortLink(page, { userDAO: 'Test6', poll: `${address}-10` }, org);
      expect(link.startsWith(`${page}?`)).toBe(true);
      expect(decodeShortCode(link.split('?')[1].split('&')[0]).kind).toBe(kind);
    }
  });

  it('falls back without changing foreign, title-based, unsupported or oversized targets', () => {
    for (const [page, query] of [
      ['/tasks/', { task: `${hybrid}-1`, org: 'Test6' }],
      ['/tasks/', { task: `${taskManager}-1048576`, org: 'Test6' }],
      ['/tasks/', { projectId: project(1n << 255n), org: 'Test6' }],
      ['/voting/', { poll: 'What should we do next?', org: 'Test6' }],
      ['/u/', { username: 'hudsonhrh' }],
    ]) {
      expect(buildShortLink(page, query, org)).toBeNull();
      expect(longUrl(page, query)).toBe(`${page}?${queryString(query)}`);
    }
  });

  it('carries undeployed vouch addresses and exact uint256 roles without external storage', () => {
    for (const hatId of [1n, 99n << 224n, (BigInt(hybrid) << 64n) | 7n, (1n << 256n) - 1n]) {
      const link = buildShortLink('/join/', { org: 'Test6', vouch: taskManager, hatId: hatId.toString() }, org);
      const parsed = new URL(link, 'https://poa.box');
      expect(decodeShortCode(parsed.search.slice(1).split('&')[0]).kind).toBe(LINK_KIND.org);
      expect(expandLinkExtras(Object.fromEntries([...parsed.searchParams].slice(1)))).toEqual({ vouch: taskManager, hatId: hatId.toString() });
    }
  });

  it('rejects malformed vouch data without rounding or accepting an oversized address', () => {
    for (const extras of [{ a: '!' }, { a: ['1', '2'] }, { a: (1n << 160n).toString(36) }, { h: '1.zz' }, { h: 'z'.repeat(50) }]) {
      expect(() => expandLinkExtras(extras)).toThrow();
    }
  });

  it('preserves full legacy URLs and anchors, without mutating input or serializing absent params', () => {
    const query = Object.freeze({ org: 'Test6', task: `${taskManager}-10`, unused: undefined });
    expect(longUrl('/tasks/', query, '#details')).toBe(`/tasks/?org=Test6&task=${taskManager}-10#details`);
    buildShortLink('/tasks/', query, org);
    expect(query.task).toBe(`${taskManager}-10`);
  });
});
