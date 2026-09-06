import { getDocsRedirect } from '../poa-app/src/lib/docs.mjs';

const PINATA_GATEWAY = 'https://ipfs.poa.earth';

// White-label hosts whose root ("/") should land directly on the org home page
// instead of the generic POA landing. The org itself is picked up client-side
// from window.location.hostname in POContext (HOST_DEFAULT_ORG).
// Redirecting at the edge avoids any flash of the landing HTML.
const WHITE_LABEL_HOSTS = new Set([
  'dao.kublockchain.com',
  'www.poa.earth',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // poa.earth: bare -> www (and fold root -> /home/ for the white-label landing).
    if (url.hostname === 'poa.earth') {
      url.hostname = 'www.poa.earth';
      // If they hit the root, fold the white-label redirect into this hop.
      // Trailing slash matches next.config.mjs `trailingSlash: true`.
      if (url.pathname === '/') url.pathname = '/home/';
      return Response.redirect(url.toString(), 301);
    }
    // poa.box: www -> apex. The apex domain is the canonical and matches every
    // <link rel="canonical"> / og:url emitted by the static site. Collapsing
    // www.poa.box hits into the apex avoids the "Page with redirect" /
    // "Alternate page with proper canonical tag" splits in Google Search
    // Console and keeps the brand URL consistent.
    if (url.hostname === 'www.poa.box') {
      url.hostname = 'poa.box';
      return Response.redirect(url.toString(), 301);
    }

    // White-label root -> org home (302, not 301 — we may change this).
    if (url.pathname === '/' && WHITE_LABEL_HOSTS.has(url.hostname)) {
      url.pathname = '/home/';
      return Response.redirect(url.toString(), 302);
    }

    // Documentation migrations happen before the IPFS fetch. The exported
    // site also includes a noindex fallback for gateways without this worker.
    const docsRedirect = getDocsRedirect(url.pathname);
    if (docsRedirect) {
      url.pathname = docsRedirect;
      return Response.redirect(url.toString(), 301);
    }

    // Get CID from environment variable (set by CI/CD)
    const cid = env.SITE_CID;
    if (!cid) {
      return new Response('SITE_CID not configured', { status: 500 });
    }

    // proxy www.poa.earth to Pinata while keeping URL clean
    const upstreamUrl = new URL(PINATA_GATEWAY);
    upstreamUrl.pathname = `/ipfs/${cid}${url.pathname}`;
    upstreamUrl.search = url.search;

    const upstreamReq = new Request(upstreamUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? null
          : request.body,
      redirect: 'follow',
    });

    const upstreamRes = await fetch(upstreamReq);

    const headers = new Headers(upstreamRes.headers);

    // HTML pages must not be cached long-term — each deploy produces a new CID
    // with new content-hashed JS/CSS references. Without this, browsers serve
    // stale HTML that points to old JS bundles missing build-time env vars.
    const contentType = headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      headers.set('cache-control', 'public, max-age=0, must-revalidate');
    }

    // WebAuthn Related Origins spec requires application/json on this file;
    // Pinata serves it as octet-stream because it has no extension.
    if (url.pathname === '/.well-known/webauthn') {
      headers.set('content-type', 'application/json');
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers,
    });
  },
};
