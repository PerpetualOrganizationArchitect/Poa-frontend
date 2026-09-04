/**
 * proposalChecks — the pure half of Create-a-Vote validation.
 *
 * Every message string here is byte-identical to the toast `description` the
 * submit-time validators in `useProposalForm` already show
 * (`validateBasicFields`, `validateTransferProposal`, `validateElectionProposal`,
 * `validateNormalProposal`, `validateCreateRoleProposal`, `validateSetterProposal`).
 * Those validators become thin toasting wrappers over these predicates, so any
 * drift in the wording here is a user-visible behaviour change — keep them in
 * sync.
 *
 * Pure: no React, no toasts, no hooks. Returns `null` (fine) or a string (the
 * user-facing reason), never throws.
 *
 * Deliberately shallower than submit validation for the deep rules that are not
 * worth blocking a wizard step on — voting-class weights summing to 100,
 * duplicate wearers, project-permission uniqueness, per-input min/max ranges.
 * Those stay submit-only; see the plan's risk table.
 */

import { utils, constants as ethersConstants } from 'ethers';
import { getTemplateById, templateParamsReady } from '@/config/setterDefinitions';
import { templateUnavailableReason } from './setterAvailability';
import { amountDecimalsError, amountToWei } from './treasuryBatches';
import { resolveRoleForm, roleFormError } from '@/lib/accessV2/roleFormBatch';

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Is the config decision for this proposal's type made?
 * `null` when there is nothing left to pick, otherwise the reason.
 *
 * @param {object} proposal
 * @param {object} [ctx] - optional live facts the pure rules can't know:
 *   `ctx.transfer = { decimals, symbol, availableWei, overLimitMessage, loading }`
 *   lets a treasury payout be refused when it is finer than the asset or more
 *   than every pot holds (the batch would otherwise run and silently fail
 *   inside announceWinner's try/catch). Omitted → the legacy checks only.
 */
export function configError(proposal, ctx = null) {
  const p = proposal || {};

  if (p.type === 'setter') {
    if (p.setterMode === 'advanced') {
      // Order mirrors validateSetterProposal's advanced branch: contract first,
      // then function. (The "is this a real function?" lookup stays submit-side
      // so this module doesn't have to pull in the setter template registry.)
      if (!p.setterContract) return 'Please select a target contract.';
      if (!p.setterFunction) return 'Please select a function to call.';
      return null;
    }
    if (!p.setterTemplate) return 'Please select an action from the templates.';
    // Params belong to the config screen, so they gate it. Without this a bare
    // ?propose=<template> deep link counts as configured and skips straight
    // past the screen where its values are entered.
    const tmpl = getTemplateById(p.setterTemplate);
    // A template the org can no longer propose (a legacy-only action after the
    // access-v2 cutover, or a v2-only one before it) must not clear the config
    // gate just because a restored draft or an old deep link still names it —
    // it would pass on chain and change nothing.
    if (tmpl && ctx?.accessV2) {
      const reason = templateUnavailableReason(tmpl, { authorityEnabled: Boolean(ctx.accessV2.enabled) });
      if (reason) return reason;
    }
    if (tmpl && !templateParamsReady(tmpl, p.setterValues)) {
      const missing = (tmpl.inputs || []).find(
        i => !i.optional && !nonEmpty(String(p.setterValues?.[i.name] ?? '')),
      );
      return `Please provide a value for "${missing?.label || missing?.name || 'this action'}".`;
    }
    // A template can gate its own config screen — the invite list only counts as
    // configured once the field has actually READ and verified it. Without this a
    // deep link counts as configured, skips the screen where the list is fetched
    // and shown, and lands a member on details having never seen what they are
    // approving (and with the submit-time validate then blocking them anyway).
    const templateError = tmpl?.validate?.(p.setterValues || {});
    if (templateError) return templateError;
    return null;
  }

  if (p.type === 'election') {
    if (!p.electionRoleId) return 'Please select a role for this election.';

    const candidates = p.electionCandidates || [];
    const minCandidates = p.electionIncludeNoOneOption ? 1 : 2;
    if (candidates.length < minCandidates) {
      return p.electionIncludeNoOneOption
        ? "An election with the 'No One' option needs at least 1 candidate."
        : 'An election needs at least 2 candidates.';
    }

    // The candidate list IS the config screen, so its per-row errors belong to
    // this gate — otherwise "Create vote" on review toasts about a field two
    // Backs away.
    for (const candidate of candidates) {
      if (!candidate?.address || !utils.isAddress(candidate.address)) {
        return `"${candidate?.name || 'Unnamed'}" has an invalid address.`;
      }
      if (candidate.address === ethersConstants.AddressZero) {
        return `"${candidate.name || 'Unnamed'}" uses the zero address. Use the "Allow voters to reject all candidates" option instead.`;
      }
      if (!nonEmpty(candidate.name)) return 'All candidates must have a name.';
    }
    return null;
  }

  if (p.type === 'createRole') {
    const rc = p.roleConfig || {};
    // ACCESS V2 (`ctx.accessV2.enabled`): the config step is a different screen entirely —
    // `components/accessV2/RoleForm`, writing `proposal.roleFormV2`, and able to create a GROUP as
    // well as a role. None of the legacy gates apply: there is no parent role to sit under (a
    // subject has no hierarchy) and the seat cap is `maxMembers`, where 0 legitimately means "no
    // limit". `roleFormError` is the ONE gate — the same function
    // `useProposalForm.validateCreateRoleProposal` toasts and the same form
    // `buildProposalData` encodes, over `resolveRoleForm` so a pre-v2 draft (roleConfig only)
    // is judged on the fields it actually carries.
    if (ctx?.accessV2?.enabled) {
      return roleFormError(resolveRoleForm(p));
    }
    if (!rc.parentHatId || String(rc.parentHatId).trim() === '') {
      return 'Pick which role this new role should sit under.';
    }
    if (!nonEmpty(rc.name)) return 'Give the new role a name.';
    const maxSupply = Number(rc.maxSupply);
    if (!Number.isFinite(maxSupply) || maxSupply < 1 || maxSupply > 4294967295) {
      return 'Max supply must be between 1 and 4,294,967,295.';
    }
    return null;
  }

  if (p.type === 'transferFunds') {
    if (!p.transferAddress || !utils.isAddress(p.transferAddress)) {
      return 'Please enter a valid recipient address.';
    }
    const amount = parseFloat(p.transferAmount);
    if (isNaN(amount) || amount <= 0) return 'Please enter a valid transfer amount.';
    const t = ctx?.transfer;
    if (t) {
      const decimalsError = amountDecimalsError(p.transferAmount, t.decimals, t.symbol);
      if (decimalsError) return decimalsError;
      // A failed balance read fails CLOSED. Guessing would pick the Executor —
      // the pot that is empty on every org we have seen — and the vote would
      // pass and pay nothing.
      if (t.readFailed) return "Couldn't read what the group holds — try again in a moment.";
      // Only refuse on a SETTLED read. While balances load (or when the read
      // failed) the pots are unknown, not empty — blocking then would lock the
      // step behind an RPC hiccup.
      if (!t.loading && t.availableWei !== undefined && t.availableWei !== null) {
        const wei = amountToWei(p.transferAmount, t.decimals);
        if (wei !== null && wei > BigInt(t.availableWei)) {
          return t.overLimitMessage || `Only ${t.availableWei} base units can go out in one vote.`;
        }
      }
    }
    return null;
  }

  // `normal` (and anything unrecognised) has no config decision.
  return null;
}

/**
 * Is the details screen — title, duration, and the fields that live beside them
 * — filled in? `null` when it is, otherwise the reason.
 */
export function detailsError(proposal) {
  const p = proposal || {};

  // Setter proposals may be submitted with no hand-typed title: submit
  // synthesises one from the template preview. Same exemption as
  // validateBasicFields, so the wizard can't be stricter than submit.
  const setterProvidesTitle =
    p.type === 'setter' && p.setterMode === 'template' && Boolean(p.setterTemplate);

  if (!setterProvidesTitle && !nonEmpty(p.name)) {
    return 'Please enter a title for your proposal.';
  }

  const durationHours = Number(p.time);
  if (isNaN(durationHours) || durationHours <= 0) {
    return 'Please enter a valid duration in hours (must be greater than 0).';
  }

  if (p.type === 'normal') {
    const filled = (p.options || []).filter((opt) => nonEmpty(opt));
    if (filled.length < 2) return 'Please provide at least 2 voting options.';
  }

  if (p.isRestricted && (p.restrictedHatIds?.length ?? 0) === 0) {
    return "You restricted who can vote but didn't pick any roles. Select at least one, or turn restriction off.";
  }

  return null;
}

/**
 * Has the user actually PICKED an intent, or is this the pristine default?
 *
 * `defaultProposal.type` is `"normal"`, so `Boolean(proposal.type)` is true on
 * a fresh form — that is exactly what made the intent gallery dead on arrival.
 * Any type other than `"normal"` can only have been set by picking a card;
 * `"normal"` additionally needs some user content before we treat it as a
 * deliberate choice.
 */
export function hasChosenIntent(proposal) {
  const p = proposal || {};
  if (!p.type) return false;
  if (p.type !== 'normal') return true;
  if (nonEmpty(p.name) || nonEmpty(p.description)) return true;
  return (p.options || []).some((opt) => nonEmpty(opt));
}

/**
 * Step-level completeness, consumed by `resolveEntryStep`.
 * The final step folds in `configError` as well, so the last gate can never
 * pass a proposal whose config is broken on a screen two Backs away.
 *
 * The step names are inlined rather than imported from
 * `@/components/voting/create/wizardSteps` — this lib module stays free of any
 * dependency on the component tree. They are the STEP_* constants' values.
 */
export function isComplete(step, proposal, ctx = null) {
  switch (step) {
    case 'intent':
      return hasChosenIntent(proposal);
    case 'config':
      return configError(proposal, ctx) === null;
    case 'details':
      // Stricter than `detailsError` on purpose, for setter proposals only: the
      // title exemption there is a submit-time backstop for someone who clears
      // the box, not a reason to skip the screen. An empty title means nobody
      // has been to details yet, so that is where a deep link should land.
      return detailsError(proposal) === null && nonEmpty(proposal?.name);
    case 'review':
      return configError(proposal, ctx) === null && detailsError(proposal) === null;
    default:
      return false;
  }
}
