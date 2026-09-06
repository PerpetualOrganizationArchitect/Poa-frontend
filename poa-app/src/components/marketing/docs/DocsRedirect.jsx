import { useEffect } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '@/components/common/SEOHead';
import { MarketingRoot } from '@/components/marketing/primitives';

// Next's server redirects are unavailable in output: 'export'. The static
// fallback has no duplicate article body and remains usable without JavaScript.
export default function DocsRedirect({ target, title }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`${target}${window.location.search}${window.location.hash}`);
  }, [router, target]);

  return (
    <>
      <SEOHead
        title={`${title} | Poa docs`}
        description={`Continue to ${title} in the Poa documentation.`}
        path={target}
      />
      <Head>
        <meta name="robots" content="noindex, follow" />
        <meta httpEquiv="refresh" content={`0;url=${target}`} />
      </Head>
      <MarketingRoot>
        <main className="pa-container" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
          <h1>This guide has moved</h1>
          <p><NextLink href={target}>Continue to {title}</NextLink></p>
        </main>
      </MarketingRoot>
    </>
  );
}
