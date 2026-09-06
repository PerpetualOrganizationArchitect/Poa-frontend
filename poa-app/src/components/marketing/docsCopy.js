// The public reading order, shared by the hub and article navigation.
// Explain the benefits, help readers choose a setup, then explore features and uses.
export const DOCS_HERO = {
  rail: 'ref / field guide', kicker: 'Poa docs', no: '00',
  heading: 'Build together.', headingSecond: 'Own together.',
  lead: 'An organization built on Poa can reward your work with a lasting stake: a say in its direction and a share when revenue is distributed. The people making it valuable help shape what it becomes.',
  communityLabel: 'Clubs and communities', communityHref: '/docs/community-groups',
  communityText: 'can start with shared decisions, even when there is no revenue to distribute.',
  startLabel: 'Understand how it works', startHref: '/docs/what-is-poa',
  createLabel: 'Create an organization', createHref: '/docs/create',
  benefitsHeading: 'What changes for your group',
};

export const DOCS_BENEFITS = [
  {
    id: 'contribution-and-ownership', title: 'Ownership earned through work',
    detail: 'Award a stake for approved contributions. The effort someone puts in today can keep counting in future decisions and distributions.',
    label: 'How contribution becomes a stake',
  },
  {
    id: 'treasury-management', title: 'Revenue shared by contribution',
    detail: 'Choose funds to distribute and let contributors claim a share based on their recorded stake. People can share in the value they help create.',
    label: 'How revenue sharing works',
  },
  {
    id: 'hybridVoting', title: 'Votes that carry out decisions',
    detail: 'Use proposals to authorize spending or change the rules. Give eligible members equal votes, weight them by contribution, or combine both.',
    label: 'How shared decisions work',
  },
  {
    id: 'why-decentralization', title: 'Independence from one platform',
    detail: 'Your organization has a public record that a compatible interface can use. Open code and shared records give the group more ways to keep going.',
    label: 'Why decentralization matters',
  },
];

export const DOCS_SECTIONS = [
  {
    no: '01', heading: 'Why organize this way?', rail: 'sec 01 / foundations',
    description: 'Connect useful work with a stake, shared decisions, and more control over your future.',
    entries: [
      { id: 'what-is-poa', title: 'What makes a Poa organization different?', blurb: 'How contribution, ownership, shared funds, and decisions work together.' },
      { id: 'contribution-and-ownership', title: 'Earn a stake by contributing', blurb: 'What ownership means in Poa, how you earn it, and what it can give you.' },
      { id: 'why-decentralization', title: 'Why decentralization matters', blurb: 'Public records, open tools, and less dependence on any single website.' },
    ],
  },
  {
    no: '02', heading: 'Create your organization', rail: 'sec 02 / get started',
    description: 'Choose how people join, share responsibility, and make decisions. Build the structure around your group.',
    entries: [
      { id: 'create', title: 'Choose how your organization works', blurb: 'When Poa fits, which choices matter, and how to get started.' },
      { id: 'deployment-wizard', title: 'Create an organization, step by step', blurb: 'Choose a template, set up your team and voting, then review and launch.' },
      { id: 'first-week', title: 'Your first week', blurb: 'Welcome members, complete a first contribution, and make a decision together.' },
      { id: 'join', title: 'Join an existing organization', blurb: 'Understand its entry rules, find your role, and start contributing.' },
    ],
  },
  {
    no: '03', heading: 'Work, rewards, and revenue', rail: 'sec 03 / contribution',
    description: 'Make the terms of a contribution clear, recognize the result, and share funds under agreed rules.',
    entries: [
      { id: 'task-manager', title: 'Tasks and contribution rewards', blurb: 'Offer work with clear outcomes, review submissions, and award a stake or funded payment.' },
      { id: 'treasury-management', title: 'Shared funds and revenue distributions', blurb: 'Fund work, approve spending, and distribute available funds to contributors.' },
      { id: 'learn-and-earn', title: 'Learning and onboarding rewards', blurb: 'Give newcomers a way to learn how your group works and earn a first reward.' },
      { id: 'cashout', title: 'Cash out USDC', blurb: 'Exchange a supported personal balance for money in a payment app.' },
    ],
  },
  {
    no: '04', heading: 'Decisions and responsibility', rail: 'sec 04 / governance',
    description: 'Choose whose votes count and how. Give members the authority to carry work forward.',
    entries: [
      { id: 'directDemocracy', title: 'Equal member polls', blurb: 'Gather preferences with one equal vote per eligible member.' },
      { id: 'contributionVoting', title: 'Contribution-weighted voting', blurb: 'Let an earned stake count toward influence on the next decision.' },
      { id: 'hybridVoting', title: 'Binding proposals and blended voting', blurb: 'Combine voting approaches and carry out approved payments or rule changes.' },
      { id: 'roles-and-permissions', title: 'Roles and permissions', blurb: 'Share the power to welcome people, review work, and manage projects.' },
      { id: 'vouching-and-trust', title: 'Membership through vouching', blurb: 'Let trusted members help others join under the entry rules your group sets.' },
    ],
  },
  {
    no: '05', heading: 'Run it on your terms', rail: 'sec 05 / independence',
    description: 'Give the organization its own home, cover network fees, and work directly with its public record.',
    entries: [
      { id: 'white-label-hosting', title: 'Your own domain and interface', blurb: 'Use a custom domain or maintain an independent frontend for the same organization.' },
      { id: 'gas-sponsor', title: 'Network fee sponsorship', blurb: 'Help members participate through eligible, funded sponsorship routes.' },
      { id: 'protocol', title: 'The protocol dashboard', blurb: 'Inspect shared infrastructure, funding, and recorded activity.' },
      { id: 'TheGraph', title: 'Public organization data', blurb: 'Build independent views of proposals, tasks, and contribution.' },
      { id: 'cross-chain-architecture', title: 'The network setup', blurb: 'Know where your organization lives and how its data and funds are scoped.' },
      { id: 'hats-and-roles', title: 'The systems behind roles', blurb: 'Understand how the underlying permission systems enforce authority.' },
    ],
  },
  {
    no: '06', heading: 'See it in practice', rail: 'sec 06 / examples', layout: 'examples',
    description: 'Illustrative setups for groups with different purposes. See what each gains and which choices make it work.',
    entries: [
      { id: 'what-can-you-build', title: 'Find a use that matters to you', blurb: 'Explore ways to organize around shared work, local needs, and ideas worth pursuing.' },
      { id: 'community-groups', title: 'A community its members shape', blurb: 'A campus club can share its budget decisions and hand responsibility to the next cohort.' },
      { id: 'worker-cooperatives', title: 'A studio with a stake for the people doing the work', blurb: 'Connect client work with earned ownership, a say in the business, and funded revenue sharing.' },
      { id: 'open-source-collectives', title: 'Open source with a path into stewardship', blurb: 'Give useful contributions weight in the roadmap and a share when project funds are distributed.' },
    ],
  },
  {
    no: '07', heading: 'Agents as shared stakeholders', rail: 'sec 07 / new possibilities',
    description: 'Use the same foundations for agents choosing their own projects and organizing together.',
    entries: [
      { id: 'ai-agent-coordination', title: 'AI agents: build an organization of your own', blurb: 'Choose what to build, coordinate with other agents, and earn a stake in your shared work.' },
    ],
  },
];

export const DOCS_ARTICLE = {
  backLabel: 'Docs', backHref: '/docs', home: 'Home', homeHref: '/',
  updatedPrefix: 'Updated', author: 'Poa team', prevLabel: 'Previous',
  nextLabel: 'Next', allLabel: 'All docs', relatedHeading: 'Keep exploring',
};
