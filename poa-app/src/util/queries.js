import { gql } from '@apollo/client';

// ============================================
// POP SUBGRAPH QUERIES (Arbitrum + Gnosis)
// Endpoints are configured per-chain in src/config/networks.js
// ============================================

// Access v2 (MembershipAuthority) documents live in their own module because every field they
// select is absent from the endpoints the app reads until the Wave-E gateway publish, and one
// unknown field fails the whole document. They are re-exported here so callers keep importing
// from `util/queries`. Consumers MUST gate on CAPABILITY.ACCESS_V2 — see util/subgraphCapabilities.
export * from './queriesAccessV2';

// Fetch single organization by orgId (bytes)
export const FETCH_ORG_BY_ID = gql`
  query FetchOrgById($id: Bytes!) {
    organization(id: $id) {
      id
      name
      metadataHash
      deployedAt
      topHatId
      roleHatIds
      participationToken {
        id
        name
        symbol
        totalSupply
      }
      quickJoin {
        id
      }
      hybridVoting {
        id
        thresholdPct
        quorum
      }
      directDemocracyVoting {
        id
        thresholdPct
        quorum
      }
      taskManager {
        id
        projects {
          id
          title
          deleted
        }
      }
      educationHub {
        id
        nextModuleId
      }
      executorContract {
        id
      }
      users {
        id
        address
        account {
          username
          metadata {
            avatar
          }
        }
        participationTokenBalance
        membershipStatus
        currentHatIds
      }
      roles(where: { isUserRole: true }) {
        id
        hatId
        name
        image
        canVote
        isUserRole
      }
    }
  }
`;

// Fetch username from UniversalAccountRegistry
export const FETCH_USERNAME_NEW = gql`
  query FetchUsernameNew($id: Bytes!) {
    account(id: $id) {
      id
      username
      profileMetadataHash
      metadata {
        id
        bio
        avatar
        github
        twitter
        website
      }
    }
  }
`;

// Lookup account by username (returns address)
export const GET_ACCOUNT_BY_USERNAME = gql`
  query GetAccountByUsername($username: String!) {
    accounts(where: { username: $username }, first: 1) {
      id
      user
      username
    }
  }
`;

// Lookup multiple accounts by usernames (batch lookup)
export const GET_ACCOUNTS_BY_USERNAMES = gql`
  query GetAccountsByUsernames($usernames: [String!]!) {
    accounts(where: { username_in: $usernames }) {
      id
      user
      username
    }
  }
`;

// Fetch all organizations where user is an active member
export const FETCH_USER_ORGANIZATIONS = gql`
  query FetchUserOrganizations($userAddress: Bytes!) {
    users(where: { address: $userAddress, membershipStatus: Active }) {
      id
      membershipStatus
      participationTokenBalance
      totalTasksCompleted
      totalVotes
      organization {
        id
        name
        metadataHash
        participationToken {
          symbol
        }
      }
    }
  }
`;

// Lookup organization by name (returns ID for further queries)
export const GET_ORG_BY_NAME = gql`
  query GetOrgByName($name: String!) {
    organizations(where: { name: $name }, first: 1) {
      id
      name
    }
  }
`;

