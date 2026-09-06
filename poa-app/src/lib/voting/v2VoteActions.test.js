/**
 * Every emitted call is decoded back through the REAL MembershipAuthority ABI (via
 * `authorityInterface`), never against a hand-written fragment — a signature drift has to fail
 * here rather than produce a well-formed transaction that reverts inside announceWinner's
 * try/catch, where nobody would ever see it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildV2ElectionBatches,
  acceptedHoldersOf,
  toAddressSet,
  ELECTED_SEAT_STICKY,
} from './v2VoteActions';
import { authorityInterface } from '@/lib/accessV2/txBuilders';
import { estimateBatchGas } from '@/lib/accessV2/proposalBuilders';
import {
  AUTHORITY_ADDRESS as A,
  ALICE,
  BOB,
  CAROL,
  MEMBERS_ID,
  EXECS_ID,
} from '@/lib/accessV2/fixtures';

const DAVE = '0xdddddddddddddddddddddddddddddddddddddddd';

/** Decode a batch of authority calls into `[{ name, args }]`. */
const decode = (batch) =>
  batch.map((c) => {
    const parsed = authorityInterface.parseTransaction({ data: c.data });
    return { name: parsed.name, args: parsed.args, target: c.target };
  });

const names = (batch) => decode(batch).map((c) => c.name);

describe('toAddressSet / acceptedHoldersOf', () => {
  it('accepts the Set the fold mirror actually hands over, lowercasing it', () => {
    const set = toAddressSet(new Set([ALICE.toUpperCase()]));
    expect(set.has(ALICE)).toBe(true);
  });

  it('accepts an array of addresses or of rows', () => {
    expect(toAddressSet([ALICE]).has(ALICE)).toBe(true);
    expect(toAddressSet([{ address: ALICE }]).has(ALICE)).toBe(true);
    expect(toAddressSet([{ user: ALICE }]).has(ALICE)).toBe(true);
  });

  it('is empty — never throws — for a hook that has not resolved', () => {
    expect(toAddressSet(null).size).toBe(0);
    expect(toAddressSet(undefined).size).toBe(0);
  });

  it('counts ACCEPTED rows, not just active ones: remove() only needs acceptance', () => {
    const rows = [
      { subjectId: EXECS_ID, user: ALICE, accepted: true, isMember: true },
      // accepted but lapsed — still removable on chain, and still `AlreadyMember` for grant
      { subjectId: EXECS_ID, user: BOB, accepted: true, isMember: false },
      { subjectId: EXECS_ID, user: CAROL, accepted: false, isMember: false },
      { subjectId: MEMBERS_ID, user: DAVE, accepted: true, isMember: true },
    ];
    const holders = acceptedHoldersOf(rows, EXECS_ID);
    expect([...holders].sort()).toEqual([ALICE, BOB].sort());
  });
});

