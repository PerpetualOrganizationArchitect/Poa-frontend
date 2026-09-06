import { getAllPostIds } from '@/util/posts';
import { getDocsEntries, getDocsRedirect } from '@/lib/docs.mjs';
import DocsRedirect from '@/components/marketing/docs/DocsRedirect';

// The old blog duplicated the documentation. Keep incoming links useful on
// static hosts while the edge worker sends permanent redirects when available.
export default function LegacyBlogPost(props) {
  return <DocsRedirect {...props} />;
}

export async function getStaticPaths() {
  return { paths: getAllPostIds({ includeRedirects: true }), fallback: false };
}

export async function getStaticProps({ params }) {
  const target = getDocsRedirect(`/blog/${params.id}/`);
  if (!target) return { notFound: true };
  const entry = getDocsEntries().find(item => target === `/docs/${item.id}/`);
  return { props: { target, title: entry?.title || 'Poa docs' } };
}
