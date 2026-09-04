/**
 * accessV2/proposalBuilders — governance batches for the authority surface.
 *
 * PURE. Each builder returns `{ batch, summaries, warnings, ... }` where `batch` is the array of
 * `{ target, value, data }` calls the existing proposal flow already speaks
 * (`useProposalForm.buildProposalData` -> `VotingService.createHybridProposal` ->
 * `createProposal(title, descriptionHash, duration, numOptions, batches, hatIds)`).
 *
 * Three things these builders do that the v1 EligibilityModule encoder did not:
 *
 * 1. ONE call creates the subject. v1 needed createHatWithEligibility + configureVouching +
 *    setCreatorHatAllowed + setProjectRolePerm + setConfig + updateHatMetadata, each pointed at a
 *    hat id predicted from `Hats.getNextId`. v2 keeps a batch only because permissions and initial
 *    holders are separate rows — the id prediction is now pure arithmetic over indexed subjects
 *    (see ids.predictNextSubjectIds), but the RACE IS THE SAME: another subject-creating proposal
 *    executing first shifts the ids and every downstream call in the batch lands on the wrong
 *    subject. `warnings` carries that, and the UI must show it.
 *
 * 2. GRANT vs OFFER is a real decision, not an implementation detail. `grant` on someone already in
 *    the org ADDS them; for anyone else the consent model requires an OFFER they claim themselves.
 *    Note what `grant` does NOT do: it does not revert `NotInOrg`. The deployed contract writes the
 *    rule and, when `_isInOrg` is false, emits `RoleOffered` instead of flipping acceptance
 *    (MembershipAuthorityLogic.grant) — the `NotInOrg` error exists only as a `canGrant` preflight
 *    reason code. So a wrong classification is not a dead batch; it silently produces an
 *    offer-needing-claim while the UI says "Added". `inOrg` must therefore mirror the contract's
 *    `_isInOrg` — `userSubjectList[user].length > 0`, i.e. ACCEPTED anywhere, regardless of current
 *    eligibility — which is what `normalizeAuthorityMemberships().inOrgUsers` computes. It is NOT
 *    the active-member set: an accepted-but-lapsed member is in-org on chain.
 *
 * 3. STICKY is surfaced, defaulted TRUE-delegable, and explained. `delegable: false` locks the
 *    seat to governance forever and survives renounce.
 *
 * GAS: `announceWinner` wraps the batch in try/catch, so an under-funded call is silently skipped
 * and the proposal still reports success. `estimateBatchGas` returns the floor a caller must pass
 * as an explicit gas limit — `useAccessV2Proposal` parks it against the created proposal id and
 * `useVoteActions.handleFinalize` applies it to the finalize transaction (lib/accessV2/gasFloors).
 */

import { constants, utils } from 'ethers';
import { parseProjectId } from '@/services/web3/utils/encoding';
import { predictNextSubjectIds, hasCompetingSubjectCreation } from './ids';
import {
  buildCreateRole,
  buildCreateGroup,
  buildRenameSubject,
  buildSetMaxMembers,
  buildSetSubjectDefault,
  buildSetPerm,
  buildClearPerm,
  buildAddRoleToGroup,
  buildRemoveRoleFromGroup,
  buildGrant,
  buildOffer,
  buildRemove,
  buildUnremove,
  buildWithdrawOffer,
  buildSetRule,
  buildClearRule,
  buildConfigureVouchAttestor,
  buildResetVouchEpoch,
  buildSetManagerConfig,
} from './txBuilders';
import { PERM_KEYS, GLOBAL_CTX, boolPermWord, maskPermWord, foldTag, FOLD_TAG } from './permKeys';

/** A person on the ballot: their name when the form knows it, else a short address. */
const holderLabel = (h) => h?.name
  || (String(h?.address || '').length > 10 ? `${h.address.slice(0, 6)}…${h.address.slice(-4)}` : String(h?.address || ''));

/**
 * Gas floor for an authority batch. `announceWinner` prices only the CAUGHT-FAILURE path when
 * wallets estimate, so anything non-trivial under-funds and no-ops. Deliberately generous.
 */
