/**
 * accessV2/roleFormBatch — ONE encoder for "create a role or a group", shared by both doors.
 *
 * PURE. There are two places in the app where a member can bring a new role into existence —
 * /team's RolesGroupsPanel and the Create-a-Vote wizard's "Create a role or group" intent — and
 * they used to disagree about what a role even is: the /team wizard could not set vouching, task
 * permissions or voting power; the vote wizard could not make a GROUP; neither could give the new
 * role a say in binding votes. Both now render `components/accessV2/RoleForm` and both encode
 * through this function, so a role created from either door is the same role.
 *
 * Four things this adds over `buildCreateRoleBatch` / `buildCreateGroupBatch` alone, all of which
 * are silent when missing rather than loud:
 *
 * 1. BINDING-VOTE POWER. A subject with every permission in the catalogue still has ZERO votes in
 *    a Blended (HybridVoting) vote until it is in a voting CLASS — `addHatToClass(classIdx,
 *    subjectId)`, executor-gated, keyed by subject ids on a v2 org (lib/voting/votingClasses).
 *    Nothing about the authority tells you this; the role simply never counts.
 * 2. THE TWO TASKMANAGER GRANTS THAT SURVIVED V2. `TaskManager._permMask` stops reading its
 *    ROLE_PERM table once an authority is set, but `setConfig(CREATOR_HAT_ALLOWED | ORGANIZER_HAT
 *    _ALLOWED)` keeps both enumerations and folds AUTHORITY membership over them
 *    (`_authorityHoldsAny`) — so those two are still setConfig calls, keyed by the SUBJECT id.
 * 3. THE VOUCH LINTS. The contract emits them as non-reverting events AFTER the write; showing
 *    them before the vote is opened is the only time anyone can act on them (lib/accessV2/vouch).
 * 4. THE BATCH CEILING. Both voting modules revert `TooManyCalls` above 20 AT PROPOSAL CREATION,
 *    and a role with a dozen permissions, a group, vouching and six people gets there — so the
 *    preflight runs here and the caller can refuse before the member has walked the whole form.
 *
 * The id-prediction RACE is inherited from the builders and must be surfaced: another open
 * subject-creating proposal executing first shifts the predicted id, and every downstream call in
 * this batch then lands on the wrong subject, with no revert (lib/accessV2/proposalRace).
 */

import { utils, constants } from 'ethers';
import { buildCreateRoleBatch, buildCreateGroupBatch, mergeBatches } from '@/lib/accessV2/proposalBuilders';
import { checkBatchSubmittable } from '@/lib/accessV2/submission';
import { predictLints } from '@/lib/accessV2/vouch';
import {
  buildClassVoterCall,
  classByIndex,
  classLabel,
  classVoterSummary,
  contractClassIndex,
  directClassIndex,
} from '@/lib/voting/votingClasses';
import { describePermChanges, permChangeSummaries } from '@/config/setterDefinitions';
import {
  dedupeDomains,
  dedupeEmails,
  domainError,
  emailError,
  joinMethods,
  joinConfigError,
  usesEmailEligibility,
  EMAIL_ELIGIBILITY_UNAVAILABLE,
} from '@/lib/accessV2/joinConfig';
import { buildSetOrgMetadataAdminCall, canSetOrgMetadataAdmin } from '@/lib/accessV2/orgAdmin';
import { DEFAULT_SPONSORSHIP, PAYMASTER_SUBJECT_TYPE, sponsorshipError, buildSubjectBudgetCall, buildPasskeyRulesCall } from '@/lib/accessV2/sponsorship';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';
import { buildSetManagerConfig } from '@/lib/accessV2/txBuilders';
import { ipfsCidToBytes32 } from '@/services/web3/utils/encoding';

// Re-exported so the two doors (and their tests) keep one import for everything class-related.
export { classByIndex, contractClassIndex };
import { toAddressSet } from '@/lib/voting/v2VoteActions';

export const ROLE_FORM_KIND = Object.freeze({ ROLE: 'role', GROUP: 'group' });

/** TaskManager.ConfigKey — the two org-wide task grants that are still LIVE on a v2 org. */
export const TM_CONFIG_KEY = Object.freeze({
  CREATOR_HAT_ALLOWED: 1,
  ORGANIZER_HAT_ALLOWED: 7,
});

export const taskManagerConfigInterface = new utils.Interface([
  'function setConfig(uint8 key, bytes value)',
]);
export const roleEmailConfigInterface = new utils.Interface([
  'function setActiveAllowlist(bytes32 root, bytes32 cid)',
  'function setHatMinterAuthorization(address minter, bool authorized)',
]);
const PREVIEW_COMMITMENT = `0x${'01'.repeat(32)}`;

const MAX_SEATS = 4294967295;
const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/i.test(a);
const isSubject = (value) => {
  try { const n = BigInt(String(value)); return n > 0n && n < (1n << 256n); } catch { return false; }
};
const lower = (v) => String(v ?? '').toLowerCase();
const trimmed = (v) => String(v ?? '').trim();

