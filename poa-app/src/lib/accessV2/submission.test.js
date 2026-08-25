import { describe, it, expect } from 'vitest';
import { checkBatchSubmittable, MAX_SPONSORED_CALLS } from './submission';
import { buildCreateRoleBatch } from './proposalBuilders';
import { buildGrant } from './txBuilders';
import { AUTHORITY_ADDRESS as A, ALICE, MEMBERS_ID, EXECS_ID } from './fixtures';

const oneCall = () => buildGrant(A, EXECS_ID, ALICE);

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
