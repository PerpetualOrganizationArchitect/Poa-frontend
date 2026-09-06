---
title: "Network fee sponsorship and the shared fund"
description: "Learn how organization fee balances and the shared solidarity fund support participation in Poa, and what to check when sponsorship is unavailable."
date: '2026-09-06'
updated: '2026-09-06'
category: 'Infrastructure'
---

Your organization can maintain a fee balance to cover eligible network actions, such as supported votes or task submissions. Shared funding can also help eligible organizations get started. Poa calls that shared pool the **solidarity fund**.

Before members rely on sponsorship, check which actions and account routes it covers, whether funding is available, and who will replenish your organization’s balance.

## What the fund pays for

Network fees pay for recording actions on the underlying network. Sponsorship can cover those fees for supported actions and account routes, subject to the deployed configuration and available funds.

This is separate from paying people for work. A sponsored task approval still needs its own funding if the task promises a payment. The shared fund does not supply your organization's task budget or revenue distributions.

Sponsorship is also different from an ordinary wallet transaction. The protocol dashboard's sponsored usage figures exclude fees that people pay directly from their own wallets.

## Organization balances and shared support

The [protocol dashboard](/protocol) shows organization fee deposits and spending aggregated by network. Its solidarity section shows the shared balance, fees collected, distribution status, grace-period settings, and recent fund events. Sponsorship settings also include limits for account creation and organization deployment where enabled.

These are related sources of support, with their own rules. A positive shared balance does not mean every action is eligible or every organization can spend freely. Available balances, per-action limits, grace allowances, and whether distribution is paused all matter.

A configurable fee on eligible sponsored operations replenishes the shared fund. The protocol source also describes startup grace allowances and deposit-based matching, subject to funding and pause settings. Check the deployed version for the policy that applies to your organization. [Fee accounting](https://github.com/poa-box/POP/blob/main/src/libs/PaymasterFinanceLib.sol) and [support allowances](https://github.com/poa-box/POP/blob/main/src/libs/PaymasterGraceLib.sol) are available for independent inspection.

## A possible direction for shared support

A future model could let organizations vouch for one another, with their contributions to shared fees informing support. That is a design direction, not a funding control exposed in the current frontend. Plan around the available balances, fee accounting, and allocation rules described above.

[Member vouching](/docs/vouching-and-trust) serves a separate purpose: helping people join a group. A personal endorsement does not grant an allocation from the solidarity fund.

## Check the member experience

1. Check your organization's network and fee arrangements.
2. Review the shared fund status and sponsorship limits on the protocol dashboard.
3. Try the intended member action with the intended account route and inspect the fee estimate.
4. Explain who is responsible for replenishing the organization's fee balance.

If sponsorship is unavailable, read the transaction message before retrying. As a member, share that message with the person managing the fee balance so they can identify what needs attention. Depending on the account route, you may need to add funds or use an available self-funded path. Do not assume every failed sponsorship attempt will automatically switch payment methods.

## For developers

The paymaster is the contract system that handles supported sponsored operations. The app reads its balances and indexed activity through the protocol data layer. For exact eligibility, fee accounting, and allocation rules, inspect the deployed version and the [protocol source](https://github.com/poa-box/POP).

The [protocol dashboard guide](/docs/protocol) explains how to read the funding totals and their limits. Include this check when preparing [your organization’s first week](/docs/first-week).