/**
 * The class index the member PICKED, or null for "not picked yet".
 * `Number(null)` is 0 — a real class index — so an unanswered picker would otherwise read as
 * "the first class", silently giving a role votes in a class nobody chose.
 */
function pickedClassIdx(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * A blank form. Returned as a fresh deep copy every time — `vouching` is nested, and one shared
 * object between the draft store, the /team modal and the vote wizard would let a keystroke in one
 * surface rewrite the other.
 */
export function defaultRoleForm() {
  return {
    kind: ROLE_FORM_KIND.ROLE,
    name: '',
    description: '',
    imageURI: '',
    // Seats: the toggle is the decision, `maxMembers` is only read when it is on. On chain 0 is
    // "no limit", so the two collapse into one number at encode time.
    limitSeats: false,
    maxMembers: 5,
    openRole: false,
    // Role kind: groups it joins. Group kind: roles inside it.
    groupIds: [],
    memberRoleIds: [],
    // PermissionPicker's shape, keyed by PERM_KEYS constant name: `{ DD_VOTE: true, TM_PERMS: 6 }`.
    perms: {},
    projectPerms: [],
    canCreateTasks: false,
    canOrganizeFolders: false,
    // Binding votes. `bindingClassIdx` is the CONTRACT class index (uint8), not an array position.
    bindingVote: false,
    bindingClassIdx: null,
    vouching: { enabled: false, quorum: 1, voucherSubjectId: '', selfVouch: false },
    // Email can be combined with vouching, but ZkEmailInvites rejects openly claimable roles.
    join: { domains: [] },
    // Specific-email invitees (ZkEmail allowlist, keyed by a one-way hash of the address).
    emailInvites: [],
    // "Edit org details" — make this role the org's single metadata editor
    // (OrgRegistry.setOrgMetadataAdminHat). NOT a permission key; a single org-wide designation.
    editOrgDetails: false,
    sponsorship: { ...DEFAULT_SPONSORSHIP },
    manager: { enabled: false, managerSubjectId: '', canGrant: true, canRemove: false, delaySecs: 0 },
    holders: [],
  };
}

/** Merge a partial form over the defaults without losing the nested vouching keys. */
export function normalizeRoleForm(form = {}) {
  const base = defaultRoleForm();
  const f = { ...base, ...(form || {}) };
  f.kind = f.kind === ROLE_FORM_KIND.GROUP ? ROLE_FORM_KIND.GROUP : ROLE_FORM_KIND.ROLE;
  f.vouching = { ...base.vouching, ...(form?.vouching || {}) };
  f.join = { ...base.join, ...(form?.join || {}) };
  f.join.domains = [...(form?.join?.domains || [])];
  f.perms = { ...(form?.perms || {}) };
  f.groupIds = [...(form?.groupIds || [])];
  f.memberRoleIds = [...(form?.memberRoleIds || [])];
  f.projectPerms = [...(form?.projectPerms || [])];
  f.emailInvites = [...(form?.emailInvites || [])];
  f.holders = [...(form?.holders || [])];
  f.editOrgDetails = Boolean(form?.editOrgDetails);
  f.sponsorship = { ...base.sponsorship, ...(form?.sponsorship || {}) };
  f.manager = { ...base.manager, ...(form?.manager || {}) };
  if (f.kind === ROLE_FORM_KIND.GROUP) {
    // A kind switch must not submit invisible role-only settings.
    f.openRole = false;
    f.limitSeats = false;
    f.maxMembers = 0;
    f.vouching = { ...base.vouching };
    f.join = { domains: [] };
    f.emailInvites = [];
    f.holders = [];
    f.groupIds = [];
    delete f.perms.QJ_AUTOJOIN;
  }
  return f;
}

export const isGroupForm = (form) => normalizeRoleForm(form).kind === ROLE_FORM_KIND.GROUP;

/** Seat cap as the contract takes it: 0 = no limit, which is also what the toggle-off means. */
export function effectiveMaxMembers(form) {
  const f = normalizeRoleForm(form);
  if (f.kind === ROLE_FORM_KIND.GROUP) return 0;
  if (!f.limitSeats) return 0;
  const n = Number(f.maxMembers);
  return Number.isInteger(n) && n > 0 && n <= MAX_SEATS ? n : 0;
}

/** Does this form ask for anything the DefaultAllowStrongPerms lint cares about? */
function hasStrongPerms(form) {
  const f = normalizeRoleForm(form);
  const anyPerm = Object.values(f.perms || {}).some((v) => (typeof v === 'number' ? v > 0 : Boolean(v)));
  const anyProject = (f.projectPerms || []).some((p) => Number(p?.mask) > 0);
  return anyPerm || anyProject || f.canCreateTasks || f.canOrganizeFolders || f.bindingVote;
}

// ── Validation ────────────────────────────────────────────────────────────────────────────────

/**
 * The one gate. Returns `null` when the form can be proposed, otherwise the member-facing reason —
 * the same string the wizard's step gate shows and the submit-time validator toasts, so the two
 * can never disagree about whether a form is ready.
 */
export function roleFormError(form) {
  const f = normalizeRoleForm(form);
  const group = f.kind === ROLE_FORM_KIND.GROUP;

  if (!trimmed(f.name)) return group ? 'Give the new group a name.' : 'Give the new role a name.';

  if (!group) {
    // Only judged when the seat switch is on — that is the only time the input is on screen, and
    // an error about a hidden control cannot be fixed. (0 still reads as “no limit”.)
    if (f.limitSeats) {
      const seats = Number(f.maxMembers);
      if (!Number.isInteger(seats) || seats < 0 || seats > MAX_SEATS) {
        return 'The seat limit must be a whole number from 0 (no limit) to 4,294,967,295.';
      }
    }

    if (f.vouching?.enabled) {
      const quorum = Number(f.vouching.quorum);
      if (!Number.isInteger(quorum) || quorum < 1 || quorum > MAX_SEATS) return 'Vouching needs a whole number from 1 to 4,294,967,295 vouches.';
      if (!f.vouching.selfVouch && !trimmed(f.vouching.voucherSubjectId)) {
        return 'Pick the role whose members can vouch, or let the new role vouch for itself.';
      }
      if (!f.vouching.selfVouch && !isSubject(f.vouching.voucherSubjectId)) return 'Pick a valid role or group whose members can vouch.';
    }

    // Email domains + specific-email invites (ZkEmail allowlist). Each entry must survive the exact
    // ASCII normalisation the merkle leaf uses, or it would be a permanently-unclaimable invite.
    for (const d of f.join?.domains || []) {
      const err = domainError(d);
      if (err) return err;
    }
    for (const invite of f.emailInvites || []) {
      const err = emailError(invite?.email ?? invite);
      if (err) return err;
    }
    const joinError = joinConfigError(f);
    if (joinError) return joinError;

    const seen = new Set();
    for (const h of f.holders || []) {
      if (!h?.address || !isAddress(h.address)) {
        return `"${h?.name || 'This person'}" has an invalid address.`;
      }
      if (seen.has(lower(h.address))) {
        return `${h.address.slice(0, 6)}…${h.address.slice(-4)} is listed twice.`;
      }
      seen.add(lower(h.address));
    }
  }

  if (f.manager.enabled) {
    if (!isSubject(f.manager.managerSubjectId)) return 'Pick the role or group that manages membership.';
    if (!f.manager.canGrant && !f.manager.canRemove) return 'Choose what the membership manager can do.';
    const delay = Number(f.manager.delaySecs);
    if (!Number.isInteger(delay) || delay < 0 || delay > MAX_SEATS) return 'The management delay must be a whole number of seconds from 0 to 4,294,967,295.';
    if (group && f.memberRoleIds.some((id) => isSubject(id) && BigInt(String(id)) === BigInt(String(f.manager.managerSubjectId)))) {
      return 'A role inside this group cannot manage the group’s membership.';
    }
  }

  const seenProjects = new Set();
  for (const p of f.projectPerms || []) {
    if (p?.projectId === null || p?.projectId === undefined || p?.projectId === '') {
      return 'Pick a project for each project-permission row, or remove the row.';
    }
    const key = String(p.projectId);
    if (seenProjects.has(key)) return 'Each project can only appear once in the permissions list.';
    seenProjects.add(key);
    if (!Number.isInteger(Number(p.mask)) || Number(p.mask) < 0 || Number(p.mask) > 255) return 'Task permissions must use a valid set of actions.';
  }

  for (const [key, value] of Object.entries(f.perms)) {
    if (value && !PERM_KEYS[key]) return 'A selected permission is no longer supported. Review the permissions.';
    if (key === 'TM_PERMS' && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 255)) return 'Task permissions must use a valid set of actions.';
  }
  const ids = group ? f.memberRoleIds : f.groupIds;
  if (ids.some((id) => !isSubject(id))) return group ? 'Pick valid roles for the group.' : 'Pick valid groups for the role.';
  if (new Set(ids.map(String)).size > (group ? 16 : 8)) return group ? 'A group can contain at most 16 roles.' : 'A role can belong to at most 8 groups.';

  if (f.bindingVote && pickedClassIdx(f.bindingClassIdx) === null) {
    return 'Pick which group of voters this role joins.';
  }
  if (f.bindingVote && pickedClassIdx(f.bindingClassIdx) > 255) return 'Pick a valid group of voters.';
  return sponsorshipError(f.sponsorship);
}

