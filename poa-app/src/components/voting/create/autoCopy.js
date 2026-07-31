/**
 * autoCopy — provenance-based prefill for the Create-a-Vote title/description.
 *
 * The wizard writes a suggested title and description as soon as the config
 * decision is made, and rewrites them as that decision is edited. It must never
 * clobber wording the *user* typed. The old test for "did we write this?" was
 * `name.startsWith(SENTINEL)`, which is wrong the moment someone appends to the
 * suggestion: `Create role: Treasurer — please approve by Friday` still passes
 * `startsWith` and gets overwritten by the next permission toggle.
 *
 * So we track provenance instead: `proposal.autoTitle` / `proposal.autoDescription`
 * hold the last value this flow generated. A field is ours to rewrite only if it
 * is empty or still exactly equal to what we last put there. With a real Back
 * button, edit → Back → reconfigure goes from a rare accident to everyday
 * navigation, so exact equality is required, not nice-to-have.
 *
 * Pure: no React, no state. Returns a partial `proposal` update to merge.
 */

/**
 * Compute the title/description update for a freshly generated suggestion.
 * Either field may be omitted (`null`/`undefined`) to leave it alone.
 *
 * @param {object} proposal current proposal state
 * @param {{ title?: string|null, description?: string|null }} generated
 * @returns {{ name?: string, autoTitle?: string, description?: string, autoDescription?: string }}
 */
export function applyAutoCopy(proposal, { title, description } = {}) {
  const p = proposal || {};
  const out = {};
  if (title != null && (!p.name || p.name === p.autoTitle)) {
    out.name = title;
    out.autoTitle = title;
  }
  if (description != null && (!p.description || p.description === p.autoDescription)) {
    out.description = description;
    out.autoDescription = description;
  }
  return out;
}

/**
 * Sentinel prefixes written by the pre-provenance version of this flow
 * (`ElectionConfigurator.TITLE_PREFIX`, `RoleConfigurator.TITLE_PREFIX`).
 * Only used to backfill drafts that predate `autoTitle`/`autoDescription`.
 */
export const LEGACY_TITLE_PREFIXES = ['Election for ', 'Create role: '];

/**
 * Matching description sentinels (`ElectionConfigurator.DESCRIPTION_PREFIX`,
 * `RoleConfigurator.DESCRIPTION_PREFIX`).
 */
export const LEGACY_DESCRIPTION_PREFIXES = ['Election between ', 'New role '];

const startsWithAny = (value, prefixes) =>
  typeof value === 'string' && prefixes.some((prefix) => value.startsWith(prefix));

/**
 * Backfill provenance onto a draft saved before `autoTitle`/`autoDescription`
 * existed, so an in-flight draft keeps its regenerate-on-change behaviour
 * instead of being frozen as "the user typed this".
 *
 * Legacy copy is recognised by the old sentinel prefixes. Anything else is
 * treated as hand-written and left alone — the safe direction: worst case the
 * user re-types a suggestion, never that we silently overwrite their words.
 * Modern drafts (which already carry the fields) and hand-written ones are
 * returned untouched.
 *
 * @param {object} draft persisted proposal draft
 * @returns {object} the draft, or a copy with the provenance fields filled in
 */
export function backfillProvenance(draft) {
  if (!draft || typeof draft !== 'object') return draft;

  const patch = {};
  if (!draft.autoTitle && startsWithAny(draft.name, LEGACY_TITLE_PREFIXES)) {
    patch.autoTitle = draft.name;
  }
  if (!draft.autoDescription && startsWithAny(draft.description, LEGACY_DESCRIPTION_PREFIXES)) {
    patch.autoDescription = draft.description;
  }

  if (Object.keys(patch).length === 0) return draft;
  return { ...draft, ...patch };
}
