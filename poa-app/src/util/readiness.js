/**
 * readiness.js
 * One place to turn "the app isn't ready to act" into the RIGHT user-facing
 * message. The bug this fixes: a passkey user who is actually signed in (but
 * whose services are still initializing) was told to "connect your wallet" —
 * dev-speak that's also wrong (passkey users have no wallet to connect), and it
 * looked like they'd been signed out when they hadn't.
 *
 * Pure module (no React) so the service layer, hooks, and components can share it.
 */

export const ReadyState = {
  READY: 'ready',
  SIGNED_OUT: 'signed-out',
  INITIALIZING: 'initializing',
  WRONG_CHAIN: 'wrong-chain',
};

// Canonical, user-facing copy. No Web3/provider/signer/bundler/UserOp jargon.
// Auth-method-neutral: "sign in", never "connect your wallet".
const READY_MESSAGES = {
  [ReadyState.SIGNED_OUT]: 'You appear to be signed out. Please sign in again to continue.',
  [ReadyState.INITIALIZING]: 'Still getting things ready — give it a moment, then try again.',
  [ReadyState.WRONG_CHAIN]: 'This organization is on {chainName}. Switch your wallet to {chainName} and try again.',
};

/**
 * Map a readyState to user-facing copy.
 * @param {string} readyState - one of ReadyState.*
 * @param {{ chainName?: string }} [opts] - chainName used for WRONG_CHAIN
 * @returns {string}
 */
export function getNotReadyMessage(readyState, { chainName } = {}) {
  if (readyState === ReadyState.WRONG_CHAIN) {
    return READY_MESSAGES[ReadyState.WRONG_CHAIN].split('{chainName}').join(chainName || 'the correct network');
  }
  return READY_MESSAGES[readyState] || READY_MESSAGES[ReadyState.INITIALIZING];
}
