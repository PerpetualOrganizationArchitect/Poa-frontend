/**
 * Setter Function Definitions for Governance Votes
 *
 * This file defines all available setter functions that can be called
 * through governance votes. Includes user-friendly templates and raw
 * function definitions for advanced mode.
 */

import { utils } from 'ethers';
import { parseProjectId } from '@/services/web3/utils/encoding';
import { PERM_CATALOGUE, PERM_KEYS, TASK_PERM_BITS } from '@/lib/accessV2/permKeys';
import { buildPermRows, buildEditPermsBatch, estimateBatchGas } from '@/lib/accessV2/proposalBuilders';
import {
  buildClassVoterCall,
  classByIndex,
  classVoterSummary,
  classLabel,
  classHolds,
  classesHolding,
} from '@/lib/voting/votingClasses';

// ============================================================================
// ACCESS-SYSTEM FLAGS
// ============================================================================
//
// A template/raw-function entry declares WHICH access system it belongs to; nothing else in the
// app hardcodes the ids. `src/lib/voting/setterAvailability.js` is the only reader — it turns
// these flags plus `useOrgAuthority().enabled` into the list a member sees.
//
//   legacyOnly     — the call still SUCCEEDS on an access-v2 org and still emits the legacy event
//                    the subgraph indexes, but the contract no longer reads the table it writes.
//                    Offering it would let a group hold a vote, pass it, and change nothing while
//                    the UI reported success. Hidden once the authority is live.
//   v2Only         — needs the MembershipAuthority; hidden on a legacy org.
//   idsAreSubjects — LIVE on both, but on a v2 org the role ids it writes are AUTHORITY SUBJECT
//                    ids (the contract resolves them through `authority.isMember`), not Hats ids.
//                    Purely a copy concern — see `v2HelpText` / `v2Description`.
//   v2HelpText / v2Description / v2Note
//                  — copy swapped in ONLY when the authority is live, so a legacy org renders
//                    byte-identically to what it renders today.

// ============================================================================
// VALUE HELPERS
// ============================================================================

/**
 * True when `value` is a 0x-prefixed 32-byte hex string.
 *
 * Deliberately strict — the lowercase `0x` is literal, because that is exactly
 * what ethers accepts. Always call it on the output of normalizeBytes32, never
 * on raw input: the pair is what keeps validation and encoding in agreement.
 */
export function isBytes32(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value ?? '').trim());
}

/**
 * Repair the ways a pasted bytes32 arrives slightly wrong, so validation and
 * ethers agree on what counts as valid. Handles surrounding whitespace, a
 * missing prefix, and an uppercase `0X` prefix — block explorers and terminals
 * produce all three, and ethers rejects the last two outright.
 *
 * Hex digit case is preserved: it is meaningless to the encoder, and keeping it
 * lets someone eyeball the value against wherever they copied it from.
 * Input that is not recoverable comes back untouched, so the validation message
 * quotes what the user actually typed.
 */
export function normalizeBytes32(value) {
  const trimmed = String(value ?? '').trim();
  const body = /^0[xX]/.test(trimmed) ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(body)) return `0x${body}`;
  return trimmed;
}

/**
 * Shorten a hash for display while keeping both ends, so a reader can check it
 * against the source they copied it from. Short values are returned untouched.
 */
