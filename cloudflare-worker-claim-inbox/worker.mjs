/**
 * ZK Email claim inbox — Cloudflare Email Worker.
 *
 * Receives the verification email a POP claimer sends ("Subject: Claim POP role for 0x<addr>"),
 * stores the RAW, DKIM-signed MIME briefly, and serves it to the browser so the claim page can prove
 * it automatically — eliminating the manual .eml export minefield (Gmail "Show original" is web-only,
 * Spark/mobile apps can't export a signed copy, self-sends and Sent-folder copies are unsigned).
 *
 * TRUST MODEL — this worker only RELAYS bytes:
 *  - It cannot forge a claim. Soundness stays entirely with the DKIM signature + the in-browser ZK
 *    proof + the on-chain merkle/nullifier checks. A malicious/compromised inbox can drop mail or read
 *    it, but can never mint a role or bind an email to the wrong address.
 *  - It is a CONVENIENCE, never required. The claim page always keeps manual .eml upload as a
 *    permissionless fallback, so a down or censoring inbox degrades UX only — never the ability to
 *    claim. For maximum censorship-resistance an org self-hosts its own inbox (this worker).
 *  - Front-running is harmless: a claim mints to the in-circuit-bound address regardless of who
 *    submits the tx, so even if someone else fetches the email and submits first, the role still lands
 *    on the intended account.
 *
 * PRIVACY — /claim-email is unauthenticated, so anyone who knows a claimer address can read the
 * sender's email address for up to TTL. That's the cost of a zero-friction fetch; the manual upload
 * path avoids it. Lock ALLOWED_ORIGIN to your app to reduce casual scraping.
 */

const SUBJECT_RE = /Claim POP role for (0x[0-9a-fA-F]{40})/;
const TTL_SECONDS = 3600; // hold a received email at most 1 hour
const MAX_BYTES = 1_000_000; // claim emails are tiny; reject anything larger

/**
 * Decode RFC 2047 encoded-words (`=?charset?B|Q?...?=`) in a raw header value. Some providers
 * encode even pure-ASCII subjects; without decoding, a valid claim would bounce as "not a POP
 * claim". Unknown charsets fall back to latin1 (byte-preserving); undecodable words are left as-is.
 */
function decodeRfc2047(value) {
  if (!value || !value.includes('=?')) return value;
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (whole, charset, enc, text) => {
    try {
      let bytes;
      if (enc.toLowerCase() === 'b') {
        const bin = atob(text);
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } else {
        // Q-encoding: underscore = space, =XX = byte
        const q = text.replace(/_/g, ' ').replace(/=([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
        bytes = Uint8Array.from(q, (c) => c.charCodeAt(0) & 0xff);
      }
      try {
        return new TextDecoder(charset.split('*')[0]).decode(bytes);
      } catch (_) {
        return new TextDecoder('latin1').decode(bytes);
      }
    } catch (_) {
      return whole;
    }
  });
}

/**
 * CORS: `ALLOWED_ORIGIN` is a comma-separated allowlist (or "*"). Echo the request origin only if
 * allowed; otherwise omit the header. This is scrape-reduction, NOT auth — the endpoint stays
 * intentionally unauthenticated (see the privacy note above).
 */
function corsHeaders(env, request) {
  const conf = (env.ALLOWED_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const allow = conf.includes('*') ? '*' : conf.includes(origin) ? origin : null;
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  if (allow) headers['Access-Control-Allow-Origin'] = allow;
  return headers;
}

async function streamToString(stream, maxBytes) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  // latin1 (not utf-8): a 1:1 byte<->codepoint map that round-trips EVERY octet losslessly. utf-8
  // would replace any 8bit non-ASCII byte in the DKIM-signed header block with U+FFFD, corrupting
  // the bytes the proof is computed over. The client reads it back as a raw string the same way.
  return new TextDecoder('latin1').decode(merged);
}

export default {
  /** Cloudflare Email Routing delivers inbound mail here. */
  async email(message, env) {
    try {
      const subject = decodeRfc2047(message.headers.get('subject') || '');
      const m = subject.match(SUBJECT_RE);
      if (!m) {
        message.setReject('Not a POP role-claim email (subject must be "Claim POP role for 0x…").');
        return;
      }
      const claimer = m[1].toLowerCase();

      const raw = await streamToString(message.raw, MAX_BYTES);
      // A delivered, provable message carries a DKIM-Signature. If it doesn't (third-party composer,
      // etc.), storing it would just hand the browser an unprovable file — bounce it so the sender
      // learns immediately rather than discovering it after a failed proof.
      if (!/^DKIM-Signature:/im.test(raw)) {
        message.setReject('Message has no DKIM signature — send it from your provider’s own website.');
        return;
      }
      // Keyed by claimer, latest-wins, short TTL. No long-term storage.
      await env.CLAIM_EMAILS.put(`claim:${claimer}`, raw, { expirationTtl: TTL_SECONDS });
    } catch (e) {
      message.setReject(e && e.message === 'too large' ? 'Message too large.' : 'Could not process message.');
    }
  },

  /** The claim page polls this to fetch the received raw email. */
  async fetch(request, env) {
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (url.pathname === '/health') return json({ ok: true });

    if (url.pathname === '/claim-email' && request.method === 'GET') {
      const claimer = (url.searchParams.get('claimer') || '').toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(claimer)) return json({ error: 'invalid claimer address' }, 400);
      const raw = await env.CLAIM_EMAILS.get(`claim:${claimer}`);
      if (!raw) return json({ status: 'pending' }, 404);
      return json({ status: 'ready', eml: raw });
    }

    return json({ error: 'not found' }, 404);
  },
};
