/**
 * Test fixtures shaped EXACTLY like the access-v2 subgraph responses.
 *
 * Every field name, enum spelling and value type here is taken from
 * `pop-subgraph/schema.graphql` (access-v2/subgraph branch) — BigInt fields come back as STRINGS
 * from graphql-js, Int fields as numbers, Bytes as lowercased 0x-hex. Tests that invent their own
 * shapes prove nothing about the real payload, so the fixtures are the contract.
 *
 * The org modelled here is the KUBI-shaped one from the spec: a Members role everyone can join, an
 * Executives role Members' managers come from, and an "Everyone" group over both.
 */

export const AUTHORITY_ADDRESS = '0x1111111111111111111111111111111111111111';
export const EXECUTOR_ADDRESS = '0x9999999999999999999999999999999999999999';
export const ORG_ID = '0xa71879ef0e38b15fe7080196c0102f859e0ca8e7b8c0703ec8df03c66befd069';

export const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export const CAROL = '0xcccccccccccccccccccccccccccccccccccccccc';

/** Adopted legacy hat ids (a migrated org keeps its hatIds verbatim). */
export const MEMBERS_ID = ((1n << 224n) | (1n << 208n)).toString();
export const EXECS_ID = ((1n << 224n) | (2n << 208n)).toString();
/** A v2-native id: (uint160(authority) << 64) | 1. */
export const EVERYONE_GROUP_ID = ((BigInt(AUTHORITY_ADDRESS) << 64n) | 1n).toString();

export const authorityNode = (overrides = {}) => ({
  id: AUTHORITY_ADDRESS,
  executor: EXECUTOR_ADDRESS,
  paused: false,
  subjectCount: 3,
  roleSubjectCount: 2,
  groupSubjectCount: 1,
  acceptedMembershipCount: 3,
  maxDailyVouches: 0,
  isRouterBound: true,
  cutoverAt: '1750000000',
  registeredAt: '1749000000',
  ...overrides,
});

export const membersSubject = (overrides = {}) => ({
  id: MEMBERS_ID,
  subjectId: MEMBERS_ID,
  kind: 'Role',
  name: 'Members',
  metadataCID: null,
  imageURI: 'ipfs://members.png',
  maxMembers: 0,
  memberCount: 2,
  activeMemberCount: 2,
  defaultAllow: true,
  isLegacyAdopted: true,
  createdAt: '1749000000',
  vouchConfig: null,
  managerConfig: {
    id: MEMBERS_ID,
    managerSubjectId: EXECS_ID,
    caps: 3,
    canGrant: true,
    canRemove: true,
    delaySecs: '172800',
    enabled: true,
    managerSubject: { id: EXECS_ID, name: 'Executives' },
  },
  perms: [
    {
      id: `${MEMBERS_ID}-ddvote-0`,
      // DD_VOTE, global ctx, exists + value 1.
      permKey: '0x00d2ccbeefc4233e480c89e84be328b119863efcb2c62fef63721ac7dffbc752',
      ctx: `0x${'0'.repeat(64)}`,
      isGlobalCtx: true,
      foldTag: 0,
      word: ((1n << 255n) | 1n).toString(),
      exists: true,
      inheritGlobal: false,
      value: '1',
    },
  ],
  memberRoles: [],
  groups: [
    {
      id: `${EVERYONE_GROUP_ID}-${MEMBERS_ID}`,
      groupSubjectId: EVERYONE_GROUP_ID,
      roleSubjectId: MEMBERS_ID,
      isActive: true,
    },
  ],
  ...overrides,
});

export const execsSubject = (overrides = {}) => ({
  id: EXECS_ID,
  subjectId: EXECS_ID,
  kind: 'Role',
  name: 'Executives',
  metadataCID: null,
  imageURI: '',
  maxMembers: 5,
  memberCount: 1,
  activeMemberCount: 1,
  defaultAllow: false,
  isLegacyAdopted: true,
  createdAt: '1749000001',
  vouchConfig: {
    id: EXECS_ID,
    quorum: 2,
    voucherSubjectId: EXECS_ID,
    epoch: '3',
    voucherSubject: { id: EXECS_ID, name: 'Executives' },
  },
  managerConfig: null,
  perms: [],
  memberRoles: [],
  groups: [
    {
      id: `${EVERYONE_GROUP_ID}-${EXECS_ID}`,
      groupSubjectId: EVERYONE_GROUP_ID,
      roleSubjectId: EXECS_ID,
      isActive: true,
    },
  ],
  ...overrides,
});

export const everyoneGroup = (overrides = {}) => ({
  id: EVERYONE_GROUP_ID,
  subjectId: EVERYONE_GROUP_ID,
  kind: 'Group',
  name: 'Everyone',
  metadataCID: null,
  imageURI: '',
  maxMembers: 0,
  memberCount: 0,
  activeMemberCount: 0,
  defaultAllow: false,
  isLegacyAdopted: false,
  createdAt: '1749000002',
  vouchConfig: null,
  managerConfig: null,
  perms: [
    {
      id: `${EVERYONE_GROUP_ID}-tm-0`,
      // TM_PERMS, global ctx, CLAIM (2).
      permKey: '0x01d1007359947de61bae5632c8492d9be17185b0568f9935575dff632664271e',
      ctx: `0x${'0'.repeat(64)}`,
      isGlobalCtx: true,
      foldTag: 1,
      word: ((1n << 255n) | 2n).toString(),
      exists: true,
      inheritGlobal: false,
      value: '2',
    },
  ],
  memberRoles: [
    {
      id: `${EVERYONE_GROUP_ID}-${MEMBERS_ID}`,
      groupSubjectId: EVERYONE_GROUP_ID,
      roleSubjectId: MEMBERS_ID,
      isActive: true,
    },
    {
      id: `${EVERYONE_GROUP_ID}-${EXECS_ID}`,
      groupSubjectId: EVERYONE_GROUP_ID,
      roleSubjectId: EXECS_ID,
      isActive: true,
    },
  ],
  groups: [],
  ...overrides,
});

