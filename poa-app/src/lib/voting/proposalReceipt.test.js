import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import { parseCreatedProposalId, parseExecutionFailure } from './proposalReceipt';
import { describeExecutionFailure, EXECUTOR_CALL_FAILED_SELECTOR } from '../errors/contractErrors';

/**
 * Logs are ENCODED with ethers from the real event signatures (copied verbatim from
 * DirectDemocracyVoting.sol / libs/HybridVotingProposals.sol) rather than hand-written, so a
 * signature drift on either side fails the test instead of matching a hand-made fixture of the
 * wrong shape.
 */
const iface = new utils.Interface([
  'event NewProposal(uint256 id, bytes title, bytes32 descriptionHash, uint8 numOptions, uint64 endTs, uint64 created)',
  'event NewHatProposal(uint256 id, bytes title, bytes32 descriptionHash, uint8 numOptions, uint64 endTs, uint64 created, uint256[] hatIds)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

const VOTING = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function log(address, name, args) {
  const { data, topics } = iface.encodeEventLog(iface.getEvent(name), args);
  return { address, data, topics };
}

const TITLE = utils.toUtf8Bytes('Create role: Reviewer');
const DHASH = utils.keccak256(utils.toUtf8Bytes('meta'));

describe('parseCreatedProposalId', () => {
  it('reads the id out of an unrestricted proposal (NewProposal)', () => {
    const receipt = { logs: [log(VOTING, 'NewProposal', [42, TITLE, DHASH, 2, 1750000000, 1749900000])] };
    expect(parseCreatedProposalId(receipt, VOTING)).toBe('42');
  });

  it('reads the id out of a subject-restricted proposal (NewHatProposal)', () => {
    const receipt = {
      logs: [log(VOTING, 'NewHatProposal', [7, TITLE, DHASH, 2, 1750000000, 1749900000, [1, 2]])],
    };
    expect(parseCreatedProposalId(receipt, VOTING)).toBe('7');
  });

  it('finds the event among the other logs a proposal transaction emits', () => {
    const receipt = {
      logs: [
        log(VOTING, 'Transfer', [VOTING, OTHER, 1]),
        log(VOTING, 'NewProposal', [99, TITLE, DHASH, 2, 1750000000, 1749900000]),
      ],
    };
    expect(parseCreatedProposalId(receipt, VOTING)).toBe('99');
  });

  it('ignores an identically-shaped event from a DIFFERENT contract when an address is given', () => {
    // Otherwise a floor could be parked against another module's id and go unused (or worse,
    // over-fund an unrelated proposal on the same voting contract).
    const receipt = {
      logs: [log(OTHER, 'NewProposal', [1, TITLE, DHASH, 2, 1750000000, 1749900000])],
    };
    expect(parseCreatedProposalId(receipt, VOTING)).toBeNull();
    expect(parseCreatedProposalId(receipt, OTHER)).toBe('1');
  });

  it('matches the address case-insensitively (receipts come back lowercase)', () => {
    const receipt = {
      logs: [log(VOTING.toLowerCase(), 'NewProposal', [5, TITLE, DHASH, 2, 1750000000, 1749900000])],
    };
    expect(parseCreatedProposalId(receipt, VOTING)).toBe('5');
  });

  it('returns id 0 as "0", not null — proposal 0 is a real proposal', () => {
    const receipt = { logs: [log(VOTING, 'NewProposal', [0, TITLE, DHASH, 2, 1750000000, 1749900000])] };
    expect(parseCreatedProposalId(receipt, VOTING)).toBe('0');
  });

  it('returns null (never throws) for receipts with nothing to read', () => {
    expect(parseCreatedProposalId(null)).toBeNull();
    expect(parseCreatedProposalId(undefined)).toBeNull();
    expect(parseCreatedProposalId({})).toBeNull();
    expect(parseCreatedProposalId({ logs: [] })).toBeNull();
    expect(parseCreatedProposalId({ logs: [null, { topics: ['0xdead'], data: '0x' }] })).toBeNull();
    expect(parseCreatedProposalId({ logs: [log(VOTING, 'Transfer', [VOTING, OTHER, 1])] }, VOTING)).toBeNull();
  });
});

/**
 * `announceWinner` swallows the batch's revert, so a FAILED proposal comes back as a SUCCESSFUL
 * transaction. `ProposalExecutionFailed` is the only trace in the receipt.
 */
describe('parseExecutionFailure', () => {
  const failIface = new utils.Interface([
    'event ProposalExecutionFailed(uint256 indexed id, uint256 indexed winningIdx, bytes reason)',
  ]);
  const failLog = (address, id, idx, reason) => {
    const { data, topics } = failIface.encodeEventLog(
      failIface.getEvent('ProposalExecutionFailed'),
      [id, idx, reason]
    );
    return { address, data, topics };
  };

  const CALL_FAILED = EXECUTOR_CALL_FAILED_SELECTOR
    + utils.defaultAbiCoder.encode(['uint256', 'bytes'], [1, '0x48cbf26d']).slice(2);

  it('reads the id, the winning index and the raw reason bytes', () => {
    const receipt = { logs: [failLog(VOTING, 23, 0, CALL_FAILED)] };
    expect(parseExecutionFailure(receipt, VOTING)).toEqual({
      proposalId: '23',
      winningIndex: 0,
      reason: CALL_FAILED,
    });
  });

  it('feeds describeExecutionFailure, which names the action and the cause', () => {
    const { reason } = parseExecutionFailure({ logs: [failLog(VOTING, 1, 0, CALL_FAILED)] }, VOTING);
    const copy = describeExecutionFailure(reason);
    expect(copy).toContain('Action 2 in this proposal');
    expect(copy).toContain('voting allowlist');
  });

  it('keeps the EMPTY reason (the swallowed out-of-gas) as 0x rather than dropping it', () => {
    const found = parseExecutionFailure({ logs: [failLog(VOTING, 24, 1, '0x')] }, VOTING);
    expect(found.reason).toBe('0x');
    expect(describeExecutionFailure(found.reason)).toContain('ran out of gas');
  });

  it('ignores an identical event from another voting contract in the same transaction', () => {
    const receipt = { logs: [failLog(OTHER, 9, 0, CALL_FAILED)] };
    expect(parseExecutionFailure(receipt, VOTING)).toBeNull();
    expect(parseExecutionFailure(receipt, OTHER).proposalId).toBe('9');
  });

  it('returns null for a clean finalize — the success path must not warn', () => {
    expect(parseExecutionFailure({ logs: [log(VOTING, 'Transfer', [VOTING, OTHER, 1])] }, VOTING)).toBeNull();
    expect(parseExecutionFailure({ logs: [] })).toBeNull();
    expect(parseExecutionFailure(null)).toBeNull();
    expect(parseExecutionFailure(undefined)).toBeNull();
  });
});
