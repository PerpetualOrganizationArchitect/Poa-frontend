import { gql } from '@apollo/client';

// ============================================
// POP SUBGRAPH QUERIES (Hoodi testnet)
// Schema: https://api.studio.thegraph.com/query/73367/poa-2/version/latest
// ============================================

// Fetch all organizations for browsing
export const FETCH_ALL_ORGS = gql`
  query FetchAllOrgs {
    organizations(first: 100, orderBy: deployedAt, orderDirection: desc) {
      id
      name
      metadataHash
      deployedAt
      topHatId
      participationToken {
        id
        totalSupply
      }
      quickJoin {
        id
      }
      hybridVoting {
        id
      }
      directDemocracyVoting {
        id
      }
      taskManager {
        id
      }
      educationHub {
        id
      }
    }
  }
`;

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
        quorum
      }
      directDemocracyVoting {
        id
        quorumPercentage
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
        username
        participationTokenBalance
        membershipStatus
        currentHatIds
      }
      roles {
        id
        hatId
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
        quorum
      }
      directDemocracyVoting {
        id
        quorumPercentage
      }
      taskManager {
        id
      }
      educationHub {
        id
        modules {
          id
          moduleId
          title
          contentHash
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
      users(orderBy: participationTokenBalance, orderDirection: desc, first: 100) {
        id
        address
        username
        participationTokenBalance
        membershipStatus
        currentHatIds
        totalTasksCompleted
        totalVotes
        firstSeenAt
      }
      roles {
        id
        hatId
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
        quorum
        proposals(orderBy: startTimestamp, orderDirection: desc, first: 50) {
          id
          proposalId
          title
          descriptionHash
          numOptions
          startTimestamp
          endTimestamp
          status
          winningOption
          isValid
          wasExecuted
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
        quorumPercentage
        ddvProposals(orderBy: startTimestamp, orderDirection: desc, first: 50) {
          id
          proposalId
          title
          descriptionHash
          numOptions
          startTimestamp
          endTimestamp
          status
          winningOption
          isValid
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

// Fetch projects and tasks data
export const FETCH_PROJECTS_DATA_NEW = gql`
  query FetchProjectsDataNew($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      taskManager {
        id
        projects(where: { deleted: false }, first: 50) {
          id
          title
          metadataHash
          cap
          createdAt
          tasks(first: 100) {
            id
            taskId
            title
            metadataHash
            payout
            bountyToken
            bountyPayout
            status
            assignee
            assigneeUsername
            completer
            completerUsername
            requiresApplication
            createdAt
            assignedAt
            submittedAt
            completedAt
            applications {
              applicant
              approved
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
      username
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
