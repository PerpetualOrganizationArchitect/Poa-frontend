---
title: "Manage shared funds"
description: "Manage your organization’s shared funds on Poa. Understand deposits, task funding, governed transfers, and contribution-based distributions members can claim."
date: '2026-09-06'
updated: '2026-09-06'
category: "Work together"
order: 60
---

# Manage shared funds

Before proposing a payment, identify its source: treasury deposits, the governance spending balance, or task funding. Poa keeps these balances separate, and the next step depends on which one holds the funds.

## Find the funds for your plan

| Balance | What it is for |
|---|---|
| Treasury deposits | Funds held by the payment system for governed withdrawals and distributions |
| Governance spending balance | Funds the organization can spend directly through an approved action |
| Task funding | The separate balance used to pay configured task bounties |

A deposit into the treasury does not automatically fund a task bounty. Review the source and available amount for the action you are preparing. Funds already committed to open distributions may not be available to spend again.

The organization may hold different assets. Read the asset name and amount rather than assuming every balance is denominated in dollars. Participation units record contribution; they are different from the assets used to pay people.

## Deposit and plan

Use the treasury's deposit flow to choose an asset and amount. Depositing does not itself require a governance vote. Record enough context for members to understand where the funds came from and any agreement about their use.

To fund bounties, open Treasury and choose **Fund task rewards**. Select the payment asset and amount from your own balance on the organization's network, then confirm the deposit to the task-reward pool. If you can create proposals, the dialog also offers **Propose a move by vote** for using the group's funds. Check the pool against the rewards already promised before offering more work.

A received payment's asset and network determine how you can use it. The [cashout guide](/docs/cashout) covers personal USDC on Arbitrum in a connected wallet; a payment on Gnosis does not qualify directly.

Discuss reserves before distributions. A print collective might keep enough for its next edition before proposing a share for contributors.

## Propose a transfer

Create a spending proposal with the recipient, asset, amount, and purpose. Explain what it makes possible: “Pay the printer for 200 copies of our first issue” gives members a decision they can assess. Read the action preview and check the available balance before submitting it.

Binding spending proposals use the organization's [hybrid voting system](/docs/hybridVoting), whose classes may give equal or contribution-based weight. A direct-democracy poll can inform a spending decision, but cannot execute the transfer.

After voting ends, the result must be finalized through the available action. Check the execution receipt and resulting balances. Winning a vote and successfully completing its payment are separate things to verify.

## Share revenue through a distribution

When the group decides to share funds with contributors, the distribution flow prepares an allocation in proportion to participation balances at the time it is prepared. Members vote on that specific allocation. Once it is approved and created, eligible recipients claim their allocated amount.

For example, a collective proposes distributing 1,000 units of its payment asset. A member with 10% of the participation balance included in that allocation receives a claim for 100 units, subject to rounding.

The current flow uses balances, rather than automatically calculating work completed during a chosen month. If your agreement concerns a particular period, review the allocation carefully before asking members to approve it.

Revenue sharing is a deliberate organizational decision. Earning participation units does not cause a recurring payment, and a distribution does not require a new vote for each recipient's claim.

![Argus treasury showing three BREAD distributions marked 100 percent claimed](/images/product/treasury.webp "Argus: three BREAD distributions, each shown as fully claimed.")

## Keep the record understandable

Use clear proposal descriptions so members can follow a plan through its transfers, distributions, and claims.

Read [tasks and contribution rewards](/docs/task-manager) for direct task payments and [cash out a payment](/docs/cashout) for the currently supported personal cashout flow.