export const subjectsResponse = () => ({
  membershipAuthorityContract: {
    id: AUTHORITY_ADDRESS,
    paused: false,
    subjects: [membersSubject(), execsSubject(), everyoneGroup()],
  },
});

/** Alice: an active Member via the open default. */
export const aliceMembership = (overrides = {}) => ({
  id: `${MEMBERS_ID}-${ALICE}`,
  user: ALICE,
  userUsername: 'alice',
  accepted: true,
  acceptedAt: '1750000100',
  seededWhilePaused: false,
  eligible: true,
  eligibilitySource: 'SubjectDefault',
  isMember: true,
  claimable: false,
  ruleKind: 'None',
  emailVerified: false,
  vouchCount: 0,
  vouchEpoch: '0',
  vouchMet: false,
  subject: {
    id: MEMBERS_ID,
    subjectId: MEMBERS_ID,
    kind: 'Role',
    name: 'Members',
    imageURI: 'ipfs://members.png',
    defaultAllow: true,
    maxMembers: 0,
  },
  rule: null,
  pendingAction: null,
  ...overrides,
});

/** Bob: an Executive held by a STICKY governance grant (an election result). */
export const bobExecMembership = (overrides = {}) => ({
  id: `${EXECS_ID}-${BOB}`,
  user: BOB,
  userUsername: 'bob',
  accepted: true,
  acceptedAt: '1750000200',
  seededWhilePaused: false,
  eligible: true,
  eligibilitySource: 'ExplicitGrant',
  isMember: true,
  claimable: false,
  ruleKind: 'Grant',
  emailVerified: false,
  vouchCount: 0,
  vouchEpoch: '3',
  vouchMet: false,
  subject: {
    id: EXECS_ID,
    subjectId: EXECS_ID,
    kind: 'Role',
    name: 'Executives',
    imageURI: '',
    defaultAllow: false,
    maxMembers: 5,
  },
  rule: {
    id: `${EXECS_ID}-${BOB}`,
    kind: 'Grant',
    author: 'Governance',
    delegable: false,
    sticky: true,
  },
  pendingAction: null,
  ...overrides,
});

/**
 * Bob AFTER renouncing his sticky Executives seat — the "Held for you" row, in the exact shape the
 * subgraph produces.
 *
 * Renounce runs `_flipOff` on chain (which zeroes acceptedAt) and the mapping mirrors it:
 * `accepted = false; acceptedAt = null; seededWhilePaused = false`. The STICKY GRANT RULE SURVIVES
 * untouched, which is what keeps the row `claimable`. Building this by spreading
 * `bobExecMembership({ accepted: false, ... })` keeps the fixture's acceptedAt and produces a shape
 * the real mapping never emits — that is how the acceptedAt-based `isHeldInReserve` bug stayed
 * green.
 */
export const bobRenouncedStickySeat = (overrides = {}) => ({
  ...bobExecMembership(),
  accepted: false,
  acceptedAt: null,
  seededWhilePaused: false,
  isMember: false,
  claimable: true,
  // eligible/eligibilitySource are unchanged by renounce: the sticky Grant still qualifies him.
  eligible: true,
  eligibilitySource: 'ExplicitGrant',
  pendingAction: null,
  ...overrides,
});

/** Carol: a CLAIMABLE seat — invited, not yet accepted, with a review-window countdown. */
export const carolOffer = (overrides = {}) => ({
  id: `${EXECS_ID}-${CAROL}`,
  user: CAROL,
  userUsername: 'carol',
  accepted: false,
  acceptedAt: null,
  seededWhilePaused: false,
  eligible: true,
  eligibilitySource: 'ExplicitGrant',
  isMember: false,
  claimable: true,
  ruleKind: 'Grant',
  emailVerified: false,
  vouchCount: 0,
  vouchEpoch: '3',
  vouchMet: false,
  subject: {
    id: EXECS_ID,
    subjectId: EXECS_ID,
    kind: 'Role',
    name: 'Executives',
    imageURI: '',
    defaultAllow: false,
    maxMembers: 5,
  },
  rule: {
    id: `${EXECS_ID}-${CAROL}`,
    kind: 'Grant',
    author: 'Delegated',
    delegable: true,
    sticky: false,
  },
  pendingAction: {
    id: `${AUTHORITY_ADDRESS}-7`,
    pendingId: '7',
    action: 'Offer',
    actor: BOB,
    actorUsername: 'bob',
    activatesAt: '1750100000',
    status: 'Pending',
  },
  ...overrides,
});

export const pendingActionRow = (overrides = {}) => ({
  id: `${AUTHORITY_ADDRESS}-7`,
  pendingId: '7',
  action: 'Offer',
  user: CAROL,
  actor: BOB,
  actorUsername: 'bob',
  activatesAt: '1750100000',
  status: 'Pending',
  createdAt: '1750000000',
  resolvedAt: null,
  cancelledBy: null,
  subject: { id: EXECS_ID, subjectId: EXECS_ID, name: 'Executives', kind: 'Role' },
  ...overrides,
});

export const vouchRecord = (overrides = {}) => ({
  id: `${EXECS_ID}-${CAROL}-${ALICE}`,
  user: CAROL,
  voucher: ALICE,
  voucherUsername: 'alice',
  active: true,
  seeded: false,
  epoch: '3',
  vouchedAt: '1750000050',
  revokedAt: null,
  config: { id: EXECS_ID, quorum: 2, voucherSubjectId: EXECS_ID, epoch: '3' },
  ...overrides,
});
