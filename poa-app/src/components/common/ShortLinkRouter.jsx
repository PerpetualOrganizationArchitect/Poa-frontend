import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Button, Center, Text } from '@chakra-ui/react';
import PulseLoader from '@/components/shared/PulseLoader';
import { parseShortLink, linkPage, LINK_PAGES } from '@/util/shortLinks';

/** Expand incoming shared links once. Ordinary navigation needs no shortener. */
export default function ShortLinkRouter({ children }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [failure, setFailure] = useState(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [attempt, setAttempt] = useState(0);
  const asPath = router.asPath;
  const supported = LINK_PAGES.has(linkPage(router.pathname));
  const hasCode = supported && !!parseShortLink(asPath);

  useEffect(() => {
    if (!router.isReady || !hasCode) return;
    let cancelled = false;
    const expectedPath = asPath;
    const pathname = routerRef.current.pathname;
    const current = () => !cancelled && routerRef.current.asPath === expectedPath;
    setFailure(null);
    (async () => {
      try {
        const { resolveShortLink } = await import('@/services/web3/domain/ShortLinkService');
        const link = parseShortLink(expectedPath);
        const query = await resolveShortLink(pathname, link.code, link.extras);
        if (!current()) return;
        await routerRef.current.replace(
          { pathname, query, hash: new URL(expectedPath, window.location.origin).hash },
          undefined,
          { shallow: true, scroll: false },
        );
      } catch (error) {
        if (current() && !error.cancelled) {
          setFailure({
            path: expectedPath,
            message: error.name === 'ShortLinkError' ? error.message : 'Could not load this link. Please try again.',
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, asPath, hasCode, attempt]);

  if (mounted && router.isReady && hasCode) {
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
