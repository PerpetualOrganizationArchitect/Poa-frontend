# POP ZK Email — claim inbox worker

A Cloudflare Email Worker that turns the "send an email, then export the raw `.eml`" step of a ZK
Email role claim into "send an email, click a button." It receives the verification email, stores the
raw DKIM-signed message for ~1 hour, and serves it to the claim page over HTTP so the proof runs
automatically.

## Why this exists (and why it's optional)

Exporting a raw, DKIM-signed `.eml` by hand is a UX minefield: Gmail's "Show original → Download
original" is web-only, Spark and most mobile mail apps can't produce a signed copy at all, and
same-account self-sends / Sent-folder copies are unsigned. This inbox sidesteps all of it — the
worker receives the fully-signed *delivered* copy by definition, from any client or provider.

It is a **convenience, not a trust anchor**:

- **Soundness is unchanged.** The worker only relays bytes. Claims are still gated by the DKIM
  signature + the in-browser ZK proof + on-chain merkle/nullifier checks. A malicious or
  compromised inbox cannot forge a claim, steal a role, or bind an email to the wrong address.
- **It can't gate access.** The claim page always keeps manual `.eml` upload as a permissionless
  fallback, so a down / censoring inbox degrades UX only — never the ability to claim. For maximum
  censorship-resistance, an org self-hosts its own inbox (this worker) on its own domain.
- **Front-running is harmless.** A claim mints to the in-circuit-bound address regardless of who
  submits the transaction.

**Privacy tradeoff:** `/claim-email` is unauthenticated, so anyone who knows a claimer address can
read the sender's email address until the entry expires. Set `ALLOWED_ORIGIN` to your app to reduce
casual scraping; use the manual path if that mapping must stay private.

## Deploy

Requires a domain on Cloudflare with **Email Routing** enabled.

```sh
cd cloudflare-worker-claim-inbox
npm i -g wrangler   # if needed

# 1. Create the KV namespace and paste its id into wrangler.toml (id + a preview_id).
wrangler kv namespace create CLAIM_EMAILS

# 2. Deploy the worker.
wrangler deploy
```

Then in the Cloudflare dashboard: **Email → Email Routing → Routes** → add a custom address (e.g.
`claim@yourdomain.com`) and set its action to **Send to a Worker → poa-zkemail-claim-inbox**.

## Wire it to the frontend

Set these before building the app (they gate the auto-fetch UI; unset = manual upload only):

```sh
NEXT_PUBLIC_ZKEMAIL_INBOX=claim@yourdomain.com          # the address users send to
NEXT_PUBLIC_ZKEMAIL_INBOX_URL=https://poa-zkemail-claim-inbox.<your-subdomain>.workers.dev
```

The claim page will pre-fill the "to:" with `NEXT_PUBLIC_ZKEMAIL_INBOX` and poll
`${NEXT_PUBLIC_ZKEMAIL_INBOX_URL}/claim-email?claimer=0x…`.

## HTTP API

| Route | Method | Response |
|---|---|---|
| `/claim-email?claimer=0x…` | GET | `200 {status:"ready",eml}` once received, else `404 {status:"pending"}` |
| `/health` | GET | `200 {ok:true}` |

## Test locally

```sh
wrangler dev
# Simulate a delivered email (must contain a DKIM-Signature header + the claim subject):
curl "http://localhost:8787/health"
```
Inbound email can only be exercised against a real Email Routing route; `wrangler dev` covers the
`fetch` (serving) half.
