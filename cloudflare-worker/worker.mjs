// cloudflare-worker/worker.mjs

const PINATA_GATEWAY = 'https://poa.mypinata.cloud';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1) Redirect bare domain -> www
    if (url.hostname === 'poa.earth') {
      url.hostname = 'www.poa.earth';
      return Response.redirect(url.toString(), 301);
    }

    // 2) Proxy www.poa.earth to Pinata, keeping path/query
    const cid = env.SITE_CID; // injected by wrangler / CI

    if (!cid) {
      return new Response('SITE_CID not configured', { status: 500 });
    }

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

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: upstreamRes.headers,
    });
  },
};