export function estimateBatchGas(batch = []) {
  const BASE = 400_000;
  const PER_CALL = 250_000;
  return BASE + PER_CALL * (batch || []).length;
}

/**
 * ctx for a TaskManager per-project row.
 *
 * TWO things this has to get right, and both are silent when wrong — a row written at the wrong
 * ctx is a perfectly valid row that simply governs nothing the reader ever asks about:
 *
 * 1. THE +1 OFFSET (spec freeze amendment W4). TaskManager reads
 *    `hasPerm(user, TM_PERMS, bytes32(uint256(pid) + 1))` — `TaskManager._permMask`, and the
 *    convention is stated in `AccessV2PermKeys.sol`'s header. The offset exists because TM project
 *    ids START AT 0 and ctx 0 is the authority's GLOBAL context, so the identity mapping would
 *    collide every org's first project with its global rows. Writing the un-offset id lands every
 *    row exactly one project off: project N's permissions govern project N-1, and project 0's
 *    become the subject's global grant.
 *
 * 2. THE ID FORMAT. Project ids reach the UI as the SUBGRAPH's composite `{taskManager}-{n}`;
 *    the contract wants the bytes32. `parseProjectId` is the conversion the rest of the app
 *    already makes (TaskService, the folder tree), so it is the one used here.
 *
 * Always returns a full bytes32 — the ABI field is `bytes32`, and a short hex string encodes as an
 * INVALID_ARGUMENT rather than being left-padded for you.
 *
 * Only a NULLISH/empty id means "global". Numeric `0` is a real project — the first one every org
 * creates — and must not be mistaken for the global ctx.
 */
export function projectCtx(projectId) {
  if (projectId === null || projectId === undefined) return GLOBAL_CTX;
  const s = String(projectId).trim();
  if (s === '') return GLOBAL_CTX;
  // Composite subgraph id. Narrowly detected so the plain forms below keep their exact behaviour:
  // parseProjectId's last resort is to KECCAK an unrecognised string, which would turn a short hex
  // id like '0xabc' into an unrelated ctx.
  const raw = /^0x[0-9a-fA-F]{40}-/.test(s) ? parseProjectId(s) : s;
  let pid;
  try {
    pid = BigInt(raw);
  } catch {
    throw new Error(`accessV2: "${projectId}" is not a project id`);
  }
  return utils.hexZeroPad(utils.hexlify(pid + 1n), 32);
}

/**
 * Turn the wizard's permission selection into perm-table rows.
 *
 * @param {object} perms - `{ DD_VOTE: true, TM_PERMS: 6, ... }` keyed by PERM_KEYS constant name
 * @param {Array<{projectId: string, mask: number, inheritGlobal?: boolean}>} [projectPerms]
 * @returns {Array<{ permKey: string, ctx: string, word: string }>}
 */
export function buildPermRows(perms = {}, projectPerms = []) {
  const rows = [];
  for (const [name, value] of Object.entries(perms || {})) {
    const key = PERM_KEYS[name];
    if (!key) continue;
    if (foldTag(key) === FOLD_TAG.OR_MASK) {
      const mask = Number(value) || 0;
      if (mask <= 0) continue;
      rows.push({ permKey: key, ctx: GLOBAL_CTX, word: maskPermWord(mask, { inheritGlobal: false }) });
    } else {
      if (!value) continue;
      rows.push({ permKey: key, ctx: GLOBAL_CTX, word: boolPermWord(true) });
    }
  }
  for (const p of projectPerms || []) {
    // Nullish/empty means "no project named", NOT project 0 — TaskManager ids start at 0, so a
    // falsy test here would silently drop every rule about the first project an org ever made.
    if (!p || p.projectId === null || p.projectId === undefined || p.projectId === '') continue;
    const mask = Number(p.mask) || 0;
    if (mask <= 0) continue;
    // NEW project rows default to inherit=true. That is deliberate: v1's implicit REPLACE is the
    // twice-bitten shadowing bug where a role's global grant went silently dead inside a project.
    rows.push({
      permKey: PERM_KEYS.TM_PERMS,
      ctx: projectCtx(p.projectId),
      word: maskPermWord(mask, { inheritGlobal: p.inheritGlobal !== false }),
    });
  }
  return rows;
}

