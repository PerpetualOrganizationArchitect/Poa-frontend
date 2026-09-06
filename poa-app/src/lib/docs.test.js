import { describe, expect, it } from 'vitest';
import {
  DOCS_REDIRECTS,
  getDocMetadata,
  getDocsArticleSchema,
  getDocsCollectionSchema,
  getDocsEntries,
  getDocsRedirect,
  normalizeDocDate,
} from '@/lib/docs.mjs';
import worker from '../../../cloudflare-worker/worker.mjs';

describe('documentation metadata', () => {
  it('uses authored publication and revision dates independently', () => {
    const metadata = getDocMetadata('create', {
      data: { title: 'Start an organization', date: '2026-05-01', updated: '2026-09-06' },
      content: '# An old title\n\nOrganize **together** with [Poa](/).',
    });
    expect(metadata.date).toBe('2026-05-01');
    expect(metadata.updated).toBe('2026-09-06');
    expect(metadata.title).toBe('Start an organization');
    expect(metadata.description).toBe('Organize together with Poa.');
    const [article, breadcrumbs] = getDocsArticleSchema(metadata);
    expect(article.datePublished).toBe(metadata.date);
    expect(article.dateModified).toBe(metadata.updated);
    expect(article.mainEntityOfPage['@id']).toBe('https://poa.box/docs/create/');
    expect(breadcrumbs.itemListElement.map(item => item.position)).toEqual([1, 2, 3]);
    expect(breadcrumbs.itemListElement.at(-1).item).toBe(article.url);
  });

  it('does not invent publication dates from a checkout or build', () => {
    const metadata = getDocMetadata('create', { data: { updated: '2026-09-06' }, content: 'A guide.' });
    const [article] = getDocsArticleSchema(metadata);
    expect(metadata.date).toBeNull();
    expect(article).not.toHaveProperty('datePublished');
    expect(article.dateModified).toBe('2026-09-06');
    expect(normalizeDocDate('not a date')).toBeNull();
    expect(normalizeDocDate('2026-02-30')).toBeNull();
    expect(normalizeDocDate(new Date('invalid'))).toBeNull();
    expect(normalizeDocDate(new Date('2026-09-06T00:00:00Z'))).toBe('2026-09-06T00:00:00.000Z');
  });

  it('gives the collection the same canonical article links and order as the index', () => {
    const posts = [{ id: 'create', title: 'Start an organization' }, { id: 'join', title: 'Join an organization' }];
    const schema = getDocsCollectionSchema(posts);
    expect(schema.mainEntity.itemListElement.map(item => item.url)).toEqual([
      'https://poa.box/docs/create/', 'https://poa.box/docs/join/',
    ]);
    expect(schema.mainEntity.itemListElement.map(item => item.name)).toEqual(posts.map(post => post.title));
  });
});

describe('legacy documentation URLs', () => {
  it('moves retired guides directly to current documentation', () => {
    for (const [id, target] of Object.entries(DOCS_REDIRECTS)) {
      expect(getDocsRedirect(`/docs/${id}`)).toBe(`/docs/${target}/`);
      expect(getDocsRedirect(`/blog/${id}/`)).toBe(`/docs/${target}/`);
    }
  });

  it('canonicalizes blog aliases without redirecting active docs or unknown paths', () => {
    for (const entry of getDocsEntries()) {
      expect(getDocsRedirect(`/blog/${entry.id}/`)).toBe(`/docs/${entry.id}/`);
    }
    expect(getDocsRedirect('/docs/create/')).toBeNull();
    expect(getDocsRedirect('/blog/test/')).toBeNull();
    expect(getDocsRedirect('/blog/does-not-exist/')).toBeNull();
    expect(getDocsRedirect('/docs/__proto__/')).toBeNull();
    expect(getDocsRedirect('/blog/toString/')).toBeNull();
    expect(getDocsRedirect('/docs/create/child/')).toBeNull();
  });

  it('returns permanent edge redirects before requiring or fetching an IPFS deployment', async () => {
    const response = await worker.fetch(new Request('https://poa.box/blog/perpetualOrganization?from=bookmark'), {}, {});
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://poa.box/docs/what-is-poa/?from=bookmark');
  });

  it('preserves host routing when redirecting old documentation', async () => {
    const response = await worker.fetch(new Request('https://dao.kublockchain.com/docs/passkey-onboarding/'), {}, {});
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://dao.kublockchain.com/docs/join/');
  });
});
