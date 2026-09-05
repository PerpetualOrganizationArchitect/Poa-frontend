/**
 * Access v2 GraphQL documents — the MembershipAuthority model.
 *
 * Kept in their own module (re-exported from `util/queries.js`, so the "import queries from
 * util/queries" convention still holds) for ONE reason: every document in here selects fields that
 * DO NOT EXIST on the endpoints the app reads today. The app talks to the DECENTRALISED GATEWAY
 * subgraphs, which lag Studio by a manual publish, and a single unknown field fails the WHOLE
 * document — so mixing these selections into the existing org queries would break every legacy org
 * page the moment this branch shipped.
 *
 * EVERY consumer of these documents MUST gate on `CAPABILITY.ACCESS_V2` (see
 * `util/subgraphCapabilities`) plus the org's own authority binding. See
 * `lib/accessV2/authority.js`.
 *
 * Shapes are taken verbatim from `pop-subgraph/schema.graphql` on the access-v2/subgraph branch.
 */

import { gql } from '@apollo/client';

/**
 * Is this org on the v2 path, and what is its authority?
 * Cheap enough to run on every org page load once the capability probe passes.
 */
export const FETCH_ORG_AUTHORITY = gql`
  query FetchOrgAuthority($orgId: ID!) {
    organization(id: $orgId) {
      id
      membershipAuthority {
        id
        executor
        paused
        subjectCount
        roleSubjectCount
        groupSubjectCount
        acceptedMembershipCount
        maxDailyVouches
        isRouterBound
        cutoverAt
        registeredAt
      }
    }
  }
`;

/**
 * Every subject in the org, with the wiring the roles/groups admin page renders:
 * group composition both ways, vouch + manager config, and the permission rows.
 *
 * `first: 1000` on the nested collections is not decorative — the default page size is 100 and a
 * silently-truncated perm list would render as "this role has no permissions".
 */
export const FETCH_AUTHORITY_SUBJECTS = gql`
  query FetchAuthoritySubjects($authority: ID!) {
    membershipAuthorityContract(id: $authority) {
      id
      paused
      subjects(first: 1000, orderBy: createdAt, orderDirection: asc) {
        id
        subjectId
        kind
        name
        metadataCID
        imageURI
        maxMembers
        memberCount
        activeMemberCount
        defaultAllow
        isLegacyAdopted
        createdAt
        vouchConfig {
          id
          quorum
          voucherSubjectId
          epoch
          voucherSubject {
            id
            name
          }
        }
        managerConfig {
          id
          managerSubjectId
          caps
          canGrant
          canRemove
          delaySecs
          enabled
          managerSubject {
            id
            name
          }
        }
        perms(first: 1000) {
          id
          permKey
          ctx
          isGlobalCtx
          foldTag
          word
          exists
          inheritGlobal
          value
        }
        memberRoles(first: 100) {
          id
          groupSubjectId
          roleSubjectId
          isActive
        }
        groups(first: 100) {
          id
          groupSubjectId
          roleSubjectId
          isActive
        }
      }
    }
  }
`;

/**
 * The org's membership rows — the fold mirror. Scoped to rows that MATTER
 * (a member, a claimable seat, or an ACCEPTED-but-lapsed one), so a large org does not page in
 * every historical row.
 *
 * The `accepted` branch is what makes the grant-vs-offer decision match the contract: `_isInOrg` is
 * `userSubjectList[user].length > 0` — accepted ANYWHERE, regardless of current eligibility — so
 * an accepted-but-lapsed member is in-org on chain. Without this branch those rows are invisible
 * here and the wizard classifies a real member as an outsider needing an invitation.
 *
 * FILTER SHAPE IS LOAD-BEARING: graph-node REJECTS a column filter that sits next to `or` at the
 * same level — `where: { authority: $a, or: [...] }` fails the whole document with "Cannot mix
 * column filters with 'or' operator at the same level". The scope has to be DISTRIBUTED into every
 * `or` branch instead. This is a graph-node filter-grammar rule, not a schema one, so the
 * capability probe cannot catch it (every selected field exists) — `queriesAccessV2.grammar.test.js`
 * lints it offline and `queriesAccessV2.live.test.js` executes it against a real graph-node.
 */