/**
 * CREATE ROLE — the KUBI user story, as one governance batch.
 *
 * @param {object} opts
 * @param {string} opts.authority
 * @param {Array} opts.existingSubjects - indexed subjects, for the id prediction
 * @param {Array} [opts.activeProposals] - in-flight proposals, for the race warning
 * @param {object} opts.config
 * @param {string} opts.config.name
 * @param {string} [opts.config.imageURI]
 * @param {string} [opts.config.metadataCID]
 * @param {number} [opts.config.maxMembers=0] - 0 = unlimited
 * @param {boolean} [opts.config.defaultAllow=false] - true makes it an OPEN role anyone can claim
 * @param {string[]} [opts.config.groupIds] - groups this role joins (it inherits their permissions)
 * @param {object} [opts.config.perms] - keyed by PERM_KEYS name
 * @param {Array} [opts.config.projectPerms]
 * @param {object} [opts.config.vouch] - `{ quorum, voucherSubjectId }`
 * @param {object} [opts.config.manager] - `{ managerSubjectId, canGrant, canRemove, delaySecs }`
 * @param {Array<{address: string, inOrg: boolean, sticky?: boolean}>} [opts.config.initialHolders]
 */
export function buildCreateRoleBatch({ authority, existingSubjects = [], activeProposals = [], config = {} }) {
  const {
    name,
    imageURI = '',
    metadataCID = constants.HashZero,
    maxMembers = 0,
    defaultAllow = false,
    groupIds = [],
    perms = {},
    projectPerms = [],
    vouch = null,
    manager = null,
    initialHolders = [],
  } = config;

  if (!name || !String(name).trim()) throw new Error('A role needs a name.');

  const [subjectId] = predictNextSubjectIds(authority, existingSubjects, 1);
  const batch = [buildCreateRole(authority, { name, metadataCID, imageURI, maxMembers })];
  const summaries = [`Create the role “${name}”`];

  if (defaultAllow) {
    // A brand-new subject has no members, so `force` is never needed here.
    batch.push(buildSetSubjectDefault(authority, subjectId, true, false));
    summaries.push('Make it open — anyone in the co-op can join it');
  }

  for (const groupId of groupIds || []) {
    batch.push(buildAddRoleToGroup(authority, subjectId, groupId));
    summaries.push('Add it to a group (it picks up that group’s permissions)');
  }

  const permRows = buildPermRows(perms, projectPerms);
  for (const row of permRows) {
    batch.push(buildSetPerm(authority, subjectId, row.permKey, row.ctx, row.word));
  }
  if (permRows.length) summaries.push(`Give it ${permRows.length} permission${permRows.length === 1 ? '' : 's'}`);

  if (vouch && Number(vouch.quorum) > 0) {
    // A self-vouching config points at the role being created — its id is the predicted one.
    const voucherSubjectId = vouch.selfVouch ? subjectId : vouch.voucherSubjectId;
    batch.push(buildConfigureVouchAttestor(authority, subjectId, vouch.quorum, voucherSubjectId));
    summaries.push(`Require ${vouch.quorum} vouch${Number(vouch.quorum) === 1 ? '' : 'es'} to join`);
  }

  if (manager && manager.managerSubjectId) {
    batch.push(buildSetManagerConfig(authority, subjectId, manager));
    summaries.push('Let another role manage its members');
  }

  for (const holder of initialHolders || []) {
    if (!holder || !holder.address) continue;
    const delegable = !holder.sticky;
    if (holder.inOrg) {
      batch.push(buildGrant(authority, subjectId, holder.address, delegable));
      summaries.push(`Add ${holderLabel(holder)}`);
    } else {
      // Out-of-org: consent is required, so this is an invitation they accept themselves.
      batch.push(buildOffer(authority, subjectId, holder.address, delegable));
      summaries.push(`Invite ${holderLabel(holder)}`);
    }
  }

  const warnings = [];
  if (hasCompetingSubjectCreation(activeProposals)) {
    warnings.push(
      'Another proposal that creates a role or group is still open. If it passes first, this '
      + 'proposal’s permissions would land on the wrong role — close or finish that one first.'
    );
  }

  // `createsSubject` is what makes the id-prediction race detectable for the NEXT proposal — see
  // lib/accessV2/proposalRace.
  return { batch, subjectId, summaries, warnings, createsSubject: true, gasLimit: estimateBatchGas(batch) };
}

