// Shared production landing copy. Revenue claims remain conditional on distribution.
import { PROTO_COPY } from '@/components/marketing/protoCopy';


export const HERO = {
  eyebrow: 'Built together. Owned together.',
  headline: 'Do the work. Own what you build.',
  headlineLines: ['Do the work.', 'Own what', 'you build.'],
  subline: 'Bring your people together. Turn the work you do into a stake in what you build, a voice in its direction, and a share when revenue is distributed.',
  ctaPrimary: 'Start an organization',
  ctaSecondary: 'See how it works',
};

export const UPSIDE = PROTO_COPY.pain;

export const PROOF_COPY = PROTO_COPY.proof;

export const FOOTER = {
  tagline: PROTO_COPY.footer.tagline, // "Organizations owned by the people in them"
  selfHost: PROTO_COPY.footer.selfHost, // "Poa itself runs as an organization on Poa..."
};


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

export const FOOTER_FULL = {
  tagline: FOOTER.tagline,
  selfHost: FOOTER.selfHost,
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
  colophon: 'Open source. Common ground.',
  std: 'std. 001',
};

export const LEDGER = {
  title: 'Already taking shape.',
  description: 'Real people. Shared work. Organizations of their own.',
};

export const PROBLEM = {
  rail: 'sec 02 / together',
  kicker: 'A shared beginning',
  heading: 'An idea brings you together. Build from there.',
  lead: 'A project. A place. Something your community needs. Give the people who show up a way to carry it forward, together.',
  items: [
    { title: 'Make every contribution count', body: 'Give the work a home, from the first task to the finished project. Everyone can see what has been done and who made it happen.' },
    { title: 'Put the money in the open', body: 'A shared treasury and clear rules for how it moves. Your group knows what it has, and how to share it.' },
    { title: 'Find your direction together', body: 'Bring decisions to the people doing the work. Agree on the rules, then shape what comes next.' },
  ],
  close: 'More than a group. Something you own together.',
};

export const THE_WORK = {
  rail: 'sec 03 / the work',
  kicker: 'The work',
  heading: 'Your work becomes your stake.',
  lead:
    'Every completed task can become a piece of something bigger. When your work is approved, you earn ownership in the organization you are helping build.',
  points: [
    {
      title: 'A stake you earn',
      body:
        'Ownership is earned when your work is approved. It cannot be bought, sold, or given away.',
    },
    {
      title: 'Paid work. Lasting ownership.',
      body:
        'A task can carry a payout in dollars and a share of ownership. The group decides what each piece of work is worth.',
    },
    {
      title: 'A clear path from idea to done',
      body:
        'Post a task, find the right person, and review the result. Your group decides who can do and approve the work.',
    },
  ],
  fig: {
    id: 'fig 03',
    txt: 'shared task board · payouts of 5 to 50 shares, posted in the open',
    anno: 'each column is a stage: open, in progress, in review, completed',
  },
};

export const THE_SAY = {
  rail: 'sec 04 / the say',
  kicker: 'The say',
  heading: 'A voice in what comes next.',
  lead:
    'The people building the organization help shape its direction. Choose how your group votes, make decisions in the open, and put them into motion.',
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

export const THE_MONEY = {
  rail: 'sec 05 / the money',
  kicker: 'The money',
  heading: 'Build something. Share in its success.',
  lead:
    'When the organization distributes revenue, your share follows the ownership you earned. The work you put in has a place in what comes back.',
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
  candor:
    'The money is held by the organization itself, not by Poa. Poa never holds it, and never takes a cut.',
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

export const THE_PEOPLE = {
  rail: 'sec 06 / the people',
  kicker: 'The people',
  heading: 'People make it possible.',
  lead:
    'Make room for the people who move your idea forward. Give each role clear responsibilities, and let new members find their place.',
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
  audienceIntro: {
    kicker: 'Built for',
    heading: 'Find your starting point.',
    body: 'Templates give your group a starting set of roles, joining rules, and voting. Choose one, then make it your own.',
    cta: 'Choose a template',
    href: '/create/',
  },
  audiences: [
    { line: 'Student organizations', description: 'Plan events, share responsibilities, and give the next class a strong start.' },
    { line: 'Community spaces', description: 'Care for a shared place, fund improvements, and recognize the people who keep it going.' },
    { line: 'Creative collectives', description: 'Bring a project to life, make decisions together, and share what it earns.' },
    { line: 'Open-source projects', description: 'Recognize contributions, coordinate maintainers, and put funding behind the work.' },
    { line: 'Worker owned businesses', description: 'Share the work, the decisions, and the revenue with the people building the business.' },
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

export const PROOF = {
  rail: 'sec 07 / the record',
  kicker: 'The record',
  line: 'Every organization on Poa is public: its rules, its decisions, its books.',
  countSuffix: 'keep their books here.',
  cta: 'Read the books for yourself',
  ctaHref: '/explore',
};

export const ETHOS = {
  rail: 'sec 08 / the reason',
  kicker: 'The reason',
  centerpiece: 'What you build together belongs to you.',
  body:
    'The people who do the work earn the ownership. A simple idea, with room for a different kind of organization. One where your effort builds something that stays yours.',
  rented:
    'Your group holds the rules, the money, and the record. Poa is open source, so what you build can keep going on your own terms.',
  selfHost: 'Poa itself runs as an organization on Poa.',
  selfHostLink: 'Our books are public too',
};

export const START_CLOSE = {
  rail: 'sec 09 / start',
  kicker: 'Your next chapter',
  heading: 'Start with your people.',
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
      title: 'Build your first thing',
      body:
        'Post the first task. Make a decision together. Turn a shared idea into something real, one contribution at a time.',
    },
  ],
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
