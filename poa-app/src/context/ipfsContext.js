import { createContext, useContext, useMemo, useCallback, useRef } from 'react';
import { IPFSError, IPFSErrorCode, IPFSOperation } from '@/lib/errors';
import { hybridFetchBytes } from '@/lib/ipfs/hybridFetch';
import { bytes32ToIpfsCid, ipfsCidToBytes32 } from '@/services/web3/utils/encoding';

// Lazy-loaded singleton — keeps ipfs-http-client (~600 KB) out of the root
// bundle. Only resolved on the first non-binary upload. Binary uploads use
// direct fetch + FormData and never touch this client.
let ipfsClientPromise = null;
function getIpfsClient() {
  if (!ipfsClientPromise) {
    ipfsClientPromise = import('ipfs-http-client').then(({ create }) => create({
      host: 'api.thegraph.com',
      port: 443,
      protocol: 'https',
      apiPath: '/ipfs/api/v0',
    }));
  }
  return ipfsClientPromise;
}

const IPFScontext = createContext();

export const useIPFScontext = () => {
    return useContext(IPFScontext);
};

/**
 * Validate IPFS CID format
 * @param {string} hash - IPFS hash to validate
 * @returns {boolean} True if valid CID format
 */
function isValidIpfsCid(hash) {
    if (!hash || typeof hash !== 'string') return false;
    // Skip if it's a hex bytes value from POP subgraph (starts with 0x)
    if (hash.startsWith('0x')) return false;
    // Valid CIDs start with Qm (v0) or ba (v1)
    return hash.startsWith('Qm') || hash.startsWith('ba');
}

/**
 * Check if a hash is a zero/empty bytes32 value
 * @param {string} hash - Hash to check
 * @returns {boolean} True if it's an empty/zero hash
 */
function isZeroHash(hash) {
    if (!hash) return true;
    // Check for common zero hash formats
    if (hash === '0x0' || hash === '0x') return true;
    // Check for full zero bytes32
    if (hash.startsWith('0x') && /^0x0+$/.test(hash)) return true;
    return false;
}

/**
 * Convert any hash format to a valid IPFS CID
 * Handles: CIDv0 (Qm...), CIDv1 (ba...), bytes32 (0x...)
 * @param {string} hash - Hash in any supported format
 * @returns {string|null} Valid CID or null if conversion fails
 */
function normalizeToIpfsCid(hash) {
    if (!hash) return null;

    // If already a valid CID, return as-is
    if (isValidIpfsCid(hash)) return hash;

    // If it's a bytes32 hex string, convert to CID
    if (hash.startsWith('0x')) {
        const cid = bytes32ToIpfsCid(hash);
        if (cid) {
            return cid;
        }
        console.warn('Failed to convert bytes32 to CID:', hash);
        return null;
    }

    // Unknown format
    console.warn('Unknown IPFS hash format:', hash);
    return hash;
}

/**
 * The Graph's free IPFS endpoint sits behind Cloudflare, which returns a 1015 ("rate limited" /
 * "access denied") WAF page under rapid back-to-back uploads. That needs a far longer cooldown than a
 * normal transient error (a ~45s wait was observed to be borderline), so we detect it and back off hard.
 */
function isRateLimited(error) {
    return /\b1015\b|\b429\b|rate.?limit|too many requests|access denied/i.test(String(error?.message || ''));
}

/**
 * Read-back-after-write: confirm a freshly-added CID is actually retrievable from the cat endpoint and
 * that its byte length matches what we uploaded. Closes the propagation-lag window where a member claims
 * right after an admin stages and gets a null allowlist. A short timeout keeps a stalled cat from hanging
 * the upload. Retried by `verifyRetrievable` with a RE-CAT only — it never re-runs the (already-successful)
 * upload, so a flaky read-back can't trigger duplicate re-uploads.
 */
