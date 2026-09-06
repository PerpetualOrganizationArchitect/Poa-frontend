// Shared with the Node sitemap script and the edge worker, so use a relative
// import here rather than Next's application-only @ alias.
import { DOCS_SECTIONS } from '../components/marketing/docsCopy.js';

export const DOCS_SITE_URL = 'https://poa.box';

// Preserve useful incoming links without publishing the retired articles.
export const DOCS_REDIRECTS = {
  perpetualOrganization: 'what-is-poa',
  'passkey-onboarding': 'join',
  'account-abstraction': 'why-decentralization',
  AlphaV1: 'what-is-poa',
};

export function getDocsEntries() {
  return DOCS_SECTIONS.flatMap(section =>
    section.entries.map(entry => ({ ...entry, section: section.heading })),
  );
}

export function canonicalDocPath(id) {
  return `/docs/${id}/`;
}

export function getDocsRedirect(pathname) {
  const match = pathname.match(/^\/(docs|blog)\/([^/]+)\/?$/);
  if (!match) return null;
  const [, namespace, id] = match;
  const target = Object.hasOwn(DOCS_REDIRECTS, id) ? DOCS_REDIRECTS[id] : null;
  if (target) return canonicalDocPath(target);
  if (namespace === 'blog' && getDocsEntries().some(entry => entry.id === id)) {
    return canonicalDocPath(id);
  }
  return null;
}

export function normalizeDocDate(value) {
  if (!value || (typeof value !== 'string' && !(value instanceof Date))) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return date.toISOString().startsWith(value) ? value : null;
  }
  return date.toISOString();
}

function plainText(value) {
  return String(value)
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getDocMetadata(id, { data, content }) {
  const entry = getDocsEntries().find(item => item.id === id);
  const heading = content.match(/^#\s+(.+)$/m)?.[1];
  const title = plainText(data.title || heading || entry?.title || id.replace(/-/g, ' '));
  const paragraph = content.split(/\r?\n\s*\r?\n/).find(block =>
    block.trim() && !/^(#|!\[|```|~~~|\||[-*>]\s)/.test(block.trim()),
  );
  const description = plainText(data.description || paragraph || entry?.blurb || `A guide to ${title}.`);
  const date = normalizeDocDate(data.date);
  const updated = normalizeDocDate(data.updated || data.dateModified) || date;

  return {
    id,
    title,
    description,
    category: data.category || entry?.section || 'Documentation',
    date,
    updated,
  };
}

export function getDocsArticleSchema(post) {
  const url = `${DOCS_SITE_URL}${canonicalDocPath(post.id)}`;
  const organization = { '@type': 'Organization', name: 'Poa', url: DOCS_SITE_URL };
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: post.title,
      description: post.description,
      url,
      inLanguage: 'en',
      ...(post.date ? { datePublished: post.date } : {}),
      ...(post.updated ? { dateModified: post.updated } : {}),
      author: organization,
      publisher: organization,
      image: `${DOCS_SITE_URL}/images/poa_og.webp`,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      isPartOf: { '@type': 'CollectionPage', name: 'Poa docs', url: `${DOCS_SITE_URL}/docs/` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${DOCS_SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Docs', item: `${DOCS_SITE_URL}/docs/` },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    },
  ];
}

export function getDocsCollectionSchema(posts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Poa docs: shared ownership, voting, and revenue',
    description: 'How contribution, ownership, voting, and revenue sharing work in Poa. Guides to creating an organization, choosing its rules, and using its features.',
    url: `${DOCS_SITE_URL}/docs/`,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'Poa', url: DOCS_SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: post.title,
        url: `${DOCS_SITE_URL}${canonicalDocPath(post.id)}`,
      })),
    },
  };
}
