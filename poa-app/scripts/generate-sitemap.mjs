import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { DOCS_SITE_URL, canonicalDocPath, getDocMetadata, getDocsEntries } from '../src/lib/docs.mjs';

const STATIC_ROUTES = ['/', '/about/', '/docs/', '/explore/', '/protocol/', '/create/'];
const escapeXml = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Use the same curated catalog and authored dates as the docs renderer.
// Redirects, legacy blog duplicates, drafts, and unlisted files are excluded.
export function generateSitemap(postsDirectory = path.join(process.cwd(), 'posts')) {
  const posts = getDocsEntries().flatMap(({ id }) => {
    const file = path.join(postsDirectory, `${id}.md`);
    if (!fs.existsSync(file)) return [];
    const post = matter(fs.readFileSync(file, 'utf8'));
    if (!post.content.trim() || post.data.draft === true) return [];
    return [getDocMetadata(id, post)];
  });
  const entry = (pathname, updated) => [
    '  <url>',
    `    <loc>${escapeXml(`${DOCS_SITE_URL}${pathname}`)}</loc>`,
    ...(updated ? [`    <lastmod>${updated}</lastmod>`] : []),
    '  </url>',
  ].join('\n');
  const urls = [
    ...STATIC_ROUTES.map(route => entry(route)),
    ...posts.map(post => entry(canonicalDocPath(post.id), post.updated)),
  ];
  return {
    postCount: posts.length,
    urlCount: urls.length,
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { xml, postCount, urlCount } = generateSitemap();
  fs.writeFileSync(path.join(process.cwd(), 'public', 'sitemap.xml'), xml);
  console.log(`Sitemap generated: ${postCount} guides, ${urlCount} canonical URLs`);
}
