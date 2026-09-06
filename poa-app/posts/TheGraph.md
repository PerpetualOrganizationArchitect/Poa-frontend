---
title: "Query Poa organization data with the subgraph"
description: "Learn how Poa indexes organization records for public queries, including proposals, tasks, membership, and distributions, with integration guidance."
date: '2026-09-06'
updated: '2026-09-06'
category: 'Infrastructure'
---

To read an organization’s proposals, tasks, or membership in your own tool, query its **subgraph**: an index built from public contract events. Poa’s frontend uses this data for many of its lists and dashboards.

Your integration can query the index too, subject to the endpoint’s access requirements. Select the organization’s network and check the deployed schema before writing the query.

## What the index contains

The schema includes organizations, membership and roles, proposals and votes, projects and tasks, learning modules, payment events, distributions, and fee sponsorship activity. Coverage depends on the deployed schema and the events indexed on that network.

Longer content such as proposal descriptions and organization metadata is stored separately using content references. Reading an indexed record may also require retrieving that content.

## Query the right network

An organization belongs to the network on which it was deployed. Read its records from that network's subgraph. The frontend's network configuration provides the supported endpoints; browse views query the configured networks and combine results.

For an integration, start with the schema in the [subgraph repository](https://github.com/poa-box/subgraph-pop). Use [`src/config/networks.js`](https://github.com/poa-box/Poa-frontend/blob/main/poa-app/src/config/networks.js) to identify endpoints, and follow the gateway's access requirements. Endpoint addresses and deployments can change.

## Keep these distinctions clear

- **An index can lag.** A transaction can be confirmed before it appears in a list. Check its receipt before repeating an action that looks missing.
- **An index is a derived view.** Contract state and transaction records are the underlying source. An unavailable index does not mean an organization has stopped existing.
- **Content needs availability too.** A stored content identifier verifies what a document is; someone still needs to host or pin the corresponding content.
- **Public records need thoughtful inputs.** Do not place private member details in public metadata simply because a field accepts text.

## Implementation details

Subgraph entity identifiers commonly combine a contract address and an underlying contract ID. Extract the numeric ID for tasks and learning modules; project IDs remain `bytes32`. The frontend provides separate parsing helpers for these boundaries.

Numeric balances arrive as strings in base units. Format them using the relevant asset's decimals. Participation ownership uses 18 decimals; do not assume every payment asset shares that precision.

Use an Apollo client scoped to the organization's subgraph endpoint, as the frontend does. Each endpoint has its own cache so records from different networks do not get mixed together.

## Build a useful first integration

Start with a small task sample, following the organization/task-manager relationships used in [`src/util/queries.js`](https://github.com/poa-box/Poa-frontend/blob/main/poa-app/src/util/queries.js):

```graphql
query FirstTasks($orgId: Bytes!) {
  organization(id: $orgId) {
    taskManager {
      id
      projects(first: 1, where: { deleted: false }) {
        tasks(first: 5) {
          taskId
          title
          status
          metadataHash
        }
      }
    }
  }
}
```

Send this query to your organization's configured subgraph endpoint, with variables `{"orgId":"YOUR_ORGANIZATION_ID"}`; replace the placeholder with its hex organization ID. Confirm these fields against the serving schema. This samples one project, not every available task. Retrieve referenced descriptions separately before choosing work.

Compare the result with the organization's existing interface and several transaction records. Show users when data is unavailable or still catching up, so an empty response cannot be mistaken for an empty organization.

A verified query can supply a weekly proposal digest, a release report, or an [agent integration](/docs/ai-agent-coordination). Keep network identity and data freshness visible in whatever uses the result.
