/**
 * Resolve a legacy Role entity to a human-readable name.
 *
 * Legacy role metadata has two indexed views:
 *   - Role.name, populated when the role is first created; and
 *   - Hat.name / Hat.metadata.name, populated by the latest metadata event/IPFS document.
 *
 * Hats `details` doubles as metadata storage. When a role is created and its metadata is updated in
 * the same transaction, Role.name can therefore contain the metadata CID while the linked Hat has
 * the real name. Keep that compatibility repair in one pure resolver instead of teaching every
 * role surface about the indexing detail.
 */

const BYTES32_HEX = /^0x[0-9a-f]{64}$/i;
const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
// Match the migration boundary: a base32 multibase CID starts with `b` and is
// at least 50 characters. Do not assume one codec-specific `baf…` prefix.
const CID_V1_BASE32 = /^b[a-z2-7]{49,}$/i;
const METADATA_URI = /^(?:(?:ipfs|ipns|https?|ar):\/\/|data:)/i;

function cleanName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** True when a value is a content pointer, not a role's display name. */
export function isRoleMetadataReference(value, metadataCID = null) {
  const candidate = cleanName(value);
  if (!candidate) return false;

  const linkedCID = cleanName(metadataCID);
  if (linkedCID && candidate.toLowerCase() === linkedCID.toLowerCase()) return true;

  return (
    BYTES32_HEX.test(candidate) ||
    METADATA_URI.test(candidate) ||
    CID_V0.test(candidate) ||
    CID_V1_BASE32.test(candidate)
  );
}

function readableName(value, metadataCID) {
  const candidate = cleanName(value);
  return candidate && !isRoleMetadataReference(candidate, metadataCID) ? candidate : '';
}

/**
 * Prefer the linked Hat/IPFS name, which follows metadata updates, then fall back to Role.name.
 * Opaque metadata references are never returned as user-facing names.
 *
 * @param {object} role - Legacy subgraph Role, optionally with its linked Hat and HatMetadata.
 * @param {object} options
 * @param {string} [options.ipfsName] - Name from a separately fetched IPFS metadata map.
 * @param {string} [options.fallback='Unnamed Role'] - Honest display fallback.
 */
export function resolveLegacyRoleName(
  role,
  { ipfsName = '', fallback = 'Unnamed Role' } = {},
) {
  const metadataCID = role?.hat?.metadataCID || role?.metadataCID || null;
  const candidates = [
    role?.hat?.metadata?.name,
    ipfsName,
    role?.hat?.name,
    role?.name,
  ];

  for (const candidate of candidates) {
    const readable = readableName(candidate, metadataCID);
    if (readable) return readable;
  }

  return cleanName(fallback) || 'Unnamed Role';
}
