// P0 product-evidence manifest. Real, logged-out captures of live organizations on
// Poa (no seeded or fabricated data), photographed from the static export by
// scripts/marketing/capture-product-shots.mjs. Alt text and captions are ship-ready
// marketing copy and obey the vocabulary policy in docs/landing-overhaul-v2/BRIEF.md.
// Dimensions are the PNG pixel sizes (deviceScaleFactor baked in); render at half
// (desktop, DSF 2) or one third (mobile, DSF 3) for crisp 1x layout sizes.

export const PRODUCT_SHOTS = {
  taskDetail: {
    src: '/images/product/task-detail.webp',
    width: 1344,
    height: 816,
    dsf: 2,
    org: 'Decentral Park',
    alt: 'A completed task in a community organization: propagate plant cuttings and install propagation sculptures, claimed by a member, with a reward of 50 shares.',
    caption: 'Finished work earns ownership. This task paid 50 shares when it was approved.',
  },
  tasksBoard: {
    src: '/images/product/tasks-board.webp',
    width: 2400,
    height: 1630,
    dsf: 2,
    org: 'Decentral Park',
    alt: 'A task board for a community workspace project with columns for open, in progress, in review, and completed work, each task showing its payout in shares.',
    caption: 'Work is posted, claimed, reviewed, and paid on a shared board.',
  },
  voteTally: {
    src: '/images/product/vote-tally.webp',
    width: 1200,
    height: 968,
    dsf: 2,
    org: 'KUBI',
    alt: 'Election results for a director of education role: five candidates, real member votes, and a clear winner at 85 percent.',
    caption: 'A real election, decided by the members and recorded permanently.',
  },
  treasury: {
    src: '/images/product/treasury.webp',
    width: 1392,
    height: 1184,
    dsf: 2,
    org: 'Argus',
    alt: 'Active profit shares in an organization treasury: three distributions, each fully claimed by the members who earned them.',
    caption: 'When the organization distributes revenue, your share matches the ownership you earned.',
  },
  treasuryStats: {
    src: '/images/product/treasury-stats.webp',
    width: 1400,
    height: 464,
    dsf: 2,
    org: 'Argus',
    alt: 'A shared treasury header reading: transparent finances for all members, major spending requires a vote.',
    caption: 'The books are open to every member. Major spending requires a vote.',
  },
  teamMatrix: {
    src: '/images/product/team-matrix.webp',
    width: 2272,
    height: 512,
    dsf: 2,
    org: 'KUBI',
    alt: 'A permissions table showing each role in the organization and exactly what it can do.',
    caption: 'Every role has its powers written down.',
  },
  teamMembers: {
    src: '/images/product/team-members.webp',
    width: 2272,
    height: 1646,
    dsf: 2,
    org: 'KUBI',
    alt: 'The members of a student organization, each with their roles and activity.',
    caption: 'Real people, real roles, in the open.',
  },
  exploreStats: {
    src: '/images/product/explore-stats.webp',
    width: 1000,
    height: 230,
    dsf: 2,
    org: 'registry',
    alt: 'Live counts from the public registry of organizations on Poa.',
    caption: 'Every organization on Poa is public: its rules, its decisions, its books.',
  },
  tasksBoardMobile: {
    src: '/images/product/tasks-board-mobile.webp',
    width: 1170,
    height: 2532,
    dsf: 3,
    org: 'Decentral Park',
    alt: 'The task list on a phone: community tasks with their status and payout in shares.',
    caption: 'The whole organization fits in a pocket.',
  },
};

export const PRODUCT_SHOT_LIST = Object.values(PRODUCT_SHOTS);
