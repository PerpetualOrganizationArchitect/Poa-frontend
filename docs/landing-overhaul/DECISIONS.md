# Landing page overhaul: decisions

Phase 6 artifact. Everything significant, with reasons. Before/after
screenshots at 375/768/1440 were kept during the work and removed from the
repo before merge (15MB of PNGs); the before/after gif lives untracked in
the workspace root, and earlier states are recoverable from git history.

## What the audit taught

1. The product is better than the old page said, and different. There is no
   profit-sharing mechanism and no leave-with-your-money flow (both implied
   by the brief and one by the old page), but there IS a real cashout flow
   to Cash App/Venmo/bank, real named templates, real vouch quorums, and a
   permanent public decision history. The honest page writes itself from
   those.
2. The logo was already letterpress: black typewriter slab "poa" between two
   rules. The pastel gradient site fought its own mark. The charter design
   is, in a real sense, what the logo always claimed.
3. `Navbar.jsx`/`Footer.jsx` are shared with /u, /protocol, /about,
   /explore, so the overhaul built new landing-only components instead of
   restyling those in place (hard rule 5).
4. Repo constraint that shaped the motion rules: framer-motion above the
   fold bakes `opacity: 0` into the static export (PRs #437/#438), so the
   page uses the established pure-CSS `.poa-fade` pattern, and nothing else.

## Significant decisions

- **Artifacts live in `docs/landing-overhaul/`**, not the repo root: keeps
  the root clean; the brief names the files but not their location.
- **"Constitution" never appears as a noun for an artifact.** There is no
  one-page constitution document in the product; governance lives in
  contract configuration surfaced by the app. Copy says "rules" and
  "templates" (what the deployer actually shows). The word "charter" is
  used only as a design metaphor (the specimen), never as a product claim.
- **The surplus pillar from the brief was cut.** "Surplus flows back to the
  people who created it" has no mechanism in the code. The ownership pillar
  stands on what is verifiable: voting power earned by participating, not
  bought. The old page's "share of the treasury" line died for the same
  reason.
- **"The door is open" was rebuilt from true parts.** No exit flow exists,
  so the pillar claims what is real: earnings land in the member's own
  account and cash out to ordinary payment apps; the record is public; any
  org can run its own copy of the tools (white-label hosting is documented
  and live). "Leave anytime with everything" from the brief was not
  claimable and does not appear.
- **"No fees to start" became "Poa charges nothing."** Free account
  creation depends on the solidarity fund holding a balance; "Poa charges
  nothing" is unconditionally true (no payment code exists in the product).
- **Accent is deep green (`meadow`), not brass.** Sanctioned by the brief's
  own list; chosen because Poa is the botanical name of meadow grass,
  because ledger green reads institutional rather than decorative, and
  because it passes AA/AAA at small mono sizes where brass fails. Palette
  is three families total: paper, ink, meadow.
- **Newsreader (serif, variable, self-hosted) + IBM Plex Mono.** Newsreader
  was on the brief's candidate list and its optical sizing gives display
  and text cuts from one file. Plex Mono is the "typewriter adjacent" mono:
  same skeleton, better numerals at 13px than Courier-likes. ~300KB of
  latin-subset woff2 in `public/fonts`; only the landing references the
  families, so app routes never download them. Hero faces are preloaded.
- **Buttons are set in mono.** The mono is the page's voice for the
  mechanical (numbers, dates, controls). Tested in both passes; it reads as
  letterpress furniture, not gimmick. Sentence case throughout.
- **Mono labels render uppercase via CSS** (`01 · THE USUAL STORY`,
  `SPECIMEN`). The sentence-case rule governs authored copy; small-caps
  exhibit labels are a typographic device of the charter genre, authored in
  sentence case and transformed in CSS. (Reversible by deleting one
  `textTransform`.)
- **The proof section is a link, not a number.** No usage data exists
  statically in the repo, so the page says what is structurally true (every
  org's rules, decisions, and books are public) and links to /explore.
  Nothing is counted, so nothing can go stale or be wrong.
- **The specimen is labeled `specimen / exhibit a`** with a screen-reader
  caption calling it illustrative. A fictional bakery shows the shape of a
  charter without claiming a real customer. Review pass 2 deleted its
  visible caption (redundant) and renamed `no. 0001` to `exhibit a` so it
  cannot be misread as "the first organization."
- **No closing CTA band.** The hero carries the one action, the footer's
  first link repeats it quietly. "Ready to Build?" died with the rest of
  the launch register.
- **Old section components were deleted**, not parked: HeroSection,
  ValuesSection, WhatIsPoa, UseCaseShowcase, FeatureCards, ClosingCTA,
  HowItWorks. They are in git history if ever wanted. Navbar/Footer remain
  for the routes that import them.
- **SEO keywords with banned vocabulary were dropped from meta and
  JSON-LD** ("no-code DAO", "on-chain voting", "decentralized governance",
  DAO-flavored `knowsAbout`). Required by hard rule 4; accepted cost
  against SEO_ROADMAP.md's keyword strategy (see TODO).
- **OG image regenerated in the new system** (paper, rules, serif, mark) at
  `/images/poa-og-landing.png`, passed only by the landing page; the
  old default OG stays for every other route.
- **Auth surfaces beyond the landing page were left alone.** The RainbowKit
  connect modal and sign-in/onboarding modals keep their own styling and
  copy (app scope). The landing's own label "Connect Wallet" was re-labeled
  "Connect"; the modal a user then opts into is third-party UI.

## Review loop notes

- Pass 1: zero banned words, zero em-dashes in rendered output (body, meta,
  JSON-LD, alts, hrefs); single H1 with clean H2/H3 outline; reduced-motion
  renders the hero at full opacity at first paint; focus rings visible on
  skip link, nav, buttons, and footer links. Fixed: 3-column grids waited
  for `lg` (at 768 the columns were too narrow), skip link focus ring moved
  to the palette.
- Pass 2 (the deletion pass): specimen caption to screen-reader-only,
  `exhibit a` rename, one ethos sentence cut, nav kept to three links.
  Final lint re-run clean against the production static export, including
  the E2E leakage guard (`yarn e2e:check`).

## Pass 3 (Hudson: "too basic, review flow and wording, not visually appealing")

The honest reading of the feedback: pass 2's deletion instinct overshot.
The system was right; the execution was timid. Pass 3 kept every rule
(paper/ink/one accent, serif/mono, no gradients, no stock anything) and
added the drama the genre actually has:

- Hero rebuilt on the logo's construction (rule, headline, rule), display
  size up, `that lasts.` in italic, corner folios (`est. 2024` / `poa.box`).
- Large green serif numerals beside every section heading; double rules
  (3px + hairline) at every opener; vignettes scaled to pull-quote size.
- Section 02 became steps-beside-specimen (sticky) so the mechanism is read
  against its result; the specimen gained a treasury row and a two-decision
  record.
- New section 03 "What an organization gets" (Votes/Tasks/Treasury/
  Members/Learning as annotated ledger rows): the page now demonstrates the
  product surface instead of only philosophizing about it. Flow became:
  problem → mechanism → product → properties → audience → ethos.
- Ethos inverted to a deep-green plate (the one color moment), with a
  colophon close ("Starting takes minutes. Lasting is the point.") and the
  action repeated once.
- Nav gained a compact Start button; wording sharpened throughout
  ("members who vouch for each other", "no shares to sell and no investors
  to please", "Ten years from now, a new member can read what was decided
  and why", "everything it built stayed borrowed").

All claims still trace to the audit; the vocabulary lint, heading
hierarchy, reduced motion, and contrast checks were re-run clean against
the rebuilt page (plate text is 9.5:1).

## Pass 4 (Hudson: "not colorful, too minimal, like a Google Slides
## template; first impressions must be impactful; poa is lowercase; this
## work secures public and worker ownership and is a public good")

Three directives, three responses:

1. **Color and impact.** The genre reference moved from university press
   to union broadside / WPA poster. New inks (oxblood, ochre) joined the
   green; the tri-color ribbon frames the hero and closes the footer; the
   vignettes print as three color plates; buttons and the specimen carry
   solid letterpress offset shadows; the footer is the poster's ink-black
   base. Every combination was contrast-checked (all text AA or better;
   ochre-on-paper is restricted to large decorative numerals at 3.6:1).
   The original brief's bans (gradients, glass, photos, motion) all still
   hold.
2. **Lowercase poa.** The visible uppercase came from the mono label's
   `textTransform` hitting the `poa.box` folio (rendering POA.BOX) plus
   capitalized "Poa" in running copy. The brand is now `poa` lowercase in
   all rendered text, the title tag, meta description, JSON-LD names, alt
   text, the © line, and the regenerated OG image. "Poa" remains only as a
   JSON-LD alternateName so search engines connect both spellings. A
   case-check script now guards this alongside the vocabulary lint.
3. **The mission.** The hero gained "Built for worker and community
   ownership."; the ethos now reads: "We built poa because worker and
   community ownership is how a better future gets made, and the tools for
   it should be a public good." Both verifiable (the templates are worker
   and community governance; the code is AGPL and free to use).

## Pass 5 (blank-slate review + casing clarification)

An independent cold review (no build context) scored the page 6/10 overall:
strong on distinctiveness (8) and clarity (7/7), weak on trust (4) and
desire (5). Its core findings and what was done:

- **"The headline says nothing; the subline is the real headline."** Fixed
  the cheap half: a category kicker now sits above the H1
  ("organizations owned by the people in them"), so the fold names the
  category before the poetry. The reviewer also called **"est. 2024" a
  heritage costume on a two year old product whose pitch is longevity**:
  cut from the hero and the OG image.
- **"The best trust sentence is buried."** "Every organization on Poa is
  public: its rules, its decisions, its books" was a footnote link; it is
  now a bordered band at trust-claim size closing section 05, with the
  link re-worded "Read the books for yourself."
- **Mobile nav hid "How it works" exactly where orientation is scarcest**:
  now visible at every width; "Browse" renamed "Organizations".
- **Copy fixes**: step one no longer enumerates all five templates (they
  appear again in 05); the Learning row dropped the jargon ("earn their
  standing") for "Onboarding courses your organization writes; passing
  them earns voting weight"; "The properties" running label became "The
  principles"; the ethos now says "because we believe", conviction rather
  than asserted fact; the specimen's toy treasury ($1,840.16) became
  $12,408.90 and its founding date moved to 2024 so it reads like a
  business, not a pizza fund.
- **Casing, clarified by Hudson**: "Poa" in prose is correct; "POA" is
  never acceptable. Prose, title, JSON-LD names, and og:site_name are back
  to "Poa" (lowercase "poa" kept as alternateName); the mono-label
  text-transform can no longer hit brand strings; the lint guard now
  targets all-caps POA.

Findings deliberately NOT acted on (need Hudson or conflict with hard
rules): naming the substrate plainly (banned vocabulary list), a "where
the money lives" custody/recovery section (needs verified product answers
on dues-in, passkey recovery, wind-down), signing the ethos with real
names, live counts at the fold, and replacing the specimen with a real
organization (the reviewer's #1; already a TODO below).

## Pass 6 (receipts and candor — executing the blank-slate review)

Hudson had no stats or info to provide; none were needed. The repo's own
public data layer and docs contained everything. His three calls: live
real-org card yes; honest counts yes however small; money section yes with
caveats softened (softening done by omission, never by false claims).

- **The specimen is now live.** The card swaps to a real organization from
  the public registry (the same cross-chain query /explore uses, via the
  lazy ProfileHubContext opt-in): real name, founded date, member count,
  and a "read its books" link through the existing `getVisitUrlForOrg`
  helper (external for white-label orgs). Verified live: KUBI, founded
  31 March 2026, 24 members, linking to dao.kublockchain.com. The
  fictional Hill Street Bakery remains the clearly labeled fallback for
  first paint and registry failure; verified by blocking the registry in
  Playwright. Featured selection prefers kubi, then poa (the repo's
  known-real orgs), else the most-membered presentable name. Proposal
  titles stay off the front door: unmoderated user content.
- **Honest live counts.** The proof band fills a height-reserved slot with
  "4 organizations and 41 members keep their books here" (live values at
  verification time), filtered of test orgs via a new shared
  `HIDDEN_ORG_IDS` module that /explore now imports too. If the registry
  is down, the line simply never appears; nothing breaks, nothing lies.
- **Section 04, "Where the money lives."** Q&A fine-print on the page's
  one paper.200 band, every answer verified against posts/ docs: Poa never
  holds the money; anyone can fund the treasury; spending follows the
  rules; cashout to ordinary payment apps in minutes with the marketplace
  fee shown upfront; the treasury keeps working if Poa disappears.
  Omitted per Hudson: the device-only passkey backup caveat and the
  solidarity-fund-empty fallback fee. Omission, not denial: nothing
  printed contradicts them.
- **"Who is we" answered structurally**: the ethos plate closes with "Poa
  itself runs as an organization on Poa. Our books are public too," linked
  to the live org only when the registry confirms it exists (it does:
  org "Poa" on Gnosis). The /about page makes the same claim.
- The card's "network: Gnosis" row was cut before shipping: a substrate
  tell the rest of the page deliberately avoids. For the same reason the
  landing links orgs through the internal route only (`/home?org=...`):
  the banned-vocabulary rule covers URLs, and KUBI's external white-label
  domain contains "dao." — caught live by the lint, fixed by a local
  `internalOrgUrl` helper instead of `getVisitUrlForOrg`.
- profileHub fetches gained an 8s abort so a hung gateway degrades like a
  failed one (also fixes /explore skeletons hanging forever).
- Sections renumbered: 05 principles, 06 members, 07 reason. Pillar three
  dropped its cashout mechanics (now section 04's job).

## TODO(hudson)

1. **Featured founding org.** If you want a real ledger entry on the page
   (name, founded date) for the first real organization, say which org and
   confirm it is public; the specimen slot can become a real entry. Nothing
   was invented in the meantime.
2. **SEO keyword retreat.** The banned-vocabulary rule removed every
   DAO/web3 keyword from meta and JSON-LD, which cuts against
   `poa-app/SEO_ROADMAP.md`. If discoverability for those queries still
   matters, that strategy needs a new home (docs pages already carry some
   of it) or a revised roadmap.
3. **Other routes still speak the old language.** /about, /docs content,
   /protocol, and the app itself use vocabulary the landing page now bans
   (the docs literally explain the substrate, reasonably so). Decide how
   far the vocabulary policy should propagate.
4. **est. 2024** is taken from the existing structured data
   (`foundingDate: "2024"`). If that date is wrong, it is wrong in two
   places now.

## With more time

- A second diagrammatic element for section 02: a thin-line vouch diagram
  (member → vouch → member) in the same ink, if a second illustration ever
  feels necessary. The page currently survives without it, which is better.
- Hover/focus polish on the specimen (e.g. a faint paper.200 row highlight)
  if it ever becomes interactive (linking to a real org).
- Self-host the app's Inter/Roboto Mono the same way the landing fonts are
  hosted, removing the Google Fonts request site-wide (perf + the same
  independence the footer sentence claims).
- Once a first founding organization agrees to be named, replace the
  specimen with the real entry: the strongest possible proof section.