export function abbreviateHash(value) {
  const s = String(value ?? '').trim();
  if (s.length <= 8 + 6 + 1) return s || '(not set)';
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

// ============================================================================
// ACCESS-V2 PERMISSION HELPERS  (used by the `edit-role-permissions` template)
// ============================================================================

/**
 * Verb phrases for the permission catalogue, so a proposal can say what it DOES rather than
 * reprinting a checkbox label. `PERM_CATALOGUE[].label` is written for a checkbox ("Granted on
 * join"), which does not survive being dropped into a sentence.
 */
const PERM_ACTION_WORDS = {
  DD_VOTE: 'vote in community votes',
  DD_CREATE: 'open a community vote',
  HV_CREATE: 'open a binding vote',
  PT_MEMBER: 'hold shares',
  PT_APPROVE: 'approve other people’s share requests',
  EDU_CREATE: 'publish learning modules',
  EDU_MEMBER: 'take learning modules and earn their rewards',
  PAY_CREATE: 'request payments from the treasury',
  QJ_AUTOJOIN: 'be given to everyone who joins through the join link',
  SUBJECT_RENAME: 'rename roles and groups',
};

/** The same treatment for the task bits, which the picker labels for a checkbox too. */
const TASK_ACTION_WORDS = {
  CREATE: 'create tasks',
  CLAIM: 'claim tasks',
  REVIEW: 'review finished tasks',
  ASSIGN: 'assign tasks to other people',
  SELF_REVIEW: 'finish their own claimed tasks',
  BUDGET: 'set project budgets',
  EDIT_META: 'edit task titles',
  EDIT_FULL: 'edit task titles and pay',
};

const permWords = (id) => PERM_ACTION_WORDS[id]
  || (PERM_CATALOGUE.find((e) => e.id === id)?.label || id).toLowerCase();
const taskWords = (bit) => TASK_ACTION_WORDS[bit.id] || bit.label.toLowerCase();

// Autojoin is configured under Joining, but remains a real permission row. Preserve it when
// reading/diffing stored permissions so moving the control cannot silently remove an org's rule.
const PERM_CONFIG_ENTRIES = PERM_CATALOGUE.flatMap((entry) => entry.id === 'SUBJECT_RENAME'
  ? [{ id: 'QJ_AUTOJOIN', key: PERM_KEYS.QJ_AUTOJOIN }, entry]
  : [entry]);

/** "a", "a and b", "a, b and c" — the list voice the rest of the vote copy uses. */
export function joinPhrases(items = []) {
  const list = items.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * A subject's OWN global permissions, in the `{ DD_VOTE: true, TM_PERMS: 6 }` shape
 * `PermissionPicker` edits and `buildPermRows` consumes.
 *
 * OWN, not effective: this is the seed for an editor that rewrites THIS subject's rows. Folding in
 * a group's permissions would show ticks the member cannot untick here, and unticking one would
 * emit a `clearPerm` for a row that does not exist on this subject.
 *
 * GLOBAL ctx only. A per-project row lives at `ctx = bytes32(projectId + 1)` and is deliberately
 * invisible to this editor, so the diff can never clear one it never showed.
 *
 * @param {object} subject - a `useAuthoritySubjects()` subject (post `attachPerms`)
 */
export function permsFromSubject(subject) {
  const out = {};
  if (!subject) return out;
  const rows = subject.permRows || [];
  for (const entry of PERM_CONFIG_ENTRIES) {
    const row = typeof subject.permGlobal === 'function'
      ? subject.permGlobal(entry.key)
      : rows.find((r) => (
        String(r.permKey).toLowerCase() === String(entry.key).toLowerCase()
        && r.isGlobalCtx && r.exists
      ));
    if (!row || !row.exists) continue;
    let value;
    try {
      value = BigInt(row.value ?? 0);
    } catch {
      value = 0n;
    }
    if (value === 0n) continue;
    out[entry.id] = entry.mask ? Number(value) : true;
  }
  return out;
}

/** Drop anything that is not a catalogue key, so a stale form value cannot reach the encoder. */
export function normalizePermSelection(perms) {
  const out = {};
  if (!perms || typeof perms !== 'object') return out;
  for (const entry of PERM_CONFIG_ENTRIES) {
    const value = perms[entry.id];
    if (entry.mask) {
      const mask = Number(value) || 0;
      if (mask > 0) out[entry.id] = mask;
    } else if (value) {
      out[entry.id] = true;
    }
  }
  return out;
}

/**
 * What changed between two permission selections, in words a member can read.
 * @returns {{granted: string[], removed: string[], taskAdded: string[], taskRemoved: string[],
 *            changed: boolean}}
 */
export function describePermChanges(currentPerms = {}, nextPerms = {}) {
  const before = normalizePermSelection(currentPerms);
  const after = normalizePermSelection(nextPerms);

  const granted = [];
  const removed = [];
  for (const entry of PERM_CONFIG_ENTRIES) {
    if (entry.mask) continue;
    const had = Boolean(before[entry.id]);
    const has = Boolean(after[entry.id]);
    if (has && !had) granted.push(permWords(entry.id));
    if (had && !has) removed.push(permWords(entry.id));
  }

  const beforeMask = Number(before.TM_PERMS || 0);
  const afterMask = Number(after.TM_PERMS || 0);
  const taskAdded = [];
  const taskRemoved = [];
  for (const bit of TASK_PERM_BITS) {
    const had = (beforeMask & bit.value) === bit.value;
    const has = (afterMask & bit.value) === bit.value;
    if (has && !had) taskAdded.push(taskWords(bit));
    if (had && !has) taskRemoved.push(taskWords(bit));
  }

  return {
    granted,
    removed,
    taskAdded,
    taskRemoved,
    changed: granted.length + removed.length + taskAdded.length + taskRemoved.length > 0,
  };
}

/**
 * One sentence per kind of change, each naming the role — the per-call summary list the review
 * screen renders beside a governance batch. `buildEditPermsBatch` emits a generic "Change a
 * permission on X" per call; a member voting on this needs to know WHICH permission.
 */
export function permChangeSummaries(subjectName, changes) {
  const name = `“${subjectName}”`;
  const out = [];
  if (changes.granted.length) out.push(`Let ${name} ${joinPhrases(changes.granted)}`);
  if (changes.removed.length) out.push(`Stop ${name} being able to ${joinPhrases(changes.removed)}`);
  if (changes.taskAdded.length) out.push(`Let ${name} ${joinPhrases(changes.taskAdded)}`);
  if (changes.taskRemoved.length) {
    out.push(`Stop ${name} being able to ${joinPhrases(changes.taskRemoved)}`);
  }
  return out;
}

// ============================================================================
// CLASS-VOTER HELPERS  (used by the `change-class-voters` template)
// ============================================================================

/**
 * The classes the form is deciding against, as an array.
 *
 * `template.validate(values)` is called with `setterValues` and NOTHING ELSE
 * (`useProposalForm.validateSetterProposal`, `lib/voting/proposalChecks.configError`), so the org's
 * voting classes have to live IN the form values or this template cannot check itself at all.
 * They get there two ways, both writing the same key:
 *
 *   - `SetterActionSelector.handleTemplateSelect` seeds the hidden input (`seedFrom:
 *     'votingClasses'`) when the action is picked, and
 *   - the `votingClassSelect` field re-writes the snapshot together with the chosen index, in one
 *     update — which is what covers a `?propose=change-class-voters` deep link, whose seeding
 *     (VotingPage.handleProposeRuleChange) knows nothing about this input.
 *
 * Writing the snapshot WITH the choice is also what makes the index trustworthy: the number the
 * member picked and the classes `preview`/`buildBatch` describe are the same list, so a class
 * ordering that changed under them cannot silently relabel the call.
 */
export function classesFromValues(values) {
  const list = values?.votingClasses;
  return Array.isArray(list) ? list : [];
}

/**
 * Why this class-voter change can't be proposed, or `null` when it can.
 *
 * Shared by `validate` (which gates the wizard's Next) and `buildBatch` (which must never be
 * reachable with values validate would have refused). The two failures worth catching here are the
 * silent ones: adding a role a class ALREADY counts, and removing one it never counted, both
 * execute happily and change nothing — the exact "vote passed, nothing happened" shape this file
 * keeps having to close.
 */
export function classVoterProblem(values) {
  const classes = classesFromValues(values);
  const rawIdx = values?.classIdx;
  const roleId = String(values?.role ?? '').trim();
  const add = values?.action !== 'Remove';

  if (rawIdx === undefined || rawIdx === null || rawIdx === '') {
    return 'Pick which voters this change applies to.';
  }
  const idx = Number(rawIdx);
  if (!Number.isInteger(idx) || idx < 0) return 'Pick which voters this change applies to.';
  if (!roleId) return 'Pick the role whose voting rights should change.';

  // No classes means the snapshot never arrived (still loading, or an org whose blended voting was
  // never configured). Encoding an index into a list we cannot see is a guess.
  if (classes.length === 0) {
    return 'This group’s binding votes haven’t loaded their voters yet — try again in a moment.';
  }
  // `classIdx` is the CONTRACT index (what the picker writes and `addHatToClass` stores), which
  // is not always the array position — resolve, never index.
  const cls = classByIndex(classes, idx);
  if (!cls) return 'Pick which voters this change applies to.';

  const label = classLabel(cls, idx);
  const holds = classHolds(cls, roleId);
  if (add && holds) return `That role already votes in binding votes as ${label}.`;
  if (!add && !holds) return `That role doesn’t vote in binding votes as ${label}, so there is nothing to remove.`;
  // HybridVoting treats a class with NO roles as open to every address (`if (n == 0) return
  // true` in HybridVotingCore; the legacy arm has the same `hatIds.length == 0` rule). Removing
  // the last role would hand that share of every binding vote to anyone on the internet, so it
  // is refused here rather than described.
  if (!add && holds && (cls.hatIds || []).length <= 1) {
    return `Removing the last role from ${label} would open that part of every binding vote to anyone — `
      + 'the contract counts an empty list as everyone. Add another role to it first.';
  }
  return null;
}

/** The cautions a member should read before this one lands on the ballot. */
export function classVoterWarnings(values, roleName = 'this role') {
  const classes = classesFromValues(values);
  const idx = Number(values?.classIdx);
  const roleId = String(values?.role ?? '').trim();
  const add = values?.action !== 'Remove';
  const out = [];
  const cls = classByIndex(classes, idx);
  if (!cls) return out;

  const label = classLabel(cls, idx);
  if (add) {
    // An EMPTY class is open: the contract counts every address as a member of it. Adding the
    // first role is therefore a restriction, and voters should know that is what they decide.
    if ((cls.hatIds || []).length === 0) {
      out.push(
        `${label} is currently open to everyone (no role is listed), so adding “${roleName}” limits `
        + 'that part of every binding vote to its members.'
      );
    }
    return out;
  }
  // Removing the LAST role is refused by classVoterProblem (it would open the class), so the
  // only thing left to say is when the role itself ends up with no vote anywhere.
  if (classesHolding(classes, roleId).length <= 1) {
    out.push(`Members of “${roleName}” would have no vote in binding votes at all.`);
  }
  return out;
}

// ============================================================================
// CATEGORIES - For UI grouping
// ============================================================================

export const SETTER_CATEGORIES = {
  voting: {
    name: 'Voting Rules',
    icon: 'FiCheckSquare',
    color: 'purple',
    description: 'Threshold, voting power, who can create proposals'
  },
  permissions: {
    name: 'Role Permissions',
    icon: 'FiUsers',
    color: 'blue',
    description: 'Who can create proposals and manage tasks'
  },
  emergency: {
    name: 'Emergency Controls',
    icon: 'FiAlertTriangle',
    color: 'red',
    description: 'Pause or resume organization features'
  },
  tasks: {
    name: 'Task Management',
    icon: 'FiClipboard',
    color: 'green',
    description: 'Project permissions and bounty settings'
  },
  tokenSettings: {
    name: 'Share Settings',
    icon: 'FiTag',
    color: 'teal',
    description: 'Share name and symbol settings'
  }
};

// ============================================================================
// CONTRACT ADDRESS MAPPING
// ============================================================================

export const CONTRACT_MAP = {
  hybridVoting: {
    contextKey: 'votingContractAddress',
    displayName: 'Blended Voting',
    description: 'Main voting contract for proposals'
  },
  directDemocracyVoting: {
    contextKey: 'directDemocracyVotingContractAddress',
    displayName: 'Direct Democracy',
    description: 'One person, one vote system'
  },
  taskManager: {
    contextKey: 'taskManagerContractAddress',
    displayName: 'Task Manager',
    description: 'Project and task management'
  },
  participationToken: {
    contextKey: 'participationTokenAddress',
    displayName: 'Shares',
    description: 'Organization shares contract'
  },
  zkEmailInvites: {
    contextKey: 'zkEmailInvitesAddress',
    displayName: 'Email Invites',
    description: 'ZK email allowlist module (claim roles by proving your email)'
  },
  // Access v2. `isContractAvailable` needs no special case: the caller supplies
  // `membershipAuthorityAddress` only when the org's authority is live and router-bound, so a
  // legacy org resolves it to undefined and every template targeting it disappears — the same
  // rule the optional Email Invites module already follows.
  membershipAuthority: {
    contextKey: 'membershipAuthorityAddress',
    displayName: 'Roles and permissions',
    description: 'Who holds each role, and what each role is allowed to do'
  }
};

// ============================================================================
// USER-FRIENDLY TEMPLATES
// ============================================================================

/** Longest a proposal title should be, so it sits in the title input unclipped. */
export const SETTER_TITLE_MAX = 60;

/**
 * `name` is the picker label (title case, sorted next to its siblings).
 * `autoTitle` is the pre-filled *proposal title* a member votes on, so it is
 * written in the member-facing voice from `src/config/votingVocabulary.js`:
 * the weighted system is "Blended voting", never "Hybrid". Curated by hand
 * rather than derived from `preview({})`, which is empty or wrong for most
 * templates until their params are filled. See SETTER_TITLE_FALLBACK below.
 */
export const SETTER_TEMPLATES = [
  // ===== EMAIL INVITES =====
  {
    id: 'email-invites',
    category: 'permissions',
    name: 'Change who can join by email',
    // Immediate placeholder title. Once the invite field has read the saved list
    // it replaces this with the actual change ("2 added, 1 removed"), through the
    // same autoTitle provenance rule — so an edited title is never overwritten.
    autoTitle: 'Change who can join by email',
    description:
      'Approve the invite list saved in Settings, so the people on it can join by proving they own their email address.',
    contract: 'zkEmailInvites',
    functionName: 'setActiveAllowlist',
    inputs: [
      // The only visible field. It reads the saved list and shows the people it lets
      // in — nobody votes on a hash. It also fills `summary` for the proposal title.
      {
        name: 'cid',
        label: 'The list',
        type: 'emailInviteList',
        validateAs: 'bytes32',
        rootField: 'root',
        summaryField: 'summary',
        readableField: 'listReadable'
      },
      // Derived from the saved list, never typed. Kept in form state so it is encoded
      // and submitted with the vote.
      { name: 'root', type: 'hidden', validateAs: 'bytes32' },
      { name: 'summary', type: 'hidden', optional: true },
      { name: 'details', type: 'hidden', optional: true },
      { name: 'listReadable', type: 'hidden', optional: true }
    ],
    encode: (values) => [normalizeBytes32(values.root), normalizeBytes32(values.cid)],
    // A member should never be asked to approve something they could not read. The
    // field reports whether the list loaded; if it did not, block the proposal.
    validate: (values) => (
      values.listReadable
        ? null
        : 'The invite list hasn’t loaded yet, so there is nothing to show members.'
    ),
    // Filled in by the field once it has read the list, so the board shows the change
    // in words. The fingerprint fallback only appears if the list never loaded.
    preview: (values) => (
      values.summary || `Change who can join by email (list ${abbreviateHash(normalizeBytes32(values.cid))})`
    ),
    // Once the field has read the list, the title states the change itself.
    // Null until then, so the curated autoTitle stands in.
    retitle: (values) => values.summary || null,
    // The description a member reads, written from the real list once the field
    // has read it: who is joining, who is losing their invite, and that approving
    // replaces the whole list. Null until then, so the preview line stands in.
    // Applied through applyAutoCopy, so an edited description is never clobbered.
    describe: (values) => values.details || null
  },
  // ===== VOTING RULES =====
  {
    id: 'change-threshold-hybrid',
    category: 'voting',
    name: 'Change Blended Voting Threshold',
    autoTitle: 'Change support threshold (Blended voting)',
    description: 'Set the minimum support percentage required for blended votes to pass',
    contract: 'hybridVoting',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'threshold',
        label: 'Threshold Percentage',
        type: 'number',
        min: 1,
        max: 100,
        placeholder: 'e.g. 51',
        helpText: 'Percentage of support required to pass (1-100)'
      }
    ],
    encode: (values) => {
      const configKey = 0; // ConfigKey.THRESHOLD
      const encodedValue = utils.hexZeroPad(utils.hexlify(Number(values.threshold)), 32);
      return [configKey, encodedValue];
    },
    preview: (values) => `Change blended voting threshold to ${values.threshold}%`
  },
  {
    id: 'change-threshold-dd',
    category: 'voting',
    name: 'Change Direct Democracy Threshold',
    autoTitle: 'Change support threshold (Direct democracy)',
    description: 'Set the minimum support percentage required for direct democracy votes to pass',
    contract: 'directDemocracyVoting',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'threshold',
        label: 'Threshold Percentage',
        type: 'number',
        min: 1,
        max: 100,
        placeholder: 'e.g. 51',
        helpText: 'Percentage of support required to pass (1-100)'
      }
    ],
    encode: (values) => {
      const configKey = 0; // ConfigKey.THRESHOLD
      const encodedValue = utils.hexZeroPad(utils.hexlify(Number(values.threshold)), 32);
      return [configKey, encodedValue];
    },
    preview: (values) => `Change direct democracy threshold to ${values.threshold}%`
  },
  {
    id: 'change-quorum-hybrid',
    category: 'voting',
    name: 'Change Blended Voting Quorum',
    autoTitle: 'Change the minimum number of voters (Blended voting)',
    description: 'Set the minimum number of voters required for blended votes to be valid',
    contract: 'hybridVoting',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'quorum',
        label: 'Minimum Voters',
        type: 'number',
        min: 0,
        max: 1000000,
        placeholder: 'e.g. 5',
        helpText: 'Minimum number of voters required (0 = no minimum)'
      }
    ],
    encode: (values) => {
      const configKey = 3; // ConfigKey.QUORUM
      const encodedValue = utils.hexZeroPad(utils.hexlify(Number(values.quorum)), 32);
      return [configKey, encodedValue];
    },
    preview: (values) => `Change blended voting quorum to ${values.quorum} voters`
  },
  {
    id: 'change-voting-split',
    category: 'voting',
    name: 'Change Voting Class Weights',
    autoTitle: 'Change how voting power is split',
    description: 'Adjust the voting power split between democracy and share-based classes',
    // LIVE on access v2. The `hatIds` inside each class are the ELECTORATE for that class, and on
    // a v2 org they are authority role ids resolved through `authority.isMember`.
    idsAreSubjects: true,
    contract: 'hybridVoting',
    functionName: 'setClasses',
    inputs: [
      {
        name: 'classWeights',
        label: 'Voting Class Weights',
        type: 'votingClassWeights',
        helpText: 'Adjust the percentage split between voting classes (must sum to 100%)',
        v2HelpText: 'Adjust the percentage split between voting classes (must sum to 100%). '
          + 'Each class counts the roles listed under Roles and permissions'
      }
    ],
    requiresContext: 'votingClasses',
    encode: (values) => {
      const classConfigs = (values.classWeights || []).map(cls => {
        const strategyNum = (cls.strategy === 'DIRECT' || cls.strategy === 0) ? 0 : 1;
        return {
          strategy: strategyNum,
          slicePct: Number(cls.slicePct),
          quadratic: Boolean(cls.quadratic),
          minBalance: cls.minBalance?.toString() || '0',
          asset: cls.asset || '0x0000000000000000000000000000000000000000',
          hatIds: (cls.hatIds || []).map(h => h.toString()),
        };
      });
      return [classConfigs];
    },
    preview: (values) => {
      const classes = values.classWeights || [];
      const parts = classes.map(cls => {
        const label = (cls.strategy === 'DIRECT' || cls.strategy === 0) ? 'Democracy' : 'Participation';
        return `${label}: ${cls.slicePct}%`;
      });
      return `Change voting split to ${parts.join(', ')}`;
    }
  },
  {
    id: 'change-class-voters',
    category: 'voting',
    name: 'Change Who Votes in Binding Votes',
    autoTitle: 'Change who votes in binding votes',
    description:
      'Add a role to — or take it out of — the people counted in one part of a binding vote',
    contract: 'hybridVoting',
    // LIVE on BOTH access systems. `addHatToClass` / `removeHatFromClass` write the class's own
    // electorate list, which HybridVoting reads on every vote — on a legacy org through Hats, on a
    // migrated one through `authority.isMember`. Nothing about that moved to the authority, which
    // is why this is neither `legacyOnly` nor `v2Only`. Only the MEANING of the id changes, and
    // `useRoleNames().allRoles` (lib/voting/roleOptions) already switches source for the picker.
    idsAreSubjects: true,
    v2Description:
      'Add a role to — or take it out of — the people counted in one part of a binding vote. '
      + 'Voting here is separate from what a role is allowed to do',
    // No `functionName`/`encode`: this template builds its own call, so the wizard takes the
    // buildBatch arm (which is also what lets it carry a written summary and a gas floor).
    inputs: [
      {
        name: 'classIdx',
        label: 'Which voters',
        type: 'votingClassSelect',
        // The one thing a member has to understand to answer this: a binding vote is counted in
        // parts, and each part has its own list of roles.
        helpText: 'A binding vote is counted in parts. Pick the part this change applies to',
      },
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Pick the role whose members should start — or stop — counting here',
        v2HelpText: 'Pick a role or a group — the same ones listed under Roles and permissions',
        // A group can be voted INTO a class (RoleForm's Voting step does it), so it must be
        // nameable here to be voted out again.
        includeGroups: true,
        // Record the name with the choice. The `roleNames` map every other template falls back to
        // is POContext's LEGACY list, frozen at the cutover — a role created since has no entry,
        // and the sentence members vote on would read "this role". See SetterParamInputs.
        nameField: 'roleName',
      },
      {
        name: 'action',
        label: 'Change',
        type: 'toggle',
        options: ['Add', 'Remove'],
        default: 'Add',
        helpText: 'Add lets this role vote in that part; Remove takes it away',
      },
      // The classes this form is deciding against, written by the class picker together with the
      // chosen index (and seeded when the action is picked). Hidden because nobody edits it, and
      // optional because it is derived — see classesFromValues for why it has to be in values.
      { name: 'votingClasses', type: 'hidden', optional: true, seedFrom: 'votingClasses' },
      // The chosen role's name, written by the picker. Derived, never typed.
      { name: 'roleName', type: 'hidden', optional: true },
    ],
    /**
     * One executor call: add (or remove) a role from a voting class's electorate.
     *
     * @param {object} values - setterValues (`classIdx`, `role`, `action`, `votingClasses`)
     * @param {object} ctx    - `{ contractAddresses, roleNames, … }`; only those two are read.
     *                          `contractAddresses.votingContractAddress` is the HybridVoting the
     *                          org actually votes on.
     * @returns {{batch: Array, summaries: string[], warnings: string[], gasLimit: number}}
     */
    buildBatch: (values, ctx = {}) => {
      const { contractAddresses = {}, roleNames = {} } = ctx;
      // Re-run the same guard the config screen ran. buildBatch is reachable from a restored draft
      // whose class list has since changed, and "add a role that is already there" is a proposal
      // that passes and does nothing.
      const problem = classVoterProblem(values);
      if (problem) throw new Error(problem);

      const classIdx = Number(values.classIdx);
      const subjectId = String(values.role);
      const add = values.action !== 'Remove';
      const votingClasses = classesFromValues(values);
      const roleName = values.roleName || roleNames?.[subjectId] || 'this role';

      const batch = [buildClassVoterCall({
        hybridVoting: contractAddresses?.votingContractAddress,
        classIdx,
        subjectId,
        add,
      })];
      return {
        batch,
        summaries: [classVoterSummary({ roleName, classIdx, votingClasses, add })],
        warnings: classVoterWarnings(values, roleName),
        gasLimit: estimateBatchGas(batch),
      };
    },
    validate: (values) => classVoterProblem(values),
    preview: (values, roleNames) => {
      const classes = classesFromValues(values);
      const raw = values?.classIdx;
      // `Number('')` is 0, not NaN — the unanswered field would silently BECOME the first class.
      const idx = (raw === '' || raw === null || raw === undefined) ? NaN : Number(raw);
      // SetterPreview renders this on every keystroke, BEFORE the params are answered — unlike
      // buildSetterCopy, it does not wait for templateParamsReady. Defaulting the index to 0 here
      // would put a class nobody picked into the one box that says what the vote does.
      if (!values?.role || !Number.isInteger(idx) || idx < 0 || !classByIndex(classes, idx)) {
        return 'Change which roles are counted in binding votes';
      }
      return classVoterSummary({
        roleName: values.roleName || roleNames?.[values.role] || 'this role',
        classIdx: idx,
        votingClasses: classes,
        add: values.action !== 'Remove',
      });
    }
  },
  {
    id: 'change-quorum-dd',
    category: 'voting',
    name: 'Change Direct Democracy Quorum',
    autoTitle: 'Change the minimum number of voters (Direct democracy)',
    description: 'Set the minimum number of voters required for direct democracy votes to be valid',
    contract: 'directDemocracyVoting',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'quorum',
        label: 'Minimum Voters',
        type: 'number',
        min: 0,
        max: 1000000,
        placeholder: 'e.g. 5',
        helpText: 'Minimum number of voters required (0 = no minimum)'
      }
    ],
    encode: (values) => {
      const configKey = 4; // ConfigKey.QUORUM
      const encodedValue = utils.hexZeroPad(utils.hexlify(Number(values.quorum)), 32);
      return [configKey, encodedValue];
    },
    preview: (values) => `Change direct democracy quorum to ${values.quorum} voters`
  },

  // ===== PERMISSIONS =====
  {
    id: 'allow-proposal-creator-hybrid',
    category: 'permissions',
    name: 'Allow Role to Create Blended Proposals',
    autoTitle: 'Change who can create Blended votes',
    description: 'Grant or revoke a role\'s permission to create new blended voting proposals',
    contract: 'hybridVoting',
    functionName: 'setCreatorHatAllowed',
    // Retired setter. HybridVoting.createProposal gates on authority HV_CREATE;
    // keep this descriptor only to recognize and reject historical saved drafts.
    legacyOnly: true,
    inputs: [
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Select which role to modify'
      },
      {
        name: 'allowed',
        label: 'Permission',
        type: 'toggle',
        options: ['Grant', 'Revoke'],
        default: 'Grant',
        helpText: 'Grant or revoke proposal creation permission'
      }
    ],
    encode: (values) => {
      return [values.role, values.allowed === 'Grant'];
    },
    preview: (values, roleNames) => {
      const roleName = roleNames?.[values.role] || `Role ${values.role}`;
      const action = values.allowed === 'Grant' ? 'Allow' : 'Revoke';
      return `${action} "${roleName}" to create blended voting proposals`;
    }
  },
  {
    id: 'allow-voter-dd',
    category: 'permissions',
    name: 'Allow Role to Vote (Direct Democracy)',
    autoTitle: 'Change who can take part in Direct democracy',
    description: 'Grant or revoke a role\'s permission to vote in direct democracy',
    contract: 'directDemocracyVoting',
    functionName: 'setConfig',
    // Retired key. Current DirectDemocracy grants live in authority DD_VOTE / DD_CREATE.
    // Keep this descriptor only to recognize and reject historical saved drafts.
    legacyOnly: true,
    inputs: [
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Select which role to modify'
      },
      {
        name: 'hatType',
        label: 'Hat Type',
        type: 'select',
        options: [
          { value: '0', label: 'Voting Hat (can vote)' },
          { value: '1', label: 'Creator Hat (can create proposals)' }
        ],
        helpText: 'Type of permission to grant'
      },
      {
        name: 'allowed',
        label: 'Permission',
        type: 'toggle',
        options: ['Grant', 'Revoke'],
        default: 'Grant'
      }
    ],
    encode: (values) => {
      const configKey = 3; // ConfigKey.HAT_ALLOWED
      // Encode as (HatType enum, hatId, allowed)
      const encodedValue = utils.defaultAbiCoder.encode(
        ['uint8', 'uint256', 'bool'],
        [Number(values.hatType), values.role, values.allowed === 'Grant']
      );
      return [configKey, encodedValue];
    },
    preview: (values, roleNames) => {
      const roleName = roleNames?.[values.role] || `Role ${values.role}`;
      const action = values.allowed === 'Grant' ? 'Allow' : 'Revoke';
      const hatType = values.hatType === '0' ? 'vote' : 'create proposals';
      return `${action} "${roleName}" to ${hatType} in direct democracy`;
    }
  },

  {
    id: 'edit-role-permissions',
    category: 'permissions',
    name: 'Change What a Role Can Do',
    autoTitle: 'Change what a role can do',
    description: 'Choose a role or group, then set what the people in it are allowed to do',
    contract: 'membershipAuthority',
    // The single replacement for the three templates that went dead at the access-v2 cutover
    // (allow-proposal-creator-hybrid, allow-voter-dd, and the global half of
    // set-project-permissions): all of those wrote a per-module table, and every module now asks
    // the authority instead. One vote, one place.
    v2Only: true,
    inputs: [
      {
        name: 'subjectId',
        label: 'Role or group',
        type: 'authoritySubjectSelect',
        helpText: 'Pick the role — or the group of roles — this vote should change',
        // Written together with the picker's choice so the ballot can name the role even after
        // the roles list has moved on. See SetterParamInputs.
        nameField: 'subjectName',
        permsField: 'perms',
        currentField: 'permsCurrent'
      },
      {
        name: 'perms',
        label: 'What they’re allowed to do',
        type: 'authorityPermissions',
        helpText: 'Ticked is allowed. Anything you untick is taken away when this vote passes. '
          + 'Settings that apply to one project only are left alone',
        currentField: 'permsCurrent'
      },
      // Both derived from the picker, never typed: the chosen role's name, and the snapshot of
      // what it can do today. The snapshot is what makes "nothing has changed yet" answerable on
      // the config screen, where there is no authority data to diff against.
      { name: 'subjectName', type: 'hidden', optional: true },
      { name: 'permsCurrent', type: 'hidden', optional: true }
    ],
    /**
     * Build the governance batch. Called by the wizard's setter arm INSTEAD of `encode` — this is
     * a multi-call diff against live authority state, not a single encoded setter.
     *
     * @param {object} values - setterValues
     * @param {object} ctx    - `{ authority, subjects, contractAddresses, roleNames, projectNames }`
     * @returns {{batch: Array, summaries: string[], warnings: string[], gasLimit: number}}
     */
    buildBatch: (values, ctx = {}) => {
      const { authority, subjects = [], roleNames = {} } = ctx;
      if (!authority) {
        throw new Error('This group’s roles and permissions aren’t loaded yet — try again in a moment.');
      }
      const subjectId = String(values?.subjectId ?? '').trim();
      if (!subjectId) throw new Error('Pick the role this vote should change.');

      const subject = (subjects || []).find((s) => String(s?.subjectId) === subjectId);
      // Never fall back to the form's own snapshot here. A diff against a stale picture would
      // rewrite rows somebody else already changed, or clear ones this vote never showed.
      if (!subject) {
        throw new Error('That role isn’t in this group’s list any more — choose it again.');
      }

      const subjectName = subject.name || values?.subjectName || roleNames?.[subjectId] || 'this role';
      const currentPerms = permsFromSubject(subject);
      const nextPerms = normalizePermSelection(values?.perms);

      const result = buildEditPermsBatch({
        authority,
        subjectId,
        subjectName,
        // Both sides go through buildPermRows so the diff compares like with like: a row whose
        // stored word differs only in bits the picker cannot express (a bool held as 5 rather
        // than 1) is not rewritten for nothing.
        currentRows: buildPermRows(currentPerms),
        nextRows: buildPermRows(nextPerms),
      });

      if (!result.batch.length) {
        throw new Error(`Nothing would change for “${subjectName}”. Adjust a permission first.`);
      }

      const changes = describePermChanges(currentPerms, nextPerms);
      const warnings = [...(result.warnings || [])];
      if (subject.isGroup) {
        warnings.push(`Every role inside “${subjectName}” gets these permissions.`);
      }
      // Keep the builder's batch and gas floor; replace its generic per-call summaries with ones
      // that name the role and the permission.
      return { ...result, summaries: permChangeSummaries(subjectName, changes), warnings };
    },
    validate: (values) => {
      if (!values?.subjectId) return 'Pick the role or group this vote should change.';
      if (!values.perms || typeof values.perms !== 'object') {
        return 'Choose what this role should be allowed to do.';
      }
      if (!describePermChanges(values.permsCurrent, values.perms).changed) {
        return 'Nothing has changed yet — tick or untick a permission to propose a change.';
      }
      return null;
    },
    preview: (values, roleNames) => {
      const name = values?.subjectName || roleNames?.[values?.subjectId] || 'this role';
      const changes = describePermChanges(values?.permsCurrent, values?.perms);
      const lines = permChangeSummaries(name, changes);
      if (lines.length === 0) return `Leave “${name}” with the permissions it already has`;
      // Sentence-case the run-on: "Let “X” … ; stop “X” being able to …".
      return lines
        .map((line, i) => (i === 0 ? line : line.charAt(0).toLowerCase() + line.slice(1)))
        .join('; ');
    }
  },

  // ===== EMERGENCY CONTROLS =====
  {
    id: 'pause-hybrid-voting',
    category: 'emergency',
    name: 'Pause Blended Voting',
    autoTitle: 'Pause Blended voting',
    description: 'Temporarily disable all blended voting activity (emergency use only)',
    contract: 'hybridVoting',
    functionName: 'pause',
    inputs: [],
    dangerLevel: 'critical',
    warning: 'This will prevent ALL blended voting proposals and votes until unpaused',
    encode: () => [],
    preview: () => 'Pause blended voting - no proposals or votes will be allowed'
  },
  {
    id: 'unpause-hybrid-voting',
    category: 'emergency',
    name: 'Resume Blended Voting',
    autoTitle: 'Resume Blended voting',
    description: 'Re-enable blended voting after an emergency pause',
    contract: 'hybridVoting',
    functionName: 'unpause',
    inputs: [],
    encode: () => [],
    preview: () => 'Resume blended voting - proposals and votes will be allowed again'
  },
  {
    id: 'pause-dd-voting',
    category: 'emergency',
    name: 'Pause Direct Democracy Voting',
    autoTitle: 'Pause Direct democracy voting',
    description: 'Temporarily disable all direct democracy voting activity',
    contract: 'directDemocracyVoting',
    functionName: 'pause',
    inputs: [],
    dangerLevel: 'critical',
    warning: 'This will prevent ALL direct democracy proposals and votes until unpaused',
    encode: () => [],
    preview: () => 'Pause direct democracy voting'
  },
  {
    id: 'unpause-dd-voting',
    category: 'emergency',
    name: 'Resume Direct Democracy Voting',
    autoTitle: 'Resume Direct democracy voting',
    description: 'Re-enable direct democracy voting after an emergency pause',
    contract: 'directDemocracyVoting',
    functionName: 'unpause',
    inputs: [],
    encode: () => [],
    preview: () => 'Resume direct democracy voting'
  },

  // ===== TASK MANAGEMENT =====
  {
    id: 'set-project-permissions',
    category: 'tasks',
    name: 'Set Project Role Permissions',
    autoTitle: 'Change what a role can do in a project',
    description: 'Configure what a role can do within a specific project',
    contract: 'taskManager',
    functionName: 'setProjectRolePerm',
    // Retired setter. TaskManager reads authority TM_PERMS at bytes32(pid + 1).
    // Keep this descriptor only to recognize and reject historical saved drafts.
    legacyOnly: true,
    inputs: [
      {
        name: 'project',
        label: 'Project',
        type: 'projectSelect',
        helpText: 'Select the project to modify'
      },
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Select which role to modify'
      },
      {
        name: 'permissions',
        label: 'Permissions',
        type: 'permissionMask',
        options: [
          { value: 1, label: 'CREATE - Create new tasks' },
          { value: 2, label: 'CLAIM - Claim tasks' },
          { value: 4, label: 'REVIEW - Review completed tasks' },
          { value: 8, label: 'ASSIGN - Assign tasks to others' },
          { value: 16, label: 'SELF_REVIEW - Allow claimer to complete their own task' },
          { value: 32, label: 'BUDGET - Edit project budgets (PT cap & bounty caps)' },
          { value: 64, label: 'EDIT_META - Edit task title / metadata' },
          { value: 128, label: 'EDIT_FULL - Edit task payout, bounty & metadata' }
        ],
        helpText: 'Select which permissions to grant'
      }
    ],
    encode: (values) => {
      // Calculate bitmask from selected permissions
      const mask = Array.isArray(values.permissions)
        ? values.permissions.reduce((acc, val) => acc | Number(val), 0)
        : Number(values.permissions) || 0;
      // The picker's value is the SUBGRAPH id — the composite `{taskManagerAddress}-{n}` — and
      // `pid` is a bytes32. Handing the composite straight to ethers threw INVALID_ARGUMENT at
      // submit, so this template could never be proposed at all. `parseProjectId` is the same
      // conversion every other project call in the app makes (TaskService, the folder tree).
      return [parseProjectId(values.project), values.role, mask];
    },
    preview: (values, roleNames, projectNames) => {
      const roleName = roleNames?.[values.role] || `Role ${values.role}`;
      const projectName = projectNames?.[values.project] || 'selected project';
      const permLabels = [];
      const has = (v) => values.permissions?.includes(v) || values.permissions?.includes(String(v));
      if (has(1)) permLabels.push('CREATE');
      if (has(2)) permLabels.push('CLAIM');
      if (has(4)) permLabels.push('REVIEW');
      if (has(8)) permLabels.push('ASSIGN');
      if (has(16)) permLabels.push('SELF_REVIEW');
      if (has(32)) permLabels.push('BUDGET');
      if (has(64)) permLabels.push('EDIT_META');
      if (has(128)) permLabels.push('EDIT_FULL');
      return `Set "${roleName}" permissions for ${projectName}: ${permLabels.join(', ') || 'none'}`;
    }
  },
  {
    id: 'allow-task-creator',
    category: 'tasks',
    name: 'Allow Role to Create Tasks',
    autoTitle: 'Change who can create tasks',
    description: 'Grant or revoke a role\'s permission to create tasks globally',
    // LIVE on access v2 — TaskManager still keeps its own creator list — but the ids in that list
    // are resolved through `authority.isMember`, so they are AUTHORITY ROLE ids, not Hats ids.
    // `useRoleNames().allRoles` already switches source (lib/voting/roleOptions), so only the
    // legend needs to say which list the member is choosing from.
    idsAreSubjects: true,
    v2Description: 'Let a role create tasks anywhere in this group, or take that away',
    contract: 'taskManager',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Select which role to modify',
        v2HelpText: 'Pick one of this group’s roles — the same roles listed under Roles and permissions'
      },
      {
        name: 'allowed',
        label: 'Permission',
        type: 'toggle',
        options: ['Grant', 'Revoke'],
        default: 'Grant'
      }
    ],
    encode: (values) => {
      const configKey = 1; // ConfigKey.CREATOR_HAT_ALLOWED
      const encodedValue = utils.defaultAbiCoder.encode(
        ['uint256', 'bool'],
        [values.role, values.allowed === 'Grant']
      );
      return [configKey, encodedValue];
    },
    preview: (values, roleNames) => {
      const roleName = roleNames?.[values.role] || `Role ${values.role}`;
      const action = values.allowed === 'Grant' ? 'Allow' : 'Revoke';
      return `${action} "${roleName}" to create tasks globally`;
    }
  },
  {
    id: 'allow-organizer-hat',
    category: 'tasks',
    name: 'Allow Role to Organize Folders',
    autoTitle: 'Change who can organize task folders',
    description: 'Grant or revoke a role\'s permission to publish folder-tree updates via setFolders',
    // Same as allow-task-creator: LIVE on v2, but the id it writes is an authority role id.
    idsAreSubjects: true,
    v2Description: 'Let a role rearrange the task folders, or take that away',
    contract: 'taskManager',
    functionName: 'setConfig',
    inputs: [
      {
        name: 'role',
        label: 'Role',
        type: 'roleSelect',
        helpText: 'Select which role to authorize as a folder organizer',
        v2HelpText: 'Pick one of this group’s roles — the same roles listed under Roles and permissions'
      },
      {
        name: 'allowed',
        label: 'Permission',
        type: 'toggle',
        options: ['Grant', 'Revoke'],
        default: 'Grant'
      }
    ],
    encode: (values) => {
      const configKey = 7; // ConfigKey.ORGANIZER_HAT_ALLOWED
      const encodedValue = utils.defaultAbiCoder.encode(
        ['uint256', 'bool'],
        [values.role, values.allowed === 'Grant']
      );
      return [configKey, encodedValue];
    },
    preview: (values, roleNames) => {
      const roleName = roleNames?.[values.role] || `Role ${values.role}`;
      const action = values.allowed === 'Grant' ? 'Allow' : 'Revoke';
      return `${action} "${roleName}" to reorganize the folder tree`;
    }
  },

  // ===== TOKEN SETTINGS =====
  {
    id: 'change-token-metadata',
    category: 'tokenSettings',
    name: 'Change Token Name & Symbol',
    autoTitle: 'Change the share name and symbol',
    description: 'Update the share name, symbol, or both via governance vote',
    contract: 'participationToken',
    inputs: [
      {
        name: 'tokenName',
        label: 'New Token Name',
        type: 'string',
        placeholder: 'e.g. Reputation Points',
        helpText: 'Leave empty to keep the current name',
        optional: true,
      },
      {
        name: 'tokenSymbol',
        label: 'New Token Symbol',
        type: 'string',
        placeholder: 'e.g. REP',
        helpText: 'Leave empty to keep the current symbol',
        optional: true,
      }
    ],
    buildCalls: (values, contractAddress) => {
      const calls = [];
      if (values.tokenName && values.tokenName.trim()) {
        const iface = new utils.Interface(['function setName(string newName)']);
        calls.push({
          target: contractAddress,
          value: '0',
          data: iface.encodeFunctionData('setName', [values.tokenName.trim()]),
        });
      }
      if (values.tokenSymbol && values.tokenSymbol.trim()) {
        const iface = new utils.Interface(['function setSymbol(string newSymbol)']);
        calls.push({
          target: contractAddress,
          value: '0',
          data: iface.encodeFunctionData('setSymbol', [values.tokenSymbol.trim()]),
        });
      }
      return calls;
    },
    preview: (values) => {
      const parts = [];
      if (values.tokenName && values.tokenName.trim()) parts.push(`name to "${values.tokenName.trim()}"`);
      if (values.tokenSymbol && values.tokenSymbol.trim()) parts.push(`symbol to "${values.tokenSymbol.trim()}"`);
      if (parts.length === 0) return 'No changes specified';
      return `Change share ${parts.join(' and ')}`;
    }
  }
];

