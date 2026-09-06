import Head from 'next/head';
import { getPostData, getAllPostIds, getRelatedPosts, getPostNavigation } from '@/util/posts';
import { getDocsArticleSchema, getDocsRedirect, getDocsEntries } from '@/lib/docs.mjs';
import DocsRedirect from '@/components/marketing/docs/DocsRedirect';
import SEOHead from '@/components/common/SEOHead';

import { MarketingRoot } from '@/components/marketing/primitives';
import MarketingNav from '@/components/marketing/chrome/MarketingNav';
import MarketingFooter from '@/components/marketing/chrome/MarketingFooter';
import { DocsArticle } from '@/components/marketing/docs';

export default function DocsPost({ postData, navigationData, relatedPosts, redirect }) {
  if (redirect) return <DocsRedirect {...redirect} />;

  return (
    <>
      <SEOHead
        title={`${postData.title} | Poa docs`}
        description={postData.description}
        path={`/docs/${postData.id}`}
        ogType="article"
        jsonLd={getDocsArticleSchema(postData)}
      />

      {/* Preload the two marketing display/body faces the first paint needs; the
          mono arrives with the same priority for the article code + labels. */}
      <Head>
        <link rel="preload" href="/fonts/archivo-vf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/public-sans-vf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/plex-mono-500-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </Head>

      <MarketingRoot>
        <a href="#docs-article-main" className="pa-skip">
          Skip to content
        </a>

        <MarketingNav />

        <main id="docs-article-main">
          <DocsArticle
            postData={postData}
            navigationData={navigationData}
            relatedPosts={relatedPosts}
          />
        </main>

        <MarketingFooter />

        <style jsx>{`
          .pa-skip {
            position: absolute;
            left: -9999px;
            top: 0;
            z-index: 100;
            background: var(--paper);
            color: var(--ink);
            font-family: var(--mono);
            font-size: 0.875rem;
            padding: 12px 16px;
            border: 2px solid var(--signal);
            text-decoration: none;
          }
          .pa-skip:focus {
            left: 8px;
            top: 8px;
            outline: none;
            box-shadow: none;
          }
        `}</style>
      </MarketingRoot>
    </>
  );
}

export async function getStaticPaths() {
  const paths = getAllPostIds({ includeRedirects: true });
  return {
    paths,
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const target = getDocsRedirect(`/docs/${params.id}/`);
  if (target) {
    const entry = getDocsEntries().find(item => target === `/docs/${item.id}/`);
    return { props: { redirect: { target, title: entry?.title || 'Poa docs' } } };
  }
  const postData = await getPostData(params.id);
  const navigationData = getPostNavigation(params.id);

  // Related posts, same category first, then fall back to others. Strips
  // any fields Next.js can't serialize and excludes the current post.
  const relatedPosts = getRelatedPosts(params.id, 3)
    .map((p) => ({
      id: p.id,
      title: p.title || p.id,
      description: p.description || null,
      category: p.category || 'Documentation',
    }));

  return {
    props: {
      postData,
      navigationData,
      relatedPosts,
    },
  };
}
