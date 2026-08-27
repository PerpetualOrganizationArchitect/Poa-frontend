import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { getDefaultOrgForHost, resolveOrgAlias } from '@/context/POContext';

/**
 * On white-label hosts (poa.earth, dao.kublockchain.com) the hostname already
 * resolves the org via HOST_DEFAULT_ORG, so `?org=<hostDefault>` in the URL is
 * redundant noise. Links and router.push calls across the app still append it
 * explicitly. Mount this once to strip that param whenever it matches — runs
 * on initial load (external links, refresh) and after every client navigation.
 *
 * Uses shallow replace so the strip doesn't cause a re-render or re-fetch.
 * Preserves other query params.
 */
export default function WhiteLabelUrlCleaner() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hostDefault = getDefaultOrgForHost();
    if (!hostDefault) return;

    const clean = () => {
      const url = new URL(window.location.href);
      // Alias-resolved so a link carrying the org's retired name is stripped
      // too — useOrgName resolves it to the same org, so leaving it would pin
      // a dead name in the URL bar of the org's own domain.
      if (resolveOrgAlias(url.searchParams.get('org')) !== hostDefault) return;
      url.searchParams.delete('org');
      const path = url.pathname + (url.search || '') + url.hash;
      router.replace(path, undefined, { shallow: true });
    };

    clean();
    router.events.on('routeChangeComplete', clean);
    return () => {
      router.events.off('routeChangeComplete', clean);
    };
  }, [router]);

  return null;
}