// ============================================================================
// RAW FUNCTION DEFINITIONS (for Advanced Mode)
// ============================================================================

export const RAW_FUNCTIONS = {
  hybridVoting: [
    {
      name: 'setCreatorHatAllowed',
      // Same silent death as the template: on an access-v2 org this succeeds, emits, and changes
      // nothing HybridVoting reads. Hidden from Developer mode once the authority is live.
      legacyOnly: true,
      signature: 'function setCreatorHatAllowed(uint256 h, bool ok)',
      params: [
        { name: 'h', type: 'uint256', label: 'Hat ID' },
        { name: 'ok', type: 'bool', label: 'Allowed' }
      ],
      description: 'Allow/revoke a role from creating proposals'
    },
    {
      name: 'setConfig',
      signature: 'function setConfig(uint8 key, bytes calldata value)',
      params: [
        { name: 'key', type: 'uint8', label: 'Config Key (0=THRESHOLD, 1=TARGET_ALLOWED, 2=EXECUTOR, 3=QUORUM)' },
        { name: 'value', type: 'bytes', label: 'Encoded Value' }
      ],
      description: 'Set a configuration value'
    },
    {
      name: 'setClasses',
      // Use JSON ABI fragment for safe tuple[] encoding
      signature: {
        type: 'function',
        name: 'setClasses',
        inputs: [{
          name: 'newClasses',
          type: 'tuple[]',
          components: [
            { name: 'strategy', type: 'uint8' },
            { name: 'slicePct', type: 'uint8' },
            { name: 'quadratic', type: 'bool' },
            { name: 'minBalance', type: 'uint256' },
            { name: 'asset', type: 'address' },
            { name: 'hatIds', type: 'uint256[]' }
          ]
        }],
        outputs: [],
        stateMutability: 'nonpayable'
      },
      params: [
        { name: 'newClasses', type: 'tuple[]', label: 'Class Configuration Array' }
      ],
      description: 'Replace all voting class configurations (slices must sum to 100%)'
    },
    // The surgical alternative to setClasses: change ONE class's electorate without re-sending
    // every slice, strategy and asset. `classIdx` is POSITIONAL — the same order getClasses()
    // returns and the same order the "Change Who Votes in Binding Votes" picker lists, so a
    // proposal written against a stale list points at the wrong class.
    //
    // LEGEND — classIdx: 0 = first class (Members, one vote each on a stock org),
    //                    1 = second class (Contributors, weighted by shares), … ;
    //          hatId:    a Hats id on a legacy org, a MembershipAuthority SUBJECT id once the org
    //                    has migrated (HybridVoting resolves it through `authority.isMember`).
    {
      name: 'addHatToClass',
      signature: 'function addHatToClass(uint8 classIdx, uint256 hatId)',
      params: [
        { name: 'classIdx', type: 'uint8', label: 'Voting class index (0 = the first class getClasses() returns)' },
        { name: 'hatId', type: 'uint256', label: 'Role id (Hats id; authority subject id on a migrated org)' }
      ],
      description: 'Let a role vote in one voting class'
    },
    {
      name: 'removeHatFromClass',
      signature: 'function removeHatFromClass(uint8 classIdx, uint256 hatId)',
      params: [
        { name: 'classIdx', type: 'uint8', label: 'Voting class index (0 = the first class getClasses() returns)' },
        { name: 'hatId', type: 'uint256', label: 'Role id (Hats id; authority subject id on a migrated org)' }
      ],
      description: 'Stop a role voting in one voting class'
    },
    {
      name: 'pause',
      signature: 'function pause()',
      params: [],
      description: 'Pause the voting contract'
    },
    {
      name: 'unpause',
      signature: 'function unpause()',
      params: [],
      description: 'Unpause the voting contract'
    }
  ],
  directDemocracyVoting: [
    {
      name: 'setConfig',
      signature: 'function setConfig(uint8 key, bytes calldata value)',
      params: [
        { name: 'key', type: 'uint8', label: 'Config Key (0=THRESHOLD, 1=EXECUTOR, 2=TARGET_ALLOWED, 3=RETIRED, 4=QUORUM)' },
        { name: 'value', type: 'bytes', label: 'Encoded Value' }
      ],
      description: 'Set a configuration value',
      // Not legacyOnly — THRESHOLD and QUORUM are still read on v2. Only key 3 (HAT_ALLOWED) went
      // dead, and it is the one key someone reaching for Developer mode is most likely to want.
      v2Note: 'Key 3 (HAT_ALLOWED) is retired and rejected — voting rights now come '
        + 'from Roles and permissions'
    },
    {
      name: 'pause',
      signature: 'function pause()',
      params: [],
      description: 'Pause the voting contract'
    },
    {
      name: 'unpause',
      signature: 'function unpause()',
      params: [],
      description: 'Unpause the voting contract'
    }
  ],
  taskManager: [
    {
      name: 'setConfig',
      signature: 'function setConfig(uint8 key, bytes calldata value)',
      params: [
        { name: 'key', type: 'uint8', label: 'Config Key' },
        { name: 'value', type: 'bytes', label: 'Encoded Value' }
      ],
      description: 'Set a configuration value',
      // CREATOR_HAT_ALLOWED (1) and ORGANIZER_HAT_ALLOWED (7) are still read on v2; ROLE_PERM (2)
      // is not — the task permission mask lives in the authority now.
      v2Note: 'Key 2 (ROLE_PERM) is retired and rejected — task permissions now come '
        + 'from Roles and permissions'
    },
    {
      name: 'setProjectRolePerm',
      // Dead on v2: TaskManager reads the authority's per-project rows instead.
      legacyOnly: true,
      signature: 'function setProjectRolePerm(bytes32 pid, uint256 hatId, uint8 mask)',
      params: [
        { name: 'pid', type: 'bytes32', label: 'Project ID' },
        { name: 'hatId', type: 'uint256', label: 'Hat ID' },
        { name: 'mask', type: 'uint8', label: 'Permission Mask (1=CREATE, 2=CLAIM, 4=REVIEW, 8=ASSIGN)' }
      ],
      description: 'Set role permissions for a project'
    }
  ],
  participationToken: [
    {
      name: 'setName',
      signature: 'function setName(string newName)',
      params: [
        { name: 'newName', type: 'string', label: 'New Token Name' }
      ],
      description: 'Change the share name'
    },
    {
      name: 'setSymbol',
      signature: 'function setSymbol(string newSymbol)',
      params: [
        { name: 'newSymbol', type: 'string', label: 'New Token Symbol' }
      ],
      description: 'Change the share symbol'
    }
  ],
  zkEmailInvites: [
    {
      name: 'setActiveAllowlist',
      // TEMPLATE-ONLY. The signature lives here because buildProposalData encodes
      // from RAW_FUNCTIONS, but this must never be offered as a raw call: the
      // Developer-mode path takes free-text root/cid, skips the invite-list field
      // and template.validate entirely, and shows voters nothing but a generic raw
      // call — the exact "approve a hash you can't read" hole this feature closes.
      templateOnly: true,
      signature: 'function setActiveAllowlist(bytes32 root, bytes32 cid)',
      params: [
        { name: 'root', type: 'bytes32', label: 'Allowlist Merkle Root' },
        { name: 'cid', type: 'bytes32', label: 'Allowlist CID (bytes32)' }
      ],
      description: 'Make a staged email allowlist live'
    }
  ]
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a template by ID.
 *
 * Pure id lookup — it answers "does this id exist", NOT "may this org propose it". A template can
 * exist and still be unreachable here (a dead legacy action on an access-v2 org, a v2 action on a
 * legacy org, a module the org never deployed). Anything that acts on the answer — the picker, a
 * `?propose=<id>` deep link, the /rules "Propose a change" rows — must go through
 * `@/lib/voting/setterAvailability` (`getAvailableTemplateById` / `resolveSetterTemplate`), which
 * returns a null/unavailable result WITH the reason to show.
 */
export function getTemplateById(id) {
  return SETTER_TEMPLATES.find(t => t.id === id);
}

/**
 * Proposal title for a setter template.
 *
 * Prefers the curated member-facing `autoTitle`; falls back to the picker
 * `name` so a template added later without one still gets a readable title.
 * Never derive the title from `preview({})` — it renders empty or wrong
 * (e.g. "Change blended voting threshold to %") before params are filled.
 */
export const SETTER_TITLE_FALLBACK = (template) => template.autoTitle || template.name;

/** A param counts as answered when it has content. `0` and `false` are answers. */
function hasParamValue(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

/**
 * Are a template's parameters answered well enough to describe or submit it?
 *
 * `preview()` is not defensive about partial values — it throws on some
 * templates and renders half-finished copy ("Change blended voting threshold
 * to %") on others — so every non-optional input must have a value. Templates
 * whose inputs are ALL optional still need one answer, or they preview as
 * "No changes specified".
 */
export function templateParamsReady(template, values) {
  if (!template) return false;
  const filled = values || {};
  const inputs = template.inputs || [];
  if (inputs.length === 0) return true;
  const requiredFilled = inputs.every(i => i.optional || hasParamValue(filled[i.name]));
  const anyFilled = inputs.some(i => hasParamValue(filled[i.name]));
  return requiredFilled && anyFilled;
}

/**
 * The member-facing title + description for a setter template.
 *
 * Single source of truth so every entry point agrees: the picker writes this
 * as you choose an action, and the `?propose=<template>` deep links write the
 * same strings into their restored payload. When those two disagree, the
 * ballot a member reviews is not the proposal that gets created.
 *
 * `description` is null until the params are ready; `title` never is.
 */
export function buildSetterCopy(template, values, roleNames, projectNames) {
  if (!template) return { title: null, description: null };
  let title = SETTER_TITLE_FALLBACK(template);
  if (!templateParamsReady(template, values)) return { title, description: null };
  // Most titles are curated and static — but a template whose params carry the
  // actual decision can say it. "Email invites: 2 added, 1 removed" is a better
  // thing to meet on the board than "Change who can join by email". Falls back to
  // the curated autoTitle when there is nothing specific yet, or it would not fit.
  if (typeof template.retitle === 'function') {
    try {
      const sharper = template.retitle(values || {}, roleNames, projectNames);
      if (typeof sharper === 'string' && sharper.trim()
          && sharper.trim().length <= SETTER_TITLE_MAX) {
        title = sharper.trim();
      }
    } catch { /* keep the curated autoTitle */ }
  }
  // A template can write its own prose when it has more to say than one line —
  // the invite list names who is joining and who is losing their invite. It
  // returns null until it has something real, so the preview still covers the
  // common case.
  if (typeof template.describe === 'function') {
    try {
      const prose = template.describe(values || {}, roleNames, projectNames);
      if (typeof prose === 'string' && prose.trim()) return { title, description: prose };
    } catch { /* fall through to the preview line */ }
  }
  if (typeof template.preview !== 'function') return { title, description: null };
  let line;
  try {
    line = template.preview(values || {}, roleNames, projectNames);
  } catch {
    return { title, description: null };
  }
  if (typeof line !== 'string' || line.trim() === '') return { title, description: null };
  return { title, description: `If this vote passes: ${line}` };
}

/**
 * Get raw functions for a contract
 */
export function getRawFunctions(contractKey) {
  return RAW_FUNCTIONS[contractKey] || [];
}

/**
 * Check if a contract is available (has an address in POContext)
 *
 * `membershipAuthority` needs no special case: its address is only supplied under
 * `membershipAuthorityAddress` when `useOrgAuthority().enabled` is true, so on a legacy org this
 * returns false and every access-v2 template disappears — exactly like an undeployed module.
 */
export function isContractAvailable(contractKey, contractAddresses) {
  const contextKey = CONTRACT_MAP[contractKey]?.contextKey;
  if (!contextKey) return false;
  const address = contractAddresses?.[contextKey];
  // The zero address means "module not deployed" — POContext derives
  // zkEmailInvitesEnabled the same way. Treating it as available would send a
  // governance proposal's call to address(0), which is the silent no-op again.
  return Boolean(address) && !/^0x0{40}$/i.test(address);
}
