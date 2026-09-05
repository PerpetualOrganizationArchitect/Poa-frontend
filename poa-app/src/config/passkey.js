/**
 * Passkey & ERC-4337 Configuration
 */

import { DEFAULT_CHAIN_ID } from './networks';

// ERC-4337 EntryPoint v0.7 (same on all chains)
export const ENTRY_POINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

// Pimlico bundler endpoint — configured per chain via env var
export const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || '';

let didWarnAboutMissingPimlicoKey = false;

export function getBundlerUrl(chainId = DEFAULT_CHAIN_ID) {
  if (!PIMLICO_API_KEY && typeof window !== 'undefined' && !didWarnAboutMissingPimlicoKey) {
    console.warn('NEXT_PUBLIC_PIMLICO_API_KEY not set — bundler calls will fail');
    didWarnAboutMissingPimlicoKey = true;
  }
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${PIMLICO_API_KEY}`;
}

// WebAuthn Relying Party configuration
export const WEBAUTHN_RP_NAME = 'Perpetual Organization Architect';

// Fixed RP ID scoped to the registrable domain so passkeys created on www.poa.box
// (or any subdomain) can later be used on custom domains via Related Origin Requests.
// See https://w3c.github.io/webauthn/#sctn-related-origins
export const WEBAUTHN_RP_ID = 'poa.box';

// Custom domains whose WebAuthn operations should use WEBAUTHN_RP_ID via Related
// Origin Requests. Each host listed here MUST also appear in the `origins` array
// of poa-app/public/.well-known/webauthn — browsers fetch that file from
// https://poa.box/.well-known/webauthn to authorize the cross-origin RP ID.
export const RELATED_ORIGIN_HOSTS = new Set([
  'dao.kublockchain.com',
  'poa.earth',
  'www.poa.earth',
]);

/**
 * Return the RP ID to use for WebAuthn operations.
 *
 * Uses WEBAUTHN_RP_ID when the current hostname is (or is a subdomain of) that
 * domain — this is the WebAuthn "registrable domain suffix" rule — or when it
 * is a registered related-origin host. Falls back to the raw hostname otherwise
 * (e.g. localhost during development).
 */
export function getWebAuthnRpId() {
  const hostname = window.location.hostname;
  if (hostname === WEBAUTHN_RP_ID || hostname.endsWith('.' + WEBAUTHN_RP_ID)) {
    return WEBAUTHN_RP_ID;
  }
  if (RELATED_ORIGIN_HOSTS.has(hostname)) {
    return WEBAUTHN_RP_ID;
  }
  return hostname;
}

// Gas estimation buffer percentage (applied on top of bundler estimates)
export const GAS_BUFFER_PERCENT = 10n;

// Maximum total gas per UserOp — Pimlico bundler rejects ops above 15M.
// Leave headroom for bundler-side overhead calculations.
export const MAX_USEROP_GAS = 14_500_000n;
