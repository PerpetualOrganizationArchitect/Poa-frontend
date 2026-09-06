---
title: "Cash out USDC to a payment app"
description: "Understand Poa’s current personal cashout flow for USDC on Arbitrum, including payment methods, fees, order status, and available recovery actions."
date: '2026-09-06'
updated: '2026-09-06'
category: "Work together"
order: 65
---

# Cash out USDC to a payment app

If you hold **USDC on Arbitrum in a connected wallet**, open your account page and look for **Cash Out**. This flow exchanges that supported personal balance for money in a payment app; other account types, networks, and assets are not supported by this route.

## Before you begin

Check the asset and network of the balance you received. A payment in another asset or on another network cannot be used directly in this cashout flow. Participation units themselves are not a cashout balance.

The cashout form lists payment methods including Venmo, Cash App, PayPal, Zelle, Revolut, and Wise. A listed method does not guarantee that a buyer is available or that the service is available in your location.

## Follow the cashout prompts

1. Open Cash Out from your account and choose the supported balance.
2. Select a payment method and enter your receiving handle carefully.
3. Enter the amount and review the estimated proceeds, bridge fee, and marketplace spread.
4. Complete any required asset approval and the cashout authorization shown by your wallet.
5. Track the submitted order and the payment in your chosen app.

The flow moves the supported funds to a marketplace on Base and creates a sell order. A buyer must fill that order for the payment to arrive. Submission is not confirmation that you have been paid.

Fees and the marketplace spread can reduce what you receive. After the order fills, check the final payment in your chosen app.

## If the order remains open

The account page can show outstanding cashouts and available withdrawal or recovery actions. An unfilled marketplace deposit may be withdrawable. A failed deposit may expose a separate recovery action.

These actions depend on the order's current state and may require a transaction on Base. Recovery can return USDC there rather than back on the original network. Follow the displayed status instead of assuming an order automatically cancels or refunds itself.

## Keep organizational payments separate

If you are expecting a task bounty, transfer, or distribution, confirm that the funds have reached your personal balance first. A proposed payment is not yet available to cash out.

Use [manage shared funds](/docs/treasury-management) for organizational decisions and [tasks and contribution rewards](/docs/task-manager) to understand what a task actually pays.
