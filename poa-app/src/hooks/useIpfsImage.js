import { useEffect, useMemo, useState } from 'react';
import { useIPFScontext } from '@/context/ipfsContext';
import { isResolvableIpfsReference, stripIpfsRefLocation } from '@/lib/ipfs/imageBytes';

const DIRECT_IMAGE_SOURCE = /^(?:https?:\/\/|\/\/|blob:|data:)/i;

function ipfsPathFromGatewayUrl(source) {
  if (!/^(?:https?:\/\/|\/\/)/i.test(source)) return null;

  try {
    const url = new URL(source, 'https://poa.box');
    const match = url.pathname.match(/\/ipfs\/(.+)/i);
    let ipfsPath = match
      ? decodeURIComponent(match[1]).replace(/^\/+|\/+$/g, '')
      : null;

    // Also recognize subdomain gateways such as
    // https://<cid>.ipfs.dweb.link/avatar.png.
    if (!ipfsPath) {
      const labels = url.hostname.split('.');
      const ipfsLabel = labels.indexOf('ipfs');
      const subdomainCid = ipfsLabel > 0 ? labels[ipfsLabel - 1] : null;
      if (subdomainCid) {
        const path = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '');
        ipfsPath = path ? `${subdomainCid}/${path}` : subdomainCid;
      }
    }

    if (!ipfsPath) return null;

    // Match the CID families supported by IPFScontext. Validate the whole first
    // path segment rather than only checking its prefix, so an ordinary route
    // such as /ipfs/badge.png remains an ordinary HTTP image.
    return isResolvableIpfsReference(ipfsPath) ? ipfsPath : null;
  } catch {
    return null;
  }
}

/**
 * Accept only references the IPFS loader can actually resolve. Anything else
 * (an ENS name, a filename, a half-written CID) would otherwise become a real
 * gateway request that can only 404.
 *
 * A query string or fragment is not part of the content path, so it is dropped
 * before the reference is handed on — otherwise it would be sent to the gateway
 * as part of the path and 404 a CID that resolves perfectly well.
 */
function asIpfsDescriptor(value) {
  const ref = stripIpfsRefLocation(value).replace(/^\/+/, '');
  return isResolvableIpfsReference(ref)
    ? { kind: 'ipfs', value: ref }
    : { kind: 'empty', value: null };
}

/**
 * Separate browser-ready image URLs from IPFS references.
 *
 * Profile metadata normally stores a bare CID, but older/external records may
 * contain an ipfs:// URI or an already usable URL. The latter must remain
 * untouched: in particular, local crop previews are blob: URLs and should not
 * be sent through the IPFS loader.
 */
export function classifyIpfsImageSource(source) {
  if (typeof source !== 'string') return { kind: 'empty', value: null };

  const value = source.trim();
  if (!value) return { kind: 'empty', value: null };

  const gatewayIpfsPath = ipfsPathFromGatewayUrl(value);
  if (gatewayIpfsPath) return { kind: 'ipfs', value: gatewayIpfsPath };

  if (DIRECT_IMAGE_SOURCE.test(value)) return { kind: 'direct', value };

  if (/^ipfs:\/\//i.test(value)) {
    return asIpfsDescriptor(value.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, ''));
  }

  if (/^\/ipfs\//i.test(value)) {
    return asIpfsDescriptor(value.replace(/^\/ipfs\//i, ''));
  }

  return asIpfsDescriptor(value);
}

/**
 * Resolve an avatar reference to a browser-ready URL.
 *
 * Bare CIDs use IPFScontext's cached, hedged Helia/gateway path. Direct URLs
 * are returned synchronously. Resolution is deliberately cancelled by
 * ignoring a stale result rather than aborting the shared request: several
 * avatars can be awaiting the same cached promise.
 */
export function useIpfsImage(source) {
  const { safeFetchImageFromIpfs } = useIPFScontext() || {};
  const descriptor = useMemo(() => classifyIpfsImageSource(source), [source]);
  const [resolved, setResolved] = useState({ key: null, url: null });

  useEffect(() => {
    if (descriptor.kind !== 'ipfs') return undefined;

    const cid = descriptor.value;
    setResolved((current) => (
      current.key === cid ? current : { key: cid, url: null }
    ));

    if (typeof safeFetchImageFromIpfs !== 'function') return undefined;

    let cancelled = false;

    async function resolveImage() {
      const url = await safeFetchImageFromIpfs(cid);
      if (!cancelled) setResolved({ key: cid, url: url || null });
    }

    resolveImage().catch(() => {
      if (!cancelled) setResolved({ key: cid, url: null });
    });

    return () => {
      cancelled = true;
    };
  }, [descriptor.kind, descriptor.value, safeFetchImageFromIpfs]);

  if (descriptor.kind === 'direct') return descriptor.value;
  if (descriptor.kind !== 'ipfs') return null;
  return resolved.key === descriptor.value ? resolved.url : null;
}

export default useIpfsImage;
