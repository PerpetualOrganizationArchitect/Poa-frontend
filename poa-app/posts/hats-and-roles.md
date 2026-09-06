---
title: "Poa role records: Hats and MembershipAuthority"
description: "Understand the records behind Poa roles and permissions, including legacy Hats roles and the newer membership authority used for eligibility and access."
date: '2026-09-06'
updated: '2026-09-06'
category: "Go deeper"
order: 170
---

# Poa role records: Hats and MembershipAuthority

If a role is active but a review or voting action is unavailable, check which access system the organization uses. Earlier organizations use Hats Protocol; newer ones may use MembershipAuthority. Their controls differ, and changing a legacy setting may have no effect on a newer organization.

The shared contracts enforce access rules; the interface reads them to show membership status and available actions. For everyday role setup, use [roles and permissions](/docs/roles-and-permissions).

## Two access-system versions

Earlier Poa organizations use **Hats Protocol** to represent roles. Role identifiers, administration relationships, and Poa's permission settings connect those roles to organizational actions.

Organizations using the newer **MembershipAuthority** system resolve membership and permissions through that authority. It supports explicit membership rules, invitations, vouches, role managers, and governance control. On these organizations, legacy role settings may no longer determine who can act.

The app checks which system the organization uses and displays the corresponding controls. Read and update the active system for that organization.

## Eligibility and acceptance

In the newer system, a person holds a role when they have accepted it and remain eligible under its rules. Eligibility can come from an open role, sufficient vouches, an enabled verification rule, or an explicit grant.

An invitation may also have a review window before it becomes available. The membership interface explains what makes a role claimable and when it can be accepted.

A grant can allow delegated management or be protected by governance. With a protected governance grant, a role manager cannot simply remove the person's entitlement. Other grants follow their configured management rules.

## Permissions are a separate check

A role's presence in a chart does not grant every organizational power. Tasks, learning, proposal creation, and voting have their own permission or eligibility configuration.

In particular, binding voting classes name the roles whose members count. Creating a role or giving it task authority does not automatically add it to those classes.

If a member can join but cannot review work or vote, check the permission for that specific action after confirming their role is active. For an organization using MembershipAuthority, update its authority permissions; changing the role’s name or editing a legacy setting will not supply the missing access.

## Use the records in your own tools

A custom task interface should resolve the organization's active access system before showing a review action. A member directory can explain which roles someone holds, but should not infer their voting power from a role name or its position in a list. The contract governing each action remains the authority.

Members and independent tools can inspect recorded membership rules and changes. The interface reads those records, often through an indexed view, so a recently confirmed change can take time to appear everywhere.

Show who can change a role as well as who holds it. Roles may be revoked and rules may change through the relevant process; a public record does not make access permanent.

Read [vouching and trust](/docs/vouching-and-trust) for peer-supported membership and [why decentralization matters](/docs/why-decentralization) for the broader purpose of these shared records.
