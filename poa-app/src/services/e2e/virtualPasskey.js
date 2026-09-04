/**
 * Virtual passkey software signer.
 *
 * Produces real, on-chain-valid WebAuthn assertions without invoking
 * navigator.credentials. The signed bytes round-trip through the same parser
 * as a real assertion (passkeySign.js → PasskeyAccount.validateUserOp →
 * WebAuthnLib): the verifier checks that (r,s) is a valid P-256 signature over
 * sha256(authenticatorData ‖ sha256(clientDataJSON)) and that the challenge
 * appears in clientDataJSON at challengeIndex.
 *
 * Derivation MUST match scripts/e2e/setup-machine.js byte-for-byte; the script
 * uses the resulting smart-account address to print the vouch URL.
 */

import { sha256 } from '@noble/hashes/sha256';
import { p256 } from '@noble/curves/p256';
import { keccak256, encodePacked, pad, toHex, bytesToHex, toBytes, hexToBytes } from 'viem';
import { E2E_PASSKEY_SEED } from './e2eMode';

function utf8(s) {
  return new TextEncoder().encode(s);
}

function concat(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function base64url(bytes) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deriveSeedBytes() {
  if (!E2E_PASSKEY_SEED) throw new Error('E2E_PASSKEY_SEED missing');
  return hexToBytes(E2E_PASSKEY_SEED.startsWith('0x') ? E2E_PASSKEY_SEED : '0x' + E2E_PASSKEY_SEED);
}

let cached = null;

/**
 * Derive the deterministic virtual credential. Idempotent + memoized.
 * Result shape matches what createPasskeyCredential() returns.
 */
export function getVirtualPasskeyCredential() {
  if (cached) return cached;

  const seed = deriveSeedBytes();

  const rawIdBytes = sha256(concat(seed, utf8('poa-virtual-credential-id-v1')));
  const rawCredentialId = base64url(rawIdBytes);
  const credentialId = keccak256(rawIdBytes);

  const privKey = sha256(concat(seed, utf8('poa-virtual-passkey-priv-v1')));
  // p256 public key in uncompressed form (65 bytes: 0x04 || X(32) || Y(32))
  const pub = p256.getPublicKey(privKey, false);
  const x = pad(toHex(pub.slice(1, 33)), { size: 32 });
  const y = pad(toHex(pub.slice(33, 65)), { size: 32 });

  const salt = BigInt(keccak256(encodePacked(['bytes32', 'string'], [credentialId, 'poa-salt-v1'])));

  cached = {
    credentialId,
    publicKeyX: x,
    publicKeyY: y,
    rawCredentialId,
    salt,
    privateKey: bytesToHex(privKey),
    rawIdBytes,
  };
  return cached;
}

/**
 * Drop-in replacement for getWebAuthnAssertion() in passkeySign.js.
 *
 * Returns the same shape: { authenticatorData, clientDataJSON, challengeIndex,
 * typeIndex, r, s, rawId }.
 */
export function signVirtualAssertion(challengeHashHex) {
  const cred = getVirtualPasskeyCredential();

  // 1. Build clientDataJSON (strict ASCII — findFieldIndex is byte-indexed).
  // signVirtualAssertion only runs in the browser (it's invoked from
  // passkeySign.getWebAuthnAssertion), so window is always defined here.
  const challengeBytes = toBytes(challengeHashHex);
  const challengeB64 = base64url(challengeBytes);
  const clientDataJSONStr = `{"type":"webauthn.get","challenge":"${challengeB64}","origin":"${window.location.origin}","crossOrigin":false}`;
  const clientDataJSON = utf8(clientDataJSONStr);

  // 2. Build authenticatorData: rpIdHash(32) || flags(1) || counter(4)
  // flags = 0x05 (UP=0x01 | UV=0x04). Required by userVerification: 'required'.
  // counter = current Unix seconds: PasskeyAccount enforces strictly-increasing
  // signCount via `verifyWithSignCount`: once any prior sig stored signCount>0,
  // both `newSignCount==0` AND `newSignCount<=last` are rejected. A stateless
  // virtual signer can't track increments across reloads, so we use
  // floor(Date.now()/1000) — fits in uint32 until 2106, monotonically
  // increasing across all calls (assuming we don't sign more than once per
  // second), and always greater than any plausible stored signCount.
  const rpIdHash = sha256(utf8(window.location.hostname));
  const flags = new Uint8Array([0x05]);
  const signCount = Math.floor(Date.now() / 1000);
  const counter = new Uint8Array([
    (signCount >>> 24) & 0xff,
    (signCount >>> 16) & 0xff,
    (signCount >>> 8) & 0xff,
    signCount & 0xff,
  ]);
  const authenticatorData = concat(rpIdHash, flags, counter);

  // 3. Sign sha256(authData || sha256(clientDataJSON)) with P-256.
  const clientDataHash = sha256(clientDataJSON);
  const signedHash = sha256(concat(authenticatorData, clientDataHash));

  // p256.sign normalizes to low-s by default; matches passkeySign.js parseDERSignature behavior.
  // cred.privateKey is already 0x-prefixed (bytesToHex output) — do not double-prefix.
  const sig = p256.sign(signedHash, hexToBytes(cred.privateKey), { lowS: true });
  const r = '0x' + sig.r.toString(16).padStart(64, '0');
  const s = '0x' + sig.s.toString(16).padStart(64, '0');

  // 4. Compute byte indices into clientDataJSON for the verifier.
  const findIndex = (str, fieldName) => {
    const idx = str.indexOf(`"${fieldName}":"`);
    if (idx === -1) throw new Error(`virtualPasskey: cannot find "${fieldName}" in clientDataJSON`);
    return idx + fieldName.length + 4;
  };

  return {
    authenticatorData,
    clientDataJSON,
    challengeIndex: findIndex(clientDataJSONStr, 'challenge'),
    typeIndex: findIndex(clientDataJSONStr, 'type'),
    r: BigInt(r),
    s: BigInt(s),
    rawId: cred.rawCredentialId,
  };
}
