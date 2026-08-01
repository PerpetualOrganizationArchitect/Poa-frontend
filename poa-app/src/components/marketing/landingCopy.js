// Production landing copy (P2). Direction A · "public works".
//
// Two provenances live in this module, kept explicit on purpose:
//
//   1. VERBATIM from PROTO_COPY - the strings the client already approved in the
//      bake-off + warm-up round (hero, the upside/"pain", product-proof captions,
//      footer). These are imported and re-exported unchanged. Do NOT wordsmith
//      them here; Gate 2 (the copy panel) revisits wording. The client removed
//      the hero quiet line, so it is dropped from the shipped hero.
//
//   2. DRAFT ship-grade copy for the full 9-section arc (BRIEF §5), written from
//      the §2 keep-verbatim lines and the §4 cleared claims. Every claim traces
//      to the §4 ledger; N1 revenue-share is CLEARED (P0 verified real
//      distributions), so the strong form is used everywhere, always phrased
//      "when the organization distributes revenue" (§4 phrasing rule).
//
// House style (BRIEF §3): sentence case, no em-dashes (" · " in mono microcopy),
// no exclamations, no superlatives, brand always "Poa" (never all-caps), banned vocab absent.
// Verified clean by scripts/marketing/check-vocab.mjs --src.

import { PROTO_COPY } from '@/components/marketing/protoCopy';

// ── 1. Verbatim, client-approved (re-exported from the bake-off control copy) ──

export const HERO = {
  eyebrow: PROTO_COPY.hero.eyebrow, // "Organizations owned by the people in them"
  headline: PROTO_COPY.hero.headline, // "Do the work. Own what you build."
  subline: PROTO_COPY.hero.subline,
  ctaPrimary: PROTO_COPY.hero.ctaPrimary, // "Start an organization"
  ctaSecondary: PROTO_COPY.hero.ctaSecondary, // "See how it works"
  // No quiet line: the client removed it in the warm-up round.
};

// The upside band ("pain" in the proto) - carried verbatim. Used by the
// hero-adjacent ledger framing / read as the promise restated.
export const UPSIDE = PROTO_COPY.pain;

// Product-proof captions - verbatim. Section components pick the caption they
// need by shot key.
export const PROOF_COPY = PROTO_COPY.proof;

export const FOOTER = {
  tagline: PROTO_COPY.footer.tagline, // "Organizations owned by the people in them"
  selfHost: PROTO_COPY.footer.selfHost, // "Poa itself runs as an organization on Poa..."
};

// ── 2. Draft ship-grade arc copy (BRIEF §5), Gate-2 revisable ──

// Nav + footer chrome. Anchors match the section ids in the landing components.
export const NAV = {
  links: [
    { label: 'How it works', href: '/#how-it-works', anchor: true },
    { label: 'Docs', href: '/docs', fromSm: true },
    { label: 'Organizations', href: '/explore', fromMd: true },
    { label: 'About', href: '/about', fromMd: true },
  ],
  signIn: 'Sign in',
  cta: 'Start an organization',
};

// Full footer for the production strip (colophon + nav columns + self-host line
// + closing grace note in the colophon, not as a headline).
export const FOOTER_FULL = {
  tagline: FOOTER.tagline,
  selfHost: FOOTER.selfHost,
  // "Start something that lasts." demoted from headline to a closing colophon
  // grace note (BRIEF §2 cut-demote).
  graceNote: 'Start something that lasts.',
  columns: [
    {
      heading: 'Product',
      links: [
        { label: 'Start an organization', href: '/create' },
        { label: 'Browse organizations', href: '/explore' },
        { label: 'Templates', href: '/docs/deployment-wizard' },
        { label: 'Docs', href: '/docs' },
      ],
    },
    {
      heading: 'Project',
      links: [
        { label: 'About', href: '/about' },
        { label: 'Source', href: 'https://github.com/poa-box', external: true },
        { label: 'Discord', href: 'https://discord.gg/9SD6u4QjTt', external: true },
        { label: 'X', href: 'https://twitter.com/PoaPerpetual', external: true },
      ],
    },
  ],
  colophon: 'Poa graphics standard · public works edition',
  std: 'std. 001',
};

// The civic-navy ledger stat band at the fold. Real capture numbers only
// (Argus, three profit shares, 100% claimed, nothing held by Poa).
export const LEDGER = {
  title: 'the record, in the open',
  ref: 'std. 001 / ledger',
  cells: [
    { num: '3', label: 'profit shares distributed' },
    { num: '100%', label: 'claimed by the members who earned it' },
    { num: '$0', label: 'held by Poa', signal: true, nocaps: true },
  ],
};

