import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useDisclosure } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";
import { useQuery } from "@apollo/client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useGlobalAccount } from "@/hooks/useGlobalAccount";
import { useAuth } from "@/context/AuthContext";
import { getDefaultOrgForHost } from "@/context/POContext";
import { FETCH_SOLIDARITY_FUND_STATUS } from "@/util/passkeyQueries";
import SEOHead from "@/components/common/SEOHead";

// Auth modals (lazy — only shown on user interaction)
const SignupModal = dynamic(() => import("@/components/account/SignupModal"), { ssr: false });
const SolidarityOnboardingModal = dynamic(() => import("@/components/passkey/SolidarityOnboardingModal"), { ssr: false });
const SignInModal = dynamic(() => import("@/components/passkey/SignInModal"), { ssr: false });

// Marketing landing — direction A ("public works"). All sections share the
// single scrollable page, so bundling them into the page chunk is cheaper than
// separate HTTP requests with duplicated imports.
import { MarketingRoot } from "@/components/marketing/primitives";
import MarketingNav from "@/components/marketing/chrome/MarketingNav";
import MarketingFooter from "@/components/marketing/chrome/MarketingFooter";
import {
  Hero,
  LedgerStrip,
  Problem,
  TheWork,
  TheSay,
  TheMoney,
  ThePeople,
  ProofBand,
  Ethos,
  StartClose,
} from "@/components/marketing/landing";