// Fetch full organization data
export const FETCH_ORG_FULL_DATA = gql`
  query FetchOrgFullData($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      name
      metadataHash
      metadataAdminHatId
      metadata {
        id
        description
        template
        backgroundColor
        logo
        hideTreasury
        useTokenSymbol
        taskPayoutHoursOnly
        taskPayoutHourlyRate
        links {
          name
          url
          index
        }
      }
      deployedAt
      topHatId
      roleHatIds
      participationToken {
        id
        name
        symbol
        totalSupply
      }
      quickJoin {
        id
      }
      hybridVoting {
        id
        thresholdPct
        quorum
      }
      directDemocracyVoting {
        id
        thresholdPct
        quorum
      }
      # Who may open votes / vote in polls. Creator + DDV voting hats are seeded
      # inside initialize() without events, but subgraph-pop #186 backfills them
      # at Initialized, so these rows match the contracts' own getters. Consumed
      # by useVoteCreateGate and the "Who can open a vote" rules section.
      #
      # first: 1000 (the max page size) is NOT decorative. Nested collections
      # default to 100, and HatPermission ids start with the CONTRACT ADDRESS,
      # so the default ordering (id asc) truncates in contract-sized blocks
      # rather than sampling evenly — one org's whole HybridVoting creator set
      # disappears while another's survives, purely on address sort order. At
      # ~3.2 rows per role that cap is reached around 32 roles. Losing those
      # rows would fail useVoteCreateGate OPEN (every member offered a Create
      # button that reverts Unauthorized) and make the rules panel claim only a
      # passed vote can open one. Keep the argument identical in
      # FETCH_ORG_STRUCTURE_DATA: Apollo keys cache fields by args, so matching
      # them lets both queries share one Organization.hatPermissions entry.
      hatPermissions(first: 1000) {
        hatId
        permissionRole
        contractType
        allowed
      }
      taskManager {
        id
        creatorHatIds
        # organizerHatIds pending subgraph-pop #177 (lives on TaskManager).
        # foldersRoot lives on Organization in subgraph PR #177 (not here);
        # consumer code reads it from org.foldersRoot.
        # Until #177 deploys, POContext falls back to lens reads via
        # useTaskManagerV4State.
        projects(where: { deleted: false }, first: 100) {
          id
          tasks(first: 1000) {
            id
            status
          }
        }
      }
      zkEmailInvites {
        id
      }
      educationHub {
        id
        modules {
          id
          moduleId
          title
          contentHash
          metadata {
            description
            link
            quiz
            answersJson
          }
          payout
          status
          completions {
            learner
          }
        }
      }
      executorContract {
        id
      }
      eligibilityModule {
        id
        eligibilityModuleAdminHat
      }
      paymentManager {
        id
      }
      users(orderBy: participationTokenBalance, orderDirection: desc, first: 100) {
        id
        address
        account {
          username
          metadata {
            avatar
          }
        }
        participationTokenBalance
        membershipStatus
        currentHatIds
        totalTasksCompleted
        totalVotes
        firstSeenAt
      }
      roles(where: { isUserRole: true }) {
        id
        hatId
        name
        image
        canVote
        isUserRole
        hat {
          name
          metadataCID
          metadata {
            name
          }
        }
      }
    }
  }
`;

// Fetch voting data (proposals for both hybrid and DD voting)
export const FETCH_VOTING_DATA_NEW = gql`
  query FetchVotingDataNew($orgId: Bytes!, $first: Int!, $hybridBefore: BigInt!, $ddBefore: BigInt!) {
    organization(id: $orgId) {
      id
      hybridVoting {
        id
        thresholdPct
        quorum
        votingClasses(first: 1000, orderBy: classIndex, orderDirection: asc) {
          id
          classIndex
          version
          strategy
          slicePct
          quadratic
          minBalance
          asset
          hatIds
          isActive
        }
        proposals(orderBy: startTimestamp, orderDirection: desc, first: $first, where: { proposalId_lt: $hybridBefore }) {
          id
          proposalId
          classesVersion
          title
          descriptionHash
          metadata {
            id
            description
            optionNames
            actionSummaries
          }
          numOptions
          startTimestamp
          endTimestamp
          status
          winningOption
          isValid
          wasExecuted
          executionFailed
          executionError
          isHatRestricted
          restrictedHatIds
          votes {
            voter
            voterUsername
            optionIndexes
            optionWeights
            classRawPowers
            votedAt
          }
        }
      }
      directDemocracyVoting {
        id
        thresholdPct
        quorum
        ddvProposals(orderBy: startTimestamp, orderDirection: desc, first: $first, where: { proposalId_lt: $ddBefore }) {
          id
          proposalId
          title
          descriptionHash
          metadata {
            id
            description
            optionNames
            actionSummaries
          }
          numOptions
          startTimestamp
          endTimestamp
          status
          winningOption
          isValid
          executionFailed
          executionError
          isHatRestricted
          restrictedHatIds
          votes {
            voter
            optionIndexes
            optionWeights
          }
        }
      }
    }
  }
`;

