/**
 * ABI superset guard.
 *
 * `abi/*.json` are copied out of the contracts repo (`out/<Contract>.sol/<Contract>.abi.json`).
 * Re-copying is how the frontend learns about new functions — but a copy is also the easiest way
 * to silently DELETE one, and a dropped fragment does not fail a build: `iface.encodeFunctionData`
 * throws at submit time, and a dropped event just makes a log stop decoding. Both look like
 * runtime bugs miles from the sync that caused them.
 *
 * `legacySighashes.json` freezes every function selector, event topic0 and error selector these
 * four ABIs carried BEFORE the 2026-09-04 sync. This test asserts the files on disk are still a
 * SUPERSET of it. A sync may only ever add.
 *
 * Two fragments in the current files are not in the contract's own kyoto ABI, because Solidity
 * puts a library-declared event/error in the LIBRARY's ABI even though it is emitted (and
 * reverted) at the contract's address. They were re-merged, byte-identical, from the library
 * ABIs — see the "library-declared" test below:
 *   HybridVoting  — NewProposal / NewHatProposal (HybridVotingProposals), VoteCast / Winner /
 *                   ProposalExecuted (HybridVotingCore), ClassesReplaced (HybridVotingConfig)
 *   DirectDemocracyVoting — TargetSelf() (VotingMath)
 *
 * If a contract genuinely removes something, regenerate `legacySighashes.json` in the SAME PR and
 * say so — don't loosen this test.
 */

import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import legacy from './legacySighashes.json';
import hybridVotingAbi from '../../../abi/HybridVotingNew.json';
import directDemocracyVotingAbi from '../../../abi/DirectDemocracyVotingNew.json';
import executorAbi from '../../../abi/Executor.json';
import taskManagerAbi from '../../../abi/TaskManagerNew.json';

const ABIS = {
  HybridVotingNew: hybridVotingAbi,
  DirectDemocracyVotingNew: directDemocracyVotingAbi,
  Executor: executorAbi,
  TaskManagerNew: taskManagerAbi,
};

/** Canonical solidity type, tuples expanded — exactly what keccak is taken over. */
const canonicalType = (t) => (
  t.type.startsWith('tuple')
    ? `(${t.components.map(canonicalType).join(',')})${t.type.slice('tuple'.length)}`
    : t.type
);

const canonicalSig = (frag) => `${frag.name}(${(frag.inputs || []).map(canonicalType).join(',')})`;

const selectorsOf = (abi, type, full = false) => new Set(
  abi
    .filter((f) => f.type === type)
    .map((f) => (full ? utils.id(canonicalSig(f)) : utils.id(canonicalSig(f)).slice(0, 10))),
);

describe.each(Object.keys(ABIS))('%s is a superset of its pre-sync ABI', (name) => {
  const abi = ABIS[name];
  const frozen = legacy[name];

  it('has an entry in the frozen snapshot', () => {
    expect(frozen, `legacySighashes.json has no entry for ${name}`).toBeTruthy();
  });

  it('keeps every function selector', () => {
    const have = selectorsOf(abi, 'function');
    const missing = Object.entries(frozen.functions)
      .filter(([, sighash]) => !have.has(sighash))
      .map(([signature]) => signature);
    expect(missing).toEqual([]);
  });

  it('keeps every event topic', () => {
    const have = selectorsOf(abi, 'event', true);
    const missing = Object.entries(frozen.events)
      .filter(([, topic]) => !have.has(topic))
      .map(([signature]) => signature);
    expect(missing).toEqual([]);
  });

  it('keeps every custom-error selector', () => {
    const have = selectorsOf(abi, 'error');
    const missing = Object.entries(frozen.errors)
      .filter(([, sighash]) => !have.has(sighash))
      .map(([signature]) => signature);
    expect(missing).toEqual([]);
  });

  // ethers logs "duplicate definition" and drops one of the pair when an ABI carries the same
  // fragment twice (the kyoto HybridVoting build does, for LengthMismatch()). Harmless until the
  // dropped one is the one being decoded.
  it('carries no duplicate fragment', () => {
    const seen = new Map();
    abi.filter((f) => f.name).forEach((f) => {
      const key = `${f.type}:${canonicalSig(f)}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    });
    expect([...seen.entries()].filter(([, count]) => count > 1)).toEqual([]);
  });

  it('loads as an ethers Interface', () => {
    expect(() => new utils.Interface(abi)).not.toThrow();
  });
});

describe('the access-v2 functions this app now calls', () => {
  const names = hybridVotingAbi.filter((f) => f.type === 'function').map((f) => f.name);

  // `addHatToClass` / `removeHatFromClass` are what the "Change Who Votes in Binding Votes"
  // governance action encodes; the other two are what the v2 code paths read. All four were
  // absent from the pre-sync file, which is why the sync happened.
  it.each(['addHatToClass', 'removeHatFromClass', 'membershipAuthority', 'createProposalV2'])(
    'HybridVoting exposes %s',
    (fn) => {
      expect(names).toContain(fn);
    },
  );

  it('encodes addHatToClass / removeHatFromClass through the shipped ABI', () => {
    const iface = new utils.Interface(hybridVotingAbi);
    expect(iface.getSighash('addHatToClass')).toBe(
      utils.id('addHatToClass(uint8,uint256)').slice(0, 10),
    );
    expect(iface.getSighash('removeHatFromClass')).toBe(
      utils.id('removeHatFromClass(uint8,uint256)').slice(0, 10),
    );
  });
});

describe('library-declared fragments survived the sync', () => {
  // Emitted at the HybridVoting address by inlined library code, so they are NOT in the contract's
  // own compiler ABI. Losing them stops the app decoding a vote's own logs.
  it.each(['NewProposal', 'NewHatProposal', 'VoteCast', 'Winner', 'ProposalExecuted', 'ClassesReplaced'])(
    'HybridVoting can still decode %s',
    (event) => {
      const iface = new utils.Interface(hybridVotingAbi);
      expect(() => iface.getEvent(event)).not.toThrow();
    },
  );

  it('DirectDemocracyVoting still carries TargetSelf()', () => {
    const iface = new utils.Interface(directDemocracyVotingAbi);
    expect(iface.getSighash('TargetSelf')).toBe(utils.id('TargetSelf()').slice(0, 10));
  });
});
