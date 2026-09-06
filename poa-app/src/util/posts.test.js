import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllPostIds, getPostData, getPostNavigation, getRelatedPosts, getSortedPostsData } from '@/util/posts';
import { getDocsEntries } from '@/lib/docs.mjs';
import { generateSitemap } from '../../scripts/generate-sitemap.mjs';

vi.mock('@/components/marketing/docsMedia', () => ({
  DOCS_MEDIA: {
    '/images/docs/studio.webp': { width: 1600, height: 1000, kind: 'editorial' },
    '/images/product/tasks.webp': { width: 2400, height: 1500, kind: 'screenshot' },
  },
}));

const fixtures = {
  'create.md': '---\ntitle: Start an organization\ndate: "2026-05-01"\nupdated: "2026-09-06"\n---\n# Start an organization\n\nA practical guide.\n\n## Share **ownership**\n\nWork together.\n\n## Share ownership\n\n```md\n## This is code\n```\n\n# Another section\n',
  'join.md': '---\ntitle: Join an organization\n---\nFind your community.',
  'test.md': '# A test that must never be published',
  'unlisted.md': '# A private draft',
};

function mockPosts(files = fixtures) {
  const originalRead = fs.readFileSync.bind(fs);
  const originalExists = fs.existsSync.bind(fs);
  const isPost = file => String(file).includes(`${path.sep}posts${path.sep}`);
  vi.spyOn(fs, 'existsSync').mockImplementation(file => isPost(file) ? Object.hasOwn(files, path.basename(file)) : originalExists(file));
  vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...args) => isPost(file) ? files[path.basename(file)] : originalRead(file, ...args));
}

afterEach(() => vi.restoreAllMocks());