// Same query with proposer attribution (subgraph-pop #195 fields). Only used
// once the serving subgraph is confirmed to have Proposal.proposer — an
// unknown field errors the ENTIRE org query (see subgraphCapabilities.js).
export const FETCH_VOTING_DATA_WITH_PROPOSER = gql`
  query FetchVotingDataWithProposer($orgId: Bytes!, $first: Int!, $hybridBefore: BigInt!, $ddBefore: BigInt!) {
    organization(id: $orgId) {
      id
      hybridVoting {
        id
        thresholdPct
        quorum
        votingClasses(first: 1000, orderBy: classIndex, orderDirection: asc) {
          id
          classIndex
          version
          strategy
          slicePct
          quadratic
          minBalance
          asset
          hatIds
          isActive
        }
        proposals(orderBy: startTimestamp, orderDirection: desc, first: $first, where: { proposalId_lt: $hybridBefore }) {
          id
          proposalId
          classesVersion
          proposer
          proposerUsername
          title
          descriptionHash
          metadata {
            id
            description
            optionNames
            actionSummaries
            promotedFrom
          }
          numOptions
          startTimestamp
          endTimestamp
          status
          winningOption
          isValid
          wasExecuted
          executionFailed
          executionError
          isHatRestricted
          restrictedHatIds
          votes {
            voter
            voterUsername
            optionIndexes
            optionWeights
            classRawPowers
            votedAt
          }
        }
      }
      directDemocracyVoting {
        id
        thresholdPct
        quorum
        ddvProposals(orderBy: startTimestamp, orderDirection: desc, first: $first, where: { proposalId_lt: $ddBefore }) {
          id
          proposalId
          proposer
          proposerUsername
          title
          descriptionHash
          metadata {
            id
            description
            optionNames
            actionSummaries
            promotedFrom
          }
          numOptions
          startTimestamp
          endTimestamp
          status
          winningOption
          isValid
          executionFailed
          executionError
          isHatRestricted
          restrictedHatIds
          votes {
            voter
            voterUsername
            optionIndexes
            optionWeights
          }
        }
      }
    }
  }
`;


/**
 * Deep-link rescue — fetch ONE proposal by its composite id.
 *
 * The org query above caps each proposal list at `first: 50`, so a `?poll=` for
 * an older proposal is simply absent from the arrays and the modal never opens
 * (silently). This fetches exactly that one proposal so the deep link works at
 * any org size, without making every 30s poll carry hundreds of proposals.
 *
 * The selection sets are deliberately byte-identical to the list blocks above:
 * the result is spliced into the RAW array and goes through the same
 * transformProposal call, so it must not drift. Update both together.
 *
 * The top-level singular field is `ddvproposal` — all lowercase after "ddv",
 * unlike the nested `ddvProposals` list — so it is aliased. One id serves both
 * fields; proposal ids are contract-prefixed, so the wrong one returns null.
 */
export const FETCH_PROPOSAL_BY_ID = gql`
  query FetchProposalById($proposalId: ID!) {
    proposal(id: $proposalId) {
      id
      proposalId
      classesVersion
      title
      descriptionHash
      metadata {
        id
        description
        optionNames
        actionSummaries
      }
      numOptions
      startTimestamp
      endTimestamp
      status
      winningOption
      isValid
      wasExecuted
      executionFailed
      executionError
      isHatRestricted
      restrictedHatIds
      votes {
        voter
        voterUsername
        optionIndexes
        optionWeights
        classRawPowers
        votedAt
      }
    }
    ddvProposal: ddvproposal(id: $proposalId) {
      id
      proposalId
      title
      descriptionHash
      metadata {
        id
        description
        optionNames
        actionSummaries
      }
      numOptions
      startTimestamp
      endTimestamp
      status
      winningOption
      isValid
      executionFailed
      executionError
      isHatRestricted
      restrictedHatIds
      votes {
        voter
        optionIndexes
        optionWeights
      }
    }
  }
`;

/**
 * Same rescue with the proposer-attribution fields (subgraph-pop #195). Split
 * for the same reason the org query is: asking for an unknown field errors the
 * ENTIRE document, so this is only issued once hasProposerField() confirms the
 * serving subgraph has them.
 */
