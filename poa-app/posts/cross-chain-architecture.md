---
title: "Poa networks: Arbitrum, Gnosis, and organization data"
description: "Understand where Poa organizations and accounts operate, how data stays scoped to each network, and what to check before moving funds between them."
date: '2026-09-06'
updated: '2026-09-06'
category: 'Infrastructure'
---

Before depositing funds or querying an organization, identify its network. Poa lets you browse organizations on different networks in the same interface, but each organization keeps its own contracts, balances, and records.

## The current frontend configuration

| Network | Role in the app |
| --- | --- |
| Arbitrum One | Default network for account and shared infrastructure configuration. |
| Gnosis | Default network for creating organizations. |

The source of truth for the networks offered by this frontend is `src/config/networks.js`. Other protocol deployments or development environments may differ. A deployment elsewhere does not automatically make that network available in this interface.

## Your organization has a home network

An organization has its own contract addresses on the network where it was created. Its task actions, governance execution, and treasury operations use those contracts.

The frontend resolves the organization's network and reads its corresponding data index. Global browsing combines records from configured networks; that does not merge their balances, membership, or ownership.

An account address appearing on two networks does not mean its funds or permissions are shared between them. Each organization grants membership and tracks contribution under its own rules.

## Before sending funds

Check the receiving network, asset, and exact destination shown by the app. An organization's general treasury, task funding, and fee funding serve different purposes. Use the intended deposit flow instead of assuming any organization address can receive funds for any purpose.

Moving an asset between networks requires a supported transfer or bridge route. Poa's [cashout guide](/docs/cashout) explains the route currently offered by that feature. Do not assume treasury deposits are automatically bridged or that an asset with the same symbol is interchangeable across networks.

## Build across organizations

A contributor dashboard could bring your open tasks and upcoming votes into one view, even when the organizations use different networks. Keep each item linked to its organization and network so the reader can return to the right place to act. Combining the view does not combine authority or assets.

Keep network selection attached to the organization throughout the request. The app's organization context supplies the network and subgraph endpoint; service calls use that context for transactions. Queries should use a client dedicated to that endpoint.

For current configuration and examples, read the [frontend source](https://github.com/poa-box/Poa-frontend). For the underlying deployment architecture, read the [protocol source](https://github.com/poa-box/POP).

Use the [data-layer guide](/docs/TheGraph) for query details and [shared-funds guide](/docs/treasury-management) to choose the right funding destination.
