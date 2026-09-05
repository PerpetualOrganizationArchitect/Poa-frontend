/**
 * The two Wave-E surfaces, enforced over their SOURCE.
 *
 * Both pieces they render are pure and fully unit-tested elsewhere
 * (`lib/accessV2/ballotGate.test.js`, `lib/errors/executorCallFailed.test.js`,
 * `lib/voting/proposalReceipt.test.js`). What those tests cannot prove is that anything CALLS
 * them — and "built, tested, never rendered" is exactly the state this branch is closing out.
 *
 * There is no React harness in this repo (vitest runs in `node`, no jsdom, no testing-library), so
 * the wiring is checked the only way it can be: against the files. Crude, but it fails when
 * someone deletes the call site, which is precisely when it matters — an unrendered gate is
 * invisible in every other test.
 *
 * Precedent: `hooks/accessV2/gating.test.js`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const pollDetail = read('components', 'voting', 'PollDetail.jsx');
const voteActions = read('hooks', 'useVoteActions.js');
const vocabulary = read('config', 'votingVocabulary.js');

describe('PollDetail renders the activation gate', () => {
  it('reads the file at all (guards against a silently empty scan)', () => {
    expect(pollDetail).toContain('export function PollDetail');
  });

  it('mounts useActivationGate', () => {
    expect(pollDetail).toMatch(/import \{ useActivationGate \} from '@\/hooks\/accessV2\/useActivationGate'/);
    expect(pollDetail).toMatch(/const activation = useActivationGate\(poll\)/);
  });

  it('the gate actually withholds the ballot', () => {
    const canVote = pollDetail.match(/const canVote = [^\n]+/)?.[0];
    expect(canVote, 'canVote assignment not found').toBeTruthy();
    expect(canVote).toContain('!activation.blocked');
  });

  it('and the withheld ballot says WHY — the copy is rendered, not just computed', () => {
    expect(pollDetail).toMatch(/\?\s*activation\.message/);
    // The copy must outrank "You're eligible ✓", which is the sentence it contradicts.
    const blockedAt = pollDetail.search(/activation\.blocked\s*\n\s*\?\s*activation\.message/);
    // lastIndexOf: the phrase also appears in a comment near the top of the file.
    const eligibleAt = pollDetail.lastIndexOf("You're eligible ✓");
    expect(blockedAt).toBeGreaterThan(-1);
    expect(blockedAt).toBeLessThan(eligibleAt);
  });
});

describe('the Executor.CallFailed decode reaches both failure surfaces', () => {
  it('finalize warns when a "successful" announceWinner applied nothing', () => {
    expect(voteActions).toMatch(/import \{ parseExecutionFailure \} from '@\/lib\/voting\/proposalReceipt'/);
    expect(voteActions).toMatch(/import \{ describeExecutionFailure \}/);
    expect(voteActions).toContain('parseExecutionFailure(result.receipt, contractAddress)');
    expect(voteActions).toContain('describeExecutionFailure(failure.reason)');
  });

  it('reconstructs a role-removal gas floor from indexed metadata on another device', () => {
    expect(voteActions).toContain('roleRemovalGasFloorFromProposal(proposal)');
    expect(pollDetail).toContain('onFinalize(contractAddress, proposalId, isBinding, poll)');
  });

  it('the completed-proposal chip decodes executionError instead of printing it', () => {
    expect(vocabulary).toContain('describeExecutionFailure(p.executionError)');
    // The regression this closes: raw Bytes interpolated straight into member-facing copy.
    expect(vocabulary).not.toContain('${p.executionError}');
  });
});
