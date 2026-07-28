# Poa landing redesign v2 — canonical brief

This is the single source of truth for every downstream agent (build, copy, judge,
verify) in the landing-v2 redesign. Read it in full before touching any file. It
supersedes `docs/landing-overhaul/MESSAGING.md` (v1). Where the two disagree, this wins.

Scope: the marketing surface only — `/` (landing), `/about`, `/docs` hub + article
template, and marketing nav/footer. The in-app org UI is untouched.

This file is *instructions to agents*, not marketing copy, so the vocabulary rules do
not apply to the prose here. They DO apply to every copy example quoted below — those
examples are ship-ready and must stay clean.

---

## 1. Core promise + positioning

**The one promise (must land in 5 seconds):**

> On Poa, the work you do earns you real ownership: a share of the money and a say in
> the decisions.

Everything else on the page is evidence for it.

**Positioning shift.** The old page answered the organizer's future-tense anxiety
("will this group survive?" — headline "Start something that lasts.", a mortality
section, a "memory" pillar). The redesign answers the **contributor's present-tense
anxiety**: *I do the work and someone else gets the upside.* Permanence is a property of
the product, not the reason to want it. This promise is the most differentiated,
code-verifiable, pain-shaped thing Poa can say, and it just became fully claimable
(PaymentManager revenue distributions are live in contracts and the treasury UI).

**Feel:** crisp, elevated, calm, trustworthy, mission-charged, modern — "the operating
system for a better civilization." It must not feel web3. Language must be politically
un-demonizable (see §3 dual-read test).

**Audience.** Primary: the contributor/organizer in a group chat who does real work and
watches the upside land elsewhere — non-technical, burned by tools that quietly owned
their community, moved by plain language and visible proof. Secondary: an invited member
who sees the page once, on a phone, after clicking a vouch link — must read fast and feel
like an institution, not an app-store listing.

---

## 2. Keep-verbatim / cut-demote

### Keep verbatim (verified, on-voice, do not reword)

- "Organizations owned by the people in them" — eyebrow / footer tagline; the category line.
- "The people who do the work own the most" — promote from the buried ethos plate into the hero orbit; the promise in nine words.
- "Voting power is earned by participating, not bought." — best line on the page.
- "Every organization on Poa is public: its rules, its decisions, its books." + live registry counts — the trust engine; carries unchanged.
- "Poa itself runs as an organization on Poa. Our books are public too."
- "Poa charges nothing." / "An account is a username and a passkey." — unconditionally true.
- The money-candor Q&A (who holds the money / cash out / what if Poa disappears) — carries, reframed under the splitting-money pain, not "the fine print."
- Vouching, templates, quick-join — carry as *mechanism copy inside sections*, never as headlines.

### Cut or demote

- "Start something that lasts." as the headline → demote to a closing-colophon grace note.
- "How groups usually end" mortality framing → dies. The new problem section is about groups that are **alive and stuck**: contribution without upside, money in someone's personal app, decisions by the loudest voice, work nobody tracks.
- "A memory" as a pillar headline → its content (permanent readable record) becomes supporting evidence under governance.
- "No investors to please" / "not shareholders" → cut (anti-villain sneering; see §3).
- The ethos plate stays but is rewritten around ownership-as-upside, not software-is-rented (one rented-software sentence may survive).

---

## 3. Vocabulary policy v2 (in full)

### The governing test: dual-read

Every value-laden sentence must pass **two readers at once**: to one it reads as
**self-reliance and property** ("what I earn is mine, nobody can take it, we set our own
rules"); to the other as **fairness and community** ("everyone gets their share, we
decide together"). If a sentence only works for one reader, or lets a hostile reader tag
the page as left-coded or libertarian-movement-coded, it fails — rewrite it.

### Banned list (ERROR — lint-enforced by `check-vocab.mjs`)

Word-boundary, case-insensitive; appears nowhere in rendered page, meta, OG, alt, or URLs:

`blockchain, crypto, web3, DAO, token, tokens, on-chain, onchain, wallet, smart contract,
smart contracts, gas, mint, airdrop, NFT, DeFi, multisig, multi-sig, dapp, protocol fee,
stablecoin.`

`decentralized` is **allowed bare**. Only compounds are banned: "decentralized
autonomous", "decentralized finance", and any hyphenated `decentralized-*` (e.g.
"decentralized-governance"). "on-chain voting", "decentralized treasury" and friends stay
out via the banned words they contain.

