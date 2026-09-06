import { describe, expect, it, vi } from 'vitest';
import { runUnifiedDisconnect } from './unifiedDisconnect';

function harness(connections = []) {
  const calls = [];
  const signOut = vi.fn(() => calls.push('signOut'));
  const disconnect = vi.fn((arg) => calls.push(arg?.connector ? `disconnect:${arg.connector.id}` : 'disconnect'));
  const result = runUnifiedDisconnect({ signOut, disconnect, connections });
  return { calls, signOut, disconnect, result };
}

const connection = (id) => ({ connector: { id } });

describe('runUnifiedDisconnect', () => {
  it('signs out of AuthContext before touching wagmi', () => {
    // The whole "Disconnect does nothing" bug: wagmi disconnecting first flips
    // eoaConnected, and AuthContext restores the stored passkey before signOut
    // has set its suppression flag.
    const { calls } = harness([connection('injected')]);
    expect(calls[0]).toBe('signOut');
    expect(calls.indexOf('signOut')).toBeLessThan(calls.findIndex((c) => c.startsWith('disconnect')));
  });

  it('tears down every active connection, not just the current one', () => {
    const { calls, disconnect, result } = harness([
      connection('injected'),
      connection('walletConnect'),
      connection('coinbase'),
    ]);
    expect(disconnect).toHaveBeenCalledTimes(3);
    expect(calls).toEqual([
      'signOut',
      'disconnect:injected',
      'disconnect:walletConnect',
      'disconnect:coinbase',
    ]);
    expect(result.map((c) => c.id)).toEqual(['injected', 'walletConnect', 'coinbase']);
  });

  it('still calls a bare disconnect when wagmi reports no connections', () => {
    // Passkey-only session, or wagmi not hydrated yet — a connector it knows
    // about must not be left live.
    for (const connections of [[], undefined, null, 'not-an-array']) {
      const { calls } = harness(connections);
      expect(calls).toEqual(['signOut', 'disconnect']);
    }
  });

  it('falls back to a bare disconnect when every entry is malformed', () => {
    const { calls } = harness([{}, { connector: null }]);
    expect(calls).toEqual(['signOut', 'disconnect']);
  });

  it('skips malformed entries but still disconnects the real ones', () => {
    const { calls } = harness([{ connector: null }, connection('injected')]);
    expect(calls).toEqual(['signOut', 'disconnect:injected']);
  });
});
