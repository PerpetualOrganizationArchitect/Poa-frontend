/**
 * AuthContext
 * Unified authentication state for EOA (RainbowKit) and Passkey (ERC-4337) users.
 *
 * Provides:
 * - authType: 'eoa' | 'passkey' | null
 * - accountAddress: The active account address (EOA or smart account)
 * - isAuthenticated: Whether any auth method is active
 * - passkeyState: Credential info for passkey users
 * - connectPasskey(): Reconnect a returning passkey user
 * - activatePasskey(): Save + activate a new passkey credential
 * - disconnectPasskey(): Clear passkey session (allows auto-restore on reload)
 * - signOut(): Clear passkey + suppress auto-restore for the rest of the tab
 *   session. Caller should also invoke wagmi's disconnect() for EOA users.
 * - publicClient: viem public client (shared)
 * - bundlerClient: Pimlico bundler client (shared)
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { createPublicClient, http, defineChain } from 'viem';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { getBundlerUrl, ENTRY_POINT_ADDRESS } from '../config/passkey';
import { NETWORKS, DEFAULT_NETWORK } from '../config/networks';
import {
  getLastUsedCredential,
  hasStoredCredentials,
  savePasskeyCredential,
  clearAllCredentials,
} from '../services/web3/passkey/passkeyStorage';
import { discoverPasskeyCredential } from '../services/web3/passkey/passkeyDiscover';
import { E2E_ENABLED, E2E_AS } from '../services/e2e/e2eMode';
import {
  ensureVirtualPasskeyPendingSeeded,
  ensureVirtualPasskeyActivated,
} from '../services/e2e/seedVirtualPasskey';

const AuthContext = createContext();
const EXPLICIT_SIGN_OUT_KEY = 'poa:explicit-sign-out';

function readExplicitSignOut() {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(EXPLICIT_SIGN_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeExplicitSignOut(signedOut) {
  if (typeof window === 'undefined') return;
  try {
    if (signedOut) window.sessionStorage.setItem(EXPLICIT_SIGN_OUT_KEY, '1');
    else window.sessionStorage.removeItem(EXPLICIT_SIGN_OUT_KEY);
  } catch {
    // Some privacy modes disable storage. The in-memory ref still protects the
    // current app session in that case.
  }
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};

// Build a viem chain object from our network config
const networkConfig = NETWORKS[DEFAULT_NETWORK];
const defaultChain = defineChain({
  id: networkConfig.chainId,
  name: networkConfig.name,
  nativeCurrency: networkConfig.nativeCurrency,
  rpcUrls: {
    default: { http: [networkConfig.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: networkConfig.blockExplorer },
  },
});

export const AuthProvider = ({ children }) => {
  const { address: eoaAddress, isConnected: eoaConnected, status: eoaStatus } = useAccount();

  // Passkey state
  const [passkeyState, setPasskeyState] = useState(null);
  const [passkeyConnecting, setPasskeyConnecting] = useState(false);
  // False until the mount-time restore below has finished. Consumers must not
  // read `isAuthenticated: false` as "signed out" before this flips, or a
  // reload of an authenticated page flashes a disconnected screen.
  const [passkeyRestoreSettled, setPasskeyRestoreSettled] = useState(false);

  // Suppresses passkey auto-restore for the rest of the tab session after an
  // explicit signOut(). Without this, disconnecting an EOA wallet while a
  // passkey credential is stored would silently flip the user back to passkey.
  // Seeded from sessionStorage so the suppression survives a reload in the same
  // tab; seeded lazily because a `useRef(read())` argument is evaluated on every
  // render of this top-level provider, not just the first.
  const explicitSignOutRef = useRef(null);
  if (explicitSignOutRef.current === null) {
    explicitSignOutRef.current = readExplicitSignOut();
  }

  // Derived auth type
  const authType = useMemo(() => {
    if (eoaConnected && eoaAddress) return 'eoa';
    if (passkeyState) return 'passkey';
    return null;
  }, [passkeyState, eoaConnected, eoaAddress]);

  // Unified account address
  const accountAddress = useMemo(() => {
    if (authType === 'eoa') return eoaAddress;
    if (authType === 'passkey') return passkeyState.accountAddress;
    return null;
  }, [authType, passkeyState, eoaAddress]);

  const isAuthenticated = authType !== null;

  // True once both auth backends have finished restoring a previous session:
  // wagmi's auto-reconnect and the stored-passkey lookup. `isAuthenticated`
  // is only meaningful as "signed out" after this is true.
  const isAuthHydrated =
    passkeyRestoreSettled && eoaStatus !== 'reconnecting' && eoaStatus !== 'connecting';

  // Create viem public client (shared, stateless)
  // Uses a standard RPC endpoint for eth_call, eth_getCode, etc.
  // (Pimlico bundler only supports ERC-4337 methods, not standard JSON-RPC.)
  const publicClient = useMemo(() => createPublicClient({
    chain: defaultChain,
    transport: http(networkConfig.rpcUrl),
  }), []);

  // Create Pimlico bundler client
  const bundlerClient = useMemo(() => {
    const bundlerUrl = getBundlerUrl(networkConfig.chainId);
    return createPimlicoClient({
      chain: defaultChain,
      transport: http(bundlerUrl),
      entryPoint: {
        address: ENTRY_POINT_ADDRESS,
        version: '0.7',
      },
    });
  }, []);

  // Auto-reconnect: on mount, check for stored passkey credential.
  // In E2E mode, seed the pending credential for the target org so the
  // /join page enters the same vouch-first onboarding flow real users hit.
  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR guard

    // Every path out of this effect must settle hydration exactly once.
    // Consumers gate their "you are signed out" UI on it, so a path that leaves
    // it false is an infinite loading state. The `settled` latch lets any path
    // call settle() without a fragile "I am the only async path" assumption:
    // an async restore settles in its own .finally, the synchronous fall-through
    // settles at the bottom, and a double-call is a harmless no-op.
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setPasskeyRestoreSettled(true);
    };

    if (explicitSignOutRef.current || eoaConnected) {
      settle();
      return;
    }

    // When an async restore owns the settle(), the synchronous fall-through
    // below must NOT settle first — hydration would flip before the restore
    // resolves. A new async branch only needs to set this and add .finally(settle).
    let asyncSettlePending = false;

    if (E2E_ENABLED) {
      // In passkey mode, restore the deployed virtual passkey before falling
      // back to the pending/onboarding flow — otherwise a fresh tab can't act
      // as the already-deployed E2E identity.
      if (E2E_AS === 'passkey') {
        asyncSettlePending = true;
        ensureVirtualPasskeyActivated().then((cred) => {
          if (cred && !explicitSignOutRef.current) setPasskeyState(cred);
        }).catch(() => { /* logged inside activator */ })
          .finally(settle);
      }
      ensureVirtualPasskeyPendingSeeded().catch(() => { /* logged inside seeder */ });
    }

    if (hasStoredCredentials()) {
      const lastCred = getLastUsedCredential();
      if (lastCred) setPasskeyState(lastCred);
    }

    // Synchronous paths settle here; async restores settle in their .finally.
    if (!asyncSettlePending) settle();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If EOA connects, passkey deactivates (EOA takes priority).
  // A fresh wallet connect is also an opt-in, so clear any prior signOut flag.
  useEffect(() => {
    if (eoaConnected) {
      explicitSignOutRef.current = false;
      writeExplicitSignOut(false);
      if (passkeyState) setPasskeyState(null);
    }
  }, [eoaConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // If EOA disconnects and we have stored passkey, restore it
  useEffect(() => {
    if (explicitSignOutRef.current) return;
    if (!eoaConnected && !passkeyState && typeof window !== 'undefined' && hasStoredCredentials()) {
      const lastCred = getLastUsedCredential();
      if (lastCred) {
        setPasskeyState(lastCred);
      }
    }
  }, [eoaConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Connect a returning passkey user.
   * 1. Try stored credentials from localStorage (instant).
   * 2. If none stored, trigger WebAuthn discoverable auth and look up account from subgraph.
   */
  const connectPasskey = useCallback(async (credential = null) => {
    setPasskeyConnecting(true);
    try {
      // Fast path: use provided credential or localStorage
      const storedCred = credential || getLastUsedCredential();
      if (storedCred) {
        explicitSignOutRef.current = false;
        writeExplicitSignOut(false);
        setPasskeyState(storedCred);
        return storedCred;
      }

      // Slow path: WebAuthn discoverable authentication + subgraph lookup
      const discovered = await discoverPasskeyCredential();

      // Save to localStorage for future fast reconnects
      savePasskeyCredential(discovered);
      explicitSignOutRef.current = false;
      writeExplicitSignOut(false);
      setPasskeyState(discovered);
      return discovered;
    } finally {
      setPasskeyConnecting(false);
    }
  }, []);

  /**
   * Save and activate a new passkey credential (after onboarding).
   */
  const activatePasskey = useCallback((credentialData) => {
    explicitSignOutRef.current = false;
    writeExplicitSignOut(false);
    savePasskeyCredential(credentialData);
    setPasskeyState(credentialData);
  }, []);

  /**
   * Disconnect passkey session (keeps stored credential for re-authentication).
   */
  const disconnectPasskey = useCallback(() => {
    setPasskeyState(null);
  }, []);

  /**
   * Fully sign out for the current tab session: clears passkey state and
   * suppresses auto-restore so a stored credential won't silently re-attach
   * after a wallet disconnect. Caller should also invoke wagmi's disconnect()
   * for EOA users. The flag resets on wallet reconnect or explicit
   * connectPasskey/activatePasskey.
   */
  const signOut = useCallback(() => {
    explicitSignOutRef.current = true;
    writeExplicitSignOut(true);
    setPasskeyState(null);
  }, []);

  /**
   * Forget the passkey on this device: clears the cached credential(s) AND suppresses auto-restore,
   * so the app returns to a genuinely signed-out state (survives reload) and a NEW account can be
   * created. Unlike disconnectPasskey()/signOut(), which leave the stored credential and let the
   * auto-restore effects silently re-attach it. Non-destructive to the authenticator — the user can
   * re-attach via "Sign in with passkey" (discoverable WebAuthn).
   */
  const forgetPasskey = useCallback(() => {
    explicitSignOutRef.current = true;
    writeExplicitSignOut(true);
    clearAllCredentials();
    setPasskeyState(null);
  }, []);

  const hasStoredPasskey = typeof window !== 'undefined' ? hasStoredCredentials() : false;

  const value = useMemo(() => ({
    // Auth state
    authType,
    accountAddress,
    isAuthenticated,
    isAuthHydrated,
    isPasskeyUser: authType === 'passkey',
    isEOAUser: authType === 'eoa',

    // Passkey-specific
    passkeyState,
    passkeyConnecting,
    connectPasskey,
    activatePasskey,
    disconnectPasskey,
    signOut,
    forgetPasskey,
    hasStoredPasskey,

    // Shared infrastructure
    publicClient,
    bundlerClient,
  }), [authType, accountAddress, isAuthenticated, isAuthHydrated, passkeyState, passkeyConnecting, connectPasskey, activatePasskey, disconnectPasskey, signOut, forgetPasskey, hasStoredPasskey, publicClient, bundlerClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
