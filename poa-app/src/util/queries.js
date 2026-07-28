import { gql } from '@apollo/client';

// ============================================
// POP SUBGRAPH QUERIES (Arbitrum + Gnosis)
// Endpoints are configured per-chain in src/config/networks.js
// ============================================

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
        }
      }
    }
  }
`;

// Fetch voting data (proposals for both hybrid and DD voting)
export const FETCH_VOTING_DATA_NEW = gql`
  query FetchVotingDataNew($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      hybridVoting {
        id
        thresholdPct
        quorum
        votingClasses(where: { isActive: true }, orderBy: classIndex, orderDirection: asc) {
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
        proposals(orderBy: startTimestamp, orderDirection: desc, first: 50) {
          id
          proposalId
          title
          descriptionHash
          metadata {
            id
            description
            optionNames
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
        ddvProposals(orderBy: startTimestamp, orderDirection: desc, first: 50) {
          id
          proposalId
          title
          descriptionHash
          metadata {
            id
            description
            optionNames
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
  query FetchVotingDataWithProposer($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      hybridVoting {
        id
        thresholdPct
        quorum
        votingClasses(where: { isActive: true }, orderBy: classIndex, orderDirection: asc) {
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
        proposals(orderBy: startTimestamp, orderDirection: desc, first: 50) {
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
        ddvProposals(orderBy: startTimestamp, orderDirection: desc, first: 50) {
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


// Fetch projects and tasks data
export const FETCH_PROJECTS_DATA_NEW = gql`
  query FetchProjectsDataNew($orgId: Bytes!) {
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
            }
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

      hatPermissions {
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
