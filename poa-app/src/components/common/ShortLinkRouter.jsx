import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Button, Center, Text } from '@chakra-ui/react';
import PulseLoader from '@/components/shared/PulseLoader';
import { parseShortLink, linkPage, LINK_PAGES, queryString } from '@/util/shortLinks';
import { getDefaultOrgForHost } from '@/config/hostDefaultOrg';

/** Resolve short codes before org providers mount; mask full internal queries. */
export default function ShortLinkRouter({ children }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const resolvedPath = useRef('');
  const [failure, setFailure] = useState(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [attempt, setAttempt] = useState(0);
  const asPath = router.asPath;
  const hash = asPath?.split('#')[1] || '';
  const supported = LINK_PAGES.has(linkPage(router.pathname));
  const shortLink = supported ? parseShortLink(asPath) : null;
  const hasCode = !!shortLink;
  const queryKey = queryString(router.query);

  useEffect(() => {
    if (!router.isReady || !supported) return;
    let cancelled = false;
    const expectedPath = asPath;
    const current = () => !cancelled && routerRef.current.asPath === expectedPath;
    if (hasCode) {
      if (resolvedPath.current === expectedPath) return;
      setFailure(null);
      (async () => {
        try {
          const { resolveShortLink } = await import('@/services/web3/domain/ShortLinkService');
          // Read visible extras, not potentially stale internal router state.
          const link = parseShortLink(expectedPath);
          const query = await resolveShortLink(router.pathname, link.code, link.extras);
          if (!current()) return;
          resolvedPath.current = expectedPath;
          await routerRef.current.replace({ pathname: router.pathname, query }, expectedPath, { shallow: true, scroll: false });
        } catch (error) {
          if (current() && !error.cancelled) {
            resolvedPath.current = '';
            setFailure({
              path: expectedPath,
              message: error.name === 'ShortLinkError' ? error.message : 'Could not load this link. Please try again.',
            });
          }
        }
      })();
      return () => { cancelled = true; };
    }
    // Preserve actual section anchors. Filters remain explicit extra query data;
    // a free-form view cannot fit in eight characters without saving it.
    if (hash) return;
    const query = { ...routerRef.current.query };
    if (!query.org && !query.userDAO) query.org = getDefaultOrgForHost();
    if (!query.org && !query.userDAO) return;
    const timer = setTimeout(async () => {
      try {
        const { createShortLink } = await import('@/services/web3/domain/ShortLinkService');
        const result = await createShortLink(window.location.pathname, query);
        if (!result || !current()) return;
        resolvedPath.current = result.url;
        await routerRef.current.replace(
          { pathname: router.pathname, query: { ...query, orgId: result.orgId, chainId: String(result.chainId) } },
          result.url,
          { shallow: true, scroll: false },
        );
      } catch {
        // Offline/indexer/RPC trouble must never block an already-open page.
        // The complete existing URL remains a working, portable fallback.
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [router.isReady, router.pathname, asPath, hash, hasCode, supported, queryKey, attempt]);

  if (mounted && router.isReady && hasCode && resolvedPath.current !== asPath) {
    if (failure?.path === asPath) {
      return (
        <Box textAlign="center" p={12}>
          <Text fontSize="xl" mb={3}>This link could not be opened.</Text>
          <Text mb={5}>{failure.message}</Text>
          <Button onClick={() => setAttempt((value) => value + 1)} mr={3}>Try again</Button>
          <Button as="a" href={`${router.pathname}/`}>Open this page</Button>
        </Box>
      );
    }
    return <Center minH="60vh"><PulseLoader size="xl" /></Center>;
  }
  return children;
}