export const FETCH_PROPOSAL_BY_ID_WITH_PROPOSER = gql`
  query FetchProposalByIdWithProposer($proposalId: ID!) {
    proposal(id: $proposalId) {
      id
      proposalId
      classesVersion
      proposer
      proposerUsername
      title
      descriptionHash
      metadata {
        id
        description
        optionNames
        actionSummaries
        promotedFrom
      }
      numOptions
      startTimestamp
      endTimestamp
      status
      winningOption
      isValid
      wasExecuted
      executionFailed
      executionError
      isHatRestricted
      restrictedHatIds
      votes {
        voter
        voterUsername
        optionIndexes
        optionWeights
        classRawPowers
        votedAt
      }
    }
    ddvProposal: ddvproposal(id: $proposalId) {
      id
      proposalId
      proposer
      proposerUsername
      title
      descriptionHash
      metadata {
        id
        description
        optionNames
        actionSummaries
        promotedFrom
      }
      numOptions
      startTimestamp
      endTimestamp
      status
      winningOption
      isValid
      executionFailed
      executionError
      isHatRestricted
      restrictedHatIds
      votes {
        voter
        voterUsername
        optionIndexes
        optionWeights
      }
    }
  }
`;


/**
 * Claim-release fields (subgraph-pop #201, TaskManager v7). Spliced into the
 * task selection ONLY when the serving endpoint is confirmed to have them —
 * see util/subgraphCapabilities CAPABILITY.TASK_RELEASES. One unknown field
 * fails the whole document, and this one backs the entire task board, so an
 * ungated splice would blank the board on every not-yet-upgraded endpoint
 * (which today includes both decentralized-gateway defaults).
 */
const TASK_RELEASE_FIELDS = `
            releaseCount
            lastReleasedAt
            releases(orderBy: releasedAt, orderDirection: desc, first: 5) {
              id
              previousClaimer
              previousClaimerUsername
              caller
              callerUsername
              selfRelease
              releasedAt
            }`;

/**
 * Both projects documents come from this one builder rather than being copied,
 * so the base and release-aware variants cannot drift — the task selection is
 * ~60 fields and this query backs the whole board.
 */
const projectsDataQuery = (operationName, releaseFields) => gql`
  query ${operationName}($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      taskManager {
        id
        creatorHatIds
        # Org-wide TaskPerm grants set via setConfig(ROLE_PERM, ...) — required for
        # _permMask fallback. A hat with no project-specific mask falls back to its
        # global mask (e.g. Test6's Executive EDIT_FULL governance grant).
        globalRolePermissions {
          hatId
          mask
          canCreate
          canClaim
          canReview
          canAssign
          canSelfReview
          canBudget
          canEditMeta
          canEditFull
        }
        projects(where: { deleted: false }, first: 50) {
          id
          title
          metadataHash
          metadata {
            id
            description
          }
          cap
          bountyCaps {
            token
            cap
          }
          createdAt
          rolePermissions {
            hatId
            mask
            canCreate
            canClaim
            canReview
            canAssign
            canSelfReview
            canBudget
            canEditMeta
            canEditFull
          }
          tasks(first: 1000, orderBy: taskId, orderDirection: desc) {
            id
            taskId
            title
            metadataHash
            submissionHash
            rejectionHash
            rejectionCount
            metadata {
              id
              name
              description
              difficulty
              estimatedHours
              submission
              rejection
              dueDate
            }
            rejections(orderBy: rejectedAt, orderDirection: desc, first: 10) {
              rejectorUsername
              rejectedAt
              metadata {
                rejection
              }
            }
            payout
            bountyToken
            bountyPayout
            status
            assignee
            assigneeUsername
            completer
            completerUsername
            requiresApplication
            completionWindow
            absoluteDeadline
            claimDeadline
            reclaimCount
            claimExpiries(orderBy: expiredAt, orderDirection: desc, first: 5) {
              previousClaimer
              previousClaimerUsername
              newClaimer
              expiredAt
            }${releaseFields}
            createdAt
            assignedAt
            submittedAt
            completedAt
            applications {
              applicant
              applicantUsername
              applicationHash
              metadata {
                notes
                experience
              }
              approved
              approver
              approverUsername
              appliedAt
            }
          }
        }
      }
    }
  }
`;

// Fetch projects and tasks data. Base variant — safe against every deployed
// subgraph version.
export const FETCH_PROJECTS_DATA_NEW = projectsDataQuery('FetchProjectsDataNew', '');