/** CREATE GROUP — a group with its member roles and its shared permissions. */
export function buildCreateGroupBatch({ authority, existingSubjects = [], activeProposals = [], config = {} }) {
  const { name, imageURI = '', metadataCID = constants.HashZero, memberRoleIds = [], perms = {}, projectPerms = [] } = config;
  if (!name || !String(name).trim()) throw new Error('A group needs a name.');

  const [subjectId] = predictNextSubjectIds(authority, existingSubjects, 1);
  const batch = [buildCreateGroup(authority, { name, metadataCID, imageURI, memberRoleIds })];
  const summaries = [
    `Create the group “${name}”`
    + (memberRoleIds.length ? ` with ${memberRoleIds.length} role${memberRoleIds.length === 1 ? '' : 's'} in it` : ''),
  ];

  const permRows = buildPermRows(perms, projectPerms);
  for (const row of permRows) {
    batch.push(buildSetPerm(authority, subjectId, row.permKey, row.ctx, row.word));
  }
  if (permRows.length) {
    summaries.push(
      `Give the group ${permRows.length} permission${permRows.length === 1 ? '' : 's'} — every role in it gets them`
    );
  }

  const warnings = [];
  if (hasCompetingSubjectCreation(activeProposals)) {
    warnings.push(
      'Another proposal that creates a role or group is still open. If it passes first, this '
      + 'proposal’s permissions would land on the wrong group — close or finish that one first.'
    );
  }
  // `createsSubject` is what makes the id-prediction race detectable for the NEXT proposal — see
  // lib/accessV2/proposalRace.
  return { batch, subjectId, summaries, warnings, createsSubject: true, gasLimit: estimateBatchGas(batch) };
}

/**
 * EDIT PERMISSIONS on an existing role or group.
 *
 * Diffs against the CURRENT rows so an untouched permission is not rewritten (a no-op write still
 * costs gas and still emits an event the feed would render as a change).
 *
 * @param {Array<{permKey: string, ctx: string, word: string}>} currentRows - decoded existing rows
 * @param {Array<{permKey: string, ctx: string, word: string}>} nextRows - from buildPermRows
 */
export function buildEditPermsBatch({ authority, subjectId, subjectName = 'this role', currentRows = [], nextRows = [] }) {
  const keyOf = (r) => `${String(r.permKey).toLowerCase()}|${String(r.ctx).toLowerCase()}`;
  const current = new Map((currentRows || []).map((r) => [keyOf(r), r]));
  const next = new Map((nextRows || []).map((r) => [keyOf(r), r]));

  const batch = [];
  const summaries = [];

  for (const [k, row] of next) {
    const before = current.get(k);
    if (before && String(before.word) === String(row.word)) continue;
    batch.push(buildSetPerm(authority, subjectId, row.permKey, row.ctx, row.word));
    summaries.push(`${before ? 'Change' : 'Add'} a permission on ${subjectName}`);
  }
  for (const [k, row] of current) {
    if (next.has(k)) continue;
    batch.push(buildClearPerm(authority, subjectId, row.permKey, row.ctx));
    summaries.push(`Remove a permission from ${subjectName}`);
  }

  return { batch, summaries, warnings: [], createsSubject: false, gasLimit: estimateBatchGas(batch) };
}

/**
 * GROUP COMPOSITION — which roles are in a group.
 * Every role added here gains ALL of the group's permissions at once, and every role removed loses
 * them; the UI has to say so before the vote is opened.
 */
export function buildGroupCompositionBatch({ authority, groupId, groupName = 'this group', addRoleIds = [], removeRoleIds = [] }) {
  const batch = [];
  const summaries = [];
  for (const roleId of addRoleIds || []) {
    batch.push(buildAddRoleToGroup(authority, roleId, groupId));
    summaries.push(`Add a role to ${groupName} — it gains every permission the group has`);
  }
  for (const roleId of removeRoleIds || []) {
    batch.push(buildRemoveRoleFromGroup(authority, roleId, groupId));
    summaries.push(`Remove a role from ${groupName} — it loses every permission the group gives`);
  }
  return { batch, summaries, warnings: [], createsSubject: false, gasLimit: estimateBatchGas(batch) };
}

