import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useOrgName } from '@/hooks/useOrgName';

/**
 * Legacy client-side redirect: /voting-history → /votes.
 *
 * This app is a static export (`output: 'export'`), so next.config redirects
 * never apply to the deployed site — this page IS the redirect. It was deleted
 * in the voting overhaul, which 404'd bookmarked /voting-history?… links;
 * restored with the canonical `userDAO` param (useOrgName reads legacy `org`
 * links too, so old bookmarks still resolve).
 */
export default function LegacyRedirect() {
  const router = useRouter();
  const orgName = useOrgName();
  useEffect(() => {
    if (!router.isReady) return;
    const { userDAO, org, ...rest } = router.query;
    const params = new URLSearchParams({ userDAO: orgName, ...rest });
    router.replace(`/votes/?${params.toString()}`);
  }, [router.isReady, router.query, orgName]);
  return null;
}
