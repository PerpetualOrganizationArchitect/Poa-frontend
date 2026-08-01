import Head from 'next/head';
import { getPostData, getAllPostIds, getRelatedPosts } from '../../util/posts';
import SEOHead from '@/components/common/SEOHead';

// Marketing /docs/[id] article template, direction A ("public works"), rebuilt
// on the same marketing chrome + primitives as the landing (P2) and /about (P3).
// A typographic pass only: the content is sourced and rendered EXACTLY as before
// (same getStaticProps/getStaticPaths, same markdown pipeline, same
// dangerouslySetInnerHTML), so the article BODY is byte-identical and every
// in-article anchor/id the pipeline produced still resolves. DocsArticle only
// re-dresses the shell around it. No motion library; entrances are pure CSS.
//
// The article BODY is EXEMPT vocabulary (BRIEF §7): posts/*.md are untouched.
// Thin page per repo convention: chrome + the reader shell, no logic here.
import { MarketingRoot } from '@/components/marketing/primitives';
import MarketingNav from '@/components/marketing/chrome/MarketingNav';
import MarketingFooter from '@/components/marketing/chrome/MarketingFooter';
import { DocsArticle } from '@/components/marketing/docs';

export default function DocsPost({ postData, navigationData, relatedPosts }) {
  // TechArticle JSON-LD for /docs/* pages. Unchanged from the old template: the
  // fields derive from the post's own front-matter title/description, which the
  // vocab gate treats as article-body-derived content under the §7 exemption.
  const techArticleLD = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": postData.title || postData.id,
    "description": postData.description,
    "datePublished": postData.date,
    "dateModified": postData.date,
    "author": { "@type": "Organization", "name": "Poa Team", "url": "https://poa.box" },
    "publisher": {
      "@type": "Organization",
      "name": "Poa",
      "url": "https://poa.box",
      "logo": { "@type": "ImageObject", "url": "https://poa.box/images/poa_og.webp" },
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": `https://poa.box/docs/${postData.id}/` },
  };

  return (
    <>
      <SEOHead
        title={`${postData.title} | Poa docs`}
        description={postData.description}
        path={`/docs/${postData.id}`}
        ogType="article"
        jsonLd={techArticleLD}
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
  const paths = getAllPostIds();
  return {
    paths,
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const postData = await getPostData(params.id);

  // Get navigation data
  const allPostIds = getAllPostIds().map(path => path.params.id);
  const currentIndex = allPostIds.indexOf(params.id);

  const navigationData = {
    prev: currentIndex > 0 ? { id: allPostIds[currentIndex - 1] } : null,
    next: currentIndex < allPostIds.length - 1 ? { id: allPostIds[currentIndex + 1] } : null,
  };

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