// ── Legacy bridge ─────────────────────────────────────────────────────────────────────────────

/**
 * The pre-v2 `proposal.roleConfig` lifted into a form.
 *
 * Kept because a DRAFT saved before this shipped still carries only `roleConfig`, and because the
 * mapping is the documentation of what each Hats-era field became. Deliberately does NOT sanitise
 * `maxSupply` — an out-of-range value has to survive into `roleFormError` so the member is told,
 * rather than being quietly rounded into something they did not ask for.
 */
export function roleConfigToRoleForm(roleConfig = {}) {
  const rc = roleConfig || {};
  const seats = Number(rc.maxSupply);
  const capProvided = rc.maxSupply !== undefined && rc.maxSupply !== null && rc.maxSupply !== '';
  return {
    ...defaultRoleForm(),
    kind: ROLE_FORM_KIND.ROLE,
    name: rc.name || '',
    description: rc.description || '',
    imageURI: rc.imageURI || '',
    // A cap the draft actually carries stays ON SCREEN — garbage included — so the validator's
    // complaint points at a visible input. Absent or 0 is “no limit”, which is what 0 means on v2.
    limitSeats: capProvided && seats !== 0,
    maxMembers: capProvided ? rc.maxSupply : 0,
    openRole: Boolean(rc.openRole),
    perms: {
      // `canVote` meant "can open a binding vote", which on v2 is the HV_CREATE permission —
      // NOT `setCreatorHatAllowed`, which HybridVoting stops reading once an authority is set.
      HV_CREATE: Boolean(rc.canVote),
      TM_PERMS: Number(rc.globalPerms) || 0,
    },
    projectPerms: (rc.projectPerms || []).map((p) => ({
      projectId: p?.projectId,
      projectName: p?.projectName || '',
      mask: Number(p?.mask) || 0,
    })),
    canCreateTasks: Boolean(rc.canCreateTasks),
    canOrganizeFolders: Boolean(rc.canOrganizeFolders),
    vouching: {
      enabled: Boolean(rc.vouching?.enabled),
      quorum: Number(rc.vouching?.quorum) || 1,
      voucherSubjectId: rc.vouching?.voucherHatId || '',
      selfVouch: Boolean(rc.vouching?.selfVouch),
    },
    holders: (rc.initialWearers || []).map((w) => ({
      address: w?.address || '',
      name: w?.name || '',
      sticky: false,
    })),
  };
}

