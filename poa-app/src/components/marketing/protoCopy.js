// Bake-off control copy (P1). All three direction prototypes import this module
// verbatim - identical copy is the controlled variable so judges score design,
// not words. Direction-specific wording is allowed ONLY in microcopy (figure
// labels, plate captions, data-chip labels), never in these strings.
// Vocab: obeys docs/landing-overhaul-v2/BRIEF.md §3 (checked with check-vocab.mjs --src).
// Final shipping copy is chosen later at Gate 2; do not wordsmith here.

export const PROTO_COPY = {
  nav: {
    links: ['How it works', 'Docs', 'Organizations', 'About'],
    signIn: 'Sign in',
    cta: 'Start an organization',
  },

  hero: {
    eyebrow: 'Organizations owned by the people in them',
    headline: 'Do the work. Own what you build.',
    subline:
      'On Poa, the work you finish earns you real ownership. A share of the money when your organization distributes revenue, and a real say in the decisions. It is earned, never bought.',
    ctaPrimary: 'Start an organization',
    ctaSecondary: 'See how it works',
    quiet: 'An account is a username and a passkey. Poa charges nothing.',
  },

  pain: {
    kicker: 'The upside',
    heading: 'Your work becomes your share',
    lead:
      'Most groups run on effort that is never written down, and the people doing the most own nothing. Poa turns approved work into ownership, in the open, by rules the group sets for itself.',
    items: [
      {
        title: 'Ownership is earned',
        body:
          'When your work is approved, you earn ownership in the organization. It cannot be bought, sold, or given away.',
      },
      {
        title: 'Revenue is split by the numbers',
        body:
          'When the organization distributes revenue, your share matches the ownership you earned.',
      },
      {
        title: 'Votes that count',
        body:
          'One person one vote, votes weighted by contribution, or a blend. Your group picks its own rules and can change them by vote.',
      },
    ],
  },

  proof: {
    kicker: 'The product',
    heading: 'Real organizations run on Poa every day',
    shots: [
      {
        key: 'tasks',
        caption: 'Work is posted, claimed, reviewed, and paid on a shared board.',
      },
      {
        key: 'treasury',
        caption:
          'Revenue is distributed in proportion to earned ownership. Every member can check their share.',
      },
    ],
    supporting:
      'Every organization on Poa is public: its rules, its decisions, its books.',
  },

  footer: {
    tagline: 'Organizations owned by the people in them',
    links: ['How it works', 'Docs', 'Organizations', 'About'],
    selfHost: 'Poa itself runs as an organization on Poa. Our books are public too.',
  },
};
