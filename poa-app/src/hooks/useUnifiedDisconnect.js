/**
 * The wagmi bindings for Poa's one correct sign-out.
 *
 * Lives here rather than beside a single button because more than one surface
 * offers "Disconnect" (the shared account menu, and the connected-account badge
 * on /join). Each one that rolls its own `signOut()` + bare `disconnect()` pair
 * re-introduces the same two bugs: a stored passkey re-attaching, and a second
 * live connector being promoted so the UI still shows an address.
 *
 * The ordering and fan-out rules themselves are pure and live in
 * `lib/auth/unifiedDisconnect`, where they are covered by a runtime test.
 */

import { useCallback } from 'react';
import { useConnections, useDisconnect } from 'wagmi';
import { useAuth } from '@/context/AuthContext';
import { runUnifiedDisconnect } from '@/lib/auth/unifiedDisconnect';

export function useUnifiedDisconnect() {
  const { signOut } = useAuth();
  const { disconnect } = useDisconnect();
  const connections = useConnections();

  return useCallback(
    () => runUnifiedDisconnect({ signOut, disconnect, connections }),
    [connections, disconnect, signOut]
  );
}

export default useUnifiedDisconnect;