/**
 * Which form a createRole proposal will actually be built from.
 *
 * ONE resolution, used by the validator, the encoder and the success copy — so a proposal can
 * never pass validation describing one thing and encode another. The new form wins whenever it
 * has a name; a pre-v2 draft (roleConfig only, merged over a blank `roleFormV2` by
 * `restoreProposal`) falls back to its legacy fields instead of looking empty.
 */
export function resolveRoleForm(proposal) {
  const form = proposal?.roleFormV2;
  if (form && trimmed(form.name)) return normalizeRoleForm(form);
  const rc = proposal?.roleConfig;
  if (rc && trimmed(rc.name)) return roleConfigToRoleForm(rc);
  return normalizeRoleForm(form || {});
}

// ── Copy ──────────────────────────────────────────────────────────────────────────────────────

export const ROLE_TITLE_PREFIX = 'Create role: ';
export const GROUP_TITLE_PREFIX = 'Create group: ';

/** The title + description the vote wizard suggests while the form is being filled in. */
export function roleFormCopy(form) {
  const f = normalizeRoleForm(form);
  const name = trimmed(f.name);
  if (!name) return { title: '', description: '' };

  if (f.kind === ROLE_FORM_KIND.GROUP) {
    const count = (f.memberRoleIds || []).length;
    return {
      title: `${GROUP_TITLE_PREFIX}${name}`,
      description:
        `Create the group “${name}”`
        + (count ? ` with ${count} role${count === 1 ? '' : 's'} in it` : '')
        + '. Every role in a group gets the group’s permissions.',
    };
  }

  const bits = [];
  if (f.openRole) bits.push('anyone can claim it');
  if (f.limitSeats && Number(f.maxMembers) > 0) bits.push(`${Math.floor(Number(f.maxMembers))} seats`);
  if (f.vouching?.enabled) {
    const q = Number(f.vouching.quorum) || 1;
    bits.push(`${q} vouch${q === 1 ? '' : 'es'} to join`);
  }
  if (f.bindingVote) bits.push('a vote in binding votes');
  const holders = (f.holders || []).filter((h) => isAddress(h?.address)).length;
  if (holders) bits.push(`${holders} starting member${holders === 1 ? '' : 's'}`);

  return {
    title: `${ROLE_TITLE_PREFIX}${name}`,
    description: `Create the role “${name}”${bits.length ? ` — ${bits.join(', ')}` : ''}.`,
  };
}

// ── Voting classes ────────────────────────────────────────────────────────────────────────────

/**
 * Which class a new subject should join: the member's pick, else the DIRECT (one-member-one-vote)
 * class — the one every org has and the only one where a brand-new role has any weight without
 * also holding tokens. -1 when the org has no class to join.
 */
