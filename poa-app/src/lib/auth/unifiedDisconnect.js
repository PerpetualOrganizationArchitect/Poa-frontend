/**
 * The one correct order for signing a Poa user out.
 *
 * Poa has two auth backends behind one AuthContext, so a wallet-only disconnect
 * is not a sign-out:
 *
 *   - AuthContext restores a stored passkey whenever wagmi reports "not
 *     connected". Disconnecting wagmi first therefore hands the user straight
 *     back a passkey session — the "Disconnect does nothing" report. `signOut()`
 *     must run first because it sets the suppression flag that effect reads.
 *   - wagmi's `disconnect()` with no argument drops only the *current*
 *     connector. With two live connections the second is promoted immediately
 *     and the UI still shows an address, so every connection is torn down.
 *
 * Kept as a plain function (no hooks) so the ordering is covered by a real
 * runtime test rather than only by reading the source.
 */
export function runUnifiedDisconnect({ signOut, disconnect, connections = [] } = {}) {
  const disconnected = [];

  signOut();

  const active = Array.isArray(connections) ? connections : [];
  if (active.length === 0) {
    // No connections reported (passkey-only session, or wagmi not yet hydrated).
    // Still ask wagmi to disconnect so a connector it knows about but has not
    // surfaced here is not left live.
    disconnect();
    return disconnected;
  }

  for (const connection of active) {
    const connector = connection?.connector;
    if (!connector) continue;
    disconnect({ connector });
    disconnected.push(connector);
  }

  // Every entry was malformed — fall back rather than silently doing nothing.
  if (disconnected.length === 0) disconnect();

  return disconnected;
}

export default runUnifiedDisconnect;
