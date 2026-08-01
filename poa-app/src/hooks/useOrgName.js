import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getDefaultOrgForHost } from '@/config/hostDefaultOrg';

/**
 * Resolve the active org name for the current page.
 *
 * Order of precedence:
 *   1. ?org= query param (canonical, preferred)
 *   2. ?userDAO= query param (legacy, kept for back-compat with old links)
 *   3. Host default (white-label domains — see HOST_DEFAULT_ORG)
 *
 * SSR-safe: the initial render uses only `router.query`, which Next produces
 * identically on server and client. The `window.location`/`hostname` fallbacks
 * (needed for full-page loads where `router.isReady` lags) run inside an
 * effect, avoiding hydration mismatches in every consumer that builds a link
 * with this value.
 */
export function useOrgNameState() {
  const router = useRouter();
  const fromRouter = router.query.org || router.query.userDAO || '';
  // `checked` flips once the window.location / host-default fallback has
  // actually run. Without it, "no org selected" is indistinguishable from "not
  // resolved yet": on a hard load `router.query` is empty and the host default
  // only lands inside the effect, so the FIRST client render of every page has
  // no name. A consumer that reads that as "no org" flashes a dead end on every
  // page load. Stays false on the server render, so hydration is unaffected.
  const [browser, setBrowser] = useState({ name: '', checked: false });

  useEffect(() => {
    if (fromRouter) return;
    let next = '';
    try {
      const params = new URLSearchParams(window.location.search);
      next = params.get('org') || params.get('userDAO') || '';
    } catch {}
    if (!next) next = getDefaultOrgForHost() || '';
    setBrowser({ name: next, checked: true });
  }, [fromRouter]);

  return {
    orgName: fromRouter || browser.name || '',
    // True once we know WHETHER a name exists, whatever the answer.
    resolved: !!fromRouter || browser.checked,
  };
}

/** The common case: just the name. */
export function useOrgName() {
  return useOrgNameState().orgName;
}