export function resolveBindingClassIdx(form, votingClasses = []) {
  const f = normalizeRoleForm(form);
  const explicit = pickedClassIdx(f.bindingClassIdx);
  if (explicit !== null) return explicit;
  const arrayIdx = directClassIndex(votingClasses);
  if (arrayIdx < 0) return -1;
  return contractClassIndex(votingClasses, arrayIdx);
}

// ── The batch ─────────────────────────────────────────────────────────────────────────────────

/**
 * The builders count permissions (“Give it 3 permissions”); a voter needs the list. Replace that
 * one line with the same sentences the change-permissions template writes, so a role created
 * here and a role edited there read the same way on the ballot.
 */
const PERM_COUNT_LINE = /^Give (it|the group) \d+ permissions?/;

function describePerms(form, name) {
  const f = normalizeRoleForm(form);
  const out = permChangeSummaries(name, describePermChanges({}, f.perms));
  const projects = (f.projectPerms || []).filter(
    (p) => (Number(p?.mask) > 0 || p?.inheritGlobal === false) && p.projectId !== null && p.projectId !== undefined && p.projectId !== ''
  );
  if (projects.length) {
    const names = projects.map((p) => p.projectName || `project ${p.projectId}`);
    out.push(`Set what “${name}” can do on ${names.join(', ')}`);
    const overrides = projects.filter((p) => p.inheritGlobal === false).map((p) => p.projectName || `project ${p.projectId}`);
    if (overrides.length) out.push(`Use only the selected task actions from “${name}” on ${overrides.join(', ')}, replacing its org-wide task permissions there`);
  }
  if (f.kind === ROLE_FORM_KIND.GROUP && out.length) out.push('Every role in the group gets these.');
  return out;
}

/** The two TaskManager `setConfig` grants, keyed by the new subject id. */
function buildTaskManagerGrants({ taskManagerAddress, subjectId, canCreateTasks, canOrganizeFolders }) {
  const batch = [];
  const summaries = [];
  const warnings = [];
  const wanted = Boolean(canCreateTasks) || Boolean(canOrganizeFolders);
  if (!wanted) return { batch, summaries, warnings };

  if (!taskManagerAddress) {
    warnings.push(
      'This group has no task manager set up, so the "create projects and tasks" and '
      + '"organise the folder tree" permissions were left out.'
    );
    return { batch, summaries, warnings };
  }

  const grant = (key) => ({
    target: taskManagerAddress,
    value: '0',
    data: taskManagerConfigInterface.encodeFunctionData('setConfig', [
      key,
      utils.defaultAbiCoder.encode(['uint256', 'bool'], [subjectId, true]),
    ]),
  });

  if (canCreateTasks) {
    batch.push(grant(TM_CONFIG_KEY.CREATOR_HAT_ALLOWED));
    summaries.push('Let it create projects and tasks');
  }
  if (canOrganizeFolders) {
    batch.push(grant(TM_CONFIG_KEY.ORGANIZER_HAT_ALLOWED));
    summaries.push('Let it organise the project folders');
  }
  return { batch, summaries, warnings };
}

/** The one `addHatToClass` call that gives the new subject a say in binding votes. */
function buildBindingVoteCall({ hybridVoting, votingClasses, form, subjectId, name }) {
  const f = normalizeRoleForm(form);
  const batch = [];
  const summaries = [];
  const warnings = [];

  // OFF is the normal answer and gets no warning: on every org the Member role already sits in
  // the one-member-one-vote class, so the people in a new role keep whatever vote their other
  // roles give them. The old copy (“this role has no say in binding votes”) was false.
  if (!f.bindingVote) return { batch, summaries, warnings };

  const classIdx = resolveBindingClassIdx(f, votingClasses);
  if (classIdx < 0) {
    warnings.push(
      'This org has no one-member-one-vote class to join, so the new role was not given a vote '
      + 'in binding votes.'
    );
    return { batch, summaries, warnings };
  }
  if (!hybridVoting) {
    warnings.push(
      'This org’s binding-vote contract hasn’t loaded, so the new role was not given a vote in '
      + 'binding votes.'
    );
    return { batch, summaries, warnings };
  }

  // A pick that outlived the org's classes (a draft from before a `setClasses` vote) would
  // revert `InvalidClassCount` inside announceWinner and take the WHOLE batch down with it —
  // role, permissions and holders — while the vote reads as passed. Drop the call instead.
  const cls = classByIndex(votingClasses, classIdx);
  if ((votingClasses || []).length > 0 && !cls) {
    warnings.push(
      'The group of voters this role was to join no longer exists, so it was not given a vote in '
      + 'binding votes. Pick another one.'
    );
    return { batch, summaries, warnings };
  }

  try {
    batch.push(buildClassVoterCall({ hybridVoting, classIdx, subjectId, add: true }));
  } catch (err) {
    warnings.push(err?.message || 'Could not add the new role to a group of voters.');
    return { batch: [], summaries: [], warnings };
  }

  summaries.push(classVoterSummary({ roleName: name, classIdx, votingClasses, add: true }));
  // An EMPTY class is open to every address on chain (HybridVotingCore `if (n == 0) return
  // true`); the first role added closes it. Voters should know that is what they decide.
  if (cls && (cls.hatIds || []).length === 0) {
    warnings.push(
      `${classLabel(cls, classIdx, { withShare: false })} is currently open to everyone (no role is listed), `
      + `so this limits that part of every binding vote to “${name}”.`
    );
  }
  return { batch, summaries, warnings };
}