// Section 2 · the problem. "From group chat to organization" - stuck-group
// vignettes, no villains, closing on the ownership line. (BRIEF §5, §2 cut of
// the mortality framing; the group is alive and stuck.)
export const PROBLEM = {
  rail: 'sec 02 / the problem',
  kicker: 'The problem',
  heading: 'From a group chat to an organization',
  lead:
    'The group is real. The tools were never built for it. The work starts, trust and good will carry it, and then the group gets big enough that trust alone stops holding it together.',
  items: [
    {
      title: 'The work goes untracked',
      body:
        'Effort lives in threads and someone’s memory. No one can point to who did what, so the record is whatever people remember.',
    },
    {
      title: 'The splits stay unspoken',
      body:
        'Money comes in and goes out through a personal account. Who is owed what is a conversation everyone keeps putting off.',
    },
    {
      title: 'The loudest voice decides',
      body:
        'Choices get made by whoever is most insistent in the moment, not by the people who carry the work.',
    },
  ],
  // The close (BRIEF §5: "the people doing the most owned nothing").
  close: 'The group held together, and the people doing the most owned nothing.',
};

// Section 3 · the work. Task management pain -> ownership engine. Uses the
// tasks-board shot; leans the task-detail card. (BRIEF §4 reframed protocol
// claims: earned, cannot be bought/sold/given away.)
export const THE_WORK = {
  rail: 'sec 03 / the work',
  kicker: 'The work',
  heading: 'The work you do earns you a share',
  lead:
    'Post the work, claim it, review it, pay it. When your work is approved you earn ownership in the organization, recorded in the open on a board the whole group can see.',
  points: [
    {
      title: 'Ownership is earned, not bought',
      body:
        'Ownership is earned when your work is approved. It cannot be bought, sold, or given away.',
    },
    {
      title: 'Tasks pay in dollars and build your ownership',
      body:
        'A task can carry a payout in dollars and a share of ownership. The group decides what each piece of work is worth.',
    },
    {
      title: 'The right people take the right work',
      body:
        'Roles can gate who claims and approves a task, so the work goes to the members set up to do it.',
    },
  ],
  // Figure microcopy for the spec plate (direction-specific, vocab-clean).
  fig: {
    id: 'fig 03',
    txt: 'shared task board · payouts of 5 to 50 shares, posted in the open',
    anno: 'each column is a stage: open, in progress, in review, completed',
  },
};

// Section 4 · the say. Governance pain -> votes that count. Uses the vote-tally
// shot. Keep-verbatim: "Voting power is earned by participating, not bought."
export const THE_SAY = {
  rail: 'sec 04 / the say',
  kicker: 'The say',
  heading: 'A real say in the decisions',
  lead:
    'Your group sets how it decides: one person one vote, votes weighted by contribution, or a blend of the two. You pick the rules, and you can change them by vote.',
  // Keep-verbatim, BRIEF §2 "best line on the page".
  earnedLine: 'Voting power is earned by participating, not bought.',
  points: [
    {
      title: 'Choose how you decide',
      body:
        'One person one vote, votes weighted by contribution, or a blend. The choice is the group’s, and it is written into the rules.',
    },
    {
      title: 'Every decision is on the record',
      body:
        'Every decision is recorded with its reasoning, permanently and publicly. Anyone can read how a choice was made.',
    },
    {
      title: 'The rules can change, by vote',
      body:
        'The group can change its own rules by vote. Nothing about how you govern is fixed by Poa.',
    },
  ],
  fig: {
    id: 'fig 04',
    txt: 'a real election · five candidates, member votes, a clear winner',
    anno: 'this vote weight was earned, not bought',
  },
};

// Section 5 · the money (PEAK). Splitting-money pain -> revenue share. Uses the
// treasury + treasury-stats shots. N1 cleared: strong revenue-share form,
// always "when the organization distributes revenue". Money-candor Q&A carries
// (BRIEF §2), reframed as plain answers, not "the fine print".
export const THE_MONEY = {
  rail: 'sec 05 / the money',
  kicker: 'The money',
  heading: 'When the money is shared, your share matches your work',
  lead:
    'The treasury is in the open and can be spent only by the rules the group set. When the organization distributes revenue, your share matches the ownership you earned.',
  points: [
    {
      title: 'A treasury spent only by the rules',
      body:
        'The books are open to every member, and major spending requires a vote. Money moves the way the group agreed it would.',
    },
    {
      title: 'Revenue split by earned share',
      body:
        'When the organization distributes revenue, it is split in proportion to the ownership each member earned.',
    },
    {
      title: 'Check your own share',
      body:
        'You can check your share yourself, without trusting anyone’s spreadsheet, and cash out to Cash App, Venmo, Revolut, or your bank.',
    },
  ],
  // Money-candor line: who holds the money. Kept plain and affirming.
  candor:
    'The money is held by the organization itself, not by Poa. Poa never holds it, and never takes a cut.',
  // Stat readout for the navy plate (real Argus numbers).
  stats: [
    { k: 'distributed', v: '3 profit shares' },
    { k: 'claimed', v: '100%' },
    { k: 'held by Poa', v: '0', nocaps: true },
  ],
  fig: {
    id: 'fig 05',
    txt: 'active profit shares · every share distributed to the members who earned it',
    anno: 'split by earned share, 100% claimed',
  },
  statsFig: {
    id: 'fig 05a',
    txt: 'shared treasury · transparent finances for all members, major spending by vote',
  },
};

