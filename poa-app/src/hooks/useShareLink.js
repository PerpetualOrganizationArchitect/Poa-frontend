import { useEffect, useState } from 'react';
import { shareUrl } from '@/util/shortLinks';

/** Prepare before the click so copying still works in gesture-gated browsers. */
export function useShareLink(pathname, query, scope) {
  const queryKey = JSON.stringify(query);
  const orgId = scope?.orgId;
  const orgChainId = scope?.orgChainId;
  const key = `${pathname}:${queryKey}:${orgId || ''}:${orgChainId || ''}`;
  const [result, setResult] = useState({ key: '', url: '' });
  useEffect(() => {
    let cancelled = false;
    const params = JSON.parse(queryKey);
    if (!params.org && !params.userDAO) return;
    shareUrl(pathname, params, { orgId, orgChainId }).then((url) => {
      if (!cancelled) setResult({ key, url });
    });
    return () => { cancelled = true; };
  }, [pathname, queryKey, orgId, orgChainId, key]);
  return result.key === key ? result.url : '';
}
