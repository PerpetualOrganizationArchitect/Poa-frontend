/**
 * votingClasses — who counts in a HybridVoting (Blended) class, as pure helpers.
 *
 * A Blended vote tallies per CLASS: each class has a strategy (DIRECT = one member, one vote;
 * PARTICIPATION = weighted by shares), a slice of the total, and `hatIds` — the ROLES whose
 * members count in it. On a legacy org those are Hats ids; on an Access-v2 org they are
 * authority subject ids (HybridVoting resolves them through `authority.isMember`). Either way,
 * a role that is not in a class's `hatIds` has NO voting power in binding votes, however many
 * permissions it holds — which is why creating a role has to be able to add it to a class, and
 * why there is a governance action to change a class's voters.
 *
 * `addHatToClass(classIdx, hatId)` / `removeHatFromClass(classIdx, hatId)` are executor-gated
 * setters on HybridVoting (live on Test6, simulated from the Executor on 2026-09-03).
 */

import { utils } from 'ethers';

export const CLASS_STRATEGY = Object.freeze({ DIRECT: 'DIRECT', PARTICIPATION: 'PARTICIPATION' });

export const hybridVotingClassInterface = new utils.Interface([
  'function addHatToClass(uint8 classIdx, uint256 hatId)',
  'function removeHatFromClass(uint8 classIdx, uint256 hatId)',
]);

/** The subgraph spells strategy as a string; the contract as an enum (0 = DIRECT). */
export function isDirectClass(cls) {
  if (!cls) return false;
  const s = cls.strategy;
  return s === CLASS_STRATEGY.DIRECT || Number(s) === 0;
}

/** Index of the first DIRECT (one-member-one-vote) class, or -1 when the org has none. */
export function directClassIndex(votingClasses = []) {
  return (votingClasses || []).findIndex(isDirectClass);
}

/** The member-facing name of a class — the same words SetterActionSelector's rule diff uses. */
export function classLabel(cls, idx = 0, { withShare = true } = {}) {
  if (!cls) return `Class ${idx + 1}`;
  const base = isDirectClass(cls) ? 'Members' : 'Contributors';
  const how = isDirectClass(cls) ? 'one vote each' : 'weighted by shares';
  const pct = withShare && cls.slicePct !== undefined && cls.slicePct !== null ? ` · ${Number(cls.slicePct)}%` : '';
  return `${base} (${how})${pct}`;
}

/**
 * The class at a CONTRACT index. `addHatToClass` takes the positional uint8 the contract stores,
 * and the subgraph rows carry it as `classIndex` — which is not always the array position (an
 * older class version, or a filtered list, shifts it). Falls back to the array position for a
 * caller whose rows have no `classIndex`. Every encoder and every sentence about a class resolves
 * through here, so the two can never disagree about which class an index names.
 */
export function classByIndex(votingClasses = [], classIdx) {
  const idx = Number(classIdx);
  const list = votingClasses || [];
  const hit = list.find((c, i) => Number(c?.classIndex ?? i) === idx);
  return hit || null;
}

/** The contract index of a class at an array position. */
export function contractClassIndex(votingClasses = [], arrayIndex) {
  const cls = (votingClasses || [])[arrayIndex];
  return Number(cls?.classIndex ?? arrayIndex);
}

/** Does this class already count `id` (a hat id or subject id)? */
export function classHolds(cls, id) {
  const want = String(id ?? '');
  if (!want) return false;
  return (cls?.hatIds || []).some((h) => String(h) === want);
}

/** The classes (by index) that currently count `id`. */
export function classesHolding(votingClasses = [], id) {
  return (votingClasses || [])
    .map((c, idx) => (classHolds(c, id) ? idx : -1))
    .filter((idx) => idx >= 0);
}

/**
 * One Executor call that adds (or removes) a role to a class's voters.
 *
 * @param {object} opts
 * @param {string} opts.hybridVoting - the org's HybridVoting address
 * @param {number} opts.classIdx - positional class index (uint8)
 * @param {string|bigint} opts.subjectId - role id (a Hats id on legacy, a subject id on v2)
 * @param {boolean} [opts.add=true]
 * @returns {{ target: string, value: string, data: string }}
 */
export function buildClassVoterCall({ hybridVoting, classIdx, subjectId, add = true }) {
  if (!hybridVoting || !utils.isAddress(String(hybridVoting).toLowerCase())) {
    throw new Error("This group's Blended voting contract isn't set up.");
  }
  const idx = Number(classIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx > 255) throw new Error('Pick which voting class to change.');
  const id = BigInt(String(subjectId ?? '0'));
  if (id <= 0n) throw new Error('Pick the role whose voters should change.');
  return {
    target: utils.getAddress(String(hybridVoting).toLowerCase()),
    value: '0',
    data: hybridVotingClassInterface.encodeFunctionData(add ? 'addHatToClass' : 'removeHatFromClass', [idx, id.toString()]),
  };
}

/** The sentence voters read for a class-voter change. */
export function classVoterSummary({ roleName = 'this role', classIdx = 0, votingClasses = [], add = true }) {
  // A ballot sentence names the class, not its share of the vote: “· 80%” next to a role name
  // reads as if the role were being handed 80% of the vote.
  const label = classLabel(classByIndex(votingClasses, classIdx), classIdx, { withShare: false });
  return add
    ? `Let members of “${roleName}” vote in binding votes as ${label}.`
    : `Stop members of “${roleName}” voting in binding votes as ${label}.`;
}