/**
 * DELEGATION setup — "Executives manage Members".
 *
 * The delay is the review window; setting it to 0 means a manager's action lands instantly, which
 * removes the only chance anyone has to object. The builder warns rather than forbids.
 */
export function buildManagerConfigBatch({ authority, subjectId, subjectName = 'this role', managerName = 'the manager role', config = {} }) {
  const { managerSubjectId = 0, canGrant = false, canRemove = false, delaySecs = 0 } = config;
  const clearing = !managerSubjectId || String(managerSubjectId) === '0';

  const batch = [buildSetManagerConfig(authority, subjectId, { managerSubjectId, canGrant, canRemove, delaySecs })];
  const summaries = [
    clearing
      ? `Stop letting anyone manage ${subjectName} outside of a vote`
      : `Let ${managerName} manage who holds ${subjectName}`,
  ];

  const warnings = [];
  if (!clearing && !canGrant && !canRemove) {
    warnings.push('This delegation grants no powers — the managers would not be able to do anything.');
  }
  if (!clearing && Number(delaySecs) === 0) {
    warnings.push(
      'With no delay, a manager’s decision takes effect immediately and nobody gets a chance to '
      + 'object. A delay is what makes this a review window.'
    );
  }
  if (clearing) {
    warnings.push('Clearing the delegation also cancels anything the managers currently have pending.');
  }
  return { batch, summaries, warnings, createsSubject: false, gasLimit: estimateBatchGas(batch) };
}

/**
 * MEMBER ACTIONS by vote — add / invite / remove / block / unblock, plus the raw rule writes.
 *
 * A governance write overwrites ANY existing rule in one call, so a "grant someone who is banned"
 * action needs no paired clear.
 *
 * @param {Array<{ action: 'grant'|'offer'|'remove'|'ban'|'unban'|'withdrawOffer'|'clearRule',
 *                 address: string, sticky?: boolean }>} actions
 */
export function buildMemberActionsBatch({ authority, subjectId, subjectName = 'this role', actions = [] }) {
  const batch = [];
  const summaries = [];
  const warnings = [];

  for (const a of actions || []) {
    if (!a || !a.address) continue;
    const delegable = !a.sticky;
    switch (a.action) {
      case 'grant':
        batch.push(buildGrant(authority, subjectId, a.address, delegable));
        summaries.push(`Add ${holderLabel(a)} to ${subjectName}`);
        if (a.sticky) {
          warnings.push(`${a.address} would be locked in: only another vote could remove them.`);
        }
        break;
      case 'offer':
        batch.push(buildOffer(authority, subjectId, a.address, delegable));
        summaries.push(`Invite ${holderLabel(a)} to ${subjectName}`);
        break;
      case 'withdrawOffer':
        batch.push(buildWithdrawOffer(authority, subjectId, a.address));
        summaries.push(`Withdraw the invitation to ${a.address}`);
        break;
      case 'remove':
        batch.push(buildRemove(authority, subjectId, a.address, false));
        summaries.push(`Remove ${a.address} from ${subjectName}`);
        break;
      case 'ban':
        batch.push(buildRemove(authority, subjectId, a.address, true));
        summaries.push(`Block ${a.address} from ${subjectName}`);
        break;
      case 'unban':
        batch.push(buildUnremove(authority, subjectId, a.address));
        summaries.push(`Unblock ${a.address}`);
        break;
      case 'clearRule':
        batch.push(buildClearRule(authority, subjectId, a.address));
        summaries.push(`Clear the standing decision about ${a.address}`);
        break;
      default:
        throw new Error(`accessV2: unknown member action "${a.action}"`);
    }
  }
  return { batch, summaries, warnings, createsSubject: false, gasLimit: estimateBatchGas(batch) };
}

