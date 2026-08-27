/**
 * useSubgraphCapability — the one place the capability probe becomes React state.
 *
 * Seeded SYNCHRONOUSLY from `peekCapability` so a known-capable endpoint never renders the
 * "absent" branch first (that would put a second full query on the wire on every load, and the
 * access-v2 subject document is not small), then resolved asynchronously for unknown endpoints.
 *
 * Returns `false` until proven otherwise — the safe default is always the LEGACY path.
 */

import { useEffect, useState } from 'react';
import { peekCapability, hasCapability } from '@/util/subgraphCapabilities';

export function useSubgraphCapability(subgraphUrl, capability) {
  const [supported, setSupported] = useState(
    () => peekCapability(subgraphUrl, capability) === true
  );

  useEffect(() => {
    let cancelled = false;
    const seed = peekCapability(subgraphUrl, capability);
    if (seed === true) {
      setSupported(true);
      return undefined;
    }
    setSupported(false);
    if (!subgraphUrl || !capability) return undefined;
    hasCapability(subgraphUrl, capability).then((ok) => {
      if (!cancelled) setSupported(Boolean(ok));
    });
    return () => {
      cancelled = true;
    };
  }, [subgraphUrl, capability]);

  return supported;
}

export default useSubgraphCapability;
