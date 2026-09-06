---
title: "Custom domains and independent hosting with Poa"
description: "Use a custom domain or host the open-source Poa frontend yourself. Understand what changes, what stays shared, and how domain setup works today."
date: '2026-09-06'
updated: '2026-09-06'
category: 'Infrastructure'
---

To put your organization at an address you control, configure a custom domain. To change the interface and manage its release schedule, host your own build of Poa’s open-source frontend.

Both options require technical setup. Custom domains are configured manually with the deployment; they are not a field members can fill in through organization settings.

## A custom domain for the same organization

A configured domain can open the app with your organization selected. Its members, decisions, ownership records, and funds remain attached to the same underlying organization.

The current frontend includes a host mapping for Kansas Blockchain. The mechanism maps a hostname to the organization's current name. The deployment maintains that mapping.

A custom domain does not automatically replace every brand element or create a separate private copy of the records. Additional visual changes require frontend work.

## What setup involves

1. Create the organization and confirm its exact current name.
2. Choose a domain you control and arrange its hosting or proxy configuration.
3. Add the hostname-to-organization mapping in the frontend deployment.
4. Configure and verify sign-in for the domain.
5. Test the organization's home, member navigation, and key actions on the new address.

The existing setup uses a Cloudflare Worker to proxy the frontend and direct the root to the organization's home. Technical maintainers can find the implementation and deployment notes in the [frontend repository](https://github.com/poa-box/Poa-frontend).

If your organization changes its name, update the host mapping and any name aliases used by existing links. The domain lookup currently uses an exact name match.

## Hosting independently

The frontend is open source under AGPL-3.0. You can run your own deployment in accordance with that license, configure its network connections, and keep using the same organization contracts.

The app builds as a static export. The repository includes its build instructions and the worker used for Poa's own hosting. An independent deployment still needs working network endpoints, indexed data, access to referenced content, and any services required by the features you use.

A proxy follows upstream interface updates. An independently hosted build makes that release schedule yours to manage, so you can test a change against your group's workflow before adopting it. Choose a maintainer and document the services the deployment depends on.

## Make the address easy to trust

Tell members which domain to use. Follow an invitation link and a task link as a returning member would, and check that each opens the right organization. Decide which public URL search engines should treat as canonical; inspect the deployed page metadata rather than assuming a custom domain changes it automatically.

Once the address works, use [your first week](/docs/first-week) to check the experience you are inviting members into. [Why decentralization matters](/docs/why-decentralization) explains how independent access fits the underlying organization.