/**
 * FORM -> one governance batch.
 *
 * @param {object} opts
 * @param {string} opts.authority - MembershipAuthority address
 * @param {string} [opts.hybridVoting] - the org's HybridVoting, for the class call
 * @param {string} [opts.taskManagerAddress]
 * @param {Array} [opts.indexedSubjects] - EVERY indexed subject, for the id prediction
 * @param {Array} [opts.activeProposals] - in-flight proposals, for the id-race warning
 * @param {Set<string>|Array} [opts.inOrgUsers] - the contract's `_isInOrg` set (grant vs offer)
 * @param {Array} [opts.votingClasses] - the org's HybridVoting classes
 * @param {object} opts.form - a RoleForm value
 * @param {string} [opts.metadataCID] - bytes32 CID for `{ name, description }`
 * @returns {{batch: Array, summaries: string[], warnings: string[], gasLimit: number,
 *           predictedSubjectId: string, kind: string, createsSubject: boolean,
 *           submittable: {ok: boolean, code: string|null, message: string|null}}}
 */
export function buildRoleFormBatch({
  authority,
  hybridVoting = '',
  taskManagerAddress = '',
  orgRegistry = '',
  orgId = '',
  paymasterHub = '',
  sponsorshipConfig = null,
  nativeSymbol = 'native tokens',
  zkEmailAddress = '',
  emailConfig = null,
  emailAllowlist = null,
  executor = '',
  preview = false,
  indexedSubjects = [],
  activeProposals = [],
  inOrgUsers = null,
  votingClasses = [],
  form = {},
  metadataCID = null,
} = {}) {
  if (!authority) {
    throw new Error('This org’s roles contract hasn’t loaded yet — please try again in a moment.');
  }

  const f = normalizeRoleForm(form);
  // Encoding has the same validation as the visible form. A missing class pick may resolve to
  // the current DIRECT class; every other invalid field must stop instead of being rounded/dropped.
  const resolvedClass = f.bindingVote ? resolveBindingClassIdx(f, votingClasses) : f.bindingClassIdx;
  const validationForm = { ...f, bindingVote: f.bindingVote && resolvedClass >= 0, bindingClassIdx: resolvedClass };
  const formError = roleFormError(validationForm);
  if (formError) throw new Error(formError);
  const group = f.kind === ROLE_FORM_KIND.GROUP;
  const name = trimmed(f.name);
  const inOrg = toAddressSet(inOrgUsers);

  const projectPerms = (f.projectPerms || [])
    .filter((p) => p && p.projectId !== null && p.projectId !== undefined && p.projectId !== '')
    .map((p) => ({ projectId: p.projectId, mask: Number(p.mask) || 0, inheritGlobal: p.inheritGlobal !== false }));

  const holders = (f.holders || [])
    .filter((h) => h && isAddress(h.address))
    .map((h) => ({
      address: h.address,
      name: h.name || '',
      inOrg: inOrg.has(lower(h.address)),
      // Someone put into a role at creation can still resign from it — only an elected seat is
      // locked to governance. The People step can still opt in per person.
      sticky: Boolean(h.sticky),
    }));

  const shared = {
    authority,
    existingSubjects: indexedSubjects,
    activeProposals,
  };
  const metadata = metadataCID ? { metadataCID } : {};

  const base = group
    ? buildCreateGroupBatch({
      ...shared,
      config: {
        name,
        imageURI: f.imageURI || '',
        ...metadata,
        memberRoleIds: [...new Set((f.memberRoleIds || []).map((id) => String(id)))],
        perms: f.perms,
        projectPerms,
      },
    })
    : buildCreateRoleBatch({
      ...shared,
      config: {
        name,
        imageURI: f.imageURI || '',
        ...metadata,
        maxMembers: effectiveMaxMembers(f),
        defaultAllow: Boolean(f.openRole),
        groupIds: [...new Set((f.groupIds || []).map((id) => String(id)))],
        perms: f.perms,
        projectPerms,
        vouch: f.vouching?.enabled
          ? {
            quorum: Number(f.vouching.quorum) || 1,
            voucherSubjectId: f.vouching.voucherSubjectId || 0,
            selfVouch: Boolean(f.vouching.selfVouch),
          }
          : null,
        manager: f.manager.enabled ? f.manager : null,
        initialHolders: holders,
      },
    });

  const subjectId = base.subjectId;
  const groupManager = { batch: [], summaries: [] };
  if (group && f.manager.enabled) {
    groupManager.batch.push(buildSetManagerConfig(authority, subjectId, f.manager));
    groupManager.summaries.push('Let the selected membership manager manage the roles in this group');
  }

  const taskGrants = buildTaskManagerGrants({
    taskManagerAddress,
    subjectId,
    canCreateTasks: f.canCreateTasks,
    canOrganizeFolders: f.canOrganizeFolders,
  });

  const binding = buildBindingVoteCall({
    hybridVoting,
    votingClasses,
    form: f,
    subjectId,
    name: name || 'this role',
  });

  const contextErrors = [];
  // This designation can be a role OR a group: OrgRegistry resolves the opaque subject via router.
  const orgDetails = { batch: [], summaries: [], warnings: [] };
  if (f.editOrgDetails) {
    if (canSetOrgMetadataAdmin({ orgRegistry, orgId })) {
      orgDetails.batch.push(buildSetOrgMetadataAdminCall({ orgRegistry, orgId, subjectId }));
      orgDetails.summaries.push(`Let members of “${name}” edit the org’s name and details`);
      orgDetails.warnings.push(
        'The org has one role or group designated to edit its details. This replaces the current designation.'
      );
    } else {
      contextErrors.push('The org registry must load before editing org details can be assigned.');
    }
  }

  const sponsorship = { batch: [], summaries: [], warnings: [] };
  if (f.sponsorship.enabled) {
    if (!isAddress(paymasterHub) || !sponsorshipConfig?.ready || !sponsorshipConfig?.canConfigure) {
      contextErrors.push(sponsorshipConfig?.error || 'Gas sponsorship is not ready or this org’s voting executor cannot configure it.');
    } else {
      sponsorship.batch.push(buildSubjectBudgetCall({ paymasterHub, orgId, subjectId, config: f.sponsorship }));
      sponsorship.summaries.push(`Set a shared gas sponsorship limit of ${f.sponsorship.capNative} ${nativeSymbol} per ${f.sponsorship.epochDays} days for “${name}”`);
      if (f.sponsorship.supportPasskeys) {
        sponsorship.batch.push(buildPasskeyRulesCall({ paymasterHub, orgId, authority, zkEmailAddress, orgRegistry, editOrgDetails: f.editOrgDetails }));
        sponsorship.summaries.push('Enable org sponsorship rules for passkey membership actions and configured email claims');
        if (!group && usesEmailEligibility(f)) {
          if (sponsorshipConfig.claimBudgetMissing === true && isAddress(zkEmailAddress)) {
            sponsorship.batch.push(buildSubjectBudgetCall({
              paymasterHub, orgId, subjectId: zkEmailAddress, config: f.sponsorship,
              subjectType: PAYMASTER_SUBJECT_TYPE.CLAIM,
            }));
            sponsorship.summaries.push(`Initialize the org’s shared email-claim gas budget at ${f.sponsorship.capNative} ${nativeSymbol} per ${f.sponsorship.epochDays} days`);
          } else if (sponsorshipConfig.claimBudgetMissing !== false) {
            contextErrors.push('The org’s email-claim gas budget must be checked before enabling passkey email joining.');
          }
        }
      }
      sponsorship.warnings.push('Gas sponsorship also needs available org funds and compatible fee limits. These limits are shared by all members of the role or group.');
    }
  }

  const inviteDomains = group ? [] : dedupeDomains(f.join?.domains);
  const inviteEmails = group ? [] : dedupeEmails((f.emailInvites || []).map((e) => e?.email ?? e));
  const invitePlan = { domains: inviteDomains, emails: inviteEmails };
  const email = { batch: [], summaries: [], warnings: [] };
  if (!group && usesEmailEligibility(f)) {
    if (!isAddress(zkEmailAddress) || !emailConfig?.ready || !emailConfig.enabled || !emailConfig.authorityMatches) {
      contextErrors.push(emailConfig?.error || EMAIL_ELIGIBILITY_UNAVAILABLE);
    } else {
      if (inviteDomains.length && emailConfig.domainEnabled === false) contextErrors.push('This org’s email-domain verifier is not configured.');
      if (inviteEmails.length && emailConfig.emailEnabled === false) contextErrors.push('This org’s specific-email verifier is not configured.');
      // Authorizing the existing org module enables MembershipAuthority.setEmailVerified and
      // Executor.mintHatsForUser. It does not change the Executor's authority/router wiring.
      if (emailConfig.minterAuthorized === false) {
        if (!isAddress(executor)) contextErrors.push('The org executor must load before email joining can be enabled.');
        else email.batch.push({ target: executor, value: '0', data: roleEmailConfigInterface.encodeFunctionData('setHatMinterAuthorization', [zkEmailAddress, true]) });
      } else if (emailConfig.minterAuthorized !== true) {
        contextErrors.push('Email joining authorization has not loaded.');
      }
      let root = emailAllowlist?.root;
      let cid = emailAllowlist?.cid;
      if (emailAllowlist && String(emailAllowlist.subjectId || '') !== subjectId) {
        contextErrors.push('The role id changed while preparing email invites. Refresh and review the proposal again.');
      } else if (!root || !cid) {
        if (preview) { root = PREVIEW_COMMITMENT; cid = PREVIEW_COMMITMENT; }
        else contextErrors.push('Prepare the merged email allowlist before submitting this proposal.');
      }
      if (root && cid) {
        try {
          if (!utils.isHexString(root, 32) || root === constants.HashZero) throw new Error();
          // The general CID utility hashes arbitrary strings as a fallback; that is unsafe for
          // a committed allowlist because it produces a CID that can never be fetched.
          if (!utils.isHexString(cid, 32) && !/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) throw new Error();
          const cidBytes = utils.isHexString(cid, 32) ? cid : ipfsCidToBytes32(cid);
          if (!utils.isHexString(cidBytes, 32) || cidBytes === constants.HashZero) throw new Error();
          email.batch.push({ target: zkEmailAddress, value: '0', data: roleEmailConfigInterface.encodeFunctionData('setActiveAllowlist', [root, cidBytes]) });
        } catch { contextErrors.push('The prepared email allowlist has an invalid root or content address.'); }
      }
      if (inviteDomains.length) email.summaries.push(`Allow verified emails from ${inviteDomains.join(', ')} to claim “${name}”`);
      if (inviteEmails.length) email.summaries.push(`Allow ${inviteEmails.length} specific email address${inviteEmails.length === 1 ? '' : 'es'} to claim “${name}” after proving ownership`);
      email.warnings.push('This merges the org’s current email allowlist. Another email-list vote executing first can make the list stale; coordinate those votes before execution.');
    }
  }

  const merged = mergeBatches(base, groupManager, taskGrants, binding, orgDetails, sponsorship, email);
  const warnings = [...merged.warnings];

  // The config-time lints the contract emits AFTER the write. Shown here, before the vote opens,
  // is the only moment anyone can act on them.
  if (!group) {
    const lints = predictLints({
      defaultAllow: Boolean(f.openRole),
      vouchQuorum: f.vouching?.enabled ? Number(f.vouching.quorum) || 1 : 0,
      maxMembers: effectiveMaxMembers(f),
      hasStrongPerms: hasStrongPerms(f),
      voucherSubjectId: f.vouching?.enabled && f.vouching.selfVouch
        ? subjectId
        : f.vouching?.voucherSubjectId,
      subjectId,
    });
    for (const lint of lints) warnings.push(lint.message);
  }

  // A kind switch can leave the other kind's answers behind. They are dropped rather than
  // encoded — say so instead of silently losing people.
  if (group && (form.holders || []).some((h) => isAddress(h?.address))) {
    warnings.push(
      'Groups have no members of their own — the people you listed were left out. Add them to one '
      + 'of the roles in this group instead.'
    );
  }

  // NOT folded into `warnings`: a batch over the on-chain ceiling is unsubmittable, and both
  // doors gate on `submittable.ok` — a sentence in the ballot metadata would be read by voters of
  // a proposal that could never have been created.
  //
  // The same gate refuses a form whose answers the encoder had to DROP because a contract address
  // had not loaded: proposing “a role that votes” without the addHatToClass call, or “creates
  // tasks” without the TaskManager grants, is a different role from the one on screen.
  const missingContext = [];
  if (f.bindingVote && !hybridVoting) missingContext.push('binding-vote contract');
  if (f.bindingVote && (!classByIndex(votingClasses, resolveBindingClassIdx(f, votingClasses)) || !binding.batch.length)) {
    contextErrors.push('The selected group of voters no longer exists. Choose an available voting group.');
  }
  if ((f.canCreateTasks || f.canOrganizeFolders) && !taskManagerAddress) missingContext.push('task manager');
  const submittable = missingContext.length
    ? {
      ok: false,
      code: 'context-missing',
      message: `This org’s ${missingContext.join(' and ')} hasn’t loaded, so this can’t be proposed yet — give it a moment.`,
    }
    : contextErrors.length
      ? { ok: false, code: 'context-missing', message: contextErrors.join(' ') }
      : checkBatchSubmittable(merged.batch);

  return {
    batch: merged.batch,
    summaries: merged.summaries.flatMap((s) => (PERM_COUNT_LINE.test(s) ? describePerms(f, name) : [s])),
    warnings,
    invitePlan,
    preview: Boolean(preview),
    joinSummary: group ? [] : joinMethods(f),
    gasLimit: merged.gasLimit,
    predictedSubjectId: subjectId,
    kind: f.kind,
    createsSubject: true,
    submittable,
  };
}

export default buildRoleFormBatch;
