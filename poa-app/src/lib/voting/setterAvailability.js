/**
 * setterAvailability — which rule-change actions this org can actually propose.
 *
 * Current grants are written to MembershipAuthority. Retired module setters are unavailable
 * throughout the app, including deep links, raw configuration and previously saved drafts.
 *
 * PURE, and the only reader of the access-system flags declared in `@/config/setterDefinitions`
 * (`legacyOnly`, `v2Only`, `idsAreSubjects`, `v2Description`, `v2HelpText`, `v2Note`). Nothing else
 * in the app hardcodes a template id against an access system; add a flag there, not a branch here.
 *
 * ── DEEP LINKS ────────────────────────────────────────────────────────────────────────────────
 * `getTemplateById` is a pure id lookup and always resolves — a `?propose=allow-voter-dd` link,
 * or `OPEN_RIGHTS_TEMPLATE.binding` / `.poll` from the /rules panel, will happily hand back a dead
 * template on a v2 org. Deep-link consumers must resolve through `resolveSetterTemplate(id, ctx)`
 * (or `getAvailableTemplateById`, which returns `null`) and, when `available` is false, show
 * `reason` instead of opening the wizard — the same shape `VotingPage.handleProposeRuleChange`
 * already uses for a module the org never deployed. A surface that OFFERS the link (the /rules
 * "Propose a change" rows) should hide the button entirely rather than let it toast.
 */

import {
  SETTER_TEMPLATES,
  RAW_FUNCTIONS,
  CONTRACT_MAP,
  isContractAvailable,
} from '@/config/setterDefinitions';

/** Why an action is not on offer. Member-facing — these strings are rendered as-is. */
export const UNAVAILABLE_REASON = {
  /** Superseded by the authority and removed from current module implementations. */
  LEGACY_ONLY: (name) => (
    `“${name}” is no longer how this group works. Roles and permissions are all managed in one `
    + 'place now, so this action is unavailable — use “Change what a role can do” '
    + 'instead.'
  ),
  /** The org has not been moved onto the authority yet. */
  V2_ONLY: (name) => (
    `“${name}” needs this group’s new roles and permissions, which it hasn’t moved to yet.`
  ),
  /** The org never deployed the contract this action targets. */
  MISSING_CONTRACT: (name, displayName) => (
    `“${name}” needs ${displayName}, which this group doesn’t have set up.`
  ),
};

/**
 * The availability context.
 * @typedef {object} AvailabilityCtx
 * @property {boolean} authorityEnabled - `useOrgAuthority().enabled`. Retired setters remain
 *   unavailable while readiness is unresolved; authority actions require verified readiness.
 * @property {object|null} contractAddresses - keyed by `CONTRACT_MAP[].contextKey`. `null` skips
 *   the deployed-contract check entirely, which is what callers without addresses (and tests)
 *   already relied on.
 */

/**
 * Why this template is not available, or `null` when it is.
 * @param {object} template
 * @param {AvailabilityCtx} ctx
 * @returns {string|null}
 */
export function templateUnavailableReason(template, ctx = {}) {
  if (!template) return null;
  const { authorityEnabled = false, contractAddresses = null } = ctx;
  const name = template.name || template.id;

  if (template.legacyOnly) return UNAVAILABLE_REASON.LEGACY_ONLY(name);
  if (template.v2Only && !authorityEnabled) return UNAVAILABLE_REASON.V2_ONLY(name);
  if (contractAddresses && !isContractAvailable(template.contract, contractAddresses)) {
    const displayName = CONTRACT_MAP[template.contract]?.displayName || template.contract;
    return UNAVAILABLE_REASON.MISSING_CONTRACT(name, displayName);
  }
  return null;
}

/** Can this org propose this template right now? */
export function isTemplateAvailable(template, ctx = {}) {
  return Boolean(template) && templateUnavailableReason(template, ctx) === null;
}

/**
 * Swap in the access-v2 copy.
 *
 * Returns the ORIGINAL object when there is nothing to swap (and always on a legacy org), so a
 * legacy render is referentially identical to today's and `useMemo` consumers do not churn.
 */