// Section 6 · the people. Who-does-what pain: roles with exact written powers,
// join by vouch in seconds, audiences. Uses team-matrix + team-members shots.
// Template names are the real deployment templates.
export const THE_PEOPLE = {
  rail: 'sec 06 / the people',
  kicker: 'The people',
  heading: 'Roles with their powers written down',
  lead:
    'Every role has its powers written down: who can approve work, set budgets, or run a vote. Nothing is left to whoever happens to have the keys.',
  points: [
    {
      title: 'Powers are written, not assumed',
      body:
        'Each role spells out exactly what it can do. When officers change, the powers stay put and the organization keeps its shape.',
    },
    {
      title: 'Join in seconds',
      body:
        'A member vouches for you, or you take an open role, and you are in. An account is a username and a passkey.',
    },
  ],
  audiences: [
    { line: 'Student organizations', template: 'student organization' },
    { line: 'Community spaces', template: 'community organization' },
    { line: 'Creative collectives', template: 'creative collective' },
    { line: 'Open-source projects', template: 'open-source project' },
    { line: 'Worker owned businesses', template: 'worker cooperative' },
  ],
  fig: {
    id: 'fig 06',
    txt: 'roles and their exact powers · join, approve, shares, vote',
  },
  membersFig: {
    id: 'fig 06a',
    txt: 'real members, grouped by role · activity in the open',
  },
};

// Section 7 · proof band. Keep-verbatim trust line + LIVE registry counts +
// explore link. Live numbers are the proof (exploreStats capture is optional
// support). The count sentence is assembled in the component from live data.
export const PROOF = {
  rail: 'sec 07 / the record',
  kicker: 'The record',
  // Keep-verbatim (BRIEF §2), the trust engine.
  line: 'Every organization on Poa is public: its rules, its decisions, its books.',
  // Built from live counts: `{n} organizations and {m} members keep their books here.`
  countSuffix: 'keep their books here.',
  cta: 'Read the books for yourself',
  ctaHref: '/explore',
};

// Section 8 · ethos plate. The mission moment on the civic-deep plate.
// "The people who do the work own the most" promoted to centerpiece
// (BRIEF §2). One rented-software sentence allowed. Affirmation of property,
// no villains. "Poa runs on Poa, books public" carries verbatim.
export const ETHOS = {
  rail: 'sec 08 / the reason',
  kicker: 'The reason',
  // Promoted centerpiece, the nine-word promise.
  centerpiece: 'The people who do the work own the most',
  body:
    'There are no outside shares. Ownership belongs to the people in the organization, and it is earned, not bought. What you earn stays yours, and no one can take it from you, including us.',
  // The single permitted rented-software sentence.
  rented:
    'Most software is rented. Poa is owned: your group holds the rules, the money, and the record, and can take them anywhere.',
  // Keep-verbatim, with the live-linked variant handled in the component.
  selfHost: 'Poa itself runs as an organization on Poa.',
  selfHostLink: 'Our books are public too',
};

// Section 9 · start + close. Three steps + CTA pair. The closing grace note
// lives in the colophon (FOOTER_FULL.graceNote), not as a headline.
export const START_CLOSE = {
  rail: 'sec 09 / start',
  kicker: 'Start',
  heading: 'Start in three steps',
  steps: [
    {
      no: '01',
      title: 'Choose the rules',
      body:
        'Pick a template and set how your group decides, pays, and shares. You can change any of it later by vote.',
    },
    {
      no: '02',
      title: 'Bring the people',
      body:
        'Vouch in the first members and hand out roles. Each one carries the powers you wrote for it.',
    },
    {
      no: '03',
      title: 'Run it in the open',
      body:
        'Post work, run votes, share the money. Everything is on the record, and the books are open to every member.',
    },
  ],
  // Always-safe charges-nothing line (BRIEF §4 default).
  quiet: 'An account is a username and a passkey. Poa charges nothing.',
  ctaPrimary: 'Start an organization',
  ctaSecondary: 'Browse organizations',
  ctaSecondaryHref: '/explore',
};

export const LANDING_COPY = {
  NAV,
  HERO,
  LEDGER,
  PROBLEM,
  THE_WORK,
  THE_SAY,
  THE_MONEY,
  THE_PEOPLE,
  PROOF,
  ETHOS,
  START_CLOSE,
  FOOTER: FOOTER_FULL,
};

export default LANDING_COPY;
