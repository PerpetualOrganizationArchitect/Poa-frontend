/**
 * passkeyStorage.js
 * Persist passkey credential data in localStorage for returning users.
 */

const STORAGE_KEY = 'poa-passkey-credentials';
const PENDING_STORAGE_KEY = 'poa-passkey-pending';

/**
 * Save passkey credential after successful onboarding.
 * @param {Object} data
 * @param {string} data.credentialId - bytes32 hex
 * @param {string} data.rawCredentialId - base64url (needed for WebAuthn allowCredentials)
 * @param {string} data.publicKeyX - bytes32 hex
 * @param {string} data.publicKeyY - bytes32 hex
 * @param {string} data.accountAddress - Deployed smart account address
 * @param {string} data.salt - uint256 hex string
 */
export function savePasskeyCredential(data) {
  const existing = getAllCredentials();
  existing[data.accountAddress.toLowerCase()] = {
    ...data,
    savedAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

/**
 * Get all saved passkey credentials.
 * @returns {Object} Map of accountAddress -> credential data
 */
export function getAllCredentials() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Get the most recently saved credential (for auto-reconnect).
 * @returns {Object|null} Most recent credential or null
 */
export function getLastUsedCredential() {
  const all = getAllCredentials();
  const entries = Object.values(all);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
}

/**
 * Remove a saved credential.
 * @param {string} accountAddress
 */
export function removeCredential(accountAddress) {
  const existing = getAllCredentials();
  delete existing[accountAddress.toLowerCase()];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

/**
 * Remove ALL saved passkey credentials — a full local "forget this device" sign-out.
 * Non-destructive to the authenticator: the passkey still lives in the device/hardware, so the
 * user can re-attach later via discoverable WebAuthn ("Sign in with passkey"). This only drops the
 * cached credential pointers that drive auto-restore, so a signed-out state actually sticks.
 */
export function clearAllCredentials() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if any passkey credentials are saved.
 * @returns {boolean}
 */
export function hasStoredCredentials() {
  return Object.keys(getAllCredentials()).length > 0;
}

// ── Pending (pre-deployment) credential storage ──

function getAllPendingCredentials() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Save a pending passkey credential (created but not yet deployed).
 * Keyed by orgName so each org has its own pending state.
 */
export function savePendingCredential(data) {
  const existing = getAllPendingCredentials();
  existing[data.orgName.toLowerCase()] = {
    ...data,
    savedAt: Date.now(),
  };
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(existing));
}

/**
 * Get pending credential for a specific org.
 * @param {string} orgName
 * @returns {Object|null}
 */
export function getPendingCredentialForOrg(orgName) {
  if (!orgName) return null;
  return getAllPendingCredentials()[orgName.toLowerCase()] || null;
}

/**
 * Find a pending credential by its credentialId (for sign-in with undeployed accounts).
 * @param {string} credentialId - bytes32 hex
 * @returns {Object|null}
 */
export function findPendingCredentialByCredentialId(credentialId) {
  if (!credentialId) return null;
  const all = getAllPendingCredentials();
  const lowered = credentialId.toLowerCase();
  for (const entry of Object.values(all)) {
    if (entry.credentialId?.toLowerCase() === lowered) {
      return entry;
    }
  }
  return null;
}

/**
 * Remove a pending credential after successful deployment.
 * @param {string} accountAddress
 */
export function removePendingCredential(accountAddress) {
  if (!accountAddress) return;
  const existing = getAllPendingCredentials();
  const lowered = accountAddress.toLowerCase();
  // Remove by matching accountAddress across all orgs
  for (const key of Object.keys(existing)) {
    if (existing[key].accountAddress?.toLowerCase() === lowered) {
      delete existing[key];
    }
  }
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(existing));
}
