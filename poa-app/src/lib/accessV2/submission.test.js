import { describe, it, expect } from 'vitest';
import { checkBatchSubmittable, MAX_SPONSORED_CALLS } from './submission';
import { MAX_CALLS_PER_BATCH } from '@/config/contractLimits';
import { buildCreateRoleBatch } from './proposalBuilders';
import { buildGrant } from './txBuilders';
import { AUTHORITY_ADDRESS as A, ALICE, MEMBERS_ID, EXECS_ID } from './fixtures';

const oneCall = () => buildGrant(A, EXECS_ID, ALICE);

describe('the ceiling is the CHAIN’s, not a frontend policy number', () => {
  // Every other test in this file is written relative to MAX_SPONSORED_CALLS, so they would all
  // pass at any value — which is how 24 survived. These two are absolute.
  it('is the contracts’ 20-call batch limit', () => {
    expect(MAX_CALLS_PER_BATCH).toBe(20);
    expect(MAX_SPONSORED_CALLS).toBe(20);
  });

  it('has exactly one definition — submission re-exports contractLimits, it does not restate it', () => {
    expect(MAX_SPONSORED_CALLS).toBe(MAX_CALLS_PER_BATCH);
  });
});

describe('checkBatchSubmittable', () => {
  it('accepts an ordinary governance batch', () => {
    expect(checkBatchSubmittable([oneCall()])).toEqual({ ok: true, code: null, message: null });
  });

  it('refuses an empty batch instead of opening a vote that does nothing', () => {
    expect(checkBatchSubmittable([]).code).toBe('empty');
    expect(checkBatchSubmittable(null).code).toBe('empty');
  });

  it('refuses a migration-scale batch rather than burning a sponsored UserOp on it', () => {
    // Seed/cutover ceremonies are run from a funded EOA per the runbook — they are far outside
    // the paymaster rulebook's gas hints.
    const huge = Array.from({ length: MAX_SPONSORED_CALLS + 1 }, oneCall);
    const r = checkBatchSubmittable(huge);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('too-large');
    expect(r.message).toMatch(/org’s own wallet/);
  });

  it('catches a 21-call batch — the size the chain rejects but the old ceiling waved through', () => {
    // 21..24 used to pass this preflight and then revert TooManyCalls at createProposal.
    for (const n of [21, 22, 23, 24]) {
      const r = checkBatchSubmittable(Array.from({ length: n }, oneCall));
      expect(r.ok).toBe(false);
      expect(r.code).toBe('too-large');
      expect(r.message).toContain(`${n} steps`);
      expect(r.message).toContain('20');
    }
  });

  it('accepts a batch exactly at the ceiling', () => {
    expect(checkBatchSubmittable(Array.from({ length: MAX_SPONSORED_CALLS }, oneCall)).ok).toBe(true);
  });

  it('refuses a malformed call rather than sending it', () => {
    expect(checkBatchSubmittable([{ target: A }]).code).toBe('malformed');
    expect(checkBatchSubmittable([null]).code).toBe('malformed');
  });

  it('a realistic create-role batch is comfortably inside the ceiling', () => {
    const { batch } = buildCreateRoleBatch({
      authority: A,
      existingSubjects: [{ subjectId: MEMBERS_ID }],
      config: {
        name: 'Stewards',
        groupIds: ['1'],
        perms: { DD_VOTE: true, DD_CREATE: true, HV_CREATE: true, PT_MEMBER: true, PAY_CREATE: true, TM_PERMS: 6 },
        initialHolders: Array.from({ length: 5 }, (_, i) => ({
          address: `0x${String(i + 1).repeat(40)}`,
          inOrg: true,
        })),
      },
    });
    expect(batch.length).toBeLessThan(MAX_SPONSORED_CALLS);
    expect(checkBatchSubmittable(batch).ok).toBe(true);
  });
});
