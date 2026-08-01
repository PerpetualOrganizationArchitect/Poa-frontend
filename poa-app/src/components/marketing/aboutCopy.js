// Production /about copy (P3). Direction A · "public works".
//
// The /about page re-grounds the landing's story in five blocks (BRIEF §6):
//   1. The belief. One paragraph, dual-read, the page's display moment.
//   2. The problem we saw. The group-chat era; ownership going to platforms; no
//      villains except formlessness.
//   3. What Poa is. Three sentences, benefit-first.
//   4. How we hold ourselves to it. Poa runs on Poa, books public, AGPL,
//      self-hostable, no one can lock you in, including us.
//   5. Where we are. Honest and small, link to /explore.
//
// House style (BRIEF §3): sentence case, no em-dashes, no exclamations, no
// superlatives, brand always "Poa" (never all-caps), banned vocab absent, every
// value-laden line passes the dual-read test (self-reliance + fairness both).
// Verified clean by scripts/marketing/check-vocab.mjs --src.
//
// Draft ship-grade; Gate 2 (the copy panel) may revisit wording.

// ── Block 1 · The belief ──────────────────────────────────────────────────
// The display moment. A short belief line set large, then one dual-read
// paragraph. "We think the people who build a thing should own it" register.
export const BELIEF = {
  rail: 'about 01 / the belief',
  kicker: 'The belief',
  // Set large, the one strong display line on this quieter, prose-forward page.
  headline: 'The people who build a thing should own it',
  body:
    'That is the whole idea behind Poa. When a group builds something together, the ownership should belong to the people who did the building, and it should be earned by the work, not handed out by whoever got there first. What you earn is yours, the group decides its own rules together, and no one can quietly take either away.',
};

// ── Block 2 · The problem we saw ──────────────────────────────────────────
// The group-chat era; ownership going to platforms. No villains except
// formlessness (BRIEF §3). The group is alive and stuck, not dying.
export const PROBLEM = {
  rail: 'about 02 / the problem',
  kicker: 'The problem we saw',
  heading: 'A group forms in a chat, and then it outgrows it',
  lead:
    'Most groups start the same way: a chat thread, a shared document, a running list of who owes whom. It works while everyone can hold the whole thing in their head. Then the group grows, the work piles up, and the informal shape starts to strain.',
  items: [
    {
      title: 'The record lives in memory',
      body:
        'Who did what, who is owed what, what the group agreed last month. It is all real, and none of it is written down anywhere the whole group can see.',
    },
    {
      title: 'The money runs through a person',
      body:
        'Funds sit in someone’s personal account because that was the fastest way to start. The split everyone assumed is fair was never actually agreed.',
    },
    {
      title: 'The ownership ends up elsewhere',
      body:
        'The tools a group leans on to organize tend to own the audience, the data, and the relationship. The people doing the work build value that lands with the platform, not with them.',
    },
  ],
  // The close: name the pain plainly, still no villain but formlessness.
  close: 'The group was alive and working, and the people doing the most owned none of it.',
};

// ── Block 3 · What Poa is ─────────────────────────────────────────────────
// Three sentences, benefit-first (BRIEF §6). Each traces to a §4 cleared claim.
export const WHAT = {
  rail: 'about 03 / what poa is',
  kicker: 'What Poa is',
  heading: 'A place to turn a group into an organization it owns',
  sentences: [
    'Poa gives your group one place to run itself: a shared treasury, tasks that pay for the work, votes that settle decisions, and roles with their powers written down.',
    'The work you do earns you real ownership, a share of the money and a say in what happens next, and that ownership is earned, never bought or sold.',
    'Everything is in the open and yours to take anywhere, and Poa charges nothing to use it.',
  ],
};

// ── Block 4 · How we hold ourselves to it ─────────────────────────────────
// Poa runs as an organization on Poa, books public, AGPL, self-hostable,
// "built so no one can lock you in, including us." (BRIEF §6.) The live-linked
// "our books are public too" is handled in the component via the registry hook,
// mirroring the landing Ethos plate.
export const HOLD = {
  rail: 'about 04 / how we hold ourselves',
  kicker: 'How we hold ourselves to it',
  heading: 'We run Poa the way we ask you to run yours',
  body:
    'Poa itself runs as an organization on Poa. The people who build it earn ownership by the work, decisions are made by vote, and the record is public. If the product does not work for a real organization, we are the first to feel it.',
  // Sentence prefix + live-linked tail (component adds the org link when the
  // registry confirms the Poa org exists; keep-verbatim self-host line).
  selfHost: 'Poa itself runs as an organization on Poa.',
  selfHostLink: 'Our books are public too',
  points: [
    {
      title: 'Open-source, under the AGPL',
      body:
        'Every line of Poa is public and licensed so that anyone who runs it has to keep their version open too.',
    },
    {
      title: 'Yours to host yourself',
      body:
        'You can run your own copy of Poa on your own terms. Nothing about your organization depends on us staying in the picture.',
    },
    {
      title: 'No lock-in, including by us',
      body:
        'Your group holds its own rules, money, and record, and can take them elsewhere. Poa is built so no one can lock you in, including us.',
    },
  ],
};

// ── Block 5 · Where we are ────────────────────────────────────────────────
// Honest and small, link to /explore (BRIEF §6). Live registry counts carry the
// honesty; the count sentence is assembled in the component from live data.
export const WHERE = {
  rail: 'about 05 / where we are',
  kicker: 'Where we are',
  heading: 'Early, and out in the open',
  body:
    'Poa is live today and real organizations are already running on it. We are still small, and that is the honest state of things. It also means the groups here now are shaping what Poa becomes.',
  // Rendered as "{n} organizations and {m} members keep their books here." once
  // the live registry answers; stays quietly empty until then.
  countSuffix: 'keep their books here.',
  cta: 'See the organizations for yourself',
  ctaHref: '/explore',
};

export const ABOUT_COPY = {
  BELIEF,
  PROBLEM,
  WHAT,
  HOLD,
  WHERE,
};

export default ABOUT_COPY;