export const FETCH_AUTHORITY_MEMBERSHIPS = gql`
  query FetchAuthorityMemberships($authority: String!, $first: Int = 1000, $skip: Int = 0) {
    subjectMemberships(
      where: {
        or: [
          { authority: $authority, isMember: true }
          { authority: $authority, claimable: true }
          { authority: $authority, accepted: true }
        ]
      }
      first: $first
      skip: $skip
      # Offset pagination needs a unique, stable order or equal acceptedAt values can skip rows.
      orderBy: id
      orderDirection: asc
    ) {
      id
      user
      userUsername
      accepted
      acceptedAt
      seededWhilePaused
      eligible
      eligibilitySource
      isMember
      claimable
      ruleKind
      emailVerified
      vouchCount
      vouchEpoch
      vouchMet
      subject {
        id
        subjectId
        kind
        name
        imageURI
        defaultAllow
        maxMembers
      }
      rule {
        id
        kind
        author
        delegable
        sticky
      }
      pendingAction {
        id
        pendingId
        action
        actor
        actorUsername
        activatesAt
        status
      }
    }
  }
`;

/**
 * One user's rows across the org — the claimable-roles panel and "my roles".
 * Deliberately NOT filtered on isMember/claimable: a BANNED row is why a role is missing, and the
 * user surface has to be able to say so.
 */
export const FETCH_USER_MEMBERSHIPS = gql`
  query FetchUserMemberships($authority: String!, $user: Bytes!) {
    subjectMemberships(
      where: { authority: $authority, user: $user }
      first: 200
      orderBy: lastUpdatedAt
      orderDirection: desc
    ) {
      id
      user
      accepted
      acceptedAt
      seededWhilePaused
      eligible
      eligibilitySource
      isMember
      claimable
      ruleKind
      emailVerified
      vouchCount
      vouchEpoch
      vouchMet
      subject {
        id
        subjectId
        kind
        name
        imageURI
        defaultAllow
        maxMembers
        activeMemberCount
        vouchConfig {
          id
          quorum
          voucherSubjectId
          epoch
        }
      }
      rule {
        id
        kind
        author
        delegable
        sticky
      }
      pendingAction {
        id
        pendingId
        action
        actor
        actorUsername
        activatesAt
        status
      }
    }
  }
`;

/**
 * The review-window ledger. Open entries only by default — the countdown UI and the
 * "a removal is pending against you" banner both read this.
 */
export const FETCH_PENDING_ACTIONS = gql`
  query FetchPendingActions($authority: String!, $status: String = "Pending") {
    pendingActions(
      where: { authority: $authority, status: $status }
      first: 500
      orderBy: activatesAt
      orderDirection: asc
    ) {
      id
      pendingId
      action
      user
      actor
      actorUsername
      activatesAt
      status
      createdAt
      resolvedAt
      cancelledBy
      subject {
        id
        subjectId
        name
        kind
      }
    }
  }
`;

/** Vouch records for one (subject, user) — the vouch panel's roster. */
export const FETCH_SUBJECT_VOUCH_RECORDS = gql`
  query FetchSubjectVouchRecords($subject: String!, $user: Bytes!) {
    subjectVouchRecords(
      where: { subject: $subject, user: $user }
      first: 200
      orderBy: vouchedAt
      orderDirection: desc
    ) {
      id
      user
      voucher
      voucherUsername
      active
      seeded
      epoch
      vouchedAt
      revokedAt
      config {
        id
        quorum
        voucherSubjectId
        epoch
      }
    }
  }
`;

/** Every vouch record in the org — the org-wide vouching section. */
export const FETCH_AUTHORITY_VOUCH_RECORDS = gql`
  query FetchAuthorityVouchRecords($authority: String!) {
    subjectVouchRecords(
      where: { authority: $authority, active: true }
      first: 1000
      orderBy: vouchedAt
      orderDirection: desc
    ) {
      id
      user
      voucher
      voucherUsername
      active
      seeded
      epoch
      vouchedAt
      subject {
        id
        subjectId
        name
      }
      config {
        id
        quorum
        epoch
      }
    }
  }
`;

/**
 * The membership activity feed — the SEVEN disjoint verbs, rendered verbatim.
 * `RoleClaimed` (the USER acted) is deliberately distinct from `RoleGranted` (an ORG act), and
 * `MembershipReconciled` is an automatic lapse repair that must never read as an org decision.
 */
export const FETCH_MEMBERSHIP_EVENTS = gql`
  query FetchMembershipEvents($authority: String!, $first: Int = 50) {
    subjectMembershipEvents(
      where: { authority: $authority }
      first: $first
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      action
      user
      userUsername
      actor
      actorUsername
      banned
      delegated
      timestamp
      transactionHash
      subject {
        id
        subjectId
        name
        kind
      }
    }
  }
`;

/** Config lints the contract emitted — surfaced next to the config they belong to. */
export const FETCH_CONFIG_LINTS = gql`
  query FetchConfigLints($authority: String!) {
    configLintEvents(
      where: { authority: $authority }
      first: 200
      orderBy: emittedAt
      orderDirection: desc
    ) {
      id
      code
      lintCode
      subjectId
      emittedAt
      subject {
        id
        name
      }
    }
  }
`;
