import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import { parseCreatedProposalId } from './proposalReceipt';

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