/** Raw rule write, for the cases the verbs above do not cover. */
export function buildSetRuleBatch({ authority, subjectId, user, kind, delegable = true }) {
  const batch = [buildSetRule(authority, subjectId, user, kind, delegable)];
  return { batch, summaries: [`Set the standing decision for ${user}`], warnings: [], createsSubject: false, gasLimit: estimateBatchGas(batch) };
}

/**
 * VOUCH CONFIG by vote.
 *
 * `resetEpoch` invalidates EVERY existing vouch on the subject at once — the members held ONLY by
 * vouches lapse, and a `reconcile` is what actually clears them. That is a big hammer and the
 * warning says so.
 */
export function buildVouchConfigBatch({ authority, subjectId, subjectName = 'this role', quorum = 0, voucherSubjectId = 0, resetEpoch = false, currentMemberCount = 0 }) {
  const batch = [buildConfigureVouchAttestor(authority, subjectId, quorum, voucherSubjectId)];
  const summaries = [
    Number(quorum) > 0
      ? `Require ${quorum} vouch${Number(quorum) === 1 ? '' : 'es'} to join ${subjectName}`
      : `Stop requiring vouches for ${subjectName}`,
  ];
  const warnings = [];

  if (resetEpoch) {
    batch.push(buildResetVouchEpoch(authority, subjectId));
    summaries.push('Clear every existing vouch');
    if (currentMemberCount > 0) {
      warnings.push(
        `Clearing the vouches makes every current member who is held ONLY by vouches stop `
        + `qualifying (${currentMemberCount} member${currentMemberCount === 1 ? '' : 's'} to re-check).`
      );
    }
  }
  return { batch, summaries, warnings, createsSubject: false, gasLimit: estimateBatchGas(batch) };
}

/** Rename / re-image a subject, and adjust its seat cap. */
export function buildEditSubjectBatch({ authority, subjectId, name, imageURI = '', metadataCID = constants.HashZero, maxMembers = null, currentMemberCount = 0 }) {
  const batch = [buildRenameSubject(authority, subjectId, { name, metadataCID, imageURI })];
  const summaries = [`Rename it to “${name}”`];
  const warnings = [];

  if (maxMembers !== null && maxMembers !== undefined) {
    batch.push(buildSetMaxMembers(authority, subjectId, maxMembers));
    summaries.push(
      Number(maxMembers) === 0 ? 'Remove the seat limit' : `Set the seat limit to ${maxMembers}`
    );
    if (Number(maxMembers) > 0 && Number(maxMembers) < Number(currentMemberCount)) {
      warnings.push(
        `The role already has ${currentMemberCount} members, which is over the new limit. Nobody is `
        + 'removed, but no one new can join until it drops below the limit.'
      );
    }
  }
  return { batch, summaries, warnings, createsSubject: false, gasLimit: estimateBatchGas(batch) };
}

/**
 * Flip a subject between OPEN (anyone in the org may claim) and INVITE-ONLY.
 *
 * Closing an open role that has members REQUIRES `force`, because every member who had no other
 * eligibility source lapses. The contract makes it an explicit act; so does this.
 */
export function buildSubjectDefaultBatch({ authority, subjectId, subjectName = 'this role', allow, currentMemberCount = 0 }) {
  const needsForce = !allow && Number(currentMemberCount) > 0;
  const batch = [buildSetSubjectDefault(authority, subjectId, allow, needsForce)];
  const summaries = [
    allow ? `Open ${subjectName} to everyone in the org` : `Make ${subjectName} invite-only`,
  ];
  const warnings = [];
  if (needsForce) {
    warnings.push(
      `${currentMemberCount} member${currentMemberCount === 1 ? '' : 's'} currently hold this role only `
      + 'because it is open. Closing it means they stop qualifying.'
    );
  }
  return { batch, summaries, warnings, createsSubject: false, gasLimit: estimateBatchGas(batch) };
}

/** Merge several builder results into one proposal batch, preserving order. */
export function mergeBatches(...results) {
  const batch = [];
  const summaries = [];
  const warnings = [];
  for (const r of results) {
    if (!r) continue;
    batch.push(...(r.batch || []));
    summaries.push(...(r.summaries || []));
    warnings.push(...(r.warnings || []));
  }
  return { batch, summaries, warnings, createsSubject: false, gasLimit: estimateBatchGas(batch) };
}
