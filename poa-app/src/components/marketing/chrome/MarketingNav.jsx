import React, { useCallback, useState, startTransition } from 'react';
import NextLink from 'next/link';
import { NAV } from '@/components/marketing/landingCopy';

// MarketingNav - the direction-A ("public works") masthead, scaled to
// production. A document masthead, not app chrome: a sticky bone bar, the mark
// with its registration number, mono nav links, and the auth-aware
// sign-in / account trigger + Start CTA.
//
// Auth wiring is IDENTICAL to CharterNav (the props contract the page passes):
//   { mounted, isPasskeyUser, isConnected, isAuthenticated, accountMenuItem, onSignInOpen }
//   - showSignIn === mounted && !isPasskeyUser && !isConnected && !isAuthenticated
//   - otherwise, once authenticated, render the account menu item (its text +
//     onClick), wrapped in startTransition like the charter nav.
// Only the dress changed. Plain <a>/<button> + styled-jsx, no Chakra.
//
// Mobile: the nav links collapse into a toggle menu (the CTA + auth trigger
// stay in the disclosure panel), so the message survives 390px.

export default function MarketingNav({
  mounted,
  isPasskeyUser,
  isConnected,
  isAuthenticated,
  accountMenuItem,
  onSignInOpen,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignInOpen = useCallback(() => {
    setMenuOpen(false);
    startTransition(onSignInOpen);
  }, [onSignInOpen]);

  const handleAccountClick = useCallback(() => {
    setMenuOpen(false);
    if (accountMenuItem?.onClick) {
      startTransition(accountMenuItem.onClick);
    }
  }, [accountMenuItem]);

  const showSignIn = mounted && !isPasskeyUser && !isConnected && !isAuthenticated;
  const showAccount = mounted && isAuthenticated;

  const authControl = (extraClass = '') => {
    if (showSignIn) {
      return (
        <button type="button" className={`pa-nav-auth ${extraClass}`} onClick={handleSignInOpen}>
          {NAV.signIn}
        </button>
      );
    }
    if (showAccount) {
      return (
        <button type="button" className={`pa-nav-auth ${extraClass}`} onClick={handleAccountClick}>
          {accountMenuItem?.text}
        </button>
      );
    }
    return null;
  };

  return (
    <header className="pa-nav">
      <div className="pa-container pa-nav-inner">
        <NextLink href="/" className="pa-brand" aria-label="Poa home">
          <span className="pa-brand-mark">Poa</span>
          <span className="pa-brand-reg">reg. no. 001</span>
        </NextLink>

        <nav className="pa-nav-links" aria-label="Main">
          {NAV.links.map((l) =>
            l.anchor ? (
              <a key={l.href} href={l.href} className={`pa-nav-link ${l.fromMd ? 'pa-from-md' : l.fromSm ? 'pa-from-sm' : ''}`}>
                {l.label}
              </a>
            ) : (
              <NextLink
                key={l.href}
                href={l.href}
                className={`pa-nav-link ${l.fromMd ? 'pa-from-md' : l.fromSm ? 'pa-from-sm' : ''}`}
              >
                {l.label}
              </NextLink>
            )
          )}
        </nav>

        <div className="pa-nav-actions">
          {authControl('pa-nav-auth-desk')}
          <NextLink href="/create" className="pa-cta-solid pa-nav-cta">
            {NAV.cta}
          </NextLink>
          <button
            type="button"
            className="pa-nav-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={`pa-nav-toggle-bar ${menuOpen ? 'pa-open-1' : ''}`} />
            <span className={`pa-nav-toggle-bar ${menuOpen ? 'pa-open-2' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile disclosure panel */}
      <div className={`pa-nav-menu ${menuOpen ? 'pa-nav-menu-open' : ''}`}>
        <nav className="pa-nav-menu-links" aria-label="Mobile">
          {NAV.links.map((l) =>
            l.anchor ? (
              <a key={l.href} href={l.href} className="pa-nav-menu-link" onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ) : (
              <NextLink key={l.href} href={l.href} className="pa-nav-menu-link" onClick={() => setMenuOpen(false)}>
                {l.label}
              </NextLink>
            )
          )}
          {authControl('pa-nav-auth-menu')}
          <NextLink href="/create" className="pa-cta-solid pa-cta-lg pa-nav-menu-cta" onClick={() => setMenuOpen(false)}>
            {NAV.cta}
          </NextLink>
        </nav>
      </div>

      <div className="pa-hairline" />

      <style jsx>{`
        .pa-nav {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(244, 241, 233, 0.94);
        }
        .pa-nav-inner {
          display: flex;
          align-items: center;
          gap: 32px;
          height: 64px;
        }
        /* .pa-brand is on a NextLink (component), so styled-jsx will not add
           the scope class to the rendered <a>; :global() lets these rules land.
           The nav wrapper scopes them by proximity via the parent selectors. */
        .pa-nav-inner :global(.pa-brand) {
          display: flex;
          align-items: baseline;
          gap: 10px;
          text-decoration: none;
          color: var(--ink);
        }
        .pa-brand-mark {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 720;
          font-weight: 720;
          font-size: 22px;
          letter-spacing: -0.02em;
          line-height: 1;
        }
        .pa-brand-reg {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--steel);
        }
        .pa-nav-links {
          display: flex;
          gap: 26px;
          margin-left: 12px;
        }
        .pa-nav-link {
          font-size: 14px;
          color: var(--steel);
          text-decoration: none;
          letter-spacing: 0.01em;
        }
        .pa-nav-link:hover {
          color: var(--ink);
        }
        .pa-nav-actions {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 18px;
        }
        /* the auth control is returned from a helper fn, so styled-jsx does not
           scope its <button>; style it via the nav parent + :global(). */
        .pa-nav :global(.pa-nav-auth) {
          font-family: var(--sans);
          font-size: 14px;
          font-weight: 500;
          color: var(--signal-deep);
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
        }
        .pa-nav :global(.pa-nav-auth):hover {
          color: var(--signal);
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        /* hamburger toggle - two-bar minimal mark, hidden ≥ 720px */
        .pa-nav-toggle {
          display: none;
          flex-direction: column;
          justify-content: center;
          gap: 5px;
          width: 30px;
          height: 30px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
        }
        .pa-nav-toggle-bar {
          display: block;
          width: 22px;
          height: 2px;
          background: var(--ink);
          transition: transform 0.2s ease, opacity 0.2s ease;
        }
        .pa-open-1 {
          transform: translateY(3.5px) rotate(45deg);
        }
        .pa-open-2 {
          transform: translateY(-3.5px) rotate(-45deg);
        }

        /* mobile disclosure - closed by default, shown only below 720px */
        .pa-nav-menu {
          display: none;
        }
        .pa-nav-menu-links {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 8px 20px 22px;
        }
        /* menu links + CTA sit on NextLink and plain <a>; scope via the menu
           parent + :global() so both host kinds are covered. */
        .pa-nav-menu-links :global(.pa-nav-menu-link) {
          font-family: var(--sans);
          font-size: 16px;
          color: var(--ink);
          text-decoration: none;
          padding: 12px 0;
          border-bottom: 1px solid var(--hair);
        }
        .pa-nav-menu-links :global(.pa-nav-auth-menu) {
          text-align: left;
          font-size: 16px;
          padding: 12px 0;
          border-bottom: 1px solid var(--hair);
        }
        .pa-nav-menu-links :global(.pa-nav-menu-cta) {
          margin-top: 16px;
          justify-content: center;
        }

        @media (max-width: 720px) {
          /* .pa-nav-links / .pa-nav-cta live on NextLink (a component), so
             styled-jsx does not add the scope class to the rendered <a>; target
             them via the scoped parent + :global() so the hide actually lands. */
          .pa-nav-links,
          .pa-nav .pa-nav-actions :global(.pa-nav-auth-desk),
          .pa-nav .pa-nav-actions :global(.pa-nav-cta) {
            display: none;
          }
          .pa-nav-actions .pa-nav-toggle {
            display: flex;
          }
          .pa-nav-inner {
            gap: 16px;
          }
          .pa-nav-menu-open {
            display: block;
            background: var(--bone);
            border-bottom: 1px solid var(--hair);
          }
        }
      `}</style>
    </header>
  );
}
