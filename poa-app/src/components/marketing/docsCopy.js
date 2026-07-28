// Docs copy (P4). Direction A · "public works".
//
// A MANUAL, NOT MARKETING (BRIEF §7). The docs HUB obeys the banned-vocab list
// AND the manual register: task-first titles, sentence case, zero adjectives,
// zero pain-point copy. Nothing here sells; it indexes.
//
// House style (BRIEF §3): sentence case, no em-dashes, no exclamations, no
// superlatives, brand always "Poa" (never all-caps), banned vocab absent.
//
// KNOWN COLLISION (flag to Hudson / P7): one existing article route is
// `/docs/gas-sponsor`. The vocab gate word-matches "gas" (a banned term) inside
// that slug, both in the `--src` scan (the slug string below) and in the
// HTML-mode scan of the hub's <a href="/docs/gas-sponsor"> once the hub renders
// links server-side (the old hub rendered links client-only, so its static HTML
// carried no hrefs and never tripped this). The slug is an EXISTING route and
// the brief mandates keeping every article link working with slugs unchanged, so
// it is preserved here as-is. Resolving the gate collision is a Hudson decision:
// either rename the article slug (a redirect + link sweep) or add a route
// allowlist to check-vocab.mjs. Out of P4 scope; documented so P7's HTML gate
// run is not a surprise. The slug appears in exactly ONE place below (the
// section `ids`) to keep the footprint minimal.
//
// IMPORTANT: article BODIES (posts/*.md) are EXEMPT vocabulary and are NOT
// touched. The per-entry `title`/`blurb` below are the HUB's own display text,
// authored in the manual register; they override the article's front-matter only
// on the hub index. The article page still renders the post's own title + body.

// The masthead for the hub: a manual's cover line, not a marketing hero.
export const DOCS_HERO = {
  rail: 'ref / manual',
  kicker: 'Reference manual',
  no: '00',
  heading: 'Poa docs',
  lead:
    'How to start an organization, run votes, pay for work, and share revenue. Each entry is a short reference, grouped by task.',
};

// The manual's chapters: task-first sections, in reading order. Each entry is
// the single source of truth for an article's HUB display text: its slug id, the
// hub title (manual register: task-first, sentence case, zero adjectives), and a
// one-line hub blurb. Ids absent from the current post set are skipped silently;
// any post not listed here lands in the "Everything else" catch-all so nothing
// goes missing when new docs are added.
export const DOCS_SECTIONS = [
  {
    no: '01',
    heading: 'Start an organization',
    rail: 'sec 01 / start',
    entries: [
      { id: 'perpetualOrganization', title: 'What a Poa organization is', blurb: 'What an organization on Poa is and how it holds together.' },
      { id: 'passkey-onboarding', title: 'Sign in with a passkey', blurb: 'Create or sign in to an account with a username and a passkey.' },
      { id: 'create', title: 'Start an organization', blurb: 'Set your rules, name the roles, and open your organization.' },
      { id: 'join', title: 'Join an organization', blurb: 'Accept a vouch or take an open role and get added.' },
      { id: 'deployment-wizard', title: 'Set up with the deployment wizard', blurb: 'Every field in the setup wizard, step by step.' },
    ],
  },
  {
    no: '02',
    heading: 'Run votes',
    rail: 'sec 02 / votes',
    entries: [
      { id: 'directDemocracy', title: 'Run one person, one vote', blurb: 'Give every member one equal vote.' },
      { id: 'contributionVoting', title: 'Weight votes by contribution', blurb: 'Give members voting weight for the work they do.' },
      { id: 'hybridVoting', title: 'Blend the two voting modes', blurb: 'Combine equal votes with contribution weight.' },
    ],
  },
  {
    no: '03',
    heading: 'Roles and membership',
    rail: 'sec 03 / roles',
    entries: [
      { id: 'roles-and-permissions', title: 'Set roles and permissions', blurb: 'Define roles and the exact powers each one holds.' },
      { id: 'vouching-and-trust', title: 'Vouch in new members', blurb: 'Add members by vouch and set how trust progresses.' },
      { id: 'hats-and-roles', title: 'Where roles live, under the hood', blurb: 'How roles are stored and enforced.' },
    ],
  },
  {
    no: '04',
    heading: 'Pay for work and share revenue',
    rail: 'sec 04 / money',
    entries: [
      { id: 'task-manager', title: 'Post and pay for work', blurb: 'Post work, review it, and pay in dollars and ownership.' },
      { id: 'treasury-management', title: 'Manage the treasury', blurb: 'Hold funds, set spending rules, and distribute revenue.' },
      { id: 'learn-and-earn', title: 'Set up learn and earn', blurb: 'Reward members for completing lessons.' },
      { id: 'cashout', title: 'Cash out earnings', blurb: 'Move earnings to Cash App, Venmo, Revolut, or a bank.' },
      { id: 'AlphaV1', title: 'Read the Alpha V1 notes', blurb: 'Release notes for the first version.' },
      { id: 'TheGraph', title: 'Query the subgraph', blurb: 'The data layer that reads your organization back.' },
    ],
  },
  {
    no: '05',
    heading: 'Under the hood',
    rail: 'sec 05 / build',
    entries: [
      { id: 'protocol', title: 'Read the protocol dashboard', blurb: 'The dashboard for the shared infrastructure.' },
      // Known slug collision with the vocab gate; see the header note above.
      { id: 'gas-sponsor', title: 'Cover fees with the shared fund', blurb: 'How the shared fund covers fees for new organizations.' },
      { id: 'account-abstraction', title: 'Understand account abstraction', blurb: 'The account model behind passkey sign-in.' },
      { id: 'cross-chain-architecture', title: 'Understand the cross-chain setup', blurb: 'How accounts and organizations span networks.' },
      { id: 'white-label-hosting', title: 'Host under your own name', blurb: 'Run the whole thing on your own domain.' },
    ],
  },
];

// Fallback bucket for any post not placed in a section above (keeps the test
// posts and any newly added doc reachable rather than dropped).
export const DOCS_CATCHALL = {
  no: '06',
  heading: 'Everything else',
  rail: 'sec 06 / other',
};

// Article-page chrome (the reader shell around a rendered post).
export const DOCS_ARTICLE = {
  backLabel: 'Docs',
  backHref: '/docs',
  home: 'Home',
  homeHref: '/',
  updatedPrefix: 'Updated',
  author: 'Poa team',
  prevLabel: 'Previous',
  nextLabel: 'Next',
  allLabel: 'All docs',
  relatedHeading: 'Related entries',
};