export function applyAccessCopy(template, authorityEnabled = false) {
  if (!template || !authorityEnabled) return template;
  const inputs = template.inputs || [];
  const needsInputCopy = inputs.some((i) => i && i.v2HelpText);
  if (!template.v2Description && !needsInputCopy) return template;
  return {
    ...template,
    ...(template.v2Description ? { description: template.v2Description } : {}),
    ...(needsInputCopy
      ? { inputs: inputs.map((i) => (i && i.v2HelpText ? { ...i, helpText: i.v2HelpText } : i)) }
      : {}),
  };
}

/**
 * The templates this org may propose, in declaration order, with access-v2 copy applied.
 *
 * @param {{templates?: Array} & AvailabilityCtx} args
 * @returns {Array}
 */
export function availableTemplates({
  templates = SETTER_TEMPLATES,
  authorityEnabled = false,
  contractAddresses = null,
} = {}) {
  const ctx = { authorityEnabled, contractAddresses };
  return (templates || [])
    .filter((t) => isTemplateAvailable(t, ctx))
    .map((t) => applyAccessCopy(t, authorityEnabled));
}

/**
 * Developer mode's raw-ABI list, filtered the same way.
 *
 * Keeps every contract key even when its list empties out — the caller already drops a contract
 * with nothing callable, and preserving the keys keeps this a pure projection of the input.
 *
 * A raw function that is only PARTLY dead (TaskManager/DirectDemocracy `setConfig`, where one
 * config key stopped being read and the others did not) carries `v2Note` rather than `legacyOnly`:
 * removing the whole function would take live keys away with it.
 *
 * @param {{rawFunctions?: object} & AvailabilityCtx} args
 * @returns {object} contractKey -> function definitions
 */
export function availableRawFunctions({
  rawFunctions = RAW_FUNCTIONS,
  authorityEnabled = false,
} = {}) {
  const out = {};
  for (const [contractKey, fns] of Object.entries(rawFunctions || {})) {
    out[contractKey] = (fns || [])
      .filter((fn) => !fn.legacyOnly && !(fn.v2Only && !authorityEnabled))
      .map((fn) => (
        authorityEnabled && fn.v2Note
          ? { ...fn, description: `${fn.description} — ${fn.v2Note}` }
          : fn
      ));
  }
  return out;
}

/**
 * Resolve a template id the way a DEEP LINK has to: three outcomes, never a silent one.
 *
 * @param {string} id
 * @param {AvailabilityCtx} ctx
 * @returns {{id: string, template: object|null, available: boolean, reason: string|null}}
 *   `template` is null for an unknown id; `available` false with a `reason` for a known id this
 *   org cannot propose. On success `template` carries the access-v2 copy already applied.
 */
export function resolveSetterTemplate(id, ctx = {}) {
  const templates = ctx.templates || SETTER_TEMPLATES;
  const found = (templates || []).find((t) => t.id === id) || null;
  if (!found) {
    return {
      id,
      template: null,
      available: false,
      reason: 'That rule change is no longer available. Please choose an action again.',
    };
  }
  const reason = templateUnavailableReason(found, ctx);
  if (reason) return { id, template: found, available: false, reason };
  return { id, template: applyAccessCopy(found, ctx.authorityEnabled), available: true, reason: null };
}

/** The template, or `null` when this org cannot propose it. */
export function getAvailableTemplateById(id, ctx = {}) {
  const resolved = resolveSetterTemplate(id, ctx);
  return resolved.available ? resolved.template : null;
}

export default availableTemplates;

/** Reject retired setters in restored/raw drafts as well as the displayed menu. */
export function rawSetterUnavailableReason(proposal = {}) {
  const fn = RAW_FUNCTIONS[proposal.setterContract]?.find(entry => entry.name === proposal.setterFunction);
  if (fn?.legacyOnly) return 'This setting is retired. Change the role’s permissions instead.';
  if (proposal.setterFunction !== 'setConfig') return null;
  const key = Number(proposal.setterParams?.[0]);
  if ((proposal.setterContract === 'directDemocracyVoting' && key === 3)
      || (proposal.setterContract === 'taskManager' && key === 2)) {
    return 'This setting is retired. Change the role’s permissions instead.';
  }
  return null;
}
