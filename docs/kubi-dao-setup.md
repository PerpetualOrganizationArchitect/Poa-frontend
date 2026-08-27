# Kansas Blockchain (formerly KUBI) — dao.kublockchain.com setup

One-time setup for hosting Kansas Blockchain's org at `dao.kublockchain.com`. After this, no
ongoing coordination is required — every deploy we ship to `poa.box` is live on
your domain on the next request.

## How it works

Your Cloudflare Worker reverse-proxies `dao.kublockchain.com` to
`https://poa.box`. The client-side app reads `window.location.hostname`,
sees `dao.kublockchain.com`, and auto-loads the Kansas Blockchain org as the default — no
query params, no branding flash. Passkeys work across both domains because we
register `dao.kublockchain.com` as a WebAuthn Related Origin on our side.

## Prerequisites

- A Cloudflare account.
- `kublockchain.com` DNS managed on that Cloudflare account (Free plan works).
  If it lives elsewhere today, transfer the zone to Cloudflare first — at your
  DNS registrar, change the nameservers to the two Cloudflare assigns you when
  you add the zone. Propagation is usually < 1 hour.

## Steps

### 1. Create the Worker

**Important:** Workers are created at the *account* level, not the zone
(domain) level. If you're currently looking at `kublockchain.com` and see
**Workers Routes** in the left sidebar — that's the wrong place (it only
attaches existing Workers to a domain's routes). Navigate out first:

- Click the Cloudflare logo top-left to return to your account home, or
- Go directly to
  <https://dash.cloudflare.com/?to=/:account/workers-and-pages>

From the account home:

1. Left sidebar → expand **Compute** (under the "Build" section) →
   **Workers & Pages** → **Create**.
   - If your UI shows **Workers & Pages** directly in the top-level sidebar
     (older layout), use that instead.
2. Tab **Workers** → **Hello World** starter → **Get started**.
3. Name it `dao-kublockchain-proxy` → **Deploy**. This deploys the default
   Hello-World Worker; we'll replace the code next.
4. Click **Edit code** on the confirmation screen (or from the Worker's page:
   **Edit code** button top-right).
5. In the code editor, **select all and delete** the default `worker.js`
   contents, then paste:

   ```js
   const UPSTREAM = 'https://poa.box';

   export default {
     async fetch(request) {
       const url = new URL(request.url);

       // White-label root -> org home (zero-flash, edge-side).
       // Trailing slash matches the upstream's Next.js trailingSlash: true.
       if (url.pathname === '/') {
         url.pathname = '/home/';
         return Response.redirect(url.toString(), 302);
       }

       // Proxy everything else transparently to poa.box.
       // URL bar stays on dao.kublockchain.com — the app reads the hostname
       // and auto-loads Kansas Blockchain as the default org.
       const upstreamUrl = UPSTREAM + url.pathname + url.search;
       const upstreamReq = new Request(upstreamUrl, {
         method: request.method,
         headers: request.headers,
         body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
         redirect: 'follow',
       });
       return fetch(upstreamReq);
     },
   };
   ```

6. Click **Deploy** (top-right). The code is live on the
   `*.workers.dev` preview URL at this point, but not yet on your domain.

### 2. Attach dao.kublockchain.com to the Worker

1. Go back to the Worker's overview page (one page back from the code
   editor — click the Worker name in the breadcrumb at the top, or the
   browser's back button after the Deploy confirmation closes).
2. On the overview page → **Settings** tab → **Domains & Routes** →
   **Add** → **Custom domain**.
3. Enter `dao.kublockchain.com` → **Add domain**.
4. Cloudflare creates the DNS record and issues a TLS cert automatically.
   The domain shows **Active** within 1–2 minutes.

No separate DNS step needed — Custom Domain handles it. (If your
organization requires managing DNS records explicitly, use **Add route**
with `dao.kublockchain.com/*` instead and create a proxied A record at
`dao` → `192.0.2.1` manually.)

### 3. Verify

After DNS propagates (usually minutes):

```bash
# Expect: 302 redirect to /home/
curl -I https://dao.kublockchain.com/

# Expect: 200, HTML body, served transparently from poa.box
curl -sS https://dao.kublockchain.com/home/ | grep '<title>'

# Expect: 200, content-type: application/json, origins list contains
# https://dao.kublockchain.com
curl -i https://poa.box/.well-known/webauthn
```

Then in a browser:

1. Open `https://dao.kublockchain.com/` — should land on the Kansas Blockchain home
   with no intermediate "POA" branding flash.
2. Sign up with a passkey. DevTools → Application → WebAuthn should show
   `rp.id: "poa.box"`. Completion of the flow means Related Origins worked.

## Ongoing operations

- **No per-deploy coordination.** When we ship a new `poa.box` CID, your
  domain picks it up on the next request.
- **If you need to pin to a specific version** for a regression test or
  incident, change `UPSTREAM` to a point-in-time CID URL
  (`https://ipfs.poa.earth/ipfs/<cid>`) and revert when done.
- **Rate limits.** For high traffic, enable Cloudflare's edge cache on the
  Worker route — upstream cache headers are already configured correctly
  (immutable JS/CSS, no-cache HTML).
- **If the org renames itself on-chain, tell us.** The domain resolves its org
  by exact *name*: `HOST_DEFAULT_ORG` in `poa-app/src/config/hostDefaultOrg.js`
  maps `dao.kublockchain.com` → the org's current name, and POContext looks it
  up with `organizations(where: { name: $name })`. A rename makes that lookup
  miss and the domain lands on "Organization not found" until the map is
  updated. Two edits, both in that file: point `HOST_DEFAULT_ORG` (and
  `ORG_WHITE_LABEL_URL`) at the new name, and add the retired name to
  `ORG_NAME_ALIASES` so `?org=<old name>` links already in the wild keep
  working. This is what happened when KUBI became Kansas Blockchain.

## Browser support notes

- Passkey Related Origin Requests require Chrome 128+ (Aug 2024) or Safari 18 /
  iOS 18+ (Sept 2024). Older browsers will fall back to domain-scoped passkeys,
  which still work on your domain but can't be reused on `poa.box`.

## Cross-team touchpoints

The only reason we'd need to talk after setup:

- Adding/removing domains from the WebAuthn Related Origins allowlist.
- Incident response (e.g. you want us to disable your domain at our edge).
- SEO — we can conditionally set `dao.kublockchain.com` as the canonical URL
  so search engines credit your domain instead of `poa.box`. Low priority.