describe('published documentation', () => {
  it('uses the editorial order for paths, search data, previous/next and related guides', () => {
    mockPosts();
    const expected = getDocsEntries().filter(entry => ['create', 'join'].includes(entry.id)).map(entry => entry.id);
    const posts = getSortedPostsData();
    expect(posts.map(post => post.id)).toEqual(expected);
    expect(getAllPostIds().map(item => item.params.id)).toEqual(expected);
    expect(getPostNavigation(expected[0])).toEqual({ prev: null, next: { id: posts[1].id, title: posts[1].title } });
    expect(getPostNavigation(expected[1])).toEqual({ prev: { id: posts[0].id, title: posts[0].title }, next: null });
    expect(getRelatedPosts('create').map(post => post.id)).toEqual(['join']);
    expect(getAllPostIds({ includeRedirects: true }).some(item => item.params.id === 'perpetualOrganization')).toBe(true);
    expect(posts.some(post => ['test', 'unlisted', 'perpetualOrganization'].includes(post.id))).toBe(false);
  });

  it('does not publish empty pages or explicit drafts', () => {
    mockPosts({ ...fixtures, 'create.md': '', 'join.md': '---\ndraft: true\n---\nDraft content.' });
    expect(getSortedPostsData()).toEqual([]);
  });

  it('generates unique anchors from real headings and leaves the page shell as the only H1', async () => {
    mockPosts();
    const post = await getPostData('create');
    expect(post.contentHtml).not.toMatch(/<h1\b/);
    expect(post.contentHtml).toContain('<h2 id="share-ownership">Share <strong>ownership</strong></h2>');
    expect(post.contentHtml).toContain('<h2 id="share-ownership-1">Share ownership</h2>');
    expect(post.contentHtml).toContain('<h2 id="another-section">Another section</h2>');
    expect(post.headings.map(heading => heading.slug)).toEqual(['share-ownership', 'share-ownership-1', 'another-section']);
    await expect(getPostData('unlisted')).rejects.toThrow('Unpublished documentation page');
  });

  it('puts only canonical published docs in the sitemap, with authored revision dates', () => {
    mockPosts();
    const { xml, postCount, urlCount } = generateSitemap();
    expect(postCount).toBe(2);
    expect(urlCount).toBe(8);
    expect(xml).toContain('<loc>https://poa.box/docs/create/</loc>\n    <lastmod>2026-09-06</lastmod>');
    expect(xml).toContain('<loc>https://poa.box/docs/join/</loc>\n  </url>');
    expect(xml).not.toMatch(/\/blog\/|\/docs\/(test|unlisted|passkey-onboarding|perpetualOrganization)\//);
    expect(xml).not.toContain('2026-05-01');
  });
});


describe('documentation figures', () => {
  const render = async content => {
    mockPosts({ 'create.md': `---\ntitle: Figures\n---\n# Figures\n\n${content}` });
    return getPostData('create');
  };

  it('renders escaped editorial captions as semantic figures without changing heading anchors', async () => {
    const post = await render('## Share **ownership**\n\n![A studio](/images/docs/studio.webp "<script>alert(1)</script> & *plain* caption")\n\n## Share ownership');
    expect(post.contentHtml).toContain('<figure class="pa-figure pa-figure-editorial"><img');
    expect(post.contentHtml).toContain('width="1600" height="1000" loading="lazy" decoding="async"');
    expect(post.contentHtml).toMatch(/<figcaption>(?:&#x3C;|&lt;)script>/);
    expect(post.contentHtml).toMatch(/(?:&#x26;|&amp;) \*plain\* caption<\/figcaption>/);
    expect(post.contentHtml).not.toMatch(/<script|<em>|<p>\s*<figure|<a /);
    expect(post.contentHtml).not.toContain('title=');
    expect(post.headings.map(({ slug }) => slug)).toEqual(['share-ownership', 'share-ownership-1']);
    expect(post.contentHtml).toContain('<h2 id="share-ownership">Share <strong>ownership</strong></h2>');
  });

  it('links screenshots to their original file with dimensions and a visible, accessible full-size affordance', async () => {
    const { contentHtml } = await render('![The task board](/images/product/tasks.webp "Review finished work.")');
    expect(contentHtml).toContain('<figure class="pa-figure pa-figure-screenshot">');
    expect(contentHtml).toContain('href="/images/product/tasks.webp" target="_blank" rel="noopener noreferrer"');
    expect(contentHtml).toContain('aria-label="View full size: The task board (opens in a new tab)"');
    expect(contentHtml).toContain('width="2400" height="1500" loading="lazy" decoding="async"');
    expect(contentHtml).toContain('aria-hidden="true">View full size ↗</span></a>');
    expect(contentHtml).toContain('<figcaption>Review finished work.</figcaption></figure>');
    expect(contentHtml).not.toMatch(/<p>\s*<figure/);
  });

  it('keeps unknown, external, inline, and already-linked images in their original paragraphs', async () => {
    const { contentHtml } = await render([
      '![Unknown](/images/docs/unknown.webp "Unknown caption")',
      '![External](https://example.com/photo.webp "External caption")',
      'Before ![Inline](/images/docs/studio.webp "Inline title") after.',
      '[![Linked](/images/product/tasks.webp)](https://example.com)',
    ].join('\n\n'));
    expect(contentHtml).not.toMatch(/<figure|<figcaption|loading=|decoding=|target=|width=/);
    expect(contentHtml).toContain('<p><img src="/images/docs/unknown.webp" alt="Unknown" title="Unknown caption"></p>');
    expect(contentHtml).toContain('<p><img src="https://example.com/photo.webp" alt="External" title="External caption"></p>');
    expect(contentHtml).toContain('<p>Before <img src="/images/docs/studio.webp" alt="Inline" title="Inline title"> after.</p>');
    expect(contentHtml).toContain('<p><a href="https://example.com"><img src="/images/product/tasks.webp" alt="Linked"></a></p>');
  });

  it('does not invent a caption for an image without a title or enable authored raw HTML', async () => {
    const { contentHtml } = await render('![A studio](/images/docs/studio.webp)\n\n<script>alert(1)</script>');
    expect(contentHtml).toContain('<figure class="pa-figure pa-figure-editorial">');
    expect(contentHtml).not.toMatch(/<figcaption|<script|alert/);
  });
});
