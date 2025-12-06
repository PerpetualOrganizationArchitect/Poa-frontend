/**
 * Encoding Utilities
 * Helper functions for encoding/decoding blockchain data
 */

import { ethers } from 'ethers';
import bs58 from 'bs58';

/**
 * Convert a string to UTF-8 bytes
 * @param {string} str - String to convert
 * @returns {Uint8Array} UTF-8 encoded bytes
 */
export function stringToBytes(str) {
  return ethers.utils.toUtf8Bytes(str);
}

/**
 * Convert bytes to string
 * @param {Uint8Array} bytes - Bytes to decode
 * @returns {string} Decoded string
 */
export function bytesToString(bytes) {
  return ethers.utils.toUtf8String(bytes);
}

/**
 * Convert a string to its keccak256 hash (bytes32)
 * Used for descriptions, submissions, etc.
 * @param {string} str - String to hash
 * @returns {string} Keccak256 hash as hex string
 */
export function stringToBytes32(str) {
  if (!str) return ethers.constants.HashZero;
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(str));
}

/**
 * Encode IPFS CIDv0 (Qm...) to bytes32
 *
 * CIDv0 = base58(0x1220 + 32-byte-sha256-hash)
 * We store just the 32-byte hash portion, which fits in bytes32
 *
 * @param {string} cid - IPFS CIDv0 string
 * @returns {string} bytes32 hex string
 */
export function ipfsCidToBytes32(cid) {
  if (!cid || cid === '') return ethers.constants.HashZero;

  try {
    // Decode base58 CID, skip 2-byte multihash prefix (0x12 0x20), get 32-byte hash
    const decoded = bs58.decode(cid);
    const hashBytes = decoded.slice(2); // Skip the 0x12 0x20 prefix
    return ethers.utils.hexlify(hashBytes);
  } catch (error) {
    console.warn('Failed to encode IPFS CID to bytes32:', error);
    return ethers.constants.HashZero;
  }
}

/**
 * Decode bytes32 back to IPFS CIDv0
 *
 * @param {string} bytes32Hash - bytes32 hex string
 * @returns {string|null} IPFS CIDv0 string or null if invalid
 */
export function bytes32ToIpfsCid(bytes32Hash) {
  if (!bytes32Hash || bytes32Hash === ethers.constants.HashZero) return null;

  try {
    // Prepend multihash prefix (0x1220 = sha2-256, 32 bytes)
    const hashBytes = ethers.utils.arrayify(bytes32Hash);
    const withPrefix = new Uint8Array([0x12, 0x20, ...hashBytes]);
    return bs58.encode(withPrefix);
  } catch (error) {
    console.warn('Failed to decode bytes32 to IPFS CID:', error);
    return null;
  }
}

/**
 * Parse a task ID from subgraph format
 *
 * Subgraph may return IDs like "orgId-taskId"
 * Contract expects just the numeric taskId
 *
 * @param {string|number} taskId - Task ID (possibly prefixed)
 * @returns {string} Parsed task ID
 */
export function parseTaskId(taskId) {
  const taskIdStr = taskId.toString();
  return taskIdStr.includes('-') ? taskIdStr.split('-')[1] : taskIdStr;
}

/**
 * Parse a module ID from subgraph format
 * @param {string|number} moduleId - Module ID (possibly prefixed)
 * @returns {string} Parsed module ID
 */
export function parseModuleId(moduleId) {
  const moduleIdStr = moduleId.toString();
  return moduleIdStr.includes('-') ? moduleIdStr.split('-')[1] : moduleIdStr;
}

/**
 * Parse a project ID from subgraph format or string
 *
 * @param {string} projectId - Project ID
 * @returns {string} bytes32 project ID
 */
export function parseProjectId(projectId) {
  if (!projectId) return ethers.constants.HashZero;

  // If already a bytes32 hex string, return as-is
  if (projectId.startsWith('0x') && projectId.length === 66) {
    return projectId;
  }

  // If it's a string name, hash it
  return stringToBytes32(projectId);
}

/**
 * Format an address for display (shortened)
 * @param {string} address - Full address
 * @param {number} [chars=4] - Characters to show on each side
 * @returns {string} Formatted address (e.g., "0x1234...5678")
 */
export function formatAddress(address, chars = 4) {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Check if a string is a valid Ethereum address
 * @param {string} address - Address to check
 * @returns {boolean} True if valid
 */
export function isValidAddress(address) {
  return ethers.utils.isAddress(address);
}

/**
 * Get checksum address
 * @param {string} address - Address to checksum
 * @returns {string} Checksummed address
 */
export function toChecksumAddress(address) {
  return ethers.utils.getAddress(address);
}