describe('buildV2ElectionBatches', () => {
  const base = {
    authority: A,
    subjectId: EXECS_ID,
    subjectName: 'Executives',
    candidates: [
      { name: 'Alice', address: ALICE },
      { name: 'Bob', address: BOB },
    ],
    selectedIncumbents: [{ name: 'Carol', address: CAROL }],
    acceptedHolders: [CAROL],
    inOrgUsers: new Set([ALICE, CAROL]),
  };

  it('emits one batch per candidate, in candidate order', () => {
    const { batches, optionNames } = buildV2ElectionBatches(base);
    expect(optionNames).toEqual(['Alice', 'Bob']);
    expect(batches).toHaveLength(2);
  });

  it('removes the incumbent then adds the winner — every call on the authority', () => {
    const { batches } = buildV2ElectionBatches(base);
    const decoded = decode(batches[0]);
    expect(decoded.map((c) => c.name)).toEqual(['remove', 'grant']);
    expect(decoded.every((c) => c.target === A)).toBe(true);

    // remove(subject, user, ban) — ban=true, because a soft remove reverts RemovalIneffective for
    // anyone with a surviving eligibility source and announceWinner would swallow it.
    expect(decoded[0].args[0].toString()).toBe(EXECS_ID);
    expect(decoded[0].args[1].toLowerCase()).toBe(CAROL);
    expect(decoded[0].args[2]).toBe(true);

    // grant(subject, user, delegable) — delegable=false: the elected seat belongs to the group.
    expect(decoded[1].args[0].toString()).toBe(EXECS_ID);
    expect(decoded[1].args[1].toLowerCase()).toBe(ALICE);
    expect(decoded[1].args[2]).toBe(false);
    expect(ELECTED_SEAT_STICKY).toBe(true);
  });

  it('INVITES a candidate who is not in the org yet (the consent model), rather than adding them', () => {
    const { batches } = buildV2ElectionBatches(base);
    const bobBatch = decode(batches[1]);
    expect(bobBatch.map((c) => c.name)).toEqual(['remove', 'offer']);
    expect(bobBatch[1].args[1].toLowerCase()).toBe(BOB);
    expect(bobBatch[1].args[2]).toBe(false);
  });

  it('emits NO grant for a candidate who already holds the role (grant reverts AlreadyMember)', () => {
    const { batches } = buildV2ElectionBatches({
      ...base,
      candidates: [{ name: 'Carol', address: CAROL }, { name: 'Alice', address: ALICE }],
    });
    // Carol IS the incumbent and already holds it: nothing to remove (self), nothing to grant.
    expect(batches[0]).toEqual([]);
    expect(names(batches[1])).toEqual(['remove', 'grant']);
  });

  it('never removes an incumbent who no longer holds the role (remove reverts NotMember)', () => {
    const { batches, warnings } = buildV2ElectionBatches({
      ...base,
      selectedIncumbents: [{ name: 'Carol', address: CAROL }, { name: 'Dave', address: DAVE }],
      acceptedHolders: [CAROL],
    });
    expect(names(batches[0])).toEqual(['remove', 'grant']);
    expect(decode(batches[0])[0].args[1].toLowerCase()).toBe(CAROL);
    expect(warnings.join(' ')).toMatch(/Dave no longer holds Executives/);
  });

  it('appends "No One" LAST as an empty batch, so the option indices never shift', () => {
    const { batches, optionNames, summaries } = buildV2ElectionBatches({
      ...base,
      includeNoOneOption: true,
    });
    expect(optionNames).toEqual(['Alice', 'Bob', 'No One']);
    expect(batches[2]).toEqual([]);
    expect(summaries.join(' ')).toMatch(/No One/);
  });

  it('keeps the fallback role — as an ordinary add on that subject, delegable', () => {
    const { batches, summaries } = buildV2ElectionBatches({
      ...base,
      fallbackSubjectId: MEMBERS_ID,
      fallbackSubjectName: 'Members',
    });
    const decoded = decode(batches[0]);
    expect(decoded.map((c) => c.name)).toEqual(['remove', 'grant', 'grant']);
    // fallback grant lands on the FALLBACK subject and stays delegable (theirs to drop)
    expect(decoded[1].args[0].toString()).toBe(MEMBERS_ID);
    expect(decoded[1].args[1].toLowerCase()).toBe(CAROL);
    expect(decoded[1].args[2]).toBe(true);
    // the elected seat is still the sticky one
    expect(decoded[2].args[0].toString()).toBe(EXECS_ID);
    expect(decoded[2].args[2]).toBe(false);
    expect(summaries.join(' ')).toMatch(/added to Members instead/);
  });

  it('skips the fallback grant for a loser who already holds it', () => {
    const { batches } = buildV2ElectionBatches({
      ...base,
      fallbackSubjectId: MEMBERS_ID,
      fallbackSubjectName: 'Members',
      fallbackAcceptedHolders: [CAROL],
    });
    expect(names(batches[0])).toEqual(['remove', 'grant']);
    expect(decode(batches[0])[1].args[0].toString()).toBe(EXECS_ID);
  });

  it('refuses a fallback role that IS the elected role, loudly', () => {
    const { batches, warnings } = buildV2ElectionBatches({
      ...base,
      fallbackSubjectId: EXECS_ID,
      fallbackSubjectName: 'Executives',
    });
    expect(names(batches[0])).toEqual(['remove', 'grant']);
    expect(warnings.join(' ')).toMatch(/same as the role being elected/);
  });

  it('summarises the ballot in the member-facing voice, with no "hat" anywhere', () => {
    const { summaries } = buildV2ElectionBatches({
      ...base,
      fallbackSubjectId: MEMBERS_ID,
      fallbackSubjectName: 'Members',
      includeNoOneOption: true,
    });
    expect(summaries[0]).toBe(
      'Elect Alice or Bob as Executives. The winner is added to the role automatically.'
    );
    expect(summaries.join(' ')).toMatch(/Bob isn’t in this group yet/);
    expect(summaries.join(' ')).toMatch(/If Carol doesn’t win, they lose Executives/);
    expect(summaries.join(' ').toLowerCase()).not.toMatch(/\bhat\b/);
  });

  it('never opens with a summary the id-race detector reads as a role creation', () => {
    // lib/accessV2/proposalRace matches /^create the role\b/ on OTHER proposals' summaries.
    const { summaries } = buildV2ElectionBatches(base);
    expect(summaries[0]).not.toMatch(/^create the (role|group)\b/i);
  });

  it('prices the announceWinner floor off the BIGGEST option, not the first', () => {
    const { batches, gasLimit } = buildV2ElectionBatches({
      ...base,
      candidates: [{ name: 'Carol', address: CAROL }, { name: 'Alice', address: ALICE }],
    });
    expect(batches[0]).toEqual([]);
    expect(gasLimit).toBe(estimateBatchGas(batches[1]));
    expect(gasLimit).toBeGreaterThan(estimateBatchGas([]));
  });

  it('refuses to build without the authority or the role, instead of encoding a dud', () => {
    expect(() => buildV2ElectionBatches({ ...base, authority: '' })).toThrow(/roles contract/);
    expect(() => buildV2ElectionBatches({ ...base, subjectId: '' })).toThrow(/which role/);
    expect(() => buildV2ElectionBatches({ ...base, candidates: [] })).toThrow(/at least one candidate/);
  });
});