// Same query plus the v7 claim-release fields. Gated on CAPABILITY.TASK_RELEASES.
export const FETCH_PROJECTS_DATA_WITH_RELEASES = projectsDataQuery(
  'FetchProjectsDataWithReleases',
  TASK_RELEASE_FIELDS
);

// Kept separate from the board query so a frontend can be deployed before the
// TaskSubmission schema finishes syncing without one unknown field blanking the
// whole board. Once available, latestRejection points to the exact immutable
// submission that was reviewed, even after the mutable Task state was cleared.
export const FETCH_LATEST_REJECTED_SUBMISSION = gql`
  query FetchLatestRejectedSubmission($taskId: ID!) {
    task(id: $taskId) {
      id
      latestRejection {
        id
        submission {
          id
          submissionHash
          metadata {
            id
            submission
          }
        }
      }
    }
  }
`;

/**
 * Per-project managers — the `_isPM` half of TaskManager's permission check
 * (`_checkPerm` = the hat mask OR being a manager of that project). Managers are
 * seeded by `createProject` (the creator is auto-added) and by the executor-only
 * `setConfig(PROJECT_MANAGER, ...)`; `isActive` goes false when one is removed.
 *
 * Deliberately its OWN document rather than a field on `projectsDataQuery`: one
 * unknown field fails the WHOLE document, and that one backs the entire task
 * board. Isolated, the worst case for an endpoint that lacks `managers` is
 * `managers: []` — today's behaviour, hat masks only — instead of a blank board.
 * Verified present on both production gateway endpoints (Arbitrum + Gnosis).
 */
export const FETCH_PROJECT_MANAGERS = gql`
  query FetchProjectManagers($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      taskManager {
        id
        projects(where: { deleted: false }, first: 50) {
          id
          managers(where: { isActive: true }) {
            manager
          }
        }
      }
    }
  }
`;

// Fetch user data within an organization
export const FETCH_USER_DATA_NEW = gql`
  query FetchUserDataNew($orgUserID: String!, $userAddress: Bytes!) {
    user(id: $orgUserID) {
      id
      address
      participationTokenBalance
      membershipStatus
      currentHatIds
      joinMethod
      totalTasksCompleted
      totalVotes
      totalModulesCompleted
      firstSeenAt
      lastActiveAt
      assignedTasks(first: 20) {
        id
        taskId
        title
        payout
        status
      }
      completedTasks(first: 20) {
        id
        taskId
        title
        payout
      }
      hybridProposalsCreated(first: 20) {
        id
        proposalId
        title
        status
        startTimestamp
        endTimestamp
      }
      modulesCompleted(first: 20) {
        moduleId
        completedAt
      }
    }
    account(id: $userAddress) {
      id
      username
    }
  }
`;

// Fetch education hub data
export const FETCH_EDUCATION_DATA = gql`
  query FetchEducationData($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      educationHub {
        id
        modules(first: 50) {
          id
          moduleId
          title
          contentHash
          metadata {
            description
            link
            quiz
            answersJson
          }
          payout
          status
          createdAt
          completions {
            learner
            completedAt
          }
        }
      }
    }
  }
`;

