import Head from 'next/head';
import { getSortedPostsData } from '@/util/posts';
import { getDocsCollectionSchema } from '@/lib/docs.mjs';
import SEOHead from '@/components/common/SEOHead';

import { MarketingRoot } from '@/components/marketing/primitives';
import MarketingNav from '@/components/marketing/chrome/MarketingNav';
import MarketingFooter from '@/components/marketing/chrome/MarketingFooter';
import { DocsHero, DocsIndex } from '@/components/marketing/docs';

export default function DocsHub({ allPostsData }) {
  return (
    <>
      <SEOHead
        title="Poa docs | Shared ownership, voting, and revenue"
        description="Learn how Poa connects contribution with ownership, voting, and revenue sharing. Create your organization, choose its rules, and explore features and examples."
        path="/docs"
        jsonLd={getDocsCollectionSchema(allPostsData)}
      />

      {/* Preload the two marketing display/body faces the first paint needs; the
          mono arrives with the same priority for the rails, slugs, and kickers. */}
      <Head>
        <link rel="preload" href="/fonts/archivo-vf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/public-sans-vf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/plex-mono-500-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </Head>

      <MarketingRoot>
        <a href="#docs-main" className="pa-skip">
          Skip to content
        </a>

        <MarketingNav />

        <main id="docs-main">
          <DocsHero />
          <DocsIndex allPostsData={allPostsData} />
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

export async function getStaticProps() {
  const allPostsData = getSortedPostsData();
  return {
    props: {
      allPostsData,
    },
  };
}
