---
title: "Poa protocol dashboard: activity, funding, and upgrades"
description: "Understand Poa’s public dashboard: organization activity, fee funding, infrastructure addresses, sponsorship settings, and recorded upgrades."
date: '2026-09-06'
updated: '2026-09-06'
category: 'Infrastructure'
---

Use the [protocol dashboard](/protocol) to check shared fee funding, find an infrastructure contract, or investigate a recorded upgrade. It brings public activity and configuration together with links to underlying transactions.

You do not need organization membership to read it.

## What the dashboard shows

| Section | What you can inspect |
| --- | --- |
| Overview and statistics | Indexed counts of organizations, accounts, infrastructure, and sponsored operations. |
| Sponsored usage | Network-level totals for organization fee pools, deposits, spending, and sponsored operations. |
| Infrastructure | Contract addresses for the shared components on each network. |
| Solidarity fund | Shared balance, collected fees, distribution status, grace settings, and recent events. |
| Sponsorship | Account-creation and organization-deployment settings and limits. |
| Upgrade history | Indexed changes to contract implementations, with transaction links. |

The fee totals summarize the indexed organization pools for a network. They are not a complete history of every fee a member has paid. Direct wallet fees are excluded from sponsored usage.

## How to read the numbers

The dashboard reads an index of public contract events. Indexing can lag behind a completed transaction, and a failed data request can leave a section unavailable. Some settings use deployment defaults when the relevant historical events were not indexed.

For a funding or governance decision, verify the relevant network, contract address, and current settings. A missing entry is not proof that an action never happened. A healthy shared balance is not a guarantee that your next transaction will be sponsored.

The dashboard currently summarizes configuration and activity; it does not provide a live sponsorship success-rate or latency monitor.

## A practical check before launch

Open the dashboard and find your organization's network. Review the solidarity balance and whether distribution is active. Check the deployment and account-creation limits where relevant. Then verify the actual fee estimate in your organization's setup flow.

After launch, use your organization's own records for its decisions, funds, and member activity. Use the protocol dashboard to understand the infrastructure supporting them. [Learn how fee funding works](/docs/gas-sponsor).

## Trace a record or build your own view

Poa's [frontend](https://github.com/poa-box/Poa-frontend) displays data from the [subgraph](https://github.com/poa-box/subgraph-pop), which indexes events from the [protocol contracts](https://github.com/poa-box/POP). Transaction links let you compare an indexed event with the public network record.

A developer can also use these sources for a report of sponsored activity on a particular network. Account for the same indexing delay when interpreting a custom view.

Upgrade history shows changes to shared implementations. To understand how an upgrade affects a particular organization, inspect that organization's deployed version and upgrade controls. The history alone does not establish that an organization opted in or that every component is immutable.

[Read about the data layer](/docs/TheGraph) or [why Poa uses decentralized infrastructure](/docs/why-decentralization).