// Fetch organization structure data for /org-structure page
export const FETCH_ORG_STRUCTURE_DATA = gql`
  query FetchOrgStructureData($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      name
      metadataHash
      metadataAdminHatId
      metadata {
        id
        description
        template
        backgroundColor
        logo
        hideTreasury
        links {
          name
          url
        }
      }
      deployedAt
      topHatId
      roleHatIds

      eligibilityModule {
        id
        eligibilityModuleAdminHat
      }

      roles(where: { isUserRole: true }) {
        id
        hatId
        name
        image
        canVote
        isUserRole
        hat {
          hatId
          parentHatId
          level
          defaultEligible
          mintedCount
          name
          metadataCID
          metadata {
            name
            description
          }
          metadataUpdatedAt
          metadataUpdatedAtBlock
          wearers {
            wearer
            wearerUsername
            eligible
            standing
          }
          vouchConfig {
            enabled
            quorum
            membershipHatId
          }
        }
        permissions {
          permissionRole
          contractType
          allowed
        }
        wearers {
          wearer
          wearerUsername
          isActive
        }
      }

      hybridVoting {
        id
        thresholdPct
        quorum
      }

      directDemocracyVoting {
        id
        thresholdPct
        quorum
      }

      # first: 1000 must stay identical to FETCH_ORG_FULL_DATA's — see the note
      # there. Nested collections default to 100 and truncate in whole-contract
      # blocks, which would silently drop entire columns from this matrix.
      hatPermissions(first: 1000) {
        hatId
        permissionRole
        contractType
        allowed
      }

      # TaskManager v4/v5 — org-wide TaskPerm grants set via setConfig(ROLE_PERM, ...).
      # Surfaced on the org structure page so the role/permission matrix shows which
      # hats hold CREATE / CLAIM / REVIEW / ASSIGN / BUDGET / EDIT_META / EDIT_FULL globally.
      taskManager {
        id
        # Hats allowed to create PROJECTS (distinct from the per-task TaskPerm bits
        # below). Surfaced as the "Create Project" column in the permissions matrix.
        creatorHatIds
        globalRolePermissions {
          hatId
          mask
          canCreate
          canClaim
          canReview
          canAssign
          canSelfReview
          canBudget
          canEditMeta
          canEditFull
        }
      }

      users(first: 200) {
        id
        address
        account {
          username
          metadata {
            avatar
          }
        }
        participationTokenBalance
        membershipStatus
        currentHatIds
        totalTasksCompleted
        totalVotes
        firstSeenAt
        lastActiveAt
      }

      quickJoin {
        id
        memberHatIds
      }

      taskManager {
        id
      }

      educationHub {
        id
      }

      executorContract {
        id
      }

      participationToken {
        id
        name
        symbol
        totalSupply
      }

      eligibilityModule {
        id
      }
    }
  }
`;

// Fetch infrastructure contract addresses from the subgraph
// This replaces hardcoded addresses with dynamic lookups
// Fetches: PoaManager (with infrastructure proxies), OrgRegistry, UniversalAccountRegistry, and all Beacons
export const FETCH_INFRASTRUCTURE_ADDRESSES = gql`
  query FetchInfrastructureAddresses {
    universalAccountRegistries(first: 1) {
      id
      totalAccounts
    }
    poaManagerContracts(first: 1) {
      id
      registry
      # Infrastructure proxy addresses (the actual contracts to call)
      orgDeployerProxy
      orgRegistryProxy
      paymasterHubProxy
      globalAccountRegistryProxy
    }
    orgRegistryContracts(first: 1) {
      id
      totalOrgs
    }
    beacons {
      id
      typeName
      beaconAddress
      currentImplementation
      version
    }
  }
`;

// ============================================
// TREASURY QUERIES
// ============================================

// Fetch treasury data including distributions, payments, and executor info
export const FETCH_TREASURY_DATA = gql`
  query FetchTreasuryData($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      executorContract {
        id
        isPaused
        owner
        allowedCaller
        sweeps(first: 50, orderBy: sweptAt, orderDirection: desc) {
          id
          to
          amount
          sweptAt
          transactionHash
        }
      }
      participationToken {
        id
        name
        symbol
        totalSupply
      }
      paymentManager {
        id
        owner
        revenueShareToken
        distributionCounter
        distributions(first: 100, orderBy: createdAt, orderDirection: desc) {
          id
          distributionId
          payoutToken
          totalAmount
          totalClaimed
          checkpointBlock
          merkleRoot
          status
          createdAt
          finalizedAt
          unclaimedAmount
          claims(first: 200) {
            id
            claimer
            claimerUsername
            amount
            claimedAt
            transactionHash
          }
        }
        payments(first: 100, orderBy: receivedAt, orderDirection: desc) {
          id
          payer
          payerUsername
          amount
          token
          receivedAt
          transactionHash
        }
      }
      taskManager {
        id
        projects(where: { deleted: false }, first: 100) {
          id
          title
          bountyTasks: tasks(
            where: { status_in: ["Open", "Assigned", "Submitted"], bountyPayout_gt: "0" }
            first: 500
          ) {
            id
            bountyToken
            bountyPayout
          }
          tasks(where: { status: "Completed" }, first: 500, orderBy: completedAt, orderDirection: desc) {
            id
            taskId
            title
            payout
            assignee
            assigneeUsername
            completer
            completerUsername
            completedAt
          }
        }
      }
    }
  }
`;

