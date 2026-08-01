import React from "react";
import Head from "next/head";
import SEOHead from "@/components/common/SEOHead";

// Marketing /about, direction A ("public works"), rebuilt on the same marketing
// chrome + primitives as the landing (P2). Five blocks (BRIEF §6): the belief,
// the problem we saw, what Poa is, how we hold ourselves to it, where we are.
// Thin page per repo convention: chrome + section components, no logic here.
//
// Nav auth wiring: the old /about carried no auth UI (its Navbar managed its own
// state internally). MarketingNav degrades gracefully when the auth props are
// omitted: showSignIn/showAccount both resolve false, so authControl() renders
// null and the masthead shows the mark, the nav links, and the Start CTA with no
// account trigger. That is the simplest correct wiring for a page with no auth
// surface; if /about ever needs sign-in, copy index.js's accountMenuItem plumbing.
import { MarketingRoot } from "@/components/marketing/primitives";
import MarketingNav from "@/components/marketing/chrome/MarketingNav";
import MarketingFooter from "@/components/marketing/chrome/MarketingFooter";
import {
  Belief,
  Problem,
  WhatPoaIs,
  HowWeHold,
  Where,
} from "@/components/marketing/about";

export default function AboutPage() {
  return (
    <>
      <SEOHead
        title="About Poa: built by the people who own it"
        description="Why Poa exists: the belief that the people who build a thing should own it, the problem it answers, and how we hold ourselves to it. Poa runs on Poa."
        path="/about"
        keywords={[
          "about poa",
          "worker owned organization",
          "community ownership",
          "cooperative software",
          "revenue sharing",
          "group governance",
          "poa.box",
        ]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "name": "About Poa",
          "description":
            "Why Poa exists: the belief that the people who build a thing should own it. Poa turns a group into an organization it owns together, where finished work earns ownership, a share of the revenue and a real say. Poa runs as an organization on Poa, with its books public. Open-source and free.",
          "url": "https://poa.box/about/",
          "mainEntity": {
            "@type": "Organization",
            "name": "Poa",
            "alternateName": ["poa.box", "poa box", "Poa.box"],
            "url": "https://poa.box",
            "logo": "https://poa.box/images/poa_og.webp",
            "sameAs": [
              "https://twitter.com/PoaPerpetual",
              "https://discord.gg/9SD6u4QjTt",
            ],
          },
        }}
      />

      {/* Preload the two marketing display/body faces the first paint needs; the
          mono arrives with the same priority for the rails and mono labels. */}
      <Head>
        <link rel="preload" href="/fonts/archivo-vf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/public-sans-vf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/plex-mono-500-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </Head>

      <MarketingRoot>
        <a href="#about-main" className="pa-skip">
          Skip to content
        </a>

        {/* Reduced-mode nav: no auth props (see note above). */}
        <MarketingNav />

        <main id="about-main">
          <Belief />
          <Problem />
          <WhatPoaIs />
          <HowWeHold />
          <Where />
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