export default function Home() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { hasAccount, isLoading: isAccountLoading } = useGlobalAccount();
  const { isPasskeyUser, isAuthenticated, hasStoredPasskey } = useAuth();
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isWhiteLabelHost, setIsWhiteLabelHost] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // White-label hosts (e.g. dao.kublockchain.com) skip the generic POA landing
  // and go straight to the org home. Skipping render avoids a content flash
  // after hydration.
  useEffect(() => {
    if (getDefaultOrgForHost()) {
      setIsWhiteLabelHost(true);
      router.replace('/home');
    }
  }, [router]);

  // Prefetch key routes
  useEffect(() => {
    router.prefetch('/create');
    router.prefetch('/explore');
  }, [router]);

  const { isOpen: isOnboardingOpen, onOpen: onOnboardingOpen, onClose: onOnboardingClose } = useDisclosure();
  const { isOpen: isSignInOpen, onOpen: onSignInOpen, onClose: onSignInClose } = useDisclosure();

  // Check if solidarity fund is active
  const { data: solidarityData } = useQuery(FETCH_SOLIDARITY_FUND_STATUS);
  const solidarityBalance = solidarityData?.paymasterHubContracts?.[0]?.solidarityBalance || '0';
  const showSolidarityOnboarding = mounted && !isPasskeyUser && !isConnected && !hasStoredPasskey && BigInt(solidarityBalance) > 0n;

  // Account menu state
  const getAccountMenuItem = () => {
    if (mounted && isPasskeyUser) {
      return { text: "My account", onClick: () => router.push("/account") };
    }
    if (!isConnected && showSolidarityOnboarding) {
      return { text: "Create account", onClick: onOnboardingOpen };
    }
    if (!isConnected) {
      return { text: "Connect", onClick: openConnectModal };
    }
    if (isAccountLoading) {
      return { text: "Loading", onClick: () => {} };
    }
    if (hasAccount) {
      return { text: "My account", onClick: () => router.push("/account") };
    }
    return { text: "Sign up", onClick: () => setIsSignupOpen(true) };
  };

  const accountMenuItem = getAccountMenuItem();

  if (isWhiteLabelHost) {
    return <div style={{ minHeight: "100vh", background: "#ffffff" }} />;
  }

  const webSite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Poa",
    "alternateName": ["poa", "poa.box", "poa box", "Poa.box"],
    "url": "https://poa.box",
    "description":
      "Poa (poa.box) turns your group into an organization you own together. Finished work earns ownership: a share of the revenue and a real say in the decisions.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://poa.box/explore/?search={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  const organizationLD = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Poa",
    "alternateName": ["poa", "poa.box", "poa box", "Poa.box"],
    "url": "https://poa.box",
    "logo": "https://poa.box/images/poa_og.webp",
    "sameAs": [
      "https://twitter.com/PoaPerpetual",
      "https://discord.gg/9SD6u4QjTt",
      "https://github.com/poa-box",
    ],
    "foundingDate": "2024",
    "founder": {
      "@type": "Person",
      "name": "Hudson Headley",
      "sameAs": [
        "https://github.com/hudsonhrh",
        "https://twitter.com/PoaPerpetual",
      ],
    },
    "knowsAbout": [
      "Worker owned organization",
      "Community ownership",
      "Cooperative software",
      "Revenue sharing",
      "Group governance",
      "Task management for communities",
      "Start a cooperative",
    ],
    "description":
      "Poa (poa.box) turns your group into an organization you own together. Finished work earns ownership: revenue share and voting power for the tasks you complete. Open-source and free.",
  };

  const softwareLD = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Poa",
    "alternateName": ["poa", "poa.box", "Poa Perpetual Organization Architect"],
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "Worker owned organization platform",
    "operatingSystem": "Web",
    "url": "https://poa.box",
    "description":
      "Start an organization your group owns together: tasks, voting, membership, and a shared treasury in one place. Finished work earns ownership, and voting power is earned by participating. Open-source and free to use on poa.box.",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
    },
    "creator": { "@type": "Organization", "name": "Poa" },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://poa.box" },
      { "@type": "ListItem", "position": 2, "name": "Docs", "item": "https://poa.box/docs/" },
    ],
  };

  return (
    <>
      <SEOHead
        title="Poa: organizations that pay you with ownership"
        description="Turn your group into an organization you own together. Finished work earns ownership: revenue share and voting power for the tasks you complete. Free and open."
        path="/"
        ogImage="/images/poa-og-landing.png"
        ogImageAlt="Poa"
        keywords={[
          "worker owned organization",
          "community ownership",
          "cooperative software",
          "revenue sharing",
          "group governance",
          "task management for communities",
          "start a cooperative",
          "vouch based membership",
          "participation based voting",
          "poa.box",
        ]}
        jsonLd={[webSite, organizationLD, softwareLD, breadcrumb]}
      />

      {/* Preload the two marketing display/body faces the first paint needs;
          the mono arrives with the same priority for the data chips/rails. */}
      <Head>
        <link rel="preload" href="/fonts/archivo-vf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/public-sans-vf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/plex-mono-500-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </Head>

      <MarketingRoot>
        {/* Skip link — off-screen until focused, then pinned top-left. Same
            anchor semantics + focus behavior as before, plain <a> + styled-jsx. */}
        <a href="#main-content" className="pa-skip">
          Skip to content
        </a>

        <MarketingNav
          mounted={mounted}
          isPasskeyUser={isPasskeyUser}
          isConnected={isConnected}
          isAuthenticated={isAuthenticated}
          accountMenuItem={accountMenuItem}
          onSignInOpen={onSignInOpen}
        />

        <main id="main-content">
          <Hero />
          <LedgerStrip />
          <Problem />
          <TheWork />
          <TheSay />
          <TheMoney />
          <ThePeople />
          <ProofBand />
          <Ethos />
          <StartClose />
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

      {/* Auth Modals — mount only after first open so dynamic() chunks
          stay deferred for visitors who never click sign-in. */}
      {isSignupOpen && (
        <SignupModal isOpen onClose={() => setIsSignupOpen(false)} />
      )}
      {isOnboardingOpen && (
        <SolidarityOnboardingModal
          isOpen
          onClose={onOnboardingClose}
          onSuccess={() => router.push('/account')}
        />
      )}
      {isSignInOpen && (
        <SignInModal
          isOpen
          onClose={onSignInClose}
          onSuccess={() => router.push('/account')}
          onCreateAccount={onOnboardingOpen}
        />
      )}
    </>
  );
}