Also ERROR: **all-caps `POA`** (the mark is "poa", prose is "Poa", "POA" is never
acceptable — watch `text-transform` on mono labels and any title suffix); **literal
em-dash** (—) in visible text or meta/JSON-LD strings; **exclamation mark** in visible
text nodes.

### Avoid list — left-coded (WARNING — rewrite target, does not fail the build)

`solidarity` (the internal PaymasterHub is the "solidarity fund"; on marketing surfaces
say "a shared fund" or "established organizations help cover costs for new ones" — the
product-UI name is a Hudson decision, out of landing scope), `extractive`/extraction,
`exploitation`, `capitalism`/`capitalist`/anti-capitalist, collective as a noun ("creative
collectives" as an audience name is established and fine), `seize`, `comrade`, `mutual
aid`, `the workers` with the definite article, "late-stage" anything.

The current site legitimately mentions the solidarity fund, so these are warnings, not
errors; they become rewrite targets in later phases.

### Avoid list — right / libertarian-coded (WARNING)

`sovereign`/`sovereignty` (also crypto-coded), `financial freedom` (scam-coded),
`permissionless`, `censorship-resistant`, `the state`, anti-institution sneering.

### No villains except formlessness

Zero villains on the page except **formlessness** — the group chat, the untracked
spreadsheet, the unspoken split. Replace negation-of-villains with
affirmation-of-property. Instead of "no investors to please" write: *"There are no outside
shares. Ownership belongs to the people in the organization, and it is earned, not
bought."* Same fact, no enemy. No mocking of CEOs, VCs, or shareholders.

**Overclaim watch.** "no one can take it from you, including us" is allowed (Poa cannot
take it: true; governance can burn ownership by vote). Never escalate to "can never be
taken by anyone."

### Preferred register (use freely)

own / ownership / owner · earn / earned · yours · share (noun) · stake · upside · a real
say · votes that count · the books · in the open · written down · your rules · split ·
paid for the work · **worker owned** and **community owned** (unhyphenated — Hudson wants
this identity kept) · self-governance as verbs ("govern it together," "you set the rules")
not the abstract noun.

### House style

- sentence case everywhere, including buttons and headings
- no em-dashes anywhere
- no exclamation marks
- no superlatives
- "worker owned" / "community owned" / "member owned" / "vouch based" unhyphenated; "open-source" keeps its hyphen as an established technical term
- brand casing: "Poa" in prose, lowercase "poa" only for the mark and domain (poa.box), "POA" never
- sanctioned exception (Direction A): mono LABELS may render sentence-case DOM text in uppercase via `text-transform` (screen readers and the lint see sentence case). Any such label containing "Poa" must use the `.pa-nocaps` guard so the brand never displays as POA. Keep-verbatim strings keep their exact DOM text.

---

## 4. Claims ledger v2

Every claim on the site must be code-backed. Existing verified claims all stand:
templates, vouching, passkey account (username + passkey), cash out to Cash
App/Venmo/Revolut/bank, permanent public decision history, three voting modes,
AGPL/self-host, live registry counts, "Poa charges nothing."

### Newly claimable (PaymentManager unlock)

| # | Landing-safe claim | Mechanism | Status |
|---|---|---|---|
| **N1** | "Earn a share of the revenue for the work you complete" / "when the organization distributes revenue, your share matches your ownership" | `PaymentManager.createDistribution` + merkle claims; treasury UI (`CreateDistributionModal`, `CurrentDistributions`, `DistributionHistory`) live | **Verify in P0**: a real distribution must be capturable on Test6. That screenshot *is* the verification. |
| **N2** | "You can check your share yourself, without trusting anyone's spreadsheet" | merkle proof verification, checkpoint block | Ships with N1; supporting line only, never a headline. |
| **N3** | Task pay | `completeTask()` mints ParticipationToken + transfers optional bounty | **Verify**: bounty is optional and the ownership payout is per-task config. Phrase as "tasks pay in dollars and build your ownership." Never promise all three ways (dollars + ownership + vote) on *every* task. |

### The N1 fallback swap (mandatory if P0 cannot produce a distribution)

If N1 does not clear verification, every subline/section that leans on "a share of the
revenue" swaps to **"a bigger say and pay in dollars"** (verified today). The meta title
also falls back (§9). Copy agents must draft both the N1 and the fallback variant so the
swap is a one-line change.

### The "when revenue is distributed" phrasing rule

Distributions are created **deliberately** by the org, not automatically. Copy must always
say "when revenue is distributed" / "when the organization distributes revenue" — never
imply automatic passive income ("revenue flows to you," "earn while you sleep"). The old
AUDIT.md ban on "share of the treasury" stays for anything implying passive income; it is
lifted only for these deliberate, org-created distributions.

### Reframed protocol claims (all banned-vocab-safe)

- "Ownership is earned when your work is approved. It cannot be bought, sold, or given away." (transfer reverts; minted only on approval) — headline-grade.
- "One person, one vote" mode — live.
- "or weight votes by contribution, or blend the two" — one clause; multi-class detail is docs material.
- "Your group can change its own rules, by vote."
- "Every decision is recorded with its reasoning, permanently and publicly."
- "What you earn stays yours" — only with the Poa-can't-take-it framing (overclaim watch).
- "Join in seconds with a username and a passkey."
- Gasless/shared-fund: "members never pay Poa to participate; established organizations help cover costs for new ones." **Verify** PaymasterHub deployment/grace terms on Gnosis before shipping; the unconditional fallback "Poa charges nothing" is always safe and stays the default.

### Open verification items (before any copy ships)

1. PaymentManager distributions live on deployed Gnosis + capturable on Test6 (gates N1/N2/N3, hero sublines, section 5, meta title). — P0
2. PaymasterHub deployment/grace terms (gates any "help cover costs" line; safe fallback exists).
3. Per-task ownership-payout configurability (gates "every approved task earns…" absolutes).
4. Cashout rails (Cash App / Venmo / Revolut) still live as claimed.

---

## 5. Narrative arc (the 9-section landing table)

Pains structure the arc; it **peaks at the money section** — the moment ownership turns
into a payout is the "actual upside" the brief demands.

| # | Section | Job | Real screenshot |
|---|---------|-----|-----------------|
| 0 | Marketing nav | chrome: logo · how it works · docs · organizations · sign in · start | — |
| 1 | Hero | land the core promise in 5s: eyebrow (category), headline (winning direction), subline stating work → ownership → money + vote, CTA pair, quiet passkey/charges-nothing line | framed **task payout card** (task, dollar payout, ownership earned) |
| 2 | The problem | name the pains without villains: "from group chat to organization" — stuck-group vignettes (untracked work, unspoken splits, loudest-voice decisions), closing on "the people doing the most owned nothing" | none (or a muted group-chat artifact; art direction's call) |
| 3 | The work | task management pain → ownership engine: post, claim, review, pay; approved work earns ownership; skill-gated applications; "ownership cannot be bought, sold, or given away" | **tasks board** (Test6 kanban) |
| 4 | The say | governance pain → votes that count: one person one vote / contribution-weighted / a blend; every decision recorded with reasoning, forever; the group can change its own rules by vote | **vote tally** (live proposal, options + counts) |
| 5 | The money (PEAK) | splitting-money pain → revenue share: treasury in the open, spendable only by the rules; revenue distributed in proportion to earned ownership; check your own share; cash out to the apps you use; Poa never holds it | **treasury distributions** (CurrentDistributions with claim) |
| 6 | The people | who-does-what pain: roles with exact written powers; join by vouch or open role in seconds; audiences list (student orgs → open source) with template names | **roles / team matrix** |
| 7 | Proof band | trust: "Every organization on Poa is public: its rules, its decisions, its books." + live counts + explore link | **org explore** grid |
| 8 | Ethos plate | the mission-charged moment (full-bleed color): worker and community ownership rewritten around upside — the people who do the work own the most; Poa runs on Poa, books public | — |
| 9 | Start + close | convert: compressed three steps (rules → members → run it), closing line, CTA pair | — |

---

## 6. /about — 5-block spec

Re-ground in the same story; same vocabulary policy; no gradient-blob-era copy. Kill the
"Unstoppable" principle and the "Multi-chain" stat (banned-adjacent). No stats we cannot
verify live.

1. **The belief** — one paragraph, dual-read ("we think the people who build a thing should own it").
2. **The problem we saw** — the group-chat era; ownership going to platforms.
3. **What Poa is** — three sentences, benefit-first.
4. **How we hold ourselves to it** — Poa runs as an organization on Poa, books public, AGPL, self-hostable, "built so no one can lock you in, including us."
5. **Where we are** — honest and small, link to /explore.

Delete the framer-motion sections and gradient blobs outright; rebuild on marketing chrome.

## 7. /docs — a manual, not marketing

Hub tone: sentence case, task-first titles ("Start an organization," "Pay for work,"
"Distribute revenue"), zero adjectives, zero pain-point copy. Hub chrome and category
descriptions obey the banned-vocab list.

**Sanctioned exemption (write it down this time):** docs **article bodies** may name the
underlying technology where technically unavoidable. This is encoded in `check-vocab.mjs`:
for `docs/<slug>/index.html` article routes the lint scans only the SEO surface (title,
meta, JSON-LD) and skips the article body. The docs hub (`docs/index.html`) is NOT exempt.

Note (do not act): three test posts (`test`, `test2`, `letsSee`) still statically
generate — flag to Hudson in P4.

## 8. Meta / SEO / OG spec

- **Title:** `Poa: organizations that pay you with ownership` — **N1-dependent**; falls back to `Poa: build together, own together` if N1 is not verified.
- **Description (<160):** `Turn your group into an organization you own together. Finished work earns ownership: revenue share and voting power for the tasks you complete. Free and open.`
- **OG:** regenerate in the winning visual direction with the winning headline; alt text `Poa`; **landing-only** asset — other routes keep the default OG.
- **JSON-LD:** keep WebSite / Organization / SoftwareApplication, price 0; `knowsAbout` / keywords from the safe register (worker owned organization, community ownership, cooperative software, revenue sharing, group governance, task management for communities, start a cooperative). No banned terms (accepts the known SEO cost).
- **Casing guard:** "Poa" in title/description/JSON-LD; lowercase `poa` only inside the OG image mark; the all-caps-POA lint stays.

---

## 9. Three design directions (prototype bake-off)

**Shared thesis:** the charter page's failure is *genre* — letterpress is a costume, and
costumes photograph as "generated." All three replace costume with structure: real product
evidence, real numbers, engineered layout.

### The identical-copy rule (control the variable)

All three prototypes ship **identical body copy** so the judges score the *design*, not the
words. Direction-specific wording is allowed ONLY in microcopy (figure labels, plate
captions, data-chip labels). Hero/section copy is drafted once from the §2/§4 seeds, linted
clean, and shared. Final copy gets its own judge panel later (Gate 2).

### Prototype scope (identical per direction) — exactly four parts + chrome

1. Nav (the direction's own marketing chrome)
2. Full hero (the first screen is 50% of the judgment)
3. One pain-point section — "from contribution to actual upside": ownership issued when work is approved · revenue split by earned share · one person one vote or earned weight
4. One product-proof section — the direction's framing device over the SAME two captures (tasks board region + treasury distributions region)
5. Footer strip (enough to judge chrome)

### Prototype hosting rules

- `poa-app/src/pages/proto/{a,b,c}.js` — **not** `_proto/` (the pages router ignores underscore-prefixed dirs, so they would never route).
- Each page fully self-contained: plain JSX + styled-jsx / inline styles. **Zero changes to the Chakra theme or globals.css** (may *reference* existing `.poa-*` classes). Fonts via a page-`<Head>` `@font-face` pointing at `public/fonts/proto/*.woff2` (latin subsets), so app routes never download prototype fonts.
- Three parallel agents touch disjoint files on one branch; one dev server serves all three; no worktrees.
- Deleted before merge: `pages/proto/`, `public/fonts/proto/`. Keep `public/images/proto/` (or `public/images/product/`) captures for the winning build.

### Motion constraint (all directions, and the final build)

Entrances use the existing pure-CSS classes only: `.poa-rise` / `.poa-fade` / `.poa-reveal`
in `globals.css`. **No framer-motion above the fold** — it bakes `opacity:0` into the static
HTML, so content is invisible until hydrate. The gradient/`background-clip:text` headline
must use transform-free `.poa-fade`; any residual transform on clipped text breaks the clip
on iOS Safari (headline invisible on mobile only).

---

### Direction A — "Public works" (civic standards-manual modernism)

Genre: NASA Graphics Standards Manual (1975), Swiss federal signage, USWDS / Public Sans.
Codes as a public institution engineered by serious people.

- **Palette:** bone `#F7F6F2` (bg) · ink `#16181D` (text/frames) · steel `#4A4F58` (secondary) · civic `#10243E` (full-bleed band, dark plates) · signal `#B45309` (large accents / annotation markers only) · signal-deep `#7C2D12` (links, small accent text) · hairline `#D8D5CC` (1px rules/mats).
- **Type:** Archivo Variable display (wght 620, tracking -0.025em) · Public Sans Variable body (17px/1.65) · IBM Plex Mono for data (already hosted). Display `clamp(2.9rem, 7vw, 5.5rem)`.
- **Layout:** 1200px container, 12-col grid with a fixed 72px left margin rail (sticky mono section markers); full-width edge-to-edge 1px hairlines between sections; asymmetric text 5/12, evidence 6/12.
- **Screenshot framing — the spec plate:** device-free crops at 1.5–2× zoom, square corners, 1px ink hairline frame, 8px bone mat, corner registration ticks. Mono figure bar below (`fig 02 — task approved, ownership issued`). Absolutely-positioned 1px hairline **annotation leader lines** from mono labels into the exact UI element ("this vote weight was earned, not bought"). One `#10243E` full-bleed band mid-page carries a dark-plate screenshot in bone.
- **Risk:** reads cold / "another Linear clone" if grid furniture outweighs human copy.

### Direction B — "The imprint" (institutional editorial; the permitted charter-DNA modernization)

Genre: Stripe Press, Works in Progress. Keeps paper + serif + ledger sobriety, burns the
costume (no letterpress shadows, tri-color ribbons, roman numerals).

- **Palette:** paper `#FBF7EF` (bg) · plate `#FFFFFF` (mats) · ink `#1F1B13` · ink-soft `#57503F` (secondary) · evergreen `#1E3D2C` (accent/links/buttons/the full-bleed plate) · gilt `#B08A3E` (hairline folios and plate numbers, large/decorative only — never body).
- **Type:** zero new font bytes — Newsreader Variable (already hosted) at opsz max, wght 420, so it reads Stripe-Press display not charter-bookish; IBM Plex Mono demoted to captions/folios; body up to 18px. Display `clamp(3rem, 8vw, 6.5rem)`, italic reserved for one hero word.
- **Layout:** container 1040px, prose 660px, but **plates break the prose column** to 1240px (figures larger than text is the core move). No section-number rules; sections open with a gilt mono folio (`i · ownership`) in the left margin. Rhythm `clamp(6rem, 12vw, 10rem)`.
- **Screenshot framing — the tipped-in plate:** white `#FFFFFF` mat, 32–48px margins, a 1px ink rule inset 12px (double-mat), radius 0, the system's first-ever shadow `0 1px 2px rgba(31,27,19,0.12), 0 12px 32px rgba(31,27,19,0.08)` (paper lift, not SaaS glow). Serif italic caption + mono folio (`plate ii`). Crops of single screens, no zoom-crops. One evergreen mission plate near the close.
- **Risk:** Hudson may read any serif-on-paper as "the same charter again"; lives or dies on whether scale + plates register as richness.

### Direction C — "The mutual" (cooperative-bank modernism)

Genre: the modern mutual/credit-union rebrand wave × Mercury-grade product presentation.
Member-owned financial institutions *are* the message.

- **Palette:** evergreen `#0E2A23` (brand ink, hero full-bleed, footer) · sand `#F4F1EA` (light bg) · ink `#14231E` (text on sand) · ink-soft `#43554D` (secondary) · paper-on-dark `#F2EFE6` · gold `#C9A227` (chips/rules/data highlights on evergreen) · gold-deep `#8A6D1C` (accents on sand, large only).
- **Type:** Fraunces Variable display (opsz 144, wght 560, SOFT 40 — warm bank serif) · Instrument Sans Variable body (17px/1.6) · IBM Plex Mono for data/chips. Display `clamp(2.75rem, 6.5vw, 5.25rem)`.
- **Layout:** 1140px container, no cards; full-bleed color bands are the structure; **product panels overlap band boundaries** (the one calculated depth move); gold 2px rules 40px long open sections. **The hero itself is the full-bleed moment** — the page opens dark evergreen floor-to-ceiling; sand/white bands alternate; evergreen returns at the footer (bookends).
- **Screenshot framing — the statement panel:** rounded 14px panels, 1px `rgba(14,42,35,0.14)` border, layered shadow `0 2px 6px rgba(14,42,35,0.10), 0 24px 64px rgba(14,42,35,0.18)`. Beside each panel, **HTML data chips** (not baked into the screenshot): gold-bordered pills with real Test6 numbers (`distribution claimable · $1,240`, `your share, earned by work · 3.2%`). Chips may use ONLY numbers actually visible in the capture (verifiability rule). Crop to content-dense regions (tables, tallies) to minimize coral-chrome clash.
- **Risk:** green + gold + serif is one degree from "premium fintech template"; collapses into polished-generic without real data density.

---

## 10. Judge rubric (score 1–5 each, weighted)

| # | Criterion | Question | Weight |
|---|-----------|----------|--------|
| 1 | 5-second message | From the hero viewport alone: do you know you earn ownership and revenue for work you contribute? | 20% |
| 2 | Trustworthy + elevated + calm | Would you route your group's money through this? Institution or startup toy? | 20% |
| 3 | Distinctive / not-generated | Could you attribute this to a design hand? Does anything smell template, SaaS-generic, or web3? | 20% |
| 4 | Richness / first impression | Scale contrast, multi-ink color, real objects, the full-bleed moment — does the first screen land? (Hudson's "too basic" / "Google Slides" bar) | 15% |
| 5 | Product proof | Do the real screenshots make the product look credible and desirable without lying about it? | 15% |
| 6 | Mobile survival | Does the 390px hero keep the message, the drama, and legibility? | 10% |

**Auto-eliminate:** any direction scoring ≤2 on criterion 2 (trust) or criterion 3
(distinctiveness) is out regardless of total. **Tie-break:** criterion 3, then criterion 1.

Judging captures per direction: desktop full-page (1440), desktop first-viewport
(1440×900), mobile first-viewport (390×844), all DPR 2 — twelve images total including the
current live page as a baseline. 4 blank-slate judge agents (structured JSON scores) +
Fable synthesis → **Hudson Gate 1** picks the direction (or requests a hybrid/iteration).

---

## 11. Gates and lint

- `check-vocab.mjs` (this repo, `poa-app/scripts/marketing/`) is the authoritative vocab gate: HTML mode over `out/` after `yarn build`; `--src <path>` mode for a fast build-free self-check on a component before building.
- Between every phase: `yarn build && node poa-app/scripts/marketing/check-vocab.mjs`, plus Playwright screenshots (1440 + 390) against the static `out/` (catches baked `opacity:0` regressions).
- Never touch: `src/components/landing/{Navbar,Footer}.jsx`, `src/services/e2e/**`, app-route pages. Run `yarn build && yarn e2e:check` before a PR only if the diff touches E2E-intercepted files.
- Two human gates only: direction (Gate 1) and copy (Gate 2). Everything else is autonomous.

---

## 12. Product evidence (P0, captured 2026-07-04)

Real, logged-out captures of live organizations on the public registry — no seeded or
fabricated data. Captured from the static export by
`poa-app/scripts/marketing/capture-product-shots.mjs` (re-runnable; proxies subgraph
requests through node fetch because the gateway API key is domain-locked). Files in
`poa-app/public/images/product/`; manifest with ship-ready alt/captions in
`src/components/marketing/productShots.js`; full-res PNG originals in `/tmp/poa-shots-review/`.

| Shot | Org / surface | Arc section | What it proves |
|------|---------------|-------------|----------------|
| `task-detail` | Decentral Park, completed task modal | 1 Hero | "Reward: 50 Shares", claimed by a real member, human submission text. Work → ownership in one card. |
| `tasks-board` | Decentral Park, "Initial Basement Set-up" board | 3 The work | All four columns populated with real community tasks, payouts in shares, avatars. |
| `vote-tally` | KUBI, "Director of Education" results | 4 The say | A real election: five candidates, real member votes, weighted results, clear winner. |
| `treasury` | Argus, Active Profit Shares panel | 5 The money (PEAK) | **Claim N1 VERIFIED**: three real revenue distributions, multi-claimant, 100% claimed. The product's own noun is "Profit Share". |
| `treasury-stats` | Argus, treasury header trio | 5 The money | "Transparent finances for all members. Major spending requires a vote." + live stats. |
| `team-matrix` | KUBI, permissions table | 6 The people | Roles × exact written powers (Join/Approve/Shares/Vote/…). |
| `team-members` | KUBI, members grouped by role | 6 The people | 10 real Executives with activity stats; 19 Members. |
| `explore-stats` | registry stats trio | 7 Proof band | 10 organizations / 54 members / 100% community owned (network pills cropped out). |
| `tasks-board-mobile` | Decentral Park, 390px list | mobile proof | The board survives a phone. |

Notes for build/copy agents:
- **N1 is confirmed** (real production distributions + Test6's own live PaymentManager). Use the strong revenue-share claims; the fallback swap in §4 is NOT needed.
- The product UI's own vocabulary in-frame: "Shares" (payouts), "Profit Share" (distributions), "kubix" (KUBI's participation credit). All vocab-safe; prefer echoing "profit share" in section 5 copy.
- Screenshot plates are predominantly dark navy/purple app chrome except team/* and explore-stats (light). Frame treatments must plan for both.
- Do NOT screenshot: KUBI org header/description ("...DAO..."), KUBI Research project, the /explore org-card grid (banned words baked into a logo + descriptions), Argus task boards (dense jargon).
- Real member usernames appear in-frame (public pages; Hudson is a member of Decentral Park + KUBI). Hudson sign-off on this is bundled into Gate 1.
