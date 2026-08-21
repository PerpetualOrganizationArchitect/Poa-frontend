import {
  PiCompass,
  PiHouse,
  PiChartBar,
  PiKanban,
  PiArticle,
  PiScales,
  PiGavel,
  PiPencilLine,
  PiBank,
  PiGraduationCap,
  PiTreeStructure,
  PiFolderPlus,
  PiCheckSquare,
  PiClipboardText,
  PiSignIn,
  PiSparkle,
} from 'react-icons/pi';

export const TOUR_STEPS = [
  // --- Dashboard ---
  {
    id: 'nav',
    page: '/dashboard',
    title: 'Navigation',
    description: 'Use these tabs to move between your organization\'s main sections: Dashboard, Tasks, Voting, and more.',
    icon: PiCompass,
    action: null,
    target: '[data-tour="nav-links"]',
    placement: 'bottom',
    forceInteraction: false,
  },
  {
    id: 'org-info',
    page: '/dashboard',
    title: 'Organization Profile',
    description: 'This is your org\'s public profile. It displays your logo, description, and links. You can also copy the invite link here to share with new members.',
    icon: PiHouse,
    action: null,
    target: '[data-tour="org-info"]',
    placement: 'right',
    forceInteraction: false,
  },
  {
    id: 'org-stats',
    page: '/dashboard',
    title: 'Key Metrics',
    description: 'A real-time snapshot of your organization: total members, participation tokens in circulation, and how many tasks are active or completed.',
    icon: PiChartBar,
    action: null,
    target: '[data-tour="org-stats"]',
    placement: 'left',
    forceInteraction: false,
  },

  // --- Tasks ---
  {
    id: 'tasks',
    page: '/tasks',
    title: 'Task Board',
    description: 'Your team\'s workspace. Tasks flow through four stages: Open, In Progress, In Review, and Completed. Members claim open tasks, do the work, submit for review, and earn tokens once approved.',
    icon: PiKanban,
    action: null,
    target: '[data-tour="task-board"]',
    placement: 'bottom',
    forceInteraction: false,
  },
  {
    id: 'task-card',
    page: '/tasks',
    title: 'Reading a Task Card',
    description: 'Every card shows the task name, description, difficulty (color-coded: green for easy, yellow for medium, orange for hard), estimated hours, and the token reward.',
    icon: PiKanban,
    action: null,
    // Match either a real card (orgs with projects) or the demo card (fresh orgs)
    target: '[data-tour="task-card"], [data-tour="example-task-card"]',
    placement: 'left',
    forceInteraction: false,
  },
  {
    id: 'task-detail',
    page: '/tasks',
    title: 'Task Details',
    description: 'Clicking a task opens its full detail view with the complete description, difficulty, time estimate, and reward. Members use this view to claim tasks, submit their work, and track progress.',
    icon: PiArticle,
    action: null,
    target: '[data-tour="example-task-modal"]',
    placement: 'left',
    forceInteraction: false,
    skip: (ctx) => ctx.hasProjects,
  },

  // --- Org Structure (before project creation so admins understand role hats) ---
  {
    id: 'org-structure',
    page: '/team',
    title: 'Roles & Permissions',
    description: 'This is the blueprint for your organization. It shows every role, what each role is allowed to do, and which members hold which positions. New members can claim or apply for roles from here.',
    icon: PiTreeStructure,
    action: null,
    target: '[data-tour="org-roles"]',
    placement: 'bottom',
    forceInteraction: false,
  },

  // --- Setup actions ---
  // create-project shows for any exec; the title/copy stays neutral so admins
  // re-running the tour aren't told to set up their "first" project.
  {
    id: 'create-project',
    page: '/tasks',
    title: 'Create a Project',
    description: 'Projects group related tasks. Click below to open the setup modal — we\'ve pre-filled a starter name and description so a fresh project is one click away.',
    icon: PiFolderPlus,
    action: 'create-project',
    ctaText: 'Click "Create Project"',
    target: '[data-tour="create-project-btn"]',
    mobileTarget: '[data-tour="create-project-mobile-btn"]',
    placement: 'right',
    forceInteraction: true,
    skip: (ctx) => !ctx.canCreateProject,
  },
  // create-task requires a project to exist (otherwise the add-task-btn isn't
  // mounted). With current-step pinning in TourContext, the user lands here
  // either by successfully creating a project (auto-advance) or by being in
  // the tour with prior projects.
  {
    id: 'create-task',
    page: '/tasks',
    title: 'Add a Task',
    description: 'Click the + button on the Open column to create a task. Give it a name, description, and difficulty level. Once published, any member with the right permissions can claim it.',
    icon: PiCheckSquare,
    action: 'create-task',
    ctaText: 'Click the + button',
    target: '[data-tour="add-task-btn"]',
    placement: 'bottom',
    forceInteraction: true,
    skip: (ctx) => !ctx.canCreateTaskAnywhere || !ctx.hasProjects,
  },

  // --- Voting ---
  {
    id: 'voting-overview',
    page: '/voting',
    title: 'Governance & Voting',
    description: 'This is where your org\'s governance lives. Two voting modes are available: Hybrid for official, binding decisions, and Democracy for informal one-person-one-vote polls.',
    icon: PiScales,
    action: null,
    target: '[data-tour="voting-header"]',
    placement: 'right',
    forceInteraction: false,
  },
  {
    id: 'voting-hybrid-detail',
    page: '/voting',
    title: 'Hybrid Voting Explained',
    description: 'Hybrid voting combines two factors. The Membership component gives every member an equal voice. The Contribution component weighs votes by participation tokens, so members who complete more tasks have greater influence.',
    icon: PiScales,
    action: null,
    target: '[data-tour="voting-hybrid-detail"]',
    placement: 'bottom',
    forceInteraction: false,
  },
  {
    id: 'voting-panel',
    page: '/voting',
    title: 'Active Proposals',
    description: 'All current and past proposals appear here. Members with the appropriate role can create new votes, and everyone can cast their vote before the deadline. Results are recorded permanently on-chain.',
    icon: PiGavel,
    action: null,
    target: '[data-tour="voting-panel"]',
    placement: 'right',
    forceInteraction: false,
  },
  {
    id: 'create-vote-preview',
    page: '/voting',
    title: 'Creating a Vote',
    description: 'As an admin, you can create different types of proposals: Normal votes for general decisions, Elections to assign roles, Fund Transfers to move tokens, and Contract Setting changes. Each creates a structured on-chain vote.',
    icon: PiPencilLine,
    action: null,
    target: null,
    placement: 'bottom-fixed',
    forceInteraction: false,
    noOverlay: true, // Don't darken the page — the Create Vote modal should stay visible
    skip: (ctx) => !ctx.isAuthenticated || !ctx.canCreateProposal,
  },

  // --- Treasury (conditional) ---
  {
    id: 'treasury',
    page: '/treasury',
    title: 'Treasury & Finances',
    description: 'Track your organization\'s token balances, active profit shares, and distribution history. This page will populate as your org completes tasks and distributes rewards.',
    icon: PiBank,
    action: null,
    target: null,
    placement: 'bottom-fixed',
    forceInteraction: false,
    noOverlay: true, // Don't darken — let user see the full treasury page
    skip: (ctx) => ctx.hideTreasury,
  },

  // --- Education Hub (conditional) ---
  {
    id: 'education-hub',
    page: '/learn',
    title: 'Learn & Earn',
    description: 'Complete educational modules and quizzes to earn participation tokens. Admins can create modules with links, questions, and token rewards. This page will fill with content as your org builds its learning library.',
    icon: PiGraduationCap,
    action: null,
    target: '[data-tour="education-hub-content"]',
    placement: 'bottom',
    forceInteraction: false,
    skip: (ctx) => !ctx.educationHubEnabled,
  },

  // --- Ending: Member with existing projects ---
  {
    id: 'claim-task-prompt',
    page: '/tasks',
    title: 'Claim Your First Task',
    description: 'Your organization already has projects set up. Head to the task board, find an open task that matches your skills, and click it to claim it. Completing tasks earns you participation tokens and builds your reputation.',
    icon: PiClipboardText,
    action: null,
    target: null,
    placement: 'center',
    forceInteraction: false,
    skip: (ctx) => !ctx.isAuthenticated || !ctx.hasMemberRole || !ctx.hasProjects,
  },

  // --- Ending: Non-authenticated visitor ---
  {
    id: 'join-prompt',
    page: '/join',
    title: 'Join This Organization',
    description: 'This is where new members join. Connect your wallet or create a passkey account, then apply for a role to start participating in tasks, voting, and governance.',
    icon: PiSignIn,
    action: null,
    target: '[data-tour="join-content"]',
    placement: 'right',
    forceInteraction: false,
    skip: (ctx) => ctx.isAuthenticated,
  },

  // --- Completion (only for admins who created project/task) ---
  {
    id: 'complete',
    page: null,
    title: 'You\'re Ready to Go',
    description: 'Your organization is set up and ready for action. Share the invite link below to bring in members and start collaborating.',
    icon: PiSparkle,
    action: null,
    target: null,
    placement: 'center',
    forceInteraction: false,
    // Skip when member (got claim-task-prompt) or visitor (got join-prompt)
    skip: (ctx) => (ctx.isAuthenticated && ctx.hasMemberRole && ctx.hasProjects) || !ctx.isAuthenticated,
  },
];
