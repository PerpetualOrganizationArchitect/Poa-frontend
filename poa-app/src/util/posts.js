import fs from 'fs';
import { DOCS_MEDIA } from '@/components/marketing/docsMedia';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { DOCS_REDIRECTS, getDocsEntries, getDocMetadata } from '@/lib/docs.mjs';

const postsDirectory = path.join(process.cwd(), 'posts');

function readPost(id) {
  return matter(fs.readFileSync(path.join(postsDirectory, `${id}.md`), 'utf8'));
}

// The published reading order is also the index, search, and navigation order.
// An unlisted file cannot accidentally become a public documentation page.
export function getSortedPostsData() {
  return getDocsEntries().flatMap(({ id }) => {
    if (!fs.existsSync(path.join(postsDirectory, `${id}.md`))) return [];
    const post = readPost(id);
    if (!post.content.trim() || post.data.draft === true) return [];
    return [getDocMetadata(id, post)];
  });
}

export function getAllPostIds({ includeRedirects = false } = {}) {
  const ids = getSortedPostsData().map(post => post.id);
  if (includeRedirects) ids.push(...Object.keys(DOCS_REDIRECTS));
  return [...new Set(ids)].map(id => ({ params: { id } }));
}

function nodeText(node) {
  return node.value || node.alt || (node.children || []).map(nodeText).join('');
}

// Work on the Markdown tree so formatted headings and repeated titles receive
// correct, unique anchors. Code fences never become table-of-contents entries.
function prepareArticle({ headings }) {
  return tree => {
    const titleIndex = tree.children.findIndex(node => node.type === 'heading' && node.depth === 1);
    if (titleIndex !== -1) tree.children.splice(titleIndex, 1);
    const used = new Set();
    const visit = node => {
      if (node.type === 'heading') {
        node.depth = Math.max(2, node.depth);
        const text = nodeText(node);
        const base = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/^-|-$/g, '') || 'section';
        let slug = base;
        let suffix = 1;
        while (used.has(slug)) slug = `${base}-${suffix++}`;
        used.add(slug);
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: slug } };
        headings.push({ level: node.depth, text, plainText: text, slug });
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

// Promote only standalone, catalogued local images. HAST text nodes keep
// authored captions escaped by the normal serializer, without raw HTML.
function articleFigures() {
  return tree => {
    const visit = node => {
      if (!node.children) return;
      node.children = node.children.map(child => {
        const image = child.tagName === 'p' && child.children?.length === 1
          ? child.children[0] : null;
        const src = image?.properties?.src;
        const media = image?.tagName === 'img' && typeof src === 'string' && src.startsWith('/images/')
          && Object.hasOwn(DOCS_MEDIA, src) ? DOCS_MEDIA[src] : null;
        if (!media) {
          visit(child);
          return child;
        }

        const { title, ...properties } = image.properties;
        const picture = {
          ...image,
          properties: { ...properties, width: media.width, height: media.height, loading: 'lazy', decoding: 'async' },
        };
        const children = [media.kind === 'screenshot' ? {
          type: 'element', tagName: 'a',
          properties: {
            href: src, target: '_blank', rel: ['noopener', 'noreferrer'],
            className: ['pa-figure-link'],
            ariaLabel: `View full size: ${properties.alt || 'screenshot'} (opens in a new tab)`,
          },
          children: [picture, {
            type: 'element', tagName: 'span',
            properties: { className: ['pa-figure-hint'], ariaHidden: 'true' },
            children: [{ type: 'text', value: 'View full size ↗' }],
          }],
        } : picture];
        if (title) children.push({
          type: 'element', tagName: 'figcaption', properties: {},
          children: [{ type: 'text', value: title }],
        });
        return {
          type: 'element', tagName: 'figure',
          properties: { className: ['pa-figure', `pa-figure-${media.kind}`] }, children,
        };
      });
    };
    visit(tree);
  };
}

// Keep wide reference tables readable on small screens without scrolling the
// entire article. Native table headers remain available to assistive technology.
function articleTables() {
  return tree => {
    const visit = node => {
      if (!node.children) return;
      node.children = node.children.map(child => {
        if (child.tagName !== 'table') {
          visit(child);
          return child;
        }
        const head = child.children.find(row => row.tagName === 'thead');
        const headers = head?.children.find(row => row.tagName === 'tr')?.children.filter(cell => cell.tagName === 'th') || [];
        headers.forEach(cell => { cell.properties = { ...cell.properties, scope: 'col' }; });
        const region = {
          type: 'element', tagName: 'div',
          properties: {
            className: ['pa-table-scroll', ...(headers.length > 2 ? ['pa-table-wide'] : [])],
            tabIndex: 0, role: 'region',
            ariaLabel: `Table: ${headers.map(nodeText).join(', ')}. Scroll horizontally if needed.`,
          },
          children: [child],
        };
        if (headers.length <= 2) return region;
        return {
          type: 'element', tagName: 'div', properties: { className: ['pa-table-wrap'] },
          children: [{
            type: 'element', tagName: 'p', properties: { className: ['pa-table-hint'], ariaHidden: 'true' },
            children: [{ type: 'text', value: 'Scroll for all columns →' }],
          }, region],
        };
      });
    };
    visit(tree);
  };
}

export async function getPostData(id) {
  if (!getSortedPostsData().some(post => post.id === id)) {
    throw new Error(`Unpublished documentation page: ${id}`);
  }
  const post = readPost(id);
  const headings = [];
  const result = await remark()
    .use(remarkGfm)
    .use(remarkMath)
    .use(prepareArticle, { headings })
    .use(remarkRehype)
    .use(articleFigures)
    .use(articleTables)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(post.content);

  return { ...getDocMetadata(id, post), contentHtml: result.toString(), headings };
}

export function getPostNavigation(id) {
  const posts = getSortedPostsData();
  const index = posts.findIndex(post => post.id === id);
  const link = post => post ? { id: post.id, title: post.title } : null;
  if (index === -1) return { prev: null, next: null };
  return { prev: link(posts[index - 1]), next: link(posts[index + 1]) };
}

export function getPostsByCategory(category) {
  return getSortedPostsData().filter(post => post.category === category);
}

export function getRelatedPosts(currentPostId, maxCount = 3) {
  const posts = getSortedPostsData();
  const current = posts.find(post => post.id === currentPostId);
  if (!current) return [];
  const others = posts.filter(post => post.id !== currentPostId);
  return [
    ...others.filter(post => post.category === current.category),
    ...others.filter(post => post.category !== current.category),
  ].slice(0, maxCount);
}
