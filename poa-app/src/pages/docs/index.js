import Head from 'next/head';
import { getSortedPostsData } from '../../util/posts';
import SEOHead from '@/components/common/SEOHead';

// Marketing /docs hub, direction A ("public works"), rebuilt on the same
// marketing chrome + primitives as the landing (P2) and /about (P3). A MANUAL,
// NOT MARKETING (BRIEF §7): the reader shell renders a task-first table of
// contents in the manual register (sentence case, zero adjectives, zero
// pain-point copy). Thin page per repo convention: chrome + section components,
// no logic here. The article links keep their existing slugs, so nothing breaks.
//
// This page's meta/keywords/JSON-LD ARE in scope for P4 (unlike landing/about
// meta, which P5 owns): the old keyword/description strings carried banned
// substrate terms and were the only standing error in the vocab gate. They are
// rewritten here into the safe register while staying SEO-sensible.
//
// Reduced-mode nav: MarketingNav degrades gracefully when the auth props are
// omitted (showSignIn/showAccount both resolve false, authControl renders null),
// exactly as on /about. That is the correct wiring for a docs surface with no
// auth trigger.
import { MarketingRoot } from '@/components/marketing/primitives';
import MarketingNav from '@/components/marketing/chrome/MarketingNav';
import MarketingFooter from '@/components/marketing/chrome/MarketingFooter';
import { DocsHero, DocsIndex } from '@/components/marketing/docs';

export default function DocsHub({ allPostsData }) {
  return (
    <>
      <SEOHead
        title="Poa docs"
        description="How to start a worker owned or community owned organization on Poa: set your rules, run votes, manage tasks, share revenue, and cash out. Reference guides, grouped by task."
        path="/docs"
        keywords={[
          "worker owned organization",
          "community ownership",
          "cooperative software",
          "group governance",
          "task management for communities",
          "start a cooperative",
          "revenue sharing",
          "poa.box",
        ]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": "Poa docs",
          "description":
            "Reference guides for starting and running a worker owned or community owned organization on Poa: rules, voting, membership, tasks, treasury, and revenue sharing.",
          "url": "https://poa.box/docs/",
          "inLanguage": "en",
          "isPartOf": { "@type": "WebSite", "name": "Poa", "url": "https://poa.box" },
        }}
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
