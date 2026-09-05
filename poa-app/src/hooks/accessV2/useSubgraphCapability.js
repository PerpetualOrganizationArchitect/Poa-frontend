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

function initialState(subgraphUrl, capability) {
  const seeded = peekCapability(subgraphUrl, capability);
  return {
    key: `${subgraphUrl || ''}|${capability?.id || ''}`,
    supported: seeded === true,
    loading: Boolean(subgraphUrl && capability && seeded === undefined),
  };
}

/** The boolean result plus whether the first capability probe is still unresolved. */
export function useSubgraphCapabilityState(subgraphUrl, capability) {
  const [state, setState] = useState(() => initialState(subgraphUrl, capability));
  const key = `${subgraphUrl || ''}|${capability?.id || ''}`;

  // State belongs to the endpoint that produced it. During an org/network switch the effect has
  // not run yet, so synchronously derive the new endpoint's safe state instead of permitting one
  // render (and potentially one query) with the previous endpoint's capability result.
  const current = state.key === key ? state : initialState(subgraphUrl, capability);

  useEffect(() => {
    let cancelled = false;
    const seed = peekCapability(subgraphUrl, capability);
    if (seed !== undefined) {
      setState({ key, supported: seed === true, loading: false });
      return undefined;
    }
    if (!subgraphUrl || !capability) {
      setState({ key, supported: false, loading: false });
      return undefined;
    }
    setState({ key, supported: false, loading: true });
    hasCapability(subgraphUrl, capability).then((ok) => {
      if (!cancelled) setState({ key, supported: Boolean(ok), loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [key, subgraphUrl, capability]);

  return { supported: current.supported, loading: current.loading };
}

export function useSubgraphCapability(subgraphUrl, capability) {
  return useSubgraphCapabilityState(subgraphUrl, capability).supported;
}

export default useSubgraphCapability;
