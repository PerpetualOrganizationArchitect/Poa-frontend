import fs from 'fs';
import path from 'path';

const SITE_URL = 'https://poa.box';
const POSTS_DIR = path.join(process.cwd(), 'posts');
const OUTPUT = path.join(process.cwd(), 'public', 'sitemap.xml');
const TEST_FILES = new Set(['test', 'test2', 'letsSee']);

// Simple frontmatter parser (avoids gray-matter dependency)
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      data[key] = val;
    }
  }
  return data;
}

// Static public routes
const staticRoutes = [
  { path: '/',          priority: '1.00', changefreq: 'weekly' },
  { path: '/about/',    priority: '0.80', changefreq: 'monthly' },
  { path: '/docs/',     priority: '0.90', changefreq: 'weekly' },
  { path: '/explore/',  priority: '0.70', changefreq: 'weekly' },
  { path: '/protocol/', priority: '0.70', changefreq: 'weekly' },
  { path: '/create/',   priority: '0.80', changefreq: 'monthly' },
];

// Read posts and extract metadata
const postFiles = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
const posts = postFiles
  .map(f => {
    const id = f.replace(/\.md$/, '');
    if (TEST_FILES.has(id)) return null;
    const content = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    if (content.trim().length === 0) return null;
    const data = parseFrontmatter(content);
    const date = data.date
      ? new Date(data.date).toISOString().split('T')[0]
      : null;
    return { id, date };
  })
  .filter(Boolean);

// Build XML
const OG_IMAGE = `${SITE_URL}/images/poa_og.webp`;
const urlEntry = (loc, lastmod, changefreq, priority) =>
  `<url>
  <loc>${SITE_URL}${loc}</loc>
${lastmod ? `  <lastmod>${lastmod}</lastmod>\n` : ''}  <changefreq>${changefreq}</changefreq>
  <priority>${priority}</priority>
  <image:image>
    <image:loc>${OG_IMAGE}</image:loc>
    <image:title>Poa — Community-Owned Organization Builder</image:title>
  </image:image>
</url>`;

const urls = [
  '<!-- Static pages -->',
  ...staticRoutes.map(r => urlEntry(r.path, null, r.changefreq, r.priority)),
  '',
  '<!-- Documentation pages -->',
  ...posts.map(p => urlEntry(`/docs/${p.id}/`, p.date, 'monthly', '0.70')),
  '',
  '<!-- Blog pages -->',
  ...posts.map(p => urlEntry(`/blog/${p.id}/`, p.date, 'monthly', '0.60')),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

${urls.join('\n')}

</urlset>
`;

fs.writeFileSync(OUTPUT, xml);
console.log(`Sitemap generated: ${posts.length} posts, ${staticRoutes.length + posts.length * 2} total URLs`);