/**
 * THE LEGACY ORG MUST BE UNTOUCHED. There is no React harness in this repo, so the guard is over
 * the source of the one file that chooses between the two encoders — the same technique
 * `hooks/accessV2/gating.test.js` uses, and for the same reason: a legacy org silently losing its
 * election encoder is invisible in every other test.
 */
describe('retired encoders are removed and authority encoders require readiness', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(HERE, '..', '..', 'hooks', 'useProposalForm.js'), 'utf8');

  it('never encodes legacy Hats mutation calls', () => {
    for (const fn of ['setWearerEligibility', 'mintHatToAddress', 'transferHat', 'createHatWithEligibility', 'configureVouching', 'setCreatorHatAllowed', 'setProjectRolePerm']) {
      expect(src).not.toMatch(new RegExp(`encodeFunctionData\\(['"]${fn}['"]`));
    }
    expect(src).not.toContain('createHatsService(');
    expect(src).toContain('Authority permissions are required to create a proposal.');
  });

  it('reaches the v2 adapters only through an accessV2 gate', () => {
    // `buildRoleFormBatch` is the create-role half — ONE encoder shared with /team's modal
    // (lib/accessV2/roleFormBatch). A second create-role encoder appearing here is the bug this
    // whole file exists to catch.
    for (const adapter of ['buildV2ElectionBatches', 'buildRoleFormBatch']) {
      // import + at least one call site
      expect(src).toContain(adapter);
      const callSites = src.split(`${adapter}(`).length - 1;
      expect(callSites, `${adapter} is imported but never called`).toBeGreaterThan(0);
    }
    // Every v2 branch is chosen by the same predicate, and it reads the flag VotingPage sets.
    expect(src).toMatch(/accessV2\?\.enabled/);
  });
});
