import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { parseTaskId, parseProjectId } from './encoding';

// The subgraph returns composite ids "{taskManagerAddress}-{numericId}"; the
// contract's submitTask expects just the numeric part. Lock in the exact
// production Decentral Park task id from the bug report.
describe('parseTaskId — composite subgraph id', () => {
  it('extracts the numeric task id from the production Decentral Park task', () => {
    expect(parseTaskId('0x2d9d397a842b8d691ea2a232062cbc8ef8ebbdb7-7')).toBe('7');
  });

  it('passes a bare numeric id through unchanged', () => {
    expect(parseTaskId('7')).toBe('7');
    expect(parseTaskId(7)).toBe('7');
  });
});

// Projects are keyed by a bytes32, so the composite is "{address}-{bytes32}".
// The production Decentral Park project in the bug report is project id 0 — its
// composite tail is the all-zero bytes32, which must canonicalize to HashZero.
describe('parseProjectId — composite subgraph id', () => {
  it('canonicalizes the production Decentral Park project (id 0) to bytes32 zero', () => {
    const composite =
      '0x2d9d397a842b8d691ea2a232062cbc8ef8ebbdb7-0x0000000000000000000000000000000000000000000000000000000000000000';
    expect(parseProjectId(composite)).toBe(ethers.constants.HashZero);
  });
});