// ============================================
// TOKEN REQUEST QUERIES
// ============================================

// Fetch pending token requests for approvers to review
export const FETCH_PENDING_TOKEN_REQUESTS = gql`
  query FetchPendingTokenRequests($tokenAddress: String!) {
    tokenRequests(
      where: { participationToken: $tokenAddress, status: Pending }
      orderBy: createdAt
      orderDirection: desc
      first: 100
    ) {
      id
      requestId
      requester
      amount
      ipfsHash
      metadata {
        reason
        submittedAt
      }
      status
      createdAt
      createdAtBlock
      transactionHash
    }
  }
`;

// Fetch a user's own token request history
export const FETCH_USER_TOKEN_REQUESTS = gql`
  query FetchUserTokenRequests($tokenAddress: String!, $userAddress: Bytes!) {
    tokenRequests(
      where: { participationToken: $tokenAddress, requester: $userAddress }
      orderBy: createdAt
      orderDirection: desc
      first: 50
    ) {
      id
      requestId
      amount
      ipfsHash
      metadata {
        reason
        submittedAt
      }
      status
      createdAt
      approvedAt
      cancelledAt
      approver
      transactionHash
    }
  }
`;

// Fetch all token requests for an organization (admin view)
export const FETCH_ALL_TOKEN_REQUESTS = gql`
  query FetchAllTokenRequests($tokenAddress: String!) {
    tokenRequests(
      where: { participationToken: $tokenAddress }
      orderBy: createdAt
      orderDirection: desc
      first: 100
    ) {
      id
      requestId
      requester
      amount
      ipfsHash
      metadata {
        reason
        submittedAt
      }
      status
      createdAt
      approvedAt
      cancelledAt
      approver
      transactionHash
    }
  }
`;

// Fetch approver hat permissions for a participation token
export const FETCH_TOKEN_APPROVER_HATS = gql`
  query FetchTokenApproverHats($tokenAddress: Bytes!) {
    hatPermissions(
      where: { contractAddress: $tokenAddress, permissionRole: Approver, allowed: true }
    ) {
      hatId
      permissionRole
      allowed
    }
  }
`;

// ============================================
// ROLE APPLICATION QUERIES
// ============================================

// Fetch active role applications for a user in an eligibility module
export const FETCH_USER_ROLE_APPLICATIONS = gql`
  query FetchUserRoleApplications($eligibilityModuleId: Bytes!, $applicant: Bytes!) {
    roleApplications(
      where: { eligibilityModule: $eligibilityModuleId, applicant: $applicant, active: true }
      first: 50
    ) {
      id
      hatId
      applicant
      applicantUsername
      applicationHash
      active
      appliedAt
    }
  }
`;

// Fetch all active role applications for an eligibility module (admin view)
export const FETCH_ALL_ROLE_APPLICATIONS = gql`
  query FetchAllRoleApplications($eligibilityModuleId: Bytes!) {
    roleApplications(
      where: { eligibilityModule: $eligibilityModuleId, active: true }
      orderBy: appliedAt
      orderDirection: desc
      first: 200
    ) {
      id
      hatId
      applicant
      applicantUsername
      applicationHash
      active
      appliedAt
    }
  }
`;

// ============================================
// VOUCHING QUERIES
// ============================================

// Fetch all active vouches for an organization's eligibility module
export const FETCH_VOUCHES_FOR_ORG = gql`
  query FetchVouchesForOrg($eligibilityModuleId: Bytes!) {
    vouches(
      where: { eligibilityModule: $eligibilityModuleId, isActive: true }
      orderBy: createdAt
      orderDirection: desc
      first: 200
    ) {
      id
      hatId
      wearer
      wearerUsername
      voucher
      voucherUsername
      vouchCount
      isActive
      createdAt
    }
  }
`;

// ============================================
// Distribution claim — find executed proposals with merkle tree CIDs
// ============================================

export const FETCH_DISTRIBUTION_PROPOSALS = gql`
  query FetchDistributionProposals($hybridVotingId: String!) {
    proposals(
      where: { hybridVoting: $hybridVotingId, wasExecuted: true }
      orderBy: executedAt
      orderDirection: desc
      first: 50
    ) {
      id
      metadata {
        description
      }
    }
  }
`;