async function assertCatchable(cid, content, isBinary) {
    const res = await fetch(`https://api.thegraph.com/ipfs/api/v0/cat?arg=${cid}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
        throw new Error(`IPFS content not yet retrievable (cat ${cid} -> HTTP ${res.status})`);
    }
    const back = new Uint8Array(await res.arrayBuffer());
    const expectedLen = isBinary
        ? (typeof content.size === 'number' ? content.size : null)
        : new TextEncoder().encode(content).length;
    if (expectedLen != null && back.length !== expectedLen) {
        throw new Error(`IPFS read-back size mismatch for ${cid}: got ${back.length}, expected ${expectedLen}`);
    }
}

/**
 * Verify a freshly-added CID is retrievable, retrying the READ-BACK ONLY (re-cat, never re-upload) so a
 * transient cat 504/1015 can't re-fire the expensive add() across every upload flow in the app. Throws
 * once read-back attempts are exhausted — fail closed rather than hand back a CID a member can't load.
 */
async function verifyRetrievable(cid, content, isBinary, attempts = 4) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            await assertCatchable(cid, content, isBinary);
            return;
        } catch (error) {
            lastError = error;
            if (i < attempts - 1) {
                const base = isRateLimited(error) ? 15000 : 1500;
                const delay = base * Math.pow(2, i) + Math.floor(Math.random() * 1000);
                console.log(`IPFS read-back not ready, re-checking in ${delay}ms...`, error.message);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

/**
 * Simple retry utility with exponential backoff (+ jitter), with a longer cooldown for rate-limits.
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise} Result of the function
 */
async function withRetry(fn, maxRetries = 4, baseDelay = 1500) {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry on validation errors
            if (error instanceof IPFSError && error.code === IPFSErrorCode.INVALID_CID) {
                throw error;
            }

            // Don't retry on the last attempt
            if (attempt < maxRetries - 1) {
                // Cloudflare 1015 needs a much longer cooldown than a normal transient blip.
                const base = isRateLimited(error) ? Math.max(baseDelay, 15000) : baseDelay;
                const delay = base * Math.pow(2, attempt) + Math.floor(Math.random() * 1000);
                console.log(`IPFS operation failed, retrying in ${delay}ms...`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

export const IPFSprovider = ({ children }) => {
    // Per-session caches keyed by CID. IPFS content is immutable by CID, so
    // these are safe to hold for the lifetime of the page — a re-mounted
    // component (org switch, navigation between Home and Dashboard, etc.)
    // gets its image / metadata back synchronously instead of triggering a
    // fresh fetch + Blob construction + new object URL on every mount.
    //
    // We deliberately cache the resolved Promise rather than the value, so
    // that concurrent first-time requests for the same CID share a single
    // in-flight fetch instead of racing to the network N times.
    const jsonPromiseCache = useRef(new Map());
    const imagePromiseCache = useRef(new Map());

    /**
     * Add content to IPFS
     * @param {string|Buffer} content - Content to add
     * @returns {Promise<Object>} IPFS add result with path property
     * @throws {IPFSError} If add operation fails
     */
    const addToIpfs = useCallback(async (content) => {
        console.log("[IPFS] Starting upload to The Graph's IPFS endpoint...");
        console.log("[IPFS] Content type:", typeof content);
        console.log("[IPFS] Content length:", typeof content === 'string' ? content.length : content?.length || content?.size || 'unknown');
        if (typeof content === 'string') {
            console.log("[IPFS] Content preview:", content.substring(0, 200) + (content.length > 200 ? '...' : ''));
        }

        // For binary files (images), use direct fetch to IPFS API with FormData.
        // ipfs-http-client corrupts binary data even with Uint8Array — an 86KB PNG
        // becomes 149KB due to UTF-8 multi-byte encoding of high bytes (>0x7F).
        // Direct FormData upload preserves the raw bytes correctly.
        // For strings (JSON metadata), ipfs-http-client works fine.
        const isBinary = content instanceof Blob;

        try {
            const addedData = await withRetry(async () => {
                let cid;
                let size;
                if (isBinary) {
                    console.log("[IPFS] Binary file detected — using direct FormData upload...");
                    const formData = new FormData();
                    formData.append('file', content);
                    const response = await fetch('https://api.thegraph.com/ipfs/api/v0/add', {
                        method: 'POST',
                        body: formData,
                    });
                    if (!response.ok) {
                        // Read the body so a Cloudflare 1015 WAF page (often served as 403/503) is visible
                        // to isRateLimited and gets the long cooldown instead of the short transient backoff.
                        const body = await response.text().catch(() => '');
                        throw new Error(`IPFS upload failed: ${response.status} ${response.statusText} ${body}`.trim());
                    }
                    const result = await response.json();
                    cid = result.Hash;
                    size = result.Size;
                } else {
                    console.log("[IPFS] Attempting add to api.thegraph.com/ipfs...");
                    const ipfsClient = await getIpfsClient();
                    const result = await ipfsClient.add(content);
                    cid = (result.cid || result.path).toString();
                    size = result.size;
                }
                // The on-chain bytes32 <-> CID encoding round-trips ONLY for CIDv0 ("Qm..."); a CIDv1 would
                // silently produce a non-decodable hash and brick claims. Fail loudly if the endpoint ever
                // returns one (it returns CIDv0 today).
                if (!cid || !cid.startsWith('Qm')) {
                    throw new Error(`IPFS returned a non-CIDv0 hash (${cid}); expected a 'Qm...' CID.`);
                }
                return { path: cid, size };
            });

            // Verify retrievability SEPARATELY (re-cat only, never re-upload) so a flaky read-back can't
            // re-fire the upload across every caller. Fails closed if the CID never becomes catchable.
            await verifyRetrievable(addedData.path, content, isBinary);
            console.log("[IPFS] Upload verified retrievable, CID:", addedData.path);

            console.log("[IPFS] Final CID (path):", addedData.path);
            console.log("[IPFS] CID format check - starts with 'Qm':", addedData.path?.startsWith('Qm'));
            console.log("[IPFS] Full result object:", addedData);
            console.log("[IPFS] You can verify at: https://api.thegraph.com/ipfs/api/v0/cat?arg=" + addedData.path);
            console.log("[IPFS] Public gateway: https://ipfs.io/ipfs/" + addedData.path);

            return addedData;
        } catch (error) {
            console.error("[IPFS] ERROR - Failed to add to IPFS via The Graph:", error);
            console.error("[IPFS] Error name:", error.name);
            console.error("[IPFS] Error message:", error.message);
            console.error("[IPFS] Error stack:", error.stack);

            // If already an IPFSError, rethrow
            if (error instanceof IPFSError) {
                throw error;
            }

            // Wrap in IPFSError for consistent error handling
            throw IPFSError.addFailed(error);
        }
    }, []);

    /**
     * Fetch JSON content from IPFS
     * @param {string} ipfsHash - IPFS CID to fetch
     * @returns {Promise<Object|null>} Parsed JSON content or null for empty hashes
     * @throws {IPFSError} If fetch or parse fails
     */
    const fetchFromIpfs = useCallback(async (ipfsHash) => {
        // Zero/empty hashes are valid - they mean "no content"
        if (isZeroHash(ipfsHash)) {
            return null;
        }

        // Normalize hash to CID format (handles bytes32 -> CID conversion)
        const validHash = normalizeToIpfsCid(ipfsHash);
        if (!validHash) {
            console.warn("Could not normalize IPFS hash to valid CID:", ipfsHash);
            return null;
        }

        const cached = jsonPromiseCache.current.get(validHash);
        if (cached) return cached;

        const promise = (async () => {
            try {
                const bytes = await hybridFetchBytes(validHash);
                const stringData = new TextDecoder().decode(bytes);
                try {
                    return JSON.parse(stringData);
                } catch (parseError) {
                    console.error("Error parsing IPFS content as JSON:", parseError);
                    throw IPFSError.parseFailed(validHash, parseError);
                }
            } catch (error) {
                console.error("Error fetching from IPFS:", error, "hash:", validHash);
                if (error instanceof IPFSError) throw error;
                throw IPFSError.fetchFailed(validHash, error);
            }
        })();

        // Cache only on success — a transient network error shouldn't poison
        // future calls for the same CID.
        jsonPromiseCache.current.set(validHash, promise);
        promise.catch(() => jsonPromiseCache.current.delete(validHash));

        return promise;
    }, []);

    /**
     * Fetch image from IPFS and return as blob URL
     * @param {string} ipfsHash - IPFS CID of the image
     * @returns {Promise<string|null>} Blob URL of the image or null for empty hashes
     * @throws {IPFSError} If fetch fails
     */
    const fetchImageFromIpfs = useCallback(async (ipfsHash) => {
        // Zero/empty hashes are valid - they mean "no image"
        if (isZeroHash(ipfsHash)) {
            return null;
        }

        // Normalize hash to CID format (handles bytes32 -> CID conversion)
        const validHash = normalizeToIpfsCid(ipfsHash);
        if (!validHash) {
            console.warn("Could not normalize IPFS image hash to valid CID:", ipfsHash);
            return null;
        }

        const cached = imagePromiseCache.current.get(validHash);
        if (cached) return cached;

        const promise = (async () => {
            try {
                const bytes = await hybridFetchBytes(validHash);
                const blob = new Blob([bytes], { type: 'image/png' });
                return URL.createObjectURL(blob);
            } catch (error) {
                console.error("Error fetching image from IPFS:", error);
                if (error instanceof IPFSError) throw error;
                throw new IPFSError(
                    IPFSOperation.FETCH_IMAGE,
                    validHash,
                    error,
                    IPFSErrorCode.FETCH_FAILED
                );
            }
        })();

        imagePromiseCache.current.set(validHash, promise);
        promise.catch(() => imagePromiseCache.current.delete(validHash));

        return promise;
    }, []);

    /**
     * Safely fetch from IPFS, returning null on error (for backwards compatibility)
     * Use this when you want to handle missing data gracefully
     * @param {string} ipfsHash - IPFS CID to fetch
     * @returns {Promise<Object|null>} Parsed JSON content or null on error
     */
    const safeFetchFromIpfs = useCallback(async (ipfsHash) => {
        try {
            return await fetchFromIpfs(ipfsHash);
        } catch (error) {
            console.error("Safe fetch failed:", error.message);
            return null;
        }
    }, [fetchFromIpfs]);

    /**
     * Safely fetch image from IPFS, returning null on error
     * @param {string} ipfsHash - IPFS CID of the image
     * @returns {Promise<string|null>} Blob URL or null on error
     */
    const safeFetchImageFromIpfs = useCallback(async (ipfsHash) => {
        try {
            return await fetchImageFromIpfs(ipfsHash);
        } catch (error) {
            console.error("Safe image fetch failed:", error.message);
            return null;
        }
    }, [fetchImageFromIpfs]);

    // Memoize context value
    const value = useMemo(() => ({
        // Standard operations (throw on error)
        fetchFromIpfs,
        fetchImageFromIpfs,
        addToIpfs,
        // Safe operations (return null on error - backwards compatible)
        safeFetchFromIpfs,
        safeFetchImageFromIpfs,
        // Hash format utilities
        isValidIpfsCid,
        normalizeToIpfsCid,      // Auto-detect and convert any format to CID
        bytes32ToIpfsCid,        // Explicit bytes32 -> CID conversion
        ipfsCidToBytes32,        // Explicit CID -> bytes32 conversion
    }), [fetchFromIpfs, fetchImageFromIpfs, addToIpfs, safeFetchFromIpfs, safeFetchImageFromIpfs]);

    return (
        <IPFScontext.Provider value={value}>
            {children}
        </IPFScontext.Provider>
    );
};
